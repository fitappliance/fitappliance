import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

import {
  applyAcceptanceReceiptReplayAudit,
  applyHistoricalPdfImageAudit,
  applyRecoveryAttemptConflicts,
  buildCurrentReceiptIndex,
  deriveHistoricalModelEvidenceClassificationGeneratedAt,
  receiptDocumentLink,
} from '../../scripts/architecture-v2/build-historical-model-evidence-classification.mjs';

const HASH = 'a'.repeat(64);

test('classification generation time is the latest bound input time, never wall clock time', () => {
  assert.equal(deriveHistoricalModelEvidenceClassificationGeneratedAt({
    historicalReference: { generatedAt: '2026-07-12T12:40:00.000Z' },
    legacyAudit: { generatedAt: '2026-07-15T14:53:39.566Z' },
    acceptanceBundle: { generatedAt: '2026-07-19T19:19:53.552Z' },
    acceptanceReceiptReplayAudit: { generatedAt: '2026-07-19T19:32:08.439Z' },
    recoveryAttemptLedger: { generatedAt: '2026-07-19T20:00:00.000Z' },
  }), '2026-07-19T20:00:00.000Z');
  assert.throws(
    () => deriveHistoricalModelEvidenceClassificationGeneratedAt({}),
    /timestamp/i,
  );
});

test('only unresolved target-level reconciliation conflicts enter classification quarantine', () => {
  const conflictAttempt = {
    targetAttemptId: 'target-attempt-conflict',
    targetId: 'target-one',
    referenceId: 'ref-one',
    status: 'conflict_quarantined',
    failureCode: 'conflict',
    reason: 'complete_conflicting_candidate_inventory',
  };
  const conflicts = new Map();
  const active = applyRecoveryAttemptConflicts({
    conflictsByReference: conflicts,
    attemptLedger: {
      schemaVersion: 1,
      targetAttempts: [conflictAttempt],
      targetAttemptResolutions: [],
    },
  });
  assert.equal(active.applied, 1);
  assert.equal(conflicts.get('ref-one'), 'SOURCE_CONFLICT');

  const resolved = new Map();
  const result = applyRecoveryAttemptConflicts({
    conflictsByReference: resolved,
    attemptLedger: {
      schemaVersion: 1,
      targetAttempts: [conflictAttempt],
      targetAttemptResolutions: [{
        targetAttemptResolutionId: 'resolution-one',
        targetAttemptId: conflictAttempt.targetAttemptId,
      }],
    },
  });
  assert.equal(result.applied, 0);
  assert.equal(resolved.has('ref-one'), false);
});

function source(model) {
  return {
    contentSha256: HASH,
    identity: { outcome: 'exact', model },
    claims: [],
  };
}

test('receipt index preserves multiple exact models sharing one official PDF', () => {
  const index = buildCurrentReceiptIndex({
    acceptanceBundle: {
      entries: [
        { referenceId: 'ref-1', sources: [source('MODEL-1')] },
        { referenceId: 'ref-2', sources: [source('MODEL-2')] },
      ],
    },
    referenceByExactKey: new Map(),
  });

  assert.deepEqual(index.get(HASH).map((entry) => entry.entry.referenceId), ['ref-1', 'ref-2']);
});

test('legacy acceptance is indexed only while its source hash remains active in public projection', () => {
  const referenceByExactKey = new Map([
    ['fridge\0EXAMPLE\0MODEL1', { referenceId: 'ref-1' }],
    ['fridge\0EXAMPLE\0MODEL2', { referenceId: 'ref-2' }],
  ]);
  const result = (model) => ({
    outcome: 'accepted', receipt: 'passed', identity: 'exact',
    category: 'fridge', brand: 'Example', model, source: source(model),
  });
  const active = buildCurrentReceiptIndex({
    acceptanceBundle: { entries: [] },
    legacyAcceptanceResults: [{ outcomes: [result('MODEL1'), result('MODEL2')] }],
    publicProducts: [{ geometry_v2_provenance: { activeSourceHashes: [HASH] } }],
    referenceByExactKey,
  });
  assert.deepEqual(active.get(HASH).map((entry) => entry.entry.referenceId), ['ref-1', 'ref-2']);

  const stale = buildCurrentReceiptIndex({
    acceptanceBundle: { entries: [] },
    legacyAcceptanceResults: [{ outcomes: [result('MODEL1')] }],
    publicProducts: [{ geometry_v2_provenance: { activeSourceHashes: [] } }],
    referenceByExactKey,
  });
  assert.equal(stale.size, 0);
});

