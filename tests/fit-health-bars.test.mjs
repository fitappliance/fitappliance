import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCorePath = path.join(repoRoot, 'public', 'scripts', 'search-core.js');
const productCardPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');
const stylesPath = path.join(repoRoot, 'public', 'styles.css');

async function loadSearchCore() {
  const module = await import(`${pathToFileURL(searchCorePath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

async function loadProductCard() {
  return import(`${pathToFileURL(productCardPath).href}?cacheBust=${Date.now()}`);
}

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

function makeProduct(overrides = {}) {
  return {
    id: 'fit-bar-fridge',
    brand: 'LG',
    model: 'GB-600',
    displayName: 'LG 600L Fridge',
    cat: 'fridge',
    w: 590,
    h: 1800,
    d: 640,
    stars: 5,
    kwh_year: 320,
    features: ['Upright'],
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb-600', p: null }],
    ...overrides
  };
}

test('fit health bars: search-core exposes per-axis practical spare gaps and binding axis', async () => {
  const SearchCore = await loadSearchCore();
  const { rows } = SearchCore.searchWithFacets(
    [makeProduct()],
    { cat: 'fridge', w: 600, h: 1900, d: 650 },
    {},
    { retailerOnly: false }
  );

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].fitAxisGaps.map((entry) => [entry.axis, entry.gapMm]), [
    ['width', 0],
    ['height', 80],
    ['depth', 0]
  ]);
  assert.equal(rows[0].bindingAxis, 'width');
  assert.equal(rows[0].tightestGapMm, 0);
});

test('fit health bars: product-card row renders W/H/D traffic-light bars', async () => {
  const { buildRow } = await loadProductCard();
  const html = buildRow({
    ...makeProduct(),
    fitAxisGaps: [
      { axis: 'width', label: 'W', gapMm: 0 },
      { axis: 'height', label: 'H', gapMm: 80 },
      { axis: 'depth', label: 'D', gapMm: 12 }
    ],
    bindingAxis: 'width'
  }, {
    annualEnergyCost: () => 96,
    resolveRetailerUrl: (retailer) => retailer.url
  });
  const dom = new JSDOM(html);
  const bars = [...dom.window.document.querySelectorAll('.fit-axis-bar')];

  assert.equal(bars.length, 3);
  assert.match(bars[0].textContent ?? '', /W/);
  assert.match(bars[0].textContent ?? '', /0mm/);
  assert.match(bars[1].textContent ?? '', /H/);
  assert.match(bars[1].textContent ?? '', /80mm/);
  assert.match(bars[2].textContent ?? '', /D/);
  assert.match(bars[2].textContent ?? '', /12mm/);
  assert.ok(bars[0].classList.contains('fit-axis-bar--tight'));
  assert.ok(bars[0].classList.contains('fit-axis-bar--binding'));
  assert.ok(bars[1].classList.contains('fit-axis-bar--safe'));
  assert.ok(bars[2].classList.contains('fit-axis-bar--tight'));
  assert.equal(bars[0].getAttribute('aria-label'), 'Width spare room: 0mm, binding constraint');
});

test('fit health bars: search-dom list card renderer includes the same per-axis bars', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml({
    ...makeProduct(),
    fitAxisGaps: [
      { axis: 'width', label: 'W', gapMm: 32 },
      { axis: 'height', label: 'H', gapMm: 70 },
      { axis: 'depth', label: 'D', gapMm: -4 }
    ],
    bindingAxis: 'depth'
  }));

  assert.equal(dom.window.document.querySelectorAll('.fit-axis-bar').length, 3);
  assert.ok(dom.window.document.querySelector('[data-fit-axis="depth"]')?.classList.contains('fit-axis-bar--blocked'));
  assert.ok(dom.window.document.querySelector('[data-fit-axis="depth"]')?.classList.contains('fit-axis-bar--binding'));
});

test('fit health bars: styles define RTINGS-style safe tight and blocked states', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.fit-axis-bars/);
  assert.match(css, /\.fit-axis-bar--safe/);
  assert.match(css, /\.fit-axis-bar--tight/);
  assert.match(css, /\.fit-axis-bar--blocked/);
  assert.match(css, /\.fit-axis-bar--binding/);
});
