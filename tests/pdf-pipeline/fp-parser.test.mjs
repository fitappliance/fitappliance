import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  extractFpFitOptions,
  parseFpPdf,
  parseFpText
} = require('../../scripts/pdf-pipeline/parsers/fp.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDir = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'fp');
const EXTRACTION_DATE = '2026-05-15T00:00:00.000Z';

test('F&P specialized parser selects larger Flush Fit dimensions and preserves Proud Fit alternative', () => {
  const text = `
    Fisher & Paykel Integrated Refrigerator
    Model RS7621SRK1
    FLUSH FIT INSTALLATION
    Product dimensions mm
    Overall height 2134
    Overall width 756
    Overall depth 610
    PROUD FIT INSTALLATION
    Product dimensions mm
    Overall height 2030
    Overall width 750
    Overall depth 585
    Minimum air clearance - at rear 25 mm
    Minimum air clearance - each side 4 mm
    Minimum air clearance - on top 0 mm
  `;

  const result = parseFpText(text, {
    target: { brand: 'Fisher & Paykel', sku: 'RS7621SRK1', category: 'fridge' },
    sourceUrl: 'https://www.fisherpaykel.com/flush-proud.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 2134,
    width_mm: 756,
    depth_mm: 610,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.fitOptions.proud_fit.dimensions, {
    height_mm: 2030,
    width_mm: 750,
    depth_mm: 585,
    door_open_90_depth_mm: null
  });
  assert.equal(result.fitOptions.selected, 'flush_fit');
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('F&P specialized parser fails closed when Flush/Proud dimensions lack ventilation evidence', () => {
  const text = `
    Fisher & Paykel Integrated Refrigerator
    Model RS7621SRK1
    FLUSH FIT INSTALLATION
    Product dimensions mm
    Overall height 2134
    Overall width 756
    Overall depth 610
    PROUD FIT INSTALLATION
    Product dimensions mm
    Overall height 2030
    Overall width 750
    Overall depth 585
    Premium seamless cabinetry appearance.
  `;

  assert.throws(() => parseFpText(text, {
    target: { brand: 'Fisher & Paykel', sku: 'RS7621SRK1', category: 'fridge' },
    sourceUrl: 'https://www.fisherpaykel.com/flush-proud.pdf',
    extractionDate: EXTRACTION_DATE
  }), /clearance|ventilation/i);
});

test('F&P specialized parser extracts official integrated fridge fixture', async () => {
  const result = await parseFpPdf(path.join(fixtureDir, 'RS4621FRJK1-qrg.pdf'), {
    target: { brand: 'Fisher & Paykel', sku: 'RS4621FRJK1', category: 'fridge' },
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw56dad114/QRG/AU/QRG-AU-26156.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 2134,
    width_mm: 451,
    depth_mm: 610,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 3,
    right_mm: 3,
    rear_mm: 25
  });
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('F&P specialized parser extracts official DishDrawer fixture', async () => {
  const result = await parseFpPdf(path.join(fixtureDir, 'DD60DDFB9-qrg.pdf'), {
    target: { brand: 'Fisher & Paykel', sku: 'DD60DDFB9', category: 'dishwasher' },
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw79740695/QRG/AU/QRG-AU-82326.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 820,
    width_mm: 599,
    depth_mm: 573,
    door_open_90_depth_mm: null
  });
  assert.equal(result.data.category, 'DISHWASHER');
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('F&P specialized parser extracts official oven data-sheet fixture', async () => {
  const result = await parseFpPdf(path.join(fixtureDir, 'OB60SD11PB1-datasheet.pdf'), {
    target: { brand: 'Fisher & Paykel', sku: 'OB60SD11PB1', category: 'oven' },
    sourceUrl: 'https://dam.fisherpaykel.com/KZ3PKN00/at/7mnsv594bq9bj6pcpb7ktvtz/FP-DataSheet-OB60SD11PB1-Oven-ASIA-AU-NZ-SG-90001796A.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 575,
    width_mm: 556,
    depth_mm: 545,
    door_open_90_depth_mm: 460
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 5,
    left_mm: 2,
    right_mm: 2,
    rear_mm: 5
  });
  assert.equal(result.data.category, 'OVEN');
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('extractFpFitOptions returns null for ordinary non-dual documents', () => {
  assert.equal(extractFpFitOptions('DIMENSIONS Height 850 mm Width 600 mm Depth 650 mm'), null);
});
