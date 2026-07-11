import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCanonicalRegistry, extractGemsRegistrationFromLegacyId } from '../../src/domain/canonical-registry.mjs';

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

test('preserves proven GEMS registration identifiers without inferring unknown prefixes', () => {
  assert.equal(extractGemsRegistrationFromLegacyId('fridge-arf3335'), 'ARF3335');
  assert.equal(extractGemsRegistrationFromLegacyId('dishwasher-adw1215'), 'ADW1215');
  assert.equal(extractGemsRegistrationFromLegacyId('dryer-zcd0112'), null);
  const result = buildCanonicalRegistry({ products: [{ ...catalog.products[0], id: 'fridge-arf3335' }] });
  assert.ok(result.products[0].identifiers.some((row) => row.scheme === 'gems_registration'));
});

test('a reviewed rename decision can preserve an existing canonical ID', () => {
  const initial = buildCanonicalRegistry({ products: [catalog.products[0]] });
  const renamed = buildCanonicalRegistry({ products: [{ ...catalog.products[0], model: 'ABC-1-NEW' }] }, {
    identityDecisions: [{
      legacyRuntimeId: 'fridge-a1', canonicalProductId: initial.products[0].id,
      status: 'approved', reviewer: 'Jagger Zhang', reviewedAt: '2026-07-11', rationale: 'Manufacturer rename evidence reviewed.',
    }],
  });
  assert.equal(renamed.products[0].id, initial.products[0].id);
  assert.throws(() => buildCanonicalRegistry(catalog, { identityDecisions: [{ legacyRuntimeId: 'fridge-a1', status: 'approved' }] }), /decision/i);
});
