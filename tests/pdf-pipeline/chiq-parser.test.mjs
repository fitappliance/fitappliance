import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  chiqModelMatchesSku,
  parseChiqText
} = require('../../scripts/pdf-pipeline/parsers/chiq.js');

const EXTRACTION_DATE = '2026-05-19T00:00:00.000Z';

test('CHIQ parser extracts official fridge spec dimensions and side/back ventilation', () => {
  const result = parseChiqText(`
    CBC064BG
    Product Dimensions
    (WHD)mm
    470 x 635 x 439
    Ventilation Requirements
    5 cm Left & Right sides
    5 cm Back
  `, {
    target: { brand: 'CHIQ', sku: 'CBC064BG', category: 'fridge' },
    sourceUrl: 'https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 635,
    width_mm: 470,
    depth_mm: 439,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
  assert.equal(result.data.brand, 'CHiQ');
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('CHIQ parser handles quad-door official spec sheets', () => {
  const result = parseChiqText(`
    QUAD DOOR FRIDGE CCD499NWS
    Product Dimensions
    (WHD)mm
    853 x 1775 x 694
    Ventilation Requirements
    5 cm Left & Right sides
    5 cm Back
  `, {
    target: { brand: 'CHIQ', sku: 'CCD499NWS', category: 'fridge' },
    sourceUrl: 'https://chiq.com.au/cdn/shop/files/CCD499NWS_SPEC.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1775,
    width_mm: 853,
    depth_mm: 694,
    door_open_90_depth_mm: null
  });
});

test('CHIQ parser rejects laundry spec sheets without explicit ventilation requirements', () => {
  assert.throws(() => parseChiqText(`
    WD85SB1
    Product Dimensions (WxHxD ) mm
    600 x 847 x 577
    Installation type
    Free standing base
  `, {
    target: { brand: 'CHIQ', sku: 'WD85SB1', category: 'washing_machine' },
    sourceUrl: 'https://chiq.com.au/cdn/shop/files/WD85SB1_SPEC.pdf',
    extractionDate: EXTRACTION_DATE
  }), /ventilation requirements/i);
});

test('CHIQ parser rejects PDFs that do not name the requested model', () => {
  assert.throws(() => parseChiqText(`
    CBC064BG
    Product Dimensions
    (WHD)mm
    470 x 635 x 439
    Ventilation Requirements
    5 cm Left & Right sides
    5 cm Back
  `, {
    target: { brand: 'CHIQ', sku: 'CCD499NWS', category: 'fridge' },
    sourceUrl: 'https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf',
    extractionDate: EXTRACTION_DATE
  }), /could not verify SKU/i);
});

test('CHIQ model matcher supports manifest wildcard patterns only when concrete enough', () => {
  assert.equal(chiqModelMatchesSku('CCF142WE', 'CCF14**E'), true);
  assert.equal(chiqModelMatchesSku('CCF500WE', 'CCF14**E'), false);
  assert.equal(chiqModelMatchesSku('CBC064BG', 'CBC064BG'), true);
});
