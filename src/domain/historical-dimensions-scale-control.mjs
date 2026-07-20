import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

export const HISTORICAL_DIMENSIONS_SCALE_CONTROL_SCHEMA_VERSION = 1;
export const HISTORICAL_DIMENSIONS_SCALE_LEDGER_SCHEMA_VERSION = 1;

const HASH = /^[a-f0-9]{64}$/;
const MONOTONIC_COUNTERS = Object.freeze([
  'currentValidReceipts',
  'replacementAutoFill',
  'receiptSourcesPassed',
  'fitReceiptBoundDimensions',
  'fitReceiptBoundVerified',
]);
const QUEUE_COUNTERS = Object.freeze([
  'p0AssignedTargets',
  'p0EligibleTargets',
  'p1AssignedTargets',
  'p1EligibleTargets',
]);
const FUNNEL_FIELDS = Object.freeze([
  'selectedTargets',
  'targetsWithOfficialCandidates',
  'fetchedTargets',
  'mineruValidTargets',
  'identityProvenTargets',
  'dimensionsReceipted',
  'terminalTargets',
  'retryableTargets',
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
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function requiredInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} invalid`);
  return value;
}

function requiredHash(value, label) {
  const result = requiredText(value, label);
  if (!HASH.test(result)) throw new TypeError(`${label} invalid`);
  return result;
}

function requiredTimestamp(value, label) {
  const result = requiredText(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${label} invalid`);
  return result;
}

function canonicalEqual(left, right) {
  return canonicalJsonSha256(left) === canonicalJsonSha256(right);
}

function metricById(programStatus, id) {
  if (programStatus?.schemaVersion !== 1) throw new TypeError('historical programme status schema v1 required');
  const matches = requiredArray(programStatus.metrics, 'programme status metrics')
    .filter((row) => row?.id === id);
  if (matches.length !== 1) throw new Error(`programme status metric must be unique: ${id}`);
  return requiredInteger(matches[0].numerator, `${id} numerator`);
}

function workstreamById(nextBatches, id) {
  if (nextBatches?.schemaVersion !== 2 || nextBatches?.plannerVersion !== '2') {
    throw new TypeError('historical bounded batches schema v2 planner v2 required');
  }
  const semantic = structuredClone(nextBatches);
  delete semantic.semanticBatchesSha256;
  if (canonicalJsonSha256(semantic) !== requiredHash(
    nextBatches.semanticBatchesSha256,
    'bounded batches semantic SHA-256',
  )) throw new Error('bounded batches semantic hash drift');
  const matches = requiredArray(nextBatches.workstreams, 'bounded batch workstreams')
    .filter((row) => row?.workstreamId === id);
  if (matches.length !== 1) throw new Error(`bounded batch workstream must be unique: ${id}`);
  return matches[0];
}

function auditGuards({ receiptAudit, replacementAudit, fitPublicationAudit }) {
  const receipts = requiredObject(receiptAudit?.summary, 'receipt replay summary');
  const sources = requiredInteger(receipts.sources, 'receipt replay sources');
  const passed = requiredInteger(receipts.passed, 'receipt replay passed');
  const failed = requiredInteger(receipts.failed, 'receipt replay failed');
  if (failed !== 0 || passed !== sources) throw new Error('receipt replay failed or incomplete');

  const replacement = requiredObject(replacementAudit?.summary, 'replacement audit summary');
  if (requiredInteger(replacement.issueCount, 'replacement audit issue count') !== 0) {
    throw new Error('replacement audit has unresolved issues');
  }
  const autoFill = requiredInteger(
    replacement.byLookupAction?.AUTO_FILL,
    'replacement AUTO_FILL count',
  );

  const fit = requiredObject(fitPublicationAudit?.summary, 'Fit publication audit summary');
  const violations = requiredArray(fitPublicationAudit?.violations ?? [], 'Fit publication violations');
  if (requiredInteger(fit.violations, 'Fit publication violation count') !== 0
    || violations.length !== 0) {
    throw new Error('Fit publication violation blocks dimensions scale work');
  }
  return { receiptSourcesPassed: passed, replacementAutoFill: autoFill, fit };
}

