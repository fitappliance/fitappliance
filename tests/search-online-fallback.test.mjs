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

test('phase 48 card polish 2: online fallback uses complete brand model category australia query', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const url = buildSearchOnlineUrl({
    brand: 'LG',
    model: 'GT1S DualInverter Condenser — 8kg',
    cat: 'fridge'
  });
  const query = decodeQuery(url);

  assert.match(url, /^https:\/\/www\.google\.com\.au\/search\?q=/);
  assert.equal(query, 'LG GT1S DualInverter Condenser — 8kg fridge australia');
});

test('phase 48 card polish 2: online fallback avoids shopping tab and retailer site filters', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const url = buildSearchOnlineUrl({ brand: 'LG', model: 'GT1S', cat: 'fridge' });
  const query = decodeQuery(url);

  assert.doesNotMatch(url, /tbm=shop/);
  assert.doesNotMatch(query, /site:/);
  assert.doesNotMatch(query, /jbhifi|harveynorman|thegoodguys|appliancesonline|binglee/i);
});

test('phase 48 card polish 2: fallback query degrades to brand category australia when model is empty', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const query = decodeQuery(buildSearchOnlineUrl({ brand: 'LG', model: '', cat: 'fridge' }));

  assert.equal(query, 'LG fridge australia');
});

test('phase 48 card polish 2: fallback query works without a category label', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const query = decodeQuery(buildSearchOnlineUrl({ brand: 'LG', model: 'GT1S', cat: 'unknown' }));

  assert.equal(query, 'LG GT1S australia');
});

test('phase 48 card polish 2: fallback query appends australia only once', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const query = decodeQuery(buildSearchOnlineUrl({ brand: 'LG Australia', model: 'GT1S', cat: 'fridge' }));

  assert.equal((query.match(/australia/gi) ?? []).length, 2);
  assert.match(query, /fridge australia$/);
});

test('phase 48 card polish 2: empty product identity still returns a legal Google URL', async () => {
  const { buildSearchOnlineUrl } = await loadProductCard();
  const query = decodeQuery(buildSearchOnlineUrl({}));

  assert.doesNotMatch(query, /^undefined|null/);
  assert.equal(query, 'australia');
});

test('phase 48 card polish 2: buildNoRetailerUrl is a backwards-compatible alias for online search', async () => {
  const { buildSearchOnlineUrl, buildNoRetailerUrl } = await loadProductCard();
  const product = { brand: 'Samsung', model: 'SRF7100S', cat: 'fridge' };

  assert.equal(buildNoRetailerUrl(product), buildSearchOnlineUrl(product));
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

test('phase 48 card polish 2: old Google Shopping fallback API is removed', async () => {
  const module = await loadProductCard();

  assert.equal('buildGoogleShoppingUrl' in module, false);
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

test('phase 48 card polish 2: no-retailer trigger renders one honest online search button', async () => {
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

  assert.match(html, /Search this model online/);
  assert.match(html, /retailer info not available/);
  assert.match(html, /class="btn-search-online"/);
  assert.match(html, /google\.com\.au\/search/);
  assert.match(html, /LG%20GT1S%20DualInverter%20Condenser%20%E2%80%94%208kg%20fridge%20australia/);
  assert.doesNotMatch(html, /site%3A/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(html, /Search at:/);
  assert.doesNotMatch(html, /Compare prices online/);
});

test('phase 48 card polish 2: no-retailer trigger note is nested inside the CTA', async () => {
  const { buildCard } = await loadProductCard();
  const html = buildCard({
    id: 'p3',
    cat: 'dryer',
    brand: 'Beko',
    model: 'BDV70WG',
    w: 600,
    h: 850,
    d: 600,
    stars: 4,
    kwh_year: 220,
    features: [],
    retailers: []
  }, {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /<a class="btn-search-online"[\s\S]*<span class="btn-search-note">retailer info not available<\/span>[\s\S]*<\/a>/);
});

test('phase 48 card polish 2: no-retailer row uses the same honest online search button', async () => {
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

  assert.match(html, /Search this model online/);
  assert.match(html, /retailer info not available/);
  assert.match(html, /Bosch%20WAN24124AU%20Serie%204%20washing%20machine%20australia/);
  assert.doesNotMatch(html, /Search online/);
  assert.doesNotMatch(html, /JB Hi-Fi/);
});
