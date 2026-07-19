import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalEvidenceBoundedBatches,
  resolveHistoricalEvidenceBoundedManifest,
  validateHistoricalEvidenceBoundedBatches,
  validateHistoricalEvidenceBoundedManifestSnapshot,
} from '../../src/domain/historical-evidence-bounded-batch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const GENERATED_AT = '2026-07-19T00:00:00.000Z';
const SHA = (value) => value.repeat(64);

function target({
  targetId,
  referenceId = `ref-${targetId}`,
  brand = 'Alpha',
  model = targetId.toUpperCase(),
  category = 'fridge',
  lifecycleState = 'CURRENT_RETAIL',
  priorityClass = 'P0_CURRENT_MISSING_DIMENSIONS',
  executionLane = 'BOUNDED_DISCOVERY',
  repairExistingReceipt = false,
}) {
  return {
    targetId,
    referenceId,
    brand,
    model,
    category,
    lifecycleState,
    priorityClass,
    executionLane,
    repairExistingReceipt,
    candidateJobIds: executionLane === 'ACQUISITION' ? [`job-${targetId}`] : [],
    primaryJobId: executionLane === 'ACQUISITION' ? `job-${targetId}` : null,
  };
}

function stateFor(row, overrides = {}) {
  return {
    referenceId: row.referenceId,
    category: row.category,
    canonicalBrand: row.brand,
    model: row.model,
    lifecycleState: row.lifecycleState,
    state: 'SOURCE_DISCOVERY_REQUIRED',
    stateClass: 'ACTIONABLE',
    actionable: true,
    terminal: false,
    binding: {
      type: 'executable_queue',
      targetId: row.targetId,
      executionLane: row.executionLane,
      candidateJobIds: [...row.candidateJobIds],
    },
    reopeningConditions: [],
    ...overrides,
  };
}

function family({
  familyId,
  targetIds,
  state = 'PASSED',
  previousState = null,
  brand = 'Beta',
  category = 'dishwasher',
}) {
  const contractValue = {
    schemaVersion: 1,
    family: {
      familyId,
      category,
      brand,
      groupType: 'parser_family',
      documentIds: [`doc-${familyId}`],
      pdfSha256s: [SHA('d')],
      grammarProfileIds: [`grammar-${familyId}`],
    },
    graphSourceUrls: [`https://official.example/${familyId}.pdf`],
    candidateSourceUrls: [],
    resolverContracts: [],
    policySha256: SHA('a'),
    parserContractSha256: SHA('b'),
    processorEpochs: {},
  };
  return {
    familyId,
    category,
    brand,
    groupType: 'parser_family',
    groupName: familyId,
    targetIds,
    representativeTargetId: targetIds[0],
    provenRepresentativeTargetIds: state === 'PASSED' ? [targetIds[0]] : [],
    contract: { ...contractValue, sha256: canonicalJsonSha256(contractValue) },
    state,
    stateReason: state === 'REOPENED' ? 'FAMILY_CONTRACT_CHANGED' : `FIXTURE_${state}`,
    ...(previousState ? { stateEvidence: { previousState } } : {}),
  };
}

