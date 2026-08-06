import { createHash } from 'node:crypto';

import { extractDimensionExpressions } from './dimension-expression-knowledge.mjs';
import { createDimensionUnitObservation } from './dimension-unit-observation.mjs';
import {
  extractClaimsFromHtml,
  preflightEvidenceArtifactIdentity,
  verifyAndAttestResolutionArtifact,
} from './evidence-artifact-verifier.mjs';
import { upgradeLegacyDimensionClaim } from './dimension-evidence-claim.mjs';
import { inspectMineruContentListV2, parseMineruContentListV2 } from './mineru-document.mjs';
import {
  officialMarketApiDimensionClaims,
  officialMarketApiBoundExactCoverModel,
  officialMarketApiBoundFamilyModel,
  officialMarketApiBoundSeriesModel,
  officialMarketApiBoundVariantModel,
  verifyOfficialMarketApiDiscoveryEvidence,
} from './official-market-api-discovery-evidence.mjs';
import { officialMarketApiModelVariant } from './official-model-variant-policy.mjs';
import { officialSupportApiBoundFamilyModel } from './official-support-api-discovery-evidence.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const OFFICIAL_TRANSPORTS = new Set([
  'fetch', 'curl', 'scrapling', 'content_addressed_discovery_object',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function officialTransport(value) {
  if (value == null) return null;
  const transport = requiredText(value, 'official transport');
  if (!OFFICIAL_TRANSPORTS.has(transport)) throw new TypeError('official transport invalid');
  return transport;
}

