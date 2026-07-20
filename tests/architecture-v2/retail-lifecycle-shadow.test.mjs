import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyRetailLifecycleCutover,
  buildRetailLifecycleShadow,
  validateRetailLifecycleShadow,
} from '../../src/domain/retail-lifecycle-shadow.mjs';
import { buildRetailerObservationLedger } from '../../src/domain/retailer-observation-ledger.mjs';
import { normalizeRetailerSnapshot } from '../../src/domain/retailer-source-adapter.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function resignShadow(value) {
  const result = structuredClone(value);
  delete result.shadowId;
  delete result.semanticSha256;
  const semanticSha256 = hash(JSON.stringify(canonical(result)));
  result.shadowId = `retail_lifecycle_shadow_${semanticSha256.slice(0, 24)}`;
  result.semanticSha256 = semanticSha256;
  return result;
}

const sourcePolicy = {
  schemaVersion: 2,
  policyVersion: 'retailer-source-policy-v2',
  reviewedAt: '2026-07-20',
  sources: [{
    id: 'fixture-feed-v1',
    retailer: 'Fixture Retailer',
    host: 'www.fixture-retailer.example',
    allowedHosts: ['www.fixture-retailer.example'],
    sourceType: 'affiliate_feed',
    collectionMode: 'fixture_feed',
    termsReviewState: 'authorized_partner_feed',
    minimumIntervalMs: 1000,
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
    legacyLinkAction: 'REPLAY_FIXTURE_FEED',
  }],
};

function receiptGeometry(seed = 'a') {
  const field = {
    contentSha256: seed.repeat(64),
    receiptBindingSha256: seed.repeat(64),
    fragmentSha256: seed.repeat(64),
  };
  return {
    geometry_v2: { closedEnvelope: { widthMm: 600, heightMm: 1700, depthMm: 650 } },
    geometry_v2_provenance: { fieldEvidence: {
      'closedEnvelope.widthMm': field,
      'closedEnvelope.heightMm': field,
      'closedEnvelope.depthMm': field,
    } },
  };
}

function product(id, { current = true, receipt = false } = {}) {
  const url = `https://www.fixture-retailer.example/products/${id}`;
  return {
    id,
    canonicalProductId: `fa_prod_${id}`,
    cat: 'fridge',
    brand: 'Fixture',
    model: id.toUpperCase(),
    unavailable: !current,
    retailers: current ? [{
      n: 'Fixture Retailer',
      url,
      p: 1099,
      verified_at: '2026-07-11',
      source: 'fixture-feed',
      stock: null,
    }] : [],
    ...(receipt ? receiptGeometry('a') : {}),
  };
}

function snapshot(rows, observedAt = '2026-07-20T00:00:00.000Z') {
  return normalizeRetailerSnapshot({
    id: 'fixture-feed-v1',
    retailer: 'Fixture Retailer',
    sourceType: 'affiliate_feed',
    allowedHosts: ['www.fixture-retailer.example'],
    minimumIntervalMs: 1000,
    robotsReviewedAt: '2026-07-20',
    termsReviewedAt: '2026-07-20',
    policyVersion: 'retailer-source-policy-v2:fixture-feed-v1',
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
  }, {
    observedAt,
    complete: true,
    canonicalProductIds: rows.map((row) => `fa_prod_${row.id}`),
    rawPayloadSha256: hash(JSON.stringify(rows)),
    rawSourceReference: `fixture-feed:${observedAt}`,
    rows: rows.map((row) => ({
      canonicalProductId: `fa_prod_${row.id}`,
      retailerProductId: row.id,
      url: `https://www.fixture-retailer.example/products/${row.id}`,
      title: `Fixture ${row.id}`,
      priceAud: Object.hasOwn(row, 'priceAud') ? row.priceAud : 999,
      availability: row.availability,
      listingState: row.listingState,
    })),
  });
}

function fixture() {
  const publicProjection = {
    schema_version: 3,
    last_updated: '2026-07-20',
    products: [
      product('keep', { receipt: true }),
      product('remove', { receipt: true }),
      product('unknown'),
      product('relist', { current: false, receipt: true }),
      product('history', { current: false, receipt: true }),
    ],
  };
  const projectionBytes = `${JSON.stringify(publicProjection, null, 2)}\n`;
  const policyBytes = `${JSON.stringify(sourcePolicy)}\n`;
  const ledger = buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection,
    publicProjectionSha256: hash(projectionBytes),
    sourcePolicy,
    sourcePolicySha256: hash(policyBytes),
    typedSnapshots: [snapshot([
      { id: 'keep', availability: 'available', listingState: 'current', priceAud: null },
      { id: 'remove', availability: 'unavailable', listingState: 'unavailable' },
      { id: 'relist', availability: 'available', listingState: 'relisted' },
    ])],
  });
  return {
    publicProjection,
    publicProjectionSha256: hash(projectionBytes),
    retailerLedger: ledger,
    retailerLedgerSha256: hash(`${JSON.stringify(ledger)}\n`),
    sourcePolicy,
    sourcePolicySha256: hash(policyBytes),
    releasePolicySha256: 'd'.repeat(64),
    releaseEpoch: 'retail-lifecycle-fixture-1',
    asOf: '2026-07-20T01:00:00.000Z',
  };
}

