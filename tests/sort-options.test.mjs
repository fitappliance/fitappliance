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

function makeRow(overrides = {}) {
  return {
    id: 'row-1',
    price: 1000,
    stars: 4,
    priorityScore: 70,
    exactFit: true,
    sortScore: 0.02,
    displayName: 'Row One',
    ...overrides
  };
}

test('phase 45a sort: best-fit uses existing fit ordering', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'looser', sortScore: 0.08, priorityScore: 50 }),
    makeRow({ id: 'tighter', sortScore: 0.02, priorityScore: 50 })
  ];

  const sorted = sortMatches(rows, 'best-fit');
  assert.deepEqual(sorted.map((row) => row.id), ['tighter', 'looser']);
});

test('phase 45a sort: price-asc sorts low to high with null last', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'null-price', price: null }),
    makeRow({ id: 'high', price: 2200 }),
    makeRow({ id: 'low', price: 800 })
  ];

  const sorted = sortMatches(rows, 'price-asc');
  assert.deepEqual(sorted.map((row) => row.id), ['low', 'high', 'null-price']);
});

test('phase 45a sort: price-desc sorts high to low with null last', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'null-price', price: null }),
    makeRow({ id: 'high', price: 2200 }),
    makeRow({ id: 'low', price: 800 })
  ];

  const sorted = sortMatches(rows, 'price-desc');
  assert.deepEqual(sorted.map((row) => row.id), ['high', 'low', 'null-price']);
});

test('phase 45a sort: popularity sorts by priorityScore descending', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'mid', priorityScore: 60 }),
    makeRow({ id: 'high', priorityScore: 90 }),
    makeRow({ id: 'low', priorityScore: 10 })
  ];

  const sorted = sortMatches(rows, 'popularity');
  assert.deepEqual(sorted.map((row) => row.id), ['high', 'mid', 'low']);
});

test('phase 45a sort: stars sorts by star rating then falls back to best-fit', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'five-loose', stars: 5, sortScore: 0.06 }),
    makeRow({ id: 'five-tight', stars: 5, sortScore: 0.02 }),
    makeRow({ id: 'four-tight', stars: 4, sortScore: 0.01 })
  ];

  const sorted = sortMatches(rows, 'stars');
  assert.deepEqual(sorted.map((row) => row.id), ['five-tight', 'five-loose', 'four-tight']);
});

test('phase 45a sort: unknown sort falls back to best-fit without mutating input', async () => {
  const { sortMatches } = await loadSearchCore();
  const rows = [
    makeRow({ id: 'b', sortScore: 0.08 }),
    makeRow({ id: 'a', sortScore: 0.02 })
  ];
  const snapshot = JSON.stringify(rows);

  const sorted = sortMatches(rows, 'made-up');

  assert.deepEqual(sorted.map((row) => row.id), ['a', 'b']);
  assert.equal(JSON.stringify(rows), snapshot);
});

