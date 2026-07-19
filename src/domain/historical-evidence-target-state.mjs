const CLASSIFICATION_PATH = 'data/architecture-v2/generated/historical-model-evidence-classification.json';
const EXECUTABLE_QUEUE_PATH = 'data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json';

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`);
  return value;
}

function schema(value, expected, label) {
  if (value?.schemaVersion !== expected) throw new TypeError(`${label} schema version ${expected} required`);
  return value;
}

function uniqueMap(rows, key, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} rows required`);
  const result = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (typeof value !== 'string' || !value || result.has(value)) {
      throw new Error(`${label} duplicate or missing ${key}: ${value ?? '<missing>'}`);
    }
    result.set(value, row);
  }
  return result;
}

function countBy(records, key) {
  const counts = new Map();
  for (const record of records) counts.set(record[key], (counts.get(record[key]) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function countObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} required`);
  return Object.values(value).reduce((sum, count) => sum + integer(count, `${label} count`), 0);
}

function sourceAttemptsFor(referenceId, ledger, resolvedAttemptIds) {
  const matching = (ledger.entries ?? []).filter((entry) => entry.referenceId === referenceId);
  return {
    activeRetryable: matching.filter((entry) => (
      entry.suppressesSamePolicySource === false && !resolvedAttemptIds.has(entry.attemptId)
    )).length,
    activeTerminal: matching.filter((entry) => (
      entry.suppressesSamePolicySource === true && !resolvedAttemptIds.has(entry.attemptId)
    )).length,
    resolved: matching.filter((entry) => resolvedAttemptIds.has(entry.attemptId)).length,
  };
}

function receiptBinding(record, acceptanceEntry) {
  const receiptIds = [...new Set((record.documentLinks ?? [])
    .flatMap((document) => document.evidenceObjectIds ?? [])
    .filter((value) => typeof value === 'string' && value.startsWith('receipt:')))].sort();
  if (!receiptIds.length) throw new Error(`current receipt binding missing: ${record.referenceId}`);
  const receiptBindingSha256s = [...new Set((acceptanceEntry?.sources ?? [])
    .map((source) => source?.verificationReceipt?.bindingSha256)
    .filter((value) => /^[a-f0-9]{64}$/.test(String(value ?? ''))))].sort();
  return {
    type: 'receipt',
    receiptIds,
    ...(acceptanceEntry ? {
      acceptanceTargetId: acceptanceEntry.targetId,
      receiptBindingSha256s,
    } : {}),
  };
}

function targetAttemptFor(referenceId, ledger) {
  const attempts = (ledger.targetAttempts ?? [])
    .filter((entry) => entry.referenceId === referenceId)
    .sort((left, right) => (
      new Date(right.attemptedAt).valueOf() - new Date(left.attemptedAt).valueOf()
        || right.targetAttemptId.localeCompare(left.targetAttemptId)
    ));
  return attempts[0] ?? null;
}

function targetAttemptBinding(attempt, evidenceProcessorEpochs) {
  if (!['complete_zero_candidate_inventory', 'complete_exhausted_candidate_inventory'].includes(attempt.reason)) {
    throw new TypeError(`unsupported target attempt reason: ${attempt.reason}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(attempt.policySha256 ?? ''))
    || !/^[a-f0-9]{64}$/.test(String(attempt.resolverSetSha256 ?? ''))
    || typeof attempt.runId !== 'string' || !attempt.runId
    || typeof attempt.batchId !== 'string' || !attempt.batchId) {
    throw new TypeError(`target attempt binding incomplete: ${attempt.targetAttemptId}`);
  }
  const attemptedAt = new Date(attempt.attemptedAt);
  if (Number.isNaN(attemptedAt.valueOf())) {
    throw new TypeError(`target attempt attemptedAt invalid: ${attempt.targetAttemptId}`);
  }
  if (!evidenceProcessorEpochs || typeof evidenceProcessorEpochs !== 'object'
    || Array.isArray(evidenceProcessorEpochs)) {
    throw new TypeError('evidence processor epochs required for target attempt binding');
  }
  for (const [processorId, epoch] of Object.entries(evidenceProcessorEpochs)) {
    if (!processorId || !/^[a-f0-9]{64}$/.test(String(epoch ?? ''))) {
      throw new TypeError(`evidence processor epoch invalid: ${processorId || '<missing>'}`);
    }
  }
  return {
    type: 'target_attempt',
    targetAttemptId: attempt.targetAttemptId,
    reason: attempt.reason,
    policySha256: attempt.policySha256,
    resolverSetSha256: attempt.resolverSetSha256,
    runId: attempt.runId,
    batchId: attempt.batchId,
    attemptedAt: attemptedAt.toISOString(),
    evidenceProcessorEpochs: structuredClone(evidenceProcessorEpochs ?? {}),
  };
}

