import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')).href;

function makeProduct(overrides = {}) {
  return {
    id: 'score-card-fridge',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 550,
    h: 1410,
    d: 490,
    stars: 5,
    features: ['Top Mount'],
    fitScore: 0.08,
    fitScoreNumeric: 92,
    fitAxisGaps: [
      { axis: 'width', label: 'W', cavity: 600, appliance: 550, clearanceMm: 10, gapMm: 40 },
      { axis: 'height', label: 'H', cavity: 1900, appliance: 1410, clearanceMm: 20, gapMm: 470 },
      { axis: 'depth', label: 'D', cavity: 650, appliance: 490, clearanceMm: 10, gapMm: 150 }
    ],
    bindingAxis: 'width',
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-hrtf206' }],
    ...overrides
  };
}

test('phase 58 card integration: buildRow renders score block alongside fit health', async () => {
  const { buildRow } = await import(`${productCardUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /class="fit-health/);
  assert.match(html, /class="fit-score-block"/);
  assert.match(html, /92/);
  assert.match(html, /Excellent fit/);
});

test('phase 58 card integration: missing fitScoreNumeric does not render score block', async () => {
  const { buildRow } = await import(`${productCardUrl}?cacheBust=${Date.now()}`);
  const product = makeProduct();
  delete product.fitScoreNumeric;
  const html = buildRow(product, {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /class="fit-health/);
  assert.doesNotMatch(html, /fit-score-block/);
});
