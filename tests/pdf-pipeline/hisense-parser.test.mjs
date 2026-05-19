import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  hisenseModelMatchesSku,
  parseHisenseText
} = require('../../scripts/pdf-pipeline/parsers/hisense.js');

const EXTRACTION_DATE = '2026-05-19T00:00:00.000Z';

test('Hisense parser extracts fridge W/H/D and cabinet clearance from spec sheets', () => {
  const result = parseHisenseText(`
    HRBM418S
    Model Number HRBM418S
    Dimensions (Net) (W X H X D) 704x1720x694 mm
    Cabinet clearance [Sides / Back / Top] 50 / 50 / 100 mm
    Water Dispenser No
    Reversible Door Yes
  `, {
    target: { brand: 'Hisense', sku: 'HRBM418S', category: 'fridge' },
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1720,
    width_mm: 704,
    depth_mm: 694,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
  assert.equal(result.data.flags.requires_plumbing, false);
  assert.equal(result.data.flags.reversible_door, true);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Hisense parser handles chest-freezer Width/Depth/Height row-style spec sheets', () => {
  const result = parseHisenseText(`
    Model
    HRCF144
    Manufacturer Model HRCF144
    Dimensions
    Width mm 625
    Depth mm 559
    Height mm 854
    Width mm 655
    Depth mm 575
    Height mm 890
    Cabinet clearance [Sides / Back / Top] mm 50 / 50 / 100
  `, {
    target: { brand: 'Hisense', sku: 'HRCF144', category: 'fridge' },
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCF144-Spec.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 854,
    width_mm: 625,
    depth_mm: 559,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('Hisense parser accepts unicode multiplication signs in net dimensions', () => {
  const result = parseHisenseText(`
    Model Number HRBC137
    Dimensions (Net) (W X H X D) 595×819x575 mm
    Cabinet clearance [Sides / Back / Top] 35 /35 / 10 mm
  `, {
    target: { brand: 'Hisense', sku: 'HRBC137', category: 'fridge' },
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRBC137-Specs.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 819,
    width_mm: 595,
    depth_mm: 575,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 10,
    left_mm: 35,
    right_mm: 35,
    rear_mm: 35
  });
});

test('Hisense parser fails closed when spec sheet lacks explicit clearance values', () => {
  assert.throws(() => parseHisenseText(`
    Model Number HWF3S8514
    Net dimensions(W x H x D) 595*845*540
    Package dimensions(W x H x D) 645*880*560
  `, {
    target: { brand: 'Hisense', sku: 'HWF3S8514', category: 'washing_machine' },
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HWF3S8514-Spec.pdf',
    extractionDate: EXTRACTION_DATE
  }), /clearance/i);
});

test('Hisense parser rejects PDFs that do not name the requested model family', () => {
  assert.throws(() => parseHisenseText(`
    Model Number HRBM418S
    Dimensions (Net) (W X H X D) 704x1720x694 mm
    Cabinet clearance [Sides / Back / Top] 50 / 50 / 100 mm
  `, {
    target: { brand: 'Hisense', sku: 'HRTF206', category: 'fridge' },
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf',
    extractionDate: EXTRACTION_DATE
  }), /could not verify SKU/i);
});

test('Hisense model matcher accepts manifest wildcard products safely', () => {
  assert.equal(hisenseModelMatchesSku('HWF3S8514X', 'HWF3S8514*'), true);
  assert.equal(hisenseModelMatchesSku('HWF3S8514', 'HWF3S8514*'), true);
  assert.equal(hisenseModelMatchesSku('HWF3S8514X', 'HWF3S8514'), false);
  assert.equal(hisenseModelMatchesSku('HRCD563BW', 'HRCD563BW'), true);
});