function executableBinding(target) {
  return {
    type: 'executable_queue',
    sourceArtifact: EXECUTABLE_QUEUE_PATH,
    targetId: target.targetId,
    executionLane: target.executionLane ?? (target.candidateJobIds.length > 0
      ? 'ACQUISITION'
      : 'BOUNDED_DISCOVERY'),
    candidateJobIds: [...target.candidateJobIds].sort(),
  };
}

function deferredBinding(target) {
  return {
    type: 'control_plane_disposition',
    sourceArtifact: EXECUTABLE_QUEUE_PATH,
    targetId: target.targetId,
    dispositionReason: target.dispositionReason,
  };
}

function stateForRecord({
  record,
  acquisition,
  workTarget,
  deferredTarget,
  acceptanceEntry,
  attemptLedger,
  resolvedAttemptIds,
  evidenceProcessorEpochs,
  fitReceiptReferenceIds,
}) {
  const sourceAttemptSummary = sourceAttemptsFor(record.referenceId, attemptLedger, resolvedAttemptIds);
  const base = {
    referenceId: record.referenceId,
    category: record.category,
    canonicalBrand: record.canonicalBrand,
    model: record.model,
    lifecycleState: record.lifecycleState,
    sourceAttemptSummary,
  };
  if (record.operationalClass === 'COMPLETE_RECEIPT') {
    const fitReceipt = fitReceiptReferenceIds.has(record.referenceId);
    return {
      ...base,
      state: fitReceipt ? 'FIT_RECEIPT' : 'DIMENSIONS_RECEIPT',
      stateClass: 'COMPLETED',
      actionable: false,
      terminal: true,
      binding: receiptBinding(record, acceptanceEntry),
      reopeningConditions: [],
    };
  }
  if (record.operationalClass === 'CONFLICT_QUARANTINE') {
    return {
      ...base,
      state: 'CONFLICT_QUARANTINE',
      stateClass: 'BLOCKED',
      actionable: Boolean(workTarget),
      terminal: true,
      binding: {
        type: 'classification',
        sourceArtifact: CLASSIFICATION_PATH,
        operationalClass: record.operationalClass,
        conflictState: record.conflictState,
        ...(workTarget ? { pendingWork: executableBinding(workTarget) } : {}),
        ...(deferredTarget ? { controlPlaneDisposition: deferredBinding(deferredTarget) } : {}),
      },
      reopeningConditions: ['CONFLICT_CLOSURE_DECISION_ACCEPTED'],
    };
  }
  if (workTarget) {
    let state = 'SOURCE_DISCOVERY_REQUIRED';
    if (record.operationalClass === 'IDENTITY_RESEARCH') state = 'IDENTITY_RESEARCH';
    else if (workTarget.candidateJobIds.length > 0) state = 'CANDIDATE_READY';
    else if (sourceAttemptSummary.activeRetryable > 0) state = 'RETRYABLE';
    return {
      ...base,
      state,
      stateClass: 'ACTIONABLE',
      actionable: true,
      terminal: false,
      binding: executableBinding(workTarget),
      reopeningConditions: [],
    };
  }
  if (deferredTarget?.dispositionReason === 'NO_CANDIDATE_COMPLETE') {
    return {
      ...base,
      state: 'NO_OFFICIAL_SOURCE',
      stateClass: 'BLOCKED',
      actionable: false,
      terminal: true,
      binding: deferredBinding(deferredTarget),
      reopeningConditions: ['EXPLICIT_OFFICIAL_CANDIDATE_ADDED'],
    };
  }
  if (record.operationalClass === 'IDENTITY_RESEARCH') {
    return {
      ...base,
      state: 'IDENTITY_RESEARCH',
      stateClass: 'BLOCKED',
      actionable: false,
      terminal: true,
      binding: {
        type: 'classification',
        sourceArtifact: CLASSIFICATION_PATH,
        operationalClass: record.operationalClass,
      },
      reopeningConditions: ['IDENTITY_RESEARCH_EVIDENCE_CHANGED'],
    };
  }
  const targetAttempt = targetAttemptFor(record.referenceId, attemptLedger);
  if (targetAttempt) {
    const noSource = targetAttempt.reason === 'complete_zero_candidate_inventory';
    return {
      ...base,
      state: noSource ? 'NO_OFFICIAL_SOURCE' : 'BLOCKED_SAME_EPOCH',
      stateClass: 'BLOCKED',
      actionable: false,
      terminal: true,
      binding: targetAttemptBinding(targetAttempt, evidenceProcessorEpochs),
      reopeningConditions: noSource ? [
        'EXPLICIT_OFFICIAL_CANDIDATE_ADDED',
      ] : [
        'EXPLICIT_OFFICIAL_CANDIDATE_ADDED',
        'POLICY_CHANGED',
        'PROCESSOR_EPOCH_CHANGED',
        'RESOLVER_CONTRACT_CHANGED',
      ],
    };
  }
  if (deferredTarget?.dispositionReason === 'ALL_CANDIDATES_SUPPRESSED') {
    return {
      ...base,
      state: 'BLOCKED_SAME_EPOCH',
      stateClass: 'BLOCKED',
      actionable: false,
      terminal: true,
      binding: deferredBinding(deferredTarget),
      reopeningConditions: [
        'EXPLICIT_OFFICIAL_CANDIDATE_ADDED',
        'POLICY_CHANGED',
        'PROCESSOR_EPOCH_CHANGED',
      ],
    };
  }
  return {
    ...base,
    state: 'UNSEEN',
    stateClass: 'BLOCKED',
    actionable: false,
    terminal: true,
    binding: {
      type: 'classification',
      sourceArtifact: CLASSIFICATION_PATH,
      acquisitionQueued: Boolean(acquisition),
      ...(deferredTarget ? { controlPlaneDisposition: deferredBinding(deferredTarget) } : {}),
    },
    reopeningConditions: ['CONTROL_PLANE_INPUT_CHANGED'],
  };
}

