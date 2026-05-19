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
  }), /does not yet have a fail-closed extractor for FRIDGE/);
});
