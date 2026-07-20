import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalEvidenceBoundedBatches,
  resolveHistoricalEvidenceBoundedManifest,
  selectHistoricalDimensionsManifestWindow,
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

function build(input = fixture(), options = {}) {
  return buildHistoricalEvidenceBoundedBatches({ ...input, maximumTargets: 10, ...options });
}

function multiCohortFixture() {
  const input = fixture();
  const familyTargets = [
    target({
      targetId: 'current-beta-family-01',
      brand: 'Beta',
      category: 'dishwasher',
    }),
    target({
      targetId: 'current-beta-family-02',
      brand: 'Beta',
      category: 'dishwasher',
    }),
  ];
  const acquisition = target({
    targetId: 'current-gamma-acquisition',
    brand: 'Gamma',
    category: 'dryer',
    executionLane: 'ACQUISITION',
  });
  const currentFamily = family({
    familyId: 'family-current-beta',
    targetIds: familyTargets.map((row) => row.targetId),
    brand: 'Beta',
    category: 'dishwasher',
  });
  const added = [...familyTargets, acquisition];

  input.executableQueue.discoveryTargets.push(...familyTargets);
  input.executableQueue.targets.push(acquisition);
  input.executableQueue.jobs.push({
    jobId: acquisition.candidateJobIds[0],
    targetIds: [acquisition.targetId],
  });
  input.executableQueue.summary.targets += added.length;
  input.executableQueue.summary.discoveryTargets += familyTargets.length;
  input.executableQueue.summary.acquisitionTargets += 1;
  input.targetState.records.push(...added.map((row) => stateFor(row)));
  input.targetState.summary.records = input.targetState.records.length;
  input.familyCanaries.families.push(currentFamily);
  input.familyCanaries.targetDecisions.push(
    ...familyTargets.map((row, index) => ({
      targetId: row.targetId,
      referenceId: row.referenceId,
      executionLane: row.executionLane,
      familyIds: [currentFamily.familyId],
      assignment: index === 0 ? 'FAMILY_CANARY' : 'FAMILY_MEMBER',
      familyState: 'PASSED',
      representativeTargetId: currentFamily.representativeTargetId,
      runnerAllowed: true,
      fanoutEligible: true,
      reason: 'FAMILY_CANARY_PASSED',
    })),
    {
      targetId: acquisition.targetId,
      referenceId: acquisition.referenceId,
      executionLane: acquisition.executionLane,
      familyIds: [],
      assignment: 'UNSCOPED_SINGLETON',
      runnerAllowed: true,
      fanoutEligible: false,
      reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
    },
  );
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
  return input;
}

function appendCurrentSingletons(input, rows) {
  input.executableQueue.discoveryTargets.push(...rows);
  input.executableQueue.summary.targets += rows.length;
  input.executableQueue.summary.discoveryTargets += rows.length;
  input.targetState.records.push(...rows.map((row) => stateFor(row)));
  input.targetState.summary.records = input.targetState.records.length;
  input.familyCanaries.targetDecisions.push(...rows.map((row) => ({
    targetId: row.targetId,
    referenceId: row.referenceId,
    executionLane: row.executionLane,
    familyIds: [],
    assignment: 'UNSCOPED_SINGLETON',
    runnerAllowed: true,
    fanoutEligible: false,
    reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
  })));
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
  return input;
}

function rehashArtifact(artifact) {
  const { semanticBatchesSha256: ignored, ...semantic } = artifact;
  artifact.semanticBatchesSha256 = canonicalJsonSha256(semantic);
  return artifact;
}

