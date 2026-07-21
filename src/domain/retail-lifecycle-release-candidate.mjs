import { createHash } from 'node:crypto';

import { auditPublicFitProjection } from './geometry-publication.mjs';
import { validateRetailLifecycleShadow } from './retail-lifecycle-shadow.mjs';
import { validateRetailerIdentityMigration } from './retailer-identity-migration.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const POLICY_VERSION = 'retail-lifecycle-release-candidate-v1';
const PUBLIC_OBSERVATION_FIELDS = new Set([
  'id',
  'canonicalProductId',
  'retailer',
  'adapterId',
  'observedAt',
  'url',
  'availability',
  'priceAud',
  'retailerProductId',
  'sourceType',
  'listingState',
  'rawSourceSha256',
  'policyVersion',
  'freshnessState',
]);

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

function timestamp(value, label) {
  const result = new Date(required(value, label));
  if (Number.isNaN(result.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return result.toISOString();
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

function semanticPayload(document) {
  const { releaseCandidateId, semanticSha256, ...payload } = document;
  return payload;
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map((value) => required(value, label));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} contains duplicates`);
  if (normalized.some((value, index) => index > 0 && normalized[index - 1].localeCompare(value) > 0)) {
    throw new TypeError(`${label} must be sorted`);
  }
  return normalized;
}

function projectionMaps(projection, label) {
  if (!projection || !Array.isArray(projection.products)) {
    throw new TypeError(`${label} products required`);
  }
  const byLegacy = new Map();
  const byCanonical = new Map();
  for (const product of projection.products) {
    const legacyRuntimeId = required(product?.id, `${label} legacy runtime ID`);
    const canonicalProductId = required(product?.canonicalProductId, `${label} canonical product ID`);
    if (byLegacy.has(legacyRuntimeId) || byCanonical.has(canonicalProductId)) {
      throw new TypeError(`${label} product identities must be unique`);
    }
    byLegacy.set(legacyRuntimeId, product);
    byCanonical.set(canonicalProductId, product);
  }
  return { byLegacy, byCanonical };
}

function legacyCurrent(product) {
  return product?.unavailable === false
    && Array.isArray(product?.retailers)
    && product.retailers.length > 0;
}

function hasCommercialOutput(product) {
  if ((product?.retailers?.length ?? 0) > 0 || product?.sponsored === true) return true;
  if (product?.discovery != null) return true;
  for (const key of [
    'price',
    'direct_url',
    'directUrl',
    'affiliate_url',
    'affiliateUrl',
    'salePrice',
    'sale_price',
    'stock',
    'stockStatus',
    'stock_status',
    'availability',
    'offer',
    'offers',
  ]) {
    if (product?.[key] !== null && product?.[key] !== undefined && product?.[key] !== '') return true;
  }
  return false;
}

function hasPublicControlPlaneLeakage(product) {
  const decision = product?.retailLifecycle;
  if (!decision || !Array.isArray(decision.latestObservations)
    || !Array.isArray(decision.observationConflicts)
    || !Array.isArray(decision.collectionAttempts)) return true;
  if (decision.observationConflicts.length > 0 || decision.collectionAttempts.length > 0) return true;
  if (decision.lifecycleState !== 'CURRENT_RETAIL' && decision.latestObservations.length > 0) return true;
  const observations = [decision.authorizingObservation, ...decision.latestObservations].filter(Boolean);
  return observations.some((observation) => (
    Object.keys(observation).some((key) => !PUBLIC_OBSERVATION_FIELDS.has(key))
  ));
}

function identity(product) {
  return {
    category: required(product?.cat, 'candidate product category'),
    brand: required(product?.brand, 'candidate product brand'),
    model: required(product?.model, 'candidate product model'),
  };
}

function sameIdentity(left, right) {
  return canonicalSha256(identity(left)) === canonicalSha256(identity(right));
}

function dispositionBySource(migration) {
  const result = new Map();
  for (const [kind, rows] of [
    ['MERGE', migration.canonicalMerges],
    ['QUARANTINE', migration.canonicalQuarantines],
  ]) {
    for (const row of rows) {
      const canonicalProductId = required(row.sourceCanonicalProductId, `${kind} source canonical ID`);
      if (result.has(canonicalProductId)) {
        throw new TypeError(`multiple identity dispositions for ${canonicalProductId}`);
      }
      result.set(canonicalProductId, { kind, row });
    }
  }
  return result;
}

function partitionFor({ baselinePublicProjection, candidateShadow, identityMigration }) {
  const baseline = projectionMaps(baselinePublicProjection, 'baseline projection');
  const priorCurrentIds = [...baseline.byCanonical.values()]
    .filter(legacyCurrent)
    .map((product) => product.canonicalProductId)
    .sort();
  const currentRetailIds = [];
  const explicitUnavailableIds = [];
  const marketReferenceIds = [];
  for (const record of candidateShadow.records) {
    if (record.priorVisibility !== 'CURRENT_OUTPUT') continue;
    if (record.lifecycleState === 'CURRENT_RETAIL') {
      currentRetailIds.push(record.canonicalProductId);
    } else if (record.lifecycleState === 'CATALOG_ARCHIVED'
      && record.retailLifecycle.reasonCodes.includes('FRESH_UNAVAILABLE_OBSERVATION')) {
      explicitUnavailableIds.push(record.canonicalProductId);
    } else if (record.publicVisibility === 'MARKET_REFERENCE_ONLY') {
      marketReferenceIds.push(record.canonicalProductId);
    }
  }
  const candidateIds = new Set(candidateShadow.records.map((record) => record.canonicalProductId));
  const dispositions = dispositionBySource(identityMigration);
  const identityMergeIds = [];
  const identityQuarantineIds = [];
  for (const canonicalProductId of priorCurrentIds) {
    if (candidateIds.has(canonicalProductId)) continue;
    const disposition = dispositions.get(canonicalProductId);
    if (disposition?.kind === 'MERGE') identityMergeIds.push(canonicalProductId);
    if (disposition?.kind === 'QUARANTINE') identityQuarantineIds.push(canonicalProductId);
  }
  const partition = {
    expectedLegacyCurrentProducts: priorCurrentIds.length,
    accountedLegacyCurrentProducts: 0,
    currentRetailIds: currentRetailIds.sort(),
    explicitUnavailableIds: explicitUnavailableIds.sort(),
    marketReferenceIds: marketReferenceIds.sort(),
    identityMergeIds: identityMergeIds.sort(),
    identityQuarantineIds: identityQuarantineIds.sort(),
    unresolvedIds: [...candidateShadow.cutover.unresolvedLegacyCurrentIds].sort(),
    unsafeRemovedIds: [...candidateShadow.cutover.unsafeRemovedLegacyCurrentIds].sort(),
  };
  partition.accountedLegacyCurrentProducts = [
    partition.currentRetailIds,
    partition.explicitUnavailableIds,
    partition.marketReferenceIds,
    partition.identityMergeIds,
    partition.identityQuarantineIds,
    partition.unresolvedIds,
    partition.unsafeRemovedIds,
  ].reduce((sum, values) => sum + values.length, 0);
  return { partition, priorCurrentIds };
}

function membershipFor({ baselinePublicProjection, candidateBaseProjection, identityMigration }) {
  const baseline = projectionMaps(baselinePublicProjection, 'baseline projection');
  const candidate = projectionMaps(candidateBaseProjection, 'candidate base projection');
  const removedLegacyRuntimeIds = [...baseline.byLegacy.keys()]
    .filter((id) => !candidate.byLegacy.has(id))
    .sort();
  const addedLegacyRuntimeIds = [...candidate.byLegacy.keys()]
    .filter((id) => !baseline.byLegacy.has(id))
    .sort();
  const dispositions = dispositionBySource(identityMigration);
  const unexplainedRemovedLegacyRuntimeIds = [];
  const identityMergeRemovedLegacyRuntimeIds = [];
  const identityQuarantineRemovedLegacyRuntimeIds = [];
  for (const legacyRuntimeId of removedLegacyRuntimeIds) {
    const source = baseline.byLegacy.get(legacyRuntimeId);
    const disposition = dispositions.get(source.canonicalProductId);
    if (!disposition || disposition.row.sourceLegacyRuntimeId !== legacyRuntimeId) {
      unexplainedRemovedLegacyRuntimeIds.push(legacyRuntimeId);
      continue;
    }
    const target = candidate.byCanonical.get(disposition.row.targetCanonicalProductId);
    if (!target
      || target.id !== disposition.row.targetLegacyRuntimeId
      || canonicalSha256(identity(target)) !== canonicalSha256(disposition.row.targetIdentity)) {
      unexplainedRemovedLegacyRuntimeIds.push(legacyRuntimeId);
      continue;
    }
    if (disposition.kind === 'MERGE') identityMergeRemovedLegacyRuntimeIds.push(legacyRuntimeId);
    if (disposition.kind === 'QUARANTINE') identityQuarantineRemovedLegacyRuntimeIds.push(legacyRuntimeId);
  }
  const correctionsByLegacy = new Map(identityMigration.canonicalCorrections.map((row) => [
    row.legacyRuntimeId,
    row,
  ]));
  const unexplainedIdentityChanges = [];
  for (const [legacyRuntimeId, candidateProduct] of candidate.byLegacy) {
    const baselineProduct = baseline.byLegacy.get(legacyRuntimeId);
    if (!baselineProduct) continue;
    if (candidateProduct.canonicalProductId !== baselineProduct.canonicalProductId) {
      unexplainedIdentityChanges.push(legacyRuntimeId);
      continue;
    }
    if (sameIdentity(candidateProduct, baselineProduct)) continue;
    const correction = correctionsByLegacy.get(legacyRuntimeId);
    if (!correction
      || correction.canonicalProductId !== candidateProduct.canonicalProductId
      || correction.category !== candidateProduct.cat
      || correction.brand !== candidateProduct.brand
      || correction.fromModel !== baselineProduct.model
      || correction.toModel !== candidateProduct.model) {
      unexplainedIdentityChanges.push(legacyRuntimeId);
    }
  }
  return {
    baselineProducts: baseline.byLegacy.size,
    candidateBaseProducts: candidate.byLegacy.size,
    removedLegacyRuntimeIds,
    addedLegacyRuntimeIds,
    identityMergeRemovedLegacyRuntimeIds: identityMergeRemovedLegacyRuntimeIds.sort(),
    identityQuarantineRemovedLegacyRuntimeIds: identityQuarantineRemovedLegacyRuntimeIds.sort(),
    unexplainedRemovedLegacyRuntimeIds: unexplainedRemovedLegacyRuntimeIds.sort(),
    unexplainedIdentityChanges: unexplainedIdentityChanges.sort(),
  };
}

function assertPartition(document) {
  const partition = document.partition ?? {};
  const fields = [
    'currentRetailIds',
    'explicitUnavailableIds',
    'marketReferenceIds',
    'identityMergeIds',
    'identityQuarantineIds',
    'unresolvedIds',
    'unsafeRemovedIds',
  ];
  const all = [];
  for (const field of fields) all.push(...sortedUnique(partition[field], `release partition ${field}`));
  if (new Set(all).size !== all.length) throw new TypeError('release partition contains overlapping IDs');
  if (!Number.isInteger(partition.expectedLegacyCurrentProducts)
    || !Number.isInteger(partition.accountedLegacyCurrentProducts)
    || partition.accountedLegacyCurrentProducts !== all.length
    || partition.expectedLegacyCurrentProducts !== partition.accountedLegacyCurrentProducts) {
    throw new TypeError('release partition does not account for every legacy-current product');
  }
}

export function validateRetailLifecycleReleaseCandidate(document, options = {}) {
  if (!document || document.schemaVersion !== 1 || document.policyVersion !== POLICY_VERSION) {
    throw new TypeError('retail lifecycle release candidate schema v1 required');
  }
  if (document.mode !== 'SHADOW_ONLY') throw new TypeError('release candidate must remain SHADOW_ONLY');
  timestamp(document.generatedAt, 'release candidate generatedAt');
  required(document.releaseEpoch, 'release candidate epoch');
  const requiredBindings = [
    'baselinePublicProjectionSha256',
    'baselinePublicProjectionSemanticSha256',
    'candidateBaseProjectionSha256',
    'candidateBaseProjectionSemanticSha256',
    'finalCandidateProjectionSha256',
    'finalCandidateProjectionSemanticSha256',
    'identityMigrationSha256',
    'identityMigrationSemanticSha256',
    'candidateShadowSha256',
    'candidateShadowSemanticSha256',
    'officialMarketLifecycleSha256',
    'officialMarketLifecycleSemanticSha256',
    'historicalReferenceCandidateSha256',
    'historicalReferenceCandidateSemanticSha256',
    'releasePolicySha256',
  ];
  for (const key of requiredBindings) {
    hash(document.sourceBindings?.[key], `release candidate source binding ${key}`);
  }
  assertPartition(document);
  const membership = document.membership ?? {};
  for (const field of [
    'removedLegacyRuntimeIds',
    'addedLegacyRuntimeIds',
    'identityMergeRemovedLegacyRuntimeIds',
    'identityQuarantineRemovedLegacyRuntimeIds',
    'unexplainedRemovedLegacyRuntimeIds',
    'unexplainedIdentityChanges',
  ]) sortedUnique(membership[field], `release membership ${field}`);
  if (!Number.isInteger(membership.baselineProducts)
    || !Number.isInteger(membership.candidateBaseProducts)
    || !Number.isInteger(membership.finalCandidateProducts)) {
    throw new TypeError('release membership product counts required');
  }
  const removedPartition = [
    ...membership.identityMergeRemovedLegacyRuntimeIds,
    ...membership.identityQuarantineRemovedLegacyRuntimeIds,
    ...membership.unexplainedRemovedLegacyRuntimeIds,
  ];
  if (new Set(removedPartition).size !== removedPartition.length
    || JSON.stringify([...removedPartition].sort())
      !== JSON.stringify(membership.removedLegacyRuntimeIds)) {
    throw new TypeError('release membership removals are not exhaustively dispositioned');
  }
  if (membership.baselineProducts - membership.removedLegacyRuntimeIds.length
    + membership.addedLegacyRuntimeIds.length !== membership.candidateBaseProducts
    || membership.candidateBaseProducts !== membership.finalCandidateProducts) {
    throw new TypeError('release membership product-count arithmetic mismatch');
  }
  const publicationAudit = document.publicationAudit ?? {};
  sortedUnique(publicationAudit.unsafeCurrentIds, 'release unsafe current IDs');
  sortedUnique(publicationAudit.unsafeMarketReferenceIds, 'release unsafe market-reference IDs');
  sortedUnique(publicationAudit.unsafePublicControlPlaneIds, 'release unsafe public control-plane IDs');
  if (!Number.isInteger(publicationAudit.fitPublicationViolations)
    || publicationAudit.fitPublicationViolations < 0) {
    throw new TypeError('release Fit publication violation count required');
  }
  sortedUnique(document.authorization?.reasonCodes, 'release authorization reason codes');
  const ready = document.partition.unresolvedIds.length === 0
    && document.partition.unsafeRemovedIds.length === 0
    && membership.addedLegacyRuntimeIds.length === 0
    && membership.unexplainedRemovedLegacyRuntimeIds.length === 0
    && membership.unexplainedIdentityChanges.length === 0
    && publicationAudit.unsafeCurrentIds.length === 0
    && publicationAudit.unsafeMarketReferenceIds.length === 0
    && publicationAudit.unsafePublicControlPlaneIds.length === 0
    && publicationAudit.fitPublicationViolations === 0;
  if (document.authorization?.status !== (ready ? 'READY_FOR_CUTOVER' : 'BLOCKED')) {
    throw new TypeError('release candidate authorization does not match its gates');
  }
  if (document.rollback?.status !== 'PROVEN_BYTE_IDENTICAL'
    || hash(document.rollback.restoredBaselineSha256, 'restored baseline SHA-256')
      !== document.sourceBindings.baselinePublicProjectionSha256) {
    throw new TypeError('release candidate rollback proof invalid');
  }
  if (!options.allowUnsigned) {
    const semantic = canonicalSha256(semanticPayload(document));
    if (document.semanticSha256 !== semantic
      || document.releaseCandidateId !== `retail_lifecycle_release_${semantic.slice(0, 24)}`) {
      throw new Error('retail lifecycle release candidate integrity mismatch');
    }
  }
  return document;
}

export function buildRetailLifecycleReleaseCandidate({
  baselinePublicProjection,
  baselinePublicProjectionSha256,
  candidateBaseProjection,
  candidateBaseProjectionSha256,
  finalCandidateProjection,
  finalCandidateProjectionSha256,
  identityMigration,
  identityMigrationSha256,
  candidateShadow,
  candidateShadowSha256,
  releasePolicy,
  releasePolicySha256,
  historicalReferenceCandidate,
  historicalReferenceCandidateSha256,
  restoredBaselineSha256,
}) {
  validateRetailerIdentityMigration(identityMigration);
  validateRetailLifecycleShadow(candidateShadow);
  if (releasePolicy?.mode !== 'SHADOW_ONLY') throw new Error('candidate build requires SHADOW_ONLY');
  if (required(releasePolicy.releaseEpoch, 'release policy epoch') !== candidateShadow.releaseEpoch
    || timestamp(releasePolicy.asOf, 'release policy asOf') !== candidateShadow.asOf) {
    throw new Error('candidate shadow release-policy epoch drift');
  }
  const baselineHash = hash(baselinePublicProjectionSha256, 'baseline public projection SHA-256');
  const baseHash = hash(candidateBaseProjectionSha256, 'candidate base projection SHA-256');
  if (candidateShadow.sourceBindings.publicProjectionSha256 !== baseHash
    || candidateShadow.sourceBindings.publicProjectionSemanticSha256
      !== canonicalSha256(candidateBaseProjection)) {
    throw new Error('candidate shadow base projection binding drift');
  }
  if (candidateShadow.sourceBindings.releasePolicySha256
    !== hash(releasePolicySha256, 'release policy SHA-256')) {
    throw new Error('candidate shadow release policy binding drift');
  }
  const { partition, priorCurrentIds } = partitionFor({
    baselinePublicProjection,
    candidateShadow,
    identityMigration,
  });
  const membership = membershipFor({
    baselinePublicProjection,
    candidateBaseProjection,
    identityMigration,
  });
  membership.finalCandidateProducts = projectionMaps(
    finalCandidateProjection,
    'final candidate projection',
  ).byLegacy.size;
  if (partition.expectedLegacyCurrentProducts
    !== releasePolicy.cutoverRequirements?.expectedLegacyCurrentProducts) {
    throw new Error('release policy legacy-current population drift');
  }
  const finalByLegacy = projectionMaps(finalCandidateProjection, 'final candidate projection').byLegacy;
  if (finalByLegacy.size !== membership.candidateBaseProducts
    || [...finalByLegacy.keys()].some((id) => !projectionMaps(
      candidateBaseProjection,
      'candidate base projection',
    ).byLegacy.has(id))) {
    throw new Error('final candidate membership differs from candidate base');
  }
  const unsafeCurrentIds = [];
  const unsafeMarketReferenceIds = [];
  const unsafePublicControlPlaneIds = [];
  for (const product of finalByLegacy.values()) {
    if (product.unavailable === false
      && (!Array.isArray(product.retailers) || product.retailers.length === 0
        || !product.retailLifecycle?.authorizingObservation)) {
      unsafeCurrentIds.push(product.id);
    }
    if (product.lifecycleVisibility === 'MARKET_REFERENCE_ONLY'
      && (product.unavailable !== true || hasCommercialOutput(product))) {
      unsafeMarketReferenceIds.push(product.id);
    }
    if (hasPublicControlPlaneLeakage(product)) unsafePublicControlPlaneIds.push(product.id);
  }
  const fitPublicationAudit = auditPublicFitProjection(finalCandidateProjection);
  const ready = candidateShadow.cutover.status === 'READY'
    && partition.expectedLegacyCurrentProducts === partition.accountedLegacyCurrentProducts
    && partition.unresolvedIds.length === 0
    && partition.unsafeRemovedIds.length === 0
    && membership.addedLegacyRuntimeIds.length === 0
    && membership.unexplainedRemovedLegacyRuntimeIds.length === 0
    && membership.unexplainedIdentityChanges.length === 0
    && unsafeCurrentIds.length === 0
    && unsafeMarketReferenceIds.length === 0
    && unsafePublicControlPlaneIds.length === 0
    && fitPublicationAudit.summary.violations === 0;
  const document = {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    mode: 'SHADOW_ONLY',
    releaseEpoch: candidateShadow.releaseEpoch,
    generatedAt: candidateShadow.asOf,
    sourceBindings: {
      baselinePublicProjectionSha256: baselineHash,
      baselinePublicProjectionSemanticSha256: canonicalSha256(baselinePublicProjection),
      candidateBaseProjectionSha256: baseHash,
      candidateBaseProjectionSemanticSha256: canonicalSha256(candidateBaseProjection),
      finalCandidateProjectionSha256: hash(
        finalCandidateProjectionSha256,
        'final candidate projection SHA-256',
      ),
      finalCandidateProjectionSemanticSha256: canonicalSha256(finalCandidateProjection),
      identityMigrationSha256: hash(identityMigrationSha256, 'identity migration SHA-256'),
      identityMigrationSemanticSha256: hash(
        identityMigration.semanticSha256,
        'identity migration semantic SHA-256',
      ),
      candidateShadowSha256: hash(candidateShadowSha256, 'candidate shadow SHA-256'),
      candidateShadowSemanticSha256: hash(
        candidateShadow.semanticSha256,
        'candidate shadow semantic SHA-256',
      ),
      officialMarketLifecycleSha256: hash(
        candidateShadow.sourceBindings.officialMarketLifecycleSha256,
        'candidate official market SHA-256',
      ),
      officialMarketLifecycleSemanticSha256: hash(
        candidateShadow.sourceBindings.officialMarketLifecycleSemanticSha256,
        'candidate official market semantic SHA-256',
      ),
      historicalReferenceCandidateSha256: hash(
        historicalReferenceCandidateSha256,
        'candidate historical reference SHA-256',
      ),
      historicalReferenceCandidateSemanticSha256: canonicalSha256(historicalReferenceCandidate),
      releasePolicySha256: hash(releasePolicySha256, 'release policy SHA-256'),
    },
    partition,
    membership,
    publicationAudit: {
      unsafeCurrentIds: unsafeCurrentIds.sort(),
      unsafeMarketReferenceIds: unsafeMarketReferenceIds.sort(),
      unsafePublicControlPlaneIds: unsafePublicControlPlaneIds.sort(),
      fitPublicationViolations: fitPublicationAudit.summary.violations,
    },
    authorization: {
      status: ready ? 'READY_FOR_CUTOVER' : 'BLOCKED',
      reasonCodes: [
        ...(candidateShadow.cutover.status === 'READY' ? [] : ['CANDIDATE_SHADOW_BLOCKED']),
        ...(partition.accountedLegacyCurrentProducts === priorCurrentIds.length
          ? [] : ['LEGACY_CURRENT_PARTITION_INCOMPLETE']),
        ...(membership.addedLegacyRuntimeIds.length === 0 ? [] : ['UNEXPLAINED_PRODUCT_ADDITION']),
        ...(membership.unexplainedRemovedLegacyRuntimeIds.length === 0
          ? [] : ['UNEXPLAINED_PRODUCT_REMOVAL']),
        ...(membership.unexplainedIdentityChanges.length === 0
          ? [] : ['UNEXPLAINED_IDENTITY_CHANGE']),
        ...(unsafeCurrentIds.length === 0 ? [] : ['CURRENT_PRODUCT_WITHOUT_AUTHORIZER']),
        ...(unsafeMarketReferenceIds.length === 0 ? [] : ['MARKET_REFERENCE_HAS_RETAIL_OUTPUT']),
        ...(unsafePublicControlPlaneIds.length === 0 ? [] : ['PUBLIC_CONTROL_PLANE_LEAKAGE']),
        ...(fitPublicationAudit.summary.violations === 0 ? [] : ['FIT_PUBLICATION_VIOLATION']),
      ].sort(),
    },
    rollback: {
      status: hash(restoredBaselineSha256, 'restored baseline SHA-256') === baselineHash
        ? 'PROVEN_BYTE_IDENTICAL'
        : 'FAILED',
      restoredBaselineSha256: hash(restoredBaselineSha256, 'restored baseline SHA-256'),
    },
  };
  const semantic = canonicalSha256(document);
  document.releaseCandidateId = `retail_lifecycle_release_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailLifecycleReleaseCandidate(document));
}
