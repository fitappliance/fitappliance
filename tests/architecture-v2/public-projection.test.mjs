import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicProjection, normalizePublicProduct } from '../../src/domain/public-projection.mjs';

test('public normalization keeps unknown measurements null and fills presentation fields only', () => {
  const result = normalizePublicProduct({
    id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M', w: 600, h: 1700, d: 650,
    retailers: [], unavailable: true,
  });
  assert.equal(result.kwh_year, null);
  assert.equal(result.stars, null);
  assert.equal(result.door_swing_mm, null);
  assert.equal(result.price, null);
  assert.deepEqual(result.features, []);
  assert.equal(result.sponsored, false);
  assert.match(result.emoji, /\S/);
});

test('public normalization derives door projection only from explicit 90-degree depth evidence', () => {
  const product = normalizePublicProduct({
    id: 'washer-a',
    cat: 'washtower_combo',
    door_swing_mm: null,
    dimensions: { depth_mm: 830, door_open_90_depth_mm: 1460 },
  });

  assert.equal(product.door_swing_mm, 630);

  const ambiguous = normalizePublicProduct({
    id: 'washer-b',
    cat: 'washing_machine',
    door_swing_mm: 250,
  });
  assert.equal(ambiguous.door_swing_mm, null);
});

test('builds a stable projection while retaining legacy URLs as external identifiers', () => {
  const registry = { products: [{ id: 'fa_prod_a', category: 'fridge', brand: 'A', model: 'M', identifiers: [] }], identifierMappings: [{ legacyRuntimeId: 'fridge-1', canonicalProductId: 'fa_prod_a' }] };
  const catalog = { products: [{ id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M', w: 600 }] };
  const result = buildPublicProjection(registry, catalog);
  assert.equal(result.products[0].id, 'fridge-1');
  assert.equal(result.products[0].canonicalProductId, 'fa_prod_a');
  assert.equal(result.products[0].w, 600);
});

test('refuses missing and duplicate mappings', () => {
  const catalog = { products: [{ id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M' }] };
  assert.throws(() => buildPublicProjection({ products: [], identifierMappings: [] }, catalog), /mapping/i);
  assert.throws(() => buildPublicProjection({ products: [], identifierMappings: [
    { legacyRuntimeId: 'fridge-1', canonicalProductId: 'a' }, { legacyRuntimeId: 'fridge-1', canonicalProductId: 'b' },
  ] }, catalog), /duplicate/i);
});
