import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { evaluateFit } from '../../src/domain/fit-decision.mjs';

const require = createRequire(import.meta.url);
const SearchCore = require('../../public/scripts/search-core.js');

const products = [
  { id: 'fits', cat: 'fridge', brand: 'Example', w: 600, h: 1700, d: 650 },
  { id: 'too-wide', cat: 'fridge', brand: 'Example', w: 700, h: 1700, d: 650 },
];

for (const product of products) {
  test(`browser and domain FitDecision agree for ${product.id}`, () => {
    const cavity = { w: 620, h: 1720, d: 660 };
    const browser = SearchCore.computeFitMeta(product, { cat: 'fridge', ...cavity, clearanceMode: 'practical' });
    const domain = evaluateFit({
      geometry: {
        closedEnvelope: {
          widthMm: product.w,
          heightMm: { minimumMm: product.h, maximumMm: product.h },
          depthMm: product.d,
        },
        installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: 0 },
      },
      cavity: { widthMm: cavity.w, heightMm: cavity.h, depthMm: cavity.d },
      evidenceLevel: 'none',
      advisoryChecks: [],
    });

    assert.equal(browser.fitDecision.outcome, domain.outcome);
    assert.deepEqual(browser.fitDecision.spare, domain.spare);
  });
}

test('partial browser searches are explicitly insufficient rather than silently verified', () => {
  const browser = SearchCore.computeFitMeta(products[0], { cat: 'fridge', w: 620, clearanceMode: 'practical' });
  assert.equal(browser.fitDecision.outcome, 'INSUFFICIENT_DATA');
});

test('manufacturer mode preserves unknown PDF clearance instead of falling back to defaults', () => {
  const product = {
    id: 'geometry-only', cat: 'fridge', brand: 'Example', w: 600, h: 1700, d: 650,
    geometry_v2: {
      category: 'fridge', formFactor: 'upright',
      closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
      operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
      service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
      delivery: { widthMm: null, heightMm: null, depthMm: null },
    },
  };
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge', w: 620, h: 1720, d: 680, clearanceMode: 'manufacturer',
  }, { brandSpecificClearance: { fridge: { __default__: { side: 5, top: 20, rear: 10 } } } });

  assert.equal(result.fitDecision.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.fitDecision.spare.widthMm, null);
  assert.equal(result.requiredCavityMm.w, null);
});

test('legacy verified_fit label cannot produce VERIFIED_FIT without receipt-backed geometry', () => {
  const product = {
    id: 'legacy-label', cat: 'fridge', brand: 'Example', w: 600, h: 1700, d: 650,
    evidence: { trust_level: 'verified_fit' },
  };
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge', w: 620, h: 1720, d: 680, clearanceMode: 'manufacturer',
  });
  assert.notEqual(result.fitDecision.outcome, 'VERIFIED_FIT');
  assert.equal(result.fitDecision.outcome, 'INSUFFICIENT_DATA');
});

test('geometry_v2 closed envelope outranks conflicting legacy dimensions', () => {
  const product = {
    id: 'conflicting-legacy', cat: 'fridge', brand: 'Example', w: 900, h: 1900, d: 900,
    geometry_v2: {
      category: 'fridge', formFactor: null,
      closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
      operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
      service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
      delivery: { widthMm: null, heightMm: null, depthMm: null },
    },
  };
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge', w: 620, h: 1720, d: 680, clearanceMode: 'practical',
  });
  assert.equal(result.fitDecision.outcome, 'LIKELY_FIT_ESTIMATED');
  assert.deepEqual(result.requiredCavityMm, { w: 610, h: 1720, d: 660 });
});

test('receipt-bound complete manufacturer geometry can produce VERIFIED_FIT', () => {
  const fields = [
    'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm',
  ];
  const fieldEvidence = Object.fromEntries(fields.map((field) => [field, {
    contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64), sourceUrl: 'https://example.com/manual.pdf',
  }]));
  const product = {
    id: 'receipt-bound', cat: 'fridge', brand: 'Example', w: 999, h: 999, d: 999,
    geometry_v2: {
      category: 'fridge', formFactor: null,
      closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 },
      installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: null },
      operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
      service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
      delivery: { widthMm: null, heightMm: null, depthMm: null },
    },
    geometry_v2_provenance: { evidenceLevel: 'verified', fieldEvidence },
  };
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge', w: 620, h: 1720, d: 680, clearanceMode: 'manufacturer',
  });
  assert.equal(result.fitDecision.outcome, 'VERIFIED_FIT');
});