test('new cumulative receipt creates a classification document without legacy audit membership', () => {
  const link = receiptDocumentLink({
    entry: { referenceId: 'ref-1' },
    source: {
      ...source('MODEL-1'),
      sourceUrl: 'https://example.com/model-1.pdf',
      objectPath: `evidence/web/sha256/aa/aa/${HASH}.pdf`,
      derivedArtifact: { objectPath: 'evidence/derived/mineru-json/example.json' },
      verificationReceipt: { bindingSha256: 'b'.repeat(64) },
      claims: [
        { field: 'closedEnvelope.widthMm', value: 600 },
        { field: 'closedEnvelope.heightMm', value: { kind: 'range', minMm: 820, maxMm: 880 } },
        { field: 'closedEnvelope.depthMm', value: 570 },
      ],
    },
  });

  assert.equal(link.documentId, `pdf:${HASH}`);
  assert.equal(link.corpusState, 'RECEIPT_BOUND');
  assert.equal(link.extractionState, 'ALL_AXIS_RANGE');
  assert.ok(link.evidenceObjectIds.includes(`receipt:${'b'.repeat(64)}`));
});

test('hybrid audit failures override legacy exact-model assumptions without weakening receipts', () => {
  const auditHash = 'c'.repeat(64);
  const unresolvedHash = 'd'.repeat(64);
  const conflictHash = 'e'.repeat(64);
  const receiptHash = 'f'.repeat(64);
  const hybridRepairHash = '3'.repeat(64);
  const profileConflictHash = '4'.repeat(64);
  const independentHash = '5'.repeat(64);
  const hybridHash = '2'.repeat(64);
  const link = (hash, receiptState = 'NONE') => ({
    documentId: `pdf:${hash}`,
    sourcePdfSha256: hash,
    evidenceObjectIds: [`storage:${hash}.pdf`],
    reasonCodes: ['PHYSICAL_PDF_HASH_BOUND'],
    corpusState: receiptState === 'CURRENT_VALID' ? 'RECEIPT_BOUND' : 'CURRENT_MINERU',
    sourceAuthority: 'OFFICIAL',
    identityScope: 'EXACT_MODEL',
    extractionState: 'PARSER_GAP',
    receiptState,
  });
  const links = new Map([
    ['ref-unresolved', new Map([[`pdf:${unresolvedHash}`, link(unresolvedHash)]])],
    ['ref-conflict', new Map([[`pdf:${conflictHash}`, link(conflictHash)]])],
    ['ref-receipt', new Map([[`pdf:${receiptHash}`, link(receiptHash, 'CURRENT_VALID')]])],
    ['ref-hybrid-repair', new Map([[`pdf:${hybridRepairHash}`, link(hybridRepairHash)]])],
    ['ref-profile-conflict', new Map([[`pdf:${profileConflictHash}`, link(profileConflictHash)]])],
    ['ref-independent', new Map([[`pdf:${independentHash}`, link(independentHash)]])],
  ]);
  const outcomes = [
    {
      referenceId: 'ref-unresolved', sourcePdfSha256: unresolvedHash,
      decision: 'IDENTITY_SCOPE_UNRESOLVED', failureCode: 'IDENTITY_SCOPE_UNRESOLVED',
      evidenceBinding: {
        sourcePdfSha256: unresolvedHash,
        primaryContentSha256: '1'.repeat(64),
        hybridContentSha256: hybridHash,
        profileId: 'hybrid-image-high-v1',
        processedPages: [1],
      },
    },
    {
      referenceId: 'ref-conflict', sourcePdfSha256: conflictHash,
      decision: 'DIMENSION_CONFLICT_QUARANTINE', extractionStatus: 'extracted',
      dimensionsMm: { width: 600, height: 850, depth: 670 },
    },
    {
      referenceId: 'ref-receipt', sourcePdfSha256: receiptHash,
      decision: 'IDENTITY_SCOPE_UNRESOLVED', failureCode: 'IDENTITY_SCOPE_UNRESOLVED',
    },
    {
      referenceId: 'ref-hybrid-repair', sourcePdfSha256: hybridRepairHash,
      decision: 'HYBRID_REPAIR_REQUIRED', failureCode: 'HYBRID_REPAIR_REQUIRED',
    },
    {
      referenceId: 'ref-profile-conflict', sourcePdfSha256: profileConflictHash,
      decision: 'PROFILE_DIMENSION_CONFLICT', failureCode: 'PROFILE_DIMENSION_CONFLICT',
    },
    {
      referenceId: 'ref-independent', sourcePdfSha256: independentHash,
      decision: 'INDEPENDENT_CORROBORATION_REQUIRED', extractionStatus: 'extracted',
      dimensionsMm: { width: 600, height: 845, depth: 600 },
      evidenceBinding: {
        sourcePdfSha256: independentHash,
        primaryContentSha256: '6'.repeat(64),
        hybridContentSha256: null,
        profileId: 'pipeline-auto-v1',
        processedPages: [],
      },
    },
  ];
  const audit = {
    schemaVersion: 1,
    sourceQueueSha256: '1'.repeat(64),
    toleranceMm: 2,
    outcomes,
    semanticAuditSha256: null,
  };
  audit.semanticAuditSha256 = canonicalJsonSha256({
    sourceQueueSha256: audit.sourceQueueSha256, toleranceMm: 2, outcomes,
  });

  const result = applyHistoricalPdfImageAudit({ links, audit });
  assert.equal(links.get('ref-unresolved').get(`pdf:${unresolvedHash}`).identityScope, 'AMBIGUOUS');
  assert.equal(links.get('ref-unresolved').get(`pdf:${unresolvedHash}`).extractionState, 'PARSER_GAP');
  assert.ok(links.get('ref-unresolved').get(`pdf:${unresolvedHash}`).evidenceObjectIds.includes(`hybrid-audit:${audit.semanticAuditSha256}`));
  assert.ok(links.get('ref-unresolved').get(`pdf:${unresolvedHash}`).evidenceObjectIds.includes(`mineru-hybrid:${hybridHash}`));
  assert.equal(result.conflictsByReference.get('ref-conflict'), 'SOURCE_CONFLICT');
  assert.equal(links.get('ref-conflict').get(`pdf:${conflictHash}`).extractionState, 'ALL_AXIS_SCALAR');
  assert.equal(links.get('ref-receipt').get(`pdf:${receiptHash}`).identityScope, 'EXACT_MODEL');
  assert.equal(links.get('ref-receipt').get(`pdf:${receiptHash}`).evidenceObjectIds.length, 1);
  assert.equal(links.get('ref-hybrid-repair').get(`pdf:${hybridRepairHash}`).extractionState, 'PARSER_GAP');
  assert.equal(result.conflictsByReference.get('ref-profile-conflict'), 'SOURCE_CONFLICT');
  assert.equal(links.get('ref-independent').get(`pdf:${independentHash}`).identityScope, 'AMBIGUOUS');
  assert.equal(links.get('ref-independent').get(`pdf:${independentHash}`).extractionState, 'ALL_AXIS_SCALAR');
  assert.equal(result.applied, 5);
  assert.equal(result.skippedCurrentReceipts, 1);
});

