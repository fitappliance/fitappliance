import { createHash } from 'node:crypto';

const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const SOURCE_TYPES = new Set([
  'affiliate_feed',
  'public_retailer_api',
  'public_retailer_page',
  'legacy_catalog',
]);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);
const TYPED_SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_api', 'public_retailer_page']);
const CATALOG_STATES = new Set(['LISTED_UNVERIFIED', 'ARCHIVED', 'ABSENT']);

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function positiveHours(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

function timestamp(value, label) {
  const text = required(value, label);
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return date.toISOString();
}

function sha256(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} must be a raw source SHA-256`);
  return normalized;
}

function calendarDate(value, label) {
  const text = required(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TypeError(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new TypeError(`${label} must be a real calendar date`);
  }
  return text;
}

function normalizeLegacyProjectionBinding(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('legacy projection binding must be an object');
  }
  const migratedFromSchemaVersion = input.migratedFromSchemaVersion == null
    ? null
    : Number(input.migratedFromSchemaVersion);
  if (migratedFromSchemaVersion != null
    && (!Number.isInteger(migratedFromSchemaVersion) || migratedFromSchemaVersion < 1)) {
    throw new TypeError('migrated schema version must be a positive integer');
  }
  return {
    projectionSha256: input.projectionSha256 == null
      ? null
      : sha256(input.projectionSha256, 'legacy projection SHA-256'),
    rowSha256: sha256(input.rowSha256, 'legacy projection row SHA-256'),
    originSource: required(input.originSource, 'legacy projection origin source'),
    verifiedAt: calendarDate(input.verifiedAt, 'legacy projection verifiedAt'),
    sourcePolicyId: required(input.sourcePolicyId, 'legacy projection source policy id'),
    ...(migratedFromSchemaVersion == null ? {} : { migratedFromSchemaVersion }),
  };
}

export function createObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('observation must be an object');
  const observedAt = timestamp(input.observedAt, 'observedAt');
  const availability = required(input.availability, 'availability');
  if (!AVAILABILITY.has(availability)) throw new TypeError(`unsupported availability ${availability}`);
  const sourceType = required(input.sourceType, 'sourceType');
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`unsupported source type ${sourceType}`);
  const listingState = input.listingState ?? 'current';
  if (!LISTING_STATES.has(listingState)) throw new TypeError(`unsupported listing state ${listingState}`);
  const url = required(input.url, 'url');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new TypeError('retailer URL must use trusted HTTPS');
  }
  if (input.priceAud !== null && input.priceAud !== undefined && !(Number.isFinite(input.priceAud) && input.priceAud >= 0)) {
    throw new TypeError('priceAud must be null or a non-negative number');
  }
  const policyVersion = required(input.policyVersion, 'policy version');
  const typedSource = TYPED_SOURCE_TYPES.has(sourceType);
  const adapterId = typedSource ? required(input.adapterId, 'adapter id') : null;
  const expectedCadenceHours = typedSource
    ? positiveHours(input.expectedCadenceHours, 'expected cadence hours')
    : null;
  const maximumCurrentAgeHours = typedSource
    ? positiveHours(input.maximumCurrentAgeHours, 'maximum current age hours')
    : null;
  if (typedSource && maximumCurrentAgeHours < expectedCadenceHours) {
    throw new TypeError('maximum current age hours cannot be shorter than expected cadence hours');
  }
  if (listingState === 'unavailable' && availability !== 'unavailable') {
    throw new TypeError('availability conflicts with unavailable listing state');
  }
  if (!typedSource && availability !== 'unknown') {
    throw new TypeError('legacy catalogue observations must keep availability unknown');
  }
  let redirectUrl = null;
  if (listingState === 'redirected') {
    const parsedRedirect = new URL(required(input.redirectUrl, 'redirect destination'));
    if (parsedRedirect.protocol !== 'https:' || parsedRedirect.username || parsedRedirect.password) {
      throw new TypeError('redirect destination must use trusted HTTPS');
    }
    parsedRedirect.hash = '';
    redirectUrl = parsedRedirect.toString();
  } else if (input.redirectUrl != null) {
    throw new TypeError('redirect destination requires redirected listing state');
  }
  if (typedSource && input.legacyProjectionBinding != null) {
    throw new TypeError('typed retailer observations cannot carry a legacy projection binding');
  }
  const record = {
    id: required(input.id, 'observation id'),
    canonicalProductId: required(input.canonicalProductId, 'canonical product id'),
    retailer: required(input.retailer, 'retailer'),
    adapterId,
    observedAt,
    url: parsedUrl.toString(),
    redirectUrl,
    availability,
    priceAud: input.priceAud ?? null,
    title: input.title ? String(input.title).trim() : null,
    imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
    retailerProductId: input.retailerProductId ? String(input.retailerProductId).trim() : null,
    sourceType,
    listingState,
    sourceReference: required(input.sourceReference, 'sourceReference'),
    rawSourceSha256: typedSource ? sha256(input.rawSourceSha256, 'raw source SHA-256') : null,
    policyVersion,
    expectedCadenceHours,
    maximumCurrentAgeHours,
    legacyProjectionBinding: typedSource
      ? null
      : normalizeLegacyProjectionBinding(input.legacyProjectionBinding),
  };
  if (input.dimensionHint) {
    record.dimensionHint = { ...input.dimensionHint };
    record.dimensionHintTrust = 'retailer_hint';
  }
  return freezeDeep(record);
}

function normalizeCollectionAttempt(input, asOfMs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('collection attempt must be an object');
  }
  const observedAt = timestamp(input.observedAt, 'collection attempt observedAt');
  if (new Date(observedAt).valueOf() > asOfMs) throw new Error('collection attempt is after release asOf');
  const collectionStatus = required(input.collectionStatus, 'collection status');
  if (!['succeeded', 'failed'].includes(collectionStatus)) throw new TypeError('collection status unsupported');
  if (collectionStatus === 'succeeded' && input.rawPayloadSha256 == null) {
    throw new TypeError('successful collection requires raw payload SHA-256');
  }
  if (collectionStatus === 'failed' && input.complete === true) {
    throw new TypeError('failed collection cannot be complete');
  }
  if (!Array.isArray(input.canonicalProductIds) || input.canonicalProductIds.length === 0) {
    throw new TypeError('collection attempt canonical product scope required');
  }
  const canonicalProductIds = input.canonicalProductIds
    .map((id) => required(id, 'collection attempt canonical product ID'));
  if (new Set(canonicalProductIds).size !== canonicalProductIds.length) {
    throw new TypeError('collection attempt canonical product scope contains duplicates');
  }
  canonicalProductIds.sort();
  const normalized = {
    id: input.id == null ? null : required(input.id, 'collection attempt id'),
    adapterId: required(input.adapterId, 'collection adapter id'),
    retailer: required(input.retailer, 'collection retailer'),
    observedAt,
    collectionStatus,
    collectionError: collectionStatus === 'failed'
      ? required(input.collectionError, 'collection error')
      : null,
    rawSourceReference: required(input.rawSourceReference, 'collection raw source reference'),
    rawPayloadSha256: input.rawPayloadSha256 == null
      ? null
      : sha256(input.rawPayloadSha256, 'collection raw payload SHA-256'),
    policyVersion: required(input.policyVersion, 'collection policy version'),
    complete: input.complete === true,
    canonicalProductIds,
  };
  if (normalized.id == null) {
    const seed = [
      normalized.adapterId,
      normalized.retailer,
      normalized.observedAt,
      normalized.collectionStatus,
      normalized.rawSourceReference,
      normalized.rawPayloadSha256 ?? '',
      normalized.policyVersion,
      normalized.complete ? 'complete' : 'partial',
      ...normalized.canonicalProductIds,
    ].join('\0');
    normalized.id = `retail_attempt_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
  }
  return normalized;
}

