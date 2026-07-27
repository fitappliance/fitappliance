import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertHistoricalDimensionsScaleManifestAllowed,
  buildHistoricalDimensionsScaleCheckpoint,
  buildHistoricalDimensionsDiscoveryFunnel,
  buildHistoricalDimensionsRecoveryFunnel,
  buildHistoricalDimensionsScaleControl,
  canonicalHistoricalDimensionsScaleCounters,
  HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY,
  recordHistoricalDimensionsScaleCheckpoint,
  recordHistoricalDimensionsScaleRebaseline,
} from '../../src/domain/historical-dimensions-scale-control.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const AT = '2026-07-19T20:00:00.000Z';

function epochs() {
  return [
    'fit-policy', 'lifecycle-policy', 'mineru-toolchain', 'parser',
    'receipt-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy',
  ].map((id, index) => ({ id, semanticSha256: String(index + 1).repeat(64).slice(0, 64) }));
}

function metric(id, numerator, denominator = 8_089) {
  return {
    id,
    label: id,
    grain: id.startsWith('fit.') ? 'current_catalog_product' : 'historical_model_reference',
    numerator,
    denominator,
    rateBasisPoints: denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000),
    sourceArtifact: `fixture:${id}`,
  };
}

function manifest({
  id: seed,
  workstreamId,
  priorityClass,
  lifecycleState,
  familyId = null,
  brand = 'Example',
  category = 'dishwasher',
  executionLane = 'ACQUISITION',
}) {
  const mode = familyId ? 'FAMILY_EXPANSION' : 'SINGLETON';
  const cohort = {
    schemaVersion: 1,
    workstreamId,
    priorityClass,
    lifecycleState,
    category,
    brand,
    normalizedBrand: brand.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    familyId,
    executionLane,
    mode,
  };
  const cohortSha256 = canonicalJsonSha256(cohort);
  const semantic = {
    schemaVersion: 2,
    plannerVersion: '2',
    workstreamId,
    cohortKeyVersion: '1',
    cohortKey: `historical_cohort_${cohortSha256.slice(0, 24)}`,
    cohortSha256,
    cohort,
    mode,
    executionLane,
    executionCommand: executionLane === 'ACQUISITION'
      ? 'recover:historical-evidence' : 'discover:historical-official-candidates',
    constraints: { priorityClass, lifecycleState, category, brand, executionLane },
    familyId,
    familyState: familyId ? 'PASSED' : null,
    sourceBindings: {
      executableQueueSha256: '1'.repeat(64),
      targetStateSha256: '2'.repeat(64),
      familyCanarySha256: '3'.repeat(64),
      sourceAcquisitionQueueSha256: '4'.repeat(64),
    },
    reviewedTargetCount: 10,
    targetBindings: [{
      targetId: `${seed}-target`, referenceId: `${seed}-reference`, executionLane,
      familyId, assignment: familyId ? 'FAMILY_MEMBER' : 'UNSCOPED_SINGLETON',
    }],
    estimatedSharedArtifactCount: 0,
    estimatedSharedArtifactBasis: 'NO_PROVEN_SHARED_ARTIFACT_IN_SELECTED_TARGETS',
  };
  const semanticManifestSha256 = canonicalJsonSha256(semantic);
  return {
    ...semantic,
    manifestId: `historical_batch_${semanticManifestSha256.slice(0, 24)}`,
    semanticManifestSha256,
  };
}

