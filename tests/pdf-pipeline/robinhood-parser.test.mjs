import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractRobinhoodClearance,
  extractRobinhoodDimensions,
  parseRobinhoodText
} = require('../../scripts/pdf-pipeline/parsers/robinhood.js');

const BAR_FRIDGE_TEXT = `
  Installation and Operating Instructions
  Description: ROBINHOOD BAR FRIDGE 121L
  Model Numbers: RHBFD121W, RHBFD121X

  Appliance Details
  Dimensions (WxDxH): 500x560x840mm

  Allow at least 10 cm of space around the back and sides of the appliance,
  which allows the proper air circulation, and at least 20cm above the unit.

  Specifications
  ROBINHOOD BAR FRIDGE 121L STAINLESS STEEL & WHITE
  RHBFD121X (Stainless Steel); RHBFD121W (White)
  Dimensions & Weight
  Product Dimension (mm) W495 x D560 x H840
`;

const DISHWASHER_TEXT = `
  ROBINHOOD 60CM FREESTANDING DISHWASHER
  RHDW613W RHDW613X

  Positioning the Appliance
  The back should rest against the wall behind it, and the sides, along the adjacent cabinets or walls.
  The height of the dishwasher, 845 mm, has been designed to fit between standard height cabinet in modern kitchens.

  Dimension & Weight
  Product Dimensions (W*D*H) 598*600*845 mm
`;

const CHEST_FREEZER_TEXT = `
  Installation and Operating Instructions
  Description: ROBINHOOD CHEST FREEZER WHITE
  Model Numbers: RCFA147WH, RCFA202WH, RCFA303WH & RCFA395WH
  Product Dimension (WxDxH) 706*550*850mm
  Do not place the appliance closer than 50mm to the rear wall.
  Ensure the opening arc of the lid clears any overhead obstructions.
`;

test('Robinhood parser combines technical dimensions with explicit fridge clearance', () => {
  const result = parseRobinhoodText(BAR_FRIDGE_TEXT, {
    target: {
      brand: 'Robinhood',
      sku: 'RHBFD121W',
      category: 'fridge',
      product: { w: 495, h: 840, d: 560 }
    },
    sourceUrl: 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 495,
    height_mm: 840,
    depth_mm: 560,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 200,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
});

test('Robinhood parser accepts dishwasher text that explicitly rests against rear and side cabinets', () => {
  const dimensions = extractRobinhoodDimensions(DISHWASHER_TEXT);
  const clearance = extractRobinhoodClearance(DISHWASHER_TEXT, 'DISHWASHER');

  assert.deepEqual(dimensions, {
    width_mm: 598,
    depth_mm: 600,
    height_mm: 845
  });
  assert.deepEqual(clearance, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('Robinhood parser fails closed for chest freezer text with only rear wall spacing', () => {
  assert.throws(() => parseRobinhoodText(CHEST_FREEZER_TEXT, {
    target: {
      brand: 'Robinhood',
      sku: 'RCFA147WH',
      category: 'fridge',
      product: { w: 706, h: 850, d: 550 }
    },
    sourceUrl: 'https://cdn.shopify.com/files/RCFA147WH_Manual.pdf'
  }), /explicit top and side clearance/);
});

test('Robinhood parser fails closed when exact SKU is not present', () => {
  assert.throws(() => parseRobinhoodText(BAR_FRIDGE_TEXT, {
    target: {
      brand: 'Robinhood',
      sku: 'RHBFD126W',
      category: 'fridge',
      product: { w: 495, h: 840, d: 560 }
    },
    sourceUrl: 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf'
  }), /could not verify SKU RHBFD126W/);
});
