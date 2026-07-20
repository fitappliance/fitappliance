import { createHash } from 'node:crypto';

import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';
import { validateRetailLifecycleRefreshInventory } from './retail-lifecycle-refresh-inventory.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_KINDS = new Set([
  'AU_GOVERNMENT_REGISTRY',
  'OFFICIAL_PRODUCT_PAGE',
  'OFFICIAL_PDF_MINERU',
]);
const RESOLUTION_ACTIONS = new Set([
  'KEEP_CANONICAL_IDENTITY',
  'CORRECT_CANONICAL_MODEL',
  'MERGE_DUPLICATE_CANONICAL',
]);
const LINK_ACTIONS = new Set([
  'ACCEPT_AFTER_CANONICAL_CORRECTION',
  'REASSIGN_TO_EXISTING_CANONICAL',
  'INVALIDATE_WRONG_IDENTITY',
]);

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
  const result = required(value, label);
  const parsed = new Date(result);
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
  return `${category}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function registryCategoryCompatible(productCategory, registryCategory) {
  return productCategory === registryCategory
    || (productCategory === 'washtower_combo'
      && ['washing_machine', 'dryer'].includes(registryCategory));
}

function projectionCategoryCompatible(productCategory, candidateCategory) {
  return productCategory === candidateCategory;
}

function modelLooksPolluted(value) {
  const model = required(value, 'expected model');
  return /\s/.test(model) && /\b(?:FRIDGE|REFRIGERATOR|FREEZER|WASHER|DRYER|DISHWASHER|DOOR|MOUNT|L|KG)\b/i.test(model);
}

function pollutedModelContainsExactToken(value, expectedModel) {
  const expectedKey = registryModelKey(expectedModel);
  const tokens = String(value ?? '').toUpperCase().match(/[A-Z0-9][A-Z0-9._/-]{2,}/g) ?? [];
  return tokens.some((token) => registryModelKey(token) === expectedKey);
}

function strictMissingPrefix(expectedModel, receivedModel) {
  const expectedKey = registryModelKey(expectedModel);
  const receivedKey = registryModelKey(receivedModel);
  if (!expectedKey || !receivedKey.endsWith(expectedKey) || receivedKey === expectedKey) return false;
  const prefix = receivedKey.slice(0, -expectedKey.length);
  return /^[A-Z]{2,4}$/.test(prefix)
    && new RegExp(`^[A-Z]{2,4}[-_. ]+${String(expectedModel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      .test(String(receivedModel));
}

function normalizedRegistryEvidence(observation) {
  if (observation?.activeInAustralia !== true) return null;
  const category = required(observation.category, 'registry category');
  const brand = required(observation.identity?.brandCanonical ?? observation.identity?.brandRaw, 'registry brand');
  const model = required(observation.identity?.modelRaw, 'registry model');
  return {
    evidenceKind: 'AU_GOVERNMENT_REGISTRY',
    sourceId: required(observation.sourceId, 'registry source ID'),
    snapshotSha256: sha256(observation.snapshotSha256, 'registry snapshot SHA-256'),
    sourceLine: Number(observation.sourceLine),
    rowFingerprint: sha256(observation.rowFingerprint, 'registry row fingerprint'),
    category,
    brand,
    model,
    registrationNumber: observation.identity?.registrationNumber == null
      ? null
      : required(observation.identity.registrationNumber, 'registry registration number'),
  };
}

function normalizedManufacturerEvidence(observation, generatedAt) {
  if (!['OFFICIAL_PRODUCT_PAGE', 'OFFICIAL_PDF_MINERU'].includes(observation?.evidenceKind)) return null;
  const evidenceKind = observation.evidenceKind;
  const evidenceId = required(observation.evidenceId, 'official manufacturer evidence ID');
  const sourceId = required(observation.sourceId, 'official manufacturer source ID');
  const category = required(observation.category, 'official manufacturer category');
  const brand = required(observation.brand, 'official manufacturer brand');
  const model = required(observation.model, 'official manufacturer model');
  const sourceUrl = new URL(required(observation.sourceUrl, 'official manufacturer source URL')).toString();
  const finalUrl = new URL(required(observation.finalUrl, 'official manufacturer final URL')).toString();
  const observedAt = timestamp(observation.observedAt, 'official manufacturer observedAt');
  if (observedAt > generatedAt) throw new Error('official manufacturer evidence is after resolution generatedAt');
  const rawSha256 = sha256(observation.rawSha256, 'official manufacturer raw SHA-256');
  const extension = evidenceKind === 'OFFICIAL_PDF_MINERU' ? 'pdf' : 'html';
  const expectedRawPath = `evidence/web/sha256/${rawSha256.slice(0, 2)}/${rawSha256.slice(2, 4)}/${rawSha256}.${extension}`;
  if (observation.rawObjectPath !== expectedRawPath) {
    throw new TypeError('official manufacturer raw object path mismatch');
  }
  if (!Array.isArray(observation.identityLocators) || observation.identityLocators.length === 0) {
    throw new TypeError('official manufacturer identity locators required');
  }
  const derivedArtifact = observation.derivedArtifact == null ? null : structuredClone(observation.derivedArtifact);
  if (evidenceKind === 'OFFICIAL_PDF_MINERU') {
    if (!derivedArtifact || derivedArtifact.format !== 'content_list_v2'
      || derivedArtifact.parserName !== 'MinerU'
      || sha256(derivedArtifact.sourcePdfSha256, 'official manufacturer MinerU source SHA-256') !== rawSha256) {
      throw new TypeError('official manufacturer PDF requires source-bound MinerU JSON');
    }
    sha256(derivedArtifact.contentSha256, 'official manufacturer MinerU content SHA-256');
  } else if (derivedArtifact) {
    throw new TypeError('official manufacturer HTML cannot carry MinerU JSON');
  }
  return {
    evidenceKind,
    evidenceId,
    sourceId,
    manifestSemanticSha256: sha256(
      observation.manifestSemanticSha256,
      'official manufacturer manifest semantic SHA-256',
    ),
    category,
    brand,
    model,
    sourceUrl,
    finalUrl,
    observedAt,
    rawSha256,
    rawObjectPath: expectedRawPath,
    identityLocators: structuredClone(observation.identityLocators),
    ...(derivedArtifact ? { derivedArtifact } : {}),
  };
}

function normalizedListingFact(value, mismatch, generatedAt) {
  if (!value) return null;
  if (required(value.baselineLinkId, 'listing fact baseline link ID') !== mismatch.baselineLinkId) {
    throw new Error(`listing fact baseline link mismatch: ${mismatch.baselineLinkId}`);
  }
  const observedAt = timestamp(value.observedAt, 'listing fact observedAt');
  if (observedAt > generatedAt) throw new Error('listing fact is after resolution generatedAt');
  const rawSourceSha256 = sha256(value.rawSourceSha256, 'listing fact raw source SHA-256');
  if (rawSourceSha256 !== mismatch.rawSourceSha256) {
    throw new Error(`listing fact raw source mismatch: ${mismatch.baselineLinkId}`);
  }
  const receivedModel = required(value.receivedModel, 'listing fact received model');
  if (registryModelKey(receivedModel) !== registryModelKey(mismatch.receivedModel)) {
    throw new Error(`listing fact received model mismatch: ${mismatch.baselineLinkId}`);
  }
  const receivedUrl = new URL(required(value.receivedUrl, 'listing fact received URL')).toString();
  if (receivedUrl !== new URL(mismatch.url).toString()) {
    throw new Error(`listing fact received URL mismatch: ${mismatch.baselineLinkId}`);
  }
  if (!['available', 'unavailable', 'unknown'].includes(value.availability)) {
    throw new TypeError('listing fact availability invalid');
  }
  if (!['current', 'unavailable'].includes(value.listingState)) {
    throw new TypeError('listing fact listing state invalid');
  }
  if (value.listingState === 'unavailable' && value.availability !== 'unavailable') {
    throw new TypeError('listing fact unavailable state conflicts with availability');
  }
  if (required(value.retailer, 'listing fact retailer') !== mismatch.retailer) {
    throw new TypeError('listing fact retailer mismatch');
  }
  for (const [label, number] of [
    ['expected cadence hours', Number(value.expectedCadenceHours)],
    ['maximum current age hours', Number(value.maximumCurrentAgeHours)],
  ]) {
    if (!Number.isFinite(number) || number <= 0) throw new TypeError(`listing fact ${label} invalid`);
  }
  if (value.priceAud != null && (!Number.isFinite(Number(value.priceAud)) || Number(value.priceAud) < 0)) {
    throw new TypeError('listing fact price invalid');
  }
  return {
    baselineLinkId: mismatch.baselineLinkId,
    adapterId: required(value.adapterId, 'listing fact adapter ID'),
    retailer: required(value.retailer, 'listing fact retailer'),
    sourceType: required(value.sourceType, 'listing fact source type'),
    policyVersion: required(value.policyVersion, 'listing fact policy version'),
    expectedCadenceHours: Number(value.expectedCadenceHours),
    maximumCurrentAgeHours: Number(value.maximumCurrentAgeHours),
    observedAt,
    rawSourceReference: required(value.rawSourceReference, 'listing fact raw source reference'),
    rawSourceSha256,
    receivedModel,
    receivedUrl,
    availability: value.availability,
    listingState: value.listingState,
    priceAud: value.priceAud == null ? null : Number(value.priceAud),
    title: value.title == null ? null : String(value.title).trim() || null,
    imageUrl: value.imageUrl == null ? null : String(value.imageUrl).trim() || null,
    retailerProductId: value.retailerProductId == null
      ? null
      : String(value.retailerProductId).trim() || null,
  };
}

function compactEvidence(rows, generatedAt) {
  return rows.map((row) => (
    row?.evidenceKind
      ? normalizedManufacturerEvidence(row, generatedAt)
      : normalizedRegistryEvidence(row)
  )).filter(Boolean).sort((left, right) => (
    left.evidenceKind.localeCompare(right.evidenceKind)
    || left.sourceId.localeCompare(right.sourceId)
    || (left.sourceLine ?? 0) - (right.sourceLine ?? 0)
    || String(left.rowFingerprint ?? left.rawSha256).localeCompare(String(right.rowFingerprint ?? right.rawSha256))
  ));
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function sameCanonical(left, right) {
  return canonicalSha256(left) === canonicalSha256(right);
}

function validateSortedUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label} required`);
  const normalized = values.map((value) => required(value, label));
  if (new Set(normalized).size !== normalized.length
    || normalized.some((value, index) => index > 0 && normalized[index - 1].localeCompare(value) > 0)) {
    throw new TypeError(`${label} must be sorted and unique`);
  }
  return normalized;
}

function validateCompactEvidence(row, expected, bindings) {
  if (!EVIDENCE_KINDS.has(row.evidenceKind)) throw new TypeError('official evidence kind invalid');
  if (row.evidenceKind !== 'AU_GOVERNMENT_REGISTRY') {
    if (bindings.officialIdentityEvidenceManifestSemanticSha256 == null
      || sha256(row.manifestSemanticSha256, 'official manufacturer manifest SHA-256')
        !== bindings.officialIdentityEvidenceManifestSemanticSha256) {
      throw new TypeError('official manufacturer manifest binding mismatch');
    }
    required(row.evidenceId, 'official manufacturer evidence ID');
    required(row.sourceId, 'official manufacturer source ID');
    new URL(required(row.sourceUrl, 'official manufacturer source URL'));
    new URL(required(row.finalUrl, 'official manufacturer final URL'));
    timestamp(row.observedAt, 'official manufacturer observedAt');
    const rawSha256 = sha256(row.rawSha256, 'official manufacturer raw SHA-256');
    const extension = row.evidenceKind === 'OFFICIAL_PDF_MINERU' ? 'pdf' : 'html';
    if (row.rawObjectPath !== `evidence/web/sha256/${rawSha256.slice(0, 2)}/${rawSha256.slice(2, 4)}/${rawSha256}.${extension}`
      || !Array.isArray(row.identityLocators) || row.identityLocators.length === 0) {
      throw new TypeError('official manufacturer compact evidence binding invalid');
    }
    if (row.evidenceKind === 'OFFICIAL_PDF_MINERU') {
      if (row.derivedArtifact?.format !== 'content_list_v2'
        || row.derivedArtifact?.parserName !== 'MinerU'
        || row.derivedArtifact?.sourcePdfSha256 !== rawSha256) {
        throw new TypeError('official manufacturer compact MinerU binding invalid');
      }
    } else if (row.derivedArtifact != null) {
      throw new TypeError('official manufacturer HTML compact evidence invalid');
    }
    const category = required(row.category, 'official manufacturer evidence category');
    const brand = required(row.brand, 'official manufacturer evidence brand');
    const model = required(row.model, 'official manufacturer evidence model');
    if (!registryCategoryCompatible(expected.category, category)
      || registryBrandKey(brand) !== registryBrandKey(expected.brand)
      || registryModelKey(model) !== registryModelKey(expected.model)) {
      throw new TypeError('official manufacturer evidence identity mismatch');
    }
    return;
  }
  const sourceId = required(row.sourceId, 'registry evidence source ID');
  const snapshot = sha256(row.snapshotSha256, 'registry evidence snapshot SHA-256');
  if (bindings.registrySnapshots[sourceId] !== snapshot) throw new TypeError('registry snapshot binding mismatch');
  if (!Number.isSafeInteger(row.sourceLine) || row.sourceLine <= 0) {
    throw new TypeError('registry evidence source line invalid');
  }
  sha256(row.rowFingerprint, 'registry evidence row fingerprint');
  const category = required(row.category, 'registry evidence category');
  const brand = required(row.brand, 'registry evidence brand');
  const model = required(row.model, 'registry evidence model');
  if (!registryCategoryCompatible(expected.category, category)
    || registryBrandKey(brand) !== registryBrandKey(expected.brand)
    || registryModelKey(model) !== registryModelKey(expected.model)) {
    throw new TypeError('registry evidence identity mismatch');
  }
  if (row.registrationNumber != null) required(row.registrationNumber, 'registry registration number');
}

function semanticPayload(document) {
  const { resolutionId, semanticSha256, ...payload } = document;
  return payload;
}

export function validateRetailerIdentityResolution(document) {
  if (!document || document.schemaVersion !== 2 || !Array.isArray(document.cases)) {
    throw new TypeError('retailer identity resolution schema v2 required');
  }
  if (document.policyVersion !== 'retailer-identity-resolution-v2') {
    throw new TypeError('retailer identity resolution policy v2 required');
  }
  const generatedAt = timestamp(document.generatedAt, 'identity resolution generatedAt');
  const bindings = document.sourceBindings;
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
    throw new TypeError('identity resolution source bindings required');
  }
  sha256(bindings.refreshInventorySemanticSha256, 'refresh inventory semantic SHA-256');
  sha256(bindings.publicProjectionSemanticSha256, 'public projection semantic SHA-256');
  if (!bindings.registrySnapshots || typeof bindings.registrySnapshots !== 'object'
    || Array.isArray(bindings.registrySnapshots)) {
    throw new TypeError('registry snapshot bindings required');
  }
  const registryBindingEntries = Object.entries(bindings.registrySnapshots);
  if (registryBindingEntries.length === 0
    || registryBindingEntries.some(([key], index) => index > 0
      && registryBindingEntries[index - 1][0].localeCompare(key) > 0)) {
    throw new TypeError('registry snapshot bindings must be sorted and non-empty');
  }
  for (const [sourceId, hash] of registryBindingEntries) {
    required(sourceId, 'registry source ID');
    sha256(hash, 'registry snapshot binding SHA-256');
  }
  if (bindings.officialIdentityEvidenceManifestSemanticSha256 != null) {
    sha256(
      bindings.officialIdentityEvidenceManifestSemanticSha256,
      'official identity evidence manifest semantic SHA-256',
    );
  }
  const ids = document.cases.map((item) => required(item.resolutionTaskId, 'identity resolution task ID'));
  if (new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError('identity resolution cases must be sorted and unique');
  }
  const allBaselineLinkIds = new Set();
  for (const item of document.cases) {
    required(item.canonicalProductId, 'identity resolution canonical product ID');
    required(item.legacyRuntimeId, 'identity resolution legacy runtime ID');
    const expectedIdentity = {
      category: required(item.expectedIdentity?.category, 'identity resolution expected category'),
      brand: required(item.expectedIdentity?.brand, 'identity resolution expected brand'),
      model: required(item.expectedIdentity?.model, 'identity resolution expected model'),
    };
    if (!Array.isArray(item.mismatchSources)) throw new TypeError('identity mismatch sources required');
    const baselineLinkIds = validateSortedUniqueStrings(
      item.mismatchSources.map((source) => source.baselineLinkId),
      'identity mismatch baseline link ID',
    );
    for (const baselineLinkId of baselineLinkIds) {
      if (allBaselineLinkIds.has(baselineLinkId)) throw new TypeError('duplicate identity mismatch baseline link');
      allBaselineLinkIds.add(baselineLinkId);
    }
    const receivedModels = [...new Map(item.mismatchSources.map((source) => [
      registryModelKey(required(source.receivedModel, 'identity mismatch received model')),
      source.receivedModel,
    ])).values()].sort();
    for (const source of item.mismatchSources) {
      required(source.retailer, 'identity mismatch retailer');
      new URL(required(source.url, 'identity mismatch URL'));
      required(source.reasonCode, 'identity mismatch reason code');
      sha256(source.rawSourceSha256, 'identity mismatch raw source SHA-256');
      if (source.listingFact != null) {
        const normalized = normalizedListingFact(source.listingFact, source, generatedAt);
        if (!sameCanonical(normalized, source.listingFact)) {
          throw new TypeError('identity listing fact is not normalized');
        }
      }
    }
    if (!item.officialEvidence || !Array.isArray(item.officialEvidence.expectedExact)
      || !item.officialEvidence.receivedExactByModel
      || typeof item.officialEvidence.receivedExactByModel !== 'object') {
      throw new TypeError('identity official evidence required');
    }
    for (const row of item.officialEvidence.expectedExact) {
      validateCompactEvidence(row, expectedIdentity, bindings);
    }
    const receivedEvidenceEntries = Object.entries(item.officialEvidence.receivedExactByModel);
    if (!sameCanonical(receivedEvidenceEntries.map(([model]) => model).sort(), receivedModels)) {
      throw new TypeError('received registry evidence keys mismatch');
    }
    for (const [model, rows] of receivedEvidenceEntries) {
      if (!Array.isArray(rows)) throw new TypeError('received registry evidence rows required');
      for (const row of rows) {
        validateCompactEvidence(row, { ...expectedIdentity, model }, bindings);
      }
    }
    if (!['RESOLVED', 'UNRESOLVED'].includes(item.decision?.status)) {
      throw new TypeError('identity resolution decision status invalid');
    }
    const reasonCodes = validateSortedUniqueStrings(
      item.decision.reasonCodes,
      'identity resolution reason code',
    );
    if (item.decision.status === 'RESOLVED') {
      if (!RESOLUTION_ACTIONS.has(item.decision.action)) throw new TypeError('identity resolution action invalid');
      if (!Array.isArray(item.decision.linkDispositions)
        || item.decision.linkDispositions.length !== item.mismatchSources.length) {
        throw new TypeError('identity resolution must account for every mismatch source');
      }
      const dispositionLinkIds = validateSortedUniqueStrings(
        item.decision.linkDispositions.map((disposition) => disposition.baselineLinkId),
        'identity link disposition baseline link ID',
      );
      if (!sameCanonical(dispositionLinkIds, baselineLinkIds)) {
        throw new TypeError('identity link dispositions do not cover mismatch sources');
      }
      for (const disposition of item.decision.linkDispositions) {
        if (!LINK_ACTIONS.has(disposition.action)) throw new TypeError('identity link disposition invalid');
        const source = item.mismatchSources.find((candidate) => (
          candidate.baselineLinkId === disposition.baselineLinkId
        ));
        if (!source?.listingFact || !disposition.resolvedListingFact
          || !sameCanonical(source.listingFact, disposition.resolvedListingFact)) {
          throw new TypeError('resolved identity must bind every immutable listing fact');
        }
        if (disposition.action === 'INVALIDATE_WRONG_IDENTITY') {
          if (disposition.destinationCanonicalProductId != null) {
            throw new TypeError('invalidated identity cannot have a destination');
          }
        } else {
          const destination = required(
            disposition.destinationCanonicalProductId,
            'identity link destination canonical product ID',
          );
          if (disposition.action === 'REASSIGN_TO_EXISTING_CANONICAL'
            && destination === item.canonicalProductId) {
            throw new TypeError('reassigned identity destination must differ from source');
          }
        }
      }
      const onlyReceivedModel = receivedModels.length === 1 ? receivedModels[0] : null;
      const receivedEvidence = onlyReceivedModel == null
        ? []
        : item.officialEvidence.receivedExactByModel[onlyReceivedModel];
      if (item.decision.action === 'CORRECT_CANONICAL_MODEL') {
        if (item.officialEvidence.expectedExact.length !== 0 || receivedModels.length !== 1
          || !strictMissingPrefix(expectedIdentity.model, onlyReceivedModel)
          || item.decision.correctedModel !== onlyReceivedModel
          || item.decision.targetCanonicalProductId !== item.canonicalProductId
          || new Set(receivedEvidence
            .filter((row) => row.evidenceKind === 'AU_GOVERNMENT_REGISTRY')
            .map((row) => row.sourceId)).size < 2
          || item.decision.linkDispositions.some((row) => (
            row.action !== 'ACCEPT_AFTER_CANONICAL_CORRECTION'
            || row.destinationCanonicalProductId !== item.canonicalProductId
          ))) {
          throw new TypeError('canonical model correction evidence mismatch');
        }
      } else if (item.decision.action === 'MERGE_DUPLICATE_CANONICAL') {
        if (item.officialEvidence.expectedExact.length !== 0 || receivedModels.length !== 1
          || !modelLooksPolluted(expectedIdentity.model) || receivedEvidence.length === 0
          || !pollutedModelContainsExactToken(expectedIdentity.model, onlyReceivedModel)
          || !item.decision.targetCanonicalProductId
          || item.decision.targetCanonicalProductId === item.canonicalProductId
          || item.decision.linkDispositions.some((row) => (
            row.action !== 'REASSIGN_TO_EXISTING_CANONICAL'
            || row.destinationCanonicalProductId !== item.decision.targetCanonicalProductId
          ))) {
          throw new TypeError('merge destination evidence mismatch');
        }
      } else if (item.officialEvidence.expectedExact.length === 0 || receivedModels.length === 0
        || receivedModels.some((model) => (
          item.officialEvidence.receivedExactByModel[model].length === 0
          || registryModelKey(expectedIdentity.model) === registryModelKey(model)
        ))
        || item.decision.targetCanonicalProductId != null
        || item.decision.linkDispositions.some((row) => row.action === 'ACCEPT_AFTER_CANONICAL_CORRECTION')) {
        throw new TypeError('kept canonical identity evidence mismatch');
      }
      void reasonCodes;
    } else {
      if (item.decision.action != null || item.decision.correctedModel != null
        || item.decision.targetCanonicalProductId != null
        || !Array.isArray(item.decision.linkDispositions)
        || item.decision.linkDispositions.length !== 0) {
        throw new TypeError('unresolved identity cannot carry a resolution');
      }
    }
  }
  const expectedSummary = {
    cases: document.cases.length,
    resolved: document.cases.filter((item) => item.decision.status === 'RESOLVED').length,
    unresolved: document.cases.filter((item) => item.decision.status === 'UNRESOLVED').length,
    byAction: countBy(
      document.cases.filter((item) => item.decision.status === 'RESOLVED'),
      (item) => item.decision.action,
    ),
    byLinkAction: countBy(
      document.cases.flatMap((item) => item.decision.linkDispositions ?? []),
      (item) => item.action,
    ),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError('retailer identity resolution summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.resolutionId !== `retailer_identity_resolution_${semantic.slice(0, 24)}`) {
    throw new Error('retailer identity resolution integrity mismatch');
  }
  return document;
}

export function buildRetailerIdentityResolution({
  refreshInventory,
  publicProjection,
  registryObservations,
  officialIdentityEvidence = [],
  officialIdentityEvidenceManifestSemanticSha256 = null,
  listingFacts,
  generatedAt,
}) {
  validateRetailLifecycleRefreshInventory(refreshInventory);
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public projection products required');
  }
  if (!Array.isArray(registryObservations) || !Array.isArray(officialIdentityEvidence)
    || !Array.isArray(listingFacts)) {
    throw new TypeError('registry observations, official identity evidence, and listing facts required');
  }
  const at = timestamp(generatedAt, 'identity resolution generatedAt');
  const officialManifestBinding = officialIdentityEvidence.length
    ? sha256(
      officialIdentityEvidenceManifestSemanticSha256,
      'official identity evidence manifest semantic SHA-256',
    )
    : null;
  if (!officialIdentityEvidence.length && officialIdentityEvidenceManifestSemanticSha256 != null) {
    throw new TypeError('official identity evidence manifest binding has no evidence');
  }
  for (const row of officialIdentityEvidence) {
    if (row.manifestSemanticSha256 !== officialManifestBinding) {
      throw new TypeError('official identity evidence manifest binding mismatch');
    }
    normalizedManufacturerEvidence(row, at);
  }
  const factsByLink = new Map(listingFacts.map((fact) => [
    required(fact.baselineLinkId, 'listing fact baseline link ID'),
    fact,
  ]));
  if (factsByLink.size !== listingFacts.length) throw new TypeError('duplicate listing fact baseline link');
  const expectedFactLinkIds = new Set(refreshInventory.items.flatMap((item) => (
    item.resolutionTasks?.flatMap((task) => task.quarantinedBaselineLinkIds) ?? []
  )));
  for (const baselineLinkId of factsByLink.keys()) {
    if (!expectedFactLinkIds.has(baselineLinkId)) {
      throw new TypeError(`listing fact is not requested by refresh inventory: ${baselineLinkId}`);
    }
  }
  const activeRegistry = registryObservations.filter((row) => row?.activeInAustralia === true);
  const registrySnapshots = new Map();
  for (const row of activeRegistry) {
    const sourceId = required(row.sourceId, 'registry source ID');
    const snapshot = sha256(row.snapshotSha256, 'registry snapshot SHA-256');
    if (registrySnapshots.has(sourceId) && registrySnapshots.get(sourceId) !== snapshot) {
      throw new TypeError(`conflicting registry snapshots for ${sourceId}`);
    }
    registrySnapshots.set(sourceId, snapshot);
  }
  const projectionByIdentity = new Map();
  for (const product of publicProjection.products) {
    const key = identityKey(product.cat, product.brand, product.model);
    if (!projectionByIdentity.has(key)) projectionByIdentity.set(key, []);
    projectionByIdentity.get(key).push(product);
  }
  const resolutionItems = refreshInventory.items
    .filter((item) => item.resolutionTasks?.length)
    .flatMap((item) => item.resolutionTasks.map((task) => ({ item, task })))
    .sort((left, right) => left.task.resolutionTaskId.localeCompare(right.task.resolutionTaskId));
  const cases = resolutionItems.map(({ item, task }) => {
    const expectedRegistry = activeRegistry.filter((row) => (
      registryCategoryCompatible(item.category, row.category)
      && registryBrandKey(row.identity?.brandCanonical ?? row.identity?.brandRaw) === registryBrandKey(item.brand)
      && registryModelKey(row.identity?.modelRaw) === registryModelKey(item.model)
    ));
    const expectedManufacturer = officialIdentityEvidence.filter((row) => (
      registryCategoryCompatible(item.category, row.category)
      && registryBrandKey(row.brand) === registryBrandKey(item.brand)
      && registryModelKey(row.model) === registryModelKey(item.model)
    ));
    const receivedModels = [...new Set(task.quarantinedSources.map((source) => (
      required(source.receivedModel, 'mismatch received model')
    )))].sort();
    const registryByReceivedModel = Object.fromEntries(receivedModels.map((model) => [
      model,
      compactEvidence([
        ...activeRegistry.filter((row) => (
          registryCategoryCompatible(item.category, row.category)
          && registryBrandKey(row.identity?.brandCanonical ?? row.identity?.brandRaw) === registryBrandKey(item.brand)
          && registryModelKey(row.identity?.modelRaw) === registryModelKey(model)
        )),
        ...officialIdentityEvidence.filter((row) => (
          registryCategoryCompatible(item.category, row.category)
          && registryBrandKey(row.brand) === registryBrandKey(item.brand)
          && registryModelKey(row.model) === registryModelKey(model)
        )),
      ], at),
    ]));
    const mismatchSources = task.quarantinedSources.map((source) => {
      const mismatch = {
        baselineLinkId: source.baselineLinkId,
        retailer: source.retailer,
        url: new URL(source.url).toString(),
        reasonCode: source.reasonCode,
        receivedModel: source.receivedModel,
        rawSourceSha256: sha256(source.rawSourceSha256, 'mismatch raw source SHA-256'),
      };
      return {
        ...mismatch,
        listingFact: normalizedListingFact(factsByLink.get(source.baselineLinkId), mismatch, at),
      };
    }).sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));

    let decision = {
      status: 'UNRESOLVED',
      reasonCodes: ['AUTOMATED_IDENTITY_RULE_NOT_PROVEN'],
      linkDispositions: [],
    };
    const allListingFactsBound = mismatchSources.every((source) => source.listingFact != null);
    if (!allListingFactsBound) {
      decision = {
        status: 'UNRESOLVED',
        reasonCodes: ['IMMUTABLE_LISTING_FACT_NOT_BOUND'],
        linkDispositions: [],
      };
    } else if (receivedModels.length > 0) {
      let action = null;
      let reasonCodes = [];
      let destination = null;
      const everyReceivedModelExact = receivedModels.every((model) => (
        registryByReceivedModel[model].length > 0
        && registryModelKey(model) !== registryModelKey(item.model)
      ));
      if (expectedRegistry.length > 0 && everyReceivedModelExact) {
        action = 'KEEP_CANONICAL_IDENTITY';
        reasonCodes = ['EXPECTED_AND_ALL_RECEIVED_ARE_DISTINCT_EXACT_AU_MODELS'];
      } else if (receivedModels.length === 1) {
        const [receivedModel] = receivedModels;
        const receivedEvidence = registryByReceivedModel[receivedModel];
        const destinationCandidates = publicProjection.products.filter((product) => (
          projectionCategoryCompatible(item.category, product.cat)
          && registryBrandKey(product.brand) === registryBrandKey(item.brand)
          && registryModelKey(product.model) === registryModelKey(receivedModel)
          && product.canonicalProductId !== item.canonicalProductId
        ));
        destination = destinationCandidates.length === 1 ? destinationCandidates[0] : null;
        if (expectedRegistry.length === 0 && receivedEvidence.length > 0
          && modelLooksPolluted(item.model)
          && pollutedModelContainsExactToken(item.model, receivedModel)
          && destination) {
          action = 'MERGE_DUPLICATE_CANONICAL';
          reasonCodes = ['MARKETING_POLLUTED_IDENTITY_CONTAINS_EXACT_RECEIVED_MODEL_WITH_ONE_DESTINATION'];
        } else if (expectedRegistry.length === 0 && receivedEvidence.length > 0
          && strictMissingPrefix(item.model, receivedModel)
          && new Set(receivedEvidence
            .filter((row) => row.evidenceKind === 'AU_GOVERNMENT_REGISTRY')
            .map((row) => row.sourceId)).size >= 2) {
          action = 'CORRECT_CANONICAL_MODEL';
          reasonCodes = ['STRICT_MISSING_PREFIX_PROVEN_BY_TWO_OFFICIAL_REGISTRY_SOURCES'];
        } else if (expectedRegistry.length === 0 && receivedEvidence.length > 0
          && modelLooksPolluted(item.model)
          && !pollutedModelContainsExactToken(item.model, receivedModel)) {
          decision = {
            status: 'UNRESOLVED',
            reasonCodes: ['POLLUTED_IDENTITY_EMBEDDED_MODEL_CONFLICTS_WITH_RECEIVED_MODEL'],
            linkDispositions: [],
          };
        }
      }
      if (action) {
        const targetCanonicalProductId = action === 'CORRECT_CANONICAL_MODEL'
          ? item.canonicalProductId
          : action === 'MERGE_DUPLICATE_CANONICAL'
            ? destination?.canonicalProductId ?? null
            : null;
        decision = {
          status: 'RESOLVED',
          action,
          reasonCodes,
          ...(action === 'CORRECT_CANONICAL_MODEL' ? { correctedModel: receivedModels[0] } : {}),
          ...(targetCanonicalProductId ? { targetCanonicalProductId } : {}),
          linkDispositions: mismatchSources.map((source) => {
            const receivedDestination = projectionByIdentity.get(identityKey(
              item.category,
              item.brand,
              source.receivedModel,
            )) ?? [];
            const exactDestination = receivedDestination.length === 1
              && receivedDestination[0].canonicalProductId !== item.canonicalProductId
              ? receivedDestination[0]
              : null;
            const dispositionAction = action === 'CORRECT_CANONICAL_MODEL'
              ? 'ACCEPT_AFTER_CANONICAL_CORRECTION'
              : exactDestination ? 'REASSIGN_TO_EXISTING_CANONICAL' : 'INVALIDATE_WRONG_IDENTITY';
            return {
              baselineLinkId: source.baselineLinkId,
              action: dispositionAction,
              ...(action === 'CORRECT_CANONICAL_MODEL'
                ? { destinationCanonicalProductId: item.canonicalProductId }
                : exactDestination
                  ? { destinationCanonicalProductId: exactDestination.canonicalProductId }
                  : {}),
              ...(source.listingFact ? { resolvedListingFact: source.listingFact } : {}),
            };
          }),
        };
      }
    }
    return {
      resolutionTaskId: task.resolutionTaskId,
      canonicalProductId: item.canonicalProductId,
      legacyRuntimeId: item.legacyRuntimeId,
      expectedIdentity: structuredClone(task.expectedIdentity),
      mismatchSources,
      officialEvidence: {
        expectedExact: compactEvidence([...expectedRegistry, ...expectedManufacturer], at),
        receivedExactByModel: registryByReceivedModel,
      },
      decision,
    };
  });
  const document = {
    schemaVersion: 2,
    policyVersion: 'retailer-identity-resolution-v2',
    generatedAt: at,
    sourceBindings: {
      refreshInventorySemanticSha256: sha256(
        refreshInventory.semanticSha256,
        'refresh inventory semantic SHA-256',
      ),
      publicProjectionSemanticSha256: sha256(
        publicProjection.semanticSha256 ?? canonicalSha256(publicProjection),
        'public projection semantic SHA-256',
      ),
      registrySnapshots: Object.fromEntries(
        [...registrySnapshots.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
      officialIdentityEvidenceManifestSemanticSha256: officialManifestBinding,
    },
    cases,
    summary: {
      cases: cases.length,
      resolved: cases.filter((item) => item.decision.status === 'RESOLVED').length,
      unresolved: cases.filter((item) => item.decision.status === 'UNRESOLVED').length,
      byAction: countBy(
        cases.filter((item) => item.decision.status === 'RESOLVED'),
        (item) => item.decision.action,
      ),
      byLinkAction: countBy(
        cases.flatMap((item) => item.decision.linkDispositions ?? []),
        (item) => item.action,
      ),
    },
  };
  const semantic = canonicalSha256(document);
  document.resolutionId = `retailer_identity_resolution_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailerIdentityResolution(document));
}
