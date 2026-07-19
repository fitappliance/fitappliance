import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import { assertHistoricalDimensionsScaleManifestAllowed } from './historical-dimensions-scale-control.mjs';

export const HISTORICAL_EVIDENCE_BOUNDED_BATCH_SCHEMA_VERSION = 1;
export const HISTORICAL_EVIDENCE_BOUNDED_BATCH_PLANNER_VERSION = '1';
export const HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS = 10;

const WORKSTREAMS = Object.freeze([
  {
    workstreamId: 'CURRENT_DIMENSIONS',
    description: 'Current-retail dimensions recovery and confirmation',
  },
  {
    workstreamId: 'HISTORICAL_DIMENSIONS',
    description: 'Archived and registry-only dimensions recovery and confirmation',
  },
  {
    workstreamId: 'PARSER_REPAIR',
    description: 'Reopened family canaries after a parser-bound failure',
  },
  {
    workstreamId: 'CONFLICT_CLOSURE',
    description: 'Actionable conflict quarantine with an exact pending-work binding',
  },
]);

const PRIORITY_RANK = new Map([
  ['P0_CURRENT_MISSING_DIMENSIONS', 0],
  ['P1_HISTORICAL_MISSING_DIMENSIONS', 1],
  ['P2_CURRENT_CONFIRMATION', 2],
  ['P3_HISTORICAL_CONFIRMATION', 3],
  ['P4_CONFLICT_RESOLUTION', 4],
]);
const MODE_RANK = new Map([
  ['FAMILY_CANARY', 0],
  ['FAMILY_EXPANSION', 1],
  ['SINGLETON', 2],
]);
const LIFECYCLE_RANK = new Map([
  ['CURRENT_RETAIL', 0],
  ['CATALOG_ARCHIVED', 1],
  ['REGISTRY_ONLY', 2],
]);
const LANE_RANK = new Map([
  ['ACQUISITION', 0],
  ['BOUNDED_DISCOVERY', 1],
]);

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} required`);
  }
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} required`);
  return value;
}

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function requiredSha256(value, label) {
  const normalized = requiredText(value, label);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function normalizedBrand(value) {
  return requiredText(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueMap(rows, key, label) {
  const result = new Map();
  for (const row of requiredArray(rows, `${label} rows`)) {
    const value = requiredText(row?.[key], `${label} ${key}`);
    if (result.has(value)) throw new Error(`${label} duplicate ${key}: ${value}`);
    result.set(value, row);
  }
  return result;
}

function sortedClone(rows, key) {
  return structuredClone(rows).sort((left, right) => (
    requiredText(left?.[key], key).localeCompare(requiredText(right?.[key], key))
  ));
}

function executableQueueSemanticSha256(queue) {
  requiredObject(queue, 'executable queue');
  if (queue.schemaVersion !== 2) throw new TypeError('executable queue schema version 2 required');
  const semantic = structuredClone(queue);
  semantic.jobs = sortedClone(requiredArray(queue.jobs, 'executable queue jobs'), 'jobId');
  semantic.targets = sortedClone(requiredArray(queue.targets, 'executable queue acquisition targets'), 'targetId');
  semantic.discoveryTargets = sortedClone(
    requiredArray(queue.discoveryTargets, 'executable queue discovery targets'),
    'targetId',
  );
  semantic.deferredTargets = sortedClone(
    requiredArray(queue.deferredTargets, 'executable queue deferred targets'),
    'targetId',
  );
  return canonicalJsonSha256(semantic);
}

function targetStateSemanticSha256(targetState) {
  requiredObject(targetState, 'target state');
  if (targetState.schemaVersion !== 1) throw new TypeError('target state schema version 1 required');
  return canonicalJsonSha256({
    ...structuredClone(targetState),
    records: sortedClone(requiredArray(targetState.records, 'target-state records'), 'referenceId'),
  });
}

function familyCanarySemantic(canaries) {
  requiredObject(canaries, 'family canaries');
  if (canaries.schemaVersion !== 2) throw new TypeError('family canary schema version 2 required');
  const semantic = {
    schemaVersion: canaries.schemaVersion,
    generatedAt: requiredText(canaries.generatedAt, 'family canary generatedAt'),
    documentGraphSha256: requiredSha256(canaries.documentGraphSha256, 'document graph SHA-256'),
    executableQueueSha256: requiredSha256(canaries.executableQueueSha256, 'canary queue SHA-256'),
    policySha256: requiredSha256(canaries.policySha256, 'canary policy SHA-256'),
    parserContractSha256: requiredSha256(
      canaries.parserContractSha256,
      'canary parser contract SHA-256',
    ),
    processorEpochs: structuredClone(requiredObject(canaries.processorEpochs, 'processor epochs')),
    families: requiredArray(canaries.families, 'canary families'),
    targetDecisions: requiredArray(canaries.targetDecisions, 'canary target decisions'),
  };
  if (canonicalJsonSha256(semantic) !== requiredSha256(
    canaries.semanticCanarySha256,
    'family canary semantic SHA-256',
  )) throw new Error('family canary semantic hash drift');
  for (const family of semantic.families) {
    const contract = requiredObject(family.contract, `family ${family.familyId} contract`);
    const { sha256, ...contractValue } = contract;
    if (canonicalJsonSha256(contractValue) !== requiredSha256(
      sha256,
      `family ${family.familyId} contract SHA-256`,
    )) throw new Error(`family contract hash drift: ${family.familyId}`);
  }
  return semantic;
}

function familyCanaryControlSha256(canaries, normalizedQueueSha256) {
  const semantic = familyCanarySemantic(canaries);
  return canonicalJsonSha256({
    ...structuredClone(semantic),
    executableQueueSha256: normalizedQueueSha256,
    families: sortedClone(semantic.families, 'familyId'),
    targetDecisions: sortedClone(semantic.targetDecisions, 'targetId'),
  });
}

function sourceBindings({ executableQueue, targetState, familyCanaries }) {
  const queueSha256 = executableQueueSemanticSha256(executableQueue);
  if (familyCanaries.executableQueueSha256 !== canonicalJsonSha256(executableQueue)) {
    throw new Error('family canary queue hash drift');
  }
  return {
    executableQueueSha256: queueSha256,
    targetStateSha256: targetStateSemanticSha256(targetState),
    familyCanarySha256: familyCanaryControlSha256(familyCanaries, queueSha256),
    sourceAcquisitionQueueSha256: requiredSha256(
      executableQueue.sourceAcquisitionQueueSha256,
      'source acquisition queue SHA-256',
    ),
  };
}

function compareTargets(left, right) {
  return (PRIORITY_RANK.get(left.target.priorityClass) ?? 99)
      - (PRIORITY_RANK.get(right.target.priorityClass) ?? 99)
    || (LIFECYCLE_RANK.get(left.target.lifecycleState) ?? 99)
      - (LIFECYCLE_RANK.get(right.target.lifecycleState) ?? 99)
    || left.target.category.localeCompare(right.target.category)
    || normalizedBrand(left.target.brand).localeCompare(normalizedBrand(right.target.brand))
    || left.target.model.localeCompare(right.target.model, 'en-AU', { sensitivity: 'base' })
    || left.target.targetId.localeCompare(right.target.targetId);
}

function parserRepairFamily(family) {
  return family?.state === 'REOPENED'
    && family?.stateEvidence?.previousState === 'FAILED_PARSER';
}

function pendingConflictBinding(state, target) {
  const pending = state?.binding?.pendingWork;
  if (state.state !== 'CONFLICT_QUARANTINE' || state.actionable !== true
    || state.terminal !== true || pending?.type !== 'executable_queue'
    || pending.targetId !== target.targetId || pending.executionLane !== target.executionLane
    || JSON.stringify([...(pending.candidateJobIds ?? [])].sort())
      !== JSON.stringify([...(target.candidateJobIds ?? [])].sort())) {
    throw new Error(`conflict pending-work binding drift: ${target.targetId}`);
  }
  return true;
}

function validatePriorityLifecycle(target) {
  const priorityClass = requiredText(target.priorityClass, 'target priority');
  const lifecycleState = requiredText(target.lifecycleState, 'target lifecycle');
  if (priorityClass === 'P4_CONFLICT_RESOLUTION') return;
  const allowed = lifecycleState === 'CURRENT_RETAIL'
    ? new Set(['P0_CURRENT_MISSING_DIMENSIONS', 'P2_CURRENT_CONFIRMATION'])
    : new Set(['P1_HISTORICAL_MISSING_DIMENSIONS', 'P3_HISTORICAL_CONFIRMATION']);
  if (!['CURRENT_RETAIL', 'CATALOG_ARCHIVED', 'REGISTRY_ONLY'].includes(lifecycleState)
    || !allowed.has(priorityClass)) {
    throw new Error(`target priority/lifecycle mismatch: ${target.targetId}`);
  }
}

function workstreamFor(entry) {
  validatePriorityLifecycle(entry.target);
  if (entry.state.state === 'CONFLICT_QUARANTINE') {
    pendingConflictBinding(entry.state, entry.target);
    return 'CONFLICT_CLOSURE';
  }
  if (entry.target.repairExistingReceipt === true) return 'PARSER_REPAIR';
  if (entry.target.priorityClass === 'P4_CONFLICT_RESOLUTION') return 'CONFLICT_CLOSURE';
  if (parserRepairFamily(entry.family)) return 'PARSER_REPAIR';
  return entry.target.lifecycleState === 'CURRENT_RETAIL'
    ? 'CURRENT_DIMENSIONS'
    : 'HISTORICAL_DIMENSIONS';
}

function suppressionReason(entry) {
  if (entry.state.stateClass === 'COMPLETED') return 'TARGET_COMPLETED';
  if (entry.state.actionable !== true) return 'TARGET_NON_ACTIONABLE';
  if (entry.state.terminal === true && entry.state.state !== 'CONFLICT_QUARANTINE') {
    return 'TARGET_TERMINAL';
  }
  if (entry.decision.runnerAllowed !== true) return 'FAMILY_GATE_BLOCKED';
  return null;
}

function manifestMode(entry) {
  if (['UNSCOPED_SINGLETON', 'MULTI_FAMILY_SINGLETON'].includes(entry.decision.assignment)) {
    return 'SINGLETON';
  }
  if (entry.family?.state === 'PASSED' && entry.decision.fanoutEligible === true) {
    return 'FAMILY_EXPANSION';
  }
  if (entry.decision.assignment === 'FAMILY_CANARY'
    && ['CANARY_READY', 'REOPENED'].includes(entry.family?.state)
    && entry.family.representativeTargetId === entry.target.targetId) {
    return 'FAMILY_CANARY';
  }
  throw new Error(`runner-allowed target has no bounded manifest mode: ${entry.target.targetId}`);
}

function groupKey(entry) {
  const mode = manifestMode(entry);
  const constraint = [
    entry.target.priorityClass,
    entry.target.lifecycleState,
    entry.target.category,
    normalizedBrand(entry.target.brand),
    entry.target.executionLane,
    mode,
  ];
  if (mode === 'SINGLETON') constraint.push(entry.target.targetId);
  else constraint.push(entry.family.familyId);
  return constraint.join('\0');
}

function compareGroups(left, right) {
  const firstLeft = left.entries[0];
  const firstRight = right.entries[0];
  return compareTargets(firstLeft, firstRight)
    || (MODE_RANK.get(left.mode) ?? 99) - (MODE_RANK.get(right.mode) ?? 99)
    || (LANE_RANK.get(firstLeft.target.executionLane) ?? 99)
      - (LANE_RANK.get(firstRight.target.executionLane) ?? 99)
    || left.key.localeCompare(right.key);
}

function constraintsFor(target) {
  return {
    priorityClass: requiredText(target.priorityClass, 'target priority'),
    lifecycleState: requiredText(target.lifecycleState, 'target lifecycle'),
    category: requiredText(target.category, 'target category'),
    brand: requiredText(target.brand, 'target brand'),
    executionLane: requiredText(target.executionLane, 'target execution lane'),
  };
}

function manifestFor({ workstreamId, group, source, maximumTargets, reviewedTargetCount }) {
  const entries = group.entries.slice(0, maximumTargets);
  const first = entries[0];
  const family = group.mode === 'SINGLETON' ? null : first.family;
  const estimatedSharedArtifactCount = group.mode === 'FAMILY_EXPANSION' && entries.length > 1
    ? new Set(family.contract.family.pdfSha256s ?? []).size
    : 0;
  const semantic = {
    schemaVersion: HISTORICAL_EVIDENCE_BOUNDED_BATCH_SCHEMA_VERSION,
    plannerVersion: HISTORICAL_EVIDENCE_BOUNDED_BATCH_PLANNER_VERSION,
    workstreamId,
    mode: group.mode,
    executionLane: first.target.executionLane,
    executionCommand: first.target.executionLane === 'ACQUISITION'
      ? 'recover:historical-evidence'
      : 'discover:historical-official-candidates',
    constraints: constraintsFor(first.target),
    familyId: family?.familyId ?? null,
    familyState: family?.state ?? null,
    sourceBindings: structuredClone(source),
    reviewedTargetCount,
    targetBindings: entries.map((entry) => ({
      targetId: entry.target.targetId,
      referenceId: entry.target.referenceId,
      executionLane: entry.target.executionLane,
      familyId: entry.family?.familyId ?? null,
      assignment: entry.decision.assignment,
    })),
    estimatedSharedArtifactCount,
    estimatedSharedArtifactBasis: estimatedSharedArtifactCount > 0
      ? 'CANONICAL_FAMILY_PDF_HASHES_REUSABLE_ACROSS_SELECTED_TARGETS'
      : 'NO_PROVEN_SHARED_ARTIFACT_IN_SELECTED_TARGETS',
  };
  const semanticManifestSha256 = canonicalJsonSha256(semantic);
  return {
    ...semantic,
    manifestId: `historical_batch_${semanticManifestSha256.slice(0, 24)}`,
    semanticManifestSha256,
  };
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function canonicalEqual(left, right) {
  return canonicalJsonSha256(left) === canonicalJsonSha256(right);
}

function mergeCounts(rows) {
  const totals = new Map();
  for (const row of rows) {
    for (const [key, value] of Object.entries(requiredObject(row, 'count map'))) {
      if (!Number.isInteger(value) || value < 0) throw new TypeError(`count invalid: ${key}`);
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }
  return Object.fromEntries([...totals].sort(([left], [right]) => left.localeCompare(right)));
}

function artifactSemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    plannerVersion: value.plannerVersion,
    generatedAt: value.generatedAt,
    maximumTargets: value.maximumTargets,
    sourceBindings: value.sourceBindings,
    workstreams: value.workstreams,
    manifests: value.manifests,
    summary: value.summary,
  };
}

export function validateHistoricalEvidenceBoundedBatches(value) {
  requiredObject(value, 'bounded batch artifact');
  if (value.schemaVersion !== HISTORICAL_EVIDENCE_BOUNDED_BATCH_SCHEMA_VERSION) {
    throw new TypeError('bounded batch schema version 1 required');
  }
  if (value.plannerVersion !== HISTORICAL_EVIDENCE_BOUNDED_BATCH_PLANNER_VERSION) {
    throw new TypeError('bounded batch planner version unsupported');
  }
  if (!Number.isInteger(value.maximumTargets) || value.maximumTargets < 1
    || value.maximumTargets > HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS) {
    throw new TypeError('bounded batch maximum targets invalid');
  }
  if (canonicalJsonSha256(artifactSemantic(value)) !== requiredSha256(
    value.semanticBatchesSha256,
    'bounded batches semantic SHA-256',
  )) throw new Error('bounded batch artifact hash drift');
  const source = requiredObject(value.sourceBindings, 'bounded source bindings');
  for (const [key, sha256] of Object.entries(source)) {
    requiredSha256(sha256, `bounded source binding ${key}`);
  }
  const manifests = uniqueMap(value.manifests, 'manifestId', 'bounded manifests');
  const manifestedTargetIds = new Set();
  for (const manifest of manifests.values()) {
    const { manifestId, semanticManifestSha256, ...semantic } = manifest;
    const expectedSha256 = canonicalJsonSha256(semantic);
    if (expectedSha256 !== requiredSha256(
      semanticManifestSha256,
      `manifest ${manifestId} semantic SHA-256`,
    ) || manifestId !== `historical_batch_${expectedSha256.slice(0, 24)}`) {
      throw new Error(`bounded manifest hash drift: ${manifestId}`);
    }
    if (!['ACQUISITION', 'BOUNDED_DISCOVERY'].includes(manifest.executionLane)) {
      throw new TypeError(`bounded manifest execution lane invalid: ${manifestId}`);
    }
    if (!canonicalEqual(manifest.sourceBindings, source)) {
      throw new Error(`bounded manifest source binding drift: ${manifestId}`);
    }
    const expectedCommand = manifest.executionLane === 'ACQUISITION'
      ? 'recover:historical-evidence'
      : 'discover:historical-official-candidates';
    if (manifest.executionCommand !== expectedCommand
      || manifest.constraints?.executionLane !== manifest.executionLane) {
      throw new Error(`bounded manifest execution contract drift: ${manifestId}`);
    }
    if (manifest.targetBindings.length < 1 || manifest.targetBindings.length > value.maximumTargets) {
      throw new Error(`bounded manifest target cap invalid: ${manifestId}`);
    }
    if (manifest.mode !== 'FAMILY_EXPANSION' && manifest.targetBindings.length !== 1) {
      throw new Error(`non-expansion manifest must contain one target: ${manifestId}`);
    }
    for (const binding of manifest.targetBindings) {
      const targetId = requiredText(binding.targetId, `manifest ${manifestId} target ID`);
      if (binding.executionLane !== manifest.executionLane) {
        throw new Error(`bounded manifest target lane drift: ${targetId}`);
      }
      if (manifestedTargetIds.has(targetId)) {
        throw new Error(`bounded manifest target selected more than once: ${targetId}`);
      }
      manifestedTargetIds.add(targetId);
    }
  }
  const workstreams = uniqueMap(value.workstreams, 'workstreamId', 'bounded workstreams');
  const manifestReferences = new Map([...manifests.keys()].map((manifestId) => [manifestId, 0]));
  for (const definition of WORKSTREAMS) {
    const row = workstreams.get(definition.workstreamId);
    if (!row) throw new Error(`bounded workstream missing: ${definition.workstreamId}`);
    for (const key of ['assignedTargets', 'eligibleTargets', 'suppressedTargets']) {
      if (!Number.isInteger(row[key]) || row[key] < 0) {
        throw new TypeError(`bounded workstream ${definition.workstreamId} ${key} invalid`);
      }
    }
    if (row.assignedTargets !== row.eligibleTargets + row.suppressedTargets
      || Object.values(requiredObject(
        row.suppressedByReason,
        `bounded workstream ${definition.workstreamId} suppressions`,
      )).reduce((sum, count) => sum + count, 0) !== row.suppressedTargets) {
      throw new Error(`bounded workstream accounting drift: ${definition.workstreamId}`);
    }
    if (row.nextManifestId !== null) {
      const manifest = manifests.get(row.nextManifestId);
      if (!manifest) throw new Error(`bounded workstream manifest missing: ${row.nextManifestId}`);
      if (manifest.workstreamId !== definition.workstreamId) {
        throw new Error(`bounded workstream manifest mismatch: ${row.nextManifestId}`);
      }
      manifestReferences.set(row.nextManifestId, manifestReferences.get(row.nextManifestId) + 1);
    }
  }
  if (workstreams.size !== WORKSTREAMS.length) throw new Error('unknown bounded workstream');
  for (const [manifestId, references] of manifestReferences) {
    if (references !== 1) throw new Error(`bounded manifest workstream reference drift: ${manifestId}`);
  }
  const workstreamRows = [...workstreams.values()];
  const expectedSummary = {
    assignedTargets: workstreamRows.reduce((sum, row) => sum + row.assignedTargets, 0),
    eligibleTargets: workstreamRows.reduce((sum, row) => sum + row.eligibleTargets, 0),
    suppressedTargets: workstreamRows.reduce((sum, row) => sum + row.suppressedTargets, 0),
    suppressedByReason: mergeCounts(workstreamRows.map((row) => row.suppressedByReason)),
    manifests: manifests.size,
    manifestedTargets: [...manifests.values()].reduce(
      (sum, manifest) => sum + manifest.targetBindings.length,
      0,
    ),
    byWorkstream: Object.fromEntries(WORKSTREAMS.map(({ workstreamId }) => [
      workstreamId,
      workstreams.get(workstreamId).assignedTargets,
    ])),
  };
  if (!canonicalEqual(value.summary, expectedSummary)) {
    throw new Error('bounded batch summary accounting drift');
  }
  return value;
}

export function buildHistoricalEvidenceBoundedBatches({
  executableQueue,
  targetState,
  familyCanaries,
  maximumTargets = HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS,
}) {
  if (!Number.isInteger(maximumTargets) || maximumTargets < 1
    || maximumTargets > HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS) {
    throw new TypeError(`maximum targets must be 1-${HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS}`);
  }
  const source = sourceBindings({ executableQueue, targetState, familyCanaries });
  const allTargets = [
    ...requiredArray(executableQueue.targets, 'acquisition targets'),
    ...requiredArray(executableQueue.discoveryTargets, 'discovery targets'),
  ];
  const targetsById = uniqueMap(allTargets, 'targetId', 'executable targets');
  const targetStateByReference = uniqueMap(targetState.records, 'referenceId', 'target state');
  const decisionsByTarget = uniqueMap(
    familyCanaries.targetDecisions,
    'targetId',
    'family target decisions',
  );
  const familiesById = uniqueMap(familyCanaries.families, 'familyId', 'families');
  if (targetsById.size !== executableQueue.summary?.targets) {
    throw new Error('executable target accounting mismatch');
  }
  if (decisionsByTarget.size !== targetsById.size) {
    throw new Error('family decision target coverage mismatch');
  }

  const entries = [...targetsById.values()].map((target) => {
    const state = targetStateByReference.get(target.referenceId);
    const decision = decisionsByTarget.get(target.targetId);
    if (!state || !decision) throw new Error(`target control-plane binding missing: ${target.targetId}`);
    if (state.category !== target.category || normalizedBrand(state.canonicalBrand) !== normalizedBrand(target.brand)
      || state.model.toUpperCase() !== target.model.toUpperCase()
      || state.lifecycleState !== target.lifecycleState
      || decision.referenceId !== target.referenceId
      || decision.executionLane !== target.executionLane) {
      throw new Error(`target control-plane identity drift: ${target.targetId}`);
    }
    const familyIds = requiredArray(decision.familyIds, `target ${target.targetId} family IDs`);
    const family = familyIds.length === 1 ? familiesById.get(familyIds[0]) : null;
    if (familyIds.length === 1 && !family) throw new Error(`target family missing: ${target.targetId}`);
    if (family && (family.category !== target.category
      || normalizedBrand(family.brand) !== normalizedBrand(target.brand)
      || !family.targetIds.includes(target.targetId))) {
      throw new Error(`target family identity drift: ${target.targetId}`);
    }
    const entry = { target, state, decision, family };
    entry.workstreamId = workstreamFor(entry);
    entry.suppressionReason = suppressionReason(entry);
    return entry;
  }).sort(compareTargets);

  const manifests = [];
  const workstreams = WORKSTREAMS.map((definition) => {
    const assigned = entries.filter((entry) => entry.workstreamId === definition.workstreamId);
    const eligible = assigned.filter((entry) => entry.suppressionReason === null);
    const groupsByKey = new Map();
    for (const entry of eligible) {
      const key = groupKey(entry);
      const mode = manifestMode(entry);
      const group = groupsByKey.get(key) ?? { key, mode, entries: [] };
      group.entries.push(entry);
      groupsByKey.set(key, group);
    }
    const groups = [...groupsByKey.values()].map((group) => ({
      ...group,
      entries: group.entries.sort(compareTargets),
    })).sort(compareGroups);
    const nextManifest = groups.length > 0 ? manifestFor({
      workstreamId: definition.workstreamId,
      group: groups[0],
      source,
      maximumTargets,
      reviewedTargetCount: assigned.length,
    }) : null;
    if (nextManifest) manifests.push(nextManifest);
    return {
      ...definition,
      assignedTargets: assigned.length,
      eligibleTargets: eligible.length,
      suppressedTargets: assigned.length - eligible.length,
      suppressedByReason: countBy(
        assigned.filter((entry) => entry.suppressionReason),
        (entry) => entry.suppressionReason,
      ),
      nextManifestId: nextManifest?.manifestId ?? null,
    };
  });
  const generatedAt = new Date(targetState.generatedAt).toISOString();
  const suppressed = entries.filter((entry) => entry.suppressionReason);
  const summary = {
    assignedTargets: entries.length,
    eligibleTargets: entries.length - suppressed.length,
    suppressedTargets: suppressed.length,
    suppressedByReason: countBy(suppressed, (entry) => entry.suppressionReason),
    manifests: manifests.length,
    manifestedTargets: manifests.reduce((sum, manifest) => sum + manifest.targetBindings.length, 0),
    byWorkstream: Object.fromEntries(workstreams.map((row) => [row.workstreamId, row.assignedTargets])),
  };
  const semantic = {
    schemaVersion: HISTORICAL_EVIDENCE_BOUNDED_BATCH_SCHEMA_VERSION,
    plannerVersion: HISTORICAL_EVIDENCE_BOUNDED_BATCH_PLANNER_VERSION,
    generatedAt,
    maximumTargets,
    sourceBindings: source,
    workstreams,
    manifests: manifests.sort((left, right) => left.workstreamId.localeCompare(right.workstreamId)),
    summary,
  };
  return validateHistoricalEvidenceBoundedBatches({
    ...semantic,
    semanticBatchesSha256: canonicalJsonSha256(semantic),
  });
}

export function resolveHistoricalEvidenceBoundedManifest({
  batches,
  manifestId,
  expectedExecutionLane,
  executableQueue,
  targetState,
  familyCanaries,
  scaleControl = null,
}) {
  validateHistoricalEvidenceBoundedBatches(batches);
  const id = requiredText(manifestId, 'bounded manifest ID');
  const manifest = batches.manifests.find((row) => row.manifestId === id);
  if (!manifest) throw new TypeError(`unknown bounded manifest ID: ${id}`);
  const validatedManifest = validateHistoricalEvidenceBoundedManifestSnapshot({
    manifest,
    expectedExecutionLane,
    executableQueue,
    targetState,
    familyCanaries,
  });
  if (scaleControl) assertHistoricalDimensionsScaleManifestAllowed({
    control: scaleControl,
    batches,
    manifest: validatedManifest,
  });
  return validatedManifest;
}

export function validateHistoricalEvidenceBoundedManifestSnapshot({
  manifest,
  expectedExecutionLane,
  executableQueue,
  targetState,
  familyCanaries,
}) {
  requiredObject(manifest, 'bounded manifest snapshot');
  const { manifestId, semanticManifestSha256, ...semantic } = manifest;
  const manifestSha256 = canonicalJsonSha256(semantic);
  if (manifestId !== `historical_batch_${manifestSha256.slice(0, 24)}`
    || semanticManifestSha256 !== manifestSha256) {
    throw new Error(`bounded manifest snapshot hash drift: ${manifestId ?? '<missing>'}`);
  }
  const expectedSource = sourceBindings({ executableQueue, targetState, familyCanaries });
  for (const [key, value] of Object.entries(expectedSource)) {
    if (manifest.sourceBindings[key] !== value) {
      const label = key === 'executableQueueSha256' ? 'queue' : key;
      throw new Error(`${label} hash drift against bounded manifest`);
    }
  }
  if (manifest.executionLane !== requiredText(expectedExecutionLane, 'expected execution lane')) {
    throw new Error(`bounded manifest execution lane mismatch: ${manifest.executionLane}`);
  }
  const targetsById = uniqueMap([
    ...executableQueue.targets,
    ...executableQueue.discoveryTargets,
  ], 'targetId', 'executable targets');
  const statesByReference = uniqueMap(targetState.records, 'referenceId', 'target state');
  const decisionsByTarget = uniqueMap(
    familyCanaries.targetDecisions,
    'targetId',
    'family target decisions',
  );
  const familiesById = uniqueMap(familyCanaries.families, 'familyId', 'families');
  const selectedEntries = [];
  for (const binding of manifest.targetBindings) {
    const target = targetsById.get(binding.targetId);
    if (!target || target.referenceId !== binding.referenceId
      || target.executionLane !== binding.executionLane) {
      throw new Error(`bounded manifest target binding drift: ${binding.targetId}`);
    }
    const state = statesByReference.get(target.referenceId);
    const decision = decisionsByTarget.get(target.targetId);
    if (!state || !decision || state.category !== target.category
      || normalizedBrand(state.canonicalBrand) !== normalizedBrand(target.brand)
      || state.model.toUpperCase() !== target.model.toUpperCase()
      || state.lifecycleState !== target.lifecycleState
      || decision.referenceId !== target.referenceId
      || decision.executionLane !== target.executionLane) {
      throw new Error(`bounded manifest control-plane identity drift: ${binding.targetId}`);
    }
    const familyIds = requiredArray(decision.familyIds, `target ${target.targetId} family IDs`);
    const family = familyIds.length === 1 ? familiesById.get(familyIds[0]) : null;
    if (familyIds.length === 1 && !family) {
      throw new Error(`bounded manifest target family missing: ${binding.targetId}`);
    }
    if (family && (family.category !== target.category
      || normalizedBrand(family.brand) !== normalizedBrand(target.brand)
      || !family.targetIds.includes(target.targetId))) {
      throw new Error(`bounded manifest family identity drift: ${binding.targetId}`);
    }
    if (binding.familyId !== (family?.familyId ?? null)
      || binding.assignment !== decision.assignment) {
      throw new Error(`bounded manifest family binding drift: ${binding.targetId}`);
    }
    const entry = { target, state, decision, family };
    entry.workstreamId = workstreamFor(entry);
    entry.suppressionReason = suppressionReason(entry);
    if (entry.suppressionReason !== null) {
      throw new Error(`bounded manifest contains suppressed target: ${binding.targetId}`);
    }
    selectedEntries.push(entry);
  }
  const first = selectedEntries[0];
  const expectedConstraints = constraintsFor(first.target);
  if (!canonicalEqual(manifest.constraints, expectedConstraints)
    || selectedEntries.some((entry) => !canonicalEqual(constraintsFor(entry.target), expectedConstraints))) {
    throw new Error('bounded manifest constraint drift');
  }
  if (selectedEntries.some((entry) => entry.workstreamId !== manifest.workstreamId)) {
    throw new Error('bounded manifest workstream drift');
  }
  const expectedMode = manifestMode(first);
  if (manifest.mode !== expectedMode
    || selectedEntries.some((entry) => manifestMode(entry) !== expectedMode
      || groupKey(entry) !== groupKey(first))) {
    throw new Error('bounded manifest grouping drift');
  }
  const expectedFamily = expectedMode === 'SINGLETON' ? null : first.family;
  if (manifest.familyId !== (expectedFamily?.familyId ?? null)
    || manifest.familyState !== (expectedFamily?.state ?? null)) {
    throw new Error('bounded manifest family audit drift');
  }
  const expectedSharedArtifacts = expectedMode === 'FAMILY_EXPANSION'
    && selectedEntries.length > 1
    ? new Set(expectedFamily.contract.family.pdfSha256s ?? []).size
    : 0;
  const expectedSharedBasis = expectedSharedArtifacts > 0
    ? 'CANONICAL_FAMILY_PDF_HASHES_REUSABLE_ACROSS_SELECTED_TARGETS'
    : 'NO_PROVEN_SHARED_ARTIFACT_IN_SELECTED_TARGETS';
  if (manifest.estimatedSharedArtifactCount !== expectedSharedArtifacts
    || manifest.estimatedSharedArtifactBasis !== expectedSharedBasis) {
    throw new Error('bounded manifest shared-artifact estimate drift');
  }
  const allEntries = [...targetsById.values()].map((target) => {
    const state = statesByReference.get(target.referenceId);
    const decision = decisionsByTarget.get(target.targetId);
    if (!state || !decision) throw new Error(`target control-plane binding missing: ${target.targetId}`);
    const familyIds = requiredArray(decision.familyIds, `target ${target.targetId} family IDs`);
    const family = familyIds.length === 1 ? familiesById.get(familyIds[0]) : null;
    const entry = { target, state, decision, family };
    entry.workstreamId = workstreamFor(entry);
    return entry;
  });
  if (manifest.reviewedTargetCount !== allEntries.filter(
    (entry) => entry.workstreamId === manifest.workstreamId,
  ).length) {
    throw new Error('bounded manifest reviewed-target accounting drift');
  }
  return structuredClone(manifest);
}
