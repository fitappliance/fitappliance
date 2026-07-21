import { createHash } from 'node:crypto';

import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';
import { validateOfficialIdentityEvidenceManifest } from './official-identity-evidence.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const POLICY_VERSION = 'official-market-lifecycle-v1';
const MARKET_STATES = new Set([
  'ACTIVE_AU_REGISTERED',
  'ACTIVE_AU_OFFICIAL',
  'IDENTITY_AU_OFFICIAL',
  'INACTIVE_AU_REGISTERED',
  'CONFLICT_AU',
  'UNKNOWN_AU',
]);
const REGISTRY_STATES = new Set(['ACTIVE_AU', 'INACTIVE_AU', 'MIXED_AU', 'NO_REGISTRY']);
const OFFER_STATES = new Set(['AVAILABLE', 'UNAVAILABLE', 'CONFLICT', 'UNKNOWN']);

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function timestamp(value, label) {
  const parsed = new Date(required(value, label));
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
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function identityKey(category, brand, model) {
  return `${required(category, 'market category')}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function countBy(records, selector) {
  const result = {};
  for (const record of records) {
    const key = selector(record);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function semanticPayload(document) {
  const { projectionId, semanticSha256, ...payload } = document;
  return payload;
}

function summarizeOfficialOfferAvailability(records) {
  const states = new Set(records.map((record) => record.marketSignal?.status ?? 'UNKNOWN'));
  states.delete('UNKNOWN');
  if (states.has('CONFLICT') || (states.has('AVAILABLE') && states.has('UNAVAILABLE'))) return 'CONFLICT';
  if (states.has('AVAILABLE')) return 'AVAILABLE';
  if (states.has('UNAVAILABLE')) return 'UNAVAILABLE';
  return 'UNKNOWN';
}

function marketState(registryState, officialRecords, offerAvailability) {
  if (offerAvailability === 'CONFLICT') return 'CONFLICT_AU';
  if (offerAvailability === 'AVAILABLE' && registryState !== 'ACTIVE_AU') {
    return 'ACTIVE_AU_OFFICIAL';
  }
  if (registryState === 'ACTIVE_AU') return 'ACTIVE_AU_REGISTERED';
  if (registryState === 'MIXED_AU') return 'CONFLICT_AU';
  if (registryState === 'INACTIVE_AU') return 'INACTIVE_AU_REGISTERED';
  if (officialRecords.length > 0) return 'IDENTITY_AU_OFFICIAL';
  return 'UNKNOWN_AU';
}

function registryEvidence(reference) {
  return (reference?.sources ?? [])
    .filter((source) => String(source?.sourceId ?? '').startsWith('energy-rating:'))
    .map((source) => {
      const sourceLines = Array.isArray(source.sourceLines) ? source.sourceLines.map(Number) : [];
      if (sourceLines.some((line) => !Number.isSafeInteger(line) || line < 1)) {
        throw new TypeError('official market registry source lines invalid');
      }
      return {
        sourceId: required(source.sourceId, 'official market registry source ID'),
        snapshotSha256: sha256(source.snapshotSha256, 'official market registry snapshot SHA-256'),
        sourceLines: [...new Set(sourceLines)].sort((left, right) => left - right),
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function reasonCodes(registryState, officialRecords, offerAvailability, state) {
  const reasons = [];
  if (registryState === 'ACTIVE_AU') reasons.push('EXACT_ACTIVE_AU_REGISTRY');
  if (registryState === 'INACTIVE_AU') reasons.push('EXACT_INACTIVE_AU_REGISTRY');
  if (registryState === 'MIXED_AU') reasons.push('EXACT_REGISTRY_STATUS_CONFLICT');
  if (registryState === 'NO_REGISTRY') reasons.push('NO_EXACT_ENERGY_RATING_RECORD');
  if (officialRecords.length > 0) reasons.push('EXACT_OFFICIAL_AU_IDENTITY');
  if (offerAvailability === 'AVAILABLE') reasons.push('STRUCTURED_OFFICIAL_OFFER_AVAILABLE');
  if (offerAvailability === 'UNAVAILABLE') reasons.push('STRUCTURED_OFFICIAL_OFFER_UNAVAILABLE');
  if (offerAvailability === 'CONFLICT') reasons.push('STRUCTURED_OFFICIAL_OFFER_CONFLICT');
  if (state === 'UNKNOWN_AU') reasons.push('NO_ADMISSIBLE_EXACT_OFFICIAL_MARKET_EVIDENCE');
  return [...new Set(reasons)].sort();
}

export function validateOfficialMarketLifecycle(document) {
  if (!document || document.schemaVersion !== 1 || document.policyVersion !== POLICY_VERSION
    || !Array.isArray(document.records)) {
    throw new TypeError('official market lifecycle schema v1 required');
  }
  timestamp(document.asOf, 'official market lifecycle asOf');
  for (const [key, label] of [
    ['publicProjectionSha256', 'public projection'],
    ['publicProjectionSemanticSha256', 'public projection semantic'],
    ['historicalReferenceSha256', 'historical reference'],
    ['historicalReferenceSemanticSha256', 'historical reference semantic'],
    ['officialIdentityEvidenceSha256', 'official identity evidence'],
    ['officialIdentityEvidenceSemanticSha256', 'official identity evidence semantic'],
  ]) {
    sha256(document.sourceBindings?.[key], `official market ${label} SHA-256`);
  }
  for (const [key, value] of Object.entries(document.sourceBindings ?? {})) {
    sha256(value, `official market lifecycle source binding ${key}`);
  }
  const canonicalIds = [];
  const legacyIds = [];
  for (const record of document.records) {
    canonicalIds.push(required(record.canonicalProductId, 'official market canonical product ID'));
    legacyIds.push(required(record.legacyRuntimeId, 'official market legacy runtime ID'));
    required(record.category, 'official market category');
    required(record.brand, 'official market brand');
    required(record.model, 'official market model');
    if (!MARKET_STATES.has(record.marketState) || !REGISTRY_STATES.has(record.registryMarketState)
      || !OFFER_STATES.has(record.officialOfferAvailability)) {
      throw new TypeError(`official market state invalid for ${record.legacyRuntimeId}`);
    }
    if (!Array.isArray(record.registryEvidence) || !Array.isArray(record.officialEvidenceIds)
      || !Array.isArray(record.reasonCodes)) {
      throw new TypeError(`official market evidence collections missing for ${record.legacyRuntimeId}`);
    }
    if (record.registryEvidence.some((source) => !SHA256.test(String(source.snapshotSha256 ?? ''))
      || !Array.isArray(source.sourceLines))) {
      throw new TypeError(`official market registry evidence invalid for ${record.legacyRuntimeId}`);
    }
    for (const forbidden of ['dimensionsMm', 'fit', 'price', 'retailers', 'retailLifecycle']) {
      if (Object.hasOwn(record, forbidden)) {
        throw new TypeError(`official market record cannot carry ${forbidden}`);
      }
    }
  }
  if (new Set(canonicalIds).size !== canonicalIds.length || new Set(legacyIds).size !== legacyIds.length) {
    throw new TypeError('official market lifecycle product identities must be unique');
  }
  if (legacyIds.some((id, index) => index > 0 && legacyIds[index - 1].localeCompare(id) > 0)) {
    throw new TypeError('official market lifecycle records must be sorted');
  }
  const expectedSummary = {
    products: document.records.length,
    byMarketState: countBy(document.records, (record) => record.marketState),
    byRegistryMarketState: countBy(document.records, (record) => record.registryMarketState),
    byOfficialOfferAvailability: countBy(document.records, (record) => record.officialOfferAvailability),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError('official market lifecycle summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.projectionId !== `official_market_lifecycle_${semantic.slice(0, 24)}`) {
    throw new Error('official market lifecycle integrity mismatch');
  }
  return document;
}

export function buildOfficialMarketLifecycle({
  publicProjection,
  publicProjectionSha256,
  historicalReference,
  historicalReferenceSha256,
  officialIdentityEvidence,
  officialIdentityEvidenceSha256,
  asOf,
}) {
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('official market public projection products required');
  }
  if (!historicalReference || historicalReference.schemaVersion !== 1
    || !Array.isArray(historicalReference.records)) {
    throw new TypeError('official market historical reference schema v1 required');
  }
  validateOfficialIdentityEvidenceManifest(officialIdentityEvidence);
  const normalizedAsOf = timestamp(asOf, 'official market lifecycle asOf');
  const referenceAt = timestamp(historicalReference.generatedAt, 'historical reference generatedAt');
  const officialAt = timestamp(officialIdentityEvidence.acquiredAt, 'official identity evidence acquiredAt');
  if (officialAt < referenceAt) throw new Error('official identity evidence precedes registry reference and is stale');
  if (normalizedAsOf < officialAt || normalizedAsOf < referenceAt) {
    throw new Error('official market lifecycle asOf precedes source evidence');
  }

  const referencesByIdentity = new Map();
  for (const reference of historicalReference.records) {
    const key = identityKey(reference.category, reference.brand, reference.model);
    if (referencesByIdentity.has(key)) throw new Error(`multiple exact historical references for ${key}`);
    referencesByIdentity.set(key, reference);
  }
  const officialByIdentity = new Map();
  for (const record of officialIdentityEvidence.records) {
    const key = identityKey(record.identity.category, record.identity.brand, record.identity.model);
    if (!officialByIdentity.has(key)) officialByIdentity.set(key, []);
    officialByIdentity.get(key).push(record);
  }

  const canonicalIds = new Set();
  const legacyIds = new Set();
  const productIdentities = new Set();
  const records = publicProjection.products.map((product) => {
    const canonicalProductId = required(product.canonicalProductId, 'official market canonical product ID');
    const legacyRuntimeId = required(product.id, 'official market legacy runtime ID');
    const key = identityKey(product.cat, product.brand, product.model);
    if (canonicalIds.has(canonicalProductId) || legacyIds.has(legacyRuntimeId) || productIdentities.has(key)) {
      throw new TypeError(`duplicate official market product identity: ${legacyRuntimeId}`);
    }
    canonicalIds.add(canonicalProductId);
    legacyIds.add(legacyRuntimeId);
    productIdentities.add(key);
    const reference = referencesByIdentity.get(key) ?? null;
    const officialRecords = [...(officialByIdentity.get(key) ?? [])]
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
    const registryMarketState = reference?.registryMarketState ?? 'NO_REGISTRY';
    if (!REGISTRY_STATES.has(registryMarketState)) {
      throw new TypeError(`unsupported registry market state for ${legacyRuntimeId}`);
    }
    const officialOfferAvailability = summarizeOfficialOfferAvailability(officialRecords);
    const nextMarketState = marketState(registryMarketState, officialRecords, officialOfferAvailability);
    return {
      canonicalProductId,
      legacyRuntimeId,
      category: required(product.cat, 'official market category'),
      brand: required(product.brand, 'official market brand'),
      model: required(product.model, 'official market model'),
      marketState: nextMarketState,
      registryMarketState,
      officialOfferAvailability,
      referenceId: reference?.referenceId ?? null,
      registryEvidence: registryEvidence(reference),
      officialEvidenceIds: officialRecords.map((record) => record.evidenceId),
      reasonCodes: reasonCodes(
        registryMarketState,
        officialRecords,
        officialOfferAvailability,
        nextMarketState,
      ),
    };
  }).sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));

  const document = {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    asOf: normalizedAsOf,
    sourceBindings: {
      publicProjectionSha256: sha256(publicProjectionSha256, 'public projection SHA-256'),
      publicProjectionSemanticSha256: canonicalSha256(publicProjection),
      historicalReferenceSha256: sha256(historicalReferenceSha256, 'historical reference SHA-256'),
      historicalReferenceSemanticSha256: canonicalSha256(historicalReference),
      officialIdentityEvidenceSha256: sha256(
        officialIdentityEvidenceSha256,
        'official identity evidence SHA-256',
      ),
      officialIdentityEvidenceSemanticSha256: sha256(
        officialIdentityEvidence.semanticSha256,
        'official identity evidence semantic SHA-256',
      ),
    },
    records,
    summary: {
      products: records.length,
      byMarketState: countBy(records, (record) => record.marketState),
      byRegistryMarketState: countBy(records, (record) => record.registryMarketState),
      byOfficialOfferAvailability: countBy(records, (record) => record.officialOfferAvailability),
    },
  };
  const semantic = canonicalSha256(document);
  document.projectionId = `official_market_lifecycle_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateOfficialMarketLifecycle(document));
}
