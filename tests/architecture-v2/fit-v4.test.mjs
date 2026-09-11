import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFitV4 } from '../../src/domain/fit-v4.mjs';

function geometry({ installation = {}, category = 'fridge' } = {}) {
  return {
    category,
    formFactor: 'upright',
    closedEnvelope: {
      widthMm: 600,
      heightMm: { minimumMm: 1700, maximumMm: 1700 },
      depthMm: 650,
    },
    installation: {
      leftMm: null,
      rightMm: null,
      topMm: null,
      rearMm: null,
      frontMm: null,
      ...installation,
    },
    operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
    service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
  };
}

function product(overrides = {}) {
  return {
    id: 'fridge-example',
    cat: 'fridge',
    w: 600,
    h: 1700,
    d: 650,
    geometry_v2: geometry(),
    ...overrides,
  };
}

const cavity = { widthMm: 620, heightMm: 1720, depthMm: 680 };

test('keeps size matching while evidence-incomplete products are INSUFFICIENT_DATA', () => {
  const result = evaluateFitV4({ product: product(), cavity });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.deepEqual(result.sizeMatch.statuses, { width: 'PASS', height: 'PASS', depth: 'PASS' });
  assert.deepEqual(result.sizeMatch.gapsMm, { width: 20, height: 20, depth: 30 });
  assert.notEqual(result.outcome, 'VERIFIED_FIT');
});

test('preserves a hard dimensional conflict as NO_FIT without upgrading evidence', () => {
  const result = evaluateFitV4({
    product: product({
      w: 700,
      geometry_v2: {
        ...geometry(),
        closedEnvelope: { ...geometry().closedEnvelope, widthMm: 700 },
      },
    }),
    cavity,
  });

  assert.equal(result.outcome, 'NO_FIT');
  assert.equal(result.sizeMatch.statuses.width, 'FAIL');
  assert.notEqual(result.outcome, 'VERIFIED_FIT');
});

test('legacy verified labels cannot authorize VERIFIED_FIT', () => {
  const result = evaluateFitV4({
    product: product({
      evidence: { trust_level: 'verified_fit', clearance_verified: true },
      geometry_v2: undefined,
    }),
    cavity,
  });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.evidenceLevel, 'none');
});

test('receipt-bound verified eligibility is the only positive verified gate', () => {
  const source = product({
    geometry_v2: geometry({ installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10 } }),
    geometry_v2_provenance: { evidenceLevel: 'verified', verifiedFitEligible: true },
  });
  const result = evaluateFitV4({ product: source, cavity });

  assert.equal(result.outcome, 'VERIFIED_FIT');
  assert.equal(result.evidenceLevel, 'verified');
});

test('does not mutate the product or cavity inputs', () => {
  const source = product();
  const inputSnapshot = structuredClone({ source, cavity });

  evaluateFitV4({ product: source, cavity });

  assert.deepEqual({ source, cavity }, inputSnapshot);
});