export function canonicalHistoricalDimensionsScaleCounters(input) {
  const nextBatches = requiredObject(input?.nextBatches, 'next bounded batches');
  const current = workstreamById(nextBatches, 'CURRENT_DIMENSIONS');
  const historical = workstreamById(nextBatches, 'HISTORICAL_DIMENSIONS');
  const currentValidReceipts = metricById(input.programStatus, 'model.current_valid_receipt');
  const replacementMetric = metricById(input.programStatus, 'model.replacement_auto_fill');
  const fitDimensionsMetric = metricById(input.programStatus, 'fit.receipt_bound_dimensions');
  const fitVerifiedMetric = metricById(input.programStatus, 'fit.receipt_bound_verified');
  const guards = auditGuards(input);
  if (guards.replacementAutoFill !== replacementMetric
    || replacementMetric > currentValidReceipts) {
    throw new Error('replacement AUTO_FILL is not bounded by receipt-backed models');
  }
  const fitReceiptBoundDimensions = requiredInteger(
    guards.fit.receiptBoundDimensions,
    'Fit receipt-bound dimensions',
  );
  const fitReceiptBoundVerified = requiredInteger(
    guards.fit.receiptBoundVerified,
    'Fit receipt-bound verified',
  );
  if (fitReceiptBoundDimensions !== fitDimensionsMetric
    || fitReceiptBoundVerified !== fitVerifiedMetric) {
    throw new Error('Fit publication counters drift from programme status');
  }
  return Object.freeze({
    currentValidReceipts,
    replacementAutoFill: replacementMetric,
    receiptSourcesPassed: guards.receiptSourcesPassed,
    fitReceiptBoundDimensions,
    fitReceiptBoundVerified,
    p0AssignedTargets: requiredInteger(current.assignedTargets, 'P0 assigned targets'),
    p0EligibleTargets: requiredInteger(current.eligibleTargets, 'P0 eligible targets'),
    p1AssignedTargets: requiredInteger(historical.assignedTargets, 'P1 assigned targets'),
    p1EligibleTargets: requiredInteger(historical.eligibleTargets, 'P1 eligible targets'),
  });
}

function emptyFunnel(selectedTargets) {
  return {
    selectedTargets,
    targetsWithOfficialCandidates: 0,
    fetchedTargets: 0,
    mineruValidTargets: 0,
    identityProvenTargets: 0,
    dimensionsReceipted: 0,
    terminalTargets: 0,
    retryableTargets: 0,
  };
}

export function buildHistoricalDimensionsDiscoveryFunnel(run, candidateManifest = null) {
  if (run?.schemaVersion !== 1) throw new TypeError('official discovery run schema v1 required');
  const targets = requiredArray(run.targets, 'official discovery run targets');
  if (!targets.length) throw new TypeError('official discovery run targets required');
  const funnel = emptyFunnel(targets.length);
  const finalTargets = candidateManifest === null ? null : (() => {
    if (candidateManifest?.schemaVersion !== 1) {
      throw new TypeError('official candidate manifest schema v1 required');
    }
    const map = new Map();
    for (const target of requiredArray(candidateManifest.targets, 'official candidate manifest targets')) {
      const referenceId = requiredText(target?.referenceId, 'official candidate target reference ID');
      if (map.has(referenceId)) throw new Error(`duplicate official candidate target: ${referenceId}`);
      map.set(referenceId, target);
    }
    return map;
  })();
  for (const target of targets) {
    if (finalTargets) {
      const referenceId = requiredText(target?.referenceId, 'official discovery target reference ID');
      const finalTarget = finalTargets.get(referenceId);
      if (!finalTarget || finalTarget.lastDiscoveryRunId !== run.runId) {
        throw new Error(`official candidate materialization binding drift: ${referenceId}`);
      }
      if (finalTarget.state === 'CANDIDATES_READY') funnel.targetsWithOfficialCandidates += 1;
      else if (finalTarget.state === 'NO_CANDIDATE_COMPLETE') funnel.terminalTargets += 1;
      else if (finalTarget.state === 'DISCOVERY_RETRYABLE') funnel.retryableTargets += 1;
      else throw new Error(`unsupported final discovery state: ${finalTarget.state}`);
      continue;
    }
    const resolvers = requiredArray(target?.resolvers, 'official discovery target resolvers');
    if (!resolvers.length) throw new TypeError('official discovery target resolver required');
    const requiredIncomplete = resolvers.some((resolver) => (
      resolver.required === true && resolver.completion !== 'complete'
    ));
    const hasCandidate = resolvers.some((resolver) => (
      Array.isArray(resolver.candidates) && resolver.candidates.some(
        (candidate) => candidate?.authorityMode === 'official',
      )
    ));
    if (requiredIncomplete) funnel.retryableTargets += 1;
    else if (hasCandidate) funnel.targetsWithOfficialCandidates += 1;
    else funnel.terminalTargets += 1;
  }
  validateFunnel(funnel, 'DISCOVERY', 'discovery run');
  return Object.freeze(funnel);
}

function targetHasCandidate(outcome) {
  return (outcome?.candidateInventory?.candidates ?? []).some((candidate) => (
    candidate?.authorityMode === 'official'
  ));
}

function targetWasFetched(outcome) {
  return (outcome?.candidateInventory?.candidates ?? []).some((candidate) => {
    const status = candidate?.outcome?.status;
    return candidate?.authorityMode === 'official'
      && (candidate?.outcome?.source || candidate?.outcome?.artifactBinding)
      && !['not_attempted_optional', 'reference_only', 'transport_failure'].includes(status);
  });
}