test('shadow lifecycle accounts for transitions and blocks a partial production overlay', () => {
  const input = fixture();
  const before = structuredClone(input.publicProjection);
  const shadow = buildRetailLifecycleShadow(input);

  validateRetailLifecycleShadow(shadow);
  assert.equal(shadow.summary.products, 5);
  assert.equal(shadow.summary.legacyCurrentProducts, 3);
  assert.deepEqual(shadow.cohorts.freshAvailableIds, ['fa_prod_keep', 'fa_prod_relist']);
  assert.deepEqual(shadow.cohorts.explicitUnavailableIds, ['fa_prod_remove']);
  assert.deepEqual(shadow.cohorts.unknownOrStaleIds, ['fa_prod_unknown']);
  assert.deepEqual(shadow.cohorts.relistedIds, ['fa_prod_relist']);
  assert.equal(shadow.cutover.status, 'BLOCKED');
  assert.deepEqual(shadow.cutover.unresolvedLegacyCurrentIds, ['fa_prod_unknown']);

  const byId = new Map(shadow.records.map((record) => [record.canonicalProductId, record]));
  assert.equal(byId.get('fa_prod_keep').priorityClass, 'P0_CURRENT_RETAIL');
  assert.equal(byId.get('fa_prod_remove').priorityClass, 'P1_CATALOG_ARCHIVED');
  assert.equal(byId.get('fa_prod_unknown').priorityClass, 'P2_REGISTRY_ONLY');
  assert.equal(byId.get('fa_prod_relist').publicVisibility, 'CURRENT_OUTPUT');
  assert.equal(byId.get('fa_prod_history').replacementEligibility, 'HISTORICAL_LOOKUP');
  assert.equal(byId.get('fa_prod_history').fitDestination, 'HISTORICAL_ONLY');

  assert.throws(
    () => applyRetailLifecycleCutover({ publicProjection: input.publicProjection, shadow }),
    /cutover.*blocked/i,
  );
  assert.deepEqual(input.publicProjection, before);
});

test('a ready cutover publishes only observation-authorized retailers and restores a relisted product', () => {
  const input = fixture();
  const ledger = buildRetailerObservationLedger({
    existingLedger: input.retailerLedger,
    publicProjection: input.publicProjection,
    publicProjectionSha256: input.publicProjectionSha256,
    sourcePolicy,
    sourcePolicySha256: input.sourcePolicySha256,
    typedSnapshots: [snapshot([
      { id: 'unknown', availability: 'available', listingState: 'current' },
    ], '2026-07-20T00:30:00.000Z')],
  });
  const shadow = buildRetailLifecycleShadow({
    ...input,
    retailerLedger: ledger,
    retailerLedgerSha256: hash(`${JSON.stringify(ledger)}\n`),
  });
  assert.equal(shadow.cutover.status, 'READY');

  const before = structuredClone(input.publicProjection);
  const released = applyRetailLifecycleCutover({
    publicProjection: input.publicProjection,
    publicProjectionSha256: input.publicProjectionSha256,
    shadow,
  });
  const byId = new Map(released.products.map((row) => [row.id, row]));
  assert.deepEqual(released.products.map((row) => row.id), before.products.map((row) => row.id));
  assert.equal(byId.get('remove').unavailable, true);
  assert.deepEqual(byId.get('remove').retailers, []);
  assert.equal(byId.get('history').unavailable, true);
  assert.equal(byId.get('relist').unavailable, false);
  assert.equal(byId.get('relist').retailers.length, 1);
  assert.equal(byId.get('relist').retailers[0].n, 'Fixture Retailer');
  assert.equal(byId.get('relist').retailers[0].availability_state, 'available');
  assert.match(byId.get('relist').retailers[0].observation_id, /^obs_/);
  assert.equal(byId.get('keep').retailers[0].p, 1099);
  assert.ok(released.products
    .filter((row) => row.unavailable === false)
    .every((row) => row.retailers.length > 0 && row.retailLifecycle.authorizingObservation));
  assert.deepEqual(input.publicProjection, before);

  assert.throws(() => applyRetailLifecycleCutover({
    publicProjection: input.publicProjection,
    publicProjectionSha256: 'f'.repeat(64),
    shadow,
  }), /public projection.*drift/i);

  const semanticallyDrifted = structuredClone(input.publicProjection);
  semanticallyDrifted.products[0].model = 'MUTATED';
  assert.throws(() => applyRetailLifecycleCutover({
    publicProjection: semanticallyDrifted,
    publicProjectionSha256: input.publicProjectionSha256,
    shadow,
  }), /public projection.*semantic.*drift/i);
});