function productBoundCollectionAttempt(attempt, canonicalProductId) {
  const { canonicalProductIds, ...evidence } = attempt;
  return {
    ...evidence,
    scope: {
      canonicalProductId,
      canonicalProductCount: canonicalProductIds.length,
      canonicalProductIdsSha256: createHash('sha256')
        .update(JSON.stringify(canonicalProductIds))
        .digest('hex'),
    },
  };
}

function listingAliases(observation) {
  const retailer = observation.retailer.trim().toLowerCase();
  return [
    `${retailer}\0url\0${observation.url}`,
    ...(observation.retailerProductId
      ? [`${retailer}\0retailer-product-id\0${observation.retailerProductId}`]
      : []),
  ];
}

function observationStateKey(observation) {
  return `${observation.availability}\0${observation.listingState}\0${observation.redirectUrl ?? ''}`;
}

function expectedListingKey(observation) {
  return `${observation.retailer.trim().toLowerCase()}\0${observation.url}`;
}

function newestObservations(observations) {
  const rows = [...observations].sort((left, right) => left.id.localeCompare(right.id));
  const parent = rows.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const aliasOwner = new Map();
  rows.forEach((observation, index) => {
    for (const alias of listingAliases(observation)) {
      if (aliasOwner.has(alias)) union(index, aliasOwner.get(alias));
      else aliasOwner.set(alias, index);
    }
  });
  const grouped = new Map();
  rows.forEach((observation, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(observation);
  });
  const listingGroups = [...grouped.values()].map((groupRows) => ({
    key: groupRows.flatMap(listingAliases).sort()[0],
    rows: groupRows,
  })).sort((left, right) => left.key.localeCompare(right.key));
  const latest = [];
  const conflicts = [];
  for (const { key, rows: groupRows } of listingGroups) {
    groupRows.sort((left, right) => right.observedAt.localeCompare(left.observedAt)
      || left.id.localeCompare(right.id));
    const newestAt = groupRows[0].observedAt;
    const tied = groupRows.filter((row) => row.observedAt === newestAt);
    if (new Set(tied.map(observationStateKey)).size > 1) {
      conflicts.push({ listingKey: key, observedAt: newestAt, observationIds: tied.map((row) => row.id).sort() });
      continue;
    }
    latest.push(tied[0]);
  }
  return {
    latest: latest.sort((left, right) => left.retailer.localeCompare(right.retailer)
      || left.observedAt.localeCompare(right.observedAt)
      || left.id.localeCompare(right.id)),
    conflicts: conflicts.sort((left, right) => left.listingKey.localeCompare(right.listingKey)),
  };
}