test('hybrid range evidence retains range extraction state in classification', () => {
  const pdfHash = '7'.repeat(64);
  const links = new Map([['ref-range', new Map([[`pdf:${pdfHash}`, {
    documentId: `pdf:${pdfHash}`,
    sourcePdfSha256: pdfHash,
    evidenceObjectIds: [`storage:${pdfHash}.pdf`],
    reasonCodes: ['PHYSICAL_PDF_HASH_BOUND'],
    corpusState: 'CURRENT_MINERU',
    sourceAuthority: 'OFFICIAL',
    identityScope: 'EXACT_MODEL',
    extractionState: 'PARSER_GAP',
    receiptState: 'NONE',
  }]])]]);
  const outcomes = [{
    referenceId: 'ref-range', sourcePdfSha256: pdfHash,
    decision: 'READY_FOR_RECEIPT_REPLAY', extractionStatus: 'extracted',
    evidenceBinding: {
      sourcePdfSha256: pdfHash,
      primaryContentSha256: '6'.repeat(64),
      hybridContentSha256: null,
      profileId: 'pipeline-auto-v1',
      processedPages: [],
    },
    dimensionEvidence: {
      width: { kind: 'fixed', mm: 597 },
      height: { kind: 'range', minMm: 820, maxMm: 880 },
      depth: { kind: 'fixed', mm: 574 },
    },
  }];
  const audit = {
    schemaVersion: 1, sourceQueueSha256: '1'.repeat(64), toleranceMm: 2,
    outcomes, semanticAuditSha256: null,
  };
  audit.semanticAuditSha256 = canonicalJsonSha256({
    sourceQueueSha256: audit.sourceQueueSha256, toleranceMm: 2, outcomes,
  });

  applyHistoricalPdfImageAudit({ links, audit });
  assert.equal(links.get('ref-range').get(`pdf:${pdfHash}`).extractionState, 'ALL_AXIS_RANGE');
  assert.ok(links.get('ref-range').get(`pdf:${pdfHash}`).evidenceObjectIds.includes(`mineru-primary:${'6'.repeat(64)}`));
});

