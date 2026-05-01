import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-comparisons.js')
).href;

function buildFixture(overrides = {}) {
  return {
    brandA: 'LG',
    brandB: 'Samsung',
    cat: 'fridge',
    modelsA: 5,
    modelsB: 6,
    clearanceA: { side: 50, rear: 40, top: 80 },
    clearanceB: { side: 45, rear: 35, top: 70 },
    slug: 'lg-vs-samsung-fridge-clearance',
    categoryMeta: { slug: 'fridge', labelPlural: 'Fridges', labelSingular: 'Fridge' },
    modelSamplesA: [],
    modelSamplesB: [],
    ...overrides
  };
}

test('task 18 compare links: buildComparisonPageHtml includes link when sample has directUrl', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture({
    modelSamplesA: [{ brand: 'LG', cat: 'fridge', model: 'A1', w: 700, h: 1700, d: 700, directUrl: 'https://example.com/a1' }]
  }));

  assert.match(html, /href="https:\/\/example\.com\/a1"/);
});

test('task 18 compare links: buildComparisonPageHtml includes link when sample has retailers[0].url', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture({
    modelSamplesB: [{ brand: 'Samsung', cat: 'fridge', model: 'B1', w: 710, h: 1710, d: 710, bestRetailer: { n: 'JB Hi-Fi', url: 'https://shop.example.com/b1' } }]
  }));

  assert.match(html, /href="https:\/\/shop\.example\.com\/b1"/);
});

test('task 18 compare links: buildComparisonPageHtml omits link when no URL exists', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture({
    modelSamplesA: [{ brand: 'LG', cat: 'fridge', model: 'A1', w: 700, h: 1700, d: 700 }]
  }));

  assert.equal(html.includes('A1 · 700×1700×700mm<br><a '), false);
});

test('task 18 compare links: buy link uses sponsored nofollow noopener and target blank', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture({
    modelSamplesA: [{ brand: 'LG', cat: 'fridge', model: 'A1', w: 700, h: 1700, d: 700, directUrl: 'https://example.com/a1' }]
  }));

  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="[^"]*sponsored[^"]*"/);
  assert.match(html, /rel="[^"]*nofollow[^"]*"/);
  assert.match(html, /rel="[^"]*noopener[^"]*"/);
});

test('task 18 compare links: special chars in URL are escaped safely', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture({
    modelSamplesA: [{ brand: 'LG', cat: 'fridge', model: 'A1', w: 700, h: 1700, d: 700, directUrl: 'https://example.com/a?x=1&y=2' }]
  }));

  assert.match(html, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
});

test('task 18 compare links: compare page includes compare_view event', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml(buildFixture());

  assert.match(html, /gtag\('event', 'compare_view'/);
});

test('task 18 compare links: selectComparisonPairs skips pairs where neither brand has a verified product link', async () => {
  const { selectComparisonPairs } = await import(moduleUrl);
  const products = [
    { cat: 'washing_machine', brand: 'Beko', model: 'B1', retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/search/?q=Beko%20B1' }] },
    { cat: 'washing_machine', brand: 'Beko', model: 'B2', retailers: [] },
    { cat: 'washing_machine', brand: 'Beko', model: 'B3', retailers: [] },
    { cat: 'washing_machine', brand: 'LG', model: 'L1', retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/search/?q=LG%20L1' }] },
    { cat: 'washing_machine', brand: 'LG', model: 'L2', retailers: [] },
    { cat: 'washing_machine', brand: 'LG', model: 'L3', retailers: [] },
    { cat: 'washing_machine', brand: 'Hisense', model: 'H1', retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-h1' }] },
    { cat: 'washing_machine', brand: 'Hisense', model: 'H2', retailers: [] },
    { cat: 'washing_machine', brand: 'Hisense', model: 'H3', retailers: [] }
  ];
  const rules = {
    washing_machine: {
      Beko: { side: 5, rear: 10, top: 20 },
      LG: { side: 5, rear: 10, top: 20 },
      Hisense: { side: 5, rear: 10, top: 20 }
    }
  };

  const pairs = selectComparisonPairs(products, rules, {
    catsToProcess: ['washing_machine'],
    maxBrandsPerCategory: 3,
    topN: 10
  });

  assert.ok(pairs.length > 0);
  assert.equal(
    pairs.some((pair) => [pair.brandA, pair.brandB].includes('Beko') && [pair.brandA, pair.brandB].includes('LG')),
    false
  );
  assert.equal(
    pairs.every((pair) => [pair.brandA, pair.brandB].includes('Hisense')),
    true
  );
});