function sourceHasMineru(source) {
  return source?.derivedArtifact?.parserName === 'MinerU'
    && source?.derivedArtifact?.format === 'content_list_v2';
}

function sourceHasExactIdentity(source) {
  return source?.identity?.outcome === 'exact';
}

export function buildHistoricalDimensionsRecoveryFunnel(results) {
  if (results?.schemaVersion !== 1) throw new TypeError('historical recovery results schema v1 required');
  const outcomes = requiredArray(results.outcomes, 'historical recovery outcomes');
  if (!outcomes.length) throw new TypeError('historical recovery outcomes required');
  const funnel = emptyFunnel(outcomes.length);
  for (const outcome of outcomes) {
    if (targetHasCandidate(outcome)) funnel.targetsWithOfficialCandidates += 1;
    if (targetWasFetched(outcome)) funnel.fetchedTargets += 1;
    if ((outcome.sources ?? []).some(sourceHasMineru)) funnel.mineruValidTargets += 1;
    if ((outcome.sources ?? []).some(sourceHasExactIdentity)) funnel.identityProvenTargets += 1;
    if (outcome.status === 'accepted') {
      funnel.dimensionsReceipted += 1;
    } else if (outcome.status === 'retryable_failure') {
      funnel.retryableTargets += 1;
    } else {
      funnel.terminalTargets += 1;
    }
  }
  validateFunnel(funnel, 'DIMENSIONS', 'recovery run');
  return Object.freeze(funnel);
}

function validateCounterSet(value, label) {
  const counters = requiredObject(value, label);
  const expected = [...MONOTONIC_COUNTERS, ...QUEUE_COUNTERS].sort();
  const actual = Object.keys(counters).sort();
  if (!canonicalEqual(actual, expected)) throw new TypeError(`${label} fields invalid`);
  for (const field of expected) requiredInteger(counters[field], `${label} ${field}`);
  return counters;
}

function validateFunnel(value, stage, checkpointId) {
  const funnel = requiredObject(value, `${checkpointId} funnel`);
  if (!canonicalEqual(Object.keys(funnel).sort(), [...FUNNEL_FIELDS].sort())) {
    throw new TypeError(`${checkpointId} funnel fields invalid`);
  }
  for (const field of FUNNEL_FIELDS) requiredInteger(funnel[field], `${checkpointId} ${field}`);
  if (funnel.selectedTargets < 1) throw new TypeError(`${checkpointId} selected targets required`);
  for (const field of FUNNEL_FIELDS.slice(1)) {
    if (funnel[field] > funnel.selectedTargets) {
      throw new Error(`${checkpointId} ${field} exceeds selected targets`);
    }
  }
  const terminalAccounting = funnel.terminalTargets + funnel.retryableTargets
    + (stage === 'DIMENSIONS'
      ? funnel.dimensionsReceipted
      : funnel.targetsWithOfficialCandidates);
  if (terminalAccounting !== funnel.selectedTargets) {
    throw new Error(`${checkpointId} ${stage.toLowerCase()} target accounting drift`);
  }
  return funnel;
}

