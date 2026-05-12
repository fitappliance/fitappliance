import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');
const rangeFiltersPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'range-filters.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

async function loadRangeFilters() {
  return import(`${pathToFileURL(rangeFiltersPath).href}?cacheBust=${Date.now()}`);
}

test('phase 58 density toggle: renders three buttons and emits selected density', async () => {
  const { renderDensityToggle } = await loadSearchDom();
  const window = new JSDOM('<div id="density"></div>').window;
  const container = window.document.getElementById('density');
  const selected = [];

  renderDensityToggle(container, 'standard', (value) => selected.push(value));

  assert.equal(container.querySelectorAll('[data-density]').length, 3);
  assert.equal(container.querySelector('[data-density="standard"]').getAttribute('aria-pressed'), 'true');
  container.querySelector('[data-density="compact"]').click();
  assert.deepEqual(selected, ['compact']);
});

test('phase 58 density toggle: normalization protects localStorage values', async () => {
  const { normalizeDensity } = await loadRangeFilters();

  assert.equal(normalizeDensity('compact'), 'compact');
  assert.equal(normalizeDensity('detailed'), 'detailed');
  assert.equal(normalizeDensity('unexpected'), 'standard');
});
