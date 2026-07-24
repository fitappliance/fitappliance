import test from 'node:test';
import assert from 'node:assert/strict';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import {
  buildActiveHistoricalEvidenceScope,
} from '../../src/domain/active-historical-evidence-scope.mjs';

const SHA = (value) => value.repeat(64);

function lifecycle(canonicalProductId, lifecycleState) {
  return {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-v1',
    asOf: '2026-07-21T12:12:18.070Z',
    canonicalProductId,
    lifecycleState,
    authorizingObservation: lifecycleState === 'CURRENT_RETAIL' ? {
      id: `obs_${canonicalProductId}`,
      canonicalProductId,
      availability: 'available',
      listingState: 'current',
      freshnessState: 'FRESH',
      rawSourceSha256: SHA('d'),
    } : null,
    latestObservations: [],
    observationConflicts: [],
    collectionAttempts: [],
    reasonCodes: [],
  };
}

function fixture() {
  const currentLifecycle = lifecycle('fa_prod_current', 'CURRENT_RETAIL');
  currentLifecycle.latestObservations.push(currentLifecycle.authorizingObservation);
  return {
    descriptor: {
      releaseCandidateId: 'retail_lifecycle_release_1234567890abcdef12345678',
      activatedAt: '2026-07-21T17:47:21.000Z',
      artifacts: {
        publicProjection: { sha256: SHA('a') },
        historicalReference: { sha256: SHA('b') },
        authorizationManifest: { sha256: SHA('c') },
      },
    },
    catalog: {
      products: [
        {
          id: 'fridge-current',
          canonicalProductId: 'fa_prod_current',
          cat: 'fridge',
          brand: 'Example',
          model: 'CURRENT1',
          retailLifecycle: currentLifecycle,
        },
        {
          id: 'dishwasher-unknown',
          canonicalProductId: 'fa_prod_unknown',
          cat: 'dishwasher',
          brand: 'Example',
          model: 'UNKNOWN1',
          retailLifecycle: lifecycle('fa_prod_unknown', 'UNKNOWN_RETAIL'),
        },
        {
          id: 'combo-current',
          canonicalProductId: 'fa_prod_combo',
          cat: 'washtower_combo',
          brand: 'Example',
          model: 'COMBO1',
          retailLifecycle: lifecycle('fa_prod_combo', 'CURRENT_RETAIL'),
        },
      ],
    },
    reference: {
      schemaVersion: 1,
      generatedAt: '2026-07-21T12:12:18.070Z',
      sourceSnapshotHashes: { 'fitappliance:catalog': SHA('e') },
      records: [
        {
          schemaVersion: 1,
          referenceId: 'fa_ref_current',
          category: 'fridge',
          brand: 'Example',
          model: 'CURRENT1',
          lifecycleState: 'UNKNOWN_RETAIL',
          catalogProductIds: ['fridge-current'],
        },
        {
          schemaVersion: 1,
          referenceId: 'fa_ref_unknown',
          category: 'dishwasher',
          brand: 'Example',
          model: 'UNKNOWN1',
          lifecycleState: 'CATALOG_ARCHIVED',
          catalogProductIds: ['dishwasher-unknown'],
        },
        {
          schemaVersion: 1,
          referenceId: 'fa_ref_registry',
          category: 'dryer',
          brand: 'Example',
          model: 'REGISTRY1',
          lifecycleState: 'REGISTRY_ONLY',
          catalogProductIds: [],
        },
      ],
      summary: { records: 3 },
    },
  };
}

test('active historical evidence scope uses the released catalogue lifecycle for control priority', () => {
  const scope = buildActiveHistoricalEvidenceScope(fixture());

  assert.equal(scope.records.find((row) => row.referenceId === 'fa_ref_current').lifecycleState, 'CURRENT_RETAIL');
  assert.equal(scope.records.find((row) => row.referenceId === 'fa_ref_unknown').lifecycleState, 'UNKNOWN_RETAIL');
  assert.equal(scope.records.find((row) => row.referenceId === 'fa_ref_registry').lifecycleState, 'REGISTRY_ONLY');
  assert.deepEqual(scope.summary, {
    activeCatalogProducts: 3,
    supportedCatalogProducts: 2,
    unsupportedCatalogProducts: 1,
    supportedCurrentRetailProducts: 1,
    unsupportedCurrentRetailProducts: 1,
    historicalReferences: 3,
    mappedHistoricalReferences: 2,
    unmappedHistoricalReferences: 1,
    byLifecycle: {
      CURRENT_RETAIL: 1,
      REGISTRY_ONLY: 1,
      UNKNOWN_RETAIL: 1,
    },
  });
  assert.deepEqual(scope.sourceBindings, {
    releaseCandidateId: 'retail_lifecycle_release_1234567890abcdef12345678',
    publicProjectionSha256: SHA('a'),
    historicalReferenceSha256: SHA('b'),
    authorizationManifestSha256: SHA('c'),
  });
});

test('active historical evidence scope rejects a supported catalogue product without one exact reference', () => {
  const input = fixture();
  input.reference.records = input.reference.records.filter(
    (row) => row.referenceId !== 'fa_ref_current',
  );
  input.reference.summary.records -= 1;

  assert.throws(
    () => buildActiveHistoricalEvidenceScope(input),
    /supported active product missing historical reference.*fridge-current/i,
  );
});

test('active historical evidence scope rejects catalogue and reference identity drift', () => {
  const input = fixture();
  input.reference.records[0].model = 'SIBLING1';

  assert.throws(
    () => buildActiveHistoricalEvidenceScope(input),
    /active historical identity mismatch.*fridge-current/i,
  );
});

test('tracked active release rebases the control inventory and current-retail denominator', async () => {
  const release = await loadActiveRetailRelease();
  const scope = buildActiveHistoricalEvidenceScope(release);

  assert.equal(scope.summary.activeCatalogProducts, 3513);
  assert.equal(scope.summary.supportedCatalogProducts, 3510);
  assert.equal(scope.summary.unsupportedCatalogProducts, 3);
  assert.equal(scope.summary.supportedCurrentRetailProducts, 347);
  assert.equal(scope.summary.unsupportedCurrentRetailProducts, 2);
  assert.equal(scope.summary.historicalReferences, 8087);
  assert.deepEqual(scope.summary.byLifecycle, {
    CATALOG_ARCHIVED: 3086,
    CURRENT_RETAIL: 347,
    REGISTRY_ONLY: 4577,
    UNKNOWN_RETAIL: 77,
  });
});
