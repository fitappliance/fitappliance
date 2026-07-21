import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalEvidenceTargetState } from '../../src/domain/historical-evidence-target-state.mjs';

function classified(referenceId, operationalClass) {
  return {
    referenceId,
    category: 'fridge',
    canonicalBrand: 'Example',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CATALOG_ARCHIVED',
    operationalClass,
    conflictState: operationalClass === 'CONFLICT_QUARANTINE' ? 'SOURCE_CONFLICT' : 'NONE',
    documentLinks: operationalClass === 'COMPLETE_RECEIPT' ? [{
      documentId: `pdf:${referenceId}`,
      receiptState: 'CURRENT_VALID',
      evidenceObjectIds: [`receipt:${referenceId}`],
    }] : [],
  };
}

function fixture() {
  const records = [
    classified('ref-1', 'COMPLETE_RECEIPT'),
    classified('ref-2', 'CONFLICT_QUARANTINE'),
    classified('ref-3', 'IDENTITY_RESEARCH'),
    classified('ref-4', 'OFFICIAL_DISCOVERY'),
    classified('ref-5', 'OFFICIAL_DISCOVERY'),
    classified('ref-6', 'OFFICIAL_DISCOVERY'),
    classified('ref-7', 'OFFICIAL_DISCOVERY'),
    classified('ref-8', 'OFFICIAL_DISCOVERY'),
  ];
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    sourceBindings: {
      classificationSha256: '1'.repeat(64),
      acquisitionQueueSha256: '2'.repeat(64),
      executableQueueSha256: '3'.repeat(64),
      acceptanceBundleSha256: '4'.repeat(64),
      attemptLedgerSha256: '5'.repeat(64),
    },
    classification: {
      schemaVersion: 1,
      records,
      summary: { records: 8, uniqueReferenceIds: 8 },
    },
    acquisitionQueue: {
      schemaVersion: 1,
      records: records.slice(1).map((record) => ({
        referenceId: record.referenceId,
        executionReadiness: record.referenceId === 'ref-2' ? 'RESEARCH_REQUIRED' : 'DISCOVERY_READY',
      })),
      summary: { queuedModels: 7 },
    },
    executableQueue: {
      schemaVersion: 2,
      evidenceProcessorEpochs: { pdf_claim_parser: 'a'.repeat(64) },
      jobs: [{ jobId: 'job-1', targetIds: ['target-4'] }],
      targets: [
        { targetId: 'target-4', referenceId: 'ref-4', candidateJobIds: ['job-1'] },
      ],
      discoveryTargets: [
        { targetId: 'target-3', referenceId: 'ref-3', candidateJobIds: [] },
        { targetId: 'target-5', referenceId: 'ref-5', candidateJobIds: [] },
        { targetId: 'target-8', referenceId: 'ref-8', candidateJobIds: [] },
      ],
      deferredTargets: [
        { targetId: 'target-2', referenceId: 'ref-2', dispositionReason: 'RESEARCH_REQUIRED' },
        { targetId: 'target-6', referenceId: 'ref-6', dispositionReason: 'ACTIVE_RESOLVER_SUPPRESSION' },
        { targetId: 'target-7', referenceId: 'ref-7', dispositionReason: 'ACTIVE_RESOLVER_SUPPRESSION' },
      ],
      summary: {
        acquisitionRecords: 7,
        targets: 4,
        acquisitionTargets: 1,
        discoveryTargets: 3,
        deferredTargets: 3,
        fetchJobs: 1,
        candidateEdges: 1,
        resolverOnlyTargets: 0,
        suppressedPriorResolverOnlyTargets: 2,
        excluded: { RESEARCH_REQUIRED: 1 },
      },
    },
    acceptanceBundle: {
      schemaVersion: 1,
      entries: [{
        targetId: 'target-1',
        referenceId: 'ref-1',
        acceptanceStatus: 'accepted',
        sources: [{ verificationReceipt: { bindingSha256: 'b'.repeat(64) } }],
      }],
    },
    attemptLedger: {
      schemaVersion: 1,
      entries: [
        {
          attemptId: 'attempt-source-terminal',
          referenceId: 'ref-5',
          status: 'identity_rejected',
          disposition: 'SEEK_ALTERNATIVE_OFFICIAL_SOURCE',
          suppressesSamePolicySource: true,
        },
        {
          attemptId: 'attempt-retryable',
          referenceId: 'ref-8',
          status: 'transport_failure',
          disposition: 'RETRY_TRANSIENT',
          suppressesSamePolicySource: false,
        },
      ],
      resolutions: [],
      targetAttempts: [
        {
          targetAttemptId: 'target-attempt-6',
          referenceId: 'ref-6',
          targetId: 'target-6',
          reason: 'complete_exhausted_candidate_inventory',
          policySha256: 'c'.repeat(64),
          resolverSetSha256: 'd'.repeat(64),
          runId: 'run-6',
          batchId: 'batch-6',
          attemptedAt: '2026-07-18T00:00:00.000Z',
        },
        {
          targetAttemptId: 'target-attempt-7',
          referenceId: 'ref-7',
          targetId: 'target-7',
          reason: 'complete_zero_candidate_inventory',
          policySha256: 'e'.repeat(64),
          resolverSetSha256: 'f'.repeat(64),
          runId: 'run-7',
          batchId: 'batch-7',
          attemptedAt: '2026-07-18T01:00:00.000Z',
        },
      ],
    },
  };
}