function fixture() {
  const currentSingleton = target({ targetId: 'current-singleton' });
  const currentBlocked = target({ targetId: 'current-blocked' });
  const historyFamilyTargets = Array.from({ length: 12 }, (_, index) => target({
    targetId: `history-family-${String(index + 1).padStart(2, '0')}`,
    brand: 'Beta',
    category: 'dishwasher',
    lifecycleState: 'CATALOG_ARCHIVED',
    priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS',
  }));
  const parserRepair = target({
    targetId: 'parser-repair',
    brand: 'Gamma',
    category: 'washing_machine',
    lifecycleState: 'REGISTRY_ONLY',
    priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS',
  });
  const conflict = target({
    targetId: 'conflict-acquisition',
    brand: 'Delta',
    category: 'dryer',
    priorityClass: 'P2_CURRENT_CONFIRMATION',
    executionLane: 'ACQUISITION',
  });
  const completed = target({
    targetId: 'completed-history',
    brand: 'Epsilon',
    lifecycleState: 'CATALOG_ARCHIVED',
    priorityClass: 'P3_HISTORICAL_CONFIRMATION',
  });
  const allTargets = [
    currentSingleton,
    currentBlocked,
    ...historyFamilyTargets,
    parserRepair,
    conflict,
    completed,
  ];
  const historyFamily = family({
    familyId: 'family-history',
    targetIds: historyFamilyTargets.map((row) => row.targetId),
  });
  const parserFamily = family({
    familyId: 'family-parser',
    targetIds: [parserRepair.targetId],
    state: 'REOPENED',
    previousState: 'FAILED_PARSER',
    brand: 'Gamma',
    category: 'washing_machine',
  });
  const blockedFamily = family({
    familyId: 'family-blocked',
    targetIds: [currentBlocked.targetId],
    state: 'FAILED_SOURCE',
    brand: currentBlocked.brand,
    category: currentBlocked.category,
  });
  const jobs = allTargets
    .filter((row) => row.executionLane === 'ACQUISITION')
    .map((row) => ({ jobId: row.candidateJobIds[0], targetIds: [row.targetId] }));
  const executableQueue = {
    schemaVersion: 2,
    generatedAt: GENERATED_AT,
    sourceAcquisitionQueueSha256: SHA('1'),
    sourceOfficialCandidateManifestSha256: SHA('2'),
    evidenceProcessorEpochs: {},
    jobs,
    targets: allTargets.filter((row) => row.executionLane === 'ACQUISITION'),
    discoveryTargets: allTargets.filter((row) => row.executionLane === 'BOUNDED_DISCOVERY'),
    deferredTargets: [],
    summary: {
      targets: allTargets.length,
      acquisitionTargets: 1,
      discoveryTargets: allTargets.length - 1,
      deferredTargets: 0,
    },
  };
  const stateRecords = allTargets.map((row) => stateFor(row));
  Object.assign(stateRecords.find((row) => row.referenceId === conflict.referenceId), {
    state: 'CONFLICT_QUARANTINE',
    stateClass: 'BLOCKED',
    actionable: true,
    terminal: true,
    binding: {
      type: 'classification',
      pendingWork: {
        type: 'executable_queue',
        targetId: conflict.targetId,
        executionLane: conflict.executionLane,
        candidateJobIds: [...conflict.candidateJobIds],
      },
    },
  });
  Object.assign(stateRecords.find((row) => row.referenceId === completed.referenceId), {
    state: 'DIMENSIONS_RECEIPT', stateClass: 'COMPLETED', actionable: false, terminal: true,
  });
  const targetState = {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    summary: { records: stateRecords.length },
    records: stateRecords,
  };
  const decisions = allTargets.map((row) => ({
    targetId: row.targetId,
    referenceId: row.referenceId,
    executionLane: row.executionLane,
    familyIds: [],
    assignment: 'UNSCOPED_SINGLETON',
    runnerAllowed: true,
    fanoutEligible: false,
    reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
  }));
  for (const row of historyFamilyTargets) {
    Object.assign(decisions.find((entry) => entry.targetId === row.targetId), {
      familyIds: [historyFamily.familyId],
      assignment: row.targetId === historyFamily.representativeTargetId ? 'FAMILY_CANARY' : 'FAMILY_MEMBER',
      familyState: 'PASSED',
      representativeTargetId: historyFamily.representativeTargetId,
      runnerAllowed: true,
      fanoutEligible: true,
      reason: 'FAMILY_CANARY_PASSED',
    });
  }
  Object.assign(decisions.find((entry) => entry.targetId === parserRepair.targetId), {
    familyIds: [parserFamily.familyId],
    assignment: 'FAMILY_CANARY',
    familyState: 'REOPENED',
    representativeTargetId: parserRepair.targetId,
    runnerAllowed: true,
    fanoutEligible: false,
    reason: 'FAMILY_CANARY_EXECUTION',
  });
  Object.assign(decisions.find((entry) => entry.targetId === currentBlocked.targetId), {
    familyIds: [blockedFamily.familyId],
    assignment: 'FAMILY_CANARY',
    familyState: 'FAILED_SOURCE',
    representativeTargetId: currentBlocked.targetId,
    runnerAllowed: false,
    fanoutEligible: false,
    reason: 'FAMILY_FAILED_SOURCE',
  });
  const canarySemantic = {
    schemaVersion: 2,
    generatedAt: GENERATED_AT,
    documentGraphSha256: SHA('3'),
    executableQueueSha256: canonicalJsonSha256(executableQueue),
    policySha256: SHA('a'),
    parserContractSha256: SHA('b'),
    processorEpochs: {},
    families: [historyFamily, parserFamily, blockedFamily],
    targetDecisions: decisions,
  };
  const familyCanaries = {
    ...canarySemantic,
    semanticCanarySha256: canonicalJsonSha256(canarySemantic),
    summary: {},
  };
  return { executableQueue, targetState, familyCanaries };
}

