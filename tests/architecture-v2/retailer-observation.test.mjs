import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createObservation,
  reconcileObservations,
  reduceRetailLifecycle,
} from '../../src/domain/retailer-observation.mjs';

const base = {
  id: 'obs_1', canonicalProductId: 'fa_prod_123', retailer: 'The Good Guys',
  observedAt: '2026-07-07T00:00:00.000Z', url: 'https://www.thegoodguys.com.au/example',
  availability: 'available', priceAud: 999, sourceType: 'affiliate_feed', sourceReference: 'feed:row:1',
  adapterId: 'the_good_guys_partnerize', policyVersion: 'tgg-source-v1',
  expectedCadenceHours: 24, maximumCurrentAgeHours: 72, rawSourceSha256: 'a'.repeat(64),
};

const lifecycleCases = JSON.parse(readFileSync(
  'tests/architecture-v2/fixtures/lifecycle-state-axis-cases.json',
  'utf8',
));

function caseObservation(value, canonicalProductId) {
  return createObservation({
    id: `obs_${value.id}`,
    canonicalProductId,
    retailer: value.retailer,
    adapterId: value.adapterId,
    observedAt: value.observedAt,
    url: `https://www.thegoodguys.com.au/${value.id}`,
    availability: value.availability,
    priceAud: null,
    sourceType: 'affiliate_feed',
    sourceReference: `fixture:${value.id}`,
    rawSourceSha256: value.hash.repeat(64),
    policyVersion: `${value.adapterId}-policy-v1`,
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: value.maximumCurrentAgeHours,
    listingState: value.listingState,
    retailerProductId: value.listingId ?? value.id,
  });
}

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

test('typed retailer observations require source, policy, and freshness provenance', () => {
  assert.throws(() => createObservation({ ...base, rawSourceSha256: null }), /raw source SHA-256/i);
  assert.throws(() => createObservation({ ...base, policyVersion: null }), /policy version/i);
  assert.throws(() => createObservation({ ...base, maximumCurrentAgeHours: null }), /maximum current age/i);
  assert.throws(() => createObservation({
    ...base,
    availability: 'available',
    listingState: 'unavailable',
  }), /availability conflicts with unavailable listing state/i);
  const legacy = createObservation({
    ...base,
    sourceType: 'legacy_catalog',
    availability: 'unknown',
    adapterId: null,
    policyVersion: 'legacy-catalog-v1',
    expectedCadenceHours: null,
    maximumCurrentAgeHours: null,
    rawSourceSha256: null,
  });
  assert.equal(legacy.availability, 'unknown');
});

test('lifecycle reducer keeps identity, registry, evidence, visibility, and Fit axes independent', () => {
  for (const fixture of lifecycleCases) {
    const canonicalProductId = `fa_prod_${fixture.id}`;
    const observations = fixture.observations.map((value) => caseObservation(value, canonicalProductId));
    const input = {
      canonicalProductId,
      observations,
      collectionAttempts: fixture.collectionAttempts ?? [],
      asOf: fixture.asOf,
      policyVersion: 'retail-lifecycle-v1',
      catalogState: fixture.catalogState,
      registryPresent: fixture.registryPresent,
      identityState: 'EXACT_MODEL',
      registryMarketState: 'ACTIVE_AU',
      evidenceState: 'REGISTRY_CONSISTENT',
      publicVisibilityState: 'HISTORICAL_INPUT_ONLY',
      fitCompletenessState: 'DIMENSIONS_ONLY',
    };
    const first = reduceRetailLifecycle(input);
    const replay = reduceRetailLifecycle({ ...input, observations: [...observations].reverse() });
    assert.equal(first.lifecycleState, fixture.expectedLifecycleState, fixture.id);
    assert.equal(first.authorizingObservation?.id ?? null, fixture.expectedAuthorizingObservationId, fixture.id);
    assert.deepEqual(replay, first, `${fixture.id} must replay deterministically`);
    assert.equal(first.policyVersion, 'retail-lifecycle-v1');
    assert.equal(first.asOf, fixture.asOf);
    assert.equal(Object.hasOwn(first, 'publicVisibilityState'), false);
    assert.equal(Object.hasOwn(first, 'fitCompletenessState'), false);
    if (first.authorizingObservation) {
      assert.match(first.authorizingObservation.rawSourceSha256, /^[a-f0-9]{64}$/);
      assert.ok(first.authorizingObservation.url.startsWith('https://'));
      assert.ok(first.authorizingObservation.retailer);
      assert.ok(first.authorizingObservation.observedAt);
      assert.ok(first.authorizingObservation.policyVersion);
    }
  }
});

test('lifecycle reducer rejects observations after the explicit release asOf', () => {
  const observation = caseObservation({
    id: 'future', retailer: 'The Good Guys', adapterId: 'tgg-feed-v1',
    observedAt: '2026-07-21T00:00:00.000Z', availability: 'available',
    listingState: 'current', maximumCurrentAgeHours: 72, hash: 'f',
  }, 'fa_prod_future');
  assert.throws(() => reduceRetailLifecycle({
    canonicalProductId: 'fa_prod_future', observations: [observation], collectionAttempts: [],
    asOf: '2026-07-20T00:00:00.000Z', policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED', registryPresent: false,
  }), /after release asOf/i);
});

test('lifecycle reducer rejects duplicate observation IDs before reducing state', () => {
  const canonicalProductId = 'fa_prod_duplicate';
  const first = caseObservation({
    id: 'duplicate', retailer: 'The Good Guys', adapterId: 'tgg-feed-v1',
    observedAt: '2026-07-19T00:00:00.000Z', availability: 'available',
    listingState: 'current', maximumCurrentAgeHours: 72, hash: 'a',
  }, canonicalProductId);
  const conflicting = { ...first, availability: 'unavailable', listingState: 'unavailable' };
  assert.throws(() => reduceRetailLifecycle({
    canonicalProductId,
    observations: [first, conflicting],
    collectionAttempts: [],
    asOf: '2026-07-20T00:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: false,
  }), /duplicate retailer observation ID/i);
});

test('successful collection attempts require immutable raw evidence', () => {
  assert.throws(() => reduceRetailLifecycle({
    canonicalProductId: 'fa_prod_attempt',
    observations: [],
    collectionAttempts: [{
      adapterId: 'tgg-feed-v1', retailer: 'The Good Guys',
      observedAt: '2026-07-19T00:00:00.000Z', collectionStatus: 'succeeded',
      rawSourceReference: 'tgg:attempt:success', policyVersion: 'tgg-source-v1',
      complete: true,
    }],
    asOf: '2026-07-20T00:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'ABSENT',
    registryPresent: false,
  }), /successful collection.*raw payload SHA-256/i);
});
