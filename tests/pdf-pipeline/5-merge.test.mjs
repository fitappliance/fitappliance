import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareCatalogPatch } from '../../scripts/pdf-pipeline/5-merge.js';

const extracted = {
  brand: 'Bosch',
  model: 'B36-FD52SNS',
  category: 'fridge',
  dimensions_mm: { width: 905, height: 1780, depth: 841 },
  clearance_mm: { side: 3, top: 13, rear: 25, front: 0 },
  capacity_litres: 736,
  energy_stars: null,
  annual_kwh: 702,
  door_swing_mm: null,
  weight_kg: 145,
  noise_db: null,
  confidence: 'high',
  source_quote: 'Required cutout size 70 in x 36 in x 29 5/16 in'
};

test('pdf pipeline merge: matches catalog by brand and SKU prefix', async () => {
  const result = await prepareCatalogPatch(extracted, {
    products: [
      { id: 'bosch-b36fd52sns', brand: 'Bosch', model: 'B36FD52SNS/01', w: 900, h: 1780, d: 841 }
    ]
  });

  assert.equal(result.matched.id, 'bosch-b36fd52sns');
  assert.equal(result.patch.w, 905);
  assert.ok(result.conflicts.some((conflict) => conflict.field === 'w'));
});

test('pdf pipeline merge: low confidence data does not create field patches', async () => {
  const result = await prepareCatalogPatch({ ...extracted, confidence: 'low' }, {
    products: [
      { id: 'bosch-b36fd52sns', brand: 'Bosch', model: 'B36FD52SNS', w: 900, h: 1780, d: 841 }
    ]
  });

  assert.deepEqual(result.patch, {});
});

test('pdf pipeline merge: returns null match for unrelated catalog rows', async () => {
  const result = await prepareCatalogPatch(extracted, {
    products: [{ id: 'lg-a', brand: 'LG', model: 'ABC123', w: 900, h: 1700, d: 700 }]
  });

  assert.equal(result.matched, null);
  assert.equal(result.conflicts.length, 0);
});

