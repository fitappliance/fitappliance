import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildCanonicalRegistry, extractGemsRegistrationFromLegacyId } from '../../src/domain/canonical-registry.mjs';

test('canonical registry build inputs survive the Vercel reports exclusion', () => {
  const source = readFileSync(new URL('../../scripts/architecture-v2/build-canonical-registry.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /reports\/architecture-v2/);
  assert.match(source, /resolveArchitectureV2Path\(root, 'phase1QuarantineDisposition'\)/);
});

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

test('automated evidence resolution releases only the exact case-bound quarantine reason', () => {
  const input = { products: [
    { id: 'fridge-release', cat: 'fridge', brand: 'A', model: 'M1' },
    { id: 'dishwasher-kit', cat: 'dishwasher', brand: 'A', model: 'KIT1' },
    { id: 'fridge-collision-a', cat: 'fridge', brand: 'B', model: 'M2' },
    { id: 'fridge-collision-b', cat: 'fridge', brand: 'B', model: 'M2' },
  ] };
  const result = buildCanonicalRegistry(input, {
    quarantineEntries: [
      { legacyRuntimeId: 'fridge-release', reason: 'evidence_projection_hold' },
      { legacyRuntimeId: 'dishwasher-kit', reason: 'door_kit_is_not_a_complete_appliance' },
      { legacyRuntimeId: 'fridge-collision-a', reason: 'evidence_projection_hold' },
    ],
    releaseGrants: [
      { legacyRuntimeId: 'fridge-release', caseId: 'case-1', reason: 'evidence_projection_hold' },
      { legacyRuntimeId: 'dishwasher-kit', caseId: 'case-2', reason: 'evidence_projection_hold' },
      { legacyRuntimeId: 'fridge-collision-a', caseId: 'case-3', reason: 'evidence_projection_hold' },
    ],
  });

  assert.ok(result.identifierMappings.some((row) => row.legacyRuntimeId === 'fridge-release'));
  assert.ok(result.quarantine.some((row) => row.legacyRuntimeId === 'dishwasher-kit'
    && row.reasons.includes('door_kit_is_not_a_complete_appliance')));
  assert.ok(result.quarantine.some((row) => row.legacyRuntimeId === 'fridge-collision-a'));
  assert.ok(result.quarantine.some((row) => row.legacyRuntimeId === 'fridge-collision-b'));
});

test('rejects malformed, duplicate, and non-releasable automated grants', () => {
  assert.throws(() => buildCanonicalRegistry(catalog, {
    quarantineEntries: [{ legacyRuntimeId: 'fridge-a1', reason: 'manufacturer_identity_collision' }],
    releaseGrants: [{ legacyRuntimeId: 'fridge-a1', caseId: 'case-1', reason: 'manufacturer_identity_collision' }],
  }), /non-releasable/i);
  assert.throws(() => buildCanonicalRegistry(catalog, {
    releaseGrants: [{ legacyRuntimeId: 'fridge-a1', caseId: '', reason: 'evidence_projection_hold' }],
  }), /case/i);
});

test('repository publication quarantine excludes Beko stacking kits from the appliance registry', () => {
  const repositoryCatalog = JSON.parse(readFileSync(
    new URL('../../data/catalog-final.json', import.meta.url),
    'utf8',
  ));
  const publicationQuarantine = JSON.parse(readFileSync(
    new URL('../../data/architecture-v2/decisions/canonical-publication-quarantine.json', import.meta.url),
    'utf8',
  ));
  const result = buildCanonicalRegistry(repositoryCatalog, {
    quarantineEntries: publicationQuarantine.products,
  });
  const accessoryIds = ['ao-111095', 'ao-111099'];

  assert.ok(accessoryIds.every((legacyRuntimeId) => (
    !result.identifierMappings.some((row) => row.legacyRuntimeId === legacyRuntimeId)
  )));
  assert.ok(accessoryIds.every((legacyRuntimeId) => result.quarantine.some((row) => (
    row.legacyRuntimeId === legacyRuntimeId
      && row.reasons.includes('dryer_stacking_kit_is_not_a_complete_appliance')
  ))));
});
