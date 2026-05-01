import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

const {
  applyManualRetailers,
  mergeRetailers,
} = require('../scripts/enrich-manual-retailers.js');

function makeProduct(overrides = {}) {
  return {
    id: 'fridge-lg-gth560npl',
    brand: 'LG',
    model: 'GTH560NPL',
    cat: 'fridge',
    w: 780,
    h: 1720,
    d: 730,
    kwh_year: 420,
    retailers: [],
    unavailable: true,
    ...overrides,
  };
}

const approvedEntry = {
  researched_at: '2026-04-27T00:00:00.000Z',
  approved: true,
  approved_by: 'JZ',
  confidence: 'high',
  retailers: [
    {
      n: 'JB Hi-Fi',
      url: 'https://www.jbhifi.com.au/products/lg-gth560npl',
      p: 1099,
      verified_at: '2026-04-27T00:00:00.000Z',
      source: 'manual',
    },
  ],
};

test('manual retailer enrich: unapproved candidates are not merged', () => {
  const products = [makeProduct()];
  const manual = {
    products: {
      'fridge-lg-gth560npl': { ...approvedEntry, approved: false },
    },
  };

  const result = applyManualRetailers(products, manual);

  assert.deepEqual(result, products);
  assert.notEqual(result, products, 'array copy should be returned even when no product changes');
});

test('manual retailer enrich: approved entry merges into matching product by slug/id', () => {
  const products = [makeProduct()];
  const manual = { products: { 'fridge-lg-gth560npl': approvedEntry } };

  const result = applyManualRetailers(products, manual);

  assert.equal(result[0].retailers.length, 1);
  assert.equal(result[0].retailers[0].n, 'JB Hi-Fi');
  assert.equal(result[0].retailers[0].p, 1099);
  assert.equal(result[0].unavailable, false);
});

test('manual retailer enrich: same retailer name replaces old entry instead of duplicating', () => {
  const existing = { n: 'JB Hi-Fi', url: 'https://old.example/product', p: 1299 };
  const merged = mergeRetailers([existing], approvedEntry.retailers);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, 'https://www.jbhifi.com.au/products/lg-gth560npl');
  assert.equal(merged[0].p, 1099);
});

test('manual retailer enrich: new retailer is appended after existing retailers', () => {
  const existing = [{ n: 'Harvey Norman', url: 'https://www.harveynorman.com.au/p/lg-gth560npl', p: 1199 }];
  const merged = mergeRetailers(existing, approvedEntry.retailers);

  assert.deepEqual(merged.map((retailer) => retailer.n), ['Harvey Norman', 'JB Hi-Fi']);
});

test('manual retailer enrich: product dimensions and energy fields are preserved', () => {
  const products = [makeProduct({ w: 812, h: 1790, kwh_year: 399 })];
  const before = JSON.stringify(products);

  const result = applyManualRetailers(products, { products: { 'fridge-lg-gth560npl': approvedEntry } });

  assert.equal(JSON.stringify(products), before, 'input products must not mutate');
  assert.equal(result[0].w, 812);
  assert.equal(result[0].h, 1790);
  assert.equal(result[0].kwh_year, 399);
});

test('manual retailer enrich: approved washing-machine data creates retailer-linked catalog rows', () => {
  const manual = JSON.parse(fs.readFileSync('data/manual-retailers.json', 'utf8'));
  const washingMachines = JSON.parse(fs.readFileSync('public/data/washing-machines.json', 'utf8')).products;

  const result = applyManualRetailers(washingMachines, manual);
  const linked = result.filter((product) => product.cat === 'washing_machine' && product.retailers?.length > 0);

  assert.ok(linked.length >= 12, `expected at least 12 washing-machine products with retailer links, got ${linked.length}`);
  assert.ok(
    linked.some((product) => product.brand === 'Hisense' && product.retailers.some((retailer) => retailer.n === 'Appliances Online')),
    'Hisense washing-machine entries should include Appliances Online where reviewed',
  );
  assert.ok(
    linked.every((product) => product.unavailable === false),
    'retailer-linked manual washing-machine products should be marked available',
  );
});

test('manual retailer enrich: approved dishwasher and dryer data creates retailer-linked catalog rows', () => {
  const manual = JSON.parse(fs.readFileSync('data/manual-retailers.json', 'utf8'));
  const dishwashers = JSON.parse(fs.readFileSync('public/data/dishwashers.json', 'utf8')).products;
  const dryers = JSON.parse(fs.readFileSync('public/data/dryers.json', 'utf8')).products;

  const enrichedDishwashers = applyManualRetailers(dishwashers, manual);
  const enrichedDryers = applyManualRetailers(dryers, manual);
  const linkedDishwashers = enrichedDishwashers.filter((product) => product.cat === 'dishwasher' && product.retailers?.length > 0);
  const linkedDryers = enrichedDryers.filter((product) => product.cat === 'dryer' && product.retailers?.length > 0);

  assert.ok(linkedDishwashers.length >= 12, `expected at least 12 dishwasher products with retailer links, got ${linkedDishwashers.length}`);
  assert.ok(linkedDryers.length >= 4, `expected at least 4 dryer products with retailer links, got ${linkedDryers.length}`);
  assert.ok(
    linkedDishwashers.some((product) => product.brand === 'Haier' && product.retailers.some((retailer) => retailer.n === 'Appliances Online')),
    'Haier dishwasher entries should include Appliances Online where reviewed',
  );
  assert.ok(
    linkedDryers.some((product) => product.brand === 'Electrolux' && product.retailers.some((retailer) => retailer.n === 'Appliances Online')),
    'Electrolux dryer entries should include Appliances Online where reviewed',
  );
  assert.ok(
    [...linkedDishwashers, ...linkedDryers].every((product) => product.unavailable === false),
    'retailer-linked manual dishwasher and dryer products should be marked available',
  );
});
