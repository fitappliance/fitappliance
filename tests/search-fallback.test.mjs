import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

async function loadProductCard() {
  return import(`${productCardUrl}?cacheBust=${Date.now()}`);
}

test('phase 48 card UX: fallback URLs use complete brand model category query', async () => {
  const { buildSearchFallbackUrls } = await loadProductCard();
  const rows = buildSearchFallbackUrls({
    brand: 'LG',
    model: 'GT1S DualInverter Condenser — 8kg',
    cat: 'fridge'
  });
  const query = encodeURIComponent('LG GT1S DualInverter Condenser — 8kg fridge');

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.name), ['JB Hi-Fi', 'Harvey Norman', 'The Good Guys']);
  rows.forEach((row) => assert.match(row.url, new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('phase 48 card UX: fallback query degrades to brand and category when model is empty', async () => {
  const { buildSearchFallbackUrls } = await loadProductCard();
  const rows = buildSearchFallbackUrls({ brand: 'LG', model: '', cat: 'fridge' });
  const query = encodeURIComponent('LG fridge');

  assert.equal(rows.length, 3);
  rows.forEach((row) => assert.match(row.url, new RegExp(query)));
});

test('phase 48 card UX: fallback URLs remain valid when product identity is empty', async () => {
  const { buildSearchFallbackUrls } = await loadProductCard();
  const rows = buildSearchFallbackUrls({});

  assert.equal(rows.length, 3);
  rows.forEach((row) => {
    assert.match(row.url, /^https:\/\//);
    assert.match(row.url, /(query=|w=|text=)/);
  });
});

test('phase 48 card UX: category labels match shopper language', async () => {
  const { categoryLabel } = await loadProductCard();

  assert.equal(categoryLabel('fridge'), 'fridge');
  assert.equal(categoryLabel('dishwasher'), 'dishwasher');
  assert.equal(categoryLabel('dryer'), 'dryer');
  assert.equal(categoryLabel('washing_machine'), 'washing machine');
  assert.equal(categoryLabel('unknown'), '');
});

test('phase 48 card UX: no-retailer trigger renders three sponsored retailer search buttons', async () => {
  const { buildCard } = await loadProductCard();
  const html = buildCard({
    id: 'p1',
    cat: 'fridge',
    brand: 'LG',
    model: 'GT1S DualInverter Condenser — 8kg',
    w: 600,
    h: 1800,
    d: 650,
    stars: 4,
    kwh_year: 320,
    price: null,
    features: [],
    retailers: []
  }, {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Search at:/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /Harvey Norman/);
  assert.match(html, /The Good Guys/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(html, /google\.com\.au\/search/);
});

test('phase 48 card UX: no-retailer row uses the same retailer button group', async () => {
  const { buildRow } = await loadProductCard();
  const html = buildRow({
    id: 'p1',
    cat: 'washing_machine',
    brand: 'Bosch',
    model: 'WAN24124AU Serie 4',
    w: 600,
    h: 850,
    d: 600,
    stars: 4,
    kwh_year: 180,
    price: null,
    features: [],
    retailers: []
  }, {
    annualEnergyCost: () => '58',
    lifetimeCost: () => 1200,
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Search at:/);
  assert.match(html, /Bosch%20WAN24124AU%20Serie%204%20washing%20machine/);
  assert.doesNotMatch(html, /Search online/);
});
