import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { acquirePartnerizeFeedToStorage } from '../../scripts/architecture-v2/acquire-partnerize-feed.mjs';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);

test('private-use Partnerize acquisition stores immutable bytes outside Git with a secret-safe receipt', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-partnerize-acquisition-'));
  const policyRoot = await mkdtemp(join(tmpdir(), 'fitappliance-partnerize-policy-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  t.after(() => rm(policyRoot, { recursive: true, force: true }));
  const policy = JSON.parse(await readFile(join(
    repoRoot, 'data/architecture-v2/policies/retailer-source-policy.json',
  ), 'utf8'));
  const partnerize = policy.sources.find((source) => source.id === 'the-good-guys-partnerize-feed-v1');
  assert.equal(partnerize.termsReviewState, 'reviewed_private_campaign_use');
  assert.equal(partnerize.legacyLinkAction, 'PRIVATE_EVIDENCE_ONLY');
  const policyPath = join(policyRoot, 'data/architecture-v2/policies/retailer-source-policy.json');
  await mkdir(join(policyRoot, 'data/architecture-v2/policies'), { recursive: true });
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const csv = Buffer.from('Category|Stock\nDishwashers|Yes\n');
  const result = await acquirePartnerizeFeedToStorage({
    root: policyRoot,
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
  }, dependencies), /private Partnerize acquisition/i);
});
