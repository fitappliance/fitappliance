import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { applyRetailLifecycleRefreshRunFromRepository } from '../../scripts/architecture-v2/apply-retail-lifecycle-refresh.mjs';
import { collectPartnerizeRetailLifecycleRefreshRun } from '../../scripts/architecture-v2/run-retail-lifecycle-refresh.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
const observedAt = '2026-07-20T14:56:53.000Z';

async function fixture(t) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-retailer-refresh-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const [inventory, projection, ledger] = await Promise.all([
    readFile(join(repoRoot, 'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/generated/public-catalog-projection.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'data/architecture-v2/observations/retailer-observations.json'), 'utf8').then(JSON.parse),
  ]);
  const item = inventory.items.find((candidate) => candidate.sourceTasks.some((task) => (
    task.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'
  )));
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
  return {
    storageRoot,
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
    root: repoRoot,
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
    root: repoRoot,
    storageRoot: f.storageRoot,
    runId,
    feedPath: f.feedPath,
    observedAt,
  }, f.dependencies);
  const output = join(f.storageRoot, 'retailer-observations.json');
  const applyOptions = { root: repoRoot, storageRoot: f.storageRoot, runId, output };
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