function validateCheckpoint(value, previousCounters, previousCompletedAt) {
  const checkpoint = requiredObject(value, 'scale checkpoint');
  const { semanticCheckpointSha256, ...semantic } = checkpoint;
  const checkpointId = requiredText(checkpoint.checkpointId, 'checkpoint ID');
  if (canonicalJsonSha256(semantic) !== requiredHash(
    semanticCheckpointSha256,
    `${checkpointId} semantic SHA-256`,
  )) throw new Error(`${checkpointId} semantic hash drift`);
  requiredText(checkpoint.runId, `${checkpointId} run ID`);
  const completedAt = requiredTimestamp(checkpoint.completedAt, `${checkpointId} completion time`);
  if (previousCompletedAt && Date.parse(completedAt) < Date.parse(previousCompletedAt)) {
    throw new Error(`${checkpointId} completion time is out of order`);
  }
  if (!['DISCOVERY', 'DIMENSIONS'].includes(checkpoint.stage)) {
    throw new TypeError(`${checkpointId} stage invalid`);
  }
  if (!['CURRENT_DIMENSIONS', 'HISTORICAL_DIMENSIONS'].includes(checkpoint.workstreamId)) {
    throw new TypeError(`${checkpointId} workstream invalid`);
  }
  requiredText(checkpoint.manifestId, `${checkpointId} manifest ID`);
  requiredHash(checkpoint.manifestSha256, `${checkpointId} manifest SHA-256`);
  requiredText(checkpoint.cohortKey, `${checkpointId} cohort key`);
  if (checkpoint.familyId !== null) requiredText(checkpoint.familyId, `${checkpointId} family ID`);
  const bindings = requiredObject(checkpoint.evidenceBindings, `${checkpointId} evidence bindings`);
  requiredHash(bindings.runSha256, `${checkpointId} run SHA-256`);
  if (checkpoint.stage === 'DIMENSIONS') {
    requiredHash(bindings.auditSha256, `${checkpointId} audit SHA-256`);
    if (bindings.storageContentSha256 != null) {
      throw new TypeError(`${checkpointId} dimensions checkpoint cannot carry a storage content SHA-256`);
    }
  } else if (bindings.auditSha256 != null) {
    throw new TypeError(`${checkpointId} discovery checkpoint cannot carry an audit SHA-256`);
  } else {
    requiredHash(
      bindings.storageContentSha256,
      `${checkpointId} discovery storage content SHA-256`,
    );
    requiredHash(
      bindings.candidateManifestSha256,
      `${checkpointId} discovery candidate manifest SHA-256`,
    );
  }
  const funnel = validateFunnel(checkpoint.funnel, checkpoint.stage, checkpointId);
  const before = validateCounterSet(checkpoint.beforeCounters, `${checkpointId} before counters`);
  const after = validateCounterSet(checkpoint.afterCounters, `${checkpointId} after counters`);
  if (!canonicalEqual(before, previousCounters)) throw new Error(`${checkpointId} checkpoint chain drift`);
  for (const field of MONOTONIC_COUNTERS) {
    if (after[field] < before[field]) throw new Error(`${checkpointId} coverage counter regressed: ${field}`);
  }
  for (const field of QUEUE_COUNTERS) {
    if (after[field] > before[field]) throw new Error(`${checkpointId} queue counter reopened without a new baseline: ${field}`);
  }
  if (after.currentValidReceipts - before.currentValidReceipts !== funnel.dimensionsReceipted) {
    throw new Error(`${checkpointId} dimensions receipt delta drift`);
  }
  return { checkpoint, completedAt, after };
}

function validateLedger(ledger, currentCounters) {
  if (ledger?.schemaVersion !== HISTORICAL_DIMENSIONS_SCALE_LEDGER_SCHEMA_VERSION) {
    throw new TypeError('historical dimensions scale ledger schema v1 required');
  }
  requiredText(ledger.ledgerId, 'scale ledger ID');
  requiredTimestamp(ledger.activatedAt, 'scale ledger activation time');
  const minimumYieldBasisPoints = requiredInteger(
    ledger.policy?.minimumYieldBasisPoints,
    'minimum yield basis points',
    1,
  );
  if (minimumYieldBasisPoints > 10_000) throw new TypeError('minimum yield basis points exceeds 10000');
  const consecutiveLowYieldBatches = requiredInteger(
    ledger.policy?.consecutiveLowYieldBatches,
    'consecutive low-yield batches',
    2,
  );
  const baseline = validateCounterSet(ledger.baseline?.counters, 'scale baseline counters');
  let previous = baseline;
  let previousCompletedAt = ledger.activatedAt;
  const checkpoints = [];
  const ids = new Set();
  const runs = new Set();
  for (const row of requiredArray(ledger.entries, 'scale ledger entries')) {
    const result = validateCheckpoint(row, previous, previousCompletedAt);
    if (ids.has(row.checkpointId) || runs.has(row.runId)) {
      throw new Error(`duplicate scale checkpoint or run: ${row.checkpointId}`);
    }
    ids.add(row.checkpointId);
    runs.add(row.runId);
    checkpoints.push(result.checkpoint);
    previous = result.after;
    previousCompletedAt = result.completedAt;
  }
  if (!canonicalEqual(previous, currentCounters)) {
    throw new Error('current counters changed without a recorded scale checkpoint');
  }
  return {
    checkpoints,
    policy: { minimumYieldBasisPoints, consecutiveLowYieldBatches },
  };
}

function checkpointYield(checkpoint) {
  const numerator = checkpoint.stage === 'DIMENSIONS'
    ? checkpoint.funnel.dimensionsReceipted
    : checkpoint.funnel.targetsWithOfficialCandidates;
  const denominator = checkpoint.funnel.selectedTargets;
  return {
    numerator,
    denominator,
    rateBasisPoints: Math.round((numerator / denominator) * 10_000),
  };
}

function haltedCohorts(checkpoints, policy) {
  const byCohort = new Map();
  for (const checkpoint of checkpoints) {
    const rows = byCohort.get(checkpoint.cohortKey) ?? [];
    rows.push(checkpoint);
    byCohort.set(checkpoint.cohortKey, rows);
  }
  const result = [];
  for (const [cohortKey, rows] of byCohort) {
    const tail = rows.slice(-policy.consecutiveLowYieldBatches);
    if (tail.length !== policy.consecutiveLowYieldBatches) continue;
    const yields = tail.map(checkpointYield);
    if (yields.every((row) => row.rateBasisPoints < policy.minimumYieldBasisPoints)) {
      result.push({
        cohortKey,
        stage: tail.at(-1).stage,
        familyId: tail.at(-1).familyId,
        checkpointIds: tail.map((row) => row.checkpointId),
        yields,
      });
    }
  }
  return result.sort((left, right) => left.cohortKey.localeCompare(right.cohortKey));
}