function batches({
  p0 = 4,
  p1 = 8,
  parserRepair = 0,
  p0ExecutionLane = 'ACQUISITION',
  p0Brand = 'Example',
} = {}) {
  const p0Manifest = manifest({
    id: 'manifest-p0', workstreamId: 'CURRENT_DIMENSIONS',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', lifecycleState: 'CURRENT_RETAIL',
    familyId: 'family-current', executionLane: p0ExecutionLane, brand: p0Brand,
  });
  const p1Manifest = manifest({
    id: 'manifest-p1', workstreamId: 'HISTORICAL_DIMENSIONS',
    priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS', lifecycleState: 'CATALOG_ARCHIVED',
    familyId: 'family-historical',
  });
  const repairManifest = manifest({
    id: 'manifest-repair', workstreamId: 'PARSER_REPAIR',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', lifecycleState: 'CURRENT_RETAIL',
    executionLane: 'BOUNDED_DISCOVERY',
  });
  const manifests = [
    p0 ? p0Manifest : null,
    p1 ? p1Manifest : null,
    parserRepair ? repairManifest : null,
  ].filter(Boolean);
  const workstream = ({
    workstreamId, description, assignedTargets, priorityClass, manifestRow,
  }) => ({
    workstreamId,
    description,
    assignedTargets,
    eligibleTargets: assignedTargets,
    suppressedTargets: 0,
    suppressedByReason: {},
    eligibleByPriority: assignedTargets ? { [priorityClass]: assignedTargets } : {},
    eligibleCohorts: assignedTargets ? 1 : 0,
    eligibleCohortsByPriority: assignedTargets ? { [priorityClass]: 1 } : {},
    windowedCohorts: assignedTargets ? 1 : 0,
    windowedCohortsByPriority: assignedTargets ? { [priorityClass]: 1 } : {},
    deferredCohorts: 0,
    manifestIds: assignedTargets ? [manifestRow.manifestId] : [],
  });
  const semantic = {
    schemaVersion: 2,
    plannerVersion: '2',
    generatedAt: AT,
    maximumTargets: 10,
    manifestWindow: {
      schemaVersion: 1,
      cohortKeyVersion: '1',
      maximumManifestsPerWorkstream: 8,
      manifestIds: manifests.map((row) => row.manifestId),
    },
    sourceBindings: {
      executableQueueSha256: '1'.repeat(64),
      targetStateSha256: '2'.repeat(64),
      familyCanarySha256: '3'.repeat(64),
      sourceAcquisitionQueueSha256: '4'.repeat(64),
    },
    workstreams: [
      workstream({
        workstreamId: 'CURRENT_DIMENSIONS', description: 'current', assignedTargets: p0,
        priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', manifestRow: p0Manifest,
      }),
      workstream({
        workstreamId: 'HISTORICAL_DIMENSIONS', description: 'historical', assignedTargets: p1,
        priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS', manifestRow: p1Manifest,
      }),
      workstream({
        workstreamId: 'PARSER_REPAIR', description: 'parser', assignedTargets: parserRepair,
        priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', manifestRow: repairManifest,
      }),
      workstream({
        workstreamId: 'CONFLICT_CLOSURE', description: 'conflict', assignedTargets: 0,
        priorityClass: 'P4_CONFLICT_RESOLUTION', manifestRow: null,
      }),
    ],
    manifests,
    summary: {
      assignedTargets: p0 + p1 + parserRepair,
      eligibleTargets: p0 + p1 + parserRepair,
      suppressedTargets: 0,
      suppressedByReason: {},
      eligibleCohorts: Number(p0 > 0) + Number(p1 > 0) + Number(parserRepair > 0),
      windowedCohorts: Number(p0 > 0) + Number(p1 > 0) + Number(parserRepair > 0),
      deferredCohorts: 0,
      manifests: Number(p0 > 0) + Number(p1 > 0) + Number(parserRepair > 0),
      manifestedTargets: Number(p0 > 0) + Number(p1 > 0) + Number(parserRepair > 0),
      byWorkstream: {
        CURRENT_DIMENSIONS: p0, HISTORICAL_DIMENSIONS: p1,
        PARSER_REPAIR: parserRepair, CONFLICT_CLOSURE: 0,
      },
    },
  };
  return { ...semantic, semanticBatchesSha256: canonicalJsonSha256(semantic) };
}

function inputs(options = {}) {
  const nextBatches = batches(options);
  const programStatus = {
    schemaVersion: 1,
    generatedAt: AT,
    metrics: [
      metric('model.current_valid_receipt', 401),
      metric('model.replacement_auto_fill', 321),
      metric('fit.receipt_bound_dimensions', 332, 3_515),
      metric('fit.receipt_bound_verified', 0, 3_515),
      metric('receipt_replay.failed_sources', options.receiptFailures ?? 0, 408),
    ],
    inventory: { quarantinedReceiptTargets: options.quarantinedReceiptTargets ?? 0 },
    controls: [], diagnostics: [],
  };
  const receiptAudit = {
    schemaVersion: 1,
    summary: {
      entries: 382,
      sources: 408,
      passed: 408 - (options.receiptFailures ?? 0),
      failed: options.receiptFailures ?? 0,
    },
    outcomes: Array.from({ length: options.receiptFailures ?? 0 }, (_, index) => ({
      targetId: `repair-target-${index + 1}`,
      referenceId: `repair-reference-${index + 1}`,
      status: 'failed',
    })),
  };
  const replacementAudit = {
    schemaVersion: 3,
    summary: { byLookupAction: { AUTO_FILL: 321 }, issueCount: 0 },
  };
  const fitPublicationAudit = {
    schemaVersion: 1,
    summary: { products: 3_515, receiptBoundDimensions: 332, receiptBoundVerified: 0, violations: 0 },
    violations: [],
  };
  const counters = canonicalHistoricalDimensionsScaleCounters({
    nextBatches, programStatus, receiptAudit, replacementAudit, fitPublicationAudit,
  });
  const ledger = {
    schemaVersion: 1,
    ledgerId: 'historical-dimensions-scale-v1',
    activatedAt: AT,
    policy: { minimumYieldBasisPoints: 5_000, consecutiveLowYieldBatches: 2 },
    baseline: { counters },
    entries: [],
  };
  return {
    generatedAt: AT, ledger, nextBatches, programStatus, receiptAudit,
    replacementAudit, fitPublicationAudit, epochs: epochs(),
  };
}

function checkpoint({
  id,
  before,
  after = before,
  familyId = 'family-current',
  dimensionsReceipted = 0,
  selectedTargets = 1,
  completedAt = AT,
}) {
  const semantic = {
    checkpointId: id,
    runId: `run-${id}`,
    completedAt,
    stage: 'DIMENSIONS',
    workstreamId: 'CURRENT_DIMENSIONS',
    manifestId: `manifest-${id}`,
    manifestSha256: canonicalJsonSha256(`manifest:${id}`),
    cohortKey: `family:${familyId}`,
    familyId,
    evidenceBindings: {
      runSha256: canonicalJsonSha256(`run:${id}`),
      auditSha256: canonicalJsonSha256(`audit:${id}`),
    },
    funnel: {
      selectedTargets,
      targetsWithOfficialCandidates: selectedTargets,
      fetchedTargets: selectedTargets,
      mineruValidTargets: selectedTargets,
      identityProvenTargets: selectedTargets,
      dimensionsReceipted,
      terminalTargets: selectedTargets - dimensionsReceipted,
      retryableTargets: 0,
    },
    beforeCounters: structuredClone(before),
    afterCounters: structuredClone(after),
  };
  return { ...semantic, semanticCheckpointSha256: canonicalJsonSha256(semantic) };
}

