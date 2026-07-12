import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';

const acceptance = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json', import.meta.url),
  'utf8',
));

test('real accepted PDF receipt projects only its approved fields and preserves unknown installation', () => {
  const row = acceptance.outcomes.find((outcome) => outcome.brand === 'Bosch');
  const projected = projectEvidenceGeometry({
    brand: row.brand, model: row.model, category: row.category, sources: [row.source],
  });
  assert.deepEqual(projected.geometry.closedEnvelope, {
    widthMm: 598, heightMm: { minimumMm: 845, maximumMm: 845 }, depthMm: 590,
  });
  assert.deepEqual(projected.geometry.installation, {
    leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null,
  });
  assert.equal(projected.evidenceLevel, 'dimensions');
  assert.equal(projected.requiredInstallationEnvelope, null);
  assert.equal(projected.successfulFitOutcome, 'INSUFFICIENT_DATA');
  assert.equal(projected.verifiedFitEligible, false);
  assert.ok(projected.missingForVerifiedFit.includes('installation.leftMm'));
  assert.ok(projected.missingForVerifiedFit.includes('service.rearServicesMm'));
  assert.ok(projected.fieldEvidence['closedEnvelope.widthMm'].receiptBindingSha256);
});

test('projector keeps adjustable height and separates placement, operation, and service fields', () => {
  const source = {
    contentSha256: 'a'.repeat(64), sourceUrl: 'https://www.haier.com.au/HDW15F4B1.pdf',
    verificationReceipt: { bindingSha256: 'b'.repeat(64) },
    claims: [
      { field: 'closedEnvelope.widthMm', value: 597 },
      { field: 'closedEnvelope.heightMm', value: { minimumMm: 850, maximumMm: 895 } },
      { field: 'closedEnvelope.depthMm', value: 599 },
      { field: 'installation.leftMm', value: 5 },
      { field: 'installation.rightMm', value: 5 },
      { field: 'installation.topMm', value: 10 },
      { field: 'installation.rearMm', value: 20 },
      { field: 'installation.frontMm', value: 600 },
      { field: 'operation.doorOpenDepthMm', value: 1199 },
      { field: 'service.rearServicesMm', value: 50 },
    ],
  };
  const projected = projectEvidenceGeometry({
    brand: 'Haier', model: 'HDW15F4B1', category: 'dishwasher', sources: [source],
  }, { verifyReceipt: () => true });
  assert.deepEqual(projected.geometry.closedEnvelope.heightMm, { minimumMm: 850, maximumMm: 895 });
  assert.equal(projected.geometry.operation.doorOpenDepthMm, 1199);
  assert.equal(projected.geometry.service.rearServicesMm, 50);
  assert.deepEqual(projected.requiredInstallationEnvelope, { widthMm: 607, heightMm: 905, depthMm: 649 });
  assert.equal(projected.evidenceLevel, 'verified');
  assert.equal(projected.successfulFitOutcome, 'VERIFIED_FIT');
  assert.equal(projected.verifiedFitEligible, true);
  assert.deepEqual(projected.missingForVerifiedFit, []);
});

test('projector rejects conflicting active receipts instead of choosing a convenient value', () => {
  const makeSource = (hash, width) => ({
    contentSha256: hash.repeat(64), sourceUrl: `https://www.smeg.com.au/${hash}.pdf`,
    verificationReceipt: { bindingSha256: hash.repeat(64) },
    claims: [{ field: 'closedEnvelope.widthMm', value: width }],
  });
  assert.throws(() => projectEvidenceGeometry({
    brand: 'Smeg', model: 'DWAU615DB3', category: 'dishwasher',
    sources: [makeSource('a', 598), makeSource('b', 600)],
  }, { verifyReceipt: () => true }), /conflicting active evidence/i);
});

test('top-loading washer cannot become verified without lid-open operating height', () => {
  const fields = {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 1000,
    'closedEnvelope.depthMm': 650,
    'installation.leftMm': 5,
    'installation.rightMm': 5,
    'installation.topMm': 20,
    'installation.rearMm': 40,
    'service.rearServicesMm': 50,
  };
  const source = {
    contentSha256: 'c'.repeat(64), sourceUrl: 'https://www.haier.com.au/HWT10AN1.pdf',
    verificationReceipt: { bindingSha256: 'd'.repeat(64) },
    claims: Object.entries(fields).map(([field, value]) => ({ field, value })),
  };
  const projected = projectEvidenceGeometry({
    brand: 'Haier', model: 'HWT10AN1', category: 'washing_machine', formFactor: 'top_loader', sources: [source],
  }, { verifyReceipt: () => true });
  assert.equal(projected.evidenceLevel, 'dimensions');
  assert.equal(projected.successfulFitOutcome, 'CONDITIONAL_FIT');
  assert.deepEqual(projected.missingForVerifiedFit, ['operation.lidOpenHeightMm']);
});

test('same-value corroborating receipts project deterministically regardless of source order', () => {
  const makeSource = (hash) => ({
    contentSha256: hash.repeat(64), sourceUrl: `https://www.smeg.com.au/${hash}.pdf`,
    verificationReceipt: { bindingSha256: hash.repeat(64) },
    claims: [{ field: 'closedEnvelope.widthMm', value: 598 }],
  });
  const input = { brand: 'Smeg', model: 'DWAU615DB3', category: 'dishwasher' };
  const first = projectEvidenceGeometry({ ...input, sources: [makeSource('b'), makeSource('a')] }, { verifyReceipt: () => true });
  const second = projectEvidenceGeometry({ ...input, sources: [makeSource('a'), makeSource('b')] }, { verifyReceipt: () => true });
  assert.deepEqual(first, second);
  assert.equal(first.fieldEvidence['closedEnvelope.widthMm'].contentSha256, 'a'.repeat(64));
  assert.equal(first.fieldEvidence['closedEnvelope.widthMm'].corroborating.length, 1);
});
