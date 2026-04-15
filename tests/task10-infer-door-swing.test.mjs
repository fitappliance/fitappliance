import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inferFromDocument, INFERENCE_RULES } = require('../scripts/infer-door-swing.js');
const { validateProduct } = require('../scripts/schema.js');

function makeDoc(products) {
  return {
    schema_version: 2,
    last_updated: '2026-04-15',
    products: products.map((product) => ({
      cat: 'washing_machine',
      brand: 'Test',
      model: 'M1',
      w: 600,
      h: 850,
      d: 600,
      kwh_year: 80,
      stars: 4,
      price: null,
      emoji: '🫧',
      door_swing_mm: null,
      features: [],
      retailers: [],
      sponsored: false,
      unavailable: true,
      ...product
    }))
  };
}

test('task 10 infer: washing_machine null door_swing updates to 0', () => {
  const doc = makeDoc([{ id: 'w1', cat: 'washing_machine', door_swing_mm: null, top_loader: false }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
  assert.equal(result.document.products[0].inferred_door_swing, true);
});

test('task 10 infer: dryer null door_swing updates to 0 regardless of top_loader', () => {
  const doc = makeDoc([{ id: 'd1', cat: 'dryer', door_swing_mm: null, top_loader: true }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
});

test('task 10 infer: dishwasher null door_swing updates to 0', () => {
  const doc = makeDoc([{ id: 'dw1', cat: 'dishwasher', door_swing_mm: null }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
});

test('task 10 infer: fridge null door_swing stays unchanged', () => {
  const doc = makeDoc([{ id: 'f1', cat: 'fridge', door_swing_mm: null }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 0);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, null);
  assert.equal(result.document.products[0].inferred_door_swing, undefined);
});

test('task 10 infer: existing non-null door_swing is skipped and preserved', () => {
  const doc = makeDoc([{ id: 'w2', cat: 'washing_machine', door_swing_mm: 150 }]);
  const result = inferFromDocument(doc);

  assert.equal(result.skippedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 150);
});

test('task 10 infer: existing door_swing 0 is treated as confirmed and not inferred', () => {
  const doc = makeDoc([{ id: 'dw2', cat: 'dishwasher', door_swing_mm: 0 }]);
  const result = inferFromDocument(doc);

  assert.equal(result.skippedCount, 1);
  assert.equal(result.document.products[0].inferred_door_swing, undefined);
});

test('task 10 infer: mixed fixture reports accurate counters', () => {
  const products = [
    { id: 'w1', cat: 'washing_machine', door_swing_mm: null },
    { id: 'w2', cat: 'washing_machine', door_swing_mm: null },
    { id: 'dr', cat: 'dryer', door_swing_mm: null },
    { id: 'dw', cat: 'dishwasher', door_swing_mm: null },
    { id: 'f', cat: 'fridge', door_swing_mm: null }
  ];
  const result = inferFromDocument(makeDoc(products));

  assert.equal(result.updatedCount, 4);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.skippedCount, 0);
});

test('task 10 infer: original document object is not mutated', () => {
  const original = makeDoc([{ id: 'w1', cat: 'washing_machine', door_swing_mm: null }]);
  const originalProduct = original.products[0];

  inferFromDocument(original);

  assert.equal(originalProduct.door_swing_mm, null);
  assert.equal(originalProduct.inferred_door_swing, undefined);
});

test('task 10 infer: inferred_door_swing=true passes schema validateProduct', () => {
  const product = {
    id: 'w1',
    cat: 'washing_machine',
    brand: 'LG',
    model: 'WM5000HWA',
    w: 600,
    h: 850,
    d: 600,
    kwh_year: 80,
    stars: 4,
    price: null,
    emoji: '🫧',
    door_swing_mm: 0,
    inferred_door_swing: true,
    features: ['Front load'],
    retailers: [],
    sponsored: false,
    unavailable: true
  };
  const errors = validateProduct(product);

  assert.deepEqual(errors, []);
});

test('task 10 infer: rules map defines fridge inference rule', () => {
  assert.equal(typeof INFERENCE_RULES.fridge?.condition, 'function');
});

test('task 10 infer: chest fridge null door_swing updates to 0', () => {
  const doc = makeDoc([{
    id: 'f1',
    cat: 'fridge',
    door_swing_mm: null,
    features: ['Chest', '4', 'Class 4']
  }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
  assert.equal(result.document.products[0].inferred_door_swing, true);
});

test('task 10 infer: side by side fridge null door_swing updates to 0', () => {
  const doc = makeDoc([{
    id: 'f2',
    cat: 'fridge',
    door_swing_mm: null,
    features: ['Side by Side', '5S', 'Class 5']
  }]);

  const result = inferFromDocument(doc);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, 0);
});

test('task 10 infer: upright fridge null door_swing remains unresolved', () => {
  const doc = makeDoc([{
    id: 'f3',
    cat: 'fridge',
    door_swing_mm: null,
    features: ['Upright', '5B', 'Class 3']
  }]);
  const result = inferFromDocument(doc);

  assert.equal(result.updatedCount, 0);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.document.products[0].door_swing_mm, null);
});

test('task 10 infer: bottom mount fridge null door_swing remains unresolved', () => {
  const doc = makeDoc([{
    id: 'f4',
    cat: 'fridge',
    door_swing_mm: null,
    features: ['Bottom Mount', '5B', 'Class 3']
  }]);

  const result = inferFromDocument(doc);
  assert.equal(result.updatedCount, 0);
});
