import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCoreUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'search-core.js')).href;

async function loadSearchCore() {
  const module = await import(`${searchCoreUrl}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

function product(overrides = {}) {
  return {
    id: 'replacement-fridge',
    cat: 'fridge',
    brand: 'LG',
    model: 'GB600',
    w: 596,
    h: 1800,
    d: 640,
    unavailable: false,
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb600' }],
    ...overrides
  };
}

const inputDims = {
  cat: 'fridge',
  w: 600,
  h: 1900,
  d: 650,
  toleranceMm: 10
};

test('dual-mode search: cavity mode remains strict about required clearance', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([product()], inputDims, {}, { retailerOnly: false });

  assert.equal(result.rows.length, 0);
});

test('dual-mode search: replacement mode directly ranks both slightly larger and smaller appliances', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    product(),
    product({ id: 'larger-one-mm', model: 'GB601', w: 601, d: 650 })
  ], {
    ...inputDims,
    h: 1800,
    searchMode: 'replacement'
  }, {}, { retailerOnly: false });

  assert.deepEqual(result.rows.map((row) => row.id), ['larger-one-mm', 'replacement-fridge']);
  assert.equal(result.rows[0].searchMode, 'replacement');
  assert.deepEqual(result.rows[0].replacementMatch.deltasMm, { width: 1, height: 0, depth: 0 });
  for (const forbidden of ['fitScore', 'fitScoreNumeric', 'fitDecision', 'requiredCavityMm', 'clearance']) {
    assert.equal(forbidden in result.rows[0], false, `${forbidden} must not leak into replacement results`);
  }
});

test('dual-mode search: replacement mode never invokes FitEngine', async () => {
  const context = vm.createContext({ URL, URLSearchParams });
  context.FitEngine = {
    evaluateFit() { throw new Error('replacement called FitEngine'); }
  };
  vm.runInContext(
    readFileSync(path.join(repoRoot, 'public/scripts/replacement-match-engine.js'), 'utf8'),
    context,
  );
  vm.runInContext(readFileSync(path.join(repoRoot, 'public/scripts/search-core.js'), 'utf8'), context);
  const result = context.SearchCore.searchWithFacets([product()], {
    cat: 'fridge', w: 600, h: 1800, d: 650, searchMode: 'replacement'
  }, {}, { retailerOnly: false });
  assert.equal(result.rows.length, 1);
});

test('dual-mode search: replacement output displays the same canonical dimensions used for ranking', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const result = searchWithFacets([product({
    w: 700,
    h: 1850,
    d: 720,
    geometry_v2: {
      closedEnvelope: {
        widthMm: 914,
        heightMm: { minimumMm: 1792, maximumMm: 1792 },
        depthMm: 729,
      },
    },
  })], {
    cat: 'fridge', w: 914, h: 1792, d: 729, searchMode: 'replacement',
  }, {}, { retailerOnly: false });

  assert.deepEqual([result.rows[0].w, result.rows[0].h, result.rows[0].d], [914, 1792, 729]);
  assert.equal(result.rows[0].replacementMatch.candidateDimensionSource, 'geometry_v2');
});

test('dual-mode search: searchMode URL state round-trips and cavity remains default', async () => {
  const { parseSearchParams, serializeSearchState } = await loadSearchCore();

  const replacementParams = serializeSearchState({ ...inputDims, searchMode: 'replacement' });
  const cavityParams = serializeSearchState({ ...inputDims, searchMode: 'cavity' });

  assert.match(replacementParams.toString(), /searchMode=replacement/);
  assert.equal(parseSearchParams(`?${replacementParams.toString()}`).searchMode, 'replacement');
  assert.doesNotMatch(cavityParams.toString(), /searchMode=/);
  assert.equal(parseSearchParams(`?${cavityParams.toString()}`).searchMode ?? 'cavity', 'cavity');
});