test('P0 remains the only dimensions lane while any eligible current target exists', () => {
  const input = inputs();
  const control = buildHistoricalDimensionsScaleControl(input);
  const p0 = input.nextBatches.manifests.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const p1 = input.nextBatches.manifests.find((row) => row.workstreamId === 'HISTORICAL_DIMENSIONS');
  assert.equal(control.decision.status, 'RUN_P0');
  assert.equal(control.decision.allowedManifestId, p0.manifestId);
  assert.equal(control.decision.p1Blocked, true);
  assertHistoricalDimensionsScaleManifestAllowed({
    control, batches: input.nextBatches, manifest: p0,
  });
  assert.throws(() => assertHistoricalDimensionsScaleManifestAllowed({
    control, batches: input.nextBatches, manifest: p1,
  }), /P1|not allowed/i);
});

test('quarantined receipt repair is controlled and outranks ordinary P0 work', () => {
  const input = inputs({ parserRepair: 2, receiptFailures: 2, quarantinedReceiptTargets: 2 });
  const control = buildHistoricalDimensionsScaleControl(input);
  const repair = input.nextBatches.manifests.find((row) => row.workstreamId === 'PARSER_REPAIR');
  const p0 = input.nextBatches.manifests.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  assert.equal(control.decision.status, 'RUN_RECEIPT_REPAIR');
  assert.equal(control.decision.allowedManifestId, repair.manifestId);
  assert.equal(control.decision.allowedWorkstreamId, 'PARSER_REPAIR');
  assertHistoricalDimensionsScaleManifestAllowed({
    control, batches: input.nextBatches, manifest: repair,
  });
  assert.throws(() => assertHistoricalDimensionsScaleManifestAllowed({
    control, batches: input.nextBatches, manifest: p0,
  }), /not allowed/i);
});

test('P1 opens only after the P0 workstream reaches zero eligible targets', () => {
  const input = inputs({ p0: 0, p1: 8 });
  input.ledger.baseline.counters = canonicalHistoricalDimensionsScaleCounters(input);
  const control = buildHistoricalDimensionsScaleControl(input);
  const p1 = input.nextBatches.manifests.find((row) => row.workstreamId === 'HISTORICAL_DIMENSIONS');
  assert.equal(control.decision.status, 'RUN_P1');
  assert.equal(control.decision.allowedManifestId, p1.manifestId);
  assert.equal(control.decision.p1Blocked, false);
});

test('legacy one-target low-yield checkpoints remain visible but cannot stop expansion', () => {
  const input = inputs();
  const counters = input.ledger.baseline.counters;
  input.ledger.entries = [
    checkpoint({ id: 'low-a', before: counters, dimensionsReceipted: 0 }),
    checkpoint({ id: 'low-b', before: counters, dimensionsReceipted: 0, completedAt: '2026-07-19T21:00:00.000Z' }),
  ];
  const control = buildHistoricalDimensionsScaleControl(input);
  assert.equal(control.decision.status, 'RUN_P0');
  assert.equal(control.haltedCohorts.length, 0);
  assert.deepEqual(control.legacyDiagnostics.map((row) => row.checkpointId), ['low-a', 'low-b']);
});

test('checkpoint chains and publication guards fail closed', () => {
  const stale = inputs();
  stale.ledger.baseline.counters = {
    ...stale.ledger.baseline.counters,
    currentValidReceipts: stale.ledger.baseline.counters.currentValidReceipts - 1,
  };
  assert.throws(() => buildHistoricalDimensionsScaleControl(stale), /checkpoint|required|counter/i);

  const receiptFailure = inputs();
  receiptFailure.receiptAudit.summary.failed = 1;
  receiptFailure.receiptAudit.summary.passed = 407;
  assert.throws(() => canonicalHistoricalDimensionsScaleCounters(receiptFailure), /receipt/i);

  const publicationFailure = inputs();
  publicationFailure.fitPublicationAudit.summary.violations = 1;
  publicationFailure.fitPublicationAudit.violations = ['false verified fit'];
  assert.throws(() => canonicalHistoricalDimensionsScaleCounters(publicationFailure), /publication.*violation/i);

  const invalidReplacement = inputs();
  invalidReplacement.replacementAudit.summary.byLookupAction.AUTO_FILL = 402;
  assert.throws(() => canonicalHistoricalDimensionsScaleCounters(invalidReplacement), /replacement.*receipt/i);
});

