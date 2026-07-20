import { createHash } from 'node:crypto';

import { createObservation } from './retailer-observation.mjs';
import {
  createRetailerObservationsFromSnapshot,
  createRetailerSourceAdapter,
} from './retailer-source-adapter.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const TERMS_REVIEW_STATES = new Set([
  'authorized_partner_feed',
  'collection_blocked',
  'pending_automated_scale_review',
  'reviewed_bounded_exact_product_api',
]);

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
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

function dateToTimestamp(value, label) {
  const date = required(value, label);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf())
    || parsed.toISOString().slice(0, 10) !== date) {
    throw new TypeError(`${label} must be YYYY-MM-DD`);
  }
  return `${date}T00:00:00.000Z`;
}

export function normalizeRetailerSourcePolicy(policy) {
  if (!policy || policy.schemaVersion !== 2 || !Array.isArray(policy.sources)) {
    throw new TypeError('retailer source policy schema v2 required');
  }
  const policyVersion = required(policy.policyVersion, 'retailer source policy version');
  const reviewedAt = required(policy.reviewedAt, 'retailer source policy reviewedAt');
  const ids = new Set();
  const hosts = new Map();
  const sources = policy.sources.map((source) => {
    const adapter = createRetailerSourceAdapter({
      id: source.id,
      retailer: source.retailer,
      sourceType: source.sourceType,
      allowedHosts: source.allowedHosts,
      minimumIntervalMs: source.minimumIntervalMs,
      robotsReviewedAt: reviewedAt,
      termsReviewedAt: reviewedAt,
      policyVersion: `${policyVersion}:${required(source.id, 'retailer source id')}`,
      expectedCadenceHours: source.expectedCadenceHours,
      maximumCurrentAgeHours: source.maximumCurrentAgeHours,
    });
    if (ids.has(adapter.id)) throw new TypeError(`duplicate retailer source ID ${adapter.id}`);
    ids.add(adapter.id);
    const termsReviewState = required(source.termsReviewState, 'retailer terms review state');
    if (!TERMS_REVIEW_STATES.has(termsReviewState)) {
      throw new TypeError(`unsupported retailer terms review state ${termsReviewState}`);
    }
    const normalized = {
      ...adapter,
      host: required(source.host, 'retailer source host').toLowerCase(),
      collectionMode: required(source.collectionMode, 'retailer collection mode'),
      termsReviewState,
      legacyLinkAction: required(source.legacyLinkAction, 'legacy link action'),
      automationControls: source.automationControls == null
        ? null
        : structuredClone(source.automationControls),
    };
    for (const host of normalized.allowedHosts) {
      if (hosts.has(host)) throw new TypeError(`duplicate retailer source host ${host}`);
      hosts.set(host, normalized);
    }
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id));
  return freezeDeep({ schemaVersion: 2, policyVersion, reviewedAt, sources, hosts });
}

function normalizedPolicy(value) {
  return value?.schemaVersion === 2 && value.hosts instanceof Map
    ? value
    : normalizeRetailerSourcePolicy(value);
}

export function retailerObservationAuthorizedBySourcePolicy(value, policy) {
  const observation = createObservation(value);
  if (observation.sourceType === 'legacy_catalog') return true;
  const source = normalizedPolicy(policy).sources.find((row) => row.id === observation.adapterId);
  if (!source || source.termsReviewState === 'collection_blocked') return false;
  if (observation.retailer !== source.retailer
    || observation.sourceType !== source.sourceType
    || observation.policyVersion !== source.policyVersion
    || observation.expectedCadenceHours !== source.expectedCadenceHours
    || observation.maximumCurrentAgeHours !== source.maximumCurrentAgeHours) return false;
  const allowedHosts = new Set(source.allowedHosts);
  return [observation.url, observation.redirectUrl].filter(Boolean)
    .every((url) => allowedHosts.has(new URL(url).hostname.toLowerCase()));
}

export function retailerCollectionAttemptAuthorizedBySourcePolicy(attempt, policy) {
  const source = normalizedPolicy(policy).sources.find((row) => row.id === attempt?.adapterId);
  return Boolean(source)
    && source.termsReviewState !== 'collection_blocked'
    && attempt.retailer === source.retailer
    && attempt.policyVersion === source.policyVersion;
}

