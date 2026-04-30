import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCorePath = path.join(repoRoot, 'public', 'scripts', 'search-core.js');

async function loadSearchCore() {
  const module = await import(`${pathToFileURL(searchCorePath).href}?cacheBust=${Date.now()}-${Math.random()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeProduct(overrides = {}) {
  return {
    id: 'base',
    cat: 'fridge',
    brand: 'LG',
    model: 'BASE-1',
    displayName: 'LG Base Fridge',
    w: 590,
    h: 1800,
    d: 620,
    price: 1099,
    stars: 4,
    priorityScore: 50,
    unavailable: true,
    retailers: [],
    ...overrides
  };
}

const standardCavity = { cat: 'fridge', w: 600, h: 1900, d: 650, toleranceMm: 0 };

test('phase 48 retailer-only: searchWithFacets defaults to rows with retailer links', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = [
    makeProduct({ id: 'with-retailer', retailers: [{ n: 'JB Hi-Fi', p: 1099, url: 'https://www.jbhifi.com.au/products/lg-base-1' }] }),
    makeProduct({ id: 'without-retailer', brand: 'Vogue', retailers: [] })
  ];

  const result = searchWithFacets(products, standardCavity, {}, { limit: Number.MAX_SAFE_INTEGER });

  assert.deepEqual(result.rows.map((row) => row.id), ['with-retailer']);
  assert.deepEqual(result.counts.brand, { LG: 1 });
});

test('phase 48 retailer-only: retailerOnly false keeps the full matching pool', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = [
    makeProduct({ id: 'with-retailer', retailers: [{ n: 'JB Hi-Fi', p: 1099, url: 'https://www.jbhifi.com.au/products/lg-base-1' }] }),
    makeProduct({ id: 'without-retailer', brand: 'Vogue', retailers: [] })
  ];

  const result = searchWithFacets(products, standardCavity, {}, {
    limit: Number.MAX_SAFE_INTEGER,
    retailerOnly: false
  });

  assert.deepEqual(result.rows.map((row) => row.id), ['with-retailer', 'without-retailer']);
  assert.deepEqual(result.counts.brand, { LG: 1, Vogue: 1 });
});

test('phase 48 retailer-only: URL showAll=1 disables the default retailer-only filter', async () => {
  const { parseSearchParams, serializeSearchState } = await loadSearchCore();

  assert.equal(parseSearchParams('?cat=fridge').retailerOnly, true);
  assert.equal(parseSearchParams('?cat=fridge&showAll=1').retailerOnly, false);
  assert.doesNotMatch(serializeSearchState({ cat: 'fridge', retailerOnly: true }).toString(), /showAll/);
  assert.match(serializeSearchState({ cat: 'fridge', retailerOnly: false }).toString(), /showAll=1/);
});

test('hotfix retailer URL quality: retailer-only ignores root, search, and category URLs', async () => {
  const { hasRetailerLink } = await loadSearchCore();

  assert.equal(hasRetailerLink(makeProduct({
    retailers: [{ n: 'Harvey Norman', url: 'https://www.harveynorman.com.au' }]
  })), false);
  assert.equal(hasRetailerLink(makeProduct({
    retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/search/?q=undefined' }]
  })), false);
  assert.equal(hasRetailerLink(makeProduct({
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/collections/fridges' }]
  })), false);
  assert.equal(hasRetailerLink(makeProduct({
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb335pl' }]
  })), true);
});

test('hotfix retailer URL quality: default search excludes products with only invalid retailer URLs', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = [
    makeProduct({ id: 'valid', retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb335pl' }] }),
    makeProduct({ id: 'root-only', brand: 'Mitsubishi', retailers: [{ n: 'Appliances Online', url: 'https://www.appliances-online.com.au', p: 4999 }] })
  ];

  const result = searchWithFacets(products, standardCavity, {}, { limit: Number.MAX_SAFE_INTEGER });

  assert.deepEqual(result.rows.map((row) => row.id), ['valid']);
});

test('phase 48 retailer-only: wide fridge search prefers retailer-verified rows over the full catalogue', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', 'fridges.json'), 'utf8')).products;
  const wideCavity = { cat: 'fridge', w: 1000, h: 1900, d: 800, toleranceMm: 0 };
  const retailerResult = searchWithFacets(products, wideCavity, {}, { limit: Number.MAX_SAFE_INTEGER });
  const allResult = searchWithFacets(products, wideCavity, {}, {
    limit: Number.MAX_SAFE_INTEGER,
    retailerOnly: false
  });

  assert.ok(retailerResult.rows.length >= 9, `expected at least 9 retailer-verified rows, got ${retailerResult.rows.length}`);
  assert.ok(retailerResult.rows.length < allResult.rows.length, 'retailer-only should be a smaller, cleaner pool');
  assert.ok(retailerResult.rows.every((row) => Array.isArray(row.retailers) && row.retailers.length > 0));
});

test('phase 48 retailer-only: tight cavity with no retailer-verified products has transparent fallback', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', 'fridges.json'), 'utf8')).products;
  // Pick a cavity that fits some products but where none of them have retailer data,
  // so the fallback (retailerOnly=false) is the only way to surface results.
  const tightCavity = { cat: 'fridge', w: 450, h: 850, d: 500, toleranceMm: 0 };
  const retailerResult = searchWithFacets(products, tightCavity, {}, { limit: Number.MAX_SAFE_INTEGER });
  const allResult = searchWithFacets(products, tightCavity, {}, {
    limit: Number.MAX_SAFE_INTEGER,
    retailerOnly: false
  });

  assert.equal(retailerResult.rows.length, 0);
  assert.ok(allResult.rows.length > 0, `expected a full-catalog fallback pool, got ${allResult.rows.length}`);
});
