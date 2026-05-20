import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractArtusiDimensions,
  parseArtusiText
} from '../../scripts/pdf-pipeline/parsers/artusi.js';

const dishwasherText = `
  ARTUSI ADW5009X ADW5009B ADW5009W ADW5009MB
  Dishwasher
  Positioning The Appliance
  The back should rest against the wall behind it, and the sides, along the adjacent cabinets or walls.
  The height of the dishwasher, 845 mm, has been designed in order to allow the machine to be fitted between existing cabinets of the same height.
  TECHNICAL INFORMATION
  Height (H)
  Width (W)
  Depth (D1)
  Depth (D2)
  845mm
  598mm
  600mm (with the door closed)
  1175mm (with the door opened 90°)
`;

test('Artusi parser extracts dishwasher dimensions and zero cabinet-fit clearance only with explicit positioning evidence', () => {
  const parsed = parseArtusiText(dishwasherText, {
    target: {
      brand: 'Artusi',
      sku: 'ADW5009X',
      category: 'dishwasher',
      product: { w: 598, h: 845, d: 600 }
    },
    sourceUrl: 'https://artusi.com.au/wp-content/uploads/2025/11/ADW5009-User-Manual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 845,
    width_mm: 598,
    depth_mm: 600,
    door_open_90_depth_mm: 1175
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('Artusi parser keeps fridges fail-closed when ventilation clearance is not text-readable', () => {
  assert.throws(() => parseArtusiText(`
    AFBM462X fridge
    Product Specifications 700mm Wide 1730mm High 712mm Deep
    Zero Clearance opening door.
  `, {
    target: {
      brand: 'Artusi',
      sku: 'AFBM462X',
      category: 'fridge',
      product: { w: 700, h: 1730, d: 712 }
    },
    sourceUrl: 'https://artusi.com.au/wp-content/uploads/2024/01/PF_AFBM462X_Artusi.pdf'
  }), /fridge explicit ventilation clearance is not text-readable/);
});

test('Artusi product specification dimension parser handles both Wide-High-Deep and Wide-Deep-High order', () => {
  assert.deepEqual(extractArtusiDimensions('Product Specifications 700mm Wide 1730mm High 712mm Deep', 'FRIDGE'), {
    width_mm: 700,
    height_mm: 1730,
    depth_mm: 712,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(extractArtusiDimensions('Product Specifications 598mm Wide 600mm Deep 845mm High', 'DISHWASHER'), {
    width_mm: 598,
    height_mm: 845,
    depth_mm: 600,
    door_open_90_depth_mm: null
  });
});
