import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractWashingMachineClearance,
  extractWashingMachineDimensions,
  parseKoganText
} = require('../../scripts/pdf-pipeline/parsers/kogan.js');

const KAMFWASH90A_TEXT = `
  9KG FRONT LOAD BLDC INVERTER WASHING MACHINE
  KAMFWASH90A

  Placement
  The washing machine must be installed in a location with sufficient ventilation.
  Ensure there is 20mm of space on the back and sides of the washing machine.

  Specifications
  Power supply 220-240V~, 50Hz
  Washing capacity 9.0kg
  Dimension 595 x 535 x 850mm
  Net weight 61kg
`;

const KATFWASH11A_TEXT = `
  11kg Front Load BLDC Inverter Washing Machine
  KATFWASH11A

  Installation Location
  Ensure there is 20mm of space on the back and sides of the washing machine.

  Specifications
  Dimension
  A 595mm
  B 850mm
  C 595mm
  Weight 73kg
`;

test('Kogan parser extracts inline W x D x H washer dimensions and 20mm side/rear clearance', () => {
  const result = parseKoganText(KAMFWASH90A_TEXT, {
    target: {
      brand: 'Kogan',
      sku: 'KAMFWASH90A',
      category: 'washing_machine',
      product: { w: 595, h: 850, d: 535 }
    },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFWASH90A_UG.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 595,
    depth_mm: 535,
    height_mm: 850,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 20
  });
});

test('Kogan parser extracts lettered washer dimension tables when catalog cross-check agrees', () => {
  const dimensions = extractWashingMachineDimensions(KATFWASH11A_TEXT);
  const clearance = extractWashingMachineClearance(KATFWASH11A_TEXT);

  assert.deepEqual(dimensions, {
    width_mm: 595,
    height_mm: 850,
    depth_mm: 595
  });
  assert.deepEqual(clearance, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 20
  });
});

test('Kogan parser fails closed when exact SKU is not present in text', () => {
  assert.throws(() => parseKoganText(KAMFWASH90A_TEXT, {
    target: { brand: 'Kogan', sku: 'KAMFWASH80A', category: 'washing_machine' },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFWASH90A_UG.pdf'
  }), /could not verify SKU KAMFWASH80A/);
});

test('Kogan parser fails closed when washer clearance is missing', () => {
  assert.throws(() => parseKoganText(`
    KAFWASH75TA
    7.5kg Front Load BLDC Inverter Washing Machine
    Outer Dimension 595x560x850mm
  `, {
    target: { brand: 'Kogan', sku: 'KAFWASH75TA', category: 'washing_machine' },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAFWASH75TA_UG.pdf'
  }), /explicit back\/sides clearance not found/);
});

test('Kogan parser fails closed for fridge text with ambiguous rear spacing wording', () => {
  assert.throws(() => parseKoganText(`
    KAMFREN490A
    490L French Door Fridge
    Keep at least 10cm of free space on both sides and at the top and allow for no more than 7.5cm at the rear.
    Space Requirements A B C D E 833mm 1775mm 740mm 1058mm 1394mm
  `, {
    target: { brand: 'Kogan', sku: 'KAMFREN490A', category: 'fridge' },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFREN490A_UG.pdf'
  }), /ambiguous maximum rear clearance wording/);
});

test('Kogan parser extracts side-by-side fridge dimensions and explicit 5cm clearance', () => {
  const result = parseKoganText(`
    KATFSBS503A
    503L Side by Side Fridge

    Installation
    Keep at least 5cm of free space on both sides and at the top and allow for at least 5cm of space at the rear of the unit.

    Specifications
    Dimension (W x D x H) 920 x 630 x 1768mm
  `, {
    target: {
      brand: 'Kogan',
      sku: 'KATFSBS503A',
      category: 'fridge',
      product: { w: 920, h: 1768, d: 630 }
    },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KATFSBS503A_UG.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 920,
    depth_mm: 630,
    height_mm: 1768,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('Kogan parser extracts French door table dimensions and explicit side/rear/top clearance', () => {
  const result = parseKoganText(`
    KAMFREN522A
    522L French Door Fridge

    Dimensions and Clearances
    >100mm Required Space <75mm >100mm >100mm Top View
    Both sides of the unit must be allowed a free distance of more than 100mm and the unit's back must be at least 75mm from the wall.

    Space Requirements
    Width Overall Height Depth
    A B C C1 D E
    750mm 1692mm 785mm 1192mm 1206mm 1470mm
  `, {
    target: {
      brand: 'Kogan',
      sku: 'KAMFREN522A',
      category: 'fridge',
      product: { w: 750, h: 1692, d: 785 }
    },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFREN522A_UG.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 750,
    depth_mm: 785,
    height_mm: 1692,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 100,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 75
  });
});

test('Kogan parser rejects fridge dimensions when PDF and catalog disagree', () => {
  assert.throws(() => parseKoganText(`
    KAMFSBS551A
    551L Side by Side Fridge
    Keep at least 5cm of free space on both sides and at the top and allow for at least 5cm of space at the rear of the unit.
    Dimension (W x D x H) 955 x 778 x 1825mm
  `, {
    target: {
      brand: 'Kogan',
      sku: 'KAMFSBS551A',
      category: 'fridge',
      product: { w: 897, h: 1765, d: 761 }
    },
    sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFSBS551A_UG.pdf'
  }), /catalog cross-check mismatch/);
});
