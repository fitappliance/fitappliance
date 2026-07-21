import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  applyRetailLifecycleRefreshRun,
  buildRetailLifecycleRefreshPlan,
  buildRetailLifecycleRefreshRun,
  retailerRawObjectPath,
  typedSnapshotsFromRetailLifecycleRefreshRun,
  validateRetailLifecycleRefreshPlan,
  validateRetailLifecycleRefreshRun,
} from '../../src/domain/retail-lifecycle-refresh-execution.mjs';
import { buildRetailerSourceAcquisitionReceipt } from '../../src/domain/retailer-source-acquisition-receipt.mjs';
import { buildRetailerObservationLedger } from '../../src/domain/retailer-observation-ledger.mjs';
import { normalizeRetailerSnapshot } from '../../src/domain/retailer-source-adapter.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const RAW_BYTES = Buffer.from('fixture partnerize feed bytes');
const RAW_SHA = createHash('sha256').update(RAW_BYTES).digest('hex');
const OBSERVED_AT = '2026-07-20T14:56:53.000Z';

const sourcePolicy = {
  schemaVersion: 2,
  policyVersion: 'retailer-source-policy-v2',
  reviewedAt: '2026-07-20',
  sources: [{
    id: 'the-good-guys-partnerize-feed-v1',
    retailer: 'The Good Guys',
    host: 'www.thegoodguys.com.au',
    allowedHosts: ['www.thegoodguys.com.au'],
    acquisitionHosts: ['feeds.performancehorizon.com'],
    sourceType: 'affiliate_feed',
    collectionMode: 'partnerize_feed_only',
    termsReviewState: 'authorized_partner_feed',
    robotsHttpStatus: 200,
    robotsSha256: SHA_A,
    minimumIntervalMs: 1000,
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
    legacyLinkAction: 'REPLAY_PARTNERIZE_FEED',
  }],
};

const inventory = {
  schemaVersion: 1,
  policyVersion: 'retail-lifecycle-refresh-inventory-v1',
  releaseEpoch: 'retail-lifecycle-shadow-test',
  asOf: '2026-07-20T00:00:00.000Z',
  sourceBindings: {
    shadowSha256: SHA_A,
    shadowSemanticSha256: SHA_B,
    coverageSha256: SHA_A,
    coverageSemanticSha256: SHA_B,
  },
  items: [{
    canonicalProductId: 'fa_prod_one',
    legacyRuntimeId: 'legacy-one',
    category: 'dishwasher',
    brand: 'Fixture',
    model: 'ONE-1',
    lifecycleState: 'UNKNOWN_RETAIL',
    executionDisposition: 'RUNNABLE_AUTHORIZED_SOURCE',
    sourceTasks: [{
      baselineLinkId: 'retail_link_one',
      retailer: 'The Good Guys',
      url: 'https://www.thegoodguys.com.au/fixture-one-1',
      originSource: 'partnerize-feed',
      sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
      terminalObservationState: 'LEGACY_UNKNOWN',
      action: 'REPLAY_PARTNERIZE_FEED',
      executionState: 'RUNNABLE_AUTHORIZED_SOURCE',
      collectionMode: 'partnerize_feed_only',
    }],
  }],
  summary: {
    products: 1,
    listings: 1,
    byExecutionDisposition: { RUNNABLE_AUTHORIZED_SOURCE: 1 },
    bySourceExecutionState: { RUNNABLE_AUTHORIZED_SOURCE: 1 },
  },
};

const publicProjection = {
  schemaVersion: 1,
  products: [{
    id: 'legacy-one',
    canonicalProductId: 'fa_prod_one',
    cat: 'dishwasher',
    brand: 'Fixture',
    model: 'ONE-1',
    retailers: [{
      n: 'The Good Guys',
      url: 'https://www.thegoodguys.com.au/fixture-one-1',
      verified_at: '2026-07-01',
      source: 'partnerize-feed',
      tgg_sku: '50000001',
    }],
  }, {
    id: 'legacy-archived',
    canonicalProductId: 'fa_prod_archived',
    cat: 'fridge',
    brand: 'Fixture',
    model: 'ARCHIVED-1',
  }],
};