function isoWeek(value) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weeklyThroughput(checkpoints) {
  const weeks = new Map();
  for (const checkpoint of checkpoints) {
    const key = isoWeek(checkpoint.completedAt);
    const row = weeks.get(key) ?? {
      isoWeek: key,
      completedBatches: 0,
      selectedTargets: 0,
      targetsWithOfficialCandidates: 0,
      dimensionsReceipted: 0,
      terminalTargets: 0,
      retryableTargets: 0,
    };
    row.completedBatches += 1;
    for (const field of [
      'selectedTargets', 'targetsWithOfficialCandidates', 'dimensionsReceipted',
      'terminalTargets', 'retryableTargets',
    ]) row[field] += checkpoint.funnel[field];
    weeks.set(key, row);
  }
  return [...weeks.values()].sort((left, right) => left.isoWeek.localeCompare(right.isoWeek));
}

function projection(checkpoints, counters) {
  const dimensions = checkpoints.filter((row) => row.stage === 'DIMENSIONS');
  const dimensionsReceipted = dimensions.reduce(
    (sum, row) => sum + row.funnel.dimensionsReceipted,
    0,
  );
  const receiptedTargetsPerCompletedBatch = dimensions.length
    ? dimensionsReceipted / dimensions.length
    : 0;
  return {
    completedDimensionsBatches: dimensions.length,
    dimensionsReceipted,
    receiptedTargetsPerCompletedBatch,
    projectedRemainingP0Batches: receiptedTargetsPerCompletedBatch > 0
      ? Math.ceil(counters.p0EligibleTargets / receiptedTargetsPerCompletedBatch)
      : null,
    projectedRemainingP1Batches: receiptedTargetsPerCompletedBatch > 0
      ? Math.ceil(counters.p1EligibleTargets / receiptedTargetsPerCompletedBatch)
      : null,
    projectionBasis: dimensions.length
      ? 'OBSERVED_RECEIPTED_TARGETS_PER_COMPLETED_DIMENSIONS_BATCH'
      : 'NO_COMPLETED_DIMENSIONS_BATCHES',
  };
}