test('evidence invalidation rebaseline records bounded receipt coverage decreases', () => {
  const prior = inputs();
  prior.ledger = {
    ...prior.ledger,
    schemaVersion: 2,
    ledgerId: 'historical-dimensions-scale-v2',
    policy: structuredClone(HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY),
    rebaselines: [],
  };
  const priorControl = buildHistoricalDimensionsScaleControl(prior);
  const current = inputs({ parserRepair: 2, receiptFailures: 2, quarantinedReceiptTargets: 2 });
  current.programStatus.metrics.find((row) => row.id === 'model.current_valid_receipt').numerator = 399;
  current.programStatus.metrics.find((row) => row.id === 'model.current_valid_receipt').rateBasisPoints = Math.round((399 / 8_089) * 10_000);

  const advanced = recordHistoricalDimensionsScaleRebaseline({
    priorControl,
    ledger: prior.ledger,
    currentInput: current,
    activatedAt: '2026-07-19T20:30:00.000Z',
    reason: 'EVIDENCE_INVALIDATION_RECONCILIATION',
  });
  assert.equal(advanced.rebaseline.reason, 'EVIDENCE_INVALIDATION_RECONCILIATION');
  assert.deepEqual(advanced.rebaseline.evidenceInvalidation, {
    targetIds: ['repair-target-1', 'repair-target-2'],
    quarantinedTargetCount: 2,
    failedSourceCount: 2,
  });
  assert.equal(advanced.control.counters.currentValidReceipts, 399);
  assert.equal(advanced.control.counters.receiptSourcesPassed, 406);
  assert.equal(advanced.control.decision.status, 'RUN_RECEIPT_REPAIR');
});

test('release DAG rebaseline preserves checkpoint history and only reopens queue counters', () => {
  const prior = inputs();
  prior.ledger = {
    ...prior.ledger,
    schemaVersion: 2,
    ledgerId: 'historical-dimensions-scale-v2',
    policy: structuredClone(HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY),
    rebaselines: [],
  };
  const priorControl = buildHistoricalDimensionsScaleControl(prior);
  const current = inputs({ p0: 5, p1: 8 });
  current.ledger = prior.ledger;

  assert.throws(
    () => buildHistoricalDimensionsScaleControl(current),
    /changed without a recorded scale checkpoint/i,
  );

  const advanced = recordHistoricalDimensionsScaleRebaseline({
    priorControl,
    ledger: prior.ledger,
    currentInput: current,
    activatedAt: '2026-07-19T20:05:00.000Z',
    reason: 'RELEASE_DAG_RECONCILIATION',
  });

  assert.deepEqual(advanced.ledger.entries, prior.ledger.entries);
  assert.equal(advanced.ledger.rebaselines.length, 1);
  assert.equal(advanced.ledger.rebaselines[0].afterEntryCount, 0);
  assert.equal(advanced.ledger.rebaselines[0].queueCounterDeltas.p0AssignedTargets, 1);
  assert.equal(advanced.control.counters.p0AssignedTargets, 5);
  assert.equal(advanced.control.rebaselineCount, 1);
  assert.equal(advanced.control.latestRebaseline.reason, 'RELEASE_DAG_RECONCILIATION');

  const tampered = structuredClone(advanced.ledger);
  tampered.rebaselines[0].nextCounters.p0AssignedTargets += 1;
  assert.throws(
    () => buildHistoricalDimensionsScaleControl({ ...current, ledger: tampered }),
    /rebaseline.*hash|hash.*rebaseline/i,
  );

  const coverageDrift = inputs({ p0: 5, p1: 8 });
  coverageDrift.ledger = prior.ledger;
  coverageDrift.programStatus.metrics
    .find((row) => row.id === 'model.current_valid_receipt').numerator += 1;
  coverageDrift.programStatus.metrics
    .find((row) => row.id === 'fit.receipt_bound_dimensions').numerator += 1;
  coverageDrift.receiptAudit.summary.sources += 1;
  coverageDrift.receiptAudit.summary.passed += 1;
  coverageDrift.fitPublicationAudit.summary.receiptBoundDimensions += 1;
  assert.throws(() => recordHistoricalDimensionsScaleRebaseline({
    priorControl,
    ledger: prior.ledger,
    currentInput: coverageDrift,
    activatedAt: '2026-07-19T20:05:00.000Z',
    reason: 'RELEASE_DAG_RECONCILIATION',
  }), /coverage.*rebaseline|rebaseline.*coverage/i);
});

test('release DAG rebaseline records an epoch-only compatibility change without fabricating queue work', () => {
  const prior = inputs();
  prior.ledger = {
    ...prior.ledger,
    schemaVersion: 2,
    ledgerId: 'historical-dimensions-scale-v2',
    policy: structuredClone(HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY),
    rebaselines: [],
  };
  const priorControl = buildHistoricalDimensionsScaleControl(prior);
  const current = structuredClone(prior);
  current.epochs.find((row) => row.id === 'parser').semanticSha256 = 'f'.repeat(64);

  const advanced = recordHistoricalDimensionsScaleRebaseline({
    priorControl,
    ledger: prior.ledger,
    currentInput: current,
    activatedAt: '2026-07-19T20:06:00.000Z',
    reason: 'RELEASE_DAG_RECONCILIATION',
  });

  assert.deepEqual(advanced.ledger.rebaselines[0].queueCounterDeltas, {
    p0AssignedTargets: 0,
    p0EligibleTargets: 0,
    p1AssignedTargets: 0,
    p1EligibleTargets: 0,
  });
  assert.deepEqual(advanced.ledger.rebaselines[0].changedArtifactBindings, ['epochsSha256']);
  assert.equal(advanced.control.counters.currentValidReceipts, priorControl.counters.currentValidReceipts);
  assert.equal(advanced.control.counters.p0AssignedTargets, priorControl.counters.p0AssignedTargets);
});

