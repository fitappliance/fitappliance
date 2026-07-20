import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { applyRetailLifecycleRefreshRunFromRepository } from '../../scripts/architecture-v2/apply-retail-lifecycle-refresh.mjs';
import { collectPartnerizeRetailLifecycleRefreshRun } from '../../scripts/architecture-v2/run-retail-lifecycle-refresh.mjs';
import { buildRetailerSourceAcquisitionReceipt } from '../../src/domain/retailer-source-acquisition-receipt.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
const observedAt = '2026-07-20T14:56:53.000Z';

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

function fixtureInventory(item) {
  const sourceTask = item.sourceTasks.find((candidate) => (
    candidate.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'
  ));
  const runnableItem = {
    canonicalProductId: item.canonicalProductId,
    legacyRuntimeId: item.legacyRuntimeId,
    category: item.category,
    brand: item.brand,
    model: item.model,
    lifecycleState: 'UNKNOWN_RETAIL',
    executionDisposition: 'RUNNABLE_AUTHORIZED_SOURCE',
    sourceTasks: [{
      ...sourceTask,
      terminalObservationState: 'LEGACY_UNKNOWN',
      action: 'REPLAY_AUTHORIZED_PARTNER_FEED',
      executionState: 'RUNNABLE_AUTHORIZED_SOURCE',
      collectionMode: 'partnerize_feed_only',
    }],
  };
  const inventory = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-refresh-inventory-v1',
    releaseEpoch: 'retail-lifecycle-runner-test-fixture',
    asOf: observedAt,
    sourceBindings: {
      shadowSha256: 'a'.repeat(64),
      shadowSemanticSha256: 'b'.repeat(64),
      coverageSha256: 'c'.repeat(64),
      coverageSemanticSha256: 'd'.repeat(64),
    },
    items: [runnableItem],
    summary: {
      products: 1,
      listings: 1,
      byExecutionDisposition: { RUNNABLE_AUTHORIZED_SOURCE: 1 },
      bySourceExecutionState: { RUNNABLE_AUTHORIZED_SOURCE: 1 },
    },
  };
  const semanticSha256 = sha256(JSON.stringify(canonical(inventory)));
  inventory.inventoryId = `retail_lifecycle_refresh_${semanticSha256.slice(0, 24)}`;
  inventory.semanticSha256 = semanticSha256;
  return inventory;
}

async function fixture(t) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-retailer-refresh-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const root = join(storageRoot, 'repo');
  const [repositoryInventory, projection, ledger, policy] = await Promise.all([
    readFile(join(repoRoot, 'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/generated/public-catalog-projection.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/observations/retailer-observations.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/policies/retailer-source-policy.json'), 'utf8').then(JSON.parse),
  ]);
  const item = repositoryInventory.items.find((candidate) => candidate.sourceTasks.some((task) => (
    task.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'
  )));
  assert.ok(item, 'fixture requires a TGG baseline listing');
  const inventory = fixtureInventory(item);
  const task = item.sourceTasks.find((candidate) => (
    candidate.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'
  ));
  const product = projection.products.find((candidate) => candidate.canonicalProductId === item.canonicalProductId);
  const category = {
    fridge: 'Fridges & Freezers > Refrigerators > French Door Fridges',
    dishwasher: 'Cooking & Dishwashers > Dishwashers > Freestanding Dishwashers',
    dryer: 'Laundry > Dryers > Heat Pump Dryers',
    washing_machine: 'Laundry > Washing Machines > Front Load Washing Machines',
  }[product.cat];
  assert.ok(category, `fixture category unsupported: ${product.cat}`);
  const destination = encodeURIComponent(task.url);
  const header = 'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber';
  const row = [
    category,
    'AUD',
    '999.00',
    product.model,
    'Yes',
    `${product.brand} ${product.model}`,
    `https://prf.hn/click/camref:redacted/destination:${destination}`,
    product.brand,
    '50000001',
  ].join('|');
  const feedPath = join(storageRoot, 'fixture-feed.csv');
  await writeFile(feedPath, `${header}\n${row}\n`);
  await Promise.all([
    writeFixtureJson(root, 'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json', inventory),
    writeFixtureJson(root, 'data/architecture-v2/generated/public-catalog-projection.json', projection),
    writeFixtureJson(root, 'data/architecture-v2/observations/retailer-observations.json', ledger),
    writeFixtureJson(root, 'data/architecture-v2/policies/retailer-source-policy.json', policy),
  ]);
  return {
    storageRoot,
    root,
    feedPath,
    product,
    authoritativeTypedObservations: ledger.summary.authoritativeTypedObservations,
    dependencies: {
      storageIdentity: {
        root: storageRoot,
        markerSha256: 'a'.repeat(64),
        volumeUuid: 'fixture-volume',
      },
      isProcessAlive: async () => false,
      now: () => '2026-07-20T15:00:00.000Z',
    },
  };
}