export function reduceRetailLifecycle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('retail lifecycle input must be an object');
  }
  const canonicalProductId = required(input.canonicalProductId, 'canonical product id');
  const asOf = timestamp(input.asOf, 'release asOf');
  const asOfMs = new Date(asOf).valueOf();
  const policyVersion = required(input.policyVersion, 'retail lifecycle policy version');
  const catalogState = required(input.catalogState, 'catalog state');
  if (!CATALOG_STATES.has(catalogState)) throw new TypeError(`unsupported catalog state ${catalogState}`);
  if (typeof input.registryPresent !== 'boolean') throw new TypeError('registryPresent must be boolean');
  if (!Array.isArray(input.observations) || !Array.isArray(input.collectionAttempts ?? [])) {
    throw new TypeError('retail observations and collection attempts must be arrays');
  }
  const observations = input.observations
    .filter((observation) => observation?.canonicalProductId === canonicalProductId)
    .map(createObservation);
  const observationIds = new Set();
  for (const observation of observations) {
    if (observationIds.has(observation.id)) {
      throw new TypeError(`duplicate retailer observation ID ${observation.id}`);
    }
    observationIds.add(observation.id);
    if (new Date(observation.observedAt).valueOf() > asOfMs) {
      throw new Error(`retailer observation ${observation.id} is after release asOf`);
    }
  }
  const collectionAttempts = (input.collectionAttempts ?? [])
    .map((attempt) => normalizeCollectionAttempt(attempt, asOfMs))
    .filter((attempt) => attempt.canonicalProductIds.includes(canonicalProductId))
    .map((attempt) => productBoundCollectionAttempt(attempt, canonicalProductId))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt)
      || left.adapterId.localeCompare(right.adapterId)
      || left.id.localeCompare(right.id));
  const authoritative = observations.filter((observation) => TYPED_SOURCE_TYPES.has(observation.sourceType));
  const { latest, conflicts } = newestObservations(authoritative);
  const latestObservations = latest.map((observation) => {
    const ageHours = (asOfMs - new Date(observation.observedAt).valueOf()) / 3_600_000;
    return {
      ...observation,
      ageHours,
      freshnessState: ageHours <= observation.maximumCurrentAgeHours ? 'FRESH' : 'STALE',
    };
  });
  const fresh = latestObservations.filter((observation) => observation.freshnessState === 'FRESH');
  const available = fresh.filter((observation) => observation.availability === 'available'
    && ['current', 'relisted'].includes(observation.listingState));
  const unavailable = fresh.filter((observation) => observation.availability === 'unavailable'
    || observation.listingState === 'unavailable');
  const migratedExpectedListings = new Set(observations
    .filter((observation) => observation.sourceType === 'legacy_catalog')
    .map(expectedListingKey));
  const expectedListings = migratedExpectedListings.size > 0
    ? migratedExpectedListings
    : new Set(latestObservations.map(expectedListingKey));
  const freshUnavailableListings = new Set(unavailable.map(expectedListingKey));
  const unresolvedExpectedListings = [...expectedListings]
    .filter((key) => !freshUnavailableListings.has(key))
    .sort();
  const allExpectedLatestUnavailable = expectedListings.size > 0
    && unresolvedExpectedListings.length === 0;
  const reasonCodes = [];
  if (observations.some((observation) => observation.sourceType === 'legacy_catalog')) {
    reasonCodes.push('LEGACY_OBSERVATION_NON_AUTHORITATIVE');
  }
  if (latestObservations.some((observation) => observation.freshnessState === 'STALE')) {
    reasonCodes.push('LATEST_OBSERVATION_STALE');
  }
  if (collectionAttempts.some((attempt) => attempt.collectionStatus === 'failed')) {
    reasonCodes.push('COLLECTION_FAILURE_RETAINED');
  }
  if (conflicts.length > 0) reasonCodes.push('SAME_LISTING_SAME_INSTANT_CONFLICT');

  let lifecycleState;
  let authorizingObservation = null;
  if (available.length > 0) {
    available.sort((left, right) => right.observedAt.localeCompare(left.observedAt)
      || left.retailer.localeCompare(right.retailer)
      || left.id.localeCompare(right.id));
    authorizingObservation = available[0];
    lifecycleState = 'CURRENT_RETAIL';
    reasonCodes.push(authorizingObservation.listingState === 'relisted'
      ? 'FRESH_RELISTED_AVAILABLE_OBSERVATION'
      : 'FRESH_AVAILABLE_OBSERVATION');
    if (unavailable.length > 0) reasonCodes.push('MULTI_RETAILER_AVAILABILITY_CONFLICT');
  } else if (conflicts.length > 0) {
    lifecycleState = 'UNKNOWN_RETAIL';
  } else if (catalogState === 'ARCHIVED' || (catalogState !== 'ABSENT' && allExpectedLatestUnavailable)) {
    lifecycleState = 'CATALOG_ARCHIVED';
    reasonCodes.push(catalogState === 'ARCHIVED'
      ? 'ARCHIVED_CATALOG_STATE'
      : 'FRESH_UNAVAILABLE_OBSERVATION');
  } else if (catalogState === 'LISTED_UNVERIFIED') {
    lifecycleState = 'UNKNOWN_RETAIL';
    reasonCodes.push('CATALOG_LISTING_WITHOUT_FRESH_AVAILABLE_OBSERVATION');
    if (unavailable.length > 0) {
      reasonCodes.push('UNAVAILABLE_OBSERVATION_WITH_UNRESOLVED_RETAILER_STATE');
      if (unresolvedExpectedListings.length > 0) {
        reasonCodes.push('UNRESOLVED_EXPECTED_RETAILER_LISTING');
      }
    }
  } else if (input.registryPresent) {
    lifecycleState = 'REGISTRY_ONLY';
    reasonCodes.push('REGISTRY_IDENTITY_WITHOUT_RETAIL_STATE');
  } else {
    lifecycleState = 'UNKNOWN_RETAIL';
    reasonCodes.push('NO_AUTHORITATIVE_RETAIL_STATE');
  }

  return freezeDeep({
    schemaVersion: 1,
    policyVersion,
    asOf,
    canonicalProductId,
    catalogState,
    lifecycleState,
    authorizingObservation,
    latestObservations,
    observationConflicts: conflicts,
    collectionAttempts,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  });
}

export function reconcileObservations(existing, incoming, { collectionSucceeded, failureReason = null }) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) throw new TypeError('observation collections must be arrays');
  const byId = new Map(existing.map((row) => {
    const normalized = createObservation(row);
    return [normalized.id, normalized];
  }));
  if (collectionSucceeded) {
    for (const row of incoming) {
      const normalized = createObservation(row);
      const prior = byId.get(normalized.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(normalized)) {
        throw new TypeError(`conflicting observation ID ${normalized.id}`);
      }
      byId.set(normalized.id, normalized);
    }
  }
  return freezeDeep({
    observations: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    delta: {
      collectionStatus: collectionSucceeded ? 'succeeded' : 'failed',
      accepted: collectionSucceeded ? incoming.length : 0,
      retainedHistory: existing.length,
      synthesizedUnavailable: 0,
      failureReason: collectionSucceeded ? null : required(failureReason, 'failureReason'),
    },
  });
}