test('weekly throughput and projected batches use receipted target grain only', () => {
  const input = inputs();
  const before = input.ledger.baseline.counters;
  const after = structuredClone(before);
  after.currentValidReceipts += 2;
  after.receiptSourcesPassed += 2;
  after.fitReceiptBoundDimensions += 2;
  after.p0AssignedTargets -= 2;
  after.p0EligibleTargets -= 2;
  input.ledger.entries = [checkpoint({
    id: 'good-a', before, after, selectedTargets: 2, dimensionsReceipted: 2,
  })];
  input.programStatus.metrics.find((row) => row.id === 'model.current_valid_receipt').numerator += 2;
  input.programStatus.metrics.find((row) => row.id === 'fit.receipt_bound_dimensions').numerator += 2;
  input.receiptAudit.summary.sources += 2;
  input.receiptAudit.summary.passed += 2;
  input.fitPublicationAudit.summary.receiptBoundDimensions += 2;
  input.nextBatches.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS').assignedTargets -= 2;
  input.nextBatches.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS').eligibleTargets -= 2;
  input.nextBatches.summary.assignedTargets -= 2;
  input.nextBatches.summary.eligibleTargets -= 2;
  input.nextBatches.summary.byWorkstream.CURRENT_DIMENSIONS -= 2;
  const { semanticBatchesSha256: ignored, ...batchSemantic } = input.nextBatches;
  input.nextBatches.semanticBatchesSha256 = canonicalJsonSha256(batchSemantic);

  const control = buildHistoricalDimensionsScaleControl(input);
  assert.equal(control.weeklyThroughput[0].dimensionsReceipted, 2);
  assert.equal(control.projection.receiptedTargetsPerCompletedBatch, 2);
  assert.equal(control.projection.projectedRemainingP0Batches, 1);
});

test('discovery funnel separates materialized candidates, terminal exhaustion and retryable work', () => {
  const complete = (candidates = []) => ({
    resolverId: 'official', required: true, completion: 'complete', candidates, failures: [],
  });
  const funnel = buildHistoricalDimensionsDiscoveryFunnel({
    schemaVersion: 1,
    targets: [{ resolvers: [complete([{
      sourceUrl: 'https://official.example/a.pdf', authorityMode: 'official',
    }])] },
      { resolvers: [complete()] },
      { resolvers: [{
        resolverId: 'official', required: true, completion: 'timed_out',
        candidates: [], failures: [{ code: 'timeout', message: 'timeout' }],
      }] }],
  });
  assert.deepEqual(funnel, {
    selectedTargets: 3,
    targetsWithOfficialCandidates: 1,
    fetchedTargets: 0,
    mineruValidTargets: 0,
    identityProvenTargets: 0,
    dimensionsReceipted: 0,
    terminalTargets: 1,
    retryableTargets: 1,
  });
});

test('recovery funnel reports target-stage progress without counting downloads as receipts', () => {
  const candidate = (status, source = null) => ({
    authorityMode: 'official',
    outcome: { status, ...(source ? { source } : {}) },
  });
  const outcome = (status, candidates, sources = []) => ({
    status,
    candidateInventory: { candidates },
    sources,
  });
  const mineruSource = {
    identity: { outcome: 'exact' },
    derivedArtifact: { parserName: 'MinerU', format: 'content_list_v2' },
  };
  const htmlSource = { identity: { outcome: 'exact' } };
  const funnel = buildHistoricalDimensionsRecoveryFunnel({
    schemaVersion: 1,
    outcomes: [
      outcome('accepted', [candidate('accepted', mineruSource)], [mineruSource]),
      outcome('receipt_accepted_non_scalar', [candidate('accepted', htmlSource)], [htmlSource]),
      outcome('identity_rejected', [candidate('identity_rejected', htmlSource)]),
      outcome('retryable_failure', [candidate('transport_failure')]),
    ],
  });
  assert.deepEqual(funnel, {
    selectedTargets: 4,
    targetsWithOfficialCandidates: 4,
    fetchedTargets: 3,
    mineruValidTargets: 1,
    identityProvenTargets: 2,
    dimensionsReceipted: 1,
    terminalTargets: 2,
    retryableTargets: 1,
  });
});

test('recovery funnel counts a byte-bound failed artifact as fetched but not receipted', () => {
  const funnel = buildHistoricalDimensionsRecoveryFunnel({
    schemaVersion: 1,
    outcomes: [{
      status: 'claims_incomplete',
      candidateInventory: {
        candidates: [{
          authorityMode: 'official',
          outcome: {
            status: 'mineru_failure',
            artifactBinding: {
              contentSha256: 'a'.repeat(64),
              objectPath: 'evidence/web/a.pdf',
              byteSize: 100,
            },
          },
        }],
      },
      sources: [],
    }],
  });
  assert.equal(funnel.fetchedTargets, 1);
  assert.equal(funnel.mineruValidTargets, 0);
  assert.equal(funnel.dimensionsReceipted, 0);
  assert.equal(funnel.terminalTargets, 1);
});

