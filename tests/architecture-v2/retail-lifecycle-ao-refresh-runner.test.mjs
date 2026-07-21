import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { applyRetailLifecycleRefreshRunFromRepository } from '../../scripts/architecture-v2/apply-retail-lifecycle-refresh.mjs';
import { buildRetailerObservationCoverage } from '../../src/domain/retailer-observation-coverage.mjs';
import {
  collectAoRetailLifecycleRefreshRun,
  selectAoCanaryCanonicalProductIds,
  selectAoScaleCanonicalProductIds,
} from '../../scripts/architecture-v2/run-retail-lifecycle-refresh.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
const observedAt = '2026-07-20T16:30:00.000Z';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeFixtureJson(root, relativePath, document) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
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
  };
  delete inventory.inventoryId;
  delete inventory.semanticSha256;
  const semanticSha256 = sha256(JSON.stringify(canonical(inventory)));
  inventory.inventoryId = `retail_lifecycle_refresh_${semanticSha256.slice(0, 24)}`;
  inventory.semanticSha256 = semanticSha256;
}

function fixtureInventory(publicProjection, executionState) {
  const byCategory = new Map();
  for (const product of publicProjection.products) {
    const retailer = (product.retailers ?? []).find((row) => (
      new URL(row.url).hostname === 'www.appliancesonline.com.au'
    ));
    if (!retailer) continue;
    if (!byCategory.has(product.cat)) byCategory.set(product.cat, []);
    if (byCategory.get(product.cat).length < 6) {
      byCategory.get(product.cat).push({ product, retailer });
    }
  }
  const items = [...byCategory.values()].flat().map(({ product, retailer }) => ({
    canonicalProductId: product.canonicalProductId,
    legacyRuntimeId: product.id,
    category: product.cat,
    brand: product.brand,
    model: product.model,
    lifecycleState: 'UNKNOWN_RETAIL',
    executionDisposition: executionState,
    sourceTasks: [{
      baselineLinkId: `retail_link_${sha256([
        product.canonicalProductId,
        retailer.n,
        retailer.url,
        retailer.source ?? 'appliances-online-api',
      ].join('\0')).slice(0, 24)}`,
      retailer: 'Appliances Online',
      url: retailer.url,
      originSource: retailer.source ?? 'appliances-online-api',
      sourcePolicyId: 'appliances-online-product-api-v1',
      terminalObservationState: 'LEGACY_UNKNOWN',
      action: 'REVALIDATE_AO_PRODUCT_API',
      executionState,
      collectionMode: 'bounded_exact_product_api',
    }],
  })).sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  assert.equal(new Set(items.map((item) => item.category)).size, 4);
  const inventory = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-refresh-inventory-v1',
    releaseEpoch: 'retail-lifecycle-test-fixture',
    asOf: '2026-07-20T00:00:00.000Z',
    sourceBindings: {
      shadowSha256: 'a'.repeat(64),
      shadowSemanticSha256: 'b'.repeat(64),
      coverageSha256: 'c'.repeat(64),
      coverageSemanticSha256: 'd'.repeat(64),
    },
    items,
  };
  resignInventory(inventory);
  return inventory;
}

async function fixture(t, { reviewed = false } = {}) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-ao-refresh-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const root = join(storageRoot, 'repo');
  const [ledger, projection, policy] = await Promise.all([
    readFile(join(repoRoot, 'data/architecture-v2/observations/retailer-observations.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/generated/public-catalog-projection.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/policies/retailer-source-policy.json'), 'utf8').then(JSON.parse),
  ]);
  const ao = policy.sources.find((source) => source.id === 'appliances-online-product-api-v1');
  if (reviewed) {
    ao.termsReviewState = 'reviewed_bounded_exact_product_api';
    ao.automationControls = {
      maximumTargetsPerRun: 100,
      maximumConcurrency: 1,
      stopHttpStatuses: [403, 429],
      maximumConsecutiveFailures: 5,
      canaryRunSha256: 'e'.repeat(64),
    };
  } else {
    ao.termsReviewState = 'pending_automated_scale_review';
    delete ao.automationControls;
  }
  const inventory = fixtureInventory(
    projection,
    reviewed ? 'RUNNABLE_POLICY_REVIEWED_SOURCE' : 'BOUNDED_CANARY_ONLY',
  );
  await Promise.all([
    writeFixtureJson(root, 'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json', inventory),
    writeFixtureJson(root, 'data/architecture-v2/observations/retailer-observations.json', ledger),
    writeFixtureJson(root, 'data/architecture-v2/generated/public-catalog-projection.json', projection),
    writeFixtureJson(root, 'data/architecture-v2/policies/retailer-source-policy.json', policy),
  ]);
  const dependencies = {
    storageIdentity: {
      root: storageRoot,
      markerSha256: 'a'.repeat(64),
      volumeUuid: 'fixture-volume',
    },
    isProcessAlive: async () => false,
    now: () => '2026-07-20T16:30:00.000Z',
  };
  return {
    storageRoot,
    root,
    inventory,
    projection,
    policy,
    authoritativeTypedObservations: ledger.summary.authoritativeTypedObservations,
    collectionAttempts: ledger.summary.collectionAttempts,
    dependencies,
  };
}

