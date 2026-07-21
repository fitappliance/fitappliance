import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const REQUIRED_RETAILERS = [
  'JB Hi-Fi',
  'Appliances Online',
  'Harvey Norman',
  'The Good Guys',
  'Bing Lee',
];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function retailerNames(retailers = []) {
  return retailers.map((retailer) => retailer.n);
}

function assertReviewedPricePolicy(retailer, context) {
  if (retailer.source === 'partnerize-feed') {
    assert.equal(retailer.n, 'The Good Guys', `${context} Partnerize feed rows should currently be TGG-only`);
    assert.ok(Number(retailer.p) > 0, `${context} Partnerize feed rows may expose trusted feed prices`);
    assert.equal(retailer.affiliate_network, 'partnerize', `${context} must preserve Partnerize attribution`);
    assert.match(retailer.affiliate_url, /^https:\/\/prf\.hn\/click\//, `${context} must preserve Partnerize tracking URL`);
    return;
  }

  assert.equal(retailer.p, null, `${context} non-feed prices stay null until separately verified`);
}

test('manual retailer data: HRCD640TBW keeps all verified retailer links side by side', () => {
  const manual = readJson('data/manual-retailers.json');
  const entry = manual.products['fridge-arf3453'];

  assert.equal(entry?.approved, true);
  assert.deepEqual(retailerNames(entry.retailers).sort(), [...REQUIRED_RETAILERS].sort());

  for (const retailer of entry.retailers) {
    assert.match(retailer.url, /^https:\/\/(www\.)?/, `${retailer.n} should have a real product URL`);
    assertReviewedPricePolicy(retailer, `HRCD640TBW ${retailer.n}`);
  }
});

test('manual retailer data: runtime catalog exposes only lifecycle-authorized HRCD640TBW retailer choices', () => {
  const fridges = readJson('public/data/fridges.json').products;
  const product = fridges.find((item) => item.id === 'fridge-arf3453');

  assert.ok(product, 'sample product should exist in fridge catalog');
  if (!product.retailLifecycle) {
    assert.deepEqual(retailerNames(product.retailers).sort(), [...REQUIRED_RETAILERS].sort());
    return;
  }
  const observations = product.retailLifecycle.latestObservations
    .filter((observation) => observation.availability === 'available');
  assert.deepEqual(
    retailerNames(product.retailers).sort(),
    observations.map((observation) => observation.retailer).sort(),
  );
  assert.deepEqual(
    product.retailers.map((retailer) => retailer.url).sort(),
    observations.map((observation) => observation.url).sort(),
  );
});

test('manual retailer data: approved retailer links never keep placeholder empty URLs', () => {
  const manual = readJson('data/manual-retailers.json');

  for (const [slug, entry] of Object.entries(manual.products)) {
    if (entry.approved !== true) continue;
    for (const retailer of entry.retailers ?? []) {
      assert.match(
        retailer.url,
        /^https:\/\/(www\.)?/,
        `${slug} ${retailer.n} should use a verified product URL, not a placeholder`
      );
    }
  }
});