test('checkpoint binds an approved immutable discovery run to the prior control decision', () => {
  const input = inputs({ p0ExecutionLane: 'BOUNDED_DISCOVERY' });
  const control = buildHistoricalDimensionsScaleControl(input);
  const selected = input.nextBatches.manifests.find(
    (row) => row.manifestId === control.decision.allowedManifestId,
  );
  const run = {
    schemaVersion: 1,
    runId: 'discovery-approved-a',
    startedAt: AT,
    completedAt: '2026-07-19T20:05:00.000Z',
    sourceAcquisitionQueueSha256: '4'.repeat(64),
    selection: {
      manifestId: selected.manifestId,
      semanticManifestSha256: selected.semanticManifestSha256,
      selectedReferenceIds: selected.targetBindings.map((row) => row.referenceId),
    },
    boundedManifest: structuredClone(selected),
    targets: selected.targetBindings.map((row) => ({
      referenceId: row.referenceId,
      brand: 'Example', model: 'MODEL-1', category: 'dishwasher',
      resolvers: [{
        resolverId: 'official', required: true, completion: 'complete',
        candidates: [{ sourceUrl: 'https://official.example/model-1.pdf' }], failures: [],
      }],
    })),
  };
  const checkpoint = buildHistoricalDimensionsScaleCheckpoint({
    control,
    manifest: selected,
    run,
    candidateManifest: {
      schemaVersion: 1,
      targets: selected.targetBindings.map((row) => ({
        referenceId: row.referenceId,
        state: 'CANDIDATES_READY',
        lastDiscoveryRunId: run.runId,
      })),
    },
    afterCounters: control.counters,
    storageContentSha256: '9'.repeat(64),
  });
  assert.equal(checkpoint.stage, 'DISCOVERY');
  assert.equal(checkpoint.funnel.targetsWithOfficialCandidates, 1);
  assert.equal(checkpoint.evidenceBindings.runSha256, canonicalJsonSha256(run));
  assert.equal(checkpoint.evidenceBindings.storageContentSha256, '9'.repeat(64));
  assert.match(checkpoint.evidenceBindings.candidateManifestSha256, /^[a-f0-9]{64}$/);

  const tampered = structuredClone(selected);
  tampered.targetBindings[0].referenceId = 'different-reference';
  assert.throws(() => buildHistoricalDimensionsScaleCheckpoint({
    control, manifest: tampered, run,
    candidateManifest: {
      schemaVersion: 1,
      targets: selected.targetBindings.map((row) => ({
        referenceId: row.referenceId,
        state: 'CANDIDATES_READY',
        lastDiscoveryRunId: run.runId,
      })),
    },
    afterCounters: control.counters,
    storageContentSha256: '9'.repeat(64),
  }), /manifest.*hash|hash.*manifest/i);
});

test('discovery checkpoint counts final materialization, not reference hints', () => {
  const input = inputs({ p0ExecutionLane: 'BOUNDED_DISCOVERY' });
  const control = buildHistoricalDimensionsScaleControl(input);
  const selected = input.nextBatches.manifests.find(
    (row) => row.manifestId === control.decision.allowedManifestId,
  );
  const referenceId = selected.targetBindings[0].referenceId;
  const run = {
    schemaVersion: 1,
    runId: 'reference-hint-only-a',
    startedAt: AT,
    completedAt: '2026-07-19T20:05:00.000Z',
    selection: {
      manifestId: selected.manifestId,
      semanticManifestSha256: selected.semanticManifestSha256,
      selectedReferenceIds: [referenceId],
    },
    boundedManifest: structuredClone(selected),
    targets: [{
      referenceId,
      resolvers: [{
        resolverId: 'generic', required: false, completion: 'complete', failures: [],
        candidates: [{
          sourceUrl: 'https://retailer.example/hint.pdf', authorityMode: 'reference',
        }],
      }, {
        resolverId: 'official', required: true, completion: 'complete',
        candidates: [], failures: [],
      }],
    }],
  };
  const checkpoint = buildHistoricalDimensionsScaleCheckpoint({
    control,
    manifest: selected,
    run,
    candidateManifest: {
      schemaVersion: 1,
      targets: [{
        referenceId,
        state: 'NO_CANDIDATE_COMPLETE',
        lastDiscoveryRunId: run.runId,
      }],
    },
    afterCounters: {
      ...control.counters,
      p0AssignedTargets: control.counters.p0AssignedTargets - 1,
      p0EligibleTargets: control.counters.p0EligibleTargets - 1,
    },
    storageContentSha256: 'd'.repeat(64),
  });
  assert.equal(checkpoint.funnel.targetsWithOfficialCandidates, 0);
  assert.equal(checkpoint.funnel.terminalTargets, 1);
});

