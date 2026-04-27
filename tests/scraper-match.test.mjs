import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  matchProductToCatalog,
  normalizeModelForMatch,
} = require('../scripts/scrapers/common/match-catalog.js');

test('scraper match: fuzzy model match keeps brand strict and returns high confidence', () => {
  const catalog = [
    { id: 'samsung-sr-f605hk', slug: 'samsung-sr-f605hk', brand: 'Samsung', model: 'SR-F605HK' },
    { id: 'lg-gth560npl', slug: 'lg-gth560npl', brand: 'LG', model: 'GTH560NPL' },
  ];

  const result = matchProductToCatalog({ brand: 'Samsung', model: 'SR-F605' }, catalog);

  assert.equal(result.matched, true);
  assert.equal(result.catalogId, 'samsung-sr-f605hk');
  assert.ok(result.confidence >= 0.9, `expected high confidence, got ${result.confidence}`);
  assert.equal(result.catalogProduct.model, 'SR-F605HK');
});

test('scraper match: different brands never match even with plausible models', () => {
  const catalog = [
    { id: 'bosch-kgn396lbas', slug: 'bosch-kgn396lbas', brand: 'Bosch', model: 'KGN396LBAS' },
  ];

  const result = matchProductToCatalog({ brand: 'LG', model: 'GTH560NPL' }, catalog);

  assert.equal(result, null);
});

test('scraper match: brand-canon aliases are applied before strict brand comparison', () => {
  const catalog = [
    { id: 'midea-mdrf430', slug: 'midea-mdrf430', brand: 'Midea', model: 'MDRF430' },
  ];

  const result = matchProductToCatalog({ brand: 'MIDEA', model: 'MDRF-430' }, catalog);

  assert.equal(result.matched, true);
  assert.equal(result.catalogId, 'midea-mdrf430');
  assert.equal(result.confidence, 1);
});

test('scraper match: model normalization removes spaces, hyphens and punctuation', () => {
  assert.equal(normalizeModelForMatch(' SR-F 605 HK '), 'SRF605HK');
  assert.equal(normalizeModelForMatch('GT1S Dual-Inverter — 8kg'), 'GT1SDUALINVERTER8KG');
});

