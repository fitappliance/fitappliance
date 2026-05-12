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
