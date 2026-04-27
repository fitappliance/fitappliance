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

function decodeQuery(url) {
  return decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
}

test('phase 48 card polish: Google fallback uses complete brand model category query', async () => {
  const { buildGoogleShoppingUrl } = await loadProductCard();
  const url = buildGoogleShoppingUrl({
    brand: 'LG',
    model: 'GT1S DualInverter Condenser — 8kg',
    cat: 'fridge'
  });
  const query = decodeQuery(url);

  assert.match(url, /^https:\/\/www\.google\.com\.au\/search\?q=/);
  assert.match(query, /LG GT1S DualInverter Condenser — 8kg fridge/);
});

test('phase 48 card polish: Google fallback limits results to five AU retailer domains', async () => {
  const { buildGoogleShoppingUrl } = await loadProductCard();
  const query = decodeQuery(buildGoogleShoppingUrl({ brand: 'LG', model: 'GT1S', cat: 'fridge' }));

  for (const domain of [
    'jbhifi.com.au',
    'harveynorman.com.au',
    'thegoodguys.com.au',
    'appliancesonline.com.au',
    'binglee.com.au'
  ]) {
    assert.match(query, new RegExp(`site:${domain.replace('.', '\\.')}`));
  }
  assert.match(query, /site:jbhifi\.com\.au OR site:harveynorman\.com\.au/);
});

test('phase 48 card polish: fallback query degrades to brand and category when model is empty', async () => {
  const { buildGoogleShoppingUrl } = await loadProductCard();
  const query = decodeQuery(buildGoogleShoppingUrl({ brand: 'LG', model: '', cat: 'fridge' }));

  assert.match(query, /^LG fridge/);
});

test('phase 48 card polish: empty product identity still searches across approved retailer sites', async () => {
  const { buildGoogleShoppingUrl } = await loadProductCard();
  const query = decodeQuery(buildGoogleShoppingUrl({}));

  assert.doesNotMatch(query, /^undefined|null/);
  assert.match(query, /^\(site:jbhifi\.com\.au OR site:harveynorman\.com\.au/);
});

test('phase 48 card polish: buildNoRetailerUrl is a backwards-compatible alias for Google fallback', async () => {
  const { buildGoogleShoppingUrl, buildNoRetailerUrl } = await loadProductCard();
  const product = { brand: 'Samsung', model: 'SRF7100S', cat: 'fridge' };

  assert.equal(buildNoRetailerUrl(product), buildGoogleShoppingUrl(product));
});

test('phase 48 card UX: category labels match shopper language', async () => {
  const { categoryLabel } = await loadProductCard();

  assert.equal(categoryLabel('fridge'), 'fridge');
  assert.equal(categoryLabel('dishwasher'), 'dishwasher');
  assert.equal(categoryLabel('dryer'), 'dryer');
  assert.equal(categoryLabel('washing_machine'), 'washing machine');
  assert.equal(categoryLabel('unknown'), '');
});

test('phase 48 card polish: old three-retailer fallback API is removed', async () => {
  const module = await loadProductCard();

  assert.equal('buildSearchFallbackUrls' in module, false);
});

test('phase 48 card polish: no-retailer card avoids naming unsupported retailers as direct choices', async () => {
  const { buildCard } = await loadProductCard();
  const html = buildCard({
    id: 'p2',
    cat: 'fridge',
    brand: 'Samsung',
    model: 'SRF7100S',
    w: 600,
    h: 1800,
    d: 650,
    stars: 4,
    kwh_year: 320,
    features: [],
    retailers: []
  }, {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.doesNotMatch(html, /JB Hi-Fi<\/a>/);
  assert.doesNotMatch(html, /Harvey Norman<\/a>/);
  assert.doesNotMatch(html, /The Good Guys<\/a>/);
});

test('phase 48 card polish: no-retailer trigger renders one Google site-filter button', async () => {
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

  assert.match(html, /Compare prices online/);
  assert.match(html, /class="btn-search-online"/);
  assert.match(html, /google\.com\.au\/search/);
  assert.match(html, /site%3Ajbhifi\.com\.au/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(html, /Search at:/);
});

test('phase 48 card polish: no-retailer row uses the same single online compare button', async () => {
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

  assert.match(html, /Compare prices online/);
  assert.match(html, /Bosch%20WAN24124AU%20Serie%204%20washing%20machine/);
  assert.doesNotMatch(html, /Search online/);
  assert.doesNotMatch(html, /JB Hi-Fi/);
});
