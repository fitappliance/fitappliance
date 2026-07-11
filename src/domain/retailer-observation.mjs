const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_page', 'legacy_catalog']);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);

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

export function createObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('observation must be an object');
  const observedAt = required(input.observedAt, 'observedAt');
  if (Number.isNaN(Date.parse(observedAt))) throw new TypeError('observedAt must be an ISO timestamp');
  const availability = required(input.availability, 'availability');
  if (!AVAILABILITY.has(availability)) throw new TypeError(`unsupported availability ${availability}`);
  const sourceType = required(input.sourceType, 'sourceType');
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`unsupported source type ${sourceType}`);
  const listingState = input.listingState ?? 'current';
  if (!LISTING_STATES.has(listingState)) throw new TypeError(`unsupported listing state ${listingState}`);
  const url = required(input.url, 'url');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') throw new TypeError('retailer URL must use HTTPS');
  if (input.priceAud !== null && input.priceAud !== undefined && !(Number.isFinite(input.priceAud) && input.priceAud >= 0)) {
    throw new TypeError('priceAud must be null or a non-negative number');
  }
  const record = {
    id: required(input.id, 'observation id'),
    canonicalProductId: required(input.canonicalProductId, 'canonical product id'),
    retailer: required(input.retailer, 'retailer'),
    observedAt: new Date(observedAt).toISOString(),
    url,
    availability,
    priceAud: input.priceAud ?? null,
    title: input.title ? String(input.title).trim() : null,
    imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
    retailerProductId: input.retailerProductId ? String(input.retailerProductId).trim() : null,
    sourceType,
    listingState,
    sourceReference: required(input.sourceReference, 'sourceReference'),
    rawSourceSha256: input.rawSourceSha256 ?? null,
  };
  if (input.dimensionHint) {
    record.dimensionHint = { ...input.dimensionHint };
    record.dimensionHintTrust = 'retailer_hint';
  }
  return freezeDeep(record);
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