function responseFor(target, index) {
  const url = new URL(target.sourceTasks[0].url);
  const payload = {
    productId: 900000 + index,
    sku: target.model,
    uri: url.pathname,
    title: `${target.brand} ${target.model}`,
    available: index % 2 === 0,
    price: 999,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  return { payload, bytes };
}

test('AO canary selection is deterministic and stratified across available categories', async (t) => {
  const f = await fixture(t);
  const first = selectAoCanaryCanonicalProductIds(f.inventory, { canaryIndex: 0, canarySize: 8 });
  const second = selectAoCanaryCanonicalProductIds(f.inventory, { canaryIndex: 0, canarySize: 8 });
  assert.deepEqual(second, first);
  const categories = new Set(f.inventory.items
    .filter((item) => first.includes(item.canonicalProductId))
    .map((item) => item.category));
  assert.equal(categories.size, 4);
});

test('AO scale selection creates deterministic disjoint category-stratified batches', async (t) => {
  const f = await fixture(t);
  const reviewedInventory = structuredClone(f.inventory);
  for (const item of reviewedInventory.items) {
    for (const task of item.sourceTasks) {
      if (task.sourcePolicyId === 'appliances-online-product-api-v1') {
        task.executionState = 'RUNNABLE_POLICY_REVIEWED_SOURCE';
      }
    }
  }
  const first = selectAoScaleCanonicalProductIds(reviewedInventory, { batchIndex: 0, batchSize: 8 });
  const replay = selectAoScaleCanonicalProductIds(reviewedInventory, { batchIndex: 0, batchSize: 8 });
  const second = selectAoScaleCanonicalProductIds(reviewedInventory, { batchIndex: 1, batchSize: 8 });
  assert.deepEqual(replay, first);
  assert.equal(first.length, 8);
  assert.equal(second.length, 8);
  assert.equal(first.filter((id) => second.includes(id)).length, 0);
  const categories = new Set(reviewedInventory.items
    .filter((item) => first.includes(item.canonicalProductId))
    .map((item) => item.category));
  assert.equal(categories.size, 4);
});

test('reviewed AO scale runner freezes and completes one bounded batch', async (t) => {
  const f = await fixture(t, { reviewed: true });
  let fetches = 0;
  let sleeps = 0;
  const result = await collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-batch-0',
    observedAt,
    batchIndex: 0,
    batchSize: 6,
  }, {
    ...f.dependencies,
    sleep: async (ms) => { assert.equal(ms, 1000); sleeps += 1; },
    fetchAoTarget: async (target) => responseFor(target, fetches++),
  });
  assert.equal(result.run.plan.mode, 'BOUNDED_EXACT_PRODUCT_API_SCALE');
  assert.equal(result.run.plan.targets.length, 6);
  assert.equal(result.run.plan.sourceContract.maximumTargetsPerRun, 100);
  assert.equal(result.run.summary.succeeded, 6);
  assert.equal(fetches, 6);
  assert.equal(sleeps, 5);
});

