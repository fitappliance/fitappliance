import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservation, reconcileObservations } from '../../src/domain/retailer-observation.mjs';

const base = {
  id: 'obs_1', canonicalProductId: 'fa_prod_123', retailer: 'The Good Guys',
  observedAt: '2026-07-07T00:00:00.000Z', url: 'https://www.thegoodguys.com.au/example',
  availability: 'available', priceAud: 999, sourceType: 'affiliate_feed', sourceReference: 'feed:row:1',
};

test('creates immutable timestamped observations without promoting retailer dimensions', () => {
  const observation = createObservation({ ...base, dimensionHint: { widthMm: 600 } });
  assert.equal(Object.isFrozen(observation), true);
  assert.deepEqual(observation.dimensionHint, { widthMm: 600 });
  assert.equal(observation.dimensionHintTrust, 'retailer_hint');
});

test('reconciliation is idempotent and preserves history', () => {
  const old = createObservation(base);
  const current = createObservation({ ...base, id: 'obs_2', observedAt: '2026-07-08T00:00:00.000Z', priceAud: 949 });
  const first = reconcileObservations([old], [current], { collectionSucceeded: true });
  const second = reconcileObservations(first.observations, [current], { collectionSucceeded: true });
  assert.equal(first.observations.length, 2);
  assert.deepEqual(first.observations, second.observations);
  assert.throws(() => reconcileObservations([old], [{ ...base, priceAud: 1 }], { collectionSucceeded: true }), /conflicting observation/i);
});

test('a collection outage never synthesizes unavailable observations', () => {
  const result = reconcileObservations([createObservation(base)], [], { collectionSucceeded: false, failureReason: 'timeout' });
  assert.equal(result.observations.length, 1);
  assert.equal(result.delta.collectionStatus, 'failed');
  assert.equal(result.delta.synthesizedUnavailable, 0);
});
