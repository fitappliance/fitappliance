import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertResolutionCaseCoverage,
  buildResolutionSeedDocument,
} from '../../src/domain/evidence-resolution-seed.mjs';

const catalog = { products: [
  {
    id: 'fridge-1', cat: 'fridge', brand: 'Westinghouse', model: 'M1',
    evidence: { source_url: 'https://www.westinghouse.com.au/fridges/m1/' },
  },
  { id: 'kit-1', cat: 'dishwasher', brand: 'Brand', model: 'KIT1' },
] };
const quarantine = { products: [
  { legacyRuntimeId: 'fridge-1', reason: 'approved_alias_dimensions_only_projection_still_exposes_unreviewed_clearance_operation_and_plumbing_fields' },
  { legacyRuntimeId: 'kit-1', reason: 'dishwasher_door_kit_is_not_a_complete_appliance' },
] };
const disposition = { products: [
  { legacyId: 'fridge-1', disposition: 'approved_dimensions_alias' },
] };

test('seeder creates deterministic machine cases only for releasable evidence holds', () => {
  const first = buildResolutionSeedDocument({ schemaVersion: 1, cases: [] }, {
    catalog, publicationQuarantine: quarantine, phase1Disposition: disposition,
  });
  const second = buildResolutionSeedDocument({ schemaVersion: 1, cases: [] }, {
    catalog, publicationQuarantine: quarantine, phase1Disposition: disposition,
  });
  assert.deepEqual(first, second);
  assert.equal(first.cases.length, 1);
  assert.equal(first.cases[0].legacyRuntimeId, 'fridge-1');
  assert.deepEqual(first.cases[0].initialFailure.conflictingFields, [
    'flags.requiresPlumbing',
    'installation.leftMm',
    'installation.rearMm',
    'installation.rightMm',
    'installation.topMm',
    'operation.doorOpenDepthMm',
  ]);
  assert.deepEqual(first.cases[0].candidateUrls, ['https://www.westinghouse.com.au/fridges/m1/']);
  assert.ok(first.cases[0].releasableQuarantineReasons.includes('phase1_approved_dimensions_alias'));
});

test('seeder preserves active case history and never creates a second case for a product', () => {
  const seeded = buildResolutionSeedDocument({ schemaVersion: 1, cases: [{
    id: 'existing', legacyRuntimeId: 'fridge-1', history: [{ outcome: 'failed' }],
  }] }, { catalog, publicationQuarantine: quarantine, phase1Disposition: disposition });
  assert.equal(seeded.cases.length, 1);
  assert.equal(seeded.cases[0].id, 'existing');
  assert.equal(seeded.cases[0].history.length, 1);
});

test('coverage gate rejects a releasable publication hold without an automated case', () => {
  assert.throws(() => assertResolutionCaseCoverage({ schemaVersion: 1, cases: [] }, quarantine), /missing automated resolution case/i);
  const seeded = buildResolutionSeedDocument({ schemaVersion: 1, cases: [] }, {
    catalog, publicationQuarantine: quarantine, phase1Disposition: disposition,
  });
  assert.equal(assertResolutionCaseCoverage(seeded, quarantine), true);
});