function byReference(state, referenceId) {
  return state.records.find((record) => record.referenceId === referenceId);
}

test('projects one auditable state for every classified model', () => {
  const state = buildHistoricalEvidenceTargetState(fixture());

  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.sourceBindings, fixture().sourceBindings);
  assert.equal(state.summary.records, 8);
  assert.equal(state.summary.actionable, 4);
  assert.equal(state.summary.completed, 1);
  assert.equal(state.summary.blocked, 3);
  assert.deepEqual(state.summary.byState, {
    BLOCKED_SAME_EPOCH: 1,
    CANDIDATE_READY: 1,
    CONFLICT_QUARANTINE: 1,
    DIMENSIONS_RECEIPT: 1,
    IDENTITY_RESEARCH: 1,
    NO_OFFICIAL_SOURCE: 1,
    RETRYABLE: 1,
    SOURCE_DISCOVERY_REQUIRED: 1,
  });
  assert.equal(byReference(state, 'ref-1').binding.type, 'receipt');
  assert.deepEqual(byReference(state, 'ref-1').binding.receiptIds, ['receipt:ref-1']);
  assert.equal(byReference(state, 'ref-4').state, 'CANDIDATE_READY');
  assert.equal(byReference(state, 'ref-8').state, 'RETRYABLE');
});

test('keeps a model discoverable when only one candidate source is terminal', () => {
  const state = buildHistoricalEvidenceTargetState(fixture());
  const sourceTerminal = byReference(state, 'ref-5');

  assert.equal(sourceTerminal.state, 'SOURCE_DISCOVERY_REQUIRED');
  assert.equal(sourceTerminal.actionable, true);
  assert.equal(sourceTerminal.terminal, false);
  assert.deepEqual(sourceTerminal.sourceAttemptSummary, {
    activeRetryable: 0,
    activeTerminal: 1,
    resolved: 0,
  });
});

test('binds only complete target inventory terminals and records accurate reopening conditions', () => {
  const state = buildHistoricalEvidenceTargetState(fixture());
  const exhausted = byReference(state, 'ref-6');
  const noSource = byReference(state, 'ref-7');

  assert.equal(exhausted.state, 'BLOCKED_SAME_EPOCH');
  assert.equal(exhausted.binding.policySha256, 'c'.repeat(64));
  assert.equal(exhausted.binding.runId, 'run-6');
  assert.deepEqual(exhausted.reopeningConditions, [
    'EXPLICIT_OFFICIAL_CANDIDATE_ADDED',
    'POLICY_CHANGED',
    'PROCESSOR_EPOCH_CHANGED',
    'RESOLVER_CONTRACT_CHANGED',
  ]);
  assert.equal(noSource.state, 'NO_OFFICIAL_SOURCE');
  assert.deepEqual(noSource.reopeningConditions, ['EXPLICIT_OFFICIAL_CANDIDATE_ADDED']);
});

test('an executable target outranks a stale target-level terminal attempt', () => {
  const input = fixture();
  input.executableQueue.discoveryTargets.push({
    targetId: 'target-6', referenceId: 'ref-6', candidateJobIds: [],
  });
  input.executableQueue.deferredTargets = input.executableQueue.deferredTargets
    .filter((target) => target.referenceId !== 'ref-6');
  input.executableQueue.summary.targets += 1;
  input.executableQueue.summary.discoveryTargets += 1;
  input.executableQueue.summary.deferredTargets -= 1;
  input.executableQueue.summary.suppressedPriorResolverOnlyTargets -= 1;

  const state = buildHistoricalEvidenceTargetState(input);
  assert.equal(byReference(state, 'ref-6').state, 'SOURCE_DISCOVERY_REQUIRED');
  assert.equal(byReference(state, 'ref-6').actionable, true);
});