function canonicalSha256(value) {
  const canonical = (input) => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key])]));
    }
    return input;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function resignInventory(value) {
  delete value.inventoryId;
  delete value.semanticSha256;
  const semanticSha256 = canonicalSha256(value);
  value.inventoryId = `retail_lifecycle_refresh_${semanticSha256.slice(0, 24)}`;
  value.semanticSha256 = semanticSha256;
}

resignInventory(inventory);

function buildPlan(observedAt = OBSERVED_AT) {
  return buildRetailLifecycleRefreshPlan({
    inventory,
    inventorySha256: canonicalSha256(inventory),
    publicProjection,
    publicProjectionSha256: canonicalSha256(publicProjection),
    sourcePolicy,
    sourcePolicySha256: canonicalSha256(sourcePolicy),
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    observedAt,
  });
}

function adapter() {
  const source = sourcePolicy.sources[0];
  return {
    id: source.id,
    retailer: source.retailer,
    sourceType: source.sourceType,
    allowedHosts: source.allowedHosts,
    minimumIntervalMs: source.minimumIntervalMs,
    robotsReviewedAt: sourcePolicy.reviewedAt,
    termsReviewedAt: sourcePolicy.reviewedAt,
    policyVersion: `${sourcePolicy.policyVersion}:${source.id}`,
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  };
}

function snapshot(observedAt = OBSERVED_AT, acquisitionReceiptSha256 = null) {
  return normalizeRetailerSnapshot(adapter(), {
    observedAt,
    complete: true,
    canonicalProductIds: ['fa_prod_archived', 'fa_prod_one'],
    rawPayloadSha256: RAW_SHA,
    rawSourceReference: `retailer-object:sha256:${RAW_SHA}`,
    acquisitionReceiptSha256,
    rows: [{
      canonicalProductId: 'fa_prod_one',
      retailerProductId: '50000001',
      url: 'https://www.thegoodguys.com.au/fixture-one-1',
      title: 'Fixture ONE-1',
      priceAud: 999,
      availability: 'available',
      listingState: 'current',
    }],
  });
}

function acquisitionReceipt(receivedAt) {
  return buildRetailerSourceAcquisitionReceipt({
    sourcePolicyId: sourcePolicy.sources[0].id,
    sourcePolicySha256: canonicalSha256(sourcePolicy),
    acquisitionHosts: sourcePolicy.sources[0].acquisitionHosts,
    requestedUrl: 'https://feeds.performancehorizon.com/private/feed.csv',
    finalUrl: 'https://feeds.performancehorizon.com/private/feed.csv',
    redirects: [],
    startedAt: new Date(new Date(receivedAt).valueOf() - 1000).toISOString(),
    receivedAt,
    responseStatus: 200,
    responseHeaders: { 'content-type': 'text/csv' },
    rawBytes: RAW_BYTES,
    mediaType: 'text/csv',
  });
}

test('authorised complete feed plan freezes source, inventory, and full catalogue scope', () => {
  const plan = buildPlan();
  assert.equal(plan.mode, 'COMPLETE_AFFILIATE_FEED_REPLAY');
  assert.deepEqual(plan.targets.map((row) => row.canonicalProductId), ['fa_prod_one']);
  assert.deepEqual(plan.catalogScope.map((row) => row.canonicalProductId), [
    'fa_prod_archived',
    'fa_prod_one',
  ]);
  assert.equal(plan.summary.targets, 1);
  assert.equal(plan.summary.catalogProducts, 2);
  assert.equal(validateRetailLifecycleRefreshPlan(plan).planId, plan.planId);
});

