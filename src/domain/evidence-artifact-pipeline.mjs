import { createHash } from 'node:crypto';

import { extractClaimsFromHtml, verifyAndAttestResolutionArtifact } from './evidence-artifact-verifier.mjs';
import { upgradeLegacyDimensionClaim } from './dimension-evidence-claim.mjs';
import { parseMineruContentListV2 } from './mineru-document.mjs';
import {
  officialMarketApiDimensionClaims,
  officialMarketApiBoundExactCoverModel,
  officialMarketApiBoundFamilyModel,
  officialMarketApiBoundSeriesModel,
  officialMarketApiBoundVariantModel,
  verifyOfficialMarketApiDiscoveryEvidence,
} from './official-market-api-discovery-evidence.mjs';
import { officialMarketApiModelVariant } from './official-model-variant-policy.mjs';
import { officialProductMaterialBoundVariant } from './official-product-material-discovery-evidence.mjs';
import { officialProductPageBoundSupportFamilyModel } from './official-product-page-discovery-evidence.mjs';
import { officialSupportApiBoundFamilyModel } from './official-support-api-discovery-evidence.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
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
  return {
    ...record,
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
    const marketVariantModel = officialMarketApiBoundVariantModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
      artifact.derivedArtifactBytes,
    );
    const productMaterialBinding = officialProductMaterialBoundVariant(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
    );
    if (marketVariantModel && productMaterialBinding) {
      throw new Error('multiple official model variant bindings are not allowed');
    }
    const productMaterialVariant = productMaterialBinding?.relationshipKind === 'model_variant'
      ? productMaterialBinding
      : null;
    const parserVariantModel = marketVariantModel ?? productMaterialVariant?.sourceModel ?? null;
    const supportApiBoundFamilyModel = officialSupportApiBoundFamilyModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
    );
    const productPageSupportBinding = officialProductPageBoundSupportFamilyModel(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
    );
    if ((marketVariantModel || productMaterialBinding) && productPageSupportBinding) {
      throw new Error('multiple official model variant bindings are not allowed');
    }
    if (supportApiBoundFamilyModel && productPageSupportBinding) {
      throw new Error('multiple official support family bindings are not allowed');
    }
    const boundSupportFamilyModel = supportApiBoundFamilyModel
      ?? productPageSupportBinding?.familyModel
      ?? null;
    boundVariantModel = parserVariantModel ?? productPageSupportBinding?.sourceModel ?? null;
    const selectedBoundFamilyModel = boundExactCoverModel || boundSeriesModel || parserVariantModel
      || productMaterialBinding
      ? null
      : boundFamilyModel;
    if ((productMaterialBinding || productPageSupportBinding) && requestedFields.some((field) => ![
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ].includes(field))) {
      throw new Error('official model-variant PDF is dimensions only');
    }
    claims = parseMineruContentListV2(artifact.derivedArtifactBytes, {
      pdfSha256: artifact.contentSha256,
      parserVersion: artifact.derivedArtifact.parserVersion,
      modelRevision: artifact.derivedArtifact.modelRevision,
      caseIdentity: productMaterialBinding
        ? { ...identity, model: productMaterialBinding.sourceModel }
        : parserVariantModel
          ? { ...identity, model: parserVariantModel }
          : identity,
      fields: requestedFields,
      claimSemanticsVersion,
      sourceUrls: [artifact.requestedUrl, artifact.finalUrl].filter(Boolean),
      ...(selectedBoundFamilyModel ? { boundFamilyModel: selectedBoundFamilyModel } : {}),
      ...(boundSeriesModel ? { boundSeriesModel } : {}),
      ...((marketVariantModel || boundExactCoverModel) ? {
        boundExactCoverModel: marketVariantModel || boundExactCoverModel,
      } : {}),
      ...(productMaterialBinding ? {
        boundProductMaterialNumber: productMaterialBinding.materialNumber,
        boundProductFinishLabel: productMaterialBinding.finishLabel,
      } : {}),
      ...(boundSupportFamilyModel ? { boundSupportFamilyModel } : {}),
      ...(productPageSupportBinding ? {
        boundSupportSourceModel: productPageSupportBinding.sourceModel,
      } : {}),
      ...(artifact.derivedArtifact.fallbackTrigger ? {
        identityContextJsonBytes: artifact.fallbackTriggerArtifactBytes,
        identityContextContentSha256: artifact.derivedArtifact.fallbackTrigger.contentSha256,
      } : {}),
    }).claims;
  } else if (artifact.contentType === 'text/html') {
    const productMaterialBinding = officialProductMaterialBoundVariant(
      discoveryProvenance,
      identity,
      discoveryArtifactBytes,
    );
    if (productMaterialBinding) {
      if (productMaterialBinding.artifactKind !== 'product_page'
        || artifact.requestedUrl !== productMaterialBinding.discoveryUrl
        || artifact.finalUrl !== productMaterialBinding.discoveryUrl
        || artifact.contentSha256 !== discoveryProvenance.discoveryContentSha256) {
        throw new Error('official product-material HTML must be the hash-bound discovery self-source');
      }
      if (requestedFields.some((field) => ![
        'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      ].includes(field))) {
        throw new Error('official product-material product page is dimensions only');
      }
      if (productMaterialBinding.relationshipKind === 'model_variant') {
        boundVariantModel = productMaterialBinding.pageModel ?? discoveryProvenance.matchedModel;
      }
    }
    const extracted = extractClaimsFromHtml(artifact.bytes, {
      brand: identity.brand,
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
  const source = {
    authority: 'manufacturer',
    sourceType: artifact.contentType === 'application/pdf'
      ? (boundVariantModel
        ? 'official_model_variant_pdf'
        : 'official_exact_model_pdf')
      : artifact.contentType === 'application/json'
        ? (boundVariantModel ? 'official_model_variant_api' : 'official_exact_model_api')
        : (boundVariantModel
          ? 'official_model_variant_product_page'
          : 'official_exact_model_product_page'),
    sourceUrl: artifact.requestedUrl,
    finalUrl: artifact.finalUrl,
    redirectChain: [...artifact.redirectChain],
    retrievedAt: now,
    contentSha256: artifact.contentSha256,
    objectPath: artifact.objectPath,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
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
