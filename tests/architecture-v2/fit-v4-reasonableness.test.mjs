import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFitV4 } from '../../src/domain/fit-v4.mjs';

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

function receiptEvidence() {
  const fields = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
    'installation.leftMm',
    'installation.rightMm',
    'installation.topMm',
    'installation.rearMm',
  ];
  return {
    evidenceLevel: 'verified',
    identityOutcome: 'exact',
    fieldEvidence: Object.fromEntries(fields.map((field) => [field, {
      contentSha256: 'a'.repeat(64),
      receiptBindingSha256: 'b'.repeat(64),
      sourceUrl: 'https://manufacturer.example/manual.pdf',
    }])),
  };
}

function outcomeRank(outcome) {
  return {
    NO_FIT: 0,
    INSUFFICIENT_DATA: 1,
    CONDITIONAL_FIT: 1,
    LIKELY_FIT_ESTIMATED: 1,
    VERIFIED_FIT: 2,
  }[outcome] ?? -1;
}

function assertInsufficientIsExplainable(result) {
  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  const hasUnknownCheck = result.checks.some((check) => check.status === 'UNKNOWN');
  const evidenceIsIncomplete = result.evidenceLevel !== 'verified';
  assert.ok(hasUnknownCheck || evidenceIsIncomplete);
}

test('exact closed-envelope equality passes and a one-millimetre excess fails', () => {
  const exact = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { widthMm: 620 } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });
  const excess = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { widthMm: 621 } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });

  assert.equal(exact.sizeMatch.statuses.width, 'PASS');
  assert.equal(excess.sizeMatch.statuses.width, 'FAIL');
  assert.equal(excess.outcome, 'NO_FIT');
});

test('installation uses the maximum applicable rear requirement', () => {
  const result = evaluateFitV4({
    geometry: geometry({
      category: 'dishwasher',
      installation: { rearMm: 10 },
      service: { rearServicesMm: 30 },
    }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 679 },
    evidence: null,
  });

  assert.equal(result.sizeMatch.statuses.depth, 'PASS');
  assert.equal(result.checks.find((check) => check.id === 'installation_depth').requiredMm, 680);
  assert.equal(result.outcome, 'NO_FIT');
});

test('closed-envelope size passing does not hide an installation failure', () => {
  const result = evaluateFitV4({
    geometry: geometry({ installation: { leftMm: 15, rightMm: 15 } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });

  assert.equal(result.sizeMatch.statuses.width, 'PASS');
  assert.equal(result.checks.find((check) => check.id === 'installation_width').status, 'FAIL');
  assert.equal(result.outcome, 'NO_FIT');
});

test('front operation space is not silently added to the closed depth envelope', () => {
  const result = evaluateFitV4({
    geometry: geometry({
      installation: { rearMm: 0, frontMm: 100 },
      operation: { doorOpenDepthMm: 1000 },
    }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 650 },
    evidence: null,
  });

  assert.equal(result.sizeMatch.statuses.depth, 'PASS');
  assert.equal(result.checks.find((check) => check.id === 'installation_depth').requiredMm, 650);
  assertInsufficientIsExplainable(result);
});

test('an unknown axis stays UNKNOWN and explains INSUFFICIENT_DATA', () => {
  const result = evaluateFitV4({
    geometry: geometry({ closedEnvelope: { heightMm: null } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: receiptEvidence(),
  });

  assert.equal(result.sizeMatch.statuses.height, 'UNKNOWN');
  assert.equal(result.checks.find((check) => check.id === 'installation_height').status, 'UNKNOWN');
  assertInsufficientIsExplainable(result);
});

test('an applicable unknown operation check blocks verified fit', () => {
  const result = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: receiptEvidence(),
    advisoryChecks: [{ id: 'door_open_space', applicable: true, status: 'UNKNOWN' }],
  });

  const check = result.checks.find((entry) => entry.id === 'door_open_space');
  assert.deepEqual(check, { id: 'door_open_space', applicable: true, status: 'UNKNOWN' });
  assertInsufficientIsExplainable(result);
});

test('larger cavities cannot worsen the fit outcome', () => {
  const small = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 610, heightMm: 1710, depthMm: 670 },
    evidence: null,
  });
  const large = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 630, heightMm: 1730, depthMm: 690 },
    evidence: null,
  });

  assert.ok(outcomeRank(large.outcome) >= outcomeRank(small.outcome));
});

test('larger installation clearances cannot improve the fit outcome', () => {
  const smallerClearance = evaluateFitV4({
    geometry: geometry({ installation: { leftMm: 0, rightMm: 0, topMm: 0, rearMm: 0 } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });
  const largerClearance = evaluateFitV4({
    geometry: geometry({ installation: { leftMm: 15, rightMm: 15, topMm: 30, rearMm: 30 } }),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });

  assert.ok(outcomeRank(largerClearance.outcome) <= outcomeRank(smallerClearance.outcome));
});

test('removing receipt-bound evidence cannot promote an outcome', () => {
  const verified = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: receiptEvidence(),
  });
  const withoutEvidence = evaluateFitV4({
    geometry: geometry(),
    cavity: { widthMm: 620, heightMm: 1720, depthMm: 680 },
    evidence: null,
  });

  assert.equal(verified.outcome, 'VERIFIED_FIT');
  assert.ok(outcomeRank(withoutEvidence.outcome) <= outcomeRank(verified.outcome));
  assertInsufficientIsExplainable(withoutEvidence);
});
