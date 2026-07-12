import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rangeFiltersPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'range-filters.js');

async function loadRangeFilters() {
  return import(`${pathToFileURL(rangeFiltersPath).href}?cacheBust=${Date.now()}`);
}

function makeRow(overrides = {}) {
  return {
    id: 'row',
    brand: 'LG',
    fitScoreNumeric: 80,
    priorityScore: 50,
    sortScore: 0.04,
    displayName: 'Row',
    ...overrides
  };
}

test('phase 58 sort: fit-score-desc puts highest score first', async () => {
  const { sortRowsForRtings } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'score-70', fitScoreNumeric: 70 }),
    makeRow({ id: 'score-94', fitScoreNumeric: 94 }),
    makeRow({ id: 'score-82', fitScoreNumeric: 82 })
  ];

  assert.deepEqual(sortRowsForRtings(rows, 'fit-score-desc').map((row) => row.id), ['score-94', 'score-82', 'score-70']);
});

test('phase 58 sort: verified-first groups verified rows then sorts by score', async () => {
  const { sortRowsForRtings } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'plain-high', fitScoreNumeric: 99 }),
    makeRow({ id: 'verified-low', fitScoreNumeric: 70, evidence: { has_pdf_evidence: true } }),
    makeRow({ id: 'verified-high', fitScoreNumeric: 92, data_source: 'official_pdf' })
  ];

  assert.deepEqual(sortRowsForRtings(rows, 'verified-first').map((row) => row.id), ['verified-high', 'verified-low', 'plain-high']);
});

test('phase 58 sort: brand A-Z remains available', async () => {
  const { sortRowsForRtings } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'westinghouse', brand: 'Westinghouse' }),
    makeRow({ id: 'bosch', brand: 'Bosch' }),
    makeRow({ id: 'lg', brand: 'LG' })
  ];

  assert.deepEqual(sortRowsForRtings(rows, 'brand').map((row) => row.id), ['bosch', 'lg', 'westinghouse']);
});

test('replacement default sort preserves direct dimension distance ahead of popularity', async () => {
  const { sortRowsForRtings } = await loadRangeFilters();
  const rows = [
    makeRow({
      id: 'far-popular',
      priorityScore: 100,
      fitScoreNumeric: null,
      replacementMatch: { maxAbsoluteDeltaMm: 30, normalizedDistance: 0.02, totalAbsoluteDeltaMm: 40 }
    }),
    makeRow({
      id: 'near-unpopular',
      priorityScore: 1,
      fitScoreNumeric: null,
      replacementMatch: { maxAbsoluteDeltaMm: 2, normalizedDistance: 0.003, totalAbsoluteDeltaMm: 4 }
    })
  ];

  assert.deepEqual(
    sortRowsForRtings(rows, 'closest-size').map((row) => row.id),
    ['near-unpopular', 'far-popular']
  );
});

test('replacement display ordering never injects sponsored products ahead of closer size matches', async () => {
  const { orderRowsForDisplay } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'closest-sponsored', sponsored: true }),
    makeRow({ id: 'second', sponsored: false }),
    makeRow({ id: 'third', sponsored: false }),
  ];

  assert.deepEqual(
    orderRowsForDisplay(rows, { searchMode: 'replacement' }).map((row) => row.id),
    ['closest-sponsored', 'second', 'third'],
  );
  assert.deepEqual(
    orderRowsForDisplay(rows, { searchMode: 'cavity' }).map((row) => row.id),
    ['second', 'third', 'closest-sponsored'],
  );
});

test('replacement rows fail closed to size order when a cavity-only sort is restored', async () => {
  const { sortRowsForRtings } = await loadRangeFilters();
  const rows = [
    makeRow({
      id: 'far-verified',
      evidence: { has_pdf_evidence: true },
      replacementMatch: { maxAbsoluteDeltaMm: 20, normalizedDistance: 0.02, totalAbsoluteDeltaMm: 25 },
    }),
    makeRow({
      id: 'near-unverified',
      evidence: null,
      replacementMatch: { maxAbsoluteDeltaMm: 2, normalizedDistance: 0.002, totalAbsoluteDeltaMm: 3 },
    }),
  ];

  assert.deepEqual(
    sortRowsForRtings(rows, 'verified-first').map((row) => row.id),
    ['near-unverified', 'far-verified'],
  );
});