test('dimensions checkpoint requires a passing online audit bound to scalar results', () => {
  const input = inputs();
  const control = buildHistoricalDimensionsScaleControl(input);
  const selected = input.nextBatches.manifests.find(
    (row) => row.manifestId === control.decision.allowedManifestId,
  );
  const targetId = selected.targetBindings[0].targetId;
  const results = {
    schemaVersion: 1,
    runId: 'dimensions-approved-a',
    batchId: 'batch-a',
    batchSha256: '5'.repeat(64),
    queueSha256: '6'.repeat(64),
    policySha256: '7'.repeat(64),
    startedAt: AT,
    completedAt: '2026-07-19T20:10:00.000Z',
    semanticOutcomeSha256: '8'.repeat(64),
    outcomes: [{
      targetId,
      status: 'accepted',
      candidateInventory: { candidates: [] },
      sources: [],
      geometryProjection: { evidenceLevel: 'dimensions' },
    }],
    summary: { targets: 1, accepted: 1, nonScalar: 0, retryable: 0, terminal: 0 },
  };
  const audit = {
    schemaVersion: 1,
    mode: 'online',
    status: 'passed',
    priorObjectsReplayed: true,
    checkedTargets: 1,
    resultsSha256: canonicalJsonSha256(results),
    violations: [],
    semanticAuditSha256: 'a'.repeat(64),
  };
  const after = { ...control.counters, currentValidReceipts: control.counters.currentValidReceipts + 1 };
  const checkpoint = buildHistoricalDimensionsScaleCheckpoint({
    control, manifest: selected, run: results, audit, afterCounters: after,
  });
  assert.equal(checkpoint.stage, 'DIMENSIONS');
  assert.equal(checkpoint.funnel.dimensionsReceipted, 1);
  assert.equal(checkpoint.evidenceBindings.auditSha256, canonicalJsonSha256(audit));

  assert.throws(() => buildHistoricalDimensionsScaleCheckpoint({
    control,
    manifest: selected,
    run: results,
    audit: { ...audit, status: 'failed' },
    afterCounters: after,
  }), /passing full online audit/i);
});

test('a delayed checkpoint uses its immutable run-time control after a release-DAG rebaseline', () => {
  const priorInput = inputs({ p0: 4, p0Brand: 'Before' });
  const authorizingControl = buildHistoricalDimensionsScaleControl(priorInput);
  const priorManifest = priorInput.nextBatches.manifests.find(
    (row) => row.manifestId === authorizingControl.decision.allowedManifestId,
  );
  const targetId = priorManifest.targetBindings[0].targetId;
  const run = {
    schemaVersion: 1,
    runId: 'dimensions-delayed-after-rebaseline-a',
    batchId: 'batch-delayed-a',
    batchSha256: '5'.repeat(64),
    queueSha256: '6'.repeat(64),
    policySha256: '7'.repeat(64),
    startedAt: '2026-07-19T20:05:00.000Z',
    completedAt: '2026-07-19T20:10:00.000Z',
    semanticOutcomeSha256: '8'.repeat(64),
    outcomes: [{
      targetId,
      status: 'conflict_quarantined',
      failureCode: 'conflict',
      candidateInventory: { candidates: [] },
      sources: [],
      geometryProjection: null,
    }],
    summary: { targets: 1, accepted: 0, nonScalar: 0, retryable: 0, terminal: 1 },
  };
  const audit = {
    schemaVersion: 1,
    mode: 'online',
    status: 'passed',
    priorObjectsReplayed: true,
    checkedTargets: 1,
    resultsSha256: canonicalJsonSha256(run),
    violations: [],
    semanticAuditSha256: 'a'.repeat(64),
  };
  const nextInput = inputs({ p0: 5, p0Brand: 'After' });
  const rebased = recordHistoricalDimensionsScaleRebaseline({
    priorControl: authorizingControl,
    ledger: priorInput.ledger,
    currentInput: nextInput,
    activatedAt: '2026-07-19T20:20:00.000Z',
    reason: 'RELEASE_DAG_RECONCILIATION',
  });
  const epochInput = structuredClone(nextInput);
  epochInput.epochs.find((row) => row.id === 'scale-metrics').semanticSha256 = 'f'.repeat(64);
  const twiceRebased = recordHistoricalDimensionsScaleRebaseline({
    priorControl: rebased.control,
    ledger: rebased.ledger,
    currentInput: epochInput,
    activatedAt: '2026-07-19T20:25:00.000Z',
    reason: 'RELEASE_DAG_RECONCILIATION',
  });
  assert.notEqual(twiceRebased.control.decision.allowedManifestId, priorManifest.manifestId);
  const currentInput = {
    generatedAt: '2026-07-19T20:30:00.000Z',
    nextBatches: epochInput.nextBatches,
    programStatus: epochInput.programStatus,
    receiptAudit: epochInput.receiptAudit,
    replacementAudit: epochInput.replacementAudit,
    fitPublicationAudit: epochInput.fitPublicationAudit,
    epochs: epochInput.epochs,
  };

  const advanced = recordHistoricalDimensionsScaleCheckpoint({
    control: twiceRebased.control,
    authorizingControl,
    ledger: twiceRebased.ledger,
    manifest: priorManifest,
    run,
    audit,
    recordedAt: '2026-07-19T20:30:00.000Z',
    currentInput,
  });
  const recorded = advanced.ledger.entries.at(-1);
  assert.equal(recorded.runId, run.runId);
  assert.equal(recorded.recordedAt, '2026-07-19T20:30:00.000Z');
  assert.equal(
    recorded.evidenceBindings.authorizingControlSha256,
    authorizingControl.semanticControlSha256,
  );
  assert.deepEqual(recorded.beforeCounters, twiceRebased.control.counters);
  assert.deepEqual(recorded.afterCounters, twiceRebased.control.counters);

  assert.throws(() => recordHistoricalDimensionsScaleCheckpoint({
    control: twiceRebased.control,
    ledger: twiceRebased.ledger,
    manifest: priorManifest,
    run,
    audit,
    recordedAt: '2026-07-19T20:30:00.000Z',
    currentInput,
  }), /manifest.*not allowed/i);

  const unrelatedAuthorizingControl = buildHistoricalDimensionsScaleControl(
    inputs({ p0: 6, p0Brand: 'Before' }),
  );
  assert.throws(() => recordHistoricalDimensionsScaleCheckpoint({
    control: twiceRebased.control,
    authorizingControl: unrelatedAuthorizingControl,
    ledger: twiceRebased.ledger,
    manifest: priorManifest,
    run,
    audit,
    recordedAt: '2026-07-19T20:30:00.000Z',
    currentInput,
  }), /authorizing control|rebaseline/i);
});

