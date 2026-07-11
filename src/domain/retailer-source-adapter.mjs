const SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_page']);
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);

function required(value, label) { const result = String(value ?? '').trim(); if (!result) throw new TypeError(`${label} required`); return result; }
function date(value, label) { const result = required(value, label); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new TypeError(`${label} must be YYYY-MM-DD`); return result; }
function freezeDeep(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); } return value; }

export function createRetailerSourceAdapter(input) {
  if (!input || typeof input !== 'object') throw new TypeError('retailer adapter required');
  const sourceType = required(input.sourceType, 'source type');
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`unsupported source type ${sourceType}`);
  if (!Array.isArray(input.allowedHosts) || input.allowedHosts.length === 0) throw new TypeError('allowed hosts required');
  if (!Number.isInteger(input.minimumIntervalMs) || input.minimumIntervalMs < 250) throw new TypeError('minimum interval must be at least 250ms');
  return freezeDeep({
    id: required(input.id, 'adapter id'), retailer: required(input.retailer, 'retailer'), sourceType,
    allowedHosts: [...new Set(input.allowedHosts.map((host) => required(host, 'allowed host').toLowerCase()))],
    minimumIntervalMs: input.minimumIntervalMs,
    robotsReviewedAt: date(input.robotsReviewedAt, 'robots review date'),
    termsReviewedAt: date(input.termsReviewedAt, 'terms review date'),
  });
}

export function normalizeRetailerSnapshot(adapterInput, input) {
  const adapter = createRetailerSourceAdapter(adapterInput);
  if (!input || typeof input !== 'object' || !Array.isArray(input.rows)) throw new TypeError('snapshot rows required');
  const observedAt = new Date(required(input.observedAt, 'observedAt'));
  if (Number.isNaN(observedAt.getTime())) throw new TypeError('observedAt must be a timestamp');
  const failed = Boolean(input.collectionError);
  if (failed && input.rows.length) throw new TypeError('failed snapshot cannot contain inventory rows');
  if (!failed && !/^[a-f0-9]{64}$/.test(String(input.rawPayloadSha256 ?? ''))) throw new TypeError('successful snapshot requires raw payload hash');
  const rows = input.rows.map((row) => {
    const url = new URL(required(row.url, 'retailer product URL'));
    if (!adapter.allowedHosts.includes(url.hostname.toLowerCase())) throw new TypeError(`URL is outside allowed host: ${url.hostname}`);
    const availability = row.availability ?? 'unknown';
    const listingState = row.listingState ?? 'current';
    if (!AVAILABILITY.has(availability)) throw new TypeError(`unsupported availability ${availability}`);
    if (!LISTING_STATES.has(listingState)) throw new TypeError(`unsupported listing state ${listingState}`);
    if (row.priceAud !== null && row.priceAud !== undefined && !(typeof row.priceAud === 'number' && Number.isFinite(row.priceAud) && row.priceAud >= 0)) {
      throw new TypeError('priceAud must be null or a non-negative number');
    }
    return {
      retailerProductId: required(row.retailerProductId, 'retailer product ID'), url: url.toString(),
      title: required(row.title, 'retailer title'), priceAud: row.priceAud ?? null,
      availability, listingState,
    };
  });
  return freezeDeep({
    adapterId: adapter.id, retailer: adapter.retailer, sourceType: adapter.sourceType,
    observedAt: observedAt.toISOString(), complete: input.complete === true,
    collectionStatus: failed ? 'failed' : 'succeeded', collectionError: failed ? required(input.collectionError, 'collection error') : null,
    rawPayloadSha256: input.rawPayloadSha256 ?? null,
    rawSourceReference: required(input.rawSourceReference, 'raw source reference'), rows,
  });
}

export function deriveListingTransitions(existing, snapshot) {
  if (!Array.isArray(existing)) throw new TypeError('existing listings must be an array');
  if (snapshot?.collectionStatus !== 'succeeded' || snapshot.complete !== true) return freezeDeep([]);
  const prior = new Map(existing.map((row) => [required(row.retailerProductId, 'retailer product ID'), row.listingState ?? 'current']));
  const currentIds = new Set(snapshot.rows.map((row) => row.retailerProductId));
  const transitions = [];
  for (const [retailerProductId, state] of prior) {
    if (!currentIds.has(retailerProductId) && state === 'current') transitions.push({ retailerProductId, from: state, to: 'stale', observedAt: snapshot.observedAt });
  }
  for (const retailerProductId of currentIds) {
    const state = prior.get(retailerProductId);
    if (state === 'stale' || state === 'unavailable') transitions.push({ retailerProductId, from: state, to: 'relisted', observedAt: snapshot.observedAt });
  }
  return freezeDeep(transitions.sort((left, right) => left.retailerProductId.localeCompare(right.retailerProductId)));
}
