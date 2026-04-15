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