function rehashManifest(artifact, index) {
  const manifest = artifact.manifests[index];
  const priorId = manifest.manifestId;
  const { manifestId: ignoredId, semanticManifestSha256: ignoredSha, ...semantic } = manifest;
  manifest.semanticManifestSha256 = canonicalJsonSha256(semantic);
  manifest.manifestId = `historical_batch_${manifest.semanticManifestSha256.slice(0, 24)}`;
  artifact.manifestWindow.manifestIds = artifact.manifestWindow.manifestIds.map(
    (manifestId) => manifestId === priorId ? manifest.manifestId : manifestId,
  );
  for (const workstream of artifact.workstreams) {
    workstream.manifestIds = workstream.manifestIds.map(
      (manifestId) => manifestId === priorId ? manifest.manifestId : manifestId,
    );
  }
  return rehashArtifact(artifact);
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

test('schema v2 exposes a deterministic multi-cohort window with exact homogeneous manifests', () => {
  const input = multiCohortFixture();
  const first = build(input, { maximumManifestsPerWorkstream: 3 });
  const current = first.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const currentManifests = current.manifestIds.map((manifestId) => (
    first.manifests.find((row) => row.manifestId === manifestId)
  ));

  assert.equal(first.schemaVersion, 2);
  assert.equal(first.plannerVersion, '2');
  assert.deepEqual(first.manifestWindow, {
    schemaVersion: 1,
    cohortKeyVersion: '1',
    maximumManifestsPerWorkstream: 3,
    manifestIds: first.manifests.map((row) => row.manifestId),
  });
  assert.equal(Object.hasOwn(current, 'nextManifestId'), false);
  assert.equal(current.manifestIds.length, 3);
  assert.equal(new Set(currentManifests.map((row) => row.cohortKey)).size, 3);
  assert.deepEqual(currentManifests.map((row) => row.constraints.brand), [
    'Beta', 'Gamma', 'Alpha',
  ]);
  assert.deepEqual(currentManifests.map((row) => row.executionLane), [
    'BOUNDED_DISCOVERY', 'ACQUISITION', 'BOUNDED_DISCOVERY',
  ]);
  for (const manifest of currentManifests) {
    assert.equal(manifest.cohortKeyVersion, '1');
    assert.match(manifest.cohortKey, /^historical_cohort_[a-f0-9]{24}$/);
    assert.ok(manifest.targetBindings.every((row) => row.executionLane === manifest.executionLane));
  }

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
  const second = build(reversed, { maximumManifestsPerWorkstream: 3 });
  assert.deepEqual(second, first);
});

test('manifest window is capped per workstream without duplicating a cohort or target', () => {
  const artifact = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 2 });
  const current = artifact.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const manifests = current.manifestIds.map((id) => artifact.manifests.find((row) => row.manifestId === id));

  assert.equal(current.manifestIds.length, 2);
  assert.equal(current.windowedCohorts, 2);
  assert.ok(current.eligibleCohorts > current.windowedCohorts);
  assert.equal(current.deferredCohorts, current.eligibleCohorts - current.windowedCohorts);
  assert.equal(new Set(manifests.map((row) => row.cohortKey)).size, manifests.length);
  const selectedTargetIds = artifact.manifests.flatMap((manifest) => (
    manifest.targetBindings.map((row) => row.targetId)
  ));
  assert.equal(new Set(selectedTargetIds).size, selectedTargetIds.length);
});

test('priority-preserving window rotation prevents one category from starving the others', () => {
  const input = fixture();
  appendCurrentSingletons(input, [
    ...['Aardvark', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((brand, index) => target({
      targetId: `current-dishwasher-${index}`,
      brand,
      category: 'dishwasher',
    })),
    target({ targetId: 'current-dryer', brand: 'Dryer Brand', category: 'dryer' }),
    target({ targetId: 'current-washer', brand: 'Washer Brand', category: 'washing_machine' }),
  ]);
  const artifact = build(input, { maximumManifestsPerWorkstream: 4 });
  const current = artifact.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const selected = current.manifestIds.map((id) => (
    artifact.manifests.find((manifest) => manifest.manifestId === id)
  ));

  assert.deepEqual(selected.map((manifest) => manifest.constraints.category), [
    'dishwasher', 'dryer', 'fridge', 'washing_machine',
  ]);
  assert.ok(selected.every(
    (manifest) => manifest.constraints.priorityClass === 'P0_CURRENT_MISSING_DIMENSIONS',
  ));
});

test('a local cohort block selects another P0 while P1 and conflict closure stay isolated', () => {
  const artifact = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  const initial = selectHistoricalDimensionsManifestWindow({ batches: artifact });
  const afterBlock = selectHistoricalDimensionsManifestWindow({
    batches: artifact,
    blockedCohortKeys: [initial.manifests[0].cohortKey],
  });

  assert.equal(initial.status, 'RUN_P0');
  assert.equal(initial.p1Blocked, true);
  assert.equal(afterBlock.status, 'RUN_P0');
  assert.equal(afterBlock.p1Blocked, true);
  assert.notEqual(afterBlock.manifests[0].cohortKey, initial.manifests[0].cohortKey);
  assert.ok(afterBlock.manifests.every(
    (manifest) => manifest.constraints.priorityClass === 'P0_CURRENT_MISSING_DIMENSIONS',
  ));
  assert.ok(afterBlock.manifests.every((manifest) => manifest.workstreamId !== 'CONFLICT_CLOSURE'));
  const conflict = artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE');
  assert.ok(conflict.manifestIds.length > 0);
  assert.ok(conflict.manifestIds.every((id) => (
    artifact.manifests.find((manifest) => manifest.manifestId === id).workstreamId === 'CONFLICT_CLOSURE'
  )));
});

test('operational timestamps cannot reorder or rename semantic cohorts', () => {
  const baselineInput = multiCohortFixture();
  const laterInput = structuredClone(baselineInput);
  laterInput.targetState.generatedAt = '2026-07-20T23:59:59.000Z';
  const baseline = build(baselineInput, { maximumManifestsPerWorkstream: 3 });
  const later = build(laterInput, { maximumManifestsPerWorkstream: 3 });
  const order = (artifact) => artifact.manifests.map((manifest) => ({
    cohortKey: manifest.cohortKey,
    targets: manifest.targetBindings.map((row) => row.targetId),
  }));

  assert.deepEqual(order(later), order(baseline));
  assert.notEqual(later.semanticBatchesSha256, baseline.semanticBatchesSha256);
});

test('schema v2 fails closed on duplicate cohorts, mixed constraints, overflow, and window reordering', () => {
  const duplicate = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  duplicate.manifests[1].cohort = structuredClone(duplicate.manifests[0].cohort);
  duplicate.manifests[1].cohortKey = duplicate.manifests[0].cohortKey;
  duplicate.manifests[1].cohortSha256 = duplicate.manifests[0].cohortSha256;
  rehashManifest(duplicate, 1);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(duplicate), /cohort selected more than once/i);

  const mixed = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  mixed.manifests[0].constraints.brand = 'Wrong Brand';
  rehashManifest(mixed, 0);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(mixed), /cohort constraint drift/i);

  const overflow = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  overflow.manifestWindow.maximumManifestsPerWorkstream = 1;
  rehashArtifact(overflow);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(overflow), /cohort accounting drift/i);

  const reordered = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  reordered.manifestWindow.manifestIds.reverse();
  rehashArtifact(reordered);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(reordered), /window ordering drift/i);

  const priorityDrift = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  const current = priorityDrift.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  current.windowedCohortsByPriority = { P1_HISTORICAL_MISSING_DIMENSIONS: current.windowedCohorts };
  rehashArtifact(priorityDrift);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(priorityDrift), /priority.*drift/i);

  const cohortSchema = build(multiCohortFixture(), { maximumManifestsPerWorkstream: 3 });
  cohortSchema.manifests[0].cohort.schemaVersion = 2;
  cohortSchema.manifests[0].cohortSha256 = canonicalJsonSha256(cohortSchema.manifests[0].cohort);
  cohortSchema.manifests[0].cohortKey = `historical_cohort_${cohortSchema.manifests[0].cohortSha256.slice(0, 24)}`;
  rehashManifest(cohortSchema, 0);
  assert.throws(() => validateHistoricalEvidenceBoundedBatches(cohortSchema), /cohort schema/i);
});

