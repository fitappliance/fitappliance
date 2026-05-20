import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEuromaidText
} from '../../scripts/pdf-pipeline/parsers/euromaid.js';

test('Euromaid fridge parser derives clearances from Product and Min Clearance boxes', () => {
  const parsed = parseEuromaidText(`
    Euromaid ETM221W Top Mount Fridge
    DIMENSIONS (H x W x D)
    Product (mm) 1430 x 550 x 600
    Min Clearance* (mm) 1480 x 650 x 650
  `, {
    target: {
      brand: 'Euromaid',
      sku: 'ETM221W',
      category: 'fridge'
    },
    sourceUrl: 'https://www.euromaid.com/ETM221W-spec.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 1430,
    width_mm: 550,
    depth_mm: 600,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('Euromaid dishwasher parser derives cut-out clearances using max height ranges', () => {
  const parsed = parseEuromaidText(`
    Euromaid E14FID fully integrated dishwasher
    WEIGHTS & DIMENSIONS (W x H x D)
    Product un-boxed (mm) 598 x 815 - 860 x 550
    Cut-Out (mm) 600 x 850 - 870 x 600
  `, {
    target: {
      brand: 'Euromaid',
      sku: 'E14FID',
      category: 'dishwasher'
    },
    sourceUrl: 'https://www.euromaid.com/E14FID-spec.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 860,
    width_mm: 598,
    depth_mm: 550,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 10,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 50
  });
});

test('Euromaid parser rejects laundry documents without full clearance rules', () => {
  assert.throws(() => parseEuromaidText(`
    Euromaid EFLP1000W
    Dimensions (W x H x D) 595 x 850 x 565 mm
  `, {
    target: {
      brand: 'Euromaid',
      sku: 'EFLP1000W',
      category: 'washing_machine'
    },
    sourceUrl: 'https://www.euromaid.com/EFLP1000W-spec.pdf'
  }), /requires explicit full clearance data/);
});