test('pending acquisition work does not release a conflict-quarantined model for publication', () => {
  const input = fixture();
  input.executableQueue.jobs.push({ jobId: 'job-2', targetIds: ['target-2'] });
  input.executableQueue.targets.push({
    targetId: 'target-2', referenceId: 'ref-2', candidateJobIds: ['job-2'],
  });
  input.executableQueue.deferredTargets = input.executableQueue.deferredTargets
    .filter((target) => target.referenceId !== 'ref-2');
  input.executableQueue.summary.targets += 1;
  input.executableQueue.summary.acquisitionTargets += 1;
  input.executableQueue.summary.deferredTargets -= 1;
  input.executableQueue.summary.fetchJobs += 1;
  input.executableQueue.summary.candidateEdges += 1;
  delete input.executableQueue.summary.excluded.RESEARCH_REQUIRED;

  const conflict = byReference(buildHistoricalEvidenceTargetState(input), 'ref-2');
  assert.equal(conflict.state, 'CONFLICT_QUARANTINE');
  assert.equal(conflict.stateClass, 'BLOCKED');
  assert.equal(conflict.actionable, true);
  assert.equal(conflict.terminal, true);
  assert.equal(conflict.binding.pendingWork.type, 'executable_queue');
  assert.equal(buildHistoricalEvidenceTargetState(input).summary.actionableBlockedOverlap, 1);
  assert.deepEqual(conflict.reopeningConditions, ['CONFLICT_CLOSURE_DECISION_ACCEPTED']);
});

test('a later target failure cannot weaken an accepted receipt', () => {
  const input = fixture();
  input.attemptLedger.targetAttempts.push({
    targetAttemptId: 'target-attempt-after-receipt',
    referenceId: 'ref-1',
    targetId: 'target-1',
    reason: 'complete_exhausted_candidate_inventory',
    policySha256: '1'.repeat(64),
    resolverSetSha256: '2'.repeat(64),
    runId: 'run-after-receipt',
    batchId: 'batch-after-receipt',
    attemptedAt: '2026-07-19T01:00:00.000Z',
  });

  const completed = byReference(buildHistoricalEvidenceTargetState(input), 'ref-1');
  assert.equal(completed.state, 'DIMENSIONS_RECEIPT');
  assert.equal(completed.stateClass, 'COMPLETED');
  assert.equal(completed.binding.type, 'receipt');
});

test('rebuilds deterministically from repeated append-only target attempts', () => {
  const input = fixture();
  input.attemptLedger.targetAttempts.push({
    ...input.attemptLedger.targetAttempts[0],
    targetAttemptId: 'target-attempt-6-newer',
    policySha256: '3'.repeat(64),
    runId: 'run-6-newer',
    attemptedAt: '2026-07-19T02:00:00.000Z',
  });

  const first = buildHistoricalEvidenceTargetState(input);
  const second = buildHistoricalEvidenceTargetState(structuredClone(input));
  assert.deepEqual(second, first);
  assert.equal(byReference(first, 'ref-6').binding.targetAttemptId, 'target-attempt-6-newer');
  assert.equal(byReference(first, 'ref-6').binding.policySha256, '3'.repeat(64));
});

test('fails closed when an accepted receipt classification has no receipt binding', () => {
  const input = fixture();
  input.classification.records[0].documentLinks[0].evidenceObjectIds = [];

  assert.throws(
    () => buildHistoricalEvidenceTargetState(input),
    /current receipt binding missing/,
  );
});

test('fails closed when actionable state and executable queue accounting drift', () => {
  const input = fixture();
  input.executableQueue.summary.targets = 5;

  assert.throws(
    () => buildHistoricalEvidenceTargetState(input),
    /executable target accounting mismatch/,
  );
});

test('fails closed on a malformed cumulative target attempt', () => {
  const input = fixture();
  input.attemptLedger.targetAttempts[0].attemptedAt = 'not-a-date';

  assert.throws(
    () => buildHistoricalEvidenceTargetState(input),
    /target attempt attemptedAt invalid/,
  );
});

test('fails closed when an exact upstream byte binding is missing or malformed', () => {
  const missing = fixture();
  delete missing.sourceBindings.acceptanceBundleSha256;
  assert.throws(
    () => buildHistoricalEvidenceTargetState(missing),
    /acceptance bundle source SHA-256 required/,
  );

  const malformed = fixture();
  malformed.sourceBindings.attemptLedgerSha256 = 'not-a-sha';
  assert.throws(
    () => buildHistoricalEvidenceTargetState(malformed),
    /attempt ledger source SHA-256 invalid/,
  );
});