test('passed-family expansion is homogeneous and capped at ten targets', () => {
  const artifact = build();
  const workstream = artifact.workstreams.find((row) => row.workstreamId === 'HISTORICAL_DIMENSIONS');
  const manifest = artifact.manifests.find((row) => row.manifestId === workstream.manifestIds[0]);

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
  const manifest = artifact.manifests.find((row) => row.manifestId === workstream.manifestIds[0]);
  assert.equal(manifest.mode, 'SINGLETON');
  assert.deepEqual(manifest.targetBindings.map((row) => row.targetId), ['current-singleton']);
});

test('parser reopen and actionable conflict terminal rows use their exclusive workstreams', () => {
  const artifact = build();
  const parser = artifact.workstreams.find((row) => row.workstreamId === 'PARSER_REPAIR');
  const conflict = artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE');
  assert.equal(artifact.manifests.find((row) => row.manifestId === parser.manifestIds[0]).targetBindings[0].targetId, 'parser-repair');
  assert.equal(artifact.manifests.find((row) => row.manifestId === conflict.manifestIds[0]).targetBindings[0].targetId, 'conflict-acquisition');
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

test('unknown retailer lifecycle is historical recovery work and never enters the current workstream', () => {
  const baseline = build();
  const input = fixture();
  const target = input.executableQueue.discoveryTargets.find((row) => row.targetId === 'current-singleton');
  target.lifecycleState = 'UNKNOWN_RETAIL';
  target.priorityClass = 'P1_HISTORICAL_MISSING_DIMENSIONS';
  const state = input.targetState.records.find((row) => row.referenceId === target.referenceId);
  state.lifecycleState = 'UNKNOWN_RETAIL';
  state.priorityClass = 'P1_HISTORICAL_MISSING_DIMENSIONS';
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
  const current = artifact.workstreams.find((row) => row.workstreamId === 'CURRENT_DIMENSIONS');
  const selectedCurrent = artifact.manifests
    .filter((manifest) => manifest.workstreamId === current.workstreamId)
    .flatMap((manifest) => manifest.targetBindings.map((row) => row.targetId));
  assert.equal(selectedCurrent.includes(target.targetId), false);
  assert.equal(
    artifact.summary.byWorkstream.CURRENT_DIMENSIONS,
    baseline.summary.byWorkstream.CURRENT_DIMENSIONS - 1,
  );
  assert.equal(
    artifact.summary.byWorkstream.HISTORICAL_DIMENSIONS,
    baseline.summary.byWorkstream.HISTORICAL_DIMENSIONS + 1,
  );
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
  assert.deepEqual(artifact.workstreams.find((row) => row.workstreamId === 'PARSER_REPAIR').manifestIds, []);
  assert.deepEqual(artifact.workstreams.find((row) => row.workstreamId === 'CONFLICT_CLOSURE').manifestIds, []);
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