function build(input = fixture()) {
  return buildHistoricalEvidenceBoundedBatches({ ...input, maximumTargets: 10 });
}

test('bounded manifests are deterministic regardless of source row order', () => {
  const input = fixture();
  const first = build(input);
  const reversed = structuredClone(input);
  reversed.executableQueue.targets.reverse();
  reversed.executableQueue.discoveryTargets.reverse();
  reversed.targetState.records.reverse();
  reversed.familyCanaries.targetDecisions.reverse();
  reversed.familyCanaries.families.reverse();
  reversed.familyCanaries.executableQueueSha256 = canonicalJsonSha256(reversed.executableQueue);
  const semantic = {
    schemaVersion: reversed.familyCanaries.schemaVersion,
    generatedAt: reversed.familyCanaries.generatedAt,
    documentGraphSha256: reversed.familyCanaries.documentGraphSha256,
    executableQueueSha256: reversed.familyCanaries.executableQueueSha256,
    policySha256: reversed.familyCanaries.policySha256,
    parserContractSha256: reversed.familyCanaries.parserContractSha256,
    processorEpochs: reversed.familyCanaries.processorEpochs,
    families: reversed.familyCanaries.families,
    targetDecisions: reversed.familyCanaries.targetDecisions,
  };
  reversed.familyCanaries.semanticCanarySha256 = canonicalJsonSha256(semantic);

  const second = build(reversed);
  assert.deepEqual(second.manifests, first.manifests);
  assert.deepEqual(second.workstreams, first.workstreams);
  assert.equal(second.semanticBatchesSha256, first.semanticBatchesSha256);
});

test('passed-family expansion is homogeneous and capped at ten targets', () => {
  const artifact = build();
  const workstream = artifact.workstreams.find((row) => row.workstreamId === 'HISTORICAL_DIMENSIONS');
  const manifest = artifact.manifests.find((row) => row.manifestId === workstream.nextManifestId);

  assert.equal(manifest.mode, 'FAMILY_EXPANSION');
  assert.equal(manifest.familyId, 'family-history');
  assert.equal(manifest.targetBindings.length, 10);
  assert.equal(new Set(manifest.targetBindings.map((row) => row.familyId)).size, 1);
  assert.deepEqual(manifest.constraints, {
    priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS',
    lifecycleState: 'CATALOG_ARCHIVED',
    category: 'dishwasher',
    brand: 'Beta',
    executionLane: 'BOUNDED_DISCOVERY',
  });
  assert.equal(manifest.estimatedSharedArtifactCount, 1);
});

test('unscoped targets are emitted only as singleton manifests', () => {
  const artifact = build();
  const workstream = artifact.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const manifest = artifact.manifests.find((row) => row.manifestId === workstream.nextManifestId);
  assert.equal(manifest.mode, 'SINGLETON');
  assert.deepEqual(manifest.targetBindings.map((row) => row.targetId), ['current-singleton']);
});

test('parser reopen and actionable conflict terminal rows use their exclusive workstreams', () => {
  const artifact = build();
  const parser = artifact.workstreams.find((row) => row.workstreamId === 'PARSER_REPAIR');
  const conflict = artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE');
  assert.equal(artifact.manifests.find((row) => row.manifestId === parser.nextManifestId).targetBindings[0].targetId, 'parser-repair');
  assert.equal(artifact.manifests.find((row) => row.manifestId === conflict.nextManifestId).targetBindings[0].targetId, 'conflict-acquisition');
  assert.equal(conflict.assignedTargets, 1);
});

