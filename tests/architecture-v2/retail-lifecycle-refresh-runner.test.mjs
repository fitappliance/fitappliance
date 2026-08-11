import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { collectPartnerizeRetailLifecycleRefreshRun } from '../../scripts/architecture-v2/run-retail-lifecycle-refresh.mjs';
import { buildRetailerObservationLedger } from '../../src/domain/retailer-observation-ledger.mjs';

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
  const policy = JSON.parse(await readFile(
    join(repoRoot, 'data/architecture-v2/policies/retailer-source-policy.json'),
    'utf8',
  ));
  const product = {
    id: 'fixture-one',
    canonicalProductId: 'fa_prod_partnerize_fixture',
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
  };
  const projection = { schemaVersion: 1, products: [product] };
  const task = {
    baselineLinkId: 'retail_link_partnerize_fixture',
    retailer: 'The Good Guys',
    url: product.retailers[0].url,
    originSource: 'partnerize-feed',
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
  };
  const item = {
    canonicalProductId: product.canonicalProductId,
    legacyRuntimeId: product.id,
    category: product.cat,
    brand: product.brand,
    model: product.model,
    sourceTasks: [task],
  };
  const inventory = fixtureInventory(item);
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
  const projectionBytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`);
  const policyBytes = Buffer.from(`${JSON.stringify(policy, null, 2)}\n`);
  const ledger = buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection: projection,
    publicProjectionSha256: sha256(projectionBytes),
    sourcePolicy: policy,
    sourcePolicySha256: sha256(policyBytes),
    typedSnapshots: [],
  });
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

test('private Partnerize evidence cannot enter the public lifecycle refresh runner', async (t) => {
  const f = await fixture(t);
  const runId = 'partnerize-private-boundary';
  await assert.rejects(() => collectPartnerizeRetailLifecycleRefreshRun({
    root: f.root,
    storageRoot: f.storageRoot,
    runId,
    feedPath: f.feedPath,
    observedAt,
  }, f.dependencies), /source is not approved for a supported refresh mode/i);

  const runDirectory = join(f.storageRoot, 'runs/retail-lifecycle-refresh', runId);
  await assert.rejects(() => readFile(join(runDirectory, 'plan.json')), /ENOENT/);
  await assert.rejects(() => readFile(join(runDirectory, 'state.json')), /ENOENT/);
  await assert.rejects(() => readFile(join(runDirectory, 'run.json')), /ENOENT/);
});
