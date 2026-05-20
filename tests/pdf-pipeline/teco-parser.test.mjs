import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTecoText } from '../../scripts/pdf-pipeline/parsers/teco.js';

const tecoFridgeText = `
  TECO IMPORTANT NOTE:
  REFRIGERATOR/ FREEZER
  User Manual
  Model:
  TFF334WNTAH
  TFF334SNTAH

  INSTALLATION INSTRUCTIONS
  Leave a minimum of 50mm between each side of the appliance and the wall.
  The top of the appliance should have a minimum of 100mm clearance.
  This allows for proper air circulation.
  This appliance is intended to be free-standing and should not be built-in or placed in a recessed area.

  SPECIFICATIONS
  TFF334WNTAH
  TFF334SNTAH
  Width 600
  Dimension Depth 665
  (mm)
  Height 1700
`;

test('TECO fridge parser extracts exact model dimensions and wall clearances', () => {
  const result = parseTecoText(tecoFridgeText, {
    target: { brand: 'TECO', sku: 'TFF334WNTAH', category: 'fridge' },
    sourceUrl: 'https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.equal(result.data.category, 'FRIDGE');
  assert.deepEqual(result.data.dimensions, {
    height_mm: 1700,
    width_mm: 600,
    depth_mm: 665,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('TECO parser rejects documents without exact SKU evidence', () => {
  assert.throws(() => parseTecoText(tecoFridgeText.replaceAll('TFF334WNTAH', 'OTHER'), {
    target: { brand: 'TECO', sku: 'TFF334WNTAH', category: 'fridge' },
    sourceUrl: 'https://appliances.teco.com.au/TFF334WNTAH.pdf'
  }), /could not verify SKU/);
});

test('TECO parser fails closed when clearance language is incomplete', () => {
  assert.throws(() => parseTecoText(tecoFridgeText.replace('The top of the appliance should have a minimum of 100mm clearance.', ''), {
    target: { brand: 'TECO', sku: 'TFF334WNTAH', category: 'fridge' },
    sourceUrl: 'https://appliances.teco.com.au/TFF334WNTAH.pdf'
  }), /requires explicit wall-side and top air-circulation clearances/);
});
