import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  canonicalizeBrand,
  filterByBrandCanon,
  isDroppedBrand,
} = require('../scripts/brand-canon.js');

test('canonicalizeBrand applies alias map case-insensitively', () => {
  assert.equal(canonicalizeBrand('MIDEA'), 'Midea');
  assert.equal(canonicalizeBrand('midea'), 'Midea');
  assert.equal(canonicalizeBrand(' MIDEA '), 'Midea');
});

test('canonicalizeBrand returns trimmed original for unknown brands', () => {
  assert.equal(canonicalizeBrand('UnknownBrand'), 'UnknownBrand');
  assert.equal(canonicalizeBrand(' UnknownBrand '), 'UnknownBrand');
});

test('canonicalizeBrand returns empty string for empty input', () => {
  assert.equal(canonicalizeBrand(''), '');
  assert.equal(canonicalizeBrand(null), '');
  assert.equal(canonicalizeBrand(undefined), '');
});

test('filterByBrandCanon does not mutate input array or products', () => {
  const products = [
    { id: 'p1', brand: 'MIDEA', cat: 'fridge', w: 600 },
    { id: 'p2', brand: 'UnknownBrand', cat: 'dryer', w: 500 },
  ];
  const before = JSON.stringify(products);

  const result = filterByBrandCanon(products);

  assert.notEqual(result, products);
  assert.equal(JSON.stringify(products), before);
  assert.equal(result[0], products[0], 'empty drop list should return an array-level shallow copy');
});

test('filterByBrandCanon keeps all products when drop_brands is empty', () => {
  const products = [
    { id: 'p1', brand: 'MIDEA' },
    { id: 'p2', brand: 'Sub-Zero' },
  ];

  const result = filterByBrandCanon(products);

  assert.deepEqual(result.map((product) => product.id), ['p1', 'p2']);
});

test('filterByBrandCanon handles nullish input gracefully', () => {
  assert.deepEqual(filterByBrandCanon(null), []);
  assert.deepEqual(filterByBrandCanon(undefined), []);
});

test('isDroppedBrand is false for audit candidates in alias-only scope', () => {
  assert.equal(isDroppedBrand('Sub-Zero'), false);
  assert.equal(isDroppedBrand('CHIQ'), false);
  assert.equal(isDroppedBrand('SEIKI'), false);
  assert.equal(isDroppedBrand('Solt'), false);
});
