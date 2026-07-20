import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { acquirePartnerizeFeedToStorage } from '../../scripts/architecture-v2/acquire-partnerize-feed.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);

test('authorized Partnerize acquisition stores immutable bytes and a secret-safe receipt', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-partnerize-acquisition-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const csv = Buffer.from('Category|Stock\nDishwashers|Yes\n');
  const result = await acquirePartnerizeFeedToStorage({
    root: repoRoot,
    storageRoot,
    url: 'https://feeds.performancehorizon.com/private/token.csv?secret=value',
  }, {
    storageIdentity: { root: storageRoot, markerSha256: 'a'.repeat(64), volumeUuid: 'fixture-volume' },
    fetchImpl: async () => new Response(csv, {
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-length': String(csv.length) },
    }),
    now: (() => {
      const values = ['2026-07-21T01:00:00.000Z', '2026-07-21T01:00:01.000Z'];
      return () => values.shift();
    })(),
  });

  assert.deepEqual(await readFile(result.feedPath), csv);
  const receiptBytes = await readFile(result.receiptPath, 'utf8');
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.acquisitionId, result.acquisitionId);
  assert.equal(receiptBytes.includes('private/token.csv'), false);
  assert.equal(receiptBytes.includes('secret=value'), false);
  assert.equal(result.receivedAt, '2026-07-21T01:00:01.000Z');
});

test('Partnerize acquisition requires an environment-provided URL and approved source policy', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-partnerize-acquisition-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const dependencies = {
    storageIdentity: { root: storageRoot, markerSha256: 'a'.repeat(64), volumeUuid: 'fixture-volume' },
  };
  await assert.rejects(() => acquirePartnerizeFeedToStorage({
    root: repoRoot, storageRoot, url: null,
  }, dependencies), /feed URL.*required/i);
  await assert.rejects(() => acquirePartnerizeFeedToStorage({
    root: repoRoot,
    storageRoot,
    sourcePolicyId: 'bing-lee-product-page-v1',
    url: 'https://www.binglee.com.au/product',
  }, dependencies), /authorised partner feed|authorized partner feed/i);
});