export function buildHistoricalEvidenceTargetState(input) {
  if (!input || typeof input !== 'object') throw new TypeError('historical target-state inputs required');
  const generatedAt = new Date(input.generatedAt);
  if (Number.isNaN(generatedAt.valueOf())) throw new TypeError('valid target-state generatedAt required');
  const classification = schema(input.classification, 1, 'classification');
  const acquisitionQueue = schema(input.acquisitionQueue, 1, 'acquisition queue');
  const executableQueue = schema(input.executableQueue, 2, 'executable queue');
  const acceptanceBundle = schema(input.acceptanceBundle, 1, 'acceptance bundle');
  const attemptLedger = schema(input.attemptLedger, 1, 'attempt ledger');
  const classifications = uniqueMap(classification.records, 'referenceId', 'classification');
  const acquisitions = uniqueMap(acquisitionQueue.records, 'referenceId', 'acquisition');
  const acquisitionTargets = uniqueMap(executableQueue.targets, 'referenceId', 'acquisition target');
  const hasSeparatedLanes = Array.isArray(executableQueue.discoveryTargets)
    && Array.isArray(executableQueue.deferredTargets);
  const discoveryTargets = uniqueMap(
    hasSeparatedLanes ? executableQueue.discoveryTargets : [],
    'referenceId',
    'discovery target',
  );
  const deferredTargets = uniqueMap(
    hasSeparatedLanes ? executableQueue.deferredTargets : [],
    'referenceId',
    'deferred target',
  );
  const workTargets = new Map(acquisitionTargets);
  for (const [referenceId, target] of discoveryTargets) {
    if (workTargets.has(referenceId)) throw new Error(`target appears in two work lanes: ${referenceId}`);
    workTargets.set(referenceId, target);
  }
  for (const referenceId of deferredTargets.keys()) {
    if (workTargets.has(referenceId)) throw new Error(`target appears in work and deferred lanes: ${referenceId}`);
  }
  const acceptances = uniqueMap(acceptanceBundle.entries, 'referenceId', 'acceptance');
  const fitReceiptReferenceIds = new Set(input.fitReceiptReferenceIds ?? []);
  const resolvedAttemptIds = new Set((attemptLedger.resolutions ?? []).map((entry) => entry.attemptId));

  if (classification.summary.records !== classifications.size
    || classification.summary.uniqueReferenceIds !== classifications.size) {
    throw new Error('classification target-state accounting mismatch');
  }
  if (acquisitionQueue.summary.queuedModels !== acquisitions.size
    || executableQueue.summary.acquisitionRecords !== acquisitions.size) {
    throw new Error('acquisition target-state accounting mismatch');
  }
  if (executableQueue.summary.targets !== workTargets.size) {
    throw new Error('executable target accounting mismatch');
  }
  if (hasSeparatedLanes) {
    if (executableQueue.summary.acquisitionTargets !== acquisitionTargets.size
      || executableQueue.summary.discoveryTargets !== discoveryTargets.size
      || executableQueue.summary.deferredTargets !== deferredTargets.size) {
      throw new Error('separated executable lane accounting mismatch');
    }
  }
  for (const referenceId of acquisitions.keys()) {
    if (!classifications.has(referenceId)) throw new Error(`acquisition reference missing from classification: ${referenceId}`);
  }
  for (const referenceId of workTargets.keys()) {
    if (!acquisitions.has(referenceId)) throw new Error(`executable reference missing from acquisition: ${referenceId}`);
  }
  for (const referenceId of deferredTargets.keys()) {
    if (!acquisitions.has(referenceId)) throw new Error(`deferred reference missing from acquisition: ${referenceId}`);
  }
  if (hasSeparatedLanes) {
    for (const referenceId of acquisitions.keys()) {
      if (!workTargets.has(referenceId) && !deferredTargets.has(referenceId)) {
        throw new Error(`acquisition reference missing from control-plane partition: ${referenceId}`);
      }
    }
  }
  for (const referenceId of acceptances.keys()) {
    if (!classifications.has(referenceId)) throw new Error(`acceptance reference missing from classification: ${referenceId}`);
  }

  const records = [...classifications.values()].map((record) => stateForRecord({
    record,
    acquisition: acquisitions.get(record.referenceId) ?? null,
    workTarget: workTargets.get(record.referenceId) ?? null,
    deferredTarget: deferredTargets.get(record.referenceId) ?? null,
    acceptanceEntry: acceptances.get(record.referenceId) ?? null,
    attemptLedger,
    resolvedAttemptIds,
    evidenceProcessorEpochs: executableQueue.evidenceProcessorEpochs,
    fitReceiptReferenceIds,
  })).sort((left, right) => (
    left.category.localeCompare(right.category)
      || left.canonicalBrand.localeCompare(right.canonicalBrand, 'en-AU', { sensitivity: 'base' })
      || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
      || left.referenceId.localeCompare(right.referenceId)
  ));

  const actionable = records.filter((record) => record.actionable).length;
  const actionableBlockedOverlap = records.filter((record) => (
    record.actionable && record.stateClass === 'BLOCKED'
  )).length;
  const completed = records.filter((record) => record.stateClass === 'COMPLETED').length;
  const blocked = records.filter((record) => record.stateClass === 'BLOCKED').length;
  const targetSuppressed = records.filter((record) => (
    ['BLOCKED_SAME_EPOCH', 'NO_OFFICIAL_SOURCE'].includes(record.state)
  )).length;
  if (actionable !== executableQueue.summary.targets) throw new Error('actionable target accounting mismatch');
  const excluded = countObject(executableQueue.summary.excluded, 'executable excluded counts');
  if (hasSeparatedLanes) {
    const resolverSuppressed = deferredTargets.size - excluded;
    if (resolverSuppressed !== executableQueue.summary.suppressedPriorResolverOnlyTargets
      || actionable + deferredTargets.size !== acquisitionQueue.summary.queuedModels) {
      throw new Error('separated target-state partition mismatch');
    }
  } else if (actionable + targetSuppressed + excluded !== acquisitionQueue.summary.queuedModels) {
    throw new Error('executable target-state partition mismatch');
  }
  if (completed + acquisitionQueue.summary.queuedModels !== classifications.size) {
    throw new Error('completed and acquisition model partition mismatch');
  }

  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    sourceClassificationGeneratedAt: classification.generatedAt ?? null,
    sourceExecutableQueueGeneratedAt: executableQueue.generatedAt ?? null,
    summary: {
      records: records.length,
      actionable,
      actionableBlockedOverlap,
      acquisitionWork: acquisitionTargets.size,
      discoveryWork: discoveryTargets.size,
      deferred: deferredTargets.size,
      completed,
      blocked,
      terminal: records.filter((record) => record.terminal).length,
      byState: countBy(records, 'state'),
      byStateClass: countBy(records, 'stateClass'),
    },
    controls: {
      uniqueClassificationReferences: true,
      actionableMatchesExecutableQueue: true,
      separatedWorkLanes: hasSeparatedLanes,
      targetSuppressionsMatchExecutableQueue: true,
      sourceTerminalDoesNotImplyTargetTerminal: true,
    },
    records,
  };
}