test('authorised complete feed plan skips terminal baseline tasks but keeps full catalogue scope', () => {
  const terminalInventory = structuredClone(inventory);
  terminalInventory.items[0].executionDisposition = 'BLOCKED_BY_SOURCE_POLICY';
  terminalInventory.items[0].sourceTasks[0] = {
    ...terminalInventory.items[0].sourceTasks[0],
    terminalObservationState: 'SOURCE_ABSENT_IN_AUTHORIZED_FEED',
    action: 'COLLECT_ALTERNATE_AUTHORIZED_RETAIL_SOURCE',
    executionState: 'BLOCKED_BY_SOURCE_POLICY',
    collectionMode: 'alternate_authorized_source_required',
  };
  terminalInventory.summary = {
    products: 1,
    listings: 1,
    byExecutionDisposition: { BLOCKED_BY_SOURCE_POLICY: 1 },
    bySourceExecutionState: { BLOCKED_BY_SOURCE_POLICY: 1 },
  };
  resignInventory(terminalInventory);

  const plan = buildRetailLifecycleRefreshPlan({
    inventory: terminalInventory,
    inventorySha256: canonicalSha256(terminalInventory),
    publicProjection,
    publicProjectionSha256: canonicalSha256(publicProjection),
    sourcePolicy,
    sourcePolicySha256: canonicalSha256(sourcePolicy),
    sourcePolicyId: sourcePolicy.sources[0].id,
    observedAt: OBSERVED_AT,
  });

  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.catalogScope.map((row) => row.canonicalProductId), [
    'fa_prod_archived',
    'fa_prod_one',
  ]);
});

test('plan rejects duplicate catalogue identity and collection-blocked policy', () => {
  const duplicateProjection = structuredClone(publicProjection);
  duplicateProjection.products.push(structuredClone(duplicateProjection.products[0]));
  assert.throws(() => buildRetailLifecycleRefreshPlan({
    inventory,
    inventorySha256: canonicalSha256(inventory),
    publicProjection: duplicateProjection,
    publicProjectionSha256: canonicalSha256(duplicateProjection),
    sourcePolicy,
    sourcePolicySha256: canonicalSha256(sourcePolicy),
    sourcePolicyId: sourcePolicy.sources[0].id,
    observedAt: OBSERVED_AT,
  }), /duplicate.*catalogue|canonical product/i);

  const blocked = structuredClone(sourcePolicy);
  blocked.sources[0].termsReviewState = 'collection_blocked';
  assert.throws(() => buildRetailLifecycleRefreshPlan({
    inventory,
    inventorySha256: canonicalSha256(inventory),
    publicProjection,
    publicProjectionSha256: canonicalSha256(publicProjection),
    sourcePolicy: blocked,
    sourcePolicySha256: canonicalSha256(blocked),
    sourcePolicyId: blocked.sources[0].id,
    observedAt: OBSERVED_AT,
  }), /blocked/i);
});

test('completed run binds raw object and emits exactly one replayable snapshot', () => {
  const plan = buildPlan();
  const run = buildRetailLifecycleRefreshRun({
    runId: 'tgg-2026-07-20',
    plan,
    records: [{
      recordId: 'feed-record',
      outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA,
        byteSize: 123,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'),
        mediaType: 'text/csv',
      },
      snapshot: snapshot(),
      quarantines: [],
    }],
  });
  assert.equal(run.status, 'completed');
  assert.equal(run.summary.succeeded, 1);
  assert.deepEqual(typedSnapshotsFromRetailLifecycleRefreshRun(run), [snapshot()]);
  assert.equal(validateRetailLifecycleRefreshRun(run).runId, 'tgg-2026-07-20');
});

