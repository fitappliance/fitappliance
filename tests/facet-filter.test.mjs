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

function makeMatch(overrides = {}) {
  return {
    id: 'm1',
    brand: 'Bosch',
    price: 1299,
    stars: 4,
    unavailable: false,
    retailers: [{ n: 'AO', p: 1299 }],
    priorityScore: 80,
    exactFit: true,
    sortScore: 0.03,
    displayName: 'Bosch Serie 4',
    ...overrides
  };
}

test('phase 45a facets: applyFacets filters brands case-insensitively without mutating input', async () => {
  const { applyFacets } = await loadSearchCore();
  const rows = [
    makeMatch({ id: 'bosch-1', brand: 'Bosch' }),
    makeMatch({ id: 'miele-1', brand: 'Miele' }),
    makeMatch({ id: 'lg-1', brand: 'LG' })
  ];
  const snapshot = JSON.stringify(rows);

  const result = applyFacets(rows, {
    brand: ['bosch', 'MIELE']
  });

  assert.deepEqual(result.rows.map((row) => row.id), ['bosch-1', 'miele-1']);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('phase 45a facets: applyFacets filters price range and excludes unpriced by default', async () => {
  const { applyFacets } = await loadSearchCore();
  const rows = [
    makeMatch({ id: 'cheap', price: 499 }),
    makeMatch({ id: 'mid', price: 1200 }),
    makeMatch({ id: 'null-price', price: null }),
    makeMatch({ id: 'premium', price: 2400 })
  ];

  const result = applyFacets(rows, {
    priceMin: 500,
    priceMax: 2000
  });

  assert.deepEqual(result.rows.map((row) => row.id), ['mid']);
});

test('phase 45a facets: applyFacets filters minimum stars and available-only rows', async () => {
  const { applyFacets } = await loadSearchCore();
  const rows = [
    makeMatch({ id: 'available-4', stars: 4, unavailable: false, retailers: [{ n: 'AO', p: 1000 }] }),
    makeMatch({ id: 'available-3', stars: 3, unavailable: false, retailers: [{ n: 'AO', p: 1000 }] }),
    makeMatch({ id: 'flagged-unavailable', stars: 5, unavailable: true, retailers: [{ n: 'AO', p: 1000 }] }),
    makeMatch({ id: 'no-retailers', stars: 5, unavailable: false, retailers: [] })
  ];

  const result = applyFacets(rows, {
    stars: 4,
    availableOnly: true
  });

  assert.deepEqual(result.rows.map((row) => row.id), ['available-4']);
});

test('phase 45a facets: empty facets return original rows and pool-based counts', async () => {
  const { applyFacets } = await loadSearchCore();
  const rows = [
    makeMatch({ id: 'bosch-a', brand: 'Bosch', stars: 4 }),
    makeMatch({ id: 'bosch-b', brand: 'Bosch', stars: 5 }),
    makeMatch({ id: 'miele-a', brand: 'Miele', stars: 3 }),
    makeMatch({ id: 'lg-a', brand: 'LG', stars: 2 })
  ];

  const result = applyFacets(rows, {});

  assert.deepEqual(result.rows.map((row) => row.id), ['bosch-a', 'bosch-b', 'miele-a', 'lg-a']);
  assert.deepEqual(result.counts.brand, {
    Bosch: 2,
    Miele: 1,
    LG: 1
  });
  assert.deepEqual(result.counts.stars, {
    2: 1,
    3: 1,
    4: 1,
    5: 1
  });
});

test('phase 45a facets: searchWithFacets returns filtered rows with counts based on the dimension-matched pool', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const products = [
    makeMatch({ id: 'bosch-fit', cat: 'fridge', brand: 'Bosch', w: 595, h: 1800, d: 650 }),
    makeMatch({ id: 'miele-fit', cat: 'fridge', brand: 'Miele', w: 595, h: 1800, d: 650 }),
    makeMatch({ id: 'lg-fit', cat: 'fridge', brand: 'LG', w: 595, h: 1800, d: 650, stars: 3 }),
    makeMatch({ id: 'too-wide', cat: 'fridge', brand: 'Bosch', w: 700, h: 1800, d: 650 })
  ];

  const result = searchWithFacets(products, {
    cat: 'fridge',
    w: 620,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, {
    brand: ['Bosch', 'Miele'],
    stars: 4
  });

  assert.deepEqual(result.rows.map((row) => row.id), ['bosch-fit', 'miele-fit']);
  assert.deepEqual(result.counts.brand, {
    Bosch: 1,
    Miele: 1,
    LG: 1
  });
});