test('reviewed AO scale runner budgets and accounts for every retailer link, not only every product', async (t) => {
  const f = await fixture(t, { reviewed: true });
  for (const item of f.inventory.items) {
    const first = item.sourceTasks[0];
    item.sourceTasks.push({
      ...first,
      baselineLinkId: `retail_link_second_${sha256(item.canonicalProductId).slice(0, 24)}`,
      url: `${first.url.replace(/\/$/, '')}-second-listing`,
    });
    item.sourceTasks.sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  }
  resignInventory(f.inventory);
  await writeFixtureJson(
    f.root,
    'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json',
    f.inventory,
  );

  const fetchedLinks = [];
  const result = await collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-listing-grain',
    observedAt,
    batchIndex: 0,
    batchSize: 6,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      fetchedLinks.push(sourceTask.baselineLinkId);
      return responseFor({ ...target, sourceTasks: [sourceTask] }, fetchedLinks.length);
    },
  });

  assert.equal(result.run.plan.summary.sourceTasks, 6);
  assert.equal(result.run.plan.summary.targets, 3);
  assert.equal(result.run.summary.records, 6);
  assert.equal(new Set(fetchedLinks).size, 6);
  assert.deepEqual(
    result.run.records.map((record) => record.baselineLinkId).sort(),
    fetchedLinks.sort(),
  );
});

test('one AO identity mismatch is raw-bound and quarantines only that listing while later tasks continue', async (t) => {
  const f = await fixture(t, { reviewed: true });
  const selected = selectAoScaleCanonicalProductIds(f.inventory, { batchIndex: 0, batchSize: 3 });
  let fetches = 0;
  const result = await collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-identity-quarantine',
    observedAt,
    batchIndex: 0,
    batchSize: 3,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      const response = responseFor({ ...target, sourceTasks: [sourceTask] }, fetches);
      if (fetches === 0) {
        response.payload.sku = `OTHER-${target.model}`;
        response.bytes = Buffer.from(JSON.stringify(response.payload));
      }
      fetches += 1;
      return response;
    },
  });

  assert.equal(fetches, 3);
  assert.equal(result.run.summary.succeeded, 2);
  assert.equal(result.run.summary.failed, 1);
  assert.equal(result.run.summary.quarantines, 1);
  const mismatch = result.run.records.find((record) => record.outcome === 'failed');
  assert.ok(mismatch.rawObject);
  assert.equal(mismatch.snapshot.failureContext.kind, 'identity_mismatch');
  assert.equal(mismatch.snapshot.failureContext.baselineLinkId, mismatch.baselineLinkId);
  assert.equal(mismatch.snapshot.rawPayloadSha256, mismatch.rawObject.sha256);

  const output = join(f.storageRoot, 'identity-quarantine-ledger.json');
  const applied = await applyRetailLifecycleRefreshRunFromRepository({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: result.run.runId,
    output,
  }, f.dependencies);
  assert.equal(
    applied.ledger.summary.authoritativeTypedObservations,
    f.authoritativeTypedObservations + 2,
  );
  assert.equal(applied.ledger.summary.collectionAttempts, f.collectionAttempts + 3);
  const attempt = applied.ledger.collectionAttempts.find((row) => (
    row.failureContext?.baselineLinkId === mismatch.baselineLinkId
  ));
  assert.equal(attempt.failureContext.kind, 'identity_mismatch');

  const coverage = buildRetailerObservationCoverage({
    publicProjection: f.projection,
    publicProjectionSha256: 'a'.repeat(64),
    ledger: applied.ledger,
    ledgerSha256: 'b'.repeat(64),
    sourcePolicy: f.policy,
    sourcePolicySha256: 'c'.repeat(64),
  });
  const item = coverage.items.find((row) => row.baselineLinkId === mismatch.baselineLinkId);
  assert.equal(item.terminalObservationState, 'QUARANTINED_IDENTITY_MISMATCH');
  assert.equal(item.revalidation, null);
  assert.ok(selected.includes(item.canonicalProductId));
});

