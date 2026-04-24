import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeWindow() {
  return new JSDOM('<main><div id="facet"></div><div id="chips"></div><div id="sort"></div><div id="count"></div></main>').window;
}

test('phase 45a search-dom: renderFacetBar renders brand facet rows with counts and keyboard semantics', async () => {
  const { renderFacetBar } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('facet');
  const events = [];

  renderFacetBar(container, {
    brand: { Bosch: 12, Miele: 8 },
    stars: { 4: 7, 5: 3 }
  }, {
    brand: ['Bosch'],
    stars: 4,
    availableOnly: true
  }, (payload) => events.push(payload));

  const checkbox = container.querySelector('[data-facet-brand="Bosch"]');
  assert.ok(checkbox);
  assert.equal(checkbox.getAttribute('role'), 'checkbox');
  assert.equal(checkbox.getAttribute('tabindex'), '0');
  checkbox.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }));
  assert.ok(events.length >= 1);
});

test('phase 45a search-dom: renderActiveChips renders removable chips for each active facet', async () => {
  const { renderActiveChips } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('chips');
  const removed = [];

  renderActiveChips(container, {
    brand: ['Bosch', 'Miele'],
    priceMin: 500,
    stars: 4
  }, (payload) => removed.push(payload));

  assert.equal(container.querySelectorAll('[data-active-chip]').length, 4);
  container.querySelector('[data-remove-chip]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(removed.length, 1);
});

test('phase 45a search-dom: renderSortDropdown renders five sort options', async () => {
  const { renderSortDropdown } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('sort');

  renderSortDropdown(container, 'price-asc', () => {});

  const select = container.querySelector('select');
  assert.ok(select);
  assert.equal(select.querySelectorAll('option').length, 5);
  assert.equal(select.value, 'price-asc');
});

test('phase 45a search-dom: renderLiveCount writes the visible result copy', async () => {
  const { renderLiveCount } = await loadSearchDom();
  const window = makeWindow();
  const el = window.document.getElementById('count');

  renderLiveCount(el, 12, 2170);

  assert.match(String(el.textContent), /Showing 12 of 2,170 appliances/i);
});

test('phase 45a search-dom: malicious brand labels are escaped in rendered facet content', async () => {
  const { renderFacetBar } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('facet');

  renderFacetBar(container, {
    brand: { '<img src=x onerror=alert(1)>': 3 }
  }, {}, () => {});

  assert.equal(container.querySelectorAll('img').length, 0);
  assert.equal(container.querySelector('[onerror]'), null);
});

test('phase 45a search-dom: aria-label coercion does not trust object toString implementations', async () => {
  const { renderFacetBar } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('facet');
  const hostileBrand = {
    toString() {
      return '<img src=x onerror=alert(1)>';
    }
  };

  renderFacetBar(container, {
    brand: { [hostileBrand]: 3 }
  }, {}, () => {});

  const brandButton = container.querySelector('[data-facet-brand]');
  const ariaLabel = brandButton?.getAttribute('aria-label') ?? '';
  assert.ok(brandButton);
  assert.doesNotMatch(ariaLabel, /onerror/i);
  assert.match(ariaLabel, /\(\d+\)$/);
});
