import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

import { deriveListingTransitions } from '../../src/domain/retailer-source-adapter.mjs';

const require = createRequire(import.meta.url);
const {
  buildPartnerizeRetailerSnapshot,
} = require('../../scripts/affiliate/partnerize-tgg.js');

const adapter = {
  id: 'the-good-guys-partnerize-feed-v1',
  retailer: 'The Good Guys',
  sourceType: 'affiliate_feed',
  allowedHosts: ['www.thegoodguys.com.au'],
  minimumIntervalMs: 1000,
  robotsReviewedAt: '2026-07-11',
  termsReviewedAt: '2026-07-11',
  policyVersion: 'retailer-source-policy-v2:the-good-guys-partnerize-feed-v1',
  expectedCadenceHours: 24,
  maximumCurrentAgeHours: 72,
};

const header = 'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber';
const category = 'Cooking & Dishwashers > Dishwashers > Freestanding Dishwashers';
function feedRow({ model, stock, tggSku, title = `${model} dishwasher` }) {
  const destination = encodeURIComponent(`https://www.thegoodguys.com.au/example-dishwasher-${model.toLowerCase()}`);
  return `${category}|AUD|999.00|${model}|${stock}|${title}|https://prf.hn/click/camref:redacted/destination:${destination}|Fixture|${tggSku}`;
}

function catalog(model, suffix = '') {
  return {
    canonicalProductId: `fa_prod_${model.toLowerCase()}${suffix}`,
    cat: 'dishwasher',
    brand: 'Fixture',
    model,
  };
}

test('Partnerize feed maps explicit stock values and binds the complete raw feed bytes', async () => {
  const feedBytes = Buffer.from([
    header,
    feedRow({ model: 'AVAILABLE-1', stock: 'Yes', tggSku: '50000001' }),
    feedRow({ model: 'UNAVAILABLE-1', stock: 'No', tggSku: '50000002' }),
    feedRow({ model: 'UNKNOWN-1', stock: '', tggSku: '50000003' }),
  ].join('\n'));
  const result = await buildPartnerizeRetailerSnapshot({
    adapter,
    catalogProducts: [catalog('AVAILABLE-1'), catalog('UNAVAILABLE-1'), catalog('UNKNOWN-1')],
    feedRawBytes: feedBytes,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'partnerize-feed-run:2026-07-20',
    complete: true,
  });
  assert.deepEqual(result.snapshot.rows.map((row) => [row.retailerProductId, row.availability, row.listingState]), [
    ['50000001', 'available', 'current'],
    ['50000002', 'unavailable', 'unavailable'],
    ['50000003', 'unknown', 'current'],
  ]);
  assert.equal(result.snapshot.rawPayloadSha256, createHash('sha256').update(feedBytes).digest('hex'));
  assert.equal(result.snapshot.complete, true);
  assert.deepEqual(result.quarantines, []);
});

test('incomplete Partnerize feed absence never creates an unavailable or stale transition', async () => {
  const feedBytes = Buffer.from([header, feedRow({ model: 'PRESENT-1', stock: 'Yes', tggSku: '50000011' })].join('\n'));
  const { snapshot } = await buildPartnerizeRetailerSnapshot({
    adapter,
    catalogProducts: [catalog('PRESENT-1'), catalog('ABSENT-1')],
    feedRawBytes: feedBytes,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'partnerize-feed-run:partial',
    complete: false,
  });
  const transitions = deriveListingTransitions([{
    retailerProductId: '50000012',
    listingState: 'current',
  }], snapshot);
  assert.deepEqual(transitions, []);
  assert.ok(snapshot.rows.every((row) => row.availability !== 'unavailable'));
});

test('ambiguous catalog identity and conflicting duplicate feed rows are quarantined, not guessed', async () => {
  const feedBytes = Buffer.from([
    header,
    feedRow({ model: 'DUPLICATE-1', stock: 'Yes', tggSku: '50000021' }),
    feedRow({ model: 'CONFLICT-1', stock: 'Yes', tggSku: '50000022' }),
    feedRow({ model: 'CONFLICT-1', stock: 'No', tggSku: '50000022' }),
  ].join('\n'));
  const result = await buildPartnerizeRetailerSnapshot({
    adapter,
    catalogProducts: [
      catalog('DUPLICATE-1', '-a'),
      catalog('DUPLICATE-1', '-b'),
      catalog('CONFLICT-1'),
    ],
    feedRawBytes: feedBytes,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'partnerize-feed-run:ambiguous',
    complete: true,
  });
  assert.deepEqual(result.snapshot.rows, []);
  assert.deepEqual(result.quarantines.map((row) => row.reasonCode).sort(), [
    'AMBIGUOUS_CATALOG_IDENTITY',
    'CONFLICTING_FEED_ROWS',
  ]);
});