test('run validation fails closed on raw hash, policy, scope, or summary drift after re-signing', () => {
  const plan = buildPlan();
  const base = buildRetailLifecycleRefreshRun({
    runId: 'tgg-2026-07-20',
    plan,
    records: [{
      recordId: 'feed-record',
      outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA,
        byteSize: 123,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'),
        mediaType: 'text/csv',
      },
      snapshot: snapshot(),
      quarantines: [],
    }],
  });
  const resign = (run) => {
    const clone = structuredClone(run);
    delete clone.semanticSha256;
    clone.semanticSha256 = canonicalSha256(clone);
    return clone;
  };

  const wrongRaw = structuredClone(base);
  wrongRaw.records[0].rawObject.sha256 = SHA_A;
  wrongRaw.records[0].rawObject.objectPath = retailerRawObjectPath(SHA_A, 'csv');
  assert.throws(() => validateRetailLifecycleRefreshRun(resign(wrongRaw)), /raw.*snapshot|hash/i);

  const wrongPolicy = structuredClone(base);
  wrongPolicy.records[0].snapshot.policyVersion = 'drifted-policy';
  assert.throws(() => validateRetailLifecycleRefreshRun(resign(wrongPolicy)), /policy/i);

  const wrongScope = structuredClone(base);
  wrongScope.records[0].snapshot.canonicalProductIds = ['fa_prod_one'];
  assert.throws(() => validateRetailLifecycleRefreshRun(resign(wrongScope)), /scope/i);

  const wrongSummary = structuredClone(base);
  wrongSummary.summary.succeeded = 0;
  assert.throws(() => validateRetailLifecycleRefreshRun(resign(wrongSummary)), /summary/i);
});

test('application verifies immutable bytes and is idempotent against the cumulative ledger', async () => {
  const plan = buildPlan();
  const run = buildRetailLifecycleRefreshRun({
    runId: 'tgg-2026-07-20',
    plan,
    records: [{
      recordId: 'feed-record',
      outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA,
        byteSize: RAW_BYTES.length,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'),
        mediaType: 'text/csv',
      },
      snapshot: snapshot(),
      quarantines: [],
    }],
  });
  const publicProjectionSha256 = canonicalSha256(publicProjection);
  const sourcePolicySha256 = canonicalSha256(sourcePolicy);
  const initial = buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection,
    publicProjectionSha256,
    sourcePolicy,
    sourcePolicySha256,
    typedSnapshots: [],
  });
  const options = {
    run,
    existingLedger: initial,
    publicProjection,
    publicProjectionSha256,
    inventorySha256: canonicalSha256(inventory),
    inventorySemanticSha256: inventory.semanticSha256,
    sourcePolicy,
    sourcePolicySha256,
    readObject: async (path) => {
      assert.equal(path, retailerRawObjectPath(RAW_SHA, 'csv'));
      return RAW_BYTES;
    },
  };
  const first = await applyRetailLifecycleRefreshRun(options);
  const second = await applyRetailLifecycleRefreshRun({ ...options, existingLedger: first });
  assert.deepEqual(second, first);
  assert.equal(first.summary.authoritativeTypedObservations, 1);
  assert.equal(first.summary.collectionAttempts, 1);

  await assert.rejects(() => applyRetailLifecycleRefreshRun({
    ...options,
    readObject: async () => Buffer.from('tampered'),
  }), /object.*hash|byte size/i);
  await assert.rejects(() => applyRetailLifecycleRefreshRun({
    ...options,
    sourcePolicySha256: SHA_A,
  }), /source policy.*drift/i);
});

