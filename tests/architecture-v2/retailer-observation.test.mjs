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
    redirectUrl: value.listingState === 'redirected'
      ? `https://www.thegoodguys.com.au/${value.id}-destination`
      : null,
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

test('public retailer API is typed evidence and cannot borrow a legacy projection binding', () => {
  const api = createObservation({ ...base, sourceType: 'public_retailer_api' });
  assert.equal(api.sourceType, 'public_retailer_api');
  assert.equal(api.legacyProjectionBinding, null);
  assert.throws(() => createObservation({
    ...base,
    sourceType: 'public_retailer_api',
    legacyProjectionBinding: {
      projectionSha256: 'a'.repeat(64),
      rowSha256: 'b'.repeat(64),
      originSource: 'legacy',
      verifiedAt: '2026-07-08',
      sourcePolicyId: 'legacy-policy',
    },
  }), /cannot carry a legacy projection binding/i);
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
      canonicalProductIds: ['fa_prod_attempt'],
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

test('collection failures affect only canonical products inside the declared attempt scope', () => {
  const canonicalProductId = 'fa_prod_scoped';
  const available = createObservation({
    ...base,
    id: 'obs_scoped',
    canonicalProductId,
    observedAt: '2026-07-19T00:00:00.000Z',
  });
  const failedAttempt = {
    adapterId: 'tgg-feed-v1',
    retailer: 'The Good Guys',
    canonicalProductIds: ['fa_prod_other'],
    observedAt: '2026-07-19T12:00:00.000Z',
    collectionStatus: 'failed',
    collectionError: 'timeout',
    rawSourceReference: 'tgg:attempt:other',
    policyVersion: 'tgg-source-v1',
    complete: false,
  };
  const decision = reduceRetailLifecycle({
    canonicalProductId,
    observations: [available],
    collectionAttempts: [failedAttempt],
    asOf: '2026-07-20T00:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: false,
  });
  assert.deepEqual(decision.collectionAttempts, []);
  assert.equal(decision.reasonCodes.includes('COLLECTION_FAILURE_RETAINED'), false);
  assert.throws(() => reduceRetailLifecycle({
    canonicalProductId,
    observations: [available],
    collectionAttempts: [{ ...failedAttempt, canonicalProductIds: [] }],
    asOf: '2026-07-20T00:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: false,
  }), /canonical product scope/i);
});

test('catalogue-wide collection attempts emit compact product-bound evidence', () => {
  const canonicalProductId = 'fa_prod_scope_0500';
  const canonicalProductIds = Array.from(
    { length: 1_000 },
    (_, index) => `fa_prod_scope_${String(index).padStart(4, '0')}`,
  );
  const decision = reduceRetailLifecycle({
    canonicalProductId,
    observations: [],
    collectionAttempts: [{
      id: 'retail_attempt_catalogue_fixture',
      adapterId: 'tgg-feed-v1',
      retailer: 'The Good Guys',
      canonicalProductIds,
      observedAt: '2026-07-19T12:00:00.000Z',
      collectionStatus: 'succeeded',
      rawSourceReference: 'retailer-object:sha256:fixture',
      rawPayloadSha256: 'a'.repeat(64),
      policyVersion: 'tgg-source-v1',
      complete: true,
    }],
    asOf: '2026-07-20T00:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: false,
  });
  assert.equal(decision.collectionAttempts.length, 1);
  const [attempt] = decision.collectionAttempts;
  assert.equal(attempt.id, 'retail_attempt_catalogue_fixture');
  assert.equal(attempt.scope.canonicalProductId, canonicalProductId);
  assert.equal(attempt.scope.canonicalProductCount, 1_000);
  assert.match(attempt.scope.canonicalProductIdsSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(attempt, 'canonicalProductIds'), false);
  assert.ok(JSON.stringify(attempt).length < 1_000);
});

test('one unavailable retailer cannot archive a product while another migrated listing is unresolved', () => {
  const canonicalProductId = 'fa_prod_multi_listing';
  const legacy = (id, retailer, url, sourcePolicyId) => createObservation({
    id: `obs_legacy_${id}`,
    canonicalProductId,
    retailer,
    observedAt: '2026-07-11T00:00:00.000Z',
    url,
    availability: 'unknown',
    sourceType: 'legacy_catalog',
    sourceReference: 'legacy-catalog',
    policyVersion: 'retailer-source-policy-v2:legacy-link-migration-v1',
    listingState: 'current',
    legacyProjectionBinding: {
      projectionSha256: '1'.repeat(64),
      rowSha256: id.repeat(64).slice(0, 64),
      originSource: 'legacy-catalog',
      verifiedAt: '2026-07-11',
      sourcePolicyId,
    },
  });
  const unavailable = (id, retailer, adapterId, url, hash) => createObservation({
    id: `obs_typed_${id}`,
    canonicalProductId,
    retailer,
    adapterId,
    observedAt: '2026-07-20T00:00:00.000Z',
    url,
    availability: 'unavailable',
    sourceType: 'public_retailer_api',
    sourceReference: `fixture:${id}`,
    rawSourceSha256: hash.repeat(64),
    policyVersion: `${adapterId}-policy-v1`,
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
    listingState: 'unavailable',
    retailerProductId: id,
  });
  const aoUrl = 'https://www.appliancesonline.com.au/product/example-multi';
  const tggUrl = 'https://www.thegoodguys.com.au/example-multi';
  const migrated = [
    legacy('a', 'Appliances Online', aoUrl, 'appliances-online-product-api-v1'),
    legacy('b', 'The Good Guys', tggUrl, 'the-good-guys-partnerize-feed-v1'),
  ];
  const input = {
    canonicalProductId,
    observations: [...migrated, unavailable('a', 'Appliances Online', 'ao-v1', aoUrl, 'a')],
    collectionAttempts: [],
    asOf: '2026-07-20T01:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: true,
  };

  const partial = reduceRetailLifecycle(input);
  assert.equal(partial.lifecycleState, 'UNKNOWN_RETAIL');
  assert.ok(partial.reasonCodes.includes('UNRESOLVED_EXPECTED_RETAILER_LISTING'));

  const complete = reduceRetailLifecycle({
    ...input,
    observations: [
      ...input.observations,
      unavailable('b', 'The Good Guys', 'tgg-v1', tggUrl, 'b'),
    ],
  });
  assert.equal(complete.lifecycleState, 'CATALOG_ARCHIVED');
  assert.ok(complete.reasonCodes.includes('FRESH_UNAVAILABLE_OBSERVATION'));
});

test('same retailer listing conflicts across adapters remain unknown instead of authorizing current', () => {
  const canonicalProductId = 'fa_prod_cross_adapter_conflict';
  const available = createObservation({
    ...base,
    id: 'obs_cross_adapter_available',
    canonicalProductId,
    adapterId: 'partner-feed-v1',
    retailerProductId: 'same-listing',
    observedAt: '2026-07-20T00:00:00.000Z',
  });
  const unavailable = createObservation({
    ...base,
    id: 'obs_cross_adapter_unavailable',
    canonicalProductId,
    adapterId: 'retailer-api-v1',
    retailerProductId: 'same-listing',
    observedAt: '2026-07-20T00:00:00.000Z',
    availability: 'unavailable',
    listingState: 'unavailable',
  });
  const decision = reduceRetailLifecycle({
    canonicalProductId,
    observations: [available, unavailable],
    collectionAttempts: [],
    asOf: '2026-07-20T01:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: false,
  });

  assert.equal(decision.lifecycleState, 'UNKNOWN_RETAIL');
  assert.equal(decision.authorizingObservation, null);
  assert.ok(decision.reasonCodes.includes('SAME_LISTING_SAME_INSTANT_CONFLICT'));
});
