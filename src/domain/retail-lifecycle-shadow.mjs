import { createHash } from 'node:crypto';

import {
  catalogReceiptDimensions,
  isCurrentRetailProduct,
} from './historical-appliance-reference.mjs';
import { reduceRetailLifecycle } from './retailer-observation.mjs';
import {
  normalizeRetailerSourcePolicy,
  retailerCollectionAttemptAuthorizedBySourcePolicy,
  retailerObservationAuthorizedBySourcePolicy,
  validateRetailerObservationLedger,
} from './retailer-observation-ledger.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const PRIORITY_BY_LIFECYCLE = Object.freeze({
  CURRENT_RETAIL: 'P0_CURRENT_RETAIL',
  CATALOG_ARCHIVED: 'P1_CATALOG_ARCHIVED',
  REGISTRY_ONLY: 'P2_REGISTRY_ONLY',
  UNKNOWN_RETAIL: 'P2_REGISTRY_ONLY',
});

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

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function priorVisibility(product) {
  return product.unavailable === false && Array.isArray(product.retailers) && product.retailers.length > 0
    ? 'CURRENT_OUTPUT'
    : 'HISTORICAL_INPUT_ONLY';
}

function transition(prior, lifecycleState) {
  if (prior === 'CURRENT_OUTPUT') {
    if (lifecycleState === 'CURRENT_RETAIL') return 'STILL_CURRENT';
    if (lifecycleState === 'CATALOG_ARCHIVED') return 'CURRENT_TO_UNAVAILABLE';
    return 'CURRENT_TO_UNKNOWN';
  }
  if (lifecycleState === 'CURRENT_RETAIL') return 'RELISTED';
  if (lifecycleState === 'CATALOG_ARCHIVED') return 'STILL_ARCHIVED';
  return 'HISTORICAL_TO_UNKNOWN';
}

function publicVisibility(lifecycleState) {
  if (lifecycleState === 'CURRENT_RETAIL') return 'CURRENT_OUTPUT';
  if (lifecycleState === 'CATALOG_ARCHIVED' || lifecycleState === 'REGISTRY_ONLY') {
    return 'HISTORICAL_INPUT_ONLY';
  }
  return 'HIDDEN_UNRESOLVED';
}

function projectedCurrentRetailers(product, record) {
  const existing = Array.isArray(product.retailers) ? product.retailers : [];
  return record.retailLifecycle.latestObservations
    .filter((observation) => observation.freshnessState === 'FRESH'
      && observation.availability === 'available'
      && ['current', 'relisted'].includes(observation.listingState))
    .map((observation) => {
      const prior = existing.find((row) => String(row?.url ?? '') === observation.url) ?? {};
      return freezeDeep({
        ...structuredClone(prior),
        n: observation.retailer,
        url: observation.url,
        p: observation.priceAud ?? prior.p ?? null,
        verified_at: observation.observedAt.slice(0, 10),
        source: `retailer-observation:${observation.sourceType}`,
        stock: 'Yes',
        availability_state: 'available',
        listing_state: observation.listingState,
        observation_id: observation.id,
      });
    })
    .sort((left, right) => left.n.localeCompare(right.n) || left.url.localeCompare(right.url));
}

function semanticPayload(document) {
  const { shadowId, semanticSha256, ...payload } = document;
  return payload;
}

function assertSortedUnique(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  if (new Set(values).size !== values.length) throw new TypeError(`${label} contains duplicates`);
  if (values.some((value, index) => index > 0 && values[index - 1].localeCompare(value) > 0)) {
    throw new TypeError(`${label} must be sorted`);
  }
}

function idsFor(records, predicate) {
  return records.filter(predicate).map((record) => record.canonicalProductId).sort();
}

function explicitUnavailable(record) {
  return record.lifecycleState === 'CATALOG_ARCHIVED'
    && record.retailLifecycle.reasonCodes.includes('FRESH_UNAVAILABLE_OBSERVATION');
}

