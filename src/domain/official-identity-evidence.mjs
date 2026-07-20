import { createHash } from 'node:crypto';

import { load } from 'cheerio';

import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';
import { isOfficialBrandMarketUrl } from './evidence-source-verifier.mjs';
import { inspectMineruContentListV2 } from './mineru-document.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const SEED_POLICY = 'retailer-identity-official-evidence-seeds-v1';
const EVIDENCE_POLICY = 'retailer-identity-official-evidence-v1';
const MEDIA_TYPES = new Set(['text/html', 'application/pdf']);
const EVIDENCE_KINDS = new Set(['OFFICIAL_PRODUCT_PAGE', 'OFFICIAL_PDF_MINERU']);
const MAXIMUM_BYTES = 25 * 1024 * 1024;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function hash(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timestamp(value, label) {
  const text = required(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function sameCanonical(left, right) {
  return canonicalSha256(left) === canonicalSha256(right);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function objectPath(contentSha256, mediaType) {
  const extension = mediaType === 'application/pdf' ? 'pdf' : 'html';
  return `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
}

function validatePayload(bytes, mediaType) {
  const payload = Buffer.from(bytes ?? []);
  if (!payload.length || payload.length > MAXIMUM_BYTES) throw new Error('official identity payload size outside limits');
  if (mediaType === 'application/pdf') {
    if (!payload.subarray(0, 16).toString('utf8').trimStart().startsWith('%PDF-')) {
      throw new Error('official identity PDF magic bytes invalid');
    }
  } else {
    const prefix = payload.subarray(0, Math.min(payload.length, 4096)).toString('utf8')
      .replace(/^\uFEFF/, '').trimStart().toLowerCase();
    if (!prefix.startsWith('<!doctype') && !prefix.startsWith('<html')) {
      throw new Error('official identity HTML magic bytes invalid');
    }
  }
  return payload;
}

function normalizeSeed(value) {
  const evidenceId = required(value?.evidenceId, 'official identity evidence ID');
  if (!/^[a-z0-9][a-z0-9_]{2,127}$/.test(evidenceId)) {
    throw new TypeError('official identity evidence ID invalid');
  }
  const category = required(value.category, 'official identity category');
  const brand = required(value.brand, 'official identity brand');
  const model = required(value.model, 'official identity model');
  const sourceUrl = new URL(required(value.sourceUrl, 'official identity source URL')).toString();
  if (!isOfficialBrandMarketUrl(sourceUrl, brand)) {
    throw new TypeError(`official identity source URL is not an official Australian market URL for ${brand}`);
  }
  const mediaType = required(value.mediaType, 'official identity media type').toLowerCase();
  if (!MEDIA_TYPES.has(mediaType)) throw new TypeError('official identity media type unsupported');
  return { evidenceId, category, brand, model, sourceUrl, mediaType };
}

export function validateOfficialIdentityEvidenceSeeds(document) {
  if (!document || document.schemaVersion !== 1 || document.policyVersion !== SEED_POLICY
    || !Array.isArray(document.seeds) || document.seeds.length === 0) {
    throw new TypeError('official identity evidence seed schema invalid');
  }
  const seeds = document.seeds.map(normalizeSeed);
  if (new Set(seeds.map((seed) => seed.evidenceId)).size !== seeds.length
    || seeds.some((seed, index) => index > 0
      && seeds[index - 1].evidenceId.localeCompare(seed.evidenceId) > 0)) {
    throw new TypeError('official identity evidence seeds must be sorted and unique');
  }
  const identities = seeds.map((seed) => [
    seed.category,
    registryBrandKey(seed.brand),
    registryModelKey(seed.model),
    seed.sourceUrl,
  ].join('\0'));
  if (new Set(identities).size !== identities.length) {
    throw new TypeError('duplicate official identity evidence seed');
  }
  return freezeDeep({ schemaVersion: 1, policyVersion: SEED_POLICY, seeds });
}

function exactModel(value, expectedModel) {
  return registryModelKey(value) === registryModelKey(expectedModel);
}

function locator(kind, path, value) {
  const normalized = required(value, 'structured model value');
  return {
    kind,
    path,
    value: normalized,
    fragmentSha256: sha256(`${kind}\0${path}\0${normalized}`),
  };
}

function walkJsonLd(value, path, candidates) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJsonLd(item, `${path}[${index}]`, candidates));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const types = [value['@type']].flat().map((entry) => String(entry ?? '').toLowerCase());
  if (types.includes('product')) {
    for (const key of ['sku', 'mpn', 'model', 'productID']) {
      if (typeof value[key] === 'string') candidates.push(locator('json_ld_product_model', `${path}.${key}`, value[key]));
    }
  }
  for (const [key, child] of Object.entries(value)) walkJsonLd(child, `${path}.${key}`, candidates);
}

export function extractOfficialHtmlIdentityLocators(bytes, expectedModel) {
  const payload = validatePayload(bytes, 'text/html');
  const $ = load(payload.toString('utf8'));
  const candidates = [];
  $('script[type="application/ld+json"]').each((index, element) => {
    try {
      walkJsonLd(JSON.parse($(element).text()), `script[application/ld+json][${index}]`, candidates);
    } catch {
      // Invalid JSON-LD cannot become identity evidence; other structured fields may still qualify.
    }
  });
  $('script').each((index, element) => {
    const text = $(element).text();
    for (const match of text.matchAll(/ELECTROLUX\.GA4\s*=\s*(\{[^;]+\})\s*;/g)) {
      try {
        const object = JSON.parse(match[1]);
        if (!/^pdp/i.test(String(object.page_type ?? ''))) continue;
        for (const key of ['product_model_id', 'product_pnc', 'item_id']) {
          if (typeof object[key] === 'string') candidates.push(locator(
            'product_analytics_model',
            `script[${index}].ELECTROLUX.GA4.${key}`,
            object[key],
          ));
        }
      } catch {
        // An unparseable assignment is not trusted as structured evidence.
      }
    }
  });
  const attributes = [
    'data-item-model',
    'data-product-model',
    'datalayer-productmodelid',
    'datalayer-origin-productmodelid',
  ];
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((index, element) => {
      candidates.push(locator('product_data_attribute', `[${attribute}][${index}]`, $(element).attr(attribute)));
    });
  }
  $('meta[itemprop="sku"],meta[itemprop="mpn"],meta[itemprop="model"]').each((index, element) => {
    candidates.push(locator('product_meta_model', `meta[itemprop][${index}]`, $(element).attr('content')));
  });
  const exact = candidates.filter((candidate) => exactModel(candidate.value, expectedModel));
  const unique = [...new Map(exact.map((candidate) => [
    `${candidate.kind}\0${candidate.path}\0${candidate.value}`,
    candidate,
  ])).values()].sort((left, right) => (
    left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path) || left.value.localeCompare(right.value)
  ));
  if (!unique.length) throw new Error('official HTML has no structured exact-model identity locator');
  return freezeDeep(unique);
}

function fragmentHasExactModel(text, expectedModel) {
  const expectedKey = registryModelKey(expectedModel);
  const tokens = String(text ?? '').toUpperCase().match(/[A-Z0-9][A-Z0-9._-]{2,}/g) ?? [];
  return tokens.some((token) => registryModelKey(token) === expectedKey);
}

export function extractOfficialPdfIdentityLocators(jsonBytes, expectedModel) {
  const inspected = inspectMineruContentListV2(jsonBytes);
  const locators = [];
  for (const page of inspected.pages) {
    page.fragments.forEach((fragment, fragmentIndex) => {
      if (!fragmentHasExactModel(fragment.rawText, expectedModel)) return;
      const text = String(fragment.rawText ?? '').trim();
      locators.push({
        kind: 'mineru_exact_model_fragment',
        page: page.page,
        fragmentIndex,
        fragmentType: fragment.type,
        fragmentSha256: fragment.fragmentSha256,
        textSha256: sha256(text),
        textExcerpt: text.slice(0, 240),
      });
    });
  }
  if (!locators.length) throw new Error('official PDF MinerU JSON has no exact-model identity locator');
  return freezeDeep(locators);
}

function normalizeTransport(seed, fetched) {
  const requestedUrl = new URL(required(fetched?.requestedUrl, 'official identity requested URL')).toString();
  if (requestedUrl !== seed.sourceUrl) throw new Error('official identity requested URL drift');
  const finalUrl = new URL(required(fetched.finalUrl, 'official identity final URL')).toString();
  const redirectChain = fetched.redirectChain ?? [];
  if (!Array.isArray(redirectChain) || redirectChain.length > 5) throw new TypeError('official identity redirect chain invalid');
  for (const value of [...redirectChain, finalUrl]) {
    if (!isOfficialBrandMarketUrl(value, seed.brand)) {
      throw new Error('official identity redirect or final URL escaped official Australian market hosts');
    }
  }
  const contentType = required(fetched.contentType, 'official identity content type').split(';')[0].toLowerCase();
  if (contentType !== seed.mediaType) throw new Error('official identity content type mismatch');
  return {
    requestedUrl,
    finalUrl,
    redirectChain: redirectChain.map((url) => new URL(url).toString()),
    transport: required(fetched.transport ?? 'fetch', 'official identity transport'),
    contentType,
    bytes: validatePayload(fetched.bytes, contentType),
  };
}

function validateDerivedArtifact(value, rawSha256, jsonBytes) {
  if (!value || value.schemaVersion !== 1 || value.format !== 'content_list_v2'
    || value.parserName !== 'MinerU') {
    throw new TypeError('official identity MinerU derived artifact invalid');
  }
  const contentSha256 = sha256(jsonBytes);
  if (hash(value.sourcePdfSha256, 'MinerU source PDF SHA-256') !== rawSha256
    || hash(value.contentSha256, 'MinerU content SHA-256') !== contentSha256
    || value.objectPath !== `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`
    || value.byteSize !== jsonBytes.length) {
    throw new Error('official identity MinerU source or content binding mismatch');
  }
  const inspected = inspectMineruContentListV2(jsonBytes);
  if (value.pageCount !== inspected.pageCount) throw new Error('official identity MinerU page count mismatch');
  return structuredClone(value);
}

function semanticPayload(document) {
  const { manifestId, semanticSha256, ...payload } = document;
  return payload;
}

export async function acquireOfficialIdentityEvidence({
  seedsDocument,
  acquiredAt,
  fetchArtifact,
  processPdf,
  writeObject,
}) {
  const normalizedSeeds = validateOfficialIdentityEvidenceSeeds(seedsDocument);
  if (typeof fetchArtifact !== 'function' || typeof writeObject !== 'function') {
    throw new TypeError('official identity fetcher and content-addressed object writer required');
  }
  const at = timestamp(acquiredAt, 'official identity acquisition time');
  const records = [];
  for (const seed of normalizedSeeds.seeds) {
    const fetched = normalizeTransport(seed, await fetchArtifact(seed));
    const rawSha256 = sha256(fetched.bytes);
    const rawArtifact = {
      contentSha256: rawSha256,
      objectPath: objectPath(rawSha256, seed.mediaType),
      byteSize: fetched.bytes.length,
      mediaType: seed.mediaType,
    };
    let derivedArtifact;
    let identityLocators;
    let evidenceKind;
    if (seed.mediaType === 'text/html') {
      evidenceKind = 'OFFICIAL_PRODUCT_PAGE';
      identityLocators = extractOfficialHtmlIdentityLocators(fetched.bytes, seed.model);
    } else {
      if (typeof processPdf !== 'function') throw new TypeError('official identity PDF processor required');
      evidenceKind = 'OFFICIAL_PDF_MINERU';
      const processed = await processPdf(fetched.bytes, seed);
      const jsonBytes = Buffer.from(processed?.jsonBytes ?? []);
      derivedArtifact = validateDerivedArtifact(processed?.derivedArtifact, rawSha256, jsonBytes);
      identityLocators = extractOfficialPdfIdentityLocators(jsonBytes, seed.model);
      await writeObject(derivedArtifact.objectPath, jsonBytes);
    }
    await writeObject(rawArtifact.objectPath, fetched.bytes);
    records.push({
      evidenceId: seed.evidenceId,
      evidenceKind,
      identity: { category: seed.category, brand: seed.brand, model: seed.model },
      source: {
        sourceUrl: seed.sourceUrl,
        finalUrl: fetched.finalUrl,
        redirectChain: fetched.redirectChain,
        transport: fetched.transport,
        acquiredAt: at,
      },
      rawArtifact,
      ...(derivedArtifact ? { derivedArtifact } : {}),
      identityLocators,
    });
  }
  const byEvidenceKind = Object.fromEntries([...EVIDENCE_KINDS].sort().flatMap((kind) => {
    const count = records.filter((record) => record.evidenceKind === kind).length;
    return count ? [[kind, count]] : [];
  }));
  const document = {
    schemaVersion: 1,
    policyVersion: EVIDENCE_POLICY,
    acquiredAt: at,
    seedDocumentSemanticSha256: canonicalSha256(normalizedSeeds),
    records,
    summary: { records: records.length, byEvidenceKind },
  };
  const semantic = canonicalSha256(document);
  document.manifestId = `official_identity_evidence_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateOfficialIdentityEvidenceManifest(document));
}

function validateLocatorList(record) {
  if (!Array.isArray(record.identityLocators) || record.identityLocators.length === 0) {
    throw new TypeError('official identity locator required');
  }
  if (record.evidenceKind === 'OFFICIAL_PRODUCT_PAGE') {
    for (const value of record.identityLocators) {
      if (!['json_ld_product_model', 'product_analytics_model', 'product_data_attribute', 'product_meta_model']
        .includes(value.kind)) throw new TypeError('official HTML identity locator invalid');
      required(value.path, 'official HTML identity locator path');
      if (!exactModel(value.value, record.identity.model)) throw new TypeError('official HTML identity locator model mismatch');
      hash(value.fragmentSha256, 'official HTML identity locator hash');
    }
  } else {
    for (const value of record.identityLocators) {
      if (value.kind !== 'mineru_exact_model_fragment' || !Number.isSafeInteger(value.page) || value.page < 1
        || !Number.isSafeInteger(value.fragmentIndex) || value.fragmentIndex < 0) {
        throw new TypeError('official PDF identity locator invalid');
      }
      required(value.fragmentType, 'official PDF fragment type');
      hash(value.fragmentSha256, 'official PDF fragment SHA-256');
      hash(value.textSha256, 'official PDF text SHA-256');
      required(value.textExcerpt, 'official PDF text excerpt');
    }
  }
}

export function validateOfficialIdentityEvidenceManifest(document) {
  if (!document || document.schemaVersion !== 1 || document.policyVersion !== EVIDENCE_POLICY
    || !Array.isArray(document.records) || document.records.length === 0) {
    throw new TypeError('official identity evidence manifest schema invalid');
  }
  const acquiredAt = timestamp(document.acquiredAt, 'official identity manifest acquisition time');
  hash(document.seedDocumentSemanticSha256, 'official identity seed semantic SHA-256');
  const ids = [];
  for (const record of document.records) {
    const evidenceId = required(record.evidenceId, 'official identity evidence ID');
    ids.push(evidenceId);
    if (!EVIDENCE_KINDS.has(record.evidenceKind)) throw new TypeError('official identity evidence kind invalid');
    const identity = {
      category: required(record.identity?.category, 'official identity category'),
      brand: required(record.identity?.brand, 'official identity brand'),
      model: required(record.identity?.model, 'official identity model'),
    };
    const sourceUrl = new URL(required(record.source?.sourceUrl, 'official identity source URL')).toString();
    const finalUrl = new URL(required(record.source?.finalUrl, 'official identity final URL')).toString();
    if (!isOfficialBrandMarketUrl(sourceUrl, identity.brand)
      || !isOfficialBrandMarketUrl(finalUrl, identity.brand)) {
      throw new TypeError('official identity manifest source is outside official Australian market hosts');
    }
    if (!Array.isArray(record.source.redirectChain)
      || record.source.redirectChain.some((url) => !isOfficialBrandMarketUrl(url, identity.brand))) {
      throw new TypeError('official identity manifest redirect chain invalid');
    }
    required(record.source.transport, 'official identity transport');
    if (timestamp(record.source.acquiredAt, 'official identity source acquisition time') !== acquiredAt) {
      throw new TypeError('official identity source acquisition time mismatch');
    }
    const rawSha256 = hash(record.rawArtifact?.contentSha256, 'official identity raw SHA-256');
    const expectedMediaType = record.evidenceKind === 'OFFICIAL_PDF_MINERU' ? 'application/pdf' : 'text/html';
    if (record.rawArtifact?.mediaType !== expectedMediaType
      || record.rawArtifact.objectPath !== objectPath(rawSha256, expectedMediaType)
      || !Number.isSafeInteger(record.rawArtifact.byteSize) || record.rawArtifact.byteSize < 1
      || record.rawArtifact.byteSize > MAXIMUM_BYTES) {
      throw new TypeError('official identity raw artifact binding invalid');
    }
    if (record.evidenceKind === 'OFFICIAL_PDF_MINERU') {
      if (!record.derivedArtifact || record.derivedArtifact.sourcePdfSha256 !== rawSha256) {
        throw new TypeError('official identity PDF requires MinerU binding');
      }
      hash(record.derivedArtifact.contentSha256, 'official identity MinerU content SHA-256');
    } else if (record.derivedArtifact != null) {
      throw new TypeError('official HTML identity cannot carry a MinerU artifact');
    }
    validateLocatorList(record);
  }
  if (new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError('official identity evidence records must be sorted and unique');
  }
  const expectedSummary = {
    records: document.records.length,
    byEvidenceKind: Object.fromEntries(Object.entries(document.records.reduce((result, record) => {
      result[record.evidenceKind] = (result[record.evidenceKind] ?? 0) + 1;
      return result;
    }, {})).sort(([left], [right]) => left.localeCompare(right))),
  };
  if (!sameCanonical(document.summary, expectedSummary)) throw new TypeError('official identity evidence summary mismatch');
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.manifestId !== `official_identity_evidence_${semantic.slice(0, 24)}`) {
    throw new Error('official identity evidence manifest integrity mismatch');
  }
  return document;
}

export async function loadOfficialIdentityEvidence({ manifest, readObject }) {
  validateOfficialIdentityEvidenceManifest(manifest);
  if (typeof readObject !== 'function') throw new TypeError('official identity object reader required');
  const observations = [];
  for (const record of manifest.records) {
    const rawBytes = Buffer.from(await readObject(record.rawArtifact.objectPath) ?? []);
    if (sha256(rawBytes) !== record.rawArtifact.contentSha256
      || rawBytes.length !== record.rawArtifact.byteSize) {
      throw new Error(`official identity raw object hash mismatch: ${record.evidenceId}`);
    }
    validatePayload(rawBytes, record.rawArtifact.mediaType);
    let replayedLocators;
    if (record.evidenceKind === 'OFFICIAL_PRODUCT_PAGE') {
      replayedLocators = extractOfficialHtmlIdentityLocators(rawBytes, record.identity.model);
    } else {
      const jsonBytes = Buffer.from(await readObject(record.derivedArtifact.objectPath) ?? []);
      if (sha256(jsonBytes) !== record.derivedArtifact.contentSha256
        || jsonBytes.length !== record.derivedArtifact.byteSize) {
        throw new Error(`official identity MinerU derived hash mismatch: ${record.evidenceId}`);
      }
      validateDerivedArtifact(record.derivedArtifact, record.rawArtifact.contentSha256, jsonBytes);
      replayedLocators = extractOfficialPdfIdentityLocators(jsonBytes, record.identity.model);
    }
    if (!sameCanonical(replayedLocators, record.identityLocators)) {
      throw new Error(`official identity locator replay mismatch: ${record.evidenceId}`);
    }
    observations.push({
      evidenceKind: record.evidenceKind,
      evidenceId: record.evidenceId,
      sourceId: `official-manufacturer:${record.evidenceId}`,
      category: record.identity.category,
      brand: record.identity.brand,
      model: record.identity.model,
      sourceUrl: record.source.sourceUrl,
      finalUrl: record.source.finalUrl,
      observedAt: record.source.acquiredAt,
      rawSha256: record.rawArtifact.contentSha256,
      rawObjectPath: record.rawArtifact.objectPath,
      identityLocators: structuredClone(record.identityLocators),
      ...(record.derivedArtifact ? { derivedArtifact: structuredClone(record.derivedArtifact) } : {}),
      manifestSemanticSha256: manifest.semanticSha256,
    });
  }
  return freezeDeep(observations);
}
