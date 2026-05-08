import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateProduct } = require('../scripts/schema.js');
const { hasRetailerLink } = require('../public/scripts/search-core.js');

function makeProduct(overrides = {}) {
  return {
    id: 'fridge-lg-current',
    cat: 'fridge',
    brand: 'LG',
    model: 'CURRENT-1',
    emoji: 'F',
    w: 600,
    h: 1700,
    d: 650,
    kwh_year: 350,
    stars: 4,
    price: null,
    door_swing_mm: null,
    features: [],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides,
  };
}

test('active/current schema: unavailable is required on runtime products', () => {
  const { unavailable, ...withoutUnavailable } = makeProduct();
  const errors = validateProduct(withoutUnavailable);

  assert.ok(errors.some((error) => error.includes('field unavailable must be boolean')));
});

test('active/current catalog invariant: every current row has a verified product-page retailer link', () => {
  const files = [
    'public/data/fridges.json',
    'public/data/dishwashers.json',
    'public/data/dryers.json',
    'public/data/washing-machines.json',
  ];
  const violations = [];

  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
    for (const product of document.products) {
      if (product.unavailable === false && !hasRetailerLink(product)) {
        violations.push(`${file}:${product.id}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
