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
    w: 600,
    h: 1800,
    d: 650,
    stars: 4,
    price: null,
    fitScoreNumeric: 82,
    priorityScore: 50,
    sortScore: 0.03,
    displayName: 'Test row',
    ...overrides
  };
}

test('phase 58 range filters: defaults pass everything', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b', w: 700 })];

  assert.deepEqual(applySliderFilters(rows, {}).map((row) => row.id), ['a', 'b']);
});

test('phase 58 range filters: dimension sliders reduce the result set', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'narrow', w: 595 }),
    makeRow({ id: 'wide', w: 910 })
  ];

  assert.deepEqual(applySliderFilters(rows, { widthMax: 700 }).map((row) => row.id), ['narrow']);
});

test('phase 58 range filters: score minimum excludes lower scored products', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'excellent', fitScoreNumeric: 94 }),
    makeRow({ id: 'workable', fitScoreNumeric: 68 })
  ];

  assert.deepEqual(applySliderFilters(rows, { scoreMin: 90 }).map((row) => row.id), ['excellent']);
});

test('phase 58 range filters: stars min and max both apply', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'two-star', stars: 2 }),
    makeRow({ id: 'four-star', stars: 4 }),
    makeRow({ id: 'six-star', stars: 6 })
  ];

  assert.deepEqual(applySliderFilters(rows, { starsMin: 3, starsMax: 5 }).map((row) => row.id), ['four-star']);
});

test('phase 58 range filters: verified-only no-ops when no verification metadata exists', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [makeRow({ id: 'plain-a' }), makeRow({ id: 'plain-b' })];

  assert.deepEqual(applySliderFilters(rows, { verifiedOnly: true }).map((row) => row.id), ['plain-a', 'plain-b']);
});

test('phase 58 range filters: verified-only filters when verification metadata exists', async () => {
  const { applySliderFilters } = await loadRangeFilters();
  const rows = [
    makeRow({ id: 'verified', evidence: { has_pdf_evidence: true } }),
    makeRow({ id: 'retailer', verificationLevel: 'retailer' })
  ];

  assert.deepEqual(applySliderFilters(rows, { verifiedOnly: true }).map((row) => row.id), ['verified']);
});
