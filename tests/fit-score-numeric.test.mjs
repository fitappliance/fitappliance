import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCoreUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'search-core.js')).href;

async function loadSearchCore() {
  const module = await import(`${searchCoreUrl}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

function scoreInput(overrides = {}) {
  return {
    axisGaps: [
      { axis: 'width', spareMm: 120 },
      { axis: 'height', spareMm: 380 },
      { axis: 'depth', spareMm: 130 }
    ],
    cavity: { w: 600, h: 1900, d: 650 },
    applianceDims: { w: 470, h: 1500, d: 510 },
    clearance: { side: 5, top: 20, rear: 10 },
    ...overrides
  };
}

test('phase 58 fit score: perfect fit with at least 20 percent spare scores 100', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput()), 100);
});

test('phase 58 fit score: zero spare on every axis scores 0', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', spareMm: 0 },
      { axis: 'height', spareMm: 0 },
      { axis: 'depth', spareMm: 0 }
    ]
  })), 0);
});

test('phase 58 fit score: negative spare on any axis immediately scores 0', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', spareMm: 55 },
      { axis: 'height', spareMm: -1 },
      { axis: 'depth', spareMm: 60 }
    ]
  })), 0);
});

test('phase 58 fit score: constraint failure from appliance plus clearance scores 0 even without axis gaps', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric({
    axisGaps: [],
    cavity: { w: 600, h: 1900, d: 650 },
    applianceDims: { w: 595, h: 1850, d: 640 },
    clearance: { side: 5, top: 20, rear: 20 }
  }), 0);
});

test('phase 58 fit score: appliance plus clearance failure overrides optimistic axis gaps', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric({
    axisGaps: [
      { axis: 'width', spareMm: 40 },
      { axis: 'height', spareMm: 100 },
      { axis: 'depth', spareMm: 30 }
    ],
    cavity: { w: 600, h: 1900, d: 650 },
    applianceDims: { w: 595, h: 1850, d: 640 },
    clearance: { side: 5, top: 20, rear: 20 }
  }), 0);
});

test('phase 58 fit score: tightest 3mm applies 0.85 binding penalty', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', spareMm: 120 },
      { axis: 'height', spareMm: 380 },
      { axis: 'depth', spareMm: 3 }
    ]
  })), 60);
});

test('phase 58 fit score: tightest 7mm applies 0.95 binding penalty', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', spareMm: 120 },
      { axis: 'height', spareMm: 380 },
      { axis: 'depth', spareMm: 7 }
    ]
  })), 68);
});

test('phase 58 fit score: tightest 12mm keeps full binding multiplier', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', spareMm: 120 },
      { axis: 'height', spareMm: 380 },
      { axis: 'depth', spareMm: 12 }
    ]
  })), 73);
});

test('phase 58 fit score: score is always an integer in the 0 to 100 range', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  for (const score of [
    computeFitScoreNumeric(null),
    computeFitScoreNumeric(scoreInput({ cavity: { w: 0, h: 0, d: 0 } })),
    computeFitScoreNumeric(scoreInput({ axisGaps: [{ axis: 'width', spareMm: 9999 }] })),
    computeFitScoreNumeric(scoreInput({ axisGaps: [{ axis: 'depth', spareMm: Number.NaN }] }))
  ]) {
    assert.equal(Number.isInteger(score), true);
    assert.equal(score >= 0, true);
    assert.equal(score <= 100, true);
  }
});

test('phase 58 fit score: accepts legacy gapMm fields from existing fit axes', async () => {
  const { computeFitScoreNumeric } = await loadSearchCore();

  assert.equal(computeFitScoreNumeric(scoreInput({
    axisGaps: [
      { axis: 'width', gapMm: 120 },
      { axis: 'height', gapMm: 380 },
      { axis: 'depth', gapMm: 130 }
    ]
  })), 100);
});

test('phase 58 fit score: search results expose fitScoreNumeric beside legacy fitScore', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const { rows } = searchWithFacets([
    {
      id: 'score-fridge',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB600',
      w: 470,
      h: 1500,
      d: 510,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb600' }]
    }
  ], {
    cat: 'fridge',
    w: 600,
    h: 1900,
    d: 650
  }, {}, { retailerOnly: false });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].fitScoreNumeric, 100);
  assert.equal(typeof rows[0].fitScore, 'number');
});

test('search filtering: tolerance cannot admit products that fail required clearance', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const { rows } = searchWithFacets([
    {
      id: 'too-wide-fridge',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB596',
      w: 596,
      h: 1800,
      d: 620,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb596' }]
    }
  ], {
    cat: 'fridge',
    w: 600,
    h: 1900,
    d: 650,
    toleranceMm: 10
  }, {}, { retailerOnly: false });

  assert.equal(rows.length, 0);
});

test('search filtering: exact zero practical clearance remains eligible', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const { rows } = searchWithFacets([
    {
      id: 'zero-gap-fridge',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB590',
      w: 590,
      h: 1880,
      d: 640,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb590' }]
    }
  ], {
    cat: 'fridge',
    w: 600,
    h: 1900,
    d: 650,
    toleranceMm: 10
  }, {}, { retailerOnly: false });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].tightestGapMm, 0);
});
