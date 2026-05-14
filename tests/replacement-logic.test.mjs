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

function washer(overrides = {}) {
  return {
    id: 'standard-washer',
    cat: 'washing_machine',
    brand: 'LG',
    model: 'WV9-1412W',
    displayName: 'LG 12kg Front Load Washer',
    w: 600,
    h: 850,
    d: 615,
    unavailable: false,
    retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wv9-1412w' }],
    ...overrides
  };
}

function tower(overrides = {}) {
  return washer({
    id: 'lg-washtower',
    model: 'WWT-1710B',
    displayName: 'LG WashTower 17kg/10kg Combo',
    features: ['WashTower', 'Washer dryer tower'],
    w: 600,
    h: 1890,
    d: 660,
    ...overrides
  });
}

const standardOldWasher = {
  cat: 'washing_machine',
  searchMode: 'replacement',
  replacementSourceCategory: 'washing_machine',
  w: 620,
  h: 870,
  d: 680,
  toleranceMm: 0
};

test('replacement quarantine: standard washer replacement excludes WashTower products', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    washer(),
    tower({ h: 860 })
  ], standardOldWasher, {}, { retailerOnly: false });

  assert.deepEqual(result.rows.map((row) => row.id), ['standard-washer']);
});

test('replacement quarantine: dryer replacement excludes laundry towers', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    washer({ id: 'dryer', cat: 'dryer', model: 'DVH5-08W', h: 850 }),
    tower({ id: 'dryer-tower', cat: 'dryer', model: 'WK-EXAMPLE', h: 860 })
  ], {
    cat: 'dryer',
    searchMode: 'replacement',
    replacementSourceCategory: 'dryer',
    w: 620,
    h: 870,
    d: 680,
    toleranceMm: 0
  }, {}, { retailerOnly: false });

  assert.deepEqual(result.rows.map((row) => row.id), ['dryer']);
});

test('replacement quarantine: tower inventory replacement only returns tower products', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    washer({ h: 850 }),
    tower({ h: 1880 })
  ], {
    cat: 'washing_machine',
    searchMode: 'replacement',
    replacementSourceCategory: 'washtower_combo',
    w: 650,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, {}, { retailerOnly: false });

  assert.deepEqual(result.rows.map((row) => row.id), ['lg-washtower']);
});

test('replacement quarantine: manual standard-height replacement search keeps hard height wall', async () => {
  const { searchWithFacets } = await loadSearchCore();

  const result = searchWithFacets([
    washer(),
    tower({ h: 1000 })
  ], {
    cat: 'washing_machine',
    searchMode: 'replacement',
    w: 620,
    h: 870,
    d: 700,
    toleranceMm: 0
  }, {}, { retailerOnly: false });

  assert.deepEqual(result.rows.map((row) => row.id), ['standard-washer']);
});

