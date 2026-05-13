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

test('dual-mode search: replacement mode matches physical appliance dimensions only', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    product(),
    product({ id: 'too-wide', model: 'GB601', w: 601 })
  ], { ...inputDims, searchMode: 'replacement' }, {}, { retailerOnly: false });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, 'replacement-fridge');
  assert.equal(result.rows[0].searchMode, 'replacement');
  assert.equal(result.rows[0].fitScoreNumeric, null);
  assert.deepEqual(result.rows[0].requiredCavityMm, { w: 606, h: 1820, d: 650 });
  assert.deepEqual(result.rows[0].sizeMatchGaps, { w: 4, h: 100, d: 10 });
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