test('completed AO run replay rejects a tampered identity-mismatch raw object', async (t) => {
  const f = await fixture(t, { reviewed: true });
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-identity-replay-integrity',
    observedAt,
    batchIndex: 0,
    batchSize: 3,
  };
  let fetches = 0;
  const completed = await collectAoRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      const response = responseFor({ ...target, sourceTasks: [sourceTask] }, fetches);
      if (fetches === 0) {
        response.payload.sku = `OTHER-${target.model}`;
        response.bytes = Buffer.from(JSON.stringify(response.payload));
      }
      fetches += 1;
      return response;
    },
  });
  const mismatch = completed.run.records.find((record) => record.outcome === 'failed');
  await writeFile(join(f.storageRoot, mismatch.rawObject.objectPath), 'tampered');

  await assert.rejects(() => collectAoRetailLifecycleRefreshRun({
    ...options,
    resume: true,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async () => { throw new Error('completed replay must not fetch'); },
  }), /raw object integrity mismatch/);
});

test('AO response contract failures retain raw evidence without publishing availability', async (t) => {
  const f = await fixture(t, { reviewed: true });
  let fetches = 0;
  const completed = await collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-response-contract-failure',
    observedAt,
    batchIndex: 0,
    batchSize: 3,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      const response = responseFor({ ...target, sourceTasks: [sourceTask] }, fetches);
      if (fetches === 0) {
        delete response.payload.productId;
        response.bytes = Buffer.from(JSON.stringify(response.payload));
      }
      fetches += 1;
      return response;
    },
  });

  assert.equal(completed.run.summary.succeeded, 2);
  assert.equal(completed.run.summary.failed, 1);
  assert.equal(completed.run.summary.observations, 2);
  assert.equal(completed.run.summary.quarantines, 0);
  const failed = completed.run.records.find((record) => record.outcome === 'failed');
  assert.ok(failed.rawObject);
  assert.equal(failed.snapshot.failureContext.kind, 'response_contract_failure');
  assert.equal(failed.snapshot.failureContext.reasonCode, 'AO_RESPONSE_CONTRACT_FAILURE');
  assert.equal(failed.snapshot.rawPayloadSha256, failed.rawObject.sha256);
  assert.equal(
    await readFile(join(f.storageRoot, failed.rawObject.objectPath), 'utf8'),
    JSON.stringify(JSON.parse(await readFile(join(f.storageRoot, failed.rawObject.objectPath), 'utf8'))),
  );
});

test('AO resume preserves a checkpointed identity quarantine and starts at the next retailer link', async (t) => {
  const f = await fixture(t, { reviewed: true });
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-identity-resume',
    observedAt,
    batchIndex: 0,
    batchSize: 3,
  };
  let firstFetches = 0;
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      const response = responseFor({ ...target, sourceTasks: [sourceTask] }, firstFetches);
      response.payload.sku = `OTHER-${target.model}`;
      response.bytes = Buffer.from(JSON.stringify(response.payload));
      firstFetches += 1;
      return response;
    },
    afterRecord: async () => { throw new Error('simulated interruption after identity quarantine'); },
  }), /simulated interruption/);
  assert.equal(firstFetches, 1);

  let resumedFetches = 0;
  const resumed = await collectAoRetailLifecycleRefreshRun({ ...options, resume: true }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => (
      responseFor({ ...target, sourceTasks: [sourceTask] }, 20 + resumedFetches++)
    ),
  });
  assert.equal(resumedFetches, 2);
  assert.equal(resumed.run.summary.failed, 1);
  assert.equal(resumed.run.summary.succeeded, 2);
  assert.equal(resumed.run.summary.quarantines, 1);
});

test('five consecutive AO identity mismatches trip the persisted batch breaker', async (t) => {
  const f = await fixture(t, { reviewed: true });
  let fetches = 0;
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-identity-breaker',
    observedAt,
    batchIndex: 0,
    batchSize: 6,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target, sourceTask) => {
      const response = responseFor({ ...target, sourceTasks: [sourceTask] }, fetches);
      response.payload.sku = `OTHER-${target.model}`;
      response.bytes = Buffer.from(JSON.stringify(response.payload));
      fetches += 1;
      return response;
    },
  }), /CONSECUTIVE_FAILURE_STOP/);
  assert.equal(fetches, 5);
  const state = JSON.parse(await readFile(join(
    f.storageRoot,
    'runs/retail-lifecycle-refresh/ao-scale-identity-breaker/state.json',
  )));
  assert.equal(state.status, 'blocked');
  assert.equal(state.consecutiveFailures, 5);
  assert.equal(state.records.length, 5);
  assert.ok(state.records.every((record) => (
    record.rawObject && record.snapshot.failureContext?.kind === 'identity_mismatch'
  )));
});

