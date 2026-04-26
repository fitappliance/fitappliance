import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeMatch(overrides = {}) {
  return {
    id: 'f1',
    displayName: 'Samsung 600 Fridge',
    brand: 'Samsung',
    model: 'SR600',
    readableSpec: '600L French door',
    w: 590,
    h: 1800,
    d: 620,
    sku: 'SR600',
    url: '/?cat=fridge&brand=Samsung',
    retailers: [],
    ...overrides
  };
}

test('phase 48 result card advisory: Samsung manufacturer clearance is shown as neutral advice', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    manufacturerClearance: { side: 50, top: 100, rear: 50 }
  }));

  assert.match(html, /fit-card-advisory/);
  assert.match(html, /Manufacturer suggests/);
  assert.match(html, /\+50mm sides/);
  assert.match(html, /\+100mm top/);
  assert.match(html, /\+50mm rear/);
});

test('phase 48 result card advisory: fractional Haier clearance is rounded without losing the signal', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    brand: 'Haier',
    manufacturerClearance: { side: 25.4, top: 25.4, rear: 25.4 }
  }));

  assert.match(html, /\+25mm sides/);
  assert.match(html, /\+25mm top/);
  assert.match(html, /\+25mm rear/);
});

test('phase 48 result card advisory: obscure products without manufacturer data omit advisory row', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    brand: 'Obscure',
    manufacturerClearance: null
  }));

  assert.doesNotMatch(html, /fit-card-advisory/);
  assert.doesNotMatch(html, /Manufacturer suggests/);
});

test('phase 48 result card advisory: advisory text escapes hostile brand-controlled values', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    displayName: '<img src=x onerror=alert(1)>',
    brand: '<img src=x onerror=alert(1)>',
    manufacturerClearance: { side: '<img src=x onerror=alert(1)>', top: 20, rear: 10 }
  }));

  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.match(html, /Manufacturer suggests/);
});
