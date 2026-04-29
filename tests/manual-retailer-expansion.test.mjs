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

test('manual retailer data: HRCD640TBW keeps all verified retailer links side by side', () => {
  const manual = readJson('data/manual-retailers.json');
  const entry = manual.products['fridge-arf3453'];

  assert.equal(entry?.approved, true);
  assert.deepEqual(retailerNames(entry.retailers).sort(), [...REQUIRED_RETAILERS].sort());

  for (const retailer of entry.retailers) {
    assert.match(retailer.url, /^https:\/\/(www\.)?/, `${retailer.n} should have a real product URL`);
    assert.equal(retailer.p, null, `${retailer.n} prices stay null until separately verified`);
  }
});

test('manual retailer data: enriched fridge catalog exposes all HRCD640TBW retailer choices', () => {
  const fridges = readJson('public/data/fridges.json').products;
  const product = fridges.find((item) => item.id === 'fridge-arf3453');

  assert.ok(product, 'sample product should exist in fridge catalog');
  assert.deepEqual(retailerNames(product.retailers).sort(), [...REQUIRED_RETAILERS].sort());
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
