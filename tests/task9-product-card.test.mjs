import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

function makeProduct(overrides = {}) {
  return {
    id: 'f-test',
    cat: 'fridge',
    brand: 'HISENSE',
    model: 'SRF7500WFH French Door',
    w: 900,
    h: 1800,
    d: 700,
    stars: 4,
    kwh_year: 350,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: ['French Door', 'No Frost'],
    retailers: [],
    sponsored: false,
    ...overrides
  };
}

test('task 9.3 product-card: buildNoRetailerUrl prefers SKU token from model', async () => {
  const { buildNoRetailerUrl } = await import(productCardModuleUrl);
  const url = buildNoRetailerUrl(makeProduct({ model: 'SRF7500WFH French Door' }));
  assert.match(url, /q=SRF7500WFH%20buy%20australia/);
  assert.match(url, /tbm=shop/);
});

test('task 9.3 product-card: buildNoRetailerUrl falls back when model token is unavailable', async () => {
  const { buildNoRetailerUrl } = await import(productCardModuleUrl);
  const url = buildNoRetailerUrl(makeProduct({ model: '' }));
  assert.match(url, /HISENSE%20%20buy%20australia/);
});

test('task 9.3 product-card: no-price card renders live shopping URL instead of dead href', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct(), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Price unavailable — search online/);
  assert.match(html, /class="btn-buy btn-buy--ghost"/);
  assert.match(html, /href="https:\/\/www\.google\.com\.au\/search\?q=SRF7500WFH%20buy%20australia&amp;tbm=shop"/);
  assert.doesNotMatch(html, /class="btn-buy btn-buy--ghost" href="#"/);
});

test('task 9.3 product-card: no-price list row renders shopping fallback and display brand mapping', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '100',
    lifetimeCost: () => 2000,
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Price unavailable — search online/);
  assert.match(html, /Search online/);
  assert.match(html, /class="p-row-brand">Hisense</);
  assert.doesNotMatch(html, /class="btn-buy btn-buy--ghost" href="#"/);
});

test('task 10 rebate: isRebateEligible returns true for stars >= 4', async () => {
  const { isRebateEligible } = await import(productCardModuleUrl);

  assert.equal(isRebateEligible({ stars: 4 }), true);
  assert.equal(isRebateEligible({ stars: 5 }), true);
  assert.equal(isRebateEligible({ stars: 6 }), true);
});

test('task 10 rebate: isRebateEligible returns false for stars < 4', async () => {
  const { isRebateEligible } = await import(productCardModuleUrl);

  assert.equal(isRebateEligible({ stars: 3 }), false);
  assert.equal(isRebateEligible({ stars: 1 }), false);
});

test('task 10 rebate: isRebateEligible returns false for non-number values', async () => {
  const { isRebateEligible } = await import(productCardModuleUrl);

  assert.equal(isRebateEligible({ stars: '5' }), false);
  assert.equal(isRebateEligible({ stars: null }), false);
  assert.equal(isRebateEligible({}), false);
});

test('task 10 rebate: warningsHtml includes green badge for eligible products', async () => {
  const { warningsHtml } = await import(productCardModuleUrl);
  const html = warningsHtml(makeProduct({ stars: 5, door_swing_mm: 0 }));

  assert.ok(html.includes('card-warning-green'), 'green badge present for 5-star product');
  assert.ok(html.includes('energy rebate'), 'rebate text present');
});

test('task 10 rebate: warningsHtml excludes green badge for ineligible products', async () => {
  const { warningsHtml } = await import(productCardModuleUrl);
  const html = warningsHtml(makeProduct({ stars: 3, door_swing_mm: 0 }));

  assert.ok(!html.includes('card-warning-green'), 'no green badge for 3-star product');
});

test('task 10 rebate: buildCard output includes green badge for 5-star products', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct({ stars: 5, door_swing_mm: 0, retailers: [] }), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.ok(html.includes('card-warning-green'));
});

test('task 15 price-badge: returns empty string when retailers are unavailable', async () => {
  const { buildPriceBadge } = await import(productCardModuleUrl);
  const html = buildPriceBadge(makeProduct({ retailers: [] }), '2026-04-15');
  assert.equal(html, '');
});

test('task 15 price-badge: renders best price from retailer list', async () => {
  const { buildPriceBadge } = await import(productCardModuleUrl);
  const html = buildPriceBadge(makeProduct({
    retailers: [
      { n: 'Retailer A', p: 1499, url: 'https://example.com/a' },
      { n: 'Retailer B', p: 1449, url: 'https://example.com/b' }
    ]
  }), '2026-04-15');

  assert.match(html, /\$1,449/);
  assert.match(html, /Best price as of 2026-04-15/);
});

test('task 15 price-badge: shows retailer count when 2 or more retailers are present', async () => {
  const { buildPriceBadge } = await import(productCardModuleUrl);
  const html = buildPriceBadge(makeProduct({
    retailers: [
      { n: 'Retailer A', p: 1499, url: 'https://example.com/a' },
      { n: 'Retailer B', p: 1449, url: 'https://example.com/b' }
    ]
  }), '2026-04-15');

  assert.match(html, /2 retailers/);
});