test('failed current receipt replay downgrades the link into the standard parser repair lane', () => {
  const pdfHash = '8'.repeat(64);
  const receiptHash = '9'.repeat(64);
  const link = {
    documentId: `pdf:${pdfHash}`,
    sourcePdfSha256: pdfHash,
    evidenceObjectIds: [`storage:${pdfHash}.pdf`, `receipt:${receiptHash}`],
    reasonCodes: ['CURRENT_MINERU_INDEX', 'CURRENT_RECEIPT_BOUND'],
    corpusState: 'RECEIPT_BOUND',
    sourceAuthority: 'OFFICIAL',
    identityScope: 'EXACT_MODEL',
    extractionState: 'ALL_AXIS_SCALAR',
    receiptState: 'CURRENT_VALID',
  };
  const links = new Map([['ref-drifted', new Map([[link.documentId, link]])]]);
  const outcomes = [{
    targetId: 'target-drifted', referenceId: 'ref-drifted',
    sourcePdfSha256: pdfHash, receiptBindingSha256: receiptHash,
    status: 'failed', failureCode: 'claim_replay_mismatch',
  }];
  const audit = {
    schemaVersion: 1,
    sourceBundleSha256: 'a'.repeat(64),
    outcomes,
    summary: { entries: 1, sources: 1, passed: 0, failed: 1 },
    semanticAuditSha256: null,
  };
  audit.semanticAuditSha256 = canonicalJsonSha256({
    sourceBundleSha256: audit.sourceBundleSha256,
    outcomes,
  });

  const applied = applyAcceptanceReceiptReplayAudit({ links, audit });
  const repaired = links.get('ref-drifted').get(link.documentId);
  assert.equal(applied.failedReceipts, 1);
  assert.equal(repaired.corpusState, 'CURRENT_MINERU');
  assert.equal(repaired.receiptState, 'LEGACY_UNBOUND');
  assert.equal(repaired.extractionState, 'PARSER_GAP');
  assert.ok(repaired.reasonCodes.includes('CURRENT_RECEIPT_REPLAY_FAILED_CLAIM_REPLAY_MISMATCH'));
});
