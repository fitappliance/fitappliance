import { createHash } from 'node:crypto';

import { createObservation } from './retailer-observation.mjs';

const SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_page']);
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);

function required(value, label) { const result = String(value ?? '').trim(); if (!result) throw new TypeError(`${label} required`); return result; }
function date(value, label) { const result = required(value, label); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new TypeError(`${label} must be YYYY-MM-DD`); return result; }
function freezeDeep(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); } return value; }
function positiveHours(value, label) { const result = Number(value); if (!Number.isInteger(result) || result <= 0) throw new TypeError(`${label} must be a positive integer`); return result; }

export function createRetailerSourceAdapter(input) {
  if (!input || typeof input !== 'object') throw new TypeError('retailer adapter required');
  const sourceType = required(input.sourceType, 'source type');
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`unsupported source type ${sourceType}`);
  if (!Array.isArray(input.allowedHosts) || input.allowedHosts.length === 0) throw new TypeError('allowed hosts required');
  if (!Number.isInteger(input.minimumIntervalMs) || input.minimumIntervalMs < 250) throw new TypeError('minimum interval must be at least 250ms');
  const expectedCadenceHours = positiveHours(input.expectedCadenceHours, 'expected cadence hours');
  const maximumCurrentAgeHours = positiveHours(input.maximumCurrentAgeHours, 'maximum current age hours');
  if (maximumCurrentAgeHours < expectedCadenceHours) {
    throw new TypeError('maximum current age hours cannot be shorter than expected cadence hours');
  }
  return freezeDeep({
    id: required(input.id, 'adapter id'), retailer: required(input.retailer, 'retailer'), sourceType,
    allowedHosts: [...new Set(input.allowedHosts.map((host) => required(host, 'allowed host').toLowerCase()))].sort(),
    minimumIntervalMs: input.minimumIntervalMs,
    robotsReviewedAt: date(input.robotsReviewedAt, 'robots review date'),
    termsReviewedAt: date(input.termsReviewedAt, 'terms review date'),
    policyVersion: required(input.policyVersion, 'policy version'),
    expectedCadenceHours,
    maximumCurrentAgeHours,
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
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new TypeError('retailer product URL must use trusted HTTPS');
    }
    if (!adapter.allowedHosts.includes(url.hostname.toLowerCase())) throw new TypeError(`URL is outside allowed host: ${url.hostname}`);
    const availability = row.availability ?? 'unknown';
    const listingState = row.listingState ?? 'current';
    if (!AVAILABILITY.has(availability)) throw new TypeError(`unsupported availability ${availability}`);
    if (!LISTING_STATES.has(listingState)) throw new TypeError(`unsupported listing state ${listingState}`);
    if (row.priceAud !== null && row.priceAud !== undefined && !(typeof row.priceAud === 'number' && Number.isFinite(row.priceAud) && row.priceAud >= 0)) {
      throw new TypeError('priceAud must be null or a non-negative number');
    }
    return {
      canonicalProductId: required(row.canonicalProductId, 'canonical product ID'),
      retailerProductId: required(row.retailerProductId, 'retailer product ID'), url: url.toString(),
      title: required(row.title, 'retailer title'), priceAud: row.priceAud ?? null,
      imageUrl: row.imageUrl ? String(row.imageUrl).trim() : null,
      availability, listingState,
    };
  });
  return freezeDeep({
    adapterId: adapter.id, retailer: adapter.retailer, sourceType: adapter.sourceType,
    policyVersion: adapter.policyVersion,
    expectedCadenceHours: adapter.expectedCadenceHours,
    maximumCurrentAgeHours: adapter.maximumCurrentAgeHours,
    observedAt: observedAt.toISOString(), complete: input.complete === true,
    collectionStatus: failed ? 'failed' : 'succeeded', collectionError: failed ? required(input.collectionError, 'collection error') : null,
    rawPayloadSha256: input.rawPayloadSha256 ?? null,
    rawSourceReference: required(input.rawSourceReference, 'raw source reference'), rows,
  });
}

export function createRetailerObservationsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.rows)) {
    throw new TypeError('normalized retailer snapshot required');
  }
  if (snapshot.collectionStatus === 'failed') return freezeDeep([]);
  if (snapshot.collectionStatus !== 'succeeded') throw new TypeError('retailer snapshot collection status unsupported');
  if (!/^[a-f0-9]{64}$/.test(String(snapshot.rawPayloadSha256 ?? ''))) {
    throw new TypeError('successful retailer snapshot raw payload SHA-256 required');
  }
  const observations = snapshot.rows.map((row) => {
    const seed = [
      snapshot.adapterId,
      row.canonicalProductId,
      row.retailerProductId,
      row.url,
      snapshot.observedAt,
      row.availability,
      row.listingState,
    ].join('\0');
    return createObservation({
      id: `obs_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
      canonicalProductId: row.canonicalProductId,
      retailer: snapshot.retailer,
      adapterId: snapshot.adapterId,
      observedAt: snapshot.observedAt,
      url: row.url,
      availability: row.availability,
      priceAud: row.priceAud,
      title: row.title,
      imageUrl: row.imageUrl,
      retailerProductId: row.retailerProductId,
      sourceType: snapshot.sourceType,
      listingState: row.listingState,
      sourceReference: snapshot.rawSourceReference,
      rawSourceSha256: snapshot.rawPayloadSha256,
      policyVersion: snapshot.policyVersion,
      expectedCadenceHours: snapshot.expectedCadenceHours,
      maximumCurrentAgeHours: snapshot.maximumCurrentAgeHours,
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
  return freezeDeep(observations);
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
