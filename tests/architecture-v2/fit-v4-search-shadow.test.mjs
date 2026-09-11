import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const FitEngine = require('../../public/scripts/fit-engine.js');
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

test('cavity search result carries Fit V4 to the UI boundary', () => {
  const result = SearchCore.searchWithFacets([{
    ...product,
    unavailable: false,
    retailers: [{ n: 'Example', url: 'https://example.com/ex-600' }],
  }], {
    cat: 'fridge',
    searchMode: 'cavity',
    ...cavity,
    clearanceMode: 'manufacturer',
  }, {}, { retailerOnly: false });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].fitDecisionV4.outcome, 'VERIFIED_FIT');
});

test('replacement search keeps Fit V4 isolated and returns no V4 decision', () => {
  const result = SearchCore.computeFitMeta(product, {
    cat: 'fridge',
    searchMode: 'replacement',
    ...cavity,
    clearanceMode: 'manufacturer',
  });

  assert.equal(result.fitDecisionV4, null);
  assert.equal(result.fitDecision, null);
  assert.equal(result.searchMode, 'replacement');
  assert.ok(Object.hasOwn(result, 'sizeMatchGaps'));
});

test('replacement search does not invoke the FitDecision engine', () => {
  const searchCorePath = require.resolve('../../public/scripts/search-core.js');
  const originalCacheEntry = require.cache[searchCorePath];
  const originalLoad = Module._load;
  let calls = 0;
  const instrumentedFitEngine = Object.freeze({
    ...FitEngine,
    evaluateFit: (...args) => {
      calls += 1;
      return FitEngine.evaluateFit(...args);
    },
  });

  try {
    Module._load = function load(request, parent, isMain) {
      if (request === './fit-engine.js' && parent?.filename === searchCorePath) {
        return instrumentedFitEngine;
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[searchCorePath];
    const instrumentedSearchCore = require('../../public/scripts/search-core.js');
    instrumentedSearchCore.computeFitMeta(product, {
      cat: 'fridge',
      searchMode: 'replacement',
      ...cavity,
      clearanceMode: 'manufacturer',
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[searchCorePath];
    if (originalCacheEntry) require.cache[searchCorePath] = originalCacheEntry;
  }

  assert.equal(calls, 0);
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
