import test from 'node:test';
import assert from 'node:assert/strict';

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