test('tracked full-catalogue shadow accounts for every product and keeps production bytes unchanged', () => {
  const projectionBytes = readFileSync(new URL(
    '../../data/architecture-v2/generated/public-catalog-projection.json', import.meta.url,
  ));
  const ledgerBytes = readFileSync(new URL(
    '../../data/architecture-v2/observations/retailer-observations.json', import.meta.url,
  ));
  const policyBytes = readFileSync(new URL(
    '../../data/architecture-v2/policies/retailer-source-policy.json', import.meta.url,
  ));
  const publicProjection = JSON.parse(projectionBytes);
  const shadow = buildRetailLifecycleShadow({
    publicProjection,
    publicProjectionSha256: hash(projectionBytes),
    retailerLedger: JSON.parse(ledgerBytes),
    retailerLedgerSha256: hash(ledgerBytes),
    sourcePolicy: JSON.parse(policyBytes),
    sourcePolicySha256: hash(policyBytes),
    releasePolicySha256: 'd'.repeat(64),
    releaseEpoch: 'retail-lifecycle-tracked-fixture-1',
    asOf: '2026-07-20T00:00:00.000Z',
  });

  assert.equal(shadow.summary.products, publicProjection.products.length);
  assert.equal(shadow.summary.legacyCurrentProducts, 1384);
  assert.equal(shadow.cutover.status, 'BLOCKED');
  assert.equal(shadow.cutover.unresolvedLegacyCurrentIds.length, 1384);
  assert.equal(new Set(shadow.records.map((row) => row.legacyRuntimeId)).size, publicProjection.products.length);
  assert.equal(hash(projectionBytes), shadow.sourceBindings.publicProjectionSha256);
  assert.equal(hash(projectionBytes), hash(readFileSync(new URL(
    '../../data/architecture-v2/generated/public-catalog-projection.json', import.meta.url,
  ))));
});

test('shadow validation recomputes release-critical cohorts, cutover membership, and axis destinations', () => {
  const shadow = buildRetailLifecycleShadow(fixture());

  const omittedUnresolved = structuredClone(shadow);
  omittedUnresolved.cutover.unresolvedLegacyCurrentIds = [];
  omittedUnresolved.cutover.status = 'READY';
  assert.throws(
    () => validateRetailLifecycleShadow(resignShadow(omittedUnresolved)),
    /cutover.*membership/i,
  );

  const omittedCohort = structuredClone(shadow);
  omittedCohort.cohorts.unknownOrStaleIds = [];
  assert.throws(
    () => validateRetailLifecycleShadow(resignShadow(omittedCohort)),
    /cohort.*membership/i,
  );

  const destinationDrift = structuredClone(shadow);
  destinationDrift.records.find((record) => record.lifecycleState === 'CURRENT_RETAIL').fitDestination = 'HISTORICAL_ONLY';
  assert.throws(
    () => validateRetailLifecycleShadow(resignShadow(destinationDrift)),
    /Fit destination.*mismatch/i,
  );

  const productBindingDrift = structuredClone(shadow);
  productBindingDrift.records.find((record) => record.lifecycleState === 'CURRENT_RETAIL')
    .retailLifecycle.canonicalProductId = 'fa_prod_other';
  assert.throws(
    () => validateRetailLifecycleShadow(resignShadow(productBindingDrift)),
    /lifecycle product binding.*mismatch/i,
  );
});

test('current source policy excludes previously typed observations without deleting ledger history', () => {
  const input = fixture();
  const blockedPolicy = structuredClone(sourcePolicy);
  blockedPolicy.sources[0].termsReviewState = 'collection_blocked';
  const shadow = buildRetailLifecycleShadow({
    ...input,
    sourcePolicy: blockedPolicy,
    sourcePolicySha256: hash(`${JSON.stringify(blockedPolicy)}\n`),
  });
  const keep = shadow.records.find((record) => record.canonicalProductId === 'fa_prod_keep');

  assert.equal(keep.lifecycleState, 'UNKNOWN_RETAIL');
  assert.equal(keep.excludedBySourcePolicy.observationIds.length, 1);
  assert.equal(keep.excludedBySourcePolicy.collectionAttemptIds.length, 1);
  assert.ok(shadow.cohorts.sourcePolicyExcludedIds.includes('fa_prod_keep'));
  assert.equal(shadow.cutover.status, 'BLOCKED');
  assert.equal(input.retailerLedger.observations.some((row) => (
    row.canonicalProductId === 'fa_prod_keep' && row.sourceType === 'affiliate_feed'
  )), true);
});