function expectedCohorts(records) {
  return {
    freshAvailableIds: idsFor(records, (record) => record.lifecycleState === 'CURRENT_RETAIL'),
    explicitUnavailableIds: idsFor(records, explicitUnavailable),
    unknownOrStaleIds: idsFor(records, (record) => record.lifecycleState === 'UNKNOWN_RETAIL'),
    relistedIds: idsFor(records, (record) => record.transition === 'RELISTED'),
    multiRetailerConflictIds: idsFor(records, (record) => (
      record.retailLifecycle.observationConflicts.length > 0
      || record.retailLifecycle.reasonCodes.includes('MULTI_RETAILER_AVAILABILITY_CONFLICT')
    )),
    sourcePolicyExcludedIds: idsFor(records, (record) => (
      record.excludedBySourcePolicy.observationIds.length > 0
      || record.excludedBySourcePolicy.collectionAttemptIds.length > 0
    )),
  };
}

function expectedCutover(records) {
  const unresolvedLegacyCurrentIds = idsFor(records, (record) => (
    record.priorVisibility === 'CURRENT_OUTPUT'
    && record.lifecycleState !== 'CURRENT_RETAIL'
    && !explicitUnavailable(record)
  ));
  const unsafeRemovedLegacyCurrentIds = idsFor(records, (record) => (
    record.priorVisibility === 'CURRENT_OUTPUT'
    && record.lifecycleState === 'CATALOG_ARCHIVED'
    && !explicitUnavailable(record)
  ));
  return {
    status: unresolvedLegacyCurrentIds.length === 0 && unsafeRemovedLegacyCurrentIds.length === 0
      ? 'READY'
      : 'BLOCKED',
    unresolvedLegacyCurrentIds,
    unsafeRemovedLegacyCurrentIds,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateRetailLifecycleShadow(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.records)) {
    throw new TypeError('retail lifecycle shadow schema v1 required');
  }
  if (document.policyVersion !== 'retail-lifecycle-shadow-v1') {
    throw new TypeError('retail lifecycle shadow policy version unsupported');
  }
  timestamp(document.asOf, 'retail lifecycle shadow asOf');
  for (const field of [
    'publicProjectionSha256',
    'publicProjectionSemanticSha256',
    'retailerLedgerSha256',
    'sourcePolicySha256',
    'releasePolicySha256',
  ]) {
    sha256(document.sourceBindings?.[field], `retail lifecycle shadow ${field}`);
  }
  required(document.releaseEpoch, 'retail lifecycle release epoch');
  const ids = document.records.map((record) => required(record.canonicalProductId, 'shadow canonical product ID'));
  if (new Set(ids).size !== ids.length) throw new TypeError('duplicate shadow canonical product ID');
  const legacyIds = document.records.map((record) => required(record.legacyRuntimeId, 'shadow legacy runtime ID'));
  if (new Set(legacyIds).size !== legacyIds.length) throw new TypeError('duplicate shadow legacy runtime ID');
  if (document.records.some((record, index) => index > 0
    && document.records[index - 1].legacyRuntimeId.localeCompare(record.legacyRuntimeId) > 0)) {
    throw new TypeError('retail lifecycle shadow records must be sorted');
  }
  for (const record of document.records) {
    required(record.legacyRuntimeId, 'shadow legacy runtime ID');
    required(record.category, 'shadow category');
    required(record.brand, 'shadow brand');
    required(record.model, 'shadow model');
    if (!['CURRENT_OUTPUT', 'HISTORICAL_INPUT_ONLY'].includes(record.priorVisibility)) {
      throw new TypeError(`shadow prior visibility unsupported for ${record.legacyRuntimeId}`);
    }
    if (record.priorityClass !== PRIORITY_BY_LIFECYCLE[record.lifecycleState]) {
      throw new TypeError(`shadow lifecycle priority mismatch for ${record.legacyRuntimeId}`);
    }
    if (record.transition !== transition(record.priorVisibility, record.lifecycleState)) {
      throw new TypeError(`shadow transition mismatch for ${record.legacyRuntimeId}`);
    }
    if (record.publicVisibility !== publicVisibility(record.lifecycleState)) {
      throw new TypeError(`shadow public visibility mismatch for ${record.legacyRuntimeId}`);
    }
    if (typeof record.hasReceiptBoundDimensions !== 'boolean'
      || record.replacementEligibility !== (record.hasReceiptBoundDimensions
        ? 'HISTORICAL_LOOKUP'
        : 'IDENTITY_ONLY')) {
      throw new TypeError(`shadow replacement eligibility mismatch for ${record.legacyRuntimeId}`);
    }
    if (record.fitDestination !== (record.lifecycleState === 'CURRENT_RETAIL'
      ? 'CURRENT_FIT_INPUT'
      : 'HISTORICAL_ONLY')) {
      throw new TypeError(`shadow Fit destination mismatch for ${record.legacyRuntimeId}`);
    }
    const decision = record.retailLifecycle;
    if (!decision || decision.schemaVersion !== 1
      || decision.canonicalProductId !== record.canonicalProductId
      || decision.lifecycleState !== record.lifecycleState) {
      throw new TypeError(`shadow lifecycle product binding mismatch for ${record.legacyRuntimeId}`);
    }
    if (decision.policyVersion !== document.retailLifecyclePolicyVersion
      || decision.asOf !== document.asOf) {
      throw new TypeError(`shadow lifecycle policy epoch mismatch for ${record.legacyRuntimeId}`);
    }
    if (!Array.isArray(decision.latestObservations)
      || !Array.isArray(decision.observationConflicts)
      || !Array.isArray(decision.collectionAttempts)
      || !Array.isArray(decision.reasonCodes)) {
      throw new TypeError(`shadow lifecycle evidence collections missing for ${record.legacyRuntimeId}`);
    }
    const excluded = record.excludedBySourcePolicy;
    if (!excluded || !Array.isArray(excluded.observationIds)
      || !Array.isArray(excluded.collectionAttemptIds)) {
      throw new TypeError(`shadow source-policy exclusions missing for ${record.legacyRuntimeId}`);
    }
    assertSortedUnique(excluded.observationIds, `shadow excluded observations ${record.legacyRuntimeId}`);
    assertSortedUnique(
      excluded.collectionAttemptIds,
      `shadow excluded collection attempts ${record.legacyRuntimeId}`,
    );
    if (decision.latestObservations.some((observation) => (
      observation.canonicalProductId !== record.canonicalProductId
    )) || decision.collectionAttempts.some((attempt) => (
      !attempt.canonicalProductIds.includes(record.canonicalProductId)
    ))) {
      throw new TypeError(`shadow lifecycle scoped evidence mismatch for ${record.legacyRuntimeId}`);
    }
    if (record.lifecycleState === 'CURRENT_RETAIL') {
      if (!isCurrentRetailProduct({
        canonicalProductId: record.canonicalProductId,
        retailLifecycle: decision,
      }) || !decision.latestObservations.some((observation) => (
        observation.id === decision.authorizingObservation.id
      ))) {
        throw new TypeError(`shadow current product lacks bound authorizer: ${record.legacyRuntimeId}`);
      }
    } else if (decision.authorizingObservation !== null) {
      throw new TypeError(`shadow non-current product carries authorizer: ${record.legacyRuntimeId}`);
    }
  }
  const cohorts = document.cohorts ?? {};
  for (const [key, values] of Object.entries(cohorts)) {
    assertSortedUnique(values, `shadow cohort ${key}`);
  }
  if (!sameJson(cohorts, expectedCohorts(document.records))) {
    throw new TypeError('retail lifecycle shadow cohort membership mismatch');
  }
  assertSortedUnique(document.cutover?.unresolvedLegacyCurrentIds, 'unresolved legacy current IDs');
  assertSortedUnique(document.cutover?.unsafeRemovedLegacyCurrentIds, 'unsafe removed legacy current IDs');
  if (!sameJson(document.cutover, expectedCutover(document.records))) {
    throw new TypeError('retail lifecycle shadow cutover membership mismatch');
  }
  const expectedSummary = {
    products: document.records.length,
    legacyCurrentProducts: document.records.filter((record) => record.priorVisibility === 'CURRENT_OUTPUT').length,
    byLifecycle: countBy(document.records, (record) => record.lifecycleState),
    byTransition: countBy(document.records, (record) => record.transition),
    byPublicVisibility: countBy(document.records, (record) => record.publicVisibility),
    byPriorityClass: countBy(document.records, (record) => record.priorityClass),
    policyExcludedProducts: document.records.filter((record) => (
      record.excludedBySourcePolicy.observationIds.length > 0
      || record.excludedBySourcePolicy.collectionAttemptIds.length > 0
    )).length,
    policyExcludedObservations: document.records.reduce(
      (sum, record) => sum + record.excludedBySourcePolicy.observationIds.length,
      0,
    ),
    policyExcludedCollectionAttempts: document.records.reduce(
      (sum, record) => sum + record.excludedBySourcePolicy.collectionAttemptIds.length,
      0,
    ),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError('retail lifecycle shadow summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.shadowId !== `retail_lifecycle_shadow_${semantic.slice(0, 24)}`) {
    throw new Error('retail lifecycle shadow integrity mismatch');
  }
  return document;
}

export function buildRetailLifecycleShadow({
  publicProjection,
  publicProjectionSha256,
  retailerLedger,
  retailerLedgerSha256,
  sourcePolicy,
  sourcePolicySha256,
  releasePolicySha256,
  releaseEpoch,
  asOf,
  retailLifecyclePolicyVersion = 'retail-lifecycle-v1',
}) {
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public projection products required');
  }
  validateRetailerObservationLedger(retailerLedger);
  const normalizedSourcePolicy = normalizeRetailerSourcePolicy(sourcePolicy);
  const normalizedAsOf = timestamp(asOf, 'retail lifecycle shadow asOf');
  const observationsByProduct = new Map();
  const excludedObservationsByProduct = new Map();
  for (const observation of retailerLedger.observations) {
    const target = retailerObservationAuthorizedBySourcePolicy(observation, normalizedSourcePolicy)
      ? observationsByProduct
      : excludedObservationsByProduct;
    if (!target.has(observation.canonicalProductId)) {
      target.set(observation.canonicalProductId, []);
    }
    target.get(observation.canonicalProductId).push(observation);
  }
  const attemptsByProduct = new Map();
  const excludedAttemptsByProduct = new Map();
  for (const attempt of retailerLedger.collectionAttempts) {
    const target = retailerCollectionAttemptAuthorizedBySourcePolicy(attempt, normalizedSourcePolicy)
      ? attemptsByProduct
      : excludedAttemptsByProduct;
    for (const canonicalProductId of attempt.canonicalProductIds) {
      if (!target.has(canonicalProductId)) target.set(canonicalProductId, []);
      target.get(canonicalProductId).push(attempt);
    }
  }
  const records = publicProjection.products.map((product) => {
    const canonicalProductId = required(product.canonicalProductId, 'public product canonical ID');
    const legacyRuntimeId = required(product.id, 'public product legacy runtime ID');
    const prior = priorVisibility(product);
    const retailLifecycle = reduceRetailLifecycle({
      canonicalProductId,
      observations: observationsByProduct.get(canonicalProductId) ?? [],
      collectionAttempts: attemptsByProduct.get(canonicalProductId) ?? [],
      asOf: normalizedAsOf,
      policyVersion: retailLifecyclePolicyVersion,
      catalogState: prior === 'CURRENT_OUTPUT' ? 'LISTED_UNVERIFIED' : 'ARCHIVED',
      registryPresent: false,
    });
    const lifecycleState = retailLifecycle.lifecycleState;
    const nextTransition = transition(prior, lifecycleState);
    const dimensionsMm = catalogReceiptDimensions(product);
    return freezeDeep({
      canonicalProductId,
      legacyRuntimeId,
      category: required(product.cat, 'public product category'),
      brand: required(product.brand, 'public product brand'),
      model: required(product.model, 'public product model'),
      priorVisibility: prior,
      lifecycleState,
      transition: nextTransition,
      priorityClass: PRIORITY_BY_LIFECYCLE[lifecycleState],
      publicVisibility: publicVisibility(lifecycleState),
      replacementEligibility: dimensionsMm ? 'HISTORICAL_LOOKUP' : 'IDENTITY_ONLY',
      fitDestination: lifecycleState === 'CURRENT_RETAIL' ? 'CURRENT_FIT_INPUT' : 'HISTORICAL_ONLY',
      hasReceiptBoundDimensions: dimensionsMm !== null,
      retailLifecycle,
      excludedBySourcePolicy: {
        observationIds: (excludedObservationsByProduct.get(canonicalProductId) ?? [])
          .map((observation) => observation.id)
          .sort(),
        collectionAttemptIds: (excludedAttemptsByProduct.get(canonicalProductId) ?? [])
          .map((attempt) => attempt.id)
          .sort(),
      },
    });
  }).sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));

  const cohorts = expectedCohorts(records);
  const cutover = expectedCutover(records);
  const document = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-shadow-v1',
    retailLifecyclePolicyVersion,
    releaseEpoch: required(releaseEpoch, 'retail lifecycle release epoch'),
    asOf: normalizedAsOf,
    sourceBindings: {
      publicProjectionSha256: sha256(publicProjectionSha256, 'public projection SHA-256'),
      publicProjectionSemanticSha256: canonicalSha256(publicProjection),
      retailerLedgerSha256: sha256(retailerLedgerSha256, 'retailer ledger SHA-256'),
      sourcePolicySha256: sha256(sourcePolicySha256, 'retailer source policy SHA-256'),
      releasePolicySha256: sha256(releasePolicySha256, 'retail lifecycle release policy SHA-256'),
      retailerLedgerSemanticSha256: sha256(retailerLedger.semanticSha256, 'retailer ledger semantic SHA-256'),
    },
    records,
    cohorts,
    summary: {
      products: records.length,
      legacyCurrentProducts: records.filter((record) => record.priorVisibility === 'CURRENT_OUTPUT').length,
      byLifecycle: countBy(records, (record) => record.lifecycleState),
      byTransition: countBy(records, (record) => record.transition),
      byPublicVisibility: countBy(records, (record) => record.publicVisibility),
      byPriorityClass: countBy(records, (record) => record.priorityClass),
      policyExcludedProducts: records.filter((record) => (
        record.excludedBySourcePolicy.observationIds.length > 0
        || record.excludedBySourcePolicy.collectionAttemptIds.length > 0
      )).length,
      policyExcludedObservations: records.reduce(
        (sum, record) => sum + record.excludedBySourcePolicy.observationIds.length,
        0,
      ),
      policyExcludedCollectionAttempts: records.reduce(
        (sum, record) => sum + record.excludedBySourcePolicy.collectionAttemptIds.length,
        0,
      ),
    },
    cutover,
  };
  const semantic = canonicalSha256(document);
  document.shadowId = `retail_lifecycle_shadow_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailLifecycleShadow(document));
}

export function applyRetailLifecycleCutover({ publicProjection, publicProjectionSha256, shadow }) {
  validateRetailLifecycleShadow(shadow);
  if (shadow.cutover.status !== 'READY') throw new Error('retail lifecycle cutover is blocked');
  if (sha256(publicProjectionSha256, 'retail lifecycle cutover public projection SHA-256')
    !== shadow.sourceBindings.publicProjectionSha256) {
    throw new Error('retail lifecycle cutover public projection drift');
  }
  if (canonicalSha256(publicProjection) !== shadow.sourceBindings.publicProjectionSemanticSha256) {
    throw new Error('retail lifecycle cutover public projection semantic drift');
  }
  const byLegacyId = new Map(shadow.records.map((record) => [record.legacyRuntimeId, record]));
  if (byLegacyId.size !== publicProjection.products.length) {
    throw new Error('retail lifecycle cutover does not account for every public product');
  }
  const products = publicProjection.products.map((product) => {
    const record = byLegacyId.get(String(product.id));
    if (!record || record.canonicalProductId !== product.canonicalProductId) {
      throw new Error(`retail lifecycle cutover identity drift for ${product.id}`);
    }
    const retailers = record.lifecycleState === 'CURRENT_RETAIL'
      ? projectedCurrentRetailers(product, record)
      : [];
    if (record.lifecycleState === 'CURRENT_RETAIL' && retailers.length === 0) {
      throw new Error(`retail lifecycle cutover current product lacks projected retailer: ${product.id}`);
    }
    return freezeDeep({
      ...structuredClone(product),
      unavailable: record.lifecycleState !== 'CURRENT_RETAIL',
      retailers,
      retailLifecycle: structuredClone(record.retailLifecycle),
      lifecycleVisibility: record.publicVisibility,
    });
  });
  return freezeDeep({
    ...structuredClone(publicProjection),
    products,
    retailLifecycleRelease: {
      shadowId: shadow.shadowId,
      semanticSha256: shadow.semanticSha256,
      asOf: shadow.asOf,
    },
  });
}
