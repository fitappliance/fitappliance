import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractOmegaClearance,
  extractOmegaDimensions,
  parseOmegaText
} = require('../../scripts/pdf-pipeline/parsers/omega.js');

const FREESTANDING_DISHWASHER_TEXT = `
  OMEGA DISHWASHERS ODW300XN
  Dimensions/Weight
  Overall Dimensions (mm): 850(h) x 450(w) x 585(d)
  Technical Details
  Style
  Dishwasher Type: Freestanding, with a Removable Worktop
  Installation
  Water Connection: Cold Water Recommended
  NB: Drawings are not to scale - they are to assist only.
  WARNING: technical specifications and product sizes can be varied by the manufacturer without notice.
  Cutouts for appliances should only be by physical product measurements.
`;

const INTEGRATED_DISHWASHER_TEXT = `
  OMEGA DISHWASHERS OFI700
  Dimensions/Weight
  Overall Dimensions (mm): 815(h) x 598(w) x 550(d)
  Technical Details
  Dishwasher Type: Fully Integrated
  Aesthetics
  Supplied Without a Decorative Door
  WARNING: technical specifications and product sizes can be varied by the manufacturer without notice.
  Cutouts for appliances should only be by physical product measurements.
`;

const FRIDGE_WITH_MISSING_CABINET_TABLE = `
  OMEGA FRIDGE FREEZER FULLY INTEGRATED OBMF266FI
  Product Dimensions (mm): 540Wx545Dx1785H
  Cabinet Size Requirement: As below
  Specifications
`;

test('Omega parser extracts dishwasher dimensions from official specification sheets', () => {
  assert.deepEqual(extractOmegaDimensions(FREESTANDING_DISHWASHER_TEXT), {
    height_mm: 850,
    width_mm: 450,
    depth_mm: 585
  });
});

test('Omega parser allows zero additional dishwasher clearance only when cutouts are tied to physical measurements', () => {
  assert.deepEqual(extractOmegaClearance(FREESTANDING_DISHWASHER_TEXT, 'DISHWASHER'), {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('Omega parser accepts integrated dishwasher spec sheets with physical-product cutout wording', () => {
  const result = parseOmegaText(INTEGRATED_DISHWASHER_TEXT, {
    target: {
      brand: 'Omega',
      sku: 'OFI700',
      category: 'dishwasher',
      product: { w: 598, h: 815, d: 550 }
    },
    sourceUrl: 'https://cdn.shopify.com/s/files/Omega-Dishwashers-Specifications-OFI700.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 598,
    height_mm: 815,
    depth_mm: 550,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('Omega parser fails closed for fridge specs where cabinet requirement values are not text-readable', () => {
  assert.throws(() => parseOmegaText(FRIDGE_WITH_MISSING_CABINET_TABLE, {
    target: {
      brand: 'Omega',
      sku: 'OBMF266FI',
      category: 'fridge',
      product: { w: 540, h: 1785, d: 545 }
    },
    sourceUrl: 'https://cdn.shopify.com/s/files/Omega-Refrigeration-Specifications-OBMF266FI.pdf'
  }), /fridge explicit cabinet clearance/);
});

test('Omega parser fails closed when exact SKU is missing from PDF text', () => {
  assert.throws(() => parseOmegaText(FREESTANDING_DISHWASHER_TEXT, {
    target: {
      brand: 'Omega',
      sku: 'ODW700W',
      category: 'dishwasher',
      product: { w: 598, h: 845, d: 594 }
    },
    sourceUrl: 'https://cdn.shopify.com/s/files/Omega-Dishwasher-Specification-ODW700W.pdf'
  }), /could not verify SKU ODW700W/);
});
