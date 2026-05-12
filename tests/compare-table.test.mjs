import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'compare-table.js')).href;

async function loadCompareTable() {
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

function product(overrides = {}) {
  return {
    slug: 'lg-a',
    brand: 'LG',
    model: 'GF-A',
    displayName: 'LG 500L Fridge',
    w: 700,
    h: 1700,
    d: 690,
    stars: 4,
    kwh_year: 350,
    practicalClearance: { side: 5, top: 20, rear: 10 },
    manufacturerClearance: { side: 10, top: 50, rear: 50 },
    fitScoreNumeric: 91,
    retailers: [{ name: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-a' }],
    ...overrides
  };
}

test('phase 58 compare table: renders RTINGS-style sticky sections and remove controls', async () => {
  const { renderCompareTable } = await loadCompareTable();
  const html = renderCompareTable([
    product(),
    product({ slug: 'samsung-b', brand: 'Samsung', model: 'SRF-B', displayName: 'Samsung 600L Fridge', w: 780, stars: 5, fitScoreNumeric: 88 })
  ]);

  assert.match(html, /compare-table--rtings/);
  assert.match(html, /compare-sticky-header/);
  assert.match(html, /Dimensions/);
  assert.match(html, /Clearance Required/);
  assert.match(html, /Energy/);
  assert.match(html, /Door &amp; Access/);
  assert.match(html, /Verification/);
  assert.match(html, /data-compare-remove="lg-a"/);
  assert.match(html, /data-compare-add-another/);
  assert.match(html, /data-compare-clear-all/);
});

test('phase 58 compare table: highlights a single winner for lower and higher metrics', async () => {
  const { renderCompareTable } = await loadCompareTable();
  const html = renderCompareTable([
    product({ slug: 'a', brand: 'A', model: 'A1', manufacturerClearance: { side: 5, top: 50, rear: 50 }, stars: 3 }),
    product({ slug: 'b', brand: 'B', model: 'B1', manufacturerClearance: { side: 20, top: 50, rear: 50 }, stars: 6 }),
    product({ slug: 'c', brand: 'C', model: 'C1', manufacturerClearance: { side: 30, top: 50, rear: 50 }, stars: 4 })
  ]);

  assert.match(html, /compare-cell--winner/);
  assert.match(html, /5 mm<span class="compare-diff-badge">Best<\/span>/);
  assert.match(html, /6★ GEMS<span class="compare-diff-badge">Best<\/span>/);
});

test('phase 58 compare table: empty compare state is explicit', async () => {
  const { renderCompareTable } = await loadCompareTable();
  assert.match(renderCompareTable([]), /Add products to compare/);
});
