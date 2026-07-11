import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicProjection } from '../../src/domain/public-projection.mjs';

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
