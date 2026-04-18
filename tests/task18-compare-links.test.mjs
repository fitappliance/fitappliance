import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
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
