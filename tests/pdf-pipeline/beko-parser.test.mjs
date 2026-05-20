import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBekoText } from '../../scripts/pdf-pipeline/parsers/beko.js';

test('Beko parser extracts cm dimensions from official tech specs text', () => {
  const text = `
    Beko BDFB1430B
    Tech Specs
    Key Features
    Installation Type [Input]
    Freestanding
    Dimensions & Weight
    Height [Input]
    85 cm
    Width [Input]
    59.8 cm
    Depth [Input]
    60 cm
  `;
  const result = parseBekoText(text, {
    target: { sku: 'BDFB1430B', brand: 'BEKO', category: 'dishwasher' },
    sourceUrl: 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7685009077.pdf',
    extractionDate: '2026-05-20T00:00:00.000Z'
  }).data;

  assert.equal(result.sku, 'BDFB1430B');
  assert.equal(result.category, 'DISHWASHER');
  assert.deepEqual(result.dimensions, {
    height_mm: 850,
    width_mm: 598,
    depth_mm: 600,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('Beko parser extracts mm dimensions from specification sheet text', () => {
  const text = `
    Beko BDCB8020W Specifications Sheet
    Freestanding condenser dryer
    Height 846 mm
    Width 597 mm
    Depth 654 mm
  `;
  const result = parseBekoText(text, {
    target: { sku: 'BDCB8020W', brand: 'BEKO', category: 'dryer' },
    sourceUrl: 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7182483270.pdf',
    extractionDate: '2026-05-20T00:00:00.000Z'
  }).data;

  assert.equal(result.dimensions.height_mm, 846);
  assert.equal(result.dimensions.width_mm, 597);
  assert.equal(result.dimensions.depth_mm, 654);
});

test('Beko parser fails closed without SKU evidence', () => {
  assert.throws(() => parseBekoText(`
    Beko unrelated appliance
    Height 85 cm
    Width 60 cm
    Depth 60 cm
    Freestanding
  `, {
    target: { sku: 'BFLB8020W', brand: 'BEKO', category: 'washing_machine' },
    sourceUrl: 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7178552800.pdf'
  }), /could not verify SKU/);
});

test('Beko parser fails closed without explicit freestanding or built-in context', () => {
  assert.throws(() => parseBekoText(`
    Beko BFLB8020W
    Height 84 cm
    Width 60 cm
    Depth 55 cm
  `, {
    target: { sku: 'BFLB8020W', brand: 'BEKO', category: 'washing_machine' },
    sourceUrl: 'https://www.beko.com/content/dam/australia-au-aem/product-documents/7178552800-BFLB8020W/manual.pdf'
  }), /requires explicit freestanding/);
});
