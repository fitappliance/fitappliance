import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { auditPublicFitProjection } from '../../src/domain/geometry-publication.mjs';

test('publication audit rejects verified labels without receipt-bound geometry', () => {
  const audit = auditPublicFitProjection({ products: [{
    id: 'legacy', cat: 'fridge', evidence: { trust_level: 'verified_fit', clearance_verified: true },
  }] });
  assert.equal(audit.summary.violations, 1);
  assert.deepEqual(audit.violations[0].reasons, [
    'clearance_verified_without_receipt_bound_geometry',
    'verified_fit_without_receipt_bound_geometry',
  ]);
});

test('publication audit accepts honest dimensions-only rows', () => {
  const audit = auditPublicFitProjection({ products: [{
    id: 'dimensions', cat: 'fridge', evidence: { trust_level: 'dimensions_verified', clearance_verified: false },
  }] });
  assert.equal(audit.summary.violations, 0);
});

test('publication audit rejects stale legacy dimensions and fit fields beside receipt-bound geometry', () => {
  const product = JSON.parse(readFileSync(
    'data/architecture-v2/generated/public-catalog-projection.json',
    'utf8',
  )).products.find((row) => row.id === 'fridge-arf2944');
  const tampered = structuredClone(product);
  tampered.w = 1782;
  tampered.h = 913;
  tampered.dimensions = { ...(tampered.dimensions ?? {}), door_open_90_depth_mm: 999 };
  tampered.clearance_requirements = { ...(tampered.clearance_requirements ?? {}), left_mm: 5 };
  tampered.flags = {
    ...(tampered.flags ?? {}),
    requires_plumbing: false,
    ventilation_required: true,
  };

  const audit = auditPublicFitProjection({ products: [tampered] });
  assert.deepEqual(audit.violations[0].reasons, [
    'legacy_clearance_drift_from_receipt_bound_geometry',
    'legacy_dimension_drift_from_receipt_bound_geometry',
    'legacy_door_open_drift_from_receipt_bound_geometry',
    'legacy_fit_flag_without_receipt_bound_evidence',
  ]);
});

test('committed publication integrates both receipt batches without false verified fit', () => {
  const audit = JSON.parse(readFileSync(
    'data/architecture-v2/reviews/automated/fit-publication-audit.json',
    'utf8',
  ));
  assert.deepEqual(audit.summary, {
    products: 3521,
    receiptBoundVerified: 0,
    receiptBoundDimensions: 21,
    violations: 0,
  });
});
