import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCorePath = path.join(repoRoot, 'public', 'scripts', 'search-core.js');

async function loadSearchCore() {
  const module = await import(`${pathToFileURL(searchCorePath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'Bosch',
    model: 'KGN396LBAS Top Mount 368L',
    w: 595,
    h: 1860,
    d: 665,
    priorityScore: 72,
    displayName: 'Bosch Serie 4',
    readableSpec: '368L Top-Mount',
    ...overrides
  };
}

function makeDefaults() {
  return {
    fridge: { rear: 25, sides: 5, top: 25 },
    dishwasher: { rear: 5, sides: 0, top: 5 },
    dryer: { rear: 25, sides: 5, top: 0 },
    washing_machine: { rear: 15, sides: 5, top: 0 }
  };
}

test('phase 42a search-ux: missing height input still allows width/depth filtering', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct(),
    makeProduct({ id: 'p2', d: 691 })
  ], {
    cat: 'fridge',
    w: 630,
    h: null,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'p1');
});

test('phase 42a search-ux: clearance defaults are subtracted from cavity before matching', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'tight', w: 621, d: 675 })
  ], {
    cat: 'fridge',
    w: 630,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches.length, 0);
});

test('phase 42a search-ux: zero tolerance excludes a 2mm oversize result', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'oversize', w: 603 })
  ], {
    cat: 'fridge',
    w: 612,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches.length, 0);
});

test('phase 42a search-ux: 5mm tolerance includes a 2mm oversize result and marks tight fit', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'oversize', w: 603 })
  ], {
    cat: 'fridge',
    w: 612,
    h: 1900,
    d: 700,
    toleranceMm: 5
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'oversize');
  assert.equal(matches[0].fitsTightly, true);
});

test('phase 42a search-ux: tighter fit outranks looser fit when priority is equal', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'loose', w: 560, d: 620, priorityScore: 50 }),
    makeProduct({ id: 'closer', w: 590, d: 660, priorityScore: 50 })
  ], {
    cat: 'fridge',
    w: 630,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches[0].id, 'closer');
});

test('phase 42a search-ux: within the same fit band higher priorityScore ranks first', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'priority-low', w: 590, d: 660, priorityScore: 50 }),
    makeProduct({ id: 'priority-high', w: 590, d: 660, priorityScore: 88 })
  ], {
    cat: 'fridge',
    w: 630,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches[0].id, 'priority-high');
});

test('phase 42a search-ux: results expose Popular in AU badge state when priorityScore >= 70', async () => {
  const { findSearchMatches } = await loadSearchCore();
  const matches = findSearchMatches([
    makeProduct({ id: 'popular', priorityScore: 70 })
  ], {
    cat: 'fridge',
    w: 630,
    h: 1900,
    d: 700,
    toleranceMm: 0
  }, { clearanceDefaults: makeDefaults() });

  assert.equal(matches[0].showPopularityBadge, true);
});

test('phase 42a search-ux: serialise and parse preserves category, dims, tolerance and preset', async () => {
  const { serializeSearchState, parseSearchParams } = await loadSearchCore();
  const params = serializeSearchState({
    cat: 'dishwasher',
    w: 600,
    h: 820,
    d: 600,
    toleranceMm: 5,
    preset: 'standard'
  });

  const parsed = parseSearchParams(`?${params.toString()}`);
  assert.deepEqual(parsed, {
    cat: 'dishwasher',
    w: 600,
    h: 820,
    d: 600,
    toleranceMm: 5,
    preset: 'standard',
    facets: {
      brand: [],
      priceMin: null,
      priceMax: null,
      stars: null,
      availableOnly: false
    },
    clearanceMode: 'practical',
    retailerOnly: true,
    sortBy: 'best-fit'
  });
});

test('phase 42a search-ux: parseSearchParams defaults tolerance to 5mm when omitted', async () => {
  const { parseSearchParams } = await loadSearchCore();
  const parsed = parseSearchParams('?cat=fridge&w=600&d=650');

  assert.equal(parsed.toleranceMm, 5);
  assert.equal(parsed.sortBy, 'best-fit');
  assert.equal(parsed.facets.availableOnly, false);
});

test('phase 42a search-ux: empty state offers relax CTA when tolerance would surface matches', async () => {
  const { buildEmptyState } = await loadSearchCore();
  const state = buildEmptyState({
    exactCount: 0,
    relaxedCount: 12,
    toleranceMm: 5,
    categoryLabel: 'Fridges'
  });

  assert.match(state.title, /0 exact matches/i);
  assert.match(state.detail, /\+5mm tolerance/i);
  assert.match(state.ctaLabel, /Relax/i);
});

test('phase 42a search-ux: fridge presets expose 600, 700, and 900mm shortcuts', async () => {
  const { CATEGORY_PRESETS } = await loadSearchCore();
  assert.deepEqual(
    CATEGORY_PRESETS.fridge.map((entry) => entry.w),
    [600, 700, 900]
  );
});

test('phase 45a search-ux: homepage wires facet shell, active chips, sort dropdown, and stylesheet hook', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /<link rel="stylesheet" href="\/styles\.css(?:\?[^"]+)?">/);
  assert.match(indexHtml, /data-facet-bar/);
  assert.match(indexHtml, /data-active-chips/);
  assert.match(indexHtml, /data-sort-dropdown/);
  assert.match(indexHtml, /data-live-count/);
});

test('phase 45a search-ux: results count is hidden for empty results and restored for non-empty results', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /if\s*\(\s*currentMatchRows\.length\s*===\s*0\s*\)\s*\{[\s\S]*resultsCount\.hidden\s*=\s*true;/);
  assert.match(indexHtml, /resultsCount\.hidden\s*=\s*false;[\s\S]*resultsCount\.innerHTML\s*=\s*`<b>\$\{currentMatchRows\.length\}/);
});

