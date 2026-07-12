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

test('phase 45a search-dom: renderSortDropdown renders RTINGS sort options', async () => {
  const { renderSortDropdown } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('sort');

  renderSortDropdown(container, 'fit-score-desc', () => {});

  const select = container.querySelector('select');
  assert.ok(select);
  assert.equal(select.querySelectorAll('option').length, 7);
  assert.equal(select.value, 'fit-score-desc');
  assert.match(select.textContent, /Fit Score \(high to low\)/);
});

test('replacement filter and sort controls remove cavity and Fit semantics', async () => {
  const { renderFacetBar, renderSortDropdown } = await loadSearchDom();
  const window = makeWindow();
  const facet = window.document.getElementById('facet');
  const sort = window.document.getElementById('sort');

  renderFacetBar(facet, { brand: { Bosch: 2 } }, {
    scoreMin: 80,
    verifiedOnly: true,
  }, () => {}, { searchMode: 'replacement' });
  renderSortDropdown(sort, 'closest-size', () => {}, { searchMode: 'replacement' });

  assert.match(facet.textContent, /Current appliance width/);
  assert.doesNotMatch(facet.textContent, /Cavity|Fit score|Verified Fit/i);
  assert.match(sort.textContent, /Closest size first/);
  assert.doesNotMatch(sort.textContent, /Fit Score|Verified first|Legacy best fit/i);
  assert.equal(sort.querySelectorAll('option').length, 5);
  assert.equal(sort.querySelector('select').value, 'closest-size');
});

test('phase 58 search-dom: stars facet is rendered as a millimeter-style range control', async () => {
  const { renderFacetBar } = await loadSearchDom();
  const window = makeWindow();
  const container = window.document.getElementById('facet');

  renderFacetBar(container, {
    brand: { Bosch: 12 },
    stars: { 4: 7, 5: 3 }
  }, {
    stars: 4,
    availableOnly: true
  }, () => {});

  const starsRange = container.querySelector('[data-range-facet="stars"]');
  assert.ok(starsRange);
  assert.equal(starsRange.querySelectorAll('input[type="range"]').length, 2);
  assert.match(starsRange.textContent, /Energy stars/i);
});

test('phase 45a search-dom: renderLiveCount writes the visible result copy', async () => {
  const { renderLiveCount } = await loadSearchDom();
  const window = makeWindow();
  const el = window.document.getElementById('count');

  renderLiveCount(el, 12, 2170);

  assert.match(String(el.textContent), /Showing 12 of 2,170 appliances/i);
});

test('replacement CTA dispatches the exact old-appliance dimensions without a cavity buffer', async () => {
  const previousDocument = globalThis.document;
  const previousShowToast = globalThis.showToast;
  const window = new JSDOM(`
    <main>
      <section id="search"></section>
      <section id="resultsSection" style="display:block"></section>
      <div id="fitVizModalRoot"><div data-fit-viz-modal></div></div>
      <input id="inW">
      <input id="inH">
      <input id="inD">
    </main>
  `).window;
  globalThis.document = window.document;
  let detail = null;
  let toast = '';
  globalThis.showToast = (message) => { toast = message; };
  window.document.addEventListener('fitappliance:replacement-search', (event) => {
    detail = event.detail;
  });

  try {
    const { triggerReplacementSearch } = await loadSearchDom();
    triggerReplacementSearch('580', '1780', '620');

    assert.deepEqual(detail, { w: 580, h: 1780, d: 620 });
    assert.equal(window.document.getElementById('inW').value, '');
    assert.equal(window.document.getElementById('inH').value, '');
    assert.equal(window.document.getElementById('inD').value, '');
    assert.equal(window.document.getElementById('resultsSection').style.display, 'none');
    assert.equal(window.document.querySelector('[data-fit-viz-modal]'), null);
    assert.match(toast, /old appliance dimensions/i);
    assert.doesNotMatch(toast, /cavity|estimated/i);
  } finally {
    globalThis.document = previousDocument;
    globalThis.showToast = previousShowToast;
  }
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
