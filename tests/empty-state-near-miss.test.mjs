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

function makeNearMiss(id, needed) {
  return {
    id,
    displayName: `Near Miss ${id}`,
    brand: 'LG',
    model: id,
    readableSpec: '600L Fridge',
    w: 600,
    h: 1800,
    d: 640,
    url: '/?cat=fridge',
    cavityNeededMm: needed,
    bindingAxis: 'width',
    retailers: []
  };
}

test('phase 48 empty near-miss: no exact fits can render top physical near misses', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const window = new JSDOM('<main><p id="message"></p><div id="results"></div></main>').window;
  const resultsEl = window.document.getElementById('results');
  const messageEl = window.document.getElementById('message');

  renderSearchResults({
    matches: [],
    filters: { cat: 'fridge', w: 600, h: 1900, d: 650 },
    resultsEl,
    messageEl,
    nearMisses: Array.from({ length: 12 }, (_, index) => makeNearMiss(`p${index}`, index + 1))
  });

  assert.match(messageEl.textContent, /No exact fits/i);
  assert.match(resultsEl.textContent, /slightly larger cavity/i);
  assert.equal(resultsEl.querySelectorAll('.fit-result-item').length, 10);
  assert.match(resultsEl.textContent, /\+1mm cavity needed/);
  assert.match(resultsEl.textContent, /\+10mm cavity needed/);
  assert.doesNotMatch(resultsEl.textContent, /\+11mm cavity needed/);
});

test('phase 48 empty near-miss: physical zero-result fallback keeps preset guidance', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const window = new JSDOM('<main><p id="message"></p><div id="results"></div></main>').window;
  const resultsEl = window.document.getElementById('results');
  const messageEl = window.document.getElementById('message');

  renderSearchResults({
    matches: [],
    filters: { cat: 'fridge', w: 100, h: 100, d: 100 },
    resultsEl,
    messageEl,
    emptyState: {
      title: '0 exact matches.',
      detail: 'Try a preset or relax the tolerance.',
      ctaLabel: 'Try a preset'
    },
    nearMisses: []
  });

  assert.match(resultsEl.textContent, /Try a preset or relax the tolerance/);
  assert.match(resultsEl.textContent, /too small for this category/i);
  assert.equal(resultsEl.querySelectorAll('.fit-result-item').length, 0);
});

test('phase 48 empty near-miss: near-miss labels escape hostile display names', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const window = new JSDOM('<main><p id="message"></p><div id="results"></div></main>').window;
  const resultsEl = window.document.getElementById('results');
  const messageEl = window.document.getElementById('message');

  renderSearchResults({
    matches: [],
    filters: { cat: 'fridge', w: 600, h: 1900, d: 650 },
    resultsEl,
    messageEl,
    nearMisses: [
      {
        ...makeNearMiss('hostile', 6),
        displayName: '<img src=x onerror=alert(1)>'
      }
    ]
  });

  assert.equal(resultsEl.querySelector('img'), null);
  assert.equal(resultsEl.querySelector('[onerror]'), null);
  assert.doesNotMatch(resultsEl.innerHTML, /onerror/i);
  assert.match(resultsEl.textContent, /LG hostile/);
});