function brandKey(value) {
  return requiredText(value, 'authority brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedUrl(value) {
  const url = new URL(requiredText(value, 'candidate source URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('candidate source URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function extension(contentType) {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'text/html') return 'html';
  if (contentType === 'application/json') return 'json';
  throw new TypeError(`unsupported evidence content type ${contentType ?? 'missing'}`);
}

function rawObjectPath(hash, contentType) {
  return `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension(contentType)}`;
}

function transportKey(sourceUrl, options) {
  const authorityMode = requiredText(options.authorityMode, 'authority mode');
  if (!['official', 'reference'].includes(authorityMode)) throw new TypeError('authority mode invalid');
  const policySha256 = requiredText(options.transportPolicySha256, 'transport policy SHA-256');
  if (!SHA256.test(policySha256)) throw new TypeError('transport policy SHA-256 invalid');
  return createHash('sha256').update([
    'evidence-artifact-transport-v1',
    brandKey(options.authorityBrand),
    normalizedUrl(sourceUrl),
    authorityMode,
    policySha256,
  ].join('\0')).digest('hex');
}

function verifyObject(bytes, expectedHash, expectedSize, label) {
  const buffer = Buffer.from(bytes ?? []);
  if ((expectedSize != null && buffer.length !== expectedSize) || sha256(buffer) !== expectedHash) {
    throw new Error(`${label} object integrity mismatch`);
  }
  return buffer;
}

async function rehydrateArtifact(record, options, expected) {
  if (!record || record.schemaVersion !== 1 || record.transportKey !== expected.transportKey
    || record.sourceUrl !== expected.sourceUrl
    || brandKey(record.authorityBrand) !== brandKey(expected.authorityBrand)
    || record.authorityMode !== expected.authorityMode
    || record.transportPolicySha256 !== expected.transportPolicySha256) return null;
  if (typeof options.readObject !== 'function') return null;
  const bytes = verifyObject(
    await options.readObject(record.objectPath),
    record.contentSha256,
    record.byteSize,
    'persisted evidence',
  );
  let derivedArtifactBytes = null;
  let fallbackTriggerArtifactBytes = null;
  if (record.derivedArtifact) {
    derivedArtifactBytes = verifyObject(
      await options.readObject(record.derivedArtifact.objectPath),
      record.derivedArtifact.contentSha256,
      record.derivedArtifact.byteSize,
      'persisted MinerU',
    );
    if (record.derivedArtifact.sourcePdfSha256 !== record.contentSha256) {
      throw new Error('persisted MinerU PDF binding mismatch');
    }
    if (record.derivedArtifact.fallbackTrigger) {
      const trigger = record.derivedArtifact.fallbackTrigger;
      fallbackTriggerArtifactBytes = verifyObject(
        await options.readObject(trigger.objectPath),
        trigger.contentSha256,
        undefined,
        'persisted MinerU fallback trigger',
      );
    }
  }
  const transport = officialTransport(record.transport);
  return {
    ...record,
    ...(transport ? { transport } : {}),
    bytes,
    derivedArtifactBytes,
    fallbackTriggerArtifactBytes,
  };
}

function artifactRecord(artifact) {
  const {
    bytes: _bytes,
    derivedArtifactBytes: _derivedArtifactBytes,
    fallbackTriggerArtifactBytes: _fallbackTriggerArtifactBytes,
    ...record
  } = artifact;
  return record;
}

async function materializeContent(fetched, hash, options) {
  const contentType = String(fetched.contentType ?? '').toLowerCase();
  const bytes = Buffer.from(fetched.bytes ?? []);
  if (!bytes.length) throw new TypeError('non-empty artifact bytes required');
  const objectPath = rawObjectPath(hash, contentType);
  await options.writeObject(objectPath, bytes);
  if (contentType !== 'application/pdf') {
    return { contentType, bytes, contentSha256: hash, objectPath, byteSize: bytes.length, derivedArtifact: null, derivedArtifactBytes: null };
  }
  if (typeof options.processPdf !== 'function') throw new Error('MinerU PDF processor unavailable');
  const processed = await options.processPdf(bytes, { contentSha256: hash });
  if (!processed?.derivedArtifact || !processed?.jsonBytes) {
    throw new Error('MinerU PDF processor returned no JSON artifact');
  }
  const derivedArtifactBytes = verifyObject(
    processed.jsonBytes,
    processed.derivedArtifact.contentSha256,
    processed.derivedArtifact.byteSize,
    'MinerU',
  );
  if (processed.derivedArtifact.sourcePdfSha256 !== hash) {
    throw new Error('MinerU artifact is not bound to source PDF');
  }
  await options.writeObject(processed.derivedArtifact.objectPath, derivedArtifactBytes);
  let fallbackTriggerArtifactBytes = null;
  if (processed.derivedArtifact.fallbackTrigger) {
    fallbackTriggerArtifactBytes = Buffer.from(processed.primaryJsonBytes ?? []);
    const trigger = processed.derivedArtifact.fallbackTrigger;
    if (!fallbackTriggerArtifactBytes.length
      || sha256(fallbackTriggerArtifactBytes) !== trigger.contentSha256) {
      throw new Error('MinerU fallback trigger artifact missing or invalid');
    }
    await options.writeObject(trigger.objectPath, fallbackTriggerArtifactBytes);
  }
  return {
    contentType,
    bytes,
    contentSha256: hash,
    objectPath,
    byteSize: bytes.length,
    derivedArtifact: structuredClone(processed.derivedArtifact),
    derivedArtifactBytes,
    fallbackTriggerArtifactBytes,
  };
}

export async function acquireEvidenceArtifact(candidate, options = {}) {
  if (typeof options.fetchArtifact !== 'function') throw new TypeError('artifact fetcher required');
  if (typeof options.writeObject !== 'function') throw new TypeError('content-addressed object writer required');
  const sourceUrl = normalizedUrl(candidate?.sourceUrl ?? candidate);
  const key = transportKey(sourceUrl, options);
  const artifactCache = options.artifactCache ?? new Map();
  if (artifactCache.has(key)) return artifactCache.get(key);

  const promise = (async () => {
    const expected = {
      transportKey: key,
      sourceUrl,
      authorityBrand: requiredText(options.authorityBrand, 'authority brand'),
      authorityMode: options.authorityMode,
      transportPolicySha256: options.transportPolicySha256,
    };
    if (typeof options.readArtifactRecord === 'function') {
      const persisted = await rehydrateArtifact(await options.readArtifactRecord(key), options, expected);
      if (persisted) return persisted;
    }

    const fetched = await options.fetchArtifact(sourceUrl, expected.authorityBrand, options);
    const transport = officialTransport(fetched?.transport);
    const fetchedBytes = Buffer.from(fetched?.bytes ?? []);
    if (!fetchedBytes.length) throw new TypeError('non-empty artifact bytes required');
    const hash = sha256(fetchedBytes);
    const contentCache = options.contentCache ?? new Map();
    let contentPromise = contentCache.get(hash);
    if (!contentPromise) {
      contentPromise = materializeContent(fetched, hash, options);
      contentCache.set(hash, contentPromise);
      contentPromise.catch(() => contentCache.delete(hash));
    }
    const content = await contentPromise;
    const artifact = {
      schemaVersion: 1,
      transportKey: key,
      sourceUrl,
      authorityBrand: expected.authorityBrand,
      authorityMode: expected.authorityMode,
      transportPolicySha256: expected.transportPolicySha256,
      requestedUrl: normalizedUrl(fetched.requestedUrl ?? sourceUrl),
      finalUrl: normalizedUrl(fetched.finalUrl ?? sourceUrl),
      redirectChain: (fetched.redirectChain ?? []).map(normalizedUrl),
      contentType: content.contentType,
      contentSha256: content.contentSha256,
      objectPath: content.objectPath,
      byteSize: content.byteSize,
      ...(transport ? { transport } : {}),
      bytes: content.bytes,
      derivedArtifact: content.derivedArtifact,
      derivedArtifactBytes: content.derivedArtifactBytes,
      fallbackTriggerArtifactBytes: content.fallbackTriggerArtifactBytes,
    };
    if (typeof options.writeArtifactRecord === 'function') {
      await options.writeArtifactRecord(artifactRecord(artifact));
    }
    return artifact;
  })();
  artifactCache.set(key, promise);
  promise.catch(() => artifactCache.delete(key));
  return promise;
}

function sameResource(left, right) {
  try {
    const a = new URL(left); const b = new URL(right);
    for (const url of [a, b]) {
      url.search = ''; url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

function artifactIdentitySource(caseRecord, artifact, now, discoveryProvenance) {
  return {
    authority: 'manufacturer',
    sourceType: artifact.contentType === 'application/pdf'
      ? 'official_exact_model_pdf'
      : artifact.contentType === 'application/json'
        ? 'official_exact_model_api'
        : 'official_exact_model_product_page',
    sourceUrl: artifact.requestedUrl,
    finalUrl: artifact.finalUrl,
    redirectChain: [...artifact.redirectChain],
    retrievedAt: now,
    contentSha256: artifact.contentSha256,
    objectPath: artifact.objectPath,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    identity: { brand: caseRecord.brand, model: caseRecord.model, outcome: 'exact' },
    ...(discoveryProvenance ? { discoveryProvenance } : {}),
    ...(artifact.derivedArtifact ? { derivedArtifact: artifact.derivedArtifact } : {}),
  };
}

function preflightArtifactIdentity(caseRecord, artifact, options) {
  return preflightEvidenceArtifactIdentity({
    source: artifactIdentitySource(
      caseRecord, artifact, options.now, options.discoveryProvenance,
    ),
    caseIdentity: {
      brand: caseRecord.brand, model: caseRecord.model, category: caseRecord.category,
    },
    bytes: artifact.bytes,
    derivedArtifactBytes: artifact.derivedArtifactBytes,
    fallbackTriggerArtifactBytes: artifact.fallbackTriggerArtifactBytes,
    discoveryArtifactBytes: options.discoveryArtifactBytes,
  });
}

export async function preflightEvidenceArtifactForCase(caseRecord, artifact, options = {}) {
  if (artifact?.authorityMode !== 'official') {
    throw new TypeError('official artifact authority required for identity preflight');
  }
  if (brandKey(artifact.authorityBrand) !== brandKey(caseRecord?.brand)) {
    throw new TypeError('artifact authority brand does not match target brand');
  }
  const discoveryProvenance = options.discoveryProvenance ?? null;
  let discoveryArtifactBytes = options.discoveryArtifactBytes ?? null;
  if (discoveryProvenance?.discoveryObjectPath && discoveryArtifactBytes == null) {
    if (typeof options.readObject !== 'function') {
      throw new TypeError('discovery evidence object reader required');
    }
    discoveryArtifactBytes = await options.readObject(discoveryProvenance.discoveryObjectPath);
  }
  return preflightArtifactIdentity(caseRecord, artifact, {
    now: options.now ?? null,
    discoveryProvenance,
    discoveryArtifactBytes,
  });
}

function metricUnit(value) {
  const units = new Set([...String(value ?? '').matchAll(
    /(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)(?![A-Za-z])/gi,
  )].map((match) => match[1].toLowerCase().startsWith('c') ? 'cm' : 'mm'));
  return units.size === 1 ? [...units][0] : null;
}

function metricContextFragment(page) {
  return page.fragments.find((fragment) => (
    /\bdimensions?\s*\(\s*(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\s*\)/i.test(fragment.rawText)
      || /\b(?:all\s+)?measurements?\b[^.]{0,80}\b(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\b/i.test(fragment.rawText)
      || /\bproduct\s+dimensions?\b[^.]{0,80}\b(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\b/i.test(fragment.rawText)
  ));
}

export async function observeEvidenceArtifactDimensionsForCase(caseRecord, artifact, options = {}) {
  if (artifact?.authorityMode !== 'official') {
    throw new TypeError('official artifact authority required for observation');
  }
  if (brandKey(artifact.authorityBrand) !== brandKey(caseRecord?.brand)) {
    throw new TypeError('artifact authority brand does not match target brand');
  }
  const market = requiredText(options.market, 'observation market').toUpperCase();
  const policyVersion = requiredText(options.policyVersion, 'dimension unit policy version');
  const discoveryProvenance = options.discoveryProvenance ?? null;
  let discoveryArtifactBytes = options.discoveryArtifactBytes ?? null;
  if (discoveryProvenance?.discoveryObjectPath && discoveryArtifactBytes == null) {
    if (typeof options.readObject !== 'function') {
      throw new TypeError('discovery evidence object reader required');
    }
    discoveryArtifactBytes = await options.readObject(discoveryProvenance.discoveryObjectPath);
  }
  await preflightEvidenceArtifactForCase(caseRecord, artifact, {
    now: options.now ?? null,
    discoveryProvenance,
    discoveryArtifactBytes,
  });
  if (artifact.contentType !== 'application/pdf') {
    return Object.freeze({
      status: 'NO_OBSERVATION',
      reasonCode: 'SHADOW_EXPRESSION_FORMAT_UNSUPPORTED',
      dimensionUnitObservations: Object.freeze([]),
    });
  }

  let contentList;
  try {
    contentList = JSON.parse(Buffer.from(artifact.derivedArtifactBytes).toString('utf8'));
  } catch {
    throw new TypeError('MinerU content_list_v2 JSON invalid');
  }
  const expressions = extractDimensionExpressions({
    pdfSha256: artifact.contentSha256,
    contentSha256: artifact.derivedArtifact.contentSha256,
    contentList,
    sourceUrls: [artifact.requestedUrl, artifact.finalUrl],
    identities: [{
      brand: caseRecord.brand, model: caseRecord.model, category: caseRecord.category,
    }],
  });
  const inspection = inspectMineruContentListV2(artifact.derivedArtifactBytes);
  const observations = expressions.observations.flatMap((expression) => {
    if (expression.axisOrder.length !== 3
      || new Set(expression.axisOrder).size !== 3
      || !['height', 'width', 'depth'].every((axis) => expression.axisOrder.includes(axis))) return [];
    const page = inspection.pages[expression.page - 1];
    const fragment = page?.fragments.find((candidate) => (
      candidate.fragmentSha256 === expression.fragmentSha256
    ));
    if (!fragment) throw new Error('dimension expression fragment does not replay');
    const localUnit = metricUnit(fragment.rawText);
    if (localUnit) return [];
    const context = metricContextFragment(page);
    const provenance = (candidate) => candidate ? {
      rawText: candidate.rawText,
      contentSha256: artifact.contentSha256,
      fragmentSha256: candidate.fragmentSha256,
      page: expression.page,
      bbox: [...candidate.bbox],
    } : null;
    const axisValues = expression.axisValues.map((axisValue) => ({
      axis: axisValue.axis,
      value: String(axisValue.value).replace(
        /\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\s*$/i, '',
      ),
    }));
    return [createDimensionUnitObservation({
      source: {
        contentSha256: artifact.contentSha256,
        rawText: fragment.rawText,
        authority: 'OFFICIAL',
        market,
        page: expression.page,
        fragmentSha256: fragment.fragmentSha256,
        bbox: [...fragment.bbox],
      },
      target: {
        referenceId: caseRecord.referenceId ?? caseRecord.id,
        brand: caseRecord.brand,
        model: caseRecord.model,
        category: caseRecord.category,
        market,
        identityScope: 'EXACT_MODEL',
      },
      rawLabel: expression.sourceLabel,
      rawTuple: expression.sourceValue,
      axisValues,
      axisOrder: [...expression.axisOrder],
      axisAmbiguous: new Set(expression.axisOrder).size !== expression.axisOrder.length
        || expression.depthVariants.length > 0,
      scope: expression.scope,
      policyVersion,
      documentMetricContext: provenance(context),
      modelScope: {
        modelBinding: expression.modelBinding,
        boundModels: [...expression.boundModels],
      },
    })];
  }).sort((left, right) => left.observationId.localeCompare(right.observationId));
  return Object.freeze({
    status: observations.length ? 'OBSERVED' : 'NO_OBSERVATION',
    ...(observations.length ? {} : { reasonCode: 'NO_SUPPORTED_DIMENSION_EXPRESSION' }),
    dimensionUnitObservations: Object.freeze(observations),
  });
}

export async function attestEvidenceArtifactForCase(caseRecord, artifact, options = {}) {
  if (artifact?.authorityMode !== 'official') throw new TypeError('official artifact authority required for attestation');
  if (brandKey(artifact.authorityBrand) !== brandKey(caseRecord?.brand)) {
    throw new TypeError('artifact authority brand does not match target brand');
  }
  const requestedFields = options.requestedFields;
  if (!Array.isArray(requestedFields) || requestedFields.length < 1) {
    throw new TypeError('requested evidence fields required');
  }
  const now = requiredText(options.now, 'attestation time');
  const claimSemanticsVersion = options.claimSemanticsVersion ?? 1;
  const identity = {
    brand: caseRecord.brand,
    model: caseRecord.model,
    category: caseRecord.category,
  };
  const discoveryProvenance = options.discoveryProvenance ?? null;
  let discoveryArtifactBytes = options.discoveryArtifactBytes ?? null;
  if (discoveryProvenance?.discoveryObjectPath && discoveryArtifactBytes == null) {
    if (typeof options.readObject !== 'function') {
      throw new TypeError('discovery evidence object reader required');
    }
    discoveryArtifactBytes = await options.readObject(discoveryProvenance.discoveryObjectPath);
  }
  const unchanged = (caseRecord.sources ?? []).find((source) => source.contentSha256 === artifact.contentSha256);
  const unchangedCoversRequest = Boolean(unchanged) && (
    !options.requireRequestedFieldCoverage
    || requestedFields.every((field) => unchanged.claims?.some((claim) => claim.field === field))
  );
  if (unchanged && unchangedCoversRequest) {
    try {
      verifyVerificationReceipt(unchanged, identity, {
        asOf: now,
        discoveryArtifactBytes,
      });
      return { unchanged: true, source: unchanged, replacesExistingHash: false };
    } catch {
      // Re-attest immutable bytes when policy or claim semantics advance.
    }
  }

  await preflightEvidenceArtifactForCase(caseRecord, artifact, {
    now,
    discoveryProvenance,
    discoveryArtifactBytes,
  });

  let claims;
  let boundVariantModel = null;
  if (artifact.contentType === 'application/pdf') {
    if (!artifact.derivedArtifact || !artifact.derivedArtifactBytes) {
      throw new Error('MinerU JSON derived artifact required for PDF attestation');
    }
    const boundFamilyModel = officialMarketApiBoundFamilyModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
      artifact.derivedArtifactBytes,
    );
    const boundSeriesModel = officialMarketApiBoundSeriesModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
      artifact.derivedArtifactBytes,
    );
    const boundExactCoverModel = officialMarketApiBoundExactCoverModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
      artifact.derivedArtifactBytes,
    );
    boundVariantModel = officialMarketApiBoundVariantModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
      artifact.derivedArtifactBytes,
    );
    const boundSupportFamilyModel = officialSupportApiBoundFamilyModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
    );
    const selectedBoundFamilyModel = boundExactCoverModel || boundSeriesModel || boundVariantModel
      ? null
      : boundFamilyModel;
    if (boundVariantModel && requestedFields.some((field) => ![
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ].includes(field))) {
      throw new Error('official model variant PDF is dimensions only');
    }
    claims = parseMineruContentListV2(artifact.derivedArtifactBytes, {
      pdfSha256: artifact.contentSha256,
      parserVersion: artifact.derivedArtifact.parserVersion,
      modelRevision: artifact.derivedArtifact.modelRevision,
      caseIdentity: boundVariantModel ? { ...identity, model: boundVariantModel } : identity,
      fields: requestedFields,
      claimSemanticsVersion,
      sourceUrls: [artifact.requestedUrl, artifact.finalUrl].filter(Boolean),
      ...(selectedBoundFamilyModel ? { boundFamilyModel: selectedBoundFamilyModel } : {}),
      ...(boundSeriesModel ? { boundSeriesModel } : {}),
      ...((boundVariantModel || boundExactCoverModel) ? {
        boundExactCoverModel: boundVariantModel || boundExactCoverModel,
      } : {}),
      ...(boundSupportFamilyModel ? { boundSupportFamilyModel } : {}),
      ...(artifact.derivedArtifact.fallbackTrigger ? {
        identityContextJsonBytes: artifact.fallbackTriggerArtifactBytes,
        identityContextContentSha256: artifact.derivedArtifact.fallbackTrigger.contentSha256,
      } : {}),
    }).claims;
  } else if (artifact.contentType === 'text/html') {
    const extracted = extractClaimsFromHtml(artifact.bytes, {
      category: caseRecord.category,
      fields: requestedFields,
    });
    claims = claimSemanticsVersion === 2
      ? extracted.map(upgradeLegacyDimensionClaim)
      : extracted;
  } else if (artifact.contentType === 'application/json') {
    const dimensionFields = [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ];
    if (claimSemanticsVersion !== 2
      || requestedFields.some((field) => !dimensionFields.includes(field))) {
      throw new Error('official market API JSON is dimensions only');
    }
    if (discoveryProvenance?.method !== 'official_market_api'
      || artifact.contentSha256 !== discoveryProvenance.discoveryContentSha256
      || artifact.requestedUrl !== discoveryProvenance.discoveryUrl
      || artifact.finalUrl !== discoveryProvenance.discoveryUrl
      || discoveryProvenance.artifactUrl !== discoveryProvenance.discoveryUrl) {
      throw new Error('official market API JSON must be the hash-bound discovery self-source');
    }
    verifyOfficialMarketApiDiscoveryEvidence(discoveryProvenance, identity, discoveryArtifactBytes);
    const payload = JSON.parse(Buffer.from(artifact.bytes).toString('utf8'));
    claims = officialMarketApiDimensionClaims(payload, identity, discoveryProvenance);
    if (!claims) throw new Error('official market API JSON lacks complete W/H/D dimensions');
    boundVariantModel = officialMarketApiModelVariant(identity, discoveryProvenance.matchedModel)?.sourceModel ?? null;
  } else {
    throw new TypeError('unsupported artifact content type');
  }
  if (!claims.length) throw new Error('no supported evidence claims extracted');
  const supersedesContentSha256 = (caseRecord.sources ?? [])
    .filter((source) => sameResource(source.finalUrl, artifact.finalUrl))
    .map((source) => source.contentSha256)
    .filter((value) => value !== artifact.contentSha256)
    .sort();
  const transport = officialTransport(artifact.transport);
  const source = {
    authority: 'manufacturer',
    sourceType: artifact.contentType === 'application/pdf'
      ? (boundVariantModel
        ? 'official_model_variant_pdf'
        : 'official_exact_model_pdf')
      : artifact.contentType === 'application/json'
        ? (boundVariantModel ? 'official_model_variant_api' : 'official_exact_model_api')
        : 'official_exact_model_product_page',
    sourceUrl: artifact.requestedUrl,
    finalUrl: artifact.finalUrl,
    redirectChain: [...artifact.redirectChain],
    retrievedAt: now,
    contentSha256: artifact.contentSha256,
    objectPath: artifact.objectPath,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    ...(transport ? { transport } : {}),
    supersedesContentSha256,
    identity: { brand: caseRecord.brand, model: caseRecord.model, outcome: 'exact' },
    claims,
    ...(discoveryProvenance ? {
      discoveryProvenance: structuredClone(discoveryProvenance),
    } : {}),
    ...(artifact.derivedArtifact ? { derivedArtifact: structuredClone(artifact.derivedArtifact) } : {}),
  };
  const attested = verifyAndAttestResolutionArtifact({
    source,
    caseIdentity: identity,
    bytes: artifact.bytes,
    derivedArtifactBytes: artifact.derivedArtifactBytes,
    fallbackTriggerArtifactBytes: artifact.fallbackTriggerArtifactBytes,
    discoveryArtifactBytes,
    verifiedAt: now,
    claimSemanticsVersion,
  });
  return {
    unchanged: false,
    source: attested,
    replacesExistingHash: Boolean(unchanged),
  };
}
