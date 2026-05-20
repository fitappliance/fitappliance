import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSubZeroText,
  subZeroModelMatchesSku
} from '../../scripts/pdf-pipeline/parsers/sub-zero.js';

const CLASSIC_QRG_TEXT = `
91 CM BUILT-IN FREEZER - PANEL READY
I C B B I - 3 6 F / O

PRODUCT SPECIFICATIONS
Model \tICBBI-36F/O
Dimensions \t914mmW x 2134mmH x 610mmD
Plumbing Supply \t6.35 mm OD copper line

DIMENSIONS
STANDARD INSTALLATION
83 3/4 " (2127)
OPENING HEIGHT
24" (610)
OPENING DEPTH
35 1/2 " (902)
OPENING WIDTH
`;

test('Sub-Zero model matcher accepts documented base models with safe catalog suffixes', () => {
  assert.equal(subZeroModelMatchesSku('ICBBI-36F/O', 'ICBBI-36F/O-RH'), true);
  assert.equal(subZeroModelMatchesSku('ICBCL3650F/S', 'ICBCL3650F/S/P/L'), true);
  assert.equal(subZeroModelMatchesSku('ICBDEC2450R', 'ICBDEC2450R/L'), true);
  assert.equal(subZeroModelMatchesSku('ICBCL3650F/S', 'ICBCL4250F/S'), false);
});

test('Sub-Zero parser extracts classic QRG dimensions with built-in zero additional clearance', () => {
  const parsed = parseSubZeroText(CLASSIC_QRG_TEXT, {
    target: {
      brand: 'Sub-Zero',
      sku: 'ICBBI-36F/O-RH',
      category: 'fridge'
    },
    sourceUrl: 'https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36f/icb-built-in-refrigeration-qr-sheet-36fo-st.pdf',
    extractionDate: '2026-05-20T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    width_mm: 914,
    height_mm: 2134,
    depth_mm: 610,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
  assert.equal(parsed.data.flags.requires_plumbing, true);
  assert.equal(parsed.data.flags.ventilation_required, true);
  assert.equal(parsed.data.metadata.source_type, 'sub-zero-built-in-qrg-standard-installation');
});

test('Sub-Zero parser rejects documents without explicit built-in installation opening evidence', () => {
  assert.throws(
    () => parseSubZeroText(`
PRODUCT SPECIFICATIONS
Model ICBDEU2450R
Dimensions 610mmW x 876mmH x 587mmD
`, {
      target: { brand: 'Sub-Zero', sku: 'ICBDEU2450R/L', category: 'fridge' },
      sourceUrl: 'https://example.com/icbdeu2450r.pdf'
    }),
    /explicit Standard or Flush installation opening evidence/
  );
});

test('Sub-Zero parser rejects mismatched model evidence', () => {
  assert.throws(
    () => parseSubZeroText(CLASSIC_QRG_TEXT, {
      target: { brand: 'Sub-Zero', sku: 'ICBCL4250S/O', category: 'fridge' },
      sourceUrl: 'https://example.com/icbbi-36f.pdf'
    }),
    /could not verify SKU/
  );
});