test('recording a checkpoint advances ledger and control as one validated state transition', () => {
  const input = inputs({ p0ExecutionLane: 'BOUNDED_DISCOVERY' });
  const control = buildHistoricalDimensionsScaleControl(input);
  const selected = input.nextBatches.manifests.find(
    (row) => row.manifestId === control.decision.allowedManifestId,
  );
  const run = {
    schemaVersion: 1,
    runId: 'discovery-transaction-a',
    startedAt: AT,
    completedAt: '2026-07-19T20:05:00.000Z',
    sourceAcquisitionQueueSha256: '4'.repeat(64),
    selection: {
      manifestId: selected.manifestId,
      semanticManifestSha256: selected.semanticManifestSha256,
      selectedReferenceIds: selected.targetBindings.map((row) => row.referenceId),
    },
    boundedManifest: structuredClone(selected),
    targets: selected.targetBindings.map((row) => ({
      referenceId: row.referenceId,
      brand: 'Example', model: 'MODEL-1', category: 'dishwasher',
      resolvers: [{
        resolverId: 'official', required: true, completion: 'complete',
        candidates: [], failures: [],
      }],
    })),
  };
  const advanced = recordHistoricalDimensionsScaleCheckpoint({
    control,
    ledger: input.ledger,
    manifest: selected,
    run,
    candidateManifest: {
      schemaVersion: 1,
      targets: selected.targetBindings.map((row) => ({
        referenceId: row.referenceId,
        state: 'NO_CANDIDATE_COMPLETE',
        lastDiscoveryRunId: run.runId,
      })),
    },
    currentInput: {
      generatedAt: '2026-07-19T20:06:00.000Z',
      nextBatches: input.nextBatches,
      programStatus: input.programStatus,
      receiptAudit: input.receiptAudit,
      replacementAudit: input.replacementAudit,
      fitPublicationAudit: input.fitPublicationAudit,
      epochs: input.epochs,
    },
    storageContentSha256: 'b'.repeat(64),
  });
  assert.equal(advanced.ledger.entries.length, 1);
  assert.equal(advanced.ledger.entries[0].runId, run.runId);
  assert.equal(advanced.control.checkpointCount, 1);

  const driftedEpochs = structuredClone(input.epochs);
  driftedEpochs.find((row) => row.id === 'resolver-contract').semanticSha256 = 'f'.repeat(64);
  assert.throws(() => recordHistoricalDimensionsScaleCheckpoint({
    control,
    ledger: input.ledger,
    manifest: selected,
    run,
    candidateManifest: {
      schemaVersion: 1,
      targets: selected.targetBindings.map((row) => ({
        referenceId: row.referenceId,
        state: 'NO_CANDIDATE_COMPLETE',
        lastDiscoveryRunId: run.runId,
      })),
    },
    currentInput: {
      generatedAt: '2026-07-19T20:06:00.000Z',
      nextBatches: input.nextBatches,
      programStatus: input.programStatus,
      receiptAudit: input.receiptAudit,
      replacementAudit: input.replacementAudit,
      fitPublicationAudit: input.fitPublicationAudit,
      epochs: driftedEpochs,
    },
    storageContentSha256: 'b'.repeat(64),
  }), /epoch drift/i);

  const staleControl = structuredClone(control);
  staleControl.sourceBindings.ledgerSha256 = 'c'.repeat(64);
  const { controlId: ignoredId, semanticControlSha256: ignoredSha, ...semantic } = staleControl;
  staleControl.semanticControlSha256 = canonicalJsonSha256(semantic);
  staleControl.controlId = `historical-dimensions-scale-${staleControl.semanticControlSha256.slice(0, 24)}`;
  assert.throws(() => recordHistoricalDimensionsScaleCheckpoint({
    control: staleControl,
    ledger: input.ledger,
    manifest: selected,
    run,
    candidateManifest: {
      schemaVersion: 1,
      targets: selected.targetBindings.map((row) => ({
        referenceId: row.referenceId,
        state: 'NO_CANDIDATE_COMPLETE',
        lastDiscoveryRunId: run.runId,
      })),
    },
    currentInput: {
      generatedAt: '2026-07-19T20:06:00.000Z',
      nextBatches: input.nextBatches,
      programStatus: input.programStatus,
      receiptAudit: input.receiptAudit,
      replacementAudit: input.replacementAudit,
      fitPublicationAudit: input.fitPublicationAudit,
      epochs: input.epochs,
    },
    storageContentSha256: 'b'.repeat(64),
  }), /ledger.*binding/i);
});
