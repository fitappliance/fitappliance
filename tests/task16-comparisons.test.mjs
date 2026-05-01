import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-comparisons.js')
).href;

function makeProduct(overrides = {}) {
  const id = overrides.id ?? 'p-1';
  return {
    id,
    cat: 'fridge',
    brand: 'BrandA',
    model: 'Model X',
    w: 900,
    h: 1800,
    d: 700,
    retailers: [{ n: 'JB Hi-Fi', url: `https://www.jbhifi.com.au/products/${id}` }],
    ...overrides
  };
}

function fixtureProducts() {
  return [
    makeProduct({ id: 'a1', brand: 'BrandA' }),
    makeProduct({ id: 'a2', brand: 'BrandA' }),
    makeProduct({ id: 'a3', brand: 'BrandA' }),
    makeProduct({ id: 'b1', brand: 'BrandB' }),
    makeProduct({ id: 'b2', brand: 'BrandB' }),
    makeProduct({ id: 'b3', brand: 'BrandB' }),
    makeProduct({ id: 'c1', brand: 'BrandC' }),
    makeProduct({ id: 'c2', brand: 'BrandC' }),
    makeProduct({ id: 'd1', brand: 'BrandD' }),
    makeProduct({ id: 'd2', brand: 'BrandD' }),
    makeProduct({ id: 'd3', brand: 'BrandD' }),
    makeProduct({ id: 'e1', brand: 'BrandE' }),
    makeProduct({ id: 'e2', brand: 'BrandE' }),
    makeProduct({ id: 'e3', brand: 'BrandE' }),
    makeProduct({ id: 'w1', cat: 'washing_machine', brand: 'WasherA', model: 'WA-1', w: 600, h: 850, d: 600 }),
    makeProduct({ id: 'w2', cat: 'washing_machine', brand: 'WasherA', model: 'WA-2', w: 600, h: 850, d: 600 }),
    makeProduct({ id: 'w3', cat: 'washing_machine', brand: 'WasherA', model: 'WA-3', w: 600, h: 850, d: 600 }),
    makeProduct({ id: 'w4', cat: 'washing_machine', brand: 'WasherB', model: 'WB-1', w: 600, h: 850, d: 600 }),
    makeProduct({ id: 'w5', cat: 'washing_machine', brand: 'WasherB', model: 'WB-2', w: 600, h: 850, d: 600 }),
    makeProduct({ id: 'w6', cat: 'washing_machine', brand: 'WasherB', model: 'WB-3', w: 600, h: 850, d: 600 })
  ];
}

const fixtureRules = {
  fridge: {
    __default__: { side: 40, rear: 25, top: 50 },
    BrandA: { side: 50, rear: 40, top: 80 },
    BrandB: { side: 45, rear: 35, top: 70 },
    BrandC: { side: 42, rear: 30, top: 60 },
    BrandD: { side: 35, rear: 30, top: 55 },
    BrandE: { side: 35, rear: 30, top: 55 }
  },
  washing_machine: {
    __default__: { side: 20, rear: 80, top: 30 },
    WasherA: { side: 20, rear: 80, top: 40 },
    WasherB: { side: 25, rear: 80, top: 40 }
  }
};

test('task 16 comparisons: selectComparisonPairs keeps only brands that meet minModels', async () => {
  const { selectComparisonPairs } = await import(moduleUrl);
  const pairs = selectComparisonPairs(fixtureProducts(), fixtureRules, {
    catsToProcess: ['fridge'],
    minModels: 3,
    topN: 50
  });

  assert.equal(pairs.some((pair) => pair.brandA === 'BrandC' || pair.brandB === 'BrandC'), false);
  assert.equal(pairs.some((pair) => pair.brandA === 'BrandD' || pair.brandB === 'BrandD'), true);
});

test('task 16 comparisons: selectComparisonPairs never returns self pairs', async () => {
  const { selectComparisonPairs } = await import(moduleUrl);
  const pairs = selectComparisonPairs(fixtureProducts(), fixtureRules, {
    catsToProcess: ['fridge', 'washing_machine'],
    minModels: 3,
    topN: 50
  });

  assert.equal(pairs.every((pair) => pair.brandA !== pair.brandB), true);
});

test('task 16 comparisons: selectComparisonPairs caps results to topN per category', async () => {
  const { selectComparisonPairs } = await import(moduleUrl);
  const pairs = selectComparisonPairs(fixtureProducts(), fixtureRules, {
    catsToProcess: ['fridge'],
    minModels: 3,
    topN: 2
  });

  assert.equal(pairs.length, 2);
});

test('task 16 comparisons: slugifyPair returns lowercase URL-safe slug with vs token', async () => {
  const { slugifyPair } = await import(moduleUrl);
  assert.equal(slugifyPair('Fisher & Paykel', 'LG', 'fridge'), 'fisher-paykel-vs-lg-fridge-clearance');
});

test('task 16 comparisons: buildComparisonNarrative includes exact mm values', async () => {
  const { buildComparisonNarrative } = await import(moduleUrl);
  const narrative = buildComparisonNarrative(
    { side: 50, rear: 40, top: 80 },
    { side: 45, rear: 35, top: 70 },
    'LG',
    'Samsung',
    { labelPlural: 'Fridges', labelSingular: 'Fridge' }
  );
  assert.match(narrative.summary, /50mm side clearance/);
  assert.match(narrative.summary, /45mm/);
});

test('task 16 comparisons: buildComparisonPageHtml includes og:title meta', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml({
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
    modelSamplesB: []
  });
  assert.match(html, /<meta property="og:title"/);
});

test('task 16 comparisons: buildComparisonPageHtml includes BreadcrumbList JSON-LD', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml({
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
    modelSamplesB: []
  });
  assert.match(html, /"@type": "BreadcrumbList"/);
});

test('task 16 comparisons: buildComparisonPageHtml includes both brands in H1', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml({
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
    modelSamplesB: []
  });
  assert.match(html, /<h1>LG vs Samsung Fridge Clearance Requirements/);
});


test('task 16 comparisons: buildComparisonPageHtml carries compare intent back to homepage CTA', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml({
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
    modelSamplesB: []
  });
  assert.match(html, /compare=LG-vs-Samsung/);
  assert.match(html, /Compare LG vs Samsung inside your exact cavity/);
});

test('task 16 comparisons: buildComparisonPageHtml renders buy links when direct URLs exist', async () => {
  const { buildComparisonPageHtml } = await import(moduleUrl);
  const html = buildComparisonPageHtml({
    brandA: 'LG',
    brandB: 'Samsung',
    cat: 'fridge',
    modelsA: 5,
    modelsB: 6,
    clearanceA: { side: 50, rear: 40, top: 80 },
    clearanceB: { side: 45, rear: 35, top: 70 },
    slug: 'lg-vs-samsung-fridge-clearance',
    categoryMeta: { slug: 'fridge', labelPlural: 'Fridges', labelSingular: 'Fridge' },
    modelSamplesA: [{ model: 'A1', w: 700, h: 1700, d: 700, directUrl: 'https://example.com/a1', directLabel: 'Buy now' }],
    modelSamplesB: [{ model: 'B1', w: 710, h: 1710, d: 710, bestRetailer: { n: 'JB Hi-Fi', url: 'https://example.com/b1' } }]
  });
  assert.match(html, /Buy now/);
  assert.match(html, /Buy from JB Hi-Fi/);
});
