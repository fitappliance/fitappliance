import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRetailerObservationsFromSnapshot,
  createRetailerSourceAdapter,
  normalizeRetailerSnapshot,
  deriveListingTransitions,
} from '../../src/domain/retailer-source-adapter.mjs';

const adapter = createRetailerSourceAdapter({
  id: 'the_good_guys_partnerize', retailer: 'The Good Guys', sourceType: 'affiliate_feed',
  allowedHosts: ['www.thegoodguys.com.au'], minimumIntervalMs: 1000,
  robotsReviewedAt: '2026-07-11', termsReviewedAt: '2026-07-11',
  policyVersion: 'tgg-source-v1', expectedCadenceHours: 24, maximumCurrentAgeHours: 72,
});

test('creates a policy-reviewed immutable source adapter', () => {
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(adapter.minimumIntervalMs, 1000);
  assert.equal(adapter.maximumCurrentAgeHours, 72);
  assert.throws(() => createRetailerSourceAdapter({ ...adapter, robotsReviewedAt: null }), /robots/i);
  assert.throws(() => createRetailerSourceAdapter({ ...adapter, expectedCadenceHours: null }), /expected cadence/i);
  assert.throws(() => createRetailerSourceAdapter({ ...adapter, maximumCurrentAgeHours: 12 }), /maximum current age/i);
});

test('normalizes a complete snapshot with raw evidence and host enforcement', () => {
  const snapshot = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-11T01:00:00Z', complete: true,
    rawPayloadSha256: 'a'.repeat(64), rawSourceReference: 'partnerize:feed:2026-07-11',
    rows: [{ canonicalProductId: 'fa_prod_123', retailerProductId: '123', url: 'https://www.thegoodguys.com.au/product-123', title: 'Model ABC', priceAud: 999, availability: 'available' }],
  });
  assert.equal(snapshot.rows[0].listingState, 'current');
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.policyVersion, 'tgg-source-v1');
  assert.equal(snapshot.maximumCurrentAgeHours, 72);
  assert.throws(() => normalizeRetailerSnapshot(adapter, {
    ...snapshot, rows: [{ ...snapshot.rows[0], url: 'https://evil.example/item' }],
  }), /allowed host/i);
  assert.throws(() => normalizeRetailerSnapshot(adapter, {
    ...snapshot, rows: [{ ...snapshot.rows[0], url: 'https://user:pass@www.thegoodguys.com.au/item' }],
  }), /trusted HTTPS/i);
  assert.throws(() => normalizeRetailerSnapshot(adapter, {
    ...snapshot, rows: [{ ...snapshot.rows[0], availability: 'maybe' }],
  }), /availability/i);
});

test('successful snapshots become product-bound observations with immutable source provenance', () => {
  const snapshot = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-11T01:00:00Z', complete: true,
    rawPayloadSha256: 'a'.repeat(64), rawSourceReference: 'partnerize:feed:2026-07-11',
    rows: [{
      canonicalProductId: 'fa_prod_123', retailerProductId: '123',
      url: 'https://www.thegoodguys.com.au/product-123', title: 'Model ABC',
      priceAud: 999, availability: 'available',
    }],
  });
  const observations = createRetailerObservationsFromSnapshot(snapshot);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].canonicalProductId, 'fa_prod_123');
  assert.equal(observations[0].rawSourceSha256, 'a'.repeat(64));
  assert.equal(observations[0].policyVersion, 'tgg-source-v1');
  assert.equal(observations[0].maximumCurrentAgeHours, 72);
});

test('failed collection is represented separately and cannot contain inventory rows', () => {
  const failed = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-11T01:00:00Z', complete: false, collectionError: 'timeout',
    rawPayloadSha256: null, rawSourceReference: 'partnerize:attempt:2026-07-11', rows: [],
  });
  assert.equal(failed.collectionStatus, 'failed');
  assert.throws(() => normalizeRetailerSnapshot(adapter, { ...failed, rows: [{ url: 'https://www.thegoodguys.com.au/x' }] }), /failed snapshot/i);
});

test('only a complete successful snapshot can derive stale and relisted transitions', () => {
  const complete = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-11T01:00:00Z', complete: true, rawPayloadSha256: 'b'.repeat(64),
    rawSourceReference: 'feed:2', rows: [{ canonicalProductId: 'fa_prod_2', retailerProductId: '2', url: 'https://www.thegoodguys.com.au/two', title: 'Two', availability: 'available' }],
  });
  const existing = [
    { retailerProductId: '1', listingState: 'current' },
    { retailerProductId: '2', listingState: 'stale' },
  ];
  assert.deepEqual(deriveListingTransitions(existing, complete), [
    { retailerProductId: '1', from: 'current', to: 'stale', observedAt: complete.observedAt },
    { retailerProductId: '2', from: 'stale', to: 'relisted', observedAt: complete.observedAt },
  ]);
  assert.deepEqual(deriveListingTransitions(existing, { ...complete, complete: false }), []);
});
