import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findChassisCandidates } = require('../scripts/suggest-door-swing.js');

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'WESTINGHOUSE',
    model: 'WBE4500WC',
    w: 600,
    h: 1725,
    door_swing_mm: null,
    ...overrides
  };
}

test('task 11 suggest-swing: returns same brand+cat exact width candidates', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [
    source,
    makeProduct({ id: 'match', w: 600 }),
    makeProduct({ id: 'other-brand', brand: 'LG', w: 600 })
  ];

  const result = findChassisCandidates(products, source, { widthTolerance: 5 });
  assert.deepEqual(result.map((product) => product.id), ['match']);
});

test('task 11 suggest-swing: respects ±5mm tolerance window', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [
    source,
    makeProduct({ id: 'in', w: 604 }),
    makeProduct({ id: 'out', w: 606 })
  ];

  const result = findChassisCandidates(products, source, { widthTolerance: 5 });
  assert.deepEqual(result.map((product) => product.id), ['in']);
});

test('task 11 suggest-swing: excludes source product itself', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [source];

  const result = findChassisCandidates(products, source, { widthTolerance: 5 });
  assert.deepEqual(result, []);
});

test('task 11 suggest-swing: excludes products with resolved door_swing_mm values', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [
    source,
    makeProduct({ id: 'resolved-zero', w: 600, door_swing_mm: 0 }),
    makeProduct({ id: 'resolved-positive', w: 600, door_swing_mm: 35 }),
    makeProduct({ id: 'pending', w: 600, door_swing_mm: null })
  ];

  const result = findChassisCandidates(products, source, { widthTolerance: 5 });
  assert.deepEqual(result.map((product) => product.id), ['pending']);
});

test('task 11 suggest-swing: returns empty when there are no matching candidates', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [
    source,
    makeProduct({ id: 'different-width', w: 750 }),
    makeProduct({ id: 'different-cat', cat: 'dishwasher', w: 600 })
  ];

  const result = findChassisCandidates(products, source, { widthTolerance: 5 });
  assert.deepEqual(result, []);
});

test('task 11 suggest-swing: widthTolerance=0 requires exact width matches', () => {
  const source = makeProduct({ id: 'source', w: 600 });
  const products = [
    source,
    makeProduct({ id: 'w600', w: 600 }),
    makeProduct({ id: 'w601', w: 601 })
  ];

  const result = findChassisCandidates(products, source, { widthTolerance: 0 });
  assert.deepEqual(result.map((product) => product.id), ['w600']);
});