test('P4 discovery work enters conflict closure without pretending to be quarantine terminal', () => {
  const input = fixture();
  const targetRow = input.executableQueue.discoveryTargets.find(
    (row) => row.targetId === 'current-singleton',
  );
  targetRow.priorityClass = 'P4_CONFLICT_RESOLUTION';
  input.familyCanaries.executableQueueSha256 = canonicalJsonSha256(input.executableQueue);
  const semantic = {
    schemaVersion: input.familyCanaries.schemaVersion,
    generatedAt: input.familyCanaries.generatedAt,
    documentGraphSha256: input.familyCanaries.documentGraphSha256,
    executableQueueSha256: input.familyCanaries.executableQueueSha256,
    policySha256: input.familyCanaries.policySha256,
    parserContractSha256: input.familyCanaries.parserContractSha256,
    processorEpochs: input.familyCanaries.processorEpochs,
    families: input.familyCanaries.families,
    targetDecisions: input.familyCanaries.targetDecisions,
  };
  input.familyCanaries.semanticCanarySha256 = canonicalJsonSha256(semantic);

  const artifact = build(input);
  const conflict = artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE');
  assert.equal(conflict.assignedTargets, 2);
  assert.equal(conflict.eligibleTargets, 2);
});

test('explicit receipt repair takes parser-repair precedence over P4 conflict priority', () => {
  const input = fixture();
  const targetRow = input.executableQueue.discoveryTargets.find(
    (row) => row.targetId === 'current-singleton',
  );
  targetRow.priorityClass = 'P4_CONFLICT_RESOLUTION';
  targetRow.repairExistingReceipt = true;
  input.familyCanaries.executableQueueSha256 = canonicalJsonSha256(input.executableQueue);
  const semantic = {
    schemaVersion: input.familyCanaries.schemaVersion,
    generatedAt: input.familyCanaries.generatedAt,
    documentGraphSha256: input.familyCanaries.documentGraphSha256,
    executableQueueSha256: input.familyCanaries.executableQueueSha256,
    policySha256: input.familyCanaries.policySha256,
    parserContractSha256: input.familyCanaries.parserContractSha256,
    processorEpochs: input.familyCanaries.processorEpochs,
    families: input.familyCanaries.families,
    targetDecisions: input.familyCanaries.targetDecisions,
  };
  input.familyCanaries.semanticCanarySha256 = canonicalJsonSha256(semantic);

  const artifact = build(input);
  const parser = artifact.workstreams.find((row) => row.workstreamId === 'PARSER_REPAIR');
  const conflict = artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE');
  assert.equal(parser.assignedTargets, 2);
  assert.equal(conflict.assignedTargets, 1);
});

test('priority semantics cannot cross current and historical lifecycle workstreams', () => {
  const input = fixture();
  const targetRow = input.executableQueue.discoveryTargets.find(
    (row) => row.targetId === 'current-singleton',
  );
  targetRow.priorityClass = 'P1_HISTORICAL_MISSING_DIMENSIONS';
  input.familyCanaries.executableQueueSha256 = canonicalJsonSha256(input.executableQueue);
  const semantic = {
    schemaVersion: input.familyCanaries.schemaVersion,
    generatedAt: input.familyCanaries.generatedAt,
    documentGraphSha256: input.familyCanaries.documentGraphSha256,
    executableQueueSha256: input.familyCanaries.executableQueueSha256,
    policySha256: input.familyCanaries.policySha256,
    parserContractSha256: input.familyCanaries.parserContractSha256,
    processorEpochs: input.familyCanaries.processorEpochs,
    families: input.familyCanaries.families,
    targetDecisions: input.familyCanaries.targetDecisions,
  };
  input.familyCanaries.semanticCanarySha256 = canonicalJsonSha256(semantic);

  assert.throws(() => build(input), /priority.*lifecycle/i);
});

test('completed, non-actionable and family-gated rows remain counted but cannot enter manifests', () => {
  const artifact = build();
  const selected = new Set(artifact.manifests.flatMap((manifest) => (
    manifest.targetBindings.map((row) => row.targetId)
  )));
  assert.equal(selected.has('completed-history'), false);
  assert.equal(selected.has('current-blocked'), false);
  assert.equal(artifact.summary.suppressedTargets, 2);
  assert.deepEqual(artifact.summary.suppressedByReason, {
    FAMILY_GATE_BLOCKED: 1,
    TARGET_COMPLETED: 1,
  });
});