test('reviewed AO scale runner stops after its fifth consecutive ordinary failure', async (t) => {
  const f = await fixture(t, { reviewed: true });
  let fetches = 0;
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-scale-failure-stop',
    observedAt,
    batchIndex: 0,
    batchSize: 8,
  }, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async () => { fetches += 1; throw new Error('AO API HTTP 503'); },
  }), /CONSECUTIVE_FAILURE_STOP/);
  assert.equal(fetches, 5);
  const state = JSON.parse(await readFile(join(
    f.storageRoot,
    'runs/retail-lifecycle-refresh/ao-scale-failure-stop/state.json',
  )));
  assert.equal(state.status, 'blocked');
  assert.equal(state.consecutiveFailures, 5);
  assert.equal(state.records.length, 5);
});

test('AO canary checkpoints each exact response and resumes without refetching completed targets', async (t) => {
  const f = await fixture(t);
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-canary-resume',
    observedAt,
    canaryIndex: 0,
    canarySize: 4,
  };
  let fetches = 0;
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async (target) => responseFor(target, fetches++),
    afterRecord: async () => { throw new Error('simulated AO interruption'); },
  }), /simulated AO interruption/);
  assert.equal(fetches, 1);

  let resumedFetches = 0;
  let sleeps = 0;
  const resumed = await collectAoRetailLifecycleRefreshRun({ ...options, resume: true }, {
    ...f.dependencies,
    sleep: async (ms) => { assert.equal(ms, 1000); sleeps += 1; },
    fetchAoTarget: async (target) => responseFor(target, 10 + resumedFetches++),
  });
  assert.equal(resumedFetches, 3);
  assert.equal(sleeps, 3);
  assert.equal(resumed.run.summary.records, 4);
  assert.equal(resumed.run.summary.succeeded, 4);
  assert.equal(resumed.run.summary.failed, 0);

  const output = join(f.storageRoot, 'retailer-observations.json');
  const applied = await applyRetailLifecycleRefreshRunFromRepository({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: options.runId,
    output,
  }, f.dependencies);
  assert.equal(
    applied.ledger.summary.authoritativeTypedObservations,
    f.authoritativeTypedObservations + 4,
  );
  assert.equal(applied.ledger.summary.collectionAttempts, f.collectionAttempts + 4);
});

test('AO HTTP 429 blocks the run and produces no replayable manifest', async (t) => {
  const f = await fixture(t);
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-canary-rate-limited',
    observedAt,
    canaryIndex: 0,
    canarySize: 1,
  };
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    fetchAoTarget: async () => { throw new Error('AO API HTTP 429'); },
  }), /HTTP_POLICY_STOP/);
  const runDirectory = join(f.storageRoot, 'runs/retail-lifecycle-refresh', options.runId);
  const state = JSON.parse(await readFile(join(runDirectory, 'state.json')));
  assert.equal(state.status, 'blocked');
  assert.equal(state.stopReason, 'HTTP_POLICY_STOP');
  await assert.rejects(() => readFile(join(runDirectory, 'run.json')), /ENOENT/);
});

test('AO consecutive ordinary failures trip the persisted circuit breaker', async (t) => {
  const f = await fixture(t);
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'ao-canary-consecutive-failures',
    observedAt,
    canaryIndex: 0,
    canarySize: 2,
  };
  await assert.rejects(() => collectAoRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    sleep: async () => {},
    fetchAoTarget: async () => { throw new Error('AO API HTTP 503'); },
  }), /CONSECUTIVE_FAILURE_STOP/);
  const runDirectory = join(f.storageRoot, 'runs/retail-lifecycle-refresh', options.runId);
  const state = JSON.parse(await readFile(join(runDirectory, 'state.json')));
  assert.equal(state.status, 'blocked');
  assert.equal(state.stopReason, 'CONSECUTIVE_FAILURE_STOP');
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].outcome, 'failed');
  await assert.rejects(() => readFile(join(runDirectory, 'run.json')), /ENOENT/);
});
