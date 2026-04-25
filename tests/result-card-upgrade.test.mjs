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
    displayName: 'LG French Door',
    brand: 'LG',
    model: 'GF-L708MBL',
    readableSpec: '708L French door',
    w: 912,
    h: 1780,
    d: 748,
    sku: 'GF-L708MBL',
    url: '/?cat=fridge&brand=LG',
    retailers: [],
    ...overrides
  };
}

test('phase 45b result card: multiple retailers render price range and count', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    retailers: [
      { n: 'The Good Guys', p: 899 },
      { n: 'JB Hi-Fi', p: 1099 },
      { n: 'Appliances Online', p: 1299 }
    ]
  }));

  assert.match(html, /From \$899 to \$1,299/);
  assert.match(html, /from 3 retailers/);
  assert.match(html, /retailer-chip/);
});

test('phase 45b result card: single retailer renders one price without range copy', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    retailers: [
      { n: 'Harvey Norman', p: 1099 }
    ]
  }));

  assert.match(html, />\$1,099</);
  assert.doesNotMatch(html, /From .* to /);
});

test('phase 45b result card: zero retailers omit retailer strip', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({ retailers: [] }));

  assert.doesNotMatch(html, /retailer-strip/);
  assert.doesNotMatch(html, /from \d+ retailers/);
});

test('phase 45b result card: retailer names are escaped', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    retailers: [
      { n: '<img src=x onerror=alert(1)>', p: 899 },
      { n: 'Safe Retailer', p: 999 }
    ]
  }));

  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.match(html, /&lt;img src=x/);
});
