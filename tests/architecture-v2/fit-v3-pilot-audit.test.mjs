import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFitV3Pilot } from '../../src/domain/fit-v3-pilot-audit.mjs';

function validInput() {
  const hash = 'a'.repeat(64);
  const products = Array.from({ length: 100 }, (_, index) => ({
    canonicalProductId: `p${index}`,
    category: index < 50 ? 'dishwasher' : 'fridge',
  }));
  return {
    baseline: {
      publicProjection: { sha256: hash },
      runtimeCatalog: { sha256: hash },
      fitPublicationAudit: { sha256: hash },
    },
    currentHashes: { publicProjection: hash, runtimeCatalog: hash, fitPublicationAudit: hash },
    snapshots: {
      snapshots: ['energy-rating:fridge', 'energy-rating:dishwasher', 'wels:all-models'].map((sourceId) => ({ manifest: {
        sourceId,
        contentSha256: hash,
        byteLength: 10,
        licence: { permitsRepositoryDerivatives: true },
        storage: { rootEnv: 'FITAPPLIANCE_STORAGE_ROOT', objectPath: `registries/objects/sha256/aa/aa/${hash}.csv` },
      } })),
    },
    reconciliation: {
      energyRating: [{ canPromoteDimensions: false }],
      wels: [{ canPromoteDimensions: false }],
      summary: { dimensionsPromoted: 0, publicWrites: 0 },
    },
    pilot: { frozen: true, sourceSnapshotHashes: [hash], selectionPolicy: { maxRetailerAgeDays: 90, asOf: '2026-07-12T00:00:00.000Z' }, products, summary: { total: 100, byCategory: { dishwasher: 50, fridge: 50 } } },
    researchQueue: { cases: products.map((row) => ({ ...row, publicationState: 'shadow_quarantined', nextAction: { strategy: 'exact_official_installation_document' } })) },
    fitV3Audit: { entries: products.map((row) => ({ ...row, verifiedFitEligible: false, publicationEligible: false })), summary: { verifiedFitEligible: 0, publicMutations: 0 } },
    publicCatalog: { products: [{ id: 'public-1' }] },
  };
}

test('Fit V3 pilot audit accepts isolated shadow artifacts', () => {
  const report = auditFitV3Pilot(validInput());
  assert.equal(report.violations.length, 0);
  assert.equal(report.passed, true);
});

test('Fit V3 pilot audit detects public drift, promotion and false verified eligibility', () => {
  const input = validInput();
  input.currentHashes.publicProjection = 'b'.repeat(64);
  input.reconciliation.energyRating[0].canPromoteDimensions = true;
  input.fitV3Audit.entries[0].verifiedFitEligible = true;
  input.publicCatalog.products[0].fit_v3_shadow = {};
  const report = auditFitV3Pilot(input);
  assert.equal(report.passed, false);
  assert.ok(report.violations.some((row) => row.code === 'PUBLIC_PROJECTION_HASH_DRIFT'));
  assert.ok(report.violations.some((row) => row.code === 'REGISTRY_DIMENSION_PROMOTION'));
  assert.ok(report.violations.some((row) => row.code === 'FALSE_VERIFIED_FIT_ELIGIBILITY'));
  assert.ok(report.violations.some((row) => row.code === 'SHADOW_FIELD_LEAKED_PUBLIC'));
});

test('Fit V3 pilot audit rejects a frozen pilot bound to different registry snapshots', () => {
  const input = validInput();
  input.pilot.sourceSnapshotHashes = ['f'.repeat(64)];
  const report = auditFitV3Pilot(input);
  assert.ok(report.violations.some((row) => row.code === 'FROZEN_PILOT_SNAPSHOT_DRIFT'));
});
