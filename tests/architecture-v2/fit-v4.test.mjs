import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFitV4, resolveEvidenceLevel } from '../../src/domain/fit-v4.mjs';

function geometry({
  category = 'fridge',
  formFactor = null,
  closedEnvelope = {},
  installation = {},
  operation = {},
  service = {},
} = {}) {
  return {
    category,
    formFactor,
    closedEnvelope: {
      widthMm: 600,
      heightMm: { minimumMm: 1700, maximumMm: 1700 },
      depthMm: 650,
      ...closedEnvelope,
    },
    installation: {
      leftMm: 5,
      rightMm: 5,
      topMm: 20,
      rearMm: 10,
      frontMm: null,
      ...installation,
    },
    operation: {
      doorOpenDepthMm: null,
      hingeSideSpaceMm: null,
      lidOpenHeightMm: null,
      ...operation,
    },
    service: {
      plumbingRearMm: null,
      rearServicesMm: null,
      rearVentilationMm: null,
      ...service,
    },
  };
}

function receiptEvidence(
  fields = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
    'installation.leftMm',
    'installation.rightMm',
    'installation.topMm',
    'installation.rearMm',
  ],
  { evidenceLevel = 'verified', identityOutcome = 'exact' } = {},
) {
  return {
    evidenceLevel,
    identityOutcome,
    fieldEvidence: Object.fromEntries(fields.map((field) => [field, {
      contentSha256: 'a'.repeat(64),
      receiptBindingSha256: 'b'.repeat(64),
      sourceUrl: 'https://manufacturer.example/manual.pdf',
    }])),
  };
}

const cavity = { widthMm: 620, heightMm: 1720, depthMm: 680 };

test('keeps size matching while evidence-incomplete products are INSUFFICIENT_DATA', () => {
  const result = evaluateFitV4({ geometry: geometry(), cavity, evidence: null });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.deepEqual(result.sizeMatch.statuses, { width: 'PASS', height: 'PASS', depth: 'PASS' });
  assert.deepEqual(result.sizeMatch.gapsMm, { width: 20, height: 20, depth: 30 });
  assert.equal(result.evidenceLevel, 'none');
  assert.notEqual(result.outcome, 'VERIFIED_FIT');
});

test('preserves a hard dimensional conflict as NO_FIT without upgrading evidence', () => {
  const result = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { widthMm: 700 } }),
    cavity,
    evidence: null,
  });

  assert.equal(result.outcome, 'NO_FIT');
  assert.equal(result.sizeMatch.statuses.width, 'FAIL');
  assert.notEqual(result.outcome, 'VERIFIED_FIT');
});

test('legacy verified labels cannot authorize VERIFIED_FIT', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity,
    evidence: { trust_level: 'verified_fit', clearance_verified: true },
  });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.evidenceLevel, 'none');
});

test('receipt-bound exact-model evidence is the only positive verified gate', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity,
    evidence: receiptEvidence(),
  });

  assert.equal(result.outcome, 'VERIFIED_FIT');
  assert.equal(result.evidenceLevel, 'verified');
  assert.deepEqual(result.sizeMatch.statuses, { width: 'PASS', height: 'PASS', depth: 'PASS' });
});

test('verified evidence without exact-model identity stays insufficient', () => {
  const evidence = receiptEvidence();
  delete evidence.identityOutcome;

  const result = evaluateFitV4({ geometry: geometry(), cavity, evidence });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.evidenceLevel, 'none');
});

test('malformed HTTPS source URLs cannot authorize receipt-bound evidence', () => {
  const evidence = receiptEvidence();
  evidence.fieldEvidence['closedEnvelope.widthMm'].sourceUrl = 'https://';

  const result = evaluateFitV4({ geometry: geometry(), cavity, evidence });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.evidenceLevel, 'none');
});

test('missing applicable installation evidence cannot produce VERIFIED_FIT', () => {
  const result = evaluateFitV4({
    geometry: geometry({ installation: { rearMm: null } }),
    cavity,
    evidence: receiptEvidence([
      'closedEnvelope.widthMm',
      'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
      'installation.leftMm',
      'installation.rightMm',
      'installation.topMm',
    ]),
  });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.notEqual(result.evidenceLevel, 'verified');
});

test('applicable UNKNOWN advisory checks override a verified evidence level', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity,
    evidence: receiptEvidence(),
    advisoryChecks: [{ id: 'door_open_space', applicable: true, status: 'UNKNOWN' }],
  });

  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
});

test('non-applicable UNKNOWN advisory checks do not block VERIFIED_FIT', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity,
    evidence: receiptEvidence(),
    advisoryChecks: [{ id: 'door_open_space', applicable: false, status: 'UNKNOWN' }],
  });

  assert.equal(result.outcome, 'VERIFIED_FIT');
});

test('invalid cavity values remain UNKNOWN instead of becoming zero or a fit', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 0, heightMm: -1, depthMm: '680' },
    evidence: receiptEvidence(),
  });

  assert.deepEqual(result.sizeMatch.statuses, { width: 'UNKNOWN', height: 'UNKNOWN', depth: 'UNKNOWN' });
  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
});

test('inverted or incomplete height ranges remain UNKNOWN', () => {
  const inverted = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { heightMm: { minimumMm: 1800, maximumMm: 1700 } } }),
    cavity,
    evidence: receiptEvidence(),
  });
  const incomplete = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { heightMm: { minimumMm: 1700 } } }),
    cavity,
    evidence: receiptEvidence(),
  });

  assert.equal(inverted.sizeMatch.statuses.height, 'UNKNOWN');
  assert.equal(inverted.outcome, 'INSUFFICIENT_DATA');
  assert.equal(incomplete.sizeMatch.statuses.height, 'UNKNOWN');
  assert.equal(incomplete.outcome, 'INSUFFICIENT_DATA');
});

test('resolveEvidenceLevel keeps the gate reusable and fail-closed', () => {
  assert.equal(resolveEvidenceLevel(geometry(), receiptEvidence()), 'verified');
  assert.equal(resolveEvidenceLevel(geometry(), { evidenceLevel: 'verified' }), 'none');
});

test('returns a deeply frozen result without mutating inputs', () => {
  const sourceGeometry = geometry();
  const sourceCavity = structuredClone(cavity);
  const sourceEvidence = receiptEvidence();
  const snapshot = structuredClone({ sourceGeometry, sourceCavity, sourceEvidence });

  const result = evaluateFitV4({
    geometry: sourceGeometry,
    cavity: sourceCavity,
    evidence: sourceEvidence,
  });

  assert.deepEqual({ sourceGeometry, sourceCavity, sourceEvidence }, snapshot);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sizeMatch), true);
  assert.equal(Object.isFrozen(result.checks), true);
});
