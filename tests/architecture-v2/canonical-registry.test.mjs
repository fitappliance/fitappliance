import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';

const catalog = { products: [
  { id: 'fridge-a1', cat: 'fridge', brand: 'Example', model: 'ABC-1' },
  { id: 'fridge-a2', cat: 'fridge', brand: 'Example', model: 'ABC-2' },
] };

test('builds deterministic canonical products and reversible legacy mappings', () => {
  const first = buildCanonicalRegistry(catalog, { quarantineLegacyIds: ['fridge-a2'] });
  const second = buildCanonicalRegistry(structuredClone(catalog), { quarantineLegacyIds: ['fridge-a2'] });
  assert.deepEqual(first, second);
  assert.equal(first.products.length, 1);
  assert.equal(first.quarantine.length, 1);
  assert.equal(first.identifierMappings[0].legacyRuntimeId, 'fridge-a1');
  assert.match(first.products[0].id, /^fa_prod_[a-f0-9]{24}$/);
});

test('quarantines exact manufacturer identity collisions instead of choosing a winner', () => {
  const duplicate = { products: [
    ...catalog.products,
    { id: 'another-id', cat: 'fridge', brand: 'EXAMPLE', model: 'abc 1' },
  ] };
  const result = buildCanonicalRegistry(duplicate);
  assert.equal(result.products.length, 1);
  assert.equal(result.quarantine.length, 2);
  assert.ok(result.quarantine.every((row) => row.reasons.includes('manufacturer_identity_collision')));
});

test('rejects duplicate legacy IDs and malformed catalog rows', () => {
  assert.throws(() => buildCanonicalRegistry({ products: [catalog.products[0], catalog.products[0]] }), /duplicate legacy/i);
  assert.throws(() => buildCanonicalRegistry({ products: [{ id: '', cat: 'fridge' }] }), /non-empty/i);
});
