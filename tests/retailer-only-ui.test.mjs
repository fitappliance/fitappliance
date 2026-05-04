import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}-${Math.random()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeWindow() {
  return new JSDOM('<main><div id="facet"></div><div id="results"></div><div id="message"></div></main>', {
    pretendToBeVisual: true
  }).window;
}

function makeMatch(overrides = {}) {
  return {
    id: 'lg-fit',
    brand: 'LG',
    model: 'GB-455UPLE',
    displayName: 'LG GB-455UPLE Fridge',
    readableSpec: '455L bottom mount fridge',
    cat: 'fridge',
    w: 595,
    h: 1800,
    d: 620,
    stars: 4,
    retailers: [{ n: 'JB Hi-Fi', p: 1099 }],
    unavailable: false,
    ...overrides
  };
}

test('phase 48 retailer-only UI: facet bar renders an enabled retailer-only toggle by default', async () => {
  const { renderFacetBar } = await loadSearchDom();
  const window = makeWindow();
  const events = [];

  renderFacetBar(window.document.getElementById('facet'), {
    brand: { LG: 1 },
    stars: { 4: 1 }
  }, {
    retailerOnly: true
  }, (payload) => events.push(payload));

  const input = window.document.querySelector('[data-retailer-only]');
  assert.ok(input);
  assert.equal(input.checked, true);
  assert.match(input.closest('.facet-toggle')?.textContent ?? '', /verified retailer links/i);
  input.checked = false;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepEqual(events.at(-1), { type: 'retailerOnly', value: false });
});

test('phase 48 retailer-only UI: results banner explains the curated retailer pool and offers show all', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const window = makeWindow();
  const clicks = [];

  renderSearchResults({
    matches: [makeMatch()],
    filters: { w: 600, h: 1900, d: 650, toleranceMm: 5 },
    resultsEl: window.document.getElementById('results'),
    messageEl: window.document.getElementById('message'),
    retailerOnly: true,
    onShowAllClick: () => clicks.push('show-all')
  });

  const banner = window.document.querySelector('.retailer-filter-banner');
  assert.ok(banner);
  assert.match(banner.textContent, /Showing 1 products with verified retailer product links/i);
  banner.querySelector('[data-show-all-products]').click();
  assert.deepEqual(clicks, ['show-all']);
});

test('phase 48 retailer-only UI: fallback banner is shown when only unverified matches exist', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const window = makeWindow();

  renderSearchResults({
    matches: [makeMatch({ retailers: [], unavailable: true })],
    filters: { w: 600, h: 1900, d: 650, toleranceMm: 5 },
    resultsEl: window.document.getElementById('results'),
    messageEl: window.document.getElementById('message'),
    retailerOnly: true,
    retailerFallback: true
  });

  const banner = window.document.querySelector('.retailer-filter-banner--fallback');
  assert.ok(banner);
  assert.match(banner.textContent, /No products with verified retailer links fit your cavity/i);
  assert.match(banner.textContent, /without retailer info/i);
});
