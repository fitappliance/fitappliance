import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGeometry, auditImpossibleGeometry } from '../../src/domain/geometry-migration.mjs';

const product = { cat: 'fridge', w: 900, h: 1780, d: 700 };
const evidence = (field, value, status = 'approved') => ({ field, value, status, unit: 'mm', sourceDocumentId: 'doc_1' });

test('migrates clearance only from approved field evidence and keeps estimates separate', () => {
  const result = migrateGeometry({
    legacyProduct: product,
    fieldEvidence: [evidence('installation.rearMm', 50), evidence('installation.topMm', 20, 'candidate')],
    estimates: { topMm: 20, rearMm: 10 }, formFactor: 'upright',
  });
  assert.equal(result.geometry.installation.rearMm, 50);
  assert.equal(result.geometry.installation.topMm, null);
  assert.deepEqual(result.estimates, { topMm: 20, rearMm: 10 });
  assert.equal(result.provenance.closedEnvelope, 'legacy_unverified');
});

test('conflicting approved facts quarantine migration instead of choosing one', () => {
  assert.throws(() => migrateGeometry({
    legacyProduct: product, fieldEvidence: [evidence('installation.rearMm', 30), evidence('installation.rearMm', 50)], estimates: {},
  }), /conflicting approved evidence/i);
});

test('impossible-value audit reports physical outliers without changing values', () => {
  const result = migrateGeometry({ legacyProduct: { ...product, w: 9000 }, fieldEvidence: [], estimates: {} });
  const audit = auditImpossibleGeometry(result.geometry);
  assert.ok(audit.includes('closedEnvelope.widthMm_out_of_range'));
  assert.equal(result.geometry.closedEnvelope.widthMm, 9000);
});
