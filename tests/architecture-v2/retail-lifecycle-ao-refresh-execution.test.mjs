import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildRetailLifecycleRefreshPlan,
  buildRetailLifecycleRefreshRun,
  retailerRawObjectPath,
  typedSnapshotsFromRetailLifecycleRefreshRun,
  validateRetailLifecycleRefreshPlan,
  validateRetailLifecycleRefreshRun,
} from '../../src/domain/retail-lifecycle-refresh-execution.mjs';
import { normalizeRetailerSnapshot } from '../../src/domain/retailer-source-adapter.mjs';

const AO_SOURCE = 'appliances-online-product-api-v1';
const OBSERVED_AT = '2026-07-20T16:30:00.000Z';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function resignInventory(inventory) {
  const countBy = (items, selector) => {
    const counts = {};
    for (const item of items) {
      const key = selector(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
  };
  inventory.summary = {
    products: inventory.items.length,
    listings: inventory.items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
    byExecutionDisposition: countBy(inventory.items, (item) => item.executionDisposition),
    bySourceExecutionState: countBy(
      inventory.items.flatMap((item) => item.sourceTasks),
      (task) => task.executionState,
    ),
    ...(inventory.schemaVersion >= 2 ? {
      resolutionTasks: inventory.items.reduce(
        (sum, item) => sum + item.resolutionTasks.length,
        0,
      ),
      byResolutionExecutionState: countBy(
        inventory.items.flatMap((item) => item.resolutionTasks),
        (task) => task.executionState,
      ),
    } : {}),
    ...(inventory.schemaVersion >= 3 ? {
      controlTasks: inventory.items.reduce(
        (sum, item) => sum + item.controlTasks.length,
        0,
      ),
      byControlExecutionState: countBy(
        inventory.items.flatMap((item) => item.controlTasks),
        (task) => task.executionState,
      ),
    } : {}),
  };
  delete inventory.inventoryId;
  delete inventory.semanticSha256;
  const semanticSha256 = sha256(JSON.stringify(canonical(inventory)));
  inventory.inventoryId = `retail_lifecycle_refresh_${semanticSha256.slice(0, 24)}`;
  inventory.semanticSha256 = semanticSha256;
  return inventory;
}

async function inputs() {
  const paths = {
    inventory: 'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json',
    projection: 'data/architecture-v2/generated/public-catalog-projection.json',
    policy: 'data/architecture-v2/policies/retailer-source-policy.json',
  };
  const result = {};
  for (const [key, path] of Object.entries(paths)) {
    const bytes = await readFile(path);
    result[key] = JSON.parse(bytes);
    result[`${key}Sha256`] = sha256(bytes);
  }
  const ao = result.policy.sources.find((candidate) => candidate.id === AO_SOURCE);
  ao.termsReviewState = 'pending_automated_scale_review';
  delete ao.automationControls;
  for (const [index, item] of result.inventory.items.entries()) {
    item.sourceTasks = [{
      baselineLinkId: `retail_link_ao_fixture_${String(index).padStart(4, '0')}`,
      retailer: 'Appliances Online',
      url: `https://www.appliancesonline.com.au/product/fixture-${index}-${encodeURIComponent(item.model)}/`,
      originSource: 'test-fixture',
      sourcePolicyId: AO_SOURCE,
      terminalObservationState: 'LEGACY_UNKNOWN',
      action: 'REVALIDATE_AO_PRODUCT_API',
      executionState: 'BOUNDED_CANARY_ONLY',
      collectionMode: 'bounded_exact_product_api',
    }];
    item.resolutionTasks = [];
    item.controlTasks = [];
    item.executionDisposition = 'BOUNDED_CANARY_ONLY';
  }
  resignInventory(result.inventory);
  result.inventorySha256 = sha256(JSON.stringify(result.inventory));
  result.policySha256 = sha256(JSON.stringify(result.policy));
  return result;
}

function adapter(policy) {
  const source = policy.sources.find((candidate) => candidate.id === AO_SOURCE);
  return {
    id: source.id,
    retailer: source.retailer,
    sourceType: source.sourceType,
    allowedHosts: source.allowedHosts,
    minimumIntervalMs: source.minimumIntervalMs,
    robotsReviewedAt: policy.reviewedAt,
    termsReviewedAt: policy.reviewedAt,
    policyVersion: `${policy.policyVersion}:${source.id}`,
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  };
}

test('AO canary plan is deterministic, bounded, and exact-product scoped', async () => {
  const source = await inputs();
  const selected = source.inventory.items
    .filter((item) => item.sourceTasks.some((task) => task.sourcePolicyId === AO_SOURCE))
    .slice(0, 4)
    .map((item) => item.canonicalProductId);
  const plan = buildRetailLifecycleRefreshPlan({
    inventory: source.inventory,
    inventorySha256: source.inventorySha256,
    publicProjection: source.projection,
    publicProjectionSha256: source.projectionSha256,
    sourcePolicy: source.policy,
    sourcePolicySha256: source.policySha256,
    sourcePolicyId: AO_SOURCE,
    observedAt: OBSERVED_AT,
    selectedCanonicalProductIds: selected,
  });
  assert.equal(plan.mode, 'BOUNDED_EXACT_PRODUCT_API_CANARY');
  assert.deepEqual(plan.targets.map((target) => target.canonicalProductId), [...selected].sort());
  assert.deepEqual(plan.catalogScope.map((target) => target.canonicalProductId), [...selected].sort());
  assert.equal(plan.sourceContract.maximumTargetsPerRun, 20);
  assert.equal(plan.sourceContract.minimumIntervalMs, 1000);
  assert.equal(validateRetailLifecycleRefreshPlan(plan).planId, plan.planId);

  assert.throws(() => buildRetailLifecycleRefreshPlan({
    inventory: source.inventory,
    inventorySha256: source.inventorySha256,
    publicProjection: source.projection,
    publicProjectionSha256: source.projectionSha256,
    sourcePolicy: source.policy,
    sourcePolicySha256: source.policySha256,
    sourcePolicyId: AO_SOURCE,
    observedAt: OBSERVED_AT,
    selectedCanonicalProductIds: source.inventory.items
      .filter((item) => item.sourceTasks.some((task) => task.sourcePolicyId === AO_SOURCE))
      .slice(0, 21)
      .map((item) => item.canonicalProductId),
  }), /maximum|20|canary/i);
});

test('reviewed AO scale plan remains bounded by explicit policy controls', async () => {
  const source = await inputs();
  const reviewedPolicy = structuredClone(source.policy);
  const ao = reviewedPolicy.sources.find((candidate) => candidate.id === AO_SOURCE);
  ao.termsReviewState = 'reviewed_bounded_exact_product_api';
  ao.automationControls = {
    maximumTargetsPerRun: 100,
    maximumConcurrency: 1,
    stopHttpStatuses: [403, 429],
    maximumConsecutiveFailures: 5,
    canaryRunSha256: 'd'.repeat(64),
  };
  const reviewedInventory = structuredClone(source.inventory);
  const selected = [];
  for (const item of reviewedInventory.items) {
    for (const task of item.sourceTasks) {
      if (task.sourcePolicyId !== AO_SOURCE) continue;
      task.executionState = 'RUNNABLE_POLICY_REVIEWED_SOURCE';
      if (selected.length < 50) selected.push(item.canonicalProductId);
    }
    if (!item.sourceTasks.some((task) => task.executionState === 'RUNNABLE_AUTHORIZED_SOURCE')
      && item.sourceTasks.some((task) => task.executionState === 'RUNNABLE_POLICY_REVIEWED_SOURCE')) {
      item.executionDisposition = 'RUNNABLE_POLICY_REVIEWED_SOURCE';
    }
  }
  resignInventory(reviewedInventory);
  const plan = buildRetailLifecycleRefreshPlan({
    inventory: reviewedInventory,
    inventorySha256: sha256(JSON.stringify(reviewedInventory)),
    publicProjection: source.projection,
    publicProjectionSha256: source.projectionSha256,
    sourcePolicy: reviewedPolicy,
    sourcePolicySha256: sha256(JSON.stringify(reviewedPolicy)),
    sourcePolicyId: AO_SOURCE,
    observedAt: OBSERVED_AT,
    selectedCanonicalProductIds: selected,
  });
  assert.equal(plan.mode, 'BOUNDED_EXACT_PRODUCT_API_SCALE');
  assert.equal(plan.targets.length, 50);
  assert.equal(plan.sourceContract.maximumTargetsPerRun, 100);
  assert.equal(plan.sourceContract.maximumConcurrency, 1);
  assert.equal(validateRetailLifecycleRefreshPlan(plan).planId, plan.planId);

  const overBudgetInventory = structuredClone(reviewedInventory);
  const existingTasks = overBudgetInventory.items.reduce(
    (sum, item) => sum + item.sourceTasks.length,
    0,
  );
  const extraTasks = ao.automationControls.maximumTargetsPerRun - existingTasks + 1;
  for (const [index, item] of overBudgetInventory.items.slice(0, extraTasks).entries()) {
    item.sourceTasks.push({
      ...item.sourceTasks[0],
      baselineLinkId: `retail_link_ao_fixture_extra_${String(index).padStart(4, '0')}`,
      url: `https://www.appliancesonline.com.au/product/fixture-extra-${index}/`,
    });
    item.sourceTasks.sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  }
  resignInventory(overBudgetInventory);
  assert.throws(() => buildRetailLifecycleRefreshPlan({
    inventory: overBudgetInventory,
    inventorySha256: sha256(JSON.stringify(overBudgetInventory)),
    publicProjection: source.projection,
    publicProjectionSha256: source.projectionSha256,
    sourcePolicy: reviewedPolicy,
    sourcePolicySha256: sha256(JSON.stringify(reviewedPolicy)),
    sourcePolicyId: AO_SOURCE,
    observedAt: OBSERVED_AT,
    selectedCanonicalProductIds: overBudgetInventory.items
      .filter((item) => item.sourceTasks.some((task) => task.sourcePolicyId === AO_SOURCE))
      .map((item) => item.canonicalProductId),
  }), /maximum|100|bounded/i);
});

test('AO run accounts for successful and failed exact-product attempts without synthesising absence', async () => {
  const source = await inputs();
  const selectedItems = source.inventory.items
    .filter((item) => item.sourceTasks.some((task) => task.sourcePolicyId === AO_SOURCE))
    .slice(0, 2);
  const plan = buildRetailLifecycleRefreshPlan({
    inventory: source.inventory,
    inventorySha256: source.inventorySha256,
    publicProjection: source.projection,
    publicProjectionSha256: source.projectionSha256,
    sourcePolicy: source.policy,
    sourcePolicySha256: source.policySha256,
    sourcePolicyId: AO_SOURCE,
    observedAt: OBSERVED_AT,
    selectedCanonicalProductIds: selectedItems.map((item) => item.canonicalProductId),
  });
  const first = plan.targets[0];
  const second = plan.targets[1];
  const firstBytes = Buffer.from('{"available":true}');
  const firstHash = sha256(firstBytes);
  const success = normalizeRetailerSnapshot(adapter(source.policy), {
    observedAt: OBSERVED_AT,
    complete: false,
    canonicalProductIds: [first.canonicalProductId],
    rawPayloadSha256: firstHash,
    rawSourceReference: `retailer-object:sha256:${firstHash}`,
    rows: [{
      canonicalProductId: first.canonicalProductId,
      retailerProductId: '123',
      url: first.sourceTasks[0].url,
      title: `${first.brand} ${first.model}`,
      priceAud: null,
      availability: 'available',
      listingState: 'current',
    }],
  });
  const failed = normalizeRetailerSnapshot(adapter(source.policy), {
    observedAt: OBSERVED_AT,
    complete: false,
    canonicalProductIds: [second.canonicalProductId],
    rawSourceReference: `ao-api-attempt:${second.canonicalProductId}`,
    collectionError: 'HTTP 503',
    rows: [],
  });
  const run = buildRetailLifecycleRefreshRun({
    runId: 'ao-canary-0',
    plan,
    records: [{
      recordId: first.canonicalProductId,
      canonicalProductId: first.canonicalProductId,
      outcome: 'succeeded',
      rawObject: {
        sha256: firstHash,
        byteSize: firstBytes.length,
        objectPath: retailerRawObjectPath(firstHash, 'json'),
        mediaType: 'application/json',
      },
      snapshot: success,
      quarantines: [],
    }, {
      recordId: second.canonicalProductId,
      canonicalProductId: second.canonicalProductId,
      outcome: 'failed',
      rawObject: null,
      snapshot: failed,
      error: 'HTTP 503',
      quarantines: [],
    }],
  });
  assert.equal(run.summary.succeeded, 1);
  assert.equal(run.summary.failed, 1);
  assert.equal(run.summary.observations, 1);
  assert.equal(typedSnapshotsFromRetailLifecycleRefreshRun(run).length, 2);
  assert.equal(validateRetailLifecycleRefreshRun(run).runId, 'ao-canary-0');

  const omitted = structuredClone(run);
  omitted.records.pop();
  omitted.summary.records = 1;
  omitted.summary.failed = 0;
  omitted.summary.snapshots = 1;
  delete omitted.semanticSha256;
  omitted.semanticSha256 = sha256(JSON.stringify(omitted));
  assert.throws(() => validateRetailLifecycleRefreshRun(omitted), /account|target|record/i);
});
