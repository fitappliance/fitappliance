import { createHash } from 'node:crypto';

import { createObservation } from './retailer-observation.mjs';

const SOURCE_TYPES = new Set(['affiliate_feed', 'public_retailer_api', 'public_retailer_page']);
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const LISTING_STATES = new Set(['current', 'stale', 'unavailable', 'redirected', 'relisted']);
const SHA256 = /^[a-f0-9]{64}$/;
const BASELINE_LINK_ID = /^retail_link_[a-f0-9]{24}$/;

function required(value, label) { const result = String(value ?? '').trim(); if (!result) throw new TypeError(`${label} required`); return result; }
function date(value, label) {
  const result = required(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new TypeError(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new TypeError(`${label} must be a real calendar date`);
  }
  return result;
}
function freezeDeep(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); } return value; }
function positiveHours(value, label) { const result = Number(value); if (!Number.isInteger(result) || result <= 0) throw new TypeError(`${label} must be a positive integer`); return result; }
function optionalSha256(value, label) {
  if (value == null) return null;
  const result = String(value).trim().toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} invalid`);
  return result;
}

function canonicalProductScope(value, rows) {
  const source = value == null ? rows.map((row) => row.canonicalProductId) : value;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError('retailer snapshot canonical product scope required');
  }
  const normalized = source.map((id) => required(id, 'snapshot canonical product ID'));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('retailer snapshot canonical product scope contains duplicates');
  }
  const result = normalized.sort();
  const scoped = new Set(result);
  for (const row of rows) {
    if (!scoped.has(row.canonicalProductId)) {
      throw new TypeError(`retailer row is outside canonical product scope: ${row.canonicalProductId}`);
    }
  }
  return result;
}

function trustedRetailerUrl(value, adapter, label) {
  const url = new URL(required(value, label));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  if (!adapter.allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new TypeError(`URL is outside allowed host: ${url.hostname}`);
  }
  url.hash = '';
  return url.toString();
}

function rawSourceReference(value, sourceType) {
  const result = required(value, 'raw source reference');
  if (sourceType === 'affiliate_feed' && /^[a-z][a-z0-9+.-]*:\/\//i.test(result)) {
    throw new TypeError('affiliate feed requires an opaque source reference');
  }
  return result;
}

function normalizeListingReconciliations(input, {
  adapter,
  complete,
  failed,
  rawPayloadSha256,
  canonicalProductIds,
}) {
  const values = input ?? [];
  if (!Array.isArray(values)) throw new TypeError('snapshot listing reconciliations must be an array');
  if (values.length && (failed || !complete)) {
    throw new TypeError('listing reconciliations require a complete snapshot');
  }
  const scope = new Set(canonicalProductIds);
  const result = values.map((value) => {
    if (!['identity_mismatch', 'source_absent'].includes(value?.kind)) {
      throw new TypeError('snapshot listing reconciliation kind invalid');
    }
    const expectedReasonCode = value.kind === 'identity_mismatch'
      ? 'PARTNERIZE_RETAILER_PRODUCT_IDENTITY_MISMATCH'
      : 'PARTNERIZE_LISTING_ABSENT_FROM_COMPLETE_AFFILIATE_FEED';
    if (value.reasonCode !== expectedReasonCode) {
      throw new TypeError('snapshot listing reconciliation reason invalid');
    }
    const baselineLinkId = required(value.baselineLinkId, 'listing quarantine baseline link ID');
    if (!BASELINE_LINK_ID.test(baselineLinkId)) {
      throw new TypeError('listing reconciliation baseline link ID invalid');
    }
    const canonicalProductId = required(value.canonicalProductId, 'listing quarantine canonical product ID');
    if (!scope.has(canonicalProductId)) {
      throw new TypeError('listing reconciliation canonical product is outside snapshot scope');
    }
    const quarantineHash = optionalSha256(
      value.rawPayloadSha256,
      'listing reconciliation raw payload hash',
    );
    if (quarantineHash !== rawPayloadSha256) {
      throw new TypeError('listing reconciliation raw payload hash mismatch');
    }
    const common = {
      kind: value.kind,
      reasonCode: expectedReasonCode,
      baselineLinkId,
      canonicalProductId,
      sourceUrl: trustedRetailerUrl(value.sourceUrl, adapter, 'listing reconciliation source URL'),
      expectedModel: required(value.expectedModel, 'listing reconciliation expected model'),
      rawPayloadSha256: quarantineHash,
    };
    if (value.kind === 'source_absent') {
      return {
        ...common,
        retailerProductId: value.retailerProductId == null
          ? null
          : required(value.retailerProductId, 'listing reconciliation retailer product ID'),
      };
    }
    return {
      ...common,
      receivedModel: required(value.receivedModel, 'listing reconciliation received model'),
      receivedUrl: trustedRetailerUrl(
        value.receivedUrl,
        adapter,
        'listing reconciliation received URL',
      ),
    };
  }).sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  if (new Set(result.map((value) => value.baselineLinkId)).size !== result.length) {
    throw new TypeError('snapshot listing reconciliations contain duplicate baseline links');
  }
  return result;
}

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
  if (!failed && !SHA256.test(String(input.rawPayloadSha256 ?? ''))) throw new TypeError('successful snapshot requires raw payload hash');
  const rows = input.rows.map((row) => {
    const url = trustedRetailerUrl(row.url, adapter, 'retailer product URL');
    const availability = row.availability ?? 'unknown';
    const listingState = row.listingState ?? 'current';
    if (!AVAILABILITY.has(availability)) throw new TypeError(`unsupported availability ${availability}`);
    if (!LISTING_STATES.has(listingState)) throw new TypeError(`unsupported listing state ${listingState}`);
    const redirectUrl = listingState === 'redirected'
      ? trustedRetailerUrl(row.redirectUrl, adapter, 'redirect destination')
      : null;
    if (listingState !== 'redirected' && row.redirectUrl != null) {
      throw new TypeError('redirect destination requires redirected listing state');
    }
    if (row.priceAud !== null && row.priceAud !== undefined && !(typeof row.priceAud === 'number' && Number.isFinite(row.priceAud) && row.priceAud >= 0)) {
      throw new TypeError('priceAud must be null or a non-negative number');
    }
    return {
      canonicalProductId: required(row.canonicalProductId, 'canonical product ID'),
      retailerProductId: required(row.retailerProductId, 'retailer product ID'), url,
      redirectUrl,
      title: required(row.title, 'retailer title'), priceAud: row.priceAud ?? null,
      imageUrl: row.imageUrl ? String(row.imageUrl).trim() : null,
      availability, listingState,
    };
  });
  const canonicalProductIds = canonicalProductScope(input.canonicalProductIds, rows);
  const listingReconciliations = normalizeListingReconciliations(input.listingReconciliations, {
    adapter,
    complete: input.complete === true,
    failed,
    rawPayloadSha256: input.rawPayloadSha256 ?? null,
    canonicalProductIds,
  });
  let failureContext = null;
  if (input.failureContext != null) {
    if (!failed) throw new TypeError('failure context requires a failed snapshot');
    const context = input.failureContext;
    const kind = required(context.kind, 'failure context kind');
    if (!['identity_mismatch', 'response_contract_failure'].includes(kind)) {
      throw new TypeError(`unsupported failure context ${kind}`);
    }
    const reasonCode = required(context.reasonCode, 'failure context reason code');
    if (kind === 'identity_mismatch'
      && !['AO_MODEL_MISMATCH', 'AO_URI_MISMATCH'].includes(reasonCode)) {
      throw new TypeError(`unsupported identity mismatch reason ${reasonCode}`);
    }
    if (kind === 'response_contract_failure' && reasonCode !== 'AO_RESPONSE_CONTRACT_FAILURE') {
      throw new TypeError(`unsupported response contract failure reason ${reasonCode}`);
    }
    const contextHash = String(context.rawPayloadSha256 ?? '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contextHash)
      || contextHash !== String(input.rawPayloadSha256 ?? '').toLowerCase()) {
      throw new TypeError('identity mismatch raw payload hash required');
    }
    const common = {
      kind,
      reasonCode,
      baselineLinkId: required(context.baselineLinkId, 'failure context baseline link ID'),
      sourceUrl: trustedRetailerUrl(context.sourceUrl, adapter, 'failure source URL'),
      rawPayloadSha256: contextHash,
    };
    failureContext = kind === 'identity_mismatch' ? {
      ...common,
      expectedModel: required(context.expectedModel, 'failure expected model'),
      receivedModel: required(context.receivedModel, 'failure received model'),
      receivedUrl: trustedRetailerUrl(context.receivedUrl, adapter, 'failure received URL'),
    } : common;
  }
  return freezeDeep({
    adapterId: adapter.id, retailer: adapter.retailer, sourceType: adapter.sourceType,
    policyVersion: adapter.policyVersion,
    expectedCadenceHours: adapter.expectedCadenceHours,
    maximumCurrentAgeHours: adapter.maximumCurrentAgeHours,
    observedAt: observedAt.toISOString(), complete: input.complete === true,
    collectionStatus: failed ? 'failed' : 'succeeded', collectionError: failed ? required(input.collectionError, 'collection error') : null,
    rawPayloadSha256: input.rawPayloadSha256 ?? null,
    rawSourceReference: rawSourceReference(input.rawSourceReference, adapter.sourceType),
    ...(input.acquisitionReceiptSha256 == null ? {} : {
      acquisitionReceiptSha256: optionalSha256(
        input.acquisitionReceiptSha256,
        'snapshot acquisition receipt SHA-256',
      ),
    }),
    ...(failureContext ? { failureContext } : {}),
    listingReconciliations,
    canonicalProductIds,
    rows,
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
      row.redirectUrl ?? '',
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
      redirectUrl: row.redirectUrl,
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
