import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = process.cwd();

async function loadBrowserScript(relativePath) {
  const scriptPath = path.join(repoRoot, relativePath);
  const module = await import(`${pathToFileURL(scriptPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makePerfProduct(index, overrides = {}) {
  return {
    id: `perf-${index}`,
    cat: index % 4 === 0 ? 'dishwasher' : 'fridge',
    brand: index % 3 === 0 ? 'Bosch' : index % 3 === 1 ? 'LG' : 'Miele',
    model: `MODEL-${index}`,
    displayName: `Perf Model ${index}`,
    readableSpec: '600L test appliance',
    w: 590 + (index % 12),
    h: 1700 + (index % 80),
    d: 640 + (index % 20),
    price: 800 + index,
    stars: 3 + (index % 3),
    priorityScore: index % 100,
    unavailable: false,
    retailers: [
      { n: 'Harvey Norman', p: 899 + index },
      { n: 'Appliances Online', p: 949 + index }
    ],
    ...overrides
  };
}

test('phase 20: lighthouse CI script exists and uses lighthouse package', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'lighthouse-ci.js');
  assert.ok(fs.existsSync(filePath), 'scripts/lighthouse-ci.js should exist');
  const script = fs.readFileSync(filePath, 'utf8');
  assert.match(script, /lighthouse/i);
  assert.match(script, /reports\/lighthouse-/);
});

test('phase 40: lighthouse script includes accessibility gate for home brand and cavity samples', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'lighthouse-ci.js');
  const script = fs.readFileSync(filePath, 'utf8');
  assert.match(script, /accessibility/, 'lighthouse script should audit accessibility');
  assert.match(script, /pages\/brands\/samsung-fridge-clearance\.html/);
  assert.match(script, /pages\/cavity\/1000mm-fridge\.html/);
});

test('phase 20: lighthouse workflow exists and supports workflow_dispatch', () => {
  const filePath = path.join(process.cwd(), '.github', 'workflows', 'lighthouse.yml');
  assert.ok(fs.existsSync(filePath), '.github/workflows/lighthouse.yml should exist');
  const workflow = fs.readFileSync(filePath, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /upload-artifact/i);
});

test('phase 20: OG generator emits WebP alongside PNG outputs', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'generate-og-images.js');
  const script = fs.readFileSync(filePath, 'utf8');
  assert.match(script, /\.webp\(/, 'generate-og-images.js should write webp assets');
});

test('phase 20: brand pages use picture tags with webp source and explicit image dimensions', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /<picture[\s>]/, 'brand pages should include <picture>');
  assert.match(html, /<source[^>]+type="image\/webp"/, 'picture should include webp source');
  assert.match(html, /<img[^>]+width="\d+"/, 'img should include width');
  assert.match(html, /<img[^>]+height="\d+"/, 'img should include height');
  assert.match(html, /<img[^>]+decoding="async"/, 'img should include decoding async');
});

test('phase 20: non-hero images are lazy-loaded', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /loading="lazy"/, 'at least one non-hero image should be lazy-loaded');
});

test('phase 20: index font loading uses display=swap', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.match(html, /fonts\.googleapis\.com\/css2[^"]*display=swap/);
});

test('phase 40: hero eyebrow decorative dot styles do not collapse the text span', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.doesNotMatch(html, /\.hero-eyebrow span\s*\{/);
  assert.match(html, /\.hero-eyebrow\s*>\s*span:first-child\s*\{/);
});

test('phase 45b perf: facet chrome and 100 result cards render under 100ms in jsdom', async () => {
  const SearchDom = await loadBrowserScript('public/scripts/search-dom.js');
  const window = new JSDOM(`
    <main>
      <button type="button" data-mobile-filter-trigger></button>
      <div data-facet-bar></div>
      <div data-mobile-sheet-overlay hidden></div>
      <section id="mobileFilterSheet" data-mobile-filter-sheet hidden>
        <h2 id="mobileFilterTitle">Filter results</h2>
        <button type="button" data-mobile-sheet-close>Close</button>
        <div data-mobile-sheet-body></div>
        <button type="button" data-mobile-clear>Clear all</button>
        <button type="button" data-mobile-apply>Apply</button>
      </section>
    </main>
  `, { pretendToBeVisual: true }).window;
  const products = Array.from({ length: 100 }, (_, index) => makePerfProduct(index));

  // Warm JIT and formatter setup outside the measured critical path; the budget is for steady-state rendering.
  SearchDom.buildCardHtml(products[0]);
  const start = performance.now();

  SearchDom.renderFacetBar(
    window.document.querySelector('[data-facet-bar]'),
    { brand: { Bosch: 40, LG: 35, Miele: 25 }, stars: { 4: 60, 5: 20 } },
    { brand: ['Bosch'], stars: 4, availableOnly: true },
    () => {}
  );
  SearchDom.renderMobileFilterSheet({
    trigger: window.document.querySelector('[data-mobile-filter-trigger]'),
    sheet: window.document.querySelector('[data-mobile-filter-sheet]'),
    overlay: window.document.querySelector('[data-mobile-sheet-overlay]'),
    sheetBody: window.document.querySelector('[data-mobile-sheet-body]'),
    facetBar: window.document.querySelector('[data-facet-bar]'),
    closeButton: window.document.querySelector('[data-mobile-sheet-close]'),
    clearButton: window.document.querySelector('[data-mobile-clear]'),
    applyButton: window.document.querySelector('[data-mobile-apply]'),
    activeFacetCount: 2,
    resultCount: 100
  });
  products.map((product) => SearchDom.buildCardHtml(product)).join('');

  const elapsed = performance.now() - start;
  assert.ok(elapsed < 100, `facet + 100 cards render took ${elapsed.toFixed(2)}ms`);
});

test('phase 45b perf: searchWithFacets stays under 50ms for 2170 rows', async () => {
  const SearchCore = await loadBrowserScript('public/scripts/search-core.js');
  const products = Array.from({ length: 2170 }, (_, index) => makePerfProduct(index, {
    cat: 'fridge',
    w: 590 + (index % 6),
    h: 1700 + (index % 30),
    d: 640 + (index % 8)
  }));
  const start = performance.now();

  const result = SearchCore.searchWithFacets(products, {
    filters: { cat: 'fridge', w: 620, h: 1800, d: 700, toleranceMm: 5 },
    facets: { brand: ['Bosch', 'LG'], priceMin: 900, stars: 4, availableOnly: true },
    sortBy: 'best-fit',
    limit: Number.MAX_SAFE_INTEGER
  });

  const elapsed = performance.now() - start;
  assert.ok(Array.isArray(result.rows));
  assert.ok(elapsed < 50, `searchWithFacets took ${elapsed.toFixed(2)}ms`);
});