function retailerUrl(value) {
  const url = new URL(required(value, 'retailer URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('retailer URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function baselineRows(publicProjection, projectionSha256, normalizedPolicy) {
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public projection products required');
  }
  const rows = [];
  for (const product of publicProjection.products) {
    const canonicalProductId = required(product.canonicalProductId, 'public product canonical ID');
    for (const retailer of product.retailers ?? []) {
      const url = retailerUrl(retailer.url ?? retailer.href ?? retailer.u ?? retailer.link);
      const parsedUrl = new URL(url);
      const sourcePolicy = normalizedPolicy.hosts.get(parsedUrl.hostname.toLowerCase());
      if (!sourcePolicy) throw new TypeError(`unclassified retailer source host ${parsedUrl.hostname}`);
      const retailerName = required(retailer.n ?? retailer.name, 'retailer name');
      const verifiedAt = required(retailer.verified_at, 'legacy retailer verified_at');
      const sourceReference = required(retailer.source ?? 'legacy-catalog', 'legacy source reference');
      const rowBinding = {
        canonicalProductId,
        retailer: retailerName,
        url,
        verifiedAt,
        sourceReference,
        stock: retailer.stock == null ? null : String(retailer.stock),
        retailerProductId: retailer.tgg_sku == null ? null : String(retailer.tgg_sku),
      };
      const seed = `${canonicalProductId}\0${retailerName}\0${String(retailer.url)}\0${verifiedAt}`;
      const observation = createObservation({
        id: `obs_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
        canonicalProductId,
        retailer: retailerName,
        observedAt: dateToTimestamp(verifiedAt, 'legacy retailer verified_at'),
        url,
        availability: 'unknown',
        priceAud: Number.isFinite(retailer.p) ? retailer.p : null,
        title: retailer.feed_title ?? null,
        imageUrl: null,
        retailerProductId: retailer.tgg_sku ?? null,
        sourceType: 'legacy_catalog',
        listingState: 'current',
        sourceReference,
        policyVersion: `${normalizedPolicy.policyVersion}:legacy-link-migration-v1`,
        legacyProjectionBinding: {
          projectionSha256,
          rowSha256: canonicalSha256(rowBinding),
          originSource: sourceReference,
          verifiedAt,
          sourcePolicyId: sourcePolicy.id,
        },
      });
      rows.push({ observation, sourcePolicy });
    }
  }
  rows.sort((left, right) => left.observation.id.localeCompare(right.observation.id));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.observation.id)) throw new TypeError(`duplicate baseline observation ID ${row.observation.id}`);
    ids.add(row.observation.id);
  }
  return rows;
}

function migratedV1Observation(row, normalizedPolicy) {
  const url = retailerUrl(row.url);
  const sourcePolicy = normalizedPolicy.hosts.get(new URL(url).hostname.toLowerCase());
  if (!sourcePolicy) throw new TypeError(`unclassified migrated retailer host ${new URL(url).hostname}`);
  const originSource = required(row.sourceReference ?? 'legacy-ledger-v1', 'legacy observation source');
  const observedAt = new Date(required(row.observedAt, 'legacy observation observedAt'));
  if (Number.isNaN(observedAt.valueOf())) throw new TypeError('legacy observation observedAt must be a timestamp');
  return createObservation({
    id: row.id,
    canonicalProductId: row.canonicalProductId,
    retailer: row.retailer,
    observedAt: observedAt.toISOString(),
    url,
    availability: 'unknown',
    priceAud: row.priceAud ?? null,
    title: row.title ?? null,
    imageUrl: row.imageUrl ?? null,
    retailerProductId: row.retailerProductId ?? null,
    sourceType: 'legacy_catalog',
    listingState: 'current',
    sourceReference: originSource,
    policyVersion: `${normalizedPolicy.policyVersion}:ledger-v1-migration`,
    legacyProjectionBinding: {
      projectionSha256: null,
      rowSha256: canonicalSha256(row),
      originSource,
      verifiedAt: observedAt.toISOString().slice(0, 10),
      sourcePolicyId: sourcePolicy.id,
      migratedFromSchemaVersion: 1,
    },
  });
}

function documentWithoutSemanticHash(document) {
  const { semanticSha256: ignored, ...rest } = document;
  return rest;
}

function normalizedAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('retailer collection attempt must be an object');
  }
  const status = required(value.collectionStatus, 'collection attempt status');
  if (!['succeeded', 'failed'].includes(status)) throw new TypeError(`unsupported collection attempt status ${status}`);
  const observedAt = new Date(required(value.observedAt, 'collection attempt observedAt'));
  if (Number.isNaN(observedAt.valueOf())) throw new TypeError('collection attempt observedAt must be a timestamp');
  const complete = value.complete === true;
  if (status === 'failed' && complete) throw new TypeError('failed collection attempt cannot be complete');
  const rawPayloadSha256 = value.rawPayloadSha256 == null
    ? null
    : sha256(value.rawPayloadSha256, 'collection attempt raw payload SHA-256');
  if (status === 'succeeded' && rawPayloadSha256 == null) {
    throw new TypeError('successful collection attempt requires raw payload SHA-256');
  }
  if (status === 'failed' && !required(value.collectionError, 'failed collection error')) {
    throw new TypeError('failed collection error required');
  }
  if (!Array.isArray(value.canonicalProductIds) || value.canonicalProductIds.length === 0) {
    throw new TypeError('collection attempt canonical product scope required');
  }
  const canonicalProductIds = value.canonicalProductIds
    .map((id) => required(id, 'collection attempt canonical product ID'));
  if (new Set(canonicalProductIds).size !== canonicalProductIds.length) {
    throw new TypeError('collection attempt canonical product scope contains duplicates');
  }
  canonicalProductIds.sort();
  let failureContext = null;
  if (value.failureContext != null) {
    if (status !== 'failed' || rawPayloadSha256 == null || canonicalProductIds.length !== 1) {
      throw new TypeError('failure context must be one failed raw-bound product request');
    }
    const context = value.failureContext;
    if (!['identity_mismatch', 'response_contract_failure'].includes(context.kind)
      || sha256(context.rawPayloadSha256, 'failure context raw payload SHA-256') !== rawPayloadSha256) {
      throw new TypeError('collection attempt failure context invalid');
    }
    if (context.kind === 'identity_mismatch'
      && !['AO_MODEL_MISMATCH', 'AO_URI_MISMATCH'].includes(context.reasonCode)) {
      throw new TypeError('collection attempt identity mismatch context invalid');
    }
    if (context.kind === 'response_contract_failure'
      && context.reasonCode !== 'AO_RESPONSE_CONTRACT_FAILURE') {
      throw new TypeError('collection attempt response contract context invalid');
    }
    const sourceUrl = new URL(required(context.sourceUrl, 'failure context source URL'));
    if (sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) {
      throw new TypeError('failure context URLs must use trusted HTTPS');
    }
    const common = {
      kind: context.kind,
      reasonCode: context.reasonCode,
      baselineLinkId: required(context.baselineLinkId, 'failure context baseline link ID'),
      sourceUrl: sourceUrl.toString(),
      rawPayloadSha256,
    };
    if (context.kind === 'identity_mismatch') {
      const receivedUrl = new URL(required(context.receivedUrl, 'failure context received URL'));
      if (receivedUrl.protocol !== 'https:' || receivedUrl.username || receivedUrl.password) {
        throw new TypeError('failure context URLs must use trusted HTTPS');
      }
      failureContext = {
        ...common,
        expectedModel: required(context.expectedModel, 'failure context expected model'),
        receivedModel: required(context.receivedModel, 'failure context received model'),
        receivedUrl: receivedUrl.toString(),
      };
    } else {
      failureContext = common;
    }
  }
  return {
    id: required(value.id, 'collection attempt ID'),
    adapterId: required(value.adapterId, 'collection attempt adapter ID'),
    retailer: required(value.retailer, 'collection attempt retailer'),
    observedAt: observedAt.toISOString(),
    collectionStatus: status,
    collectionError: status === 'failed' ? String(value.collectionError).trim() : null,
    rawSourceReference: required(value.rawSourceReference, 'collection attempt source reference'),
    rawPayloadSha256,
    policyVersion: required(value.policyVersion, 'collection attempt policy version'),
    complete,
    canonicalProductIds,
    ...(failureContext ? { failureContext } : {}),
  };
}

function validateSortedUnique(values, label) {
  const ids = values.map((value) => required(value.id, `${label} ID`));
  if (new Set(ids).size !== ids.length) throw new TypeError(`duplicate ${label} ID`);
  if (ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError(`${label} must be sorted by ID`);
  }
}

export function validateRetailerObservationLedger(document) {
  if (!document || document.schemaVersion !== 2 || !Array.isArray(document.observations)
    || !Array.isArray(document.collectionAttempts) || !Array.isArray(document.sourceBindings)) {
    throw new TypeError('retailer observation ledger schema v2 required');
  }
  const expected = canonicalSha256(documentWithoutSemanticHash(document));
  if (document.semanticSha256 !== expected) throw new Error('retailer observation ledger integrity mismatch');
  const ids = new Set();
  const normalizedObservations = [];
  for (const value of document.observations) {
    const observation = createObservation(value);
    if (ids.has(observation.id)) throw new TypeError(`duplicate retailer observation ID ${observation.id}`);
    if (observation.sourceType === 'legacy_catalog' && !observation.legacyProjectionBinding) {
      throw new TypeError(`legacy retailer observation ${observation.id} requires projection binding`);
    }
    ids.add(observation.id);
    normalizedObservations.push(observation);
  }
  validateSortedUnique(document.observations, 'retailer observation');
  const attempts = document.collectionAttempts.map(normalizedAttempt);
  validateSortedUnique(attempts, 'retailer collection attempt');
  const sourceBindings = document.sourceBindings.map((binding) => ({
    id: required(binding.id, 'retailer source binding ID'),
    sha256: sha256(binding.sha256, 'retailer source binding SHA-256'),
    kind: required(binding.kind, 'retailer source binding kind'),
  }));
  validateSortedUnique(sourceBindings, 'retailer source binding');
  if (!sourceBindings.some((binding) => binding.kind === 'LEGACY_MIGRATION_INPUT')
    || !sourceBindings.some((binding) => binding.kind === 'POLICY')) {
    throw new TypeError('retailer source bindings require migration input and policy');
  }
  const boundHashes = new Set(sourceBindings.map((binding) => binding.sha256));
  for (const observation of normalizedObservations.filter((row) => row.sourceType !== 'legacy_catalog')) {
    if (!boundHashes.has(observation.rawSourceSha256)) {
      throw new TypeError(`typed retailer observation ${observation.id} lacks immutable source binding`);
    }
  }
  for (const attempt of attempts.filter((row) => row.rawPayloadSha256 != null)) {
    if (!boundHashes.has(attempt.rawPayloadSha256)) {
      throw new TypeError(`raw-bound retailer attempt ${attempt.id} lacks immutable source binding`);
    }
  }
  const summary = {
    observations: normalizedObservations.length,
    currentBaselineObservations: Number(document.summary?.currentBaselineObservations),
    preservedHistoricalObservations: Number(document.summary?.preservedHistoricalObservations),
    legacyUnknownObservations: normalizedObservations.filter((row) => row.sourceType === 'legacy_catalog'
      && row.availability === 'unknown').length,
    authoritativeTypedObservations: normalizedObservations.filter((row) => row.sourceType !== 'legacy_catalog').length,
    collectionAttempts: attempts.length,
    canonicalProducts: new Set(normalizedObservations.map((row) => row.canonicalProductId)).size,
  };
  if (!Number.isInteger(summary.currentBaselineObservations)
    || !Number.isInteger(summary.preservedHistoricalObservations)
    || summary.currentBaselineObservations < 0 || summary.preservedHistoricalObservations < 0
    || summary.currentBaselineObservations + summary.preservedHistoricalObservations !== summary.observations
    || JSON.stringify(document.summary) !== JSON.stringify(summary)) {
    throw new TypeError('retailer observation ledger summary mismatch');
  }
  return document;
}

function normalizeExisting(existingLedger, baselineById, normalizedPolicy) {
  if (existingLedger?.schemaVersion === 2) {
    validateRetailerObservationLedger(existingLedger);
    return {
      observations: existingLedger.observations.map(createObservation),
      collectionAttempts: structuredClone(existingLedger.collectionAttempts),
      sourceBindings: structuredClone(existingLedger.sourceBindings),
    };
  }
  if (existingLedger?.schemaVersion !== 1 || !Array.isArray(existingLedger.observations)) {
    throw new TypeError('existing retailer ledger schema v1 or v2 required');
  }
  const observations = existingLedger.observations.map((row) => (
    baselineById.get(String(row.id)) ?? migratedV1Observation(row, normalizedPolicy)
  ));
  return { observations, collectionAttempts: [], sourceBindings: [] };
}

function collectionAttempt(snapshot) {
  const seed = [snapshot.adapterId, snapshot.observedAt, snapshot.rawSourceReference,
    snapshot.collectionStatus, snapshot.rawPayloadSha256 ?? '',
    ...snapshot.canonicalProductIds].join('\0');
  return {
    id: `retail_attempt_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
    adapterId: required(snapshot.adapterId, 'snapshot adapter ID'),
    retailer: required(snapshot.retailer, 'snapshot retailer'),
    observedAt: required(snapshot.observedAt, 'snapshot observedAt'),
    collectionStatus: required(snapshot.collectionStatus, 'snapshot collection status'),
    collectionError: snapshot.collectionError ?? null,
    rawSourceReference: required(snapshot.rawSourceReference, 'snapshot raw source reference'),
    rawPayloadSha256: snapshot.rawPayloadSha256 ?? null,
    policyVersion: required(snapshot.policyVersion, 'snapshot policy version'),
    complete: snapshot.complete === true,
    canonicalProductIds: [...snapshot.canonicalProductIds],
    ...(snapshot.failureContext ? { failureContext: structuredClone(snapshot.failureContext) } : {}),
  };
}

function assertSnapshotAuthorized(snapshot, normalizedPolicy) {
  const adapterId = required(snapshot.adapterId, 'snapshot adapter ID');
  const source = normalizedPolicy.sources.find((row) => row.id === adapterId);
  if (!source) throw new Error(`snapshot adapter is not registered in source policy: ${adapterId}`);
  if (source.termsReviewState === 'collection_blocked') {
    throw new Error(`snapshot source policy collection blocked: ${adapterId}`);
  }
  const contractFields = [
    ['retailer', source.retailer],
    ['sourceType', source.sourceType],
    ['policyVersion', source.policyVersion],
    ['expectedCadenceHours', source.expectedCadenceHours],
    ['maximumCurrentAgeHours', source.maximumCurrentAgeHours],
  ];
  for (const [field, expected] of contractFields) {
    if (snapshot[field] !== expected) {
      throw new Error(`snapshot source policy contract drift for ${adapterId}: ${field}`);
    }
  }
  const allowedHosts = new Set(source.allowedHosts);
  for (const row of snapshot.rows) {
    for (const value of [row.url, row.redirectUrl].filter(Boolean)) {
      if (!allowedHosts.has(new URL(value).hostname.toLowerCase())) {
        throw new Error(`snapshot URL escapes source policy hosts for ${adapterId}`);
      }
    }
  }
  if (snapshot.failureContext) {
    const contextUrls = [snapshot.failureContext.sourceUrl];
    if (snapshot.failureContext.kind === 'identity_mismatch') {
      contextUrls.push(snapshot.failureContext.receivedUrl);
    }
    for (const value of contextUrls) {
      if (!allowedHosts.has(new URL(value).hostname.toLowerCase())) {
        throw new Error(`snapshot failure URL escapes source policy hosts for ${adapterId}`);
      }
    }
  }
  if (source.collectionMode === 'bounded_exact_product_api'
    && (snapshot.complete === true
      || snapshot.canonicalProductIds.length !== 1
      || snapshot.rows.length > 1)) {
    throw new Error(`snapshot exceeds bounded exact-product source policy for ${adapterId}`);
  }
}

function sameLegacyObservation(left, right) {
  const leftBinding = left.legacyProjectionBinding;
  const rightBinding = right.legacyProjectionBinding;
  if (!leftBinding || !rightBinding || leftBinding.rowSha256 !== rightBinding.rowSha256) return false;
  const omitProjection = (value) => {
    const clone = structuredClone(value);
    delete clone.legacyProjectionBinding.projectionSha256;
    return clone;
  };
  return JSON.stringify(omitProjection(left)) === JSON.stringify(omitProjection(right));
}

function mergeById(existing, incoming, label, equivalent = (left, right) => JSON.stringify(left) === JSON.stringify(right)) {
  const byId = new Map();
  for (const value of [...existing, ...incoming]) {
    const id = required(value.id, `${label} ID`);
    const prior = byId.get(id);
    if (prior && !equivalent(prior, value)) throw new TypeError(`conflicting ${label} ID ${id}`);
    if (!prior) byId.set(id, value);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildRetailerObservationLedger({
  existingLedger,
  publicProjection,
  publicProjectionSha256,
  sourcePolicy,
  sourcePolicySha256,
  typedSnapshots = [],
}) {
  const existingSchemaV2 = existingLedger?.schemaVersion === 2;
  const projectionSha = existingSchemaV2
    ? null
    : sha256(publicProjectionSha256, 'public projection SHA-256');
  const policySha = sha256(sourcePolicySha256, 'retailer source policy SHA-256');
  if (!Array.isArray(typedSnapshots)) throw new TypeError('typed retailer snapshots must be an array');
  const normalizedPolicy = normalizeRetailerSourcePolicy(sourcePolicy);
  for (const snapshot of typedSnapshots) assertSnapshotAuthorized(snapshot, normalizedPolicy);
  const baseline = existingSchemaV2 ? [] : baselineRows(publicProjection, projectionSha, normalizedPolicy);
  const baselineById = new Map(baseline.map((row) => [row.observation.id, row.observation]));
  const existing = normalizeExisting(existingLedger, baselineById, normalizedPolicy);
  const typedObservations = typedSnapshots.flatMap(createRetailerObservationsFromSnapshot);
  const observations = mergeById(
    existing.observations,
    [...baselineById.values(), ...typedObservations],
    'observation',
    (left, right) => JSON.stringify(left) === JSON.stringify(right) || sameLegacyObservation(left, right),
  );
  const attempts = mergeById(
    existing.collectionAttempts,
    typedSnapshots.map(collectionAttempt),
    'collection attempt',
  );
  const sourceBindings = mergeById(existing.sourceBindings, [
    ...(!existingSchemaV2
      ? [{ id: `public-projection:${projectionSha}`, sha256: projectionSha, kind: 'LEGACY_MIGRATION_INPUT' }]
      : []),
    { id: `retailer-source-policy:${policySha}`, sha256: policySha, kind: 'POLICY' },
    ...typedSnapshots
      .filter((snapshot) => snapshot.rawPayloadSha256)
      .map((snapshot) => ({
        id: `retailer-snapshot:${snapshot.adapterId}:${snapshot.observedAt}:${snapshot.rawPayloadSha256}`,
        sha256: sha256(snapshot.rawPayloadSha256, 'retailer snapshot SHA-256'),
        kind: 'IMMUTABLE_RETAILER_SOURCE',
      })),
  ], 'source binding');
  const currentBaselineObservations = existingSchemaV2
    ? existingLedger.summary.currentBaselineObservations
    : baselineById.size;
  const document = {
    schemaVersion: 2,
    ledgerPolicyVersion: 'retailer-observation-ledger-v2',
    sourcePolicyVersion: normalizedPolicy.policyVersion,
    sourceBindings,
    observations,
    collectionAttempts: attempts,
    summary: {
      observations: observations.length,
      currentBaselineObservations,
      preservedHistoricalObservations: observations.length - currentBaselineObservations,
      legacyUnknownObservations: observations.filter((row) => row.sourceType === 'legacy_catalog'
        && row.availability === 'unknown').length,
      authoritativeTypedObservations: observations.filter((row) => row.sourceType !== 'legacy_catalog').length,
      collectionAttempts: attempts.length,
      canonicalProducts: new Set(observations.map((row) => row.canonicalProductId)).size,
    },
  };
  document.semanticSha256 = canonicalSha256(document);
  return freezeDeep(document);
}
