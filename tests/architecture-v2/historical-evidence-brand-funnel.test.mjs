import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHistoricalEvidenceBrandFunnel } from '../../src/domain/historical-evidence-brand-funnel.mjs';

const SHA = 'a'.repeat(64);

function acceptedSource() {
  return {
    claims: [
      { field: 'closedEnvelope.widthMm' },
      { field: 'closedEnvelope.heightMm' },
      { field: 'closedEnvelope.depthMm' },
    ],
    verificationReceipt: { bindingSha256: SHA },
  };
}

function outcome({ targetId, brand, model, status = 'accepted', failureCode = null, candidates = [] }) {
  return {
    targetId,
    status,
    failureCode,
    candidateInventory: {
      identity: { brand, model, category: 'fridge' },
      resolvers: [],
      candidates,
    },
  };
}

function candidate({ authorityMode = 'official', status = 'accepted', source = acceptedSource(), resolvers = [] }) {
  return {
    authorityMode,
    resolverRefs: resolvers.map((resolverId) => ({ resolverId })),
    outcome: { status, source },
  };
}

function state(targetOutcomes) {
  return {
    schemaVersion: 1,
    runId: 'brand-funnel-fixture',
    batchId: 'batch-fixture',
    status: 'completed',
    completedAt: '2026-07-13T20:00:00.000Z',
    semanticOutcomeSha256: SHA,
    input: {
      batchSha256: 'b'.repeat(64),
      queueSha256: 'c'.repeat(64),
      policySha256: 'd'.repeat(64),
      toolchainSha256: 'e'.repeat(64),
    },
    targets: Object.fromEntries(targetOutcomes.map((value) => [value.targetId, {
      state: 'completed', status: value.status, outcome: value,
    }])),
  };
}

test('brand funnel groups brand casing and separates batch, core and adapter discovery', () => {
  const report = buildHistoricalEvidenceBrandFunnel(state([
    outcome({
      targetId: 'target-a', brand: 'Beko', model: 'A100',
      candidates: [candidate({
        resolvers: ['batch-candidates', 'beko-official-discovery'],
      })],
    }),
    outcome({
      targetId: 'target-b', brand: 'BEKO', model: 'B200', status: 'claims_incomplete',
      failureCode: 'source_authority',
      candidates: [candidate({
        authorityMode: 'reference', status: 'reference_only', source: null,
        resolvers: ['beko-official-discovery'],
      })],
    }),
  ]));

  assert.equal(report.summary.brands, 1);
  assert.equal(report.summary.targets, 2);
  assert.equal(report.summary.completedTargets, 2);
  assert.equal(report.brands[0].brandKey, 'beko');
  assert.equal(report.brands[0].targets, 2);
  assert.deepEqual(report.brands[0].candidateCounts, {
    total: 2,
    official: 1,
    reference: 1,
    fromBatch: 1,
    fromCoreDiscovery: 0,
    fromBrandAdapter: 2,
    brandAdapterOfficial: 1,
    brandAdapterReference: 1,
  });
  assert.deepEqual(report.brands[0].funnel, {
    targetsWithOfficialCandidate: 1,
    officialCandidatesFetched: 1,
    officialCandidatesParsed: 1,
    identityAccepted: 1,
    allAxisAccepted: 1,
    receiptAccepted: 1,
  });
  assert.deepEqual(report.brands[0].quarantinedByReason, {
    'claims_incomplete:source_authority': 1,
  });
  assert.equal(report.brands[0].officialHostCoverage, 0.5);
  assert.deepEqual(report.safety, {
    referenceCandidatesAccepted: 0,
    acceptedTargetsWithoutAllAxisReceipt: 0,
    zeroUnsafePromotion: true,
  });
});

test('brand funnel fails closed when a reference candidate carries an accepted source', () => {
  assert.throws(() => buildHistoricalEvidenceBrandFunnel(state([
    outcome({
      targetId: 'target-a', brand: 'Beko', model: 'A100',
      candidates: [candidate({ authorityMode: 'reference', resolvers: ['beko-official-discovery'] })],
    }),
  ])), /reference candidate.*accepted/i);
});

test('brand funnel rejects partial state and missing terminal outcomes', () => {
  assert.throws(() => buildHistoricalEvidenceBrandFunnel({
    ...state([]), status: 'running',
  }), /completed recovery state/i);
});