test('phase 45b search-ux: mobile filter sheet is wired to active facet and result counts', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /data-mobile-filter-trigger/);
  assert.match(indexHtml, /data-mobile-sheet-body/);
  assert.match(indexHtml, /SearchDom\.renderMobileFilterSheet\(\{/);
  assert.match(indexHtml, /activeFacetCount:\s*countActiveFacets\(activeFacetState\)/);
  assert.match(indexHtml, /resultCount:\s*currentMatchRows\.length/);
});

test('phase 52 mobile UX: homepage measurement inputs request numeric mobile keyboards', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  for (const id of ['inW', 'inH', 'inD', 'inDoor']) {
    const input = indexHtml.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`))?.[0] ?? '';
    assert.match(input, /type="number"/, `${id} should remain a numeric input`);
    assert.match(input, /inputmode="numeric"/, `${id} should request the numeric mobile keyboard`);
    assert.match(input, /pattern="\[0-9\]\*"/, `${id} should hint digit-only input on mobile`);
    assert.match(input, /autocomplete="off"/, `${id} should avoid stale browser autofill values`);
  }
});

test('phase 52 mobile UX: primary fit CTA is sticky in the mobile thumb zone', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /<button class="btn-search btn-search--primary" onclick="doSearch\(\)">/);
  assert.match(indexHtml, /@media\(max-width:660px\)\{[\s\S]*\.btn-search--primary\s*\{[\s\S]*position:\s*sticky/);
  assert.match(indexHtml, /@media\(max-width:660px\)\{[\s\S]*\.btn-search--primary\s*\{[\s\S]*bottom:\s*12px/);
});

test('phase 45b search-ux: clear all resets facet state without touching dimension filters', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /function clearAllFacets\(\)\s*\{/);
  assert.match(indexHtml, /brand:\s*\[\]/);
  assert.match(indexHtml, /priceMin:\s*null/);
  assert.match(indexHtml, /priceMax:\s*null/);
  assert.match(indexHtml, /availableOnly:\s*false/);
  assert.match(indexHtml, /refreshSearchResults\(\);/);
});

test('phase 45c search-ux: homepage wires saved search store and controls', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /import '\/scripts\/saved-search-store\.js';/);
  assert.match(indexHtml, /data-save-search/);
  assert.match(indexHtml, /data-saved-searches/);
  assert.match(indexHtml, /SavedSearchStore\.createSavedSearchStore\(\)/);
  assert.match(indexHtml, /function restoreSavedSearchState/);
});

test('phase 45c search-ux: homepage wires compare store into tray and modal', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /import '\/scripts\/compare-store\.js';/);
  assert.match(indexHtml, /CompareStore\.createCompareStore\(\)/);
  assert.match(indexHtml, /SearchDom\.renderCompareTray/);
  assert.match(indexHtml, /SearchDom\.renderCompareModal/);
  assert.match(indexHtml, /SearchDom\.bindCompareButtons/);
});

test('phase 45c search-ux: restore saved search applies category facets and sort state', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /activeFacetState\s*=\s*normalizeHomeFacets\(state\.facets/);
  assert.match(indexHtml, /currentSortBy\s*=\s*state\.sortBy/);
  assert.match(indexHtml, /doSearch\(\{\s*preserveExistingFacets:\s*true,\s*toleranceMm:/);
});
