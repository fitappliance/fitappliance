const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_page', 'legacy_catalog']);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);
const TYPED_SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_page']);
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
  const record = {
    id: required(input.id, 'observation id'),
    canonicalProductId: required(input.canonicalProductId, 'canonical product id'),
    retailer: required(input.retailer, 'retailer'),
    adapterId,
    observedAt,
    url: parsedUrl.toString(),
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
  return {
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
  };
}

function listingKey(observation) {
  return [
    observation.adapterId,
    observation.retailerProductId ?? observation.url,
  ].join('\0');
}

function observationStateKey(observation) {
  return `${observation.availability}\0${observation.listingState}\0${observation.url}`;
}

function newestObservations(observations) {
  const grouped = new Map();
  for (const observation of observations) {
    const key = listingKey(observation);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(observation);
  }
  const latest = [];
  const conflicts = [];
  for (const [key, rows] of grouped) {
    rows.sort((left, right) => right.observedAt.localeCompare(left.observedAt)
      || left.id.localeCompare(right.id));
    const newestAt = rows[0].observedAt;
    const tied = rows.filter((row) => row.observedAt === newestAt);
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
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt)
      || left.adapterId.localeCompare(right.adapterId));
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
  const allKnownLatestUnavailable = latestObservations.length > 0
    && latestObservations.every((observation) => observation.freshnessState === 'FRESH'
      && (observation.availability === 'unavailable' || observation.listingState === 'unavailable'));
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
  } else if (catalogState === 'ARCHIVED' || (catalogState !== 'ABSENT' && allKnownLatestUnavailable)) {
    lifecycleState = 'CATALOG_ARCHIVED';
    reasonCodes.push(catalogState === 'ARCHIVED'
      ? 'ARCHIVED_CATALOG_STATE'
      : 'FRESH_UNAVAILABLE_OBSERVATION');
  } else if (catalogState === 'LISTED_UNVERIFIED') {
    lifecycleState = 'UNKNOWN_RETAIL';
    reasonCodes.push('CATALOG_LISTING_WITHOUT_FRESH_AVAILABLE_OBSERVATION');
    if (unavailable.length > 0) reasonCodes.push('UNAVAILABLE_OBSERVATION_WITH_UNRESOLVED_RETAILER_STATE');
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
