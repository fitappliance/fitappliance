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