test('application cannot advance affiliate-feed freshness by replaying identical source bytes', async () => {
  const firstPlan = buildPlan();
  const firstRun = buildRetailLifecycleRefreshRun({
    runId: 'tgg-feed-epoch-one',
    plan: firstPlan,
    records: [{
      recordId: 'feed-record',
      outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA,
        byteSize: RAW_BYTES.length,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'),
        mediaType: 'text/csv',
      },
      snapshot: snapshot(),
      quarantines: [],
    }],
  });
  const publicProjectionSha256 = canonicalSha256(publicProjection);
  const sourcePolicySha256 = canonicalSha256(sourcePolicy);
  const initial = buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection,
    publicProjectionSha256,
    sourcePolicy,
    sourcePolicySha256,
    typedSnapshots: [],
  });
  const application = {
    existingLedger: initial,
    publicProjection,
    publicProjectionSha256,
    inventorySha256: canonicalSha256(inventory),
    inventorySemanticSha256: inventory.semanticSha256,
    sourcePolicy,
    sourcePolicySha256,
    readObject: async () => RAW_BYTES,
  };
  const firstLedger = await applyRetailLifecycleRefreshRun({ ...application, run: firstRun });

  const laterObservedAt = '2026-07-21T14:56:53.000Z';
  const laterPlan = buildPlan(laterObservedAt);
  const replayedBytesRun = buildRetailLifecycleRefreshRun({
    runId: 'tgg-feed-epoch-two',
    plan: laterPlan,
    records: [{
      recordId: 'feed-record',
      outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA,
        byteSize: RAW_BYTES.length,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'),
        mediaType: 'text/csv',
      },
      snapshot: snapshot(laterObservedAt),
      quarantines: [],
    }],
  });

  await assert.rejects(() => applyRetailLifecycleRefreshRun({
    ...application,
    existingLedger: firstLedger,
    run: replayedBytesRun,
  }), /identical affiliate feed.*freshness|source bytes.*new acquisition/i);
});

test('a distinct verified HTTPS acquisition receipt can advance unchanged affiliate-feed bytes', async () => {
  const publicProjectionSha256 = canonicalSha256(publicProjection);
  const sourcePolicySha256 = canonicalSha256(sourcePolicy);
  const initial = buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection,
    publicProjectionSha256,
    sourcePolicy,
    sourcePolicySha256,
    typedSnapshots: [],
  });
  const firstPlan = buildPlan();
  const firstRun = buildRetailLifecycleRefreshRun({
    runId: 'tgg-feed-local-epoch',
    plan: firstPlan,
    records: [{
      recordId: 'feed-record', outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA, byteSize: RAW_BYTES.length,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'), mediaType: 'text/csv',
      },
      snapshot: snapshot(), quarantines: [],
    }],
  });
  const application = {
    publicProjection,
    publicProjectionSha256,
    inventorySha256: canonicalSha256(inventory),
    inventorySemanticSha256: inventory.semanticSha256,
    sourcePolicy,
    sourcePolicySha256,
    readObject: async () => RAW_BYTES,
  };
  const firstLedger = await applyRetailLifecycleRefreshRun({
    ...application, existingLedger: initial, run: firstRun,
  });

  const laterObservedAt = '2026-07-21T14:56:53.000Z';
  const receipt = acquisitionReceipt(laterObservedAt);
  const laterRun = buildRetailLifecycleRefreshRun({
    runId: 'tgg-feed-https-epoch',
    plan: buildPlan(laterObservedAt),
    records: [{
      recordId: 'feed-record', outcome: 'succeeded',
      rawObject: {
        sha256: RAW_SHA, byteSize: RAW_BYTES.length,
        objectPath: retailerRawObjectPath(RAW_SHA, 'csv'), mediaType: 'text/csv',
        acquisitionReceipt: receipt,
      },
      snapshot: snapshot(laterObservedAt, receipt.semanticSha256), quarantines: [],
    }],
  });
  const advanced = await applyRetailLifecycleRefreshRun({
    ...application, existingLedger: firstLedger, run: laterRun,
  });
  assert.equal(advanced.collectionAttempts.length, firstLedger.collectionAttempts.length + 1);
  assert.equal(
    advanced.collectionAttempts.find((attempt) => attempt.observedAt === laterObservedAt)
      .acquisitionReceiptSha256,
    receipt.semanticSha256,
  );
  assert.ok(advanced.sourceBindings.some((binding) => (
    binding.kind === 'IMMUTABLE_ACQUISITION_RECEIPT' && binding.sha256 === receipt.semanticSha256
  )));
});
