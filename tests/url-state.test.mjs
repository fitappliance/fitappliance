import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCorePath = path.join(repoRoot, 'public', 'scripts', 'search-core.js');

async function loadSearchCore() {
  const module = await import(`${pathToFileURL(searchCorePath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

test('phase 45a url-state: serializeSearchState writes stable facet params', async () => {
  const { serializeSearchState } = await loadSearchCore();
  const params = serializeSearchState({
    cat: 'fridge',
    w: 600,
    h: 1800,
    d: 650,
    toleranceMm: 5,
    facets: {
      brand: ['Bosch', 'Miele'],
      priceMin: 500,
      priceMax: 2000,
      stars: 4,
      availableOnly: true
    },
    sortBy: 'price-asc'
  });

  assert.equal(
    params.toString(),
    'cat=fridge&w=600&h=1800&d=650&tol=5&brand=Bosch%2CMiele&pmin=500&pmax=2000&stars=4&sort=price-asc'
  );
});

test('phase 45a url-state: parseSearchParams reads facet params back into object form', async () => {
  const { parseSearchParams } = await loadSearchCore();
  const parsed = parseSearchParams('?cat=fridge&w=600&h=1800&d=650&tol=5&brand=Bosch,Miele&pmin=500&pmax=2000&stars=4&sort=price-asc');

  assert.deepEqual(parsed, {
    cat: 'fridge',
    w: 600,
    h: 1800,
    d: 650,
    toleranceMm: 5,
    preset: null,
    facets: {
      brand: ['Bosch', 'Miele'],
      priceMin: 500,
      priceMax: 2000,
      stars: 4,
      availableOnly: true
    },
    sortBy: 'price-asc'
  });
});

test('phase 45a url-state: serialize and parse round-trip facet state', async () => {
  const { serializeSearchState, parseSearchParams } = await loadSearchCore();
  const original = {
    cat: 'dishwasher',
    w: 600,
    h: 820,
    d: 600,
    toleranceMm: 8,
    preset: 'builtin-600',
    facets: {
      brand: ['Bosch'],
      priceMin: 900,
      priceMax: 1800,
      stars: 5,
      availableOnly: false
    },
    sortBy: 'popularity'
  };

  const parsed = parseSearchParams(`?${serializeSearchState(original).toString()}`);
  assert.deepEqual(parsed, original);
});

test('phase 45a url-state: parseSearchParams sanitises invalid sort and ignores negative prices', async () => {
  const { parseSearchParams } = await loadSearchCore();
  const parsed = parseSearchParams('?cat=fridge&pmin=-50&pmax=-10&sort=drop-table&brand=Bosch');

  assert.equal(parsed.sortBy, 'best-fit');
  assert.equal(parsed.facets.priceMin, null);
  assert.equal(parsed.facets.priceMax, null);
});

test('phase 45a url-state: parseSearchParams truncates overlong brand tokens', async () => {
  const { parseSearchParams } = await loadSearchCore();
  const longBrand = 'A'.repeat(80);
  const parsed = parseSearchParams(`?cat=fridge&brand=${longBrand},Bosch`);

  assert.equal(parsed.facets.brand[0].length, 50);
  assert.equal(parsed.facets.brand[1], 'Bosch');
});

