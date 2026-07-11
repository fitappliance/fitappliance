import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  electroluxModelMatchesSku,
  parseElectroluxText
} = require('../../scripts/pdf-pipeline/parsers/electrolux.js');

const EXTRACTION_DATE = '2026-05-19T00:00:00.000Z';

const oldDimensionGuide = `
Refrigeration
Dimension Guide
Bottom mount refrigeration
Models:
EBE4507BC, EBE4507SC
Dimensions Product Height Product Width Product Depth Product Depth
(Door Open)
EBE4507BC 1725 699 773 1360
EBE4507SC 1725 699 773 1360
Airspace Side - both Top Behind
EBE4507BC 30 50 50
EBE4507SC 30 50 50
`;

const frenchDoorDimensionGuide = `
Refrigeration
Dimension Guide
French Door Refrigeration
Models:
EQE5657BA, EQE5607BA
Dimensions Product Height Product Width Product Depth Product Depth
(Door Open)
EQE5657BA 1795 896∆ 755* 1112
EQE5607BA 1795 896∆ 755* 1112
Airspace Side - both
(door flush)
Side - both
(cabinet flush)
Top Behind
EQE5657BA 30 25 5 30
EQE5607BA 30 25 5 30
`;

const ambiguousNewGuide = `
Dimension Guide
Bottom Freezer refrigerator models:
Total width (mm) width (mm) Total depth including door and handle (mm) depth (mm) Depth door open 90° (mm) Total height (mm) height (mm) Air space needed above cabinet (mm)
EBE5002SD 796 790 723 641 1457 1725 1705 50
Model:
EBE5002SD
X Y
455 mm
50 mm
30 mm
30 mm
Minimum Recommended Airspaces
`;

const kelvinatorFactsheet = `
Specifications
PRODUCT PROFILE DIMENSIONS
Domestic warranty details 2 Total height (mm) 1718
Cabinet height (mm) 1705
Refrigerator Type bottom mount Total width (mm) 796
Cabinet width (mm) 790
Total depth (mm) 727
Cabinet depth (mm) 641
`;

test('Electrolux parser extracts fridge dimensions and explicit Airspace rows', () => {
  const result = parseElectroluxText(oldDimensionGuide, {
    target: { brand: 'Electrolux', sku: 'EBE4507SC', category: 'fridge' },
    sourceUrl: 'https://resource.electrolux.com.au/Public/File/?Id=51297',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1725,
    width_mm: 699,
    depth_mm: 773,
    door_open_90_depth_mm: 1360
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 30,
    right_mm: 30,
    rear_mm: 50
  });
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Electrolux parser handles dual side-clearance rows by choosing the safer side value', () => {
  const result = parseElectroluxText(frenchDoorDimensionGuide, {
    target: { brand: 'Electrolux', sku: 'EQE5607BA', category: 'fridge' },
    sourceUrl: 'https://www.electrolux.com.au/documenthandler.ashx?file=...',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1795,
    width_mm: 896,
    depth_mm: 755,
    door_open_90_depth_mm: 1112
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 5,
    left_mm: 30,
    right_mm: 30,
    rear_mm: 30
  });
});

test('Electrolux parser fails closed on diagram-only guides without model-specific Airspace rows', () => {
  assert.throws(() => parseElectroluxText(ambiguousNewGuide, {
    target: { brand: 'Electrolux', sku: 'EBE5002SD-R', category: 'fridge' },
    sourceUrl: 'https://www.electrolux.com.au/documenthandler.ashx?file=...',
    extractionDate: EXTRACTION_DATE
  }), /Dimensions table|Airspace clearance row/i);
});

test('Electrolux parser matches hinge variants without broad cross-family matches', () => {
  assert.equal(electroluxModelMatchesSku('EBE5002SD', 'EBE5002SD-R'), true);
  assert.equal(electroluxModelMatchesSku('EFE4227SC-L', 'EFE4227SC'), true);
  assert.equal(electroluxModelMatchesSku('EQE5657BA', 'EQE5607BA'), false);
  assert.equal(electroluxModelMatchesSku('SC', 'EBE4507SC'), false);
});

test('Electrolux parser accepts dimensions-only factsheets only through an exact official model binding', () => {
  const result = parseElectroluxText(kelvinatorFactsheet, {
    target: { brand: 'Kelvinator', sku: 'KBM5302AC', category: 'fridge' },
    sourceUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator',
    verifiedAlias: 'KBM5302AC',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1718,
    width_mm: 796,
    depth_mm: 727,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
  assert.equal(result.data.metadata.verified_alias, 'KBM5302AC');
  assert.match(result.warnings.join(' '), /clearance.*not verified/i);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Electrolux parser rejects factsheet aliases that are not bound to the exact official URL', () => {
  for (const sourceUrl of [
    'https://example.com/KBM5302AC.pdf',
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KTB2802WB&brand=Kelvinator'
  ]) {
    assert.throws(() => parseElectroluxText(kelvinatorFactsheet, {
      target: { brand: 'Kelvinator', sku: 'KBM5302AC', category: 'fridge' },
      sourceUrl,
      verifiedAlias: 'KBM5302AC',
      extractionDate: EXTRACTION_DATE
    }), /could not verify SKU/i);
  }
});
