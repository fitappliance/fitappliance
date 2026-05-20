import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { parseMideaText } = require('../../scripts/pdf-pipeline/parsers/midea.js');

const MDW6099_SPEC_AND_MANUAL = `
  MDW6099B15BDX
  60cm Built-Under Dishwasher | 15 Place | Easy Lift | Dark Stainless
  Product Dimensions W x D x H 598 x 570 x 815mm
  1175mm

  Selecting the best location for the dishwasher
  Illustrations of cabinet dimensions and installation position of the dishwasher.
  1. Less than 5 mm between the top of dishwasher and cabinet and the outer door aligned to cabinet.
  90 ° 90 °
  580mm
  820mm
  Electrical, drain and water supply line connection
  Space between cabinet bottom and floor
  600 mm(for 60cm model)
  450 mm(for 45cm model)
`;

test('Midea parser combines official spec dimensions and manual cabinet opening for MDW6099B15BDX', () => {
  const result = parseMideaText(MDW6099_SPEC_AND_MANUAL, {
    target: { brand: 'Midea', sku: 'MDW6099B15BDX', category: 'dishwasher' },
    sourceUrl: 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdw6099b15bdx/MDW6099B15BDX-Spec-Sheet.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 598,
    depth_mm: 570,
    height_mm: 815,
    door_open_90_depth_mm: 1175
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 5,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 10
  });
  assert.equal(result.data.flags.requires_plumbing, true);
  assert.equal(result.data.flags.ventilation_required, false);
});

test('Midea parser fails closed when dishwasher text has dimensions but no cabinet opening', () => {
  assert.throws(() => parseMideaText(`
    MDW6065F14UX
    Product Dimensions W x D x H 598 x 600 x 845mm
  `, {
    target: { brand: 'Midea', sku: 'MDW6065F14UX', category: 'dishwasher' },
    sourceUrl: 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdw6065f14ux/spec.pdf'
  }), /requires explicit cabinet opening dimensions/);
});

test('Midea parser fails closed when the official PDF does not prove the target SKU', () => {
  assert.throws(() => parseMideaText(MDW6099_SPEC_AND_MANUAL, {
    target: { brand: 'Midea', sku: 'MDW6065F14UX', category: 'dishwasher' },
    sourceUrl: 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdw6099b15bdx/spec.pdf'
  }), /could not verify SKU MDW6065F14UX/);
});

test('Midea parser extracts single-model chest freezer dimensions with explicit adjacent-wall clearance', () => {
  const result = parseMideaText(`
    Chest Freezer
    MDRC499FZF01AP
    SPECIFICATIONS
    Product model MDRC499FZF01AP
    Freezer compartment Volume(L) 362
    Overall Dimension (mm) 1255x745x853

    PRODUCT INSTALLATION
    Dimensions and Clearances
    Allow over 100 mm of clearance from each adjacent wall when installing the appliance.
    Required space for air circulation
  `, {
    target: { brand: 'Midea', sku: 'MDRC499FZF01AP', category: 'fridge' },
    sourceUrl: 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdrc499fzf01ap/manual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 1255,
    depth_mm: 745,
    height_mm: 853,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
  assert.equal(result.data.flags.ventilation_required, true);
});

test('Midea parser selects the matching row from a multi-model chest freezer dimension table', () => {
  const result = parseMideaText(`
    MDRC284FZE01APE
    Product Dimensions W x D x H 770 x 560 x 850mm

    Chest Freezer
    USER MANUAL
    SPECIFICATIONS
    Product model MDRC154FZE01APE MDRC211FZE01APE MDRC284FZE01APE
    Total Volume(L) 99 143 198
    Overall Dimension (mm) 547x446x850 600x560x850 770x560x850

    Dimensions and Clearances
    Too small of a distance from adjacent items may result in the degradation of freezing capability.
    Allow over 100 mm of clearance from each adjacent wall when installing the appliance.
  `, {
    target: { brand: 'Midea', sku: 'MDRC284FZE01APE', category: 'fridge' },
    sourceUrl: 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdrc284fze01ape/spec.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 770,
    depth_mm: 560,
    height_mm: 850,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
});
