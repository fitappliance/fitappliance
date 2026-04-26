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

function loadFridges() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', 'fridges.json'), 'utf8')).products;
}

function loadClearanceRules() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', 'clearance.json'), 'utf8')).rules;
}

const STANDARD_FRIDGE_CAVITY = { cat: 'fridge', w: 600, h: 1900, d: 650, toleranceMm: 0 };

test('phase 48 clearance search: default practical mode returns standard 600mm fridge candidates', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const result = searchWithFacets(loadFridges(), STANDARD_FRIDGE_CAVITY, {}, {
    brandSpecificClearance: loadClearanceRules(),
    limit: Number.MAX_SAFE_INTEGER
  });

  assert.ok(result.rows.length >= 100, `expected >=100 practical fridge matches, got ${result.rows.length}`);
});

test('phase 48 clearance search: physical returns the most, practical next, manufacturer strictest', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const rows = loadFridges();
  const brandSpecificClearance = loadClearanceRules();
  const options = { brandSpecificClearance, limit: Number.MAX_SAFE_INTEGER };

  const physical = searchWithFacets(rows, { ...STANDARD_FRIDGE_CAVITY, clearanceMode: 'physical' }, {}, options).rows.length;
  const practical = searchWithFacets(rows, { ...STANDARD_FRIDGE_CAVITY, clearanceMode: 'practical' }, {}, options).rows.length;
  const manufacturer = searchWithFacets(rows, { ...STANDARD_FRIDGE_CAVITY, clearanceMode: 'manufacturer' }, {}, options).rows.length;

  assert.ok(physical >= practical, `${physical} should be >= ${practical}`);
  assert.ok(practical > manufacturer, `${practical} should be > ${manufacturer}`);
});

test('phase 48 clearance search: omitted clearanceMode behaves as practical', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const options = { brandSpecificClearance: loadClearanceRules(), limit: Number.MAX_SAFE_INTEGER };
  const omitted = searchWithFacets(loadFridges(), STANDARD_FRIDGE_CAVITY, {}, options).rows.map((row) => row.id);
  const explicit = searchWithFacets(loadFridges(), { ...STANDARD_FRIDGE_CAVITY, clearanceMode: 'practical' }, {}, options).rows.map((row) => row.id);

  assert.deepEqual(omitted, explicit);
});

test('phase 48 clearance search: result rows carry practical and manufacturer clearance metadata', async () => {
  const { searchWithFacets } = await loadSearchCore();
  const [row] = searchWithFacets([
    {
      id: 'samsung-600',
      cat: 'fridge',
      brand: 'Samsung',
      model: 'SR600',
      displayName: 'Samsung 600 Fridge',
      w: 590,
      h: 1800,
      d: 620,
      retailers: [],
      unavailable: true
    }
  ], STANDARD_FRIDGE_CAVITY, {}, {
    brandSpecificClearance: loadClearanceRules()
  }).rows;

  assert.deepEqual(row.clearance, { side: 5, sides: 5, top: 20, rear: 10 });
  assert.deepEqual(row.manufacturerClearance, { side: 50, sides: 50, top: 100, rear: 50 });
  assert.equal(row.clearanceMode, 'practical');
});

test('phase 48 clearance URL state: mode=manufacturer round-trips for strict users', async () => {
  const { serializeSearchState, parseSearchParams } = await loadSearchCore();
  const params = serializeSearchState({
    ...STANDARD_FRIDGE_CAVITY,
    clearanceMode: 'manufacturer'
  });

  assert.match(params.toString(), /mode=manufacturer/);
  assert.equal(parseSearchParams(`?${params.toString()}`).clearanceMode, 'manufacturer');
});

test('phase 48 clearance URL state: default practical mode is omitted from URL', async () => {
  const { serializeSearchState, parseSearchParams } = await loadSearchCore();
  const params = serializeSearchState({
    ...STANDARD_FRIDGE_CAVITY,
    clearanceMode: 'practical'
  });

  assert.doesNotMatch(params.toString(), /mode=/);
  assert.equal(parseSearchParams(`?${params.toString()}`).clearanceMode, 'practical');
});

test('phase 48 clearance search: available-only is opt-in, not the default', async () => {
  const { searchWithFacets, parseSearchParams, serializeSearchState } = await loadSearchCore();
  const rows = loadFridges();
  const options = { brandSpecificClearance: loadClearanceRules(), limit: Number.MAX_SAFE_INTEGER };
  const all = searchWithFacets(rows, STANDARD_FRIDGE_CAVITY, {}, options).rows.length;
  const availableOnly = searchWithFacets(rows, STANDARD_FRIDGE_CAVITY, { availableOnly: true }, options).rows.length;

  assert.ok(all >= 100);
  assert.equal(availableOnly, 0);
  assert.equal(parseSearchParams('?cat=fridge').facets.availableOnly, false);
  assert.match(serializeSearchState({ cat: 'fridge', facets: { availableOnly: true } }).toString(), /avail=1/);
});

test('phase 48 clearance search: near misses report cavity millimetres needed beyond practical mode', async () => {
  const { buildNearMisses } = await loadSearchCore();
  const rows = [
    { id: 'near', cat: 'fridge', brand: 'LG', w: 600, h: 1800, d: 640, retailers: [] },
    { id: 'far', cat: 'fridge', brand: 'LG', w: 600, h: 1800, d: 660, retailers: [] }
  ];

  const near = buildNearMisses(rows, { cat: 'fridge', w: 600, h: 1900, d: 650, toleranceMm: 0 }, {
    limit: 10
  });

  assert.equal(near.length, 1);
  assert.equal(near[0].id, 'near');
  assert.equal(near[0].cavityNeededMm, 10);
  assert.equal(near[0].bindingAxis, 'width');
});