test('Partnerize refresh checkpoints raw evidence, resumes after interruption, and replays completed runs', async (t) => {
  const f = await fixture(t);
  const options = {
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'partnerize-crash-resume',
    feedPath: f.feedPath,
    observedAt,
  };
  await assert.rejects(() => collectPartnerizeRetailLifecycleRefreshRun(options, {
    ...f.dependencies,
    afterObjectStored: async () => { throw new Error('simulated interruption'); },
  }), /simulated interruption/);
  const runDirectory = join(f.storageRoot, 'runs/retail-lifecycle-refresh', options.runId);
  await assert.rejects(() => readFile(join(runDirectory, 'run.json')), /ENOENT/);
  const state = JSON.parse(await readFile(join(runDirectory, 'state.json')));
  assert.equal(state.status, 'source_stored');

  const resumed = await collectPartnerizeRetailLifecycleRefreshRun({
    ...options,
    feedPath: null,
    resume: true,
  }, f.dependencies);
  assert.equal(resumed.run.summary.observations, 1);
  assert.equal(resumed.run.records[0].snapshot.rows[0].canonicalProductId, f.product.canonicalProductId);
  assert.equal(resumed.resumedCompletedRun, false);

  const repeated = await collectPartnerizeRetailLifecycleRefreshRun({
    ...options,
    feedPath: null,
    resume: true,
  }, f.dependencies);
  assert.deepEqual(repeated.run, resumed.run);
  assert.equal(repeated.resumedCompletedRun, true);
});

test('repository application is idempotent and rejects a tampered external object', async (t) => {
  const f = await fixture(t);
  const runId = 'partnerize-apply';
  const collected = await collectPartnerizeRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId,
    feedPath: f.feedPath,
    observedAt,
  }, f.dependencies);
  const output = join(f.storageRoot, 'retailer-observations.json');
  const applyOptions = { root: f.root, storageRoot: f.storageRoot, runId, output };
  const first = await applyRetailLifecycleRefreshRunFromRepository(applyOptions, f.dependencies);
  const firstBytes = await readFile(output);
  const second = await applyRetailLifecycleRefreshRunFromRepository(applyOptions, f.dependencies);
  const secondBytes = await readFile(output);
  assert.deepEqual(second.ledger, first.ledger);
  assert.deepEqual(secondBytes, firstBytes);
  assert.equal(
    first.ledger.summary.authoritativeTypedObservations,
    f.authoritativeTypedObservations + 1,
  );

  const objectPath = collected.run.records[0].rawObject.objectPath;
  await writeFile(join(f.storageRoot, ...objectPath.split('/')), 'tampered');
  await assert.rejects(
    () => applyRetailLifecycleRefreshRunFromRepository(applyOptions, f.dependencies),
    /raw object.*mismatch|byte size mismatch/i,
  );
});

test('Partnerize runner binds a verified acquisition receipt and derives observedAt from it', async (t) => {
  const f = await fixture(t);
  const policyPath = join(f.root, 'data/architecture-v2/policies/retailer-source-policy.json');
  const policyBytes = await readFile(policyPath);
  const policy = JSON.parse(policyBytes);
  const source = policy.sources.find((candidate) => candidate.id === 'the-good-guys-partnerize-feed-v1');
  const feedBytes = await readFile(f.feedPath);
  const receipt = buildRetailerSourceAcquisitionReceipt({
    sourcePolicyId: source.id,
    sourcePolicySha256: createHash('sha256').update(policyBytes).digest('hex'),
    acquisitionHosts: source.acquisitionHosts,
    requestedUrl: 'https://feeds.performancehorizon.com/private/feed.csv',
    finalUrl: 'https://feeds.performancehorizon.com/private/feed.csv',
    redirects: [],
    startedAt: '2026-07-21T01:00:00.000Z',
    receivedAt: '2026-07-21T01:00:01.000Z',
    responseStatus: 200,
    responseHeaders: { 'content-type': 'text/csv' },
    rawBytes: feedBytes,
    mediaType: 'text/csv',
  });
  const receiptPath = join(f.storageRoot, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`);

  const collected = await collectPartnerizeRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'partnerize-receipt-bound',
    feedPath: f.feedPath,
    acquisitionReceiptPath: receiptPath,
    observedAt: null,
  }, f.dependencies);
  const record = collected.run.records[0];
  assert.equal(collected.run.plan.observedAt, receipt.receivedAt);
  assert.equal(record.rawObject.acquisitionReceipt.semanticSha256, receipt.semanticSha256);
  assert.equal(record.snapshot.acquisitionReceiptSha256, receipt.semanticSha256);

  const mismatchedFeed = join(f.storageRoot, 'mismatched-feed.csv');
  await writeFile(mismatchedFeed, 'different bytes');
  await assert.rejects(() => collectPartnerizeRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId: 'partnerize-receipt-mismatch',
    feedPath: mismatchedFeed,
    acquisitionReceiptPath: receiptPath,
    observedAt: null,
  }, f.dependencies), /receipt payload|payload hash|byte size/i);
});
