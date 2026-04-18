import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  inferFromDocument,
  inferUprightSwingFromWidth
} = require('../scripts/infer-door-swing.js');

function baseProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'BrandX',
    model: 'ModelX',
    w: 600,
    h: 1700,
    d: 650,
    kwh_year: 250,
    stars: 4,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: ['Upright', '1', 'Class 1'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

function makeDoc(products) {
  return {
    schema_version: 2,
    last_updated: '2026-04-18',
    products
  };
}

test('task 18 infer: chest fridge with type 1 is inferred as zero swing', () => {
  const doc = makeDoc([
    baseProduct({
      id: 'f-chest-type1',
      features: ['Chest', '1', 'Class 1']
    })
  ]);

  const result = inferFromDocument(doc);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
  assert.equal(result.document.products[0].inferred_door_swing, true);
});

test('task 18 infer: bottom mount config is inferred as zero swing', () => {
  const doc = makeDoc([
    baseProduct({
      id: 'f-bottom-mount',
      features: ['Bottom Mount', '1', 'Class 1']
    })
  ]);

  const result = inferFromDocument(doc);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
});

test('task 18 infer: upright type 1 remains unresolved in pass one', () => {
  const doc = makeDoc([
    baseProduct({
      id: 'f-upright-type1',
      features: ['Upright', '1', 'Class 1']
    })
  ]);

  const result = inferFromDocument(doc);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.document.products[0].door_swing_mm, null);
});

test('task 18 infer: inferUprightSwingFromWidth sets door_swing_mm to width for Upright', () => {
  const doc = makeDoc([baseProduct({ id: 'f-up', features: ['Upright', '1', 'Class 1'], w: 590 })]);
  const result = inferUprightSwingFromWidth(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 590);
  assert.equal(result.document.products[0].inferred_door_swing, true);
});

test('task 18 infer: inferUprightSwingFromWidth sets door_swing_mm to width for Top Mount', () => {
  const doc = makeDoc([baseProduct({ id: 'f-top', features: ['Top Mount', '5T', 'Class 5'], w: 600 })]);
  const result = inferUprightSwingFromWidth(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 600);
});

test('task 18 infer: inferUprightSwingFromWidth skips non-fridge, prefilled, unknown config, narrow, and missing width', () => {
  const doc = makeDoc([
    baseProduct({ id: 'x-non-fridge', cat: 'dryer', w: 600 }),
    baseProduct({ id: 'x-prefilled', door_swing_mm: 20, w: 600 }),
    baseProduct({ id: 'x-unknown-config', features: ['French Door', '5B', 'Class 6'], w: 700 }),
    baseProduct({ id: 'x-narrow', features: ['Upright', '1', 'Class 1'], w: 399 }),
    baseProduct({ id: 'x-missing-width', features: ['Top Mount', '5T', 'Class 5'], w: null })
  ]);

  const result = inferUprightSwingFromWidth(doc);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.document.products.every((product) => product.door_swing_mm !== undefined), true);
  assert.equal(result.document.products.every((product) => product.inferred_door_swing === undefined), true);
});

test('task 18 infer: pass one + pass two resolves all synthetic fridge nulls', () => {
  const doc = makeDoc([
    baseProduct({ id: 'f-a', features: ['Chest', '1', 'Class 1'] }),
    baseProduct({ id: 'f-b', features: ['Bottom Mount', '1', 'Class 1'] }),
    baseProduct({ id: 'f-c', features: ['Upright', '1', 'Class 1'], w: 595 }),
    baseProduct({ id: 'f-d', features: ['Top Mount', '5T', 'Class 5'], w: 540 })
  ]);

  const firstPass = inferFromDocument(doc);
  const secondPass = inferUprightSwingFromWidth(firstPass.document);
  const unresolved = secondPass.document.products.filter((product) => product.door_swing_mm === null);

  assert.equal(unresolved.length, 0);
});
