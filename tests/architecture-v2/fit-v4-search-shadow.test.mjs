import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SearchCore = require('../../public/scripts/search-core.js');

const fields = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
  'installation.leftMm',
  'installation.rightMm',
  'installation.topMm',
  'installation.rearMm',
];

const product = {
  id: 'shadow-fridge',
  cat: 'fridge',
  brand: 'Example',
  model: 'EX-600',
  w: 600,
  h: 1700,
  d: 650,
  geometry_v2: {
    category: 'fridge',
    formFactor: null,
    closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 },
    installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: null },
    operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
    service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
  },
  geometry_v2_provenance: {
    evidenceLevel: 'verified',
    identityOutcome: 'exact',
    fieldEvidence: Object.fromEntries(fields.map((field) => [field, {
      contentSha256: 'a'.repeat(64),
      receiptBindingSha256: 'b'.repeat(64),
      sourceUrl: 'https://manufacturer.example/ex-600.pdf',
    }])),
  },
};

const cavity = { w: 620, h: 1720, d: 680 };

test('cavity search exposes Fit V4 as a shadow result without replacing legacy fields', () => {
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge',
    searchMode: 'cavity',
    ...cavity,
    clearanceMode: 'manufacturer',
  });

  assert.ok(result.fitDecisionV4);
  assert.equal(result.fitDecisionV4.outcome, 'VERIFIED_FIT');
  assert.deepEqual(result.fitDecisionV4.sizeMatch.statuses, {
    width: 'PASS',
    height: 'PASS',
    depth: 'PASS',
  });
  assert.ok(result.fitDecision);
  assert.ok(Object.hasOwn(result, 'fitScore'));
  assert.ok(Object.hasOwn(result, 'requiredCavityMm'));
});

test('replacement search keeps Fit V4 isolated and returns no V4 decision', () => {
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge',
    searchMode: 'replacement',
    ...cavity,
    clearanceMode: 'manufacturer',
  });

  assert.equal(result.fitDecisionV4, null);
  assert.ok(result.fitDecision);
  assert.equal(result.searchMode, 'replacement');
  assert.ok(Object.hasOwn(result, 'sizeMatchGaps'));
});

test('cavity shadow remains insufficient when receipt-bound evidence is incomplete', () => {
  const incomplete = structuredClone(product);
  delete incomplete.geometry_v2_provenance.fieldEvidence['installation.rearMm'];

  const result = SearchCore.computeFitMeta(incomplete, {
    cat: 'fridge',
    searchMode: 'cavity',
    ...cavity,
    clearanceMode: 'manufacturer',
  });

  assert.equal(result.fitDecisionV4.outcome, 'INSUFFICIENT_DATA');
  assert.deepEqual(result.fitDecisionV4.sizeMatch.statuses, {
    width: 'PASS',
    height: 'PASS',
    depth: 'PASS',
  });
});
