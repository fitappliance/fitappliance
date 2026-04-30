import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;
const deferredCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');
const criticalCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1] ?? '';
}

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

test('task 9.3 product-card: buildNoRetailerUrl uses honest Google Australia query', async () => {
  const { buildNoRetailerUrl } = await import(productCardModuleUrl);
  const url = buildNoRetailerUrl(makeProduct({ model: 'SRF7500WFH French Door' }));
  assert.match(url, /google\.com\.au\/search/);
  assert.match(url, /HISENSE%20SRF7500WFH%20French%20Door%20fridge%20australia/);
  assert.doesNotMatch(url, /site%3A/);
  assert.doesNotMatch(url, /tbm=shop/);
});

test('task 9.3 product-card: buildSearchOnlineUrl falls back to brand and category', async () => {
  const { buildSearchOnlineUrl } = await import(productCardModuleUrl);
  const url = buildSearchOnlineUrl(makeProduct({ model: '' }));
  assert.match(url, /HISENSE%20fridge%20australia/);
  assert.doesNotMatch(url, /site%3Athegoodguys\.com\.au/);
});

test('task 9.3 product-card: no-price card renders live shopping URL instead of dead href', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct(), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Price unavailable/);
  assert.match(html, /class="product-thumb-svg"/);
  assert.match(html, /Search this model online/);
  assert.match(html, /retailer info not available/);
  assert.match(html, /class="btn-search-online"/);
  assert.match(html, /google\.com\.au\/search/);
  assert.doesNotMatch(html, /Search at:/);
});

test('task 9.3 product-card: no-price list row renders shopping fallback and display brand mapping', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '100',
    lifetimeCost: () => 2000,
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Price unavailable/);
  assert.match(html, /Search this model online/);
  assert.match(html, /retailer info not available/);
  assert.match(html, /class="product-thumb-svg"/);
  assert.match(html, /class="p-row-brand">Hisense</);
  assert.match(html, /google\.com\.au\/search/);
});

test('task 9.3 product-card: retailer link with null price renders without blanking row', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/hisense-srf7500wfh',
        p: null
      }
    ]
  }), {
    annualEnergyCost: () => '100',
    lifetimeCost: () => 2000,
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Price unavailable/);
  assert.doesNotMatch(html, /Price unavailable — search online/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /https:\/\/www\.jbhifi\.com\.au\/products\/hisense-srf7500wfh/);
  assert.doesNotMatch(html, /\$null/);
  assert.doesNotMatch(html, /undefined/);
});

test('task 9.3 product-card: card with retailer URL but null price shows fallback price copy', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct({
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/hisense-srf7500wfh',
        p: null
      }
    ]
  }), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Price unavailable/);
  assert.doesNotMatch(html, /Price unavailable — search online/);
  assert.match(html, /JB Hi-Fi/);
  assert.doesNotMatch(html, /\$null/);
});

test('hotfix retailer URL quality: priced root retailer URL does not create stale price CTA', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    brand: 'Mitsubishi',
    model: 'MR-CGX680ZG French Door 680L',
    price: 4999,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliances-online.com.au', p: 4999 }
    ]
  }), {
    annualEnergyCost: () => '90',
    lifetimeCost: () => 5895,
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Price unavailable/);
  assert.match(html, /Search this model online/);
  assert.doesNotMatch(html, /Appliances Online/);
  assert.doesNotMatch(html, /href="https:\/\/www\.appliances-online\.com\.au"/);
  assert.doesNotMatch(html, /\$4,999/);
});

test('task 9.3 product-card: retailer product URL becomes the primary row title with model secondary', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    brand: 'CHIQ',
    model: 'CTM200NSS5E',
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/chiq-ctm201nb3-202l-top-mount-fridge-black',
        p: null
      }
    ]
  }), {
    annualEnergyCost: () => '58',
    lifetimeCost: () => 576,
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /<div class="p-row-name">CHiQ CTM201NB3 202L Top Mount Fridge \(Black\)<\/div>/);
  assert.match(html, /<div class="p-row-model">Model CTM200NSS5E<\/div>/);
  assert.doesNotMatch(html, /<div class="p-row-name">CTM200NSS5E<\/div>/);
});

test('task 9.3 product-card: retailer product URL becomes the primary card title with model secondary', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct({
    brand: 'CHIQ',
    model: 'CTM200NSS5E',
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/chiq-ctm201nb3-202l-top-mount-fridge-black',
        p: null
      }
    ]
  }), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /<div class="c-name">CHiQ CTM201NB3 202L Top Mount Fridge \(Black\)<\/div>/);
  assert.match(html, /<div class="c-model">Model CTM200NSS5E<\/div>/);
  assert.doesNotMatch(html, /<div class="c-name">CTM200NSS5E<\/div>/);
});

test('task 9.3 product-card: no-price action copy uses compact non-italic styling hooks', () => {
  const block = cssBlock(deferredCss, '.c-price.no-price, .p-row-price.no-price');

  assert.match(block, /font-family:\s*'Outfit'/);
  assert.match(block, /font-style:\s*normal/);
  assert.match(block, /font-size:\s*13px/);
});

test('task 9.3 facet price filters stay inside the sidebar grid', () => {
  const block = cssBlock(criticalCss, '.facet-price-row input');

  assert.match(block, /min-width:\s*0/);
  assert.match(block, /width:\s*100%/);
  assert.match(block, /box-sizing:\s*border-box/);
});

test('phase 50 retailer links: logo-like retailer chips have compact styling hooks', () => {
  const panelBlock = cssBlock(deferredCss, '.retailer-logo-panel');
  const linkBlock = cssBlock(deferredCss, '.retailer-logo-link');
  const markBlock = cssBlock(deferredCss, '.retailer-logo-mark');

  assert.match(panelBlock, /flex-direction:\s*column/);
  assert.match(panelBlock, /align-items:\s*flex-end/);
  assert.match(linkBlock, /border-radius:\s*999px/);
  assert.match(linkBlock, /font-size:\s*11px/);
  assert.match(markBlock, /min-width:\s*24px/);
  assert.match(markBlock, /font-weight:\s*900/);
});

test('phase 50 retailer links: list row keeps retailer choices in the action column only', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    retailers: [
      { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-srf7500wfh', p: null },
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/hisense-srf7500wfh/', p: null }
    ]
  }), {
    annualEnergyCost: () => '100',
    lifetimeCost: () => 2000,
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-logo-panel/);
  assert.match(html, /Available at/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /Appliances Online/);
  assert.doesNotMatch(html, /Buy at /);
  assert.doesNotMatch(html, /We earn a commission if you purchase via these links/);
});

test('hotfix result row layout: list row uses a classed action footer instead of inline flex squeeze', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    retailers: [
      { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-srf7500wfh', p: null },
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/hisense-srf7500wfh/', p: null },
      { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/hisense-srf7500wfh', p: null }
    ]
  }), {
    annualEnergyCost: () => '100',
    lifetimeCost: () => 2000,
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /class="p-row-action-buttons"/);
  assert.doesNotMatch(html, /style="display:flex;gap:6px"/);
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