test('every actionable target is assigned once and empty workstream queues stay explicit', () => {
  const input = fixture();
  input.executableQueue.targets = [];
  input.executableQueue.discoveryTargets = input.executableQueue.discoveryTargets.filter(
    (row) => !['parser-repair', 'conflict-acquisition'].includes(row.targetId),
  );
  input.executableQueue.jobs = [];
  input.executableQueue.summary.targets = input.executableQueue.discoveryTargets.length;
  input.executableQueue.summary.acquisitionTargets = 0;
  input.executableQueue.summary.discoveryTargets = input.executableQueue.discoveryTargets.length;
  input.targetState.records = input.targetState.records.filter(
    (row) => !['ref-parser-repair', 'ref-conflict-acquisition'].includes(row.referenceId),
  );
  input.targetState.summary.records = input.targetState.records.length;
  input.familyCanaries.targetDecisions = input.familyCanaries.targetDecisions.filter(
    (row) => !['parser-repair', 'conflict-acquisition'].includes(row.targetId),
  );
  input.familyCanaries.families = input.familyCanaries.families.filter((row) => row.familyId !== 'family-parser');
  input.familyCanaries.executableQueueSha256 = canonicalJsonSha256(input.executableQueue);
  const semantic = {
    schemaVersion: input.familyCanaries.schemaVersion,
    generatedAt: input.familyCanaries.generatedAt,
    documentGraphSha256: input.familyCanaries.documentGraphSha256,
    executableQueueSha256: input.familyCanaries.executableQueueSha256,
    policySha256: input.familyCanaries.policySha256,
    parserContractSha256: input.familyCanaries.parserContractSha256,
    processorEpochs: input.familyCanaries.processorEpochs,
    families: input.familyCanaries.families,
    targetDecisions: input.familyCanaries.targetDecisions,
  };
  input.familyCanaries.semanticCanarySha256 = canonicalJsonSha256(semantic);

  const artifact = build(input);
  assert.equal(artifact.workstreams.find((row) => row.workstreamId === 'PARSER_REPAIR').nextManifestId, null);
  assert.equal(artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE').nextManifestId, null);
  assert.equal(artifact.summary.assignedTargets, input.executableQueue.summary.targets);
});

test('conflict exception fails closed when pending executable binding drifts', () => {
  const input = fixture();
  const state = input.targetState.records.find((row) => row.referenceId === 'ref-conflict-acquisition');
  state.binding.pendingWork.targetId = 'wrong-target';
  assert.throws(() => build(input), /conflict.*binding/i);
});

test('manifest resolution rejects source drift and an incompatible execution lane', () => {
  const input = fixture();
  const artifact = build(input);
  const manifest = artifact.manifests.find((row) => row.executionLane === 'ACQUISITION');
  assert.throws(() => resolveHistoricalEvidenceBoundedManifest({
    batches: artifact,
    manifestId: manifest.manifestId,
    expectedExecutionLane: 'BOUNDED_DISCOVERY',
    ...input,
  }), /execution lane/i);

  const driftedQueue = structuredClone(input.executableQueue);
  driftedQueue.discoveryTargets[0].model = 'DRIFTED';
  assert.throws(() => resolveHistoricalEvidenceBoundedManifest({
    batches: artifact,
    manifestId: manifest.manifestId,
    expectedExecutionLane: 'ACQUISITION',
    executableQueue: driftedQueue,
    targetState: input.targetState,
    familyCanaries: input.familyCanaries,
  }), /queue hash drift/i);
});

test('bounded artifact summary is immutable and hash-bound', () => {
  const artifact = build();
  artifact.summary.assignedTargets += 1;
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(artifact), /artifact hash drift/i);
});

test('manifest snapshot revalidates audit constraints against its exact target', () => {
  const input = fixture();
  const artifact = build(input);
  const original = artifact.manifests.find((row) => row.executionLane === 'ACQUISITION');
  const tampered = structuredClone(original);
  tampered.constraints.brand = 'Wrong Brand';
  const { manifestId: ignoredId, semanticManifestSha256: ignoredSha, ...semantic } = tampered;
  tampered.semanticManifestSha256 = canonicalJsonSha256(semantic);
  tampered.manifestId = `historical_batch_${tampered.semanticManifestSha256.slice(0, 24)}`;

  assert.throws(() => validateHistoricalEvidenceBoundedManifestSnapshot({
    manifest: tampered,
    expectedExecutionLane: 'ACQUISITION',
    ...input,
  }), /constraint drift/i);
});