function normalizedBrand(value) {
  return requiredText(value, 'manifest brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function cohortKeyForManifest(manifest) {
  if (manifest.familyId) return `family:${manifest.familyId}`;
  const stage = manifest.executionLane === 'BOUNDED_DISCOVERY' ? 'DISCOVERY' : 'DIMENSIONS';
  return [
    'cohort', stage, requiredText(manifest.constraints?.category, 'manifest category'),
    normalizedBrand(manifest.constraints?.brand), manifest.executionLane,
  ].join(':');
}

function validateManifestSemanticHash(manifest) {
  requiredObject(manifest, 'bounded manifest');
  const { manifestId, semanticManifestSha256, ...semantic } = manifest;
  const expected = canonicalJsonSha256(semantic);
  if (semanticManifestSha256 !== expected
    || manifestId !== `historical_batch_${expected.slice(0, 24)}`) {
    throw new Error(`bounded manifest hash drift: ${manifestId ?? '<missing>'}`);
  }
  return manifest;
}

function decisionFor({ nextBatches, counters, halted }) {
  const p0 = workstreamById(nextBatches, 'CURRENT_DIMENSIONS');
  const p1 = workstreamById(nextBatches, 'HISTORICAL_DIMENSIONS');
  const selected = counters.p0EligibleTargets > 0 ? p0 : p1;
  const status = counters.p0EligibleTargets > 0 ? 'RUN_P0' : 'RUN_P1';
  if (selected.eligibleTargets === 0) {
    return {
      status: 'COMPLETE', allowedManifestId: null, allowedWorkstreamId: null,
      p1Blocked: false, reason: 'NO_ELIGIBLE_DIMENSIONS_TARGETS', cohortKey: null,
    };
  }
  const selectedManifestId = requiredArray(
    selected.manifestIds,
    `${selected.workstreamId} manifest window`,
  )[0] ?? null;
  const manifest = nextBatches.manifests.find((row) => row.manifestId === selectedManifestId);
  if (!manifest) {
    return {
      status: 'STOP_MISSING_MANIFEST', allowedManifestId: null,
      allowedWorkstreamId: selected.workstreamId,
      p1Blocked: counters.p0EligibleTargets > 0,
      reason: 'ELIGIBLE_WORKSTREAM_HAS_NO_BOUND_MANIFEST', cohortKey: null,
    };
  }
  const cohortKey = cohortKeyForManifest(manifest);
  if (halted.some((row) => row.cohortKey === cohortKey)) {
    return {
      status: 'STOP_LOW_YIELD', allowedManifestId: null,
      allowedWorkstreamId: selected.workstreamId,
      p1Blocked: counters.p0EligibleTargets > 0,
      reason: 'TWO_CONSECUTIVE_SAME_COHORT_BATCHES_BELOW_MINIMUM_YIELD', cohortKey,
    };
  }
  return {
    status,
    allowedManifestId: manifest.manifestId,
    allowedWorkstreamId: selected.workstreamId,
    p1Blocked: counters.p0EligibleTargets > 0,
    reason: status === 'RUN_P0' ? 'P0_CURRENT_DIMENSIONS_FIRST' : 'P0_EMPTY_P1_OPEN',
    cohortKey,
  };
}

function sourceBindings(input) {
  return {
    ledgerSha256: canonicalJsonSha256(input.ledger),
    nextBatchesSha256: canonicalJsonSha256(input.nextBatches),
    programStatusSha256: canonicalJsonSha256(input.programStatus),
    receiptAuditSha256: canonicalJsonSha256(input.receiptAudit),
    replacementAuditSha256: canonicalJsonSha256(input.replacementAudit),
    fitPublicationAuditSha256: canonicalJsonSha256(input.fitPublicationAudit),
  };
}

export function buildHistoricalDimensionsScaleControl(input) {
  const counters = canonicalHistoricalDimensionsScaleCounters(input);
  const ledger = validateLedger(requiredObject(input?.ledger, 'scale ledger'), counters);
  const halted = haltedCohorts(ledger.checkpoints, ledger.policy);
  const semantic = {
    schemaVersion: HISTORICAL_DIMENSIONS_SCALE_CONTROL_SCHEMA_VERSION,
    generatedAt: requiredTimestamp(input.generatedAt, 'scale control generation time'),
    policy: {
      ...ledger.policy,
      p0BeforeP1: true,
      scalarReceiptRequiredForReplacementAutoFill: true,
      receiptReplayAndZeroPublicationViolationsRequired: true,
    },
    sourceBindings: sourceBindings(input),
    counters: structuredClone(counters),
    checkpointCount: ledger.checkpoints.length,
    haltedCohorts: halted,
    weeklyThroughput: weeklyThroughput(ledger.checkpoints),
    projection: projection(ledger.checkpoints, counters),
    decision: decisionFor({ nextBatches: input.nextBatches, counters, halted }),
  };
  const semanticControlSha256 = canonicalJsonSha256(semantic);
  return Object.freeze({
    ...semantic,
    controlId: `historical-dimensions-scale-${semanticControlSha256.slice(0, 24)}`,
    semanticControlSha256,
  });
}

function validateScaleControl(control) {
  if (control?.schemaVersion !== HISTORICAL_DIMENSIONS_SCALE_CONTROL_SCHEMA_VERSION) {
    throw new TypeError('historical dimensions scale control schema v1 required');
  }
  const { controlId, semanticControlSha256, ...semantic } = control;
  const expected = canonicalJsonSha256(semantic);
  if (semanticControlSha256 !== expected
    || controlId !== `historical-dimensions-scale-${expected.slice(0, 24)}`) {
    throw new Error('historical dimensions scale control hash drift');
  }
  return control;
}

export function assertHistoricalDimensionsScaleCheckpointSource({ control, manifest, stage }) {
  validateScaleControl(control);
  validateManifestSemanticHash(manifest);
  if (!['DISCOVERY', 'DIMENSIONS'].includes(stage)) {
    throw new TypeError('dimensions scale checkpoint stage invalid');
  }
  const expectedLane = stage === 'DISCOVERY' ? 'BOUNDED_DISCOVERY' : 'ACQUISITION';
  if (manifest.executionLane !== expectedLane) {
    throw new Error(`checkpoint stage and manifest execution lane mismatch: ${stage}`);
  }
  if (!['CURRENT_DIMENSIONS', 'HISTORICAL_DIMENSIONS'].includes(manifest.workstreamId)) {
    throw new TypeError('checkpoint manifest must belong to a dimensions workstream');
  }
  if (!['RUN_P0', 'RUN_P1'].includes(control.decision.status)
    || control.decision.allowedManifestId !== manifest.manifestId
    || control.decision.allowedWorkstreamId !== manifest.workstreamId) {
    throw new Error(`checkpoint manifest is not allowed by scale control: ${manifest.manifestId}`);
  }
  if (manifest.workstreamId === 'HISTORICAL_DIMENSIONS' && control.decision.p1Blocked) {
    throw new Error('P1 historical dimensions checkpoint blocked while P0 remains');
  }
  if (cohortKeyForManifest(manifest) !== control.decision.cohortKey) {
    throw new Error('checkpoint manifest cohort drift against scale control');
  }
  return manifest;
}

function sortedUnique(values, label) {
  const result = [...new Set(values.map((value) => requiredText(value, label)))].sort();
  if (result.length !== values.length) throw new Error(`${label} must be unique`);
  return result;
}

function assertSameTargetSet(actual, manifest, label, key) {
  const expected = sortedUnique(manifest.targetBindings.map((row) => row[key]), `${label} manifest ${key}`);
  const observed = sortedUnique(actual, `${label} run ${key}`);
  if (!canonicalEqual(observed, expected)) throw new Error(`${label} target binding drift`);
}

function validateDimensionsCheckpointAudit(run, audit) {
  const checkedAudit = requiredObject(audit, 'dimensions checkpoint audit');
  if (checkedAudit.mode !== 'online' || checkedAudit.status !== 'passed'
    || checkedAudit.priorObjectsReplayed !== true
    || requiredArray(checkedAudit.violations ?? [], 'dimensions audit violations').length !== 0) {
    throw new Error('passing full online audit required for dimensions checkpoint');
  }
  if (checkedAudit.resultsSha256 !== canonicalJsonSha256(run)
    || checkedAudit.checkedTargets !== requiredArray(run.outcomes, 'historical recovery outcomes').length) {
    throw new Error('dimensions audit input binding drift');
  }
  return canonicalJsonSha256(checkedAudit);
}

export function buildHistoricalDimensionsScaleCheckpoint({
  control,
  manifest,
  run,
  audit = null,
  candidateManifest = null,
  afterCounters,
  storageContentSha256 = null,
}) {
  const stage = manifest?.executionLane === 'BOUNDED_DISCOVERY' ? 'DISCOVERY' : 'DIMENSIONS';
  assertHistoricalDimensionsScaleCheckpointSource({ control, manifest, stage });
  requiredObject(run, 'scale checkpoint run');
  if (run.schemaVersion !== 1) throw new TypeError('scale checkpoint run schema v1 required');
  const runId = requiredText(run.runId, 'scale checkpoint run ID');
  const completedAt = requiredTimestamp(run.completedAt, 'scale checkpoint completion time');
  let funnel;
  let auditSha256 = null;
  if (stage === 'DISCOVERY') {
    if (audit !== null) throw new TypeError('discovery checkpoint cannot carry an audit');
    if (!canonicalEqual(run.boundedManifest, manifest)
      || run.selection?.manifestId !== manifest.manifestId
      || run.selection?.semanticManifestSha256 !== manifest.semanticManifestSha256) {
      throw new Error('discovery run manifest binding drift');
    }
    assertSameTargetSet(
      requiredArray(run.targets, 'official discovery run targets').map((row) => row.referenceId),
      manifest,
      'discovery',
      'referenceId',
    );
    requiredHash(storageContentSha256, 'discovery storage content SHA-256');
    funnel = buildHistoricalDimensionsDiscoveryFunnel(
      run,
      requiredObject(candidateManifest, 'discovery candidate manifest'),
    );
  } else {
    auditSha256 = validateDimensionsCheckpointAudit(run, audit);
    if (storageContentSha256 !== null) {
      throw new TypeError('dimensions checkpoint cannot carry discovery storage content');
    }
    assertSameTargetSet(
      run.outcomes.map((row) => row.targetId),
      manifest,
      'dimensions',
      'targetId',
    );
    funnel = buildHistoricalDimensionsRecoveryFunnel(run);
  }
  const before = structuredClone(validateCounterSet(control.counters, 'scale control counters'));
  const after = structuredClone(validateCounterSet(afterCounters, 'scale checkpoint after counters'));
  const runSha256 = canonicalJsonSha256(run);
  const evidenceBindings = {
    runSha256,
    auditSha256,
    storageContentSha256: stage === 'DISCOVERY' ? storageContentSha256 : null,
    candidateManifestSha256: stage === 'DISCOVERY'
      ? canonicalJsonSha256(candidateManifest)
      : null,
  };
  const checkpointIdentitySha256 = canonicalJsonSha256({
    controlId: control.controlId,
    runId,
    stage,
    manifestId: manifest.manifestId,
    evidenceBindings,
  });
  const checkpointId = `historical-dimensions-checkpoint-${checkpointIdentitySha256.slice(0, 24)}`;
  const semantic = {
    checkpointId,
    runId,
    completedAt,
    stage,
    workstreamId: manifest.workstreamId,
    manifestId: manifest.manifestId,
    manifestSha256: manifest.semanticManifestSha256,
    cohortKey: cohortKeyForManifest(manifest),
    familyId: manifest.familyId ?? null,
    evidenceBindings,
    funnel: structuredClone(funnel),
    beforeCounters: before,
    afterCounters: after,
  };
  const checkpoint = {
    ...semantic,
    semanticCheckpointSha256: canonicalJsonSha256(semantic),
  };
  validateCheckpoint(checkpoint, before, null);
  return Object.freeze(checkpoint);
}

export function recordHistoricalDimensionsScaleCheckpoint({
  control,
  ledger,
  manifest,
  run,
  audit = null,
  candidateManifest = null,
  currentInput,
  storageContentSha256 = null,
}) {
  validateScaleControl(control);
  requiredObject(ledger, 'scale checkpoint ledger');
  if (control.sourceBindings.ledgerSha256 !== canonicalJsonSha256(ledger)) {
    throw new Error('scale control ledger binding drift');
  }
  const shared = requiredObject(currentInput, 'current scale-control input');
  const afterCounters = canonicalHistoricalDimensionsScaleCounters(shared);
  const entries = requiredArray(ledger.entries, 'scale ledger entries');
  const existingIndex = entries.findIndex((row) => row.runId === run?.runId);
  if (existingIndex >= 0) {
    const existing = entries[existingIndex];
    const stage = manifest?.executionLane === 'BOUNDED_DISCOVERY' ? 'DISCOVERY' : 'DIMENSIONS';
    if (existingIndex !== entries.length - 1 || existing.stage !== stage
      || manifest?.manifestId !== existing.manifestId
      || manifest?.semanticManifestSha256 !== existing.manifestSha256
      || canonicalJsonSha256(run) !== existing.evidenceBindings?.runSha256
      || !canonicalEqual(afterCounters, existing.afterCounters)) {
      throw new Error(`scale checkpoint run already recorded: ${run?.runId ?? '<missing>'}`);
    }
    validateManifestSemanticHash(manifest);
    let funnel;
    let evidenceBindings = structuredClone(existing.evidenceBindings);
    if (stage === 'DISCOVERY') {
      if (storageContentSha256 !== existing.evidenceBindings?.storageContentSha256) {
        throw new Error(`scale checkpoint run already recorded: ${run?.runId ?? '<missing>'}`);
      }
      funnel = buildHistoricalDimensionsDiscoveryFunnel(
        run,
        requiredObject(candidateManifest, 'discovery candidate manifest'),
      );
      evidenceBindings.candidateManifestSha256 = canonicalJsonSha256(candidateManifest);
    } else {
      const auditSha256 = validateDimensionsCheckpointAudit(run, audit);
      if (storageContentSha256 !== null || auditSha256 !== existing.evidenceBindings?.auditSha256) {
        throw new Error(`scale checkpoint run already recorded: ${run?.runId ?? '<missing>'}`);
      }
      funnel = buildHistoricalDimensionsRecoveryFunnel(run);
    }
    const nextLedger = structuredClone(ledger);
    const semantic = {
      ...structuredClone(existing),
      evidenceBindings,
      funnel: structuredClone(funnel),
    };
    delete semantic.semanticCheckpointSha256;
    const checkpoint = {
      ...semantic,
      semanticCheckpointSha256: canonicalJsonSha256(semantic),
    };
    validateCheckpoint(checkpoint, existing.beforeCounters, null);
    nextLedger.entries[existingIndex] = checkpoint;
    const nextControl = buildHistoricalDimensionsScaleControl({ ...shared, ledger: nextLedger });
    return Object.freeze({
      checkpoint,
      ledger: Object.freeze(nextLedger),
      control: nextControl,
      reconciled: true,
    });
  }
  const checkpoint = buildHistoricalDimensionsScaleCheckpoint({
    control,
    manifest,
    run,
    audit,
    candidateManifest,
    afterCounters,
    storageContentSha256,
  });
  const nextLedger = structuredClone(ledger);
  nextLedger.entries.push(structuredClone(checkpoint));
  const nextControl = buildHistoricalDimensionsScaleControl({
    ...shared,
    ledger: nextLedger,
  });
  return Object.freeze({
    checkpoint,
    ledger: Object.freeze(nextLedger),
    control: nextControl,
    reconciled: false,
  });
}

export function assertHistoricalDimensionsScaleManifestAllowed({ control, batches, manifest }) {
  validateScaleControl(control);
  requiredObject(manifest, 'bounded manifest');
  if (!['CURRENT_DIMENSIONS', 'HISTORICAL_DIMENSIONS'].includes(manifest.workstreamId)) {
    return manifest;
  }
  if (control.sourceBindings.nextBatchesSha256 !== canonicalJsonSha256(batches)) {
    throw new Error('dimensions scale control bounded-batches binding drift');
  }
  if (manifest.workstreamId === 'HISTORICAL_DIMENSIONS' && control.decision.p1Blocked) {
    throw new Error('P1 historical dimensions are blocked while P0 remains');
  }
  if (control.decision.allowedManifestId !== manifest.manifestId
    || control.decision.allowedWorkstreamId !== manifest.workstreamId) {
    throw new Error(`dimensions manifest is not allowed by scale control: ${manifest.manifestId}`);
  }
  return manifest;
}
