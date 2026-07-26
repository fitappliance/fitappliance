import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

export const HISTORICAL_DIMENSIONS_SCALE_CONTROL_SCHEMA_VERSION = 2;
export const HISTORICAL_DIMENSIONS_SCALE_LEDGER_SCHEMA_VERSION = 2;

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
const SCALE_ARTIFACT_BINDING_FIELDS = Object.freeze([
  'nextBatchesSha256',
  'programStatusSha256',
  'receiptAuditSha256',
  'replacementAuditSha256',
  'fitPublicationAuditSha256',
  'epochsSha256',
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

export const HISTORICAL_DIMENSIONS_STAGE_EPOCH_IDS = Object.freeze({
  DISCOVERY: Object.freeze(['lifecycle-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy']),
  ACQUISITION: Object.freeze(['lifecycle-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy']),
  MINERU: Object.freeze(['mineru-toolchain', 'scale-metrics']),
  IDENTITY: Object.freeze(['parser', 'scale-metrics', 'source-authority-policy']),
  DIMENSIONS_RECEIPT: Object.freeze(['parser', 'receipt-policy', 'scale-metrics']),
  INSTALLATION_FIT: Object.freeze(['fit-policy', 'parser', 'receipt-policy', 'scale-metrics']),
});

const CIRCUIT_STAGES = Object.freeze(Object.keys(HISTORICAL_DIMENSIONS_STAGE_EPOCH_IDS));
const RETRYABLE_CANDIDATE_OUTCOMES = new Set(['transport_failure']);
const UNATTEMPTED_CANDIDATE_OUTCOMES = new Set([
  'not_attempted_optional', 'reference_only', 'previous_terminal_suppressed',
]);

export const HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY = Object.freeze({
  schemaVersion: 2,
  confidence: Object.freeze({
    method: 'ONE_SIDED_WILSON',
    confidenceBasisPoints: 9_500,
    z: 1.6448536269514722,
  }),
  minimumConclusiveUnits: 10,
  minimumCompletedManifests: 2,
  stages: Object.freeze({
    DISCOVERY: Object.freeze({ floorBasisPoints: 2_000, diagnosticOnly: false }),
    ACQUISITION: Object.freeze({ floorBasisPoints: 8_000, diagnosticOnly: false }),
    MINERU: Object.freeze({ floorBasisPoints: 9_000, diagnosticOnly: false }),
    IDENTITY: Object.freeze({ floorBasisPoints: 5_000, diagnosticOnly: false }),
    DIMENSIONS_RECEIPT: Object.freeze({ floorBasisPoints: 5_000, diagnosticOnly: false }),
    INSTALLATION_FIT: Object.freeze({ floorBasisPoints: null, diagnosticOnly: true }),
  }),
});

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

function requiredSignedInteger(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} invalid`);
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
      && !['not_attempted_optional', 'reference_only', 'previous_terminal_suppressed'].includes(status);
  });
}

function sourceHasMineru(source) {
  return source?.derivedArtifact?.parserName === 'MinerU'
    && source?.derivedArtifact?.format === 'content_list_v2';
}

function sourceHasExactIdentity(source) {
  return source?.identity?.outcome === 'exact';
}

const RECEIPT_ELIGIBLE_ALIAS_SOURCE_TYPES = new Set([
  'official_exact_model_product_page',
  'official_model_variant_api',
  'official_model_variant_pdf',
]);

function sourceHasReceiptEligibleIdentity(source) {
  if (sourceHasExactIdentity(source)) return true;
  return source?.identity?.outcome === 'official_marketing_alias'
    && RECEIPT_ELIGIBLE_ALIAS_SOURCE_TYPES.has(source?.sourceType)
    && HASH.test(String(source?.verificationReceipt?.bindingSha256 ?? ''));
}

export function buildHistoricalDimensionsRecoveryFunnel(results) {
  if (results?.schemaVersion !== 1) throw new TypeError('historical recovery results schema v1 required');
  const outcomes = requiredArray(results.outcomes, 'historical recovery outcomes');
  if (!outcomes.length) throw new TypeError('historical recovery outcomes required');
  const funnel = emptyFunnel(outcomes.length);
  for (const outcome of outcomes) {
    if (targetHasCandidate(outcome)) funnel.targetsWithOfficialCandidates += 1;
    if (targetWasFetched(outcome)) funnel.fetchedTargets += 1;
    if ((outcome.sources ?? []).some(sourceHasMineru)
      || (outcome?.candidateInventory?.candidates ?? []).some((candidate) => (
        sourceHasMineru(candidate?.outcome?.source)
          || sourceHasMineru(candidate?.outcome?.artifactBinding)
      ))) funnel.mineruValidTargets += 1;
    if ((outcome.sources ?? []).some(sourceHasReceiptEligibleIdentity)) {
      funnel.identityProvenTargets += 1;
    }
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

function normalizeEpochs(epochs) {
  const byId = new Map();
  for (const epoch of requiredArray(epochs, 'historical evidence epochs')) {
    const id = requiredText(epoch?.id, 'historical evidence epoch ID');
    if (byId.has(id)) throw new Error(`duplicate historical evidence epoch: ${id}`);
    const semanticSha256 = requiredHash(
      epoch?.semanticSha256,
      `historical evidence epoch ${id} SHA-256`,
    );
    if (epoch.owner !== undefined || epoch.inputs !== undefined) {
      const owner = requiredText(epoch.owner, `historical evidence epoch ${id} owner`);
      const inputs = requiredArray(epoch.inputs, `historical evidence epoch ${id} inputs`)
        .map((input) => ({
          path: requiredText(input?.path, `historical evidence epoch ${id} input path`),
          contentSha256: requiredHash(
            input?.contentSha256,
            `historical evidence epoch ${id} input SHA-256`,
          ),
        })).sort((left, right) => left.path.localeCompare(right.path));
      if (new Set(inputs.map((input) => input.path)).size !== inputs.length
        || canonicalJsonSha256({ id, owner, inputs }) !== semanticSha256) {
        throw new Error(`historical evidence epoch semantic drift: ${id}`);
      }
    }
    byId.set(id, semanticSha256);
  }
  for (const ids of Object.values(HISTORICAL_DIMENSIONS_STAGE_EPOCH_IDS)) {
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`historical evidence epoch missing: ${id}`);
    }
  }
  return byId;
}

function normalizedEpochRows(epochs) {
  return [...normalizeEpochs(epochs).entries()]
    .map(([id, semanticSha256]) => ({ id, semanticSha256 }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function stageEpochSha256(stage, epochs) {
  const ids = HISTORICAL_DIMENSIONS_STAGE_EPOCH_IDS[stage];
  if (!ids) throw new TypeError(`unsupported circuit-breaker stage: ${stage}`);
  const byId = epochs instanceof Map ? epochs : normalizeEpochs(epochs);
  return canonicalJsonSha256(ids.map((id) => ({ id, semanticSha256: byId.get(id) })));
}

function stageMetric({
  stage,
  metricId,
  numerator,
  denominator,
  retryableUnits = 0,
  structuralTerminalUnits = null,
  diagnosticOnly = false,
}, epochs) {
  requiredInteger(numerator, `${stage} numerator`);
  requiredInteger(denominator, `${stage} denominator`);
  requiredInteger(retryableUnits, `${stage} retryable units`);
  if (numerator > denominator || retryableUnits > denominator
    || numerator + retryableUnits > denominator) {
    throw new Error(`${stage} metric accounting invalid`);
  }
  const conclusiveDenominator = denominator - retryableUnits;
  const conclusiveNumerator = numerator;
  const terminal = structuralTerminalUnits === null
    ? conclusiveDenominator - conclusiveNumerator
    : requiredInteger(structuralTerminalUnits, `${stage} structural terminal units`);
  if (terminal > conclusiveDenominator - conclusiveNumerator) {
    throw new Error(`${stage} structural terminal accounting invalid`);
  }
  return Object.freeze({
    stage,
    metricId,
    numerator,
    denominator,
    conclusiveNumerator,
    conclusiveDenominator,
    retryableUnits,
    structuralTerminalUnits: terminal,
    diagnosticOnly,
    epochSha256: stageEpochSha256(stage, epochs),
  });
}

export function buildHistoricalDimensionsDiscoveryStageMetrics(funnel, epochs) {
  validateFunnel(funnel, 'DISCOVERY', 'discovery stage metric');
  return Object.freeze([stageMetric({
    stage: 'DISCOVERY',
    metricId: 'authority_candidate_targets_per_selected_target',
    numerator: funnel.targetsWithOfficialCandidates,
    denominator: funnel.selectedTargets,
    retryableUnits: funnel.retryableTargets,
    structuralTerminalUnits: funnel.terminalTargets,
  }, epochs)]);
}

function candidateRows(results) {
  return requiredArray(results.outcomes, 'historical recovery outcomes').flatMap((outcome) => (
    (outcome?.candidateInventory?.candidates ?? []).map((candidate) => ({ candidate, outcome }))
  ));
}

function validImmutableAuthoritySource(source) {
  return ['manufacturer', 'regulator'].includes(source?.authority)
    && HASH.test(String(source?.contentSha256 ?? ''))
    && typeof source?.objectPath === 'string'
    && source.objectPath.length > 0;
}

function candidateWasAttempted(candidate) {
  if (candidate?.authorityMode !== 'official') return false;
  const status = candidate?.outcome?.status;
  return Boolean(status) && !UNATTEMPTED_CANDIDATE_OUTCOMES.has(status);
}

function candidateHasEligiblePdf(candidate) {
  const source = candidate?.outcome?.source;
  if (validImmutableAuthoritySource(source)) return source.contentType === 'application/pdf';
  const binding = candidate?.outcome?.artifactBinding;
  return HASH.test(String(binding?.contentSha256 ?? ''))
    && typeof binding?.objectPath === 'string'
    && binding.objectPath.toLowerCase().endsWith('.pdf');
}

export function buildHistoricalDimensionsRecoveryStageMetrics(results, epochs) {
  if (results?.schemaVersion !== 1) throw new TypeError('historical recovery results schema v1 required');
  const outcomes = requiredArray(results.outcomes, 'historical recovery outcomes');
  if (!outcomes.length) throw new TypeError('historical recovery outcomes required');
  const rows = candidateRows(results);
  const attempted = rows.filter(({ candidate }) => candidateWasAttempted(candidate));
  const acquisitionSuccesses = attempted.filter(({ candidate }) => (
    ['accepted', 'unchanged'].includes(candidate.outcome.status)
      && validImmutableAuthoritySource(candidate.outcome.source)
  ));
  const acquisitionRetryable = attempted.filter(({ candidate }) => (
    RETRYABLE_CANDIDATE_OUTCOMES.has(candidate.outcome.status)
  ));
  const eligiblePdfs = attempted.filter(({ candidate }) => candidateHasEligiblePdf(candidate));
  const mineruValid = eligiblePdfs.filter(({ candidate }) => sourceHasMineru(candidate.outcome.source));
  const parsedSources = mineruValid.map(({ candidate }) => candidate.outcome.source);
  const identityProvenDocuments = parsedSources.filter(sourceHasReceiptEligibleIdentity);
  const identityProvenOutcomes = outcomes.filter((outcome) => (
    (outcome.sources ?? []).some(sourceHasReceiptEligibleIdentity)
  ));
  const retryableIdentityOutcomes = identityProvenOutcomes.filter(
    (outcome) => outcome.status === 'retryable_failure',
  );
  const receipted = identityProvenOutcomes.filter((outcome) => outcome.status === 'accepted');
  return Object.freeze([
    stageMetric({
      stage: 'ACQUISITION',
      metricId: 'valid_immutable_authority_objects_per_attempted_candidate_job',
      numerator: acquisitionSuccesses.length,
      denominator: attempted.length,
      retryableUnits: acquisitionRetryable.length,
    }, epochs),
    stageMetric({
      stage: 'MINERU',
      metricId: 'valid_content_list_v2_per_eligible_fetched_pdf',
      numerator: mineruValid.length,
      denominator: eligiblePdfs.length,
    }, epochs),
    stageMetric({
      stage: 'IDENTITY',
      metricId: 'receipt_eligible_identity_proof_per_valid_parsed_document',
      numerator: identityProvenDocuments.length,
      denominator: parsedSources.length,
    }, epochs),
    stageMetric({
      stage: 'DIMENSIONS_RECEIPT',
      metricId: 'accepted_whd_receipt_per_receipt_eligible_identity_target',
      numerator: receipted.length,
      denominator: identityProvenOutcomes.length,
      retryableUnits: retryableIdentityOutcomes.length,
    }, epochs),
    stageMetric({
      stage: 'INSTALLATION_FIT',
      metricId: 'complete_hard_field_set_per_selected_model_field_set',
      numerator: 0,
      denominator: 0,
      diagnosticOnly: true,
    }, epochs),
  ]);
}

export function oneSidedWilsonUpperBound(numerator, denominator, z = 1.6448536269514722) {
  requiredInteger(numerator, 'Wilson numerator');
  requiredInteger(denominator, 'Wilson denominator', 1);
  if (numerator > denominator || !Number.isFinite(z) || z <= 0) {
    throw new TypeError('Wilson inputs invalid');
  }
  const probability = numerator / denominator;
  const zSquared = z * z;
  const centre = probability + (zSquared / (2 * denominator));
  const spread = z * Math.sqrt(
    ((probability * (1 - probability)) / denominator)
      + (zSquared / (4 * denominator * denominator)),
  );
  return (centre + spread) / (1 + (zSquared / denominator));
}

function validateStagePolicy(policy) {
  if (policy?.schemaVersion !== 2) throw new TypeError('stage circuit policy schema v2 required');
  const minimumConclusiveUnits = requiredInteger(
    policy.minimumConclusiveUnits, 'minimum conclusive units', 10,
  );
  const minimumCompletedManifests = requiredInteger(
    policy.minimumCompletedManifests, 'minimum completed manifests', 2,
  );
  if (policy.confidence?.method !== 'ONE_SIDED_WILSON'
    || policy.confidence?.confidenceBasisPoints !== 9_500
    || !Number.isFinite(policy.confidence?.z) || policy.confidence.z <= 0) {
    throw new TypeError('one-sided 95% Wilson policy required');
  }
  for (const stage of CIRCUIT_STAGES) {
    const stagePolicy = requiredObject(policy.stages?.[stage], `${stage} circuit policy`);
    if (stagePolicy.diagnosticOnly === true) {
      if (stagePolicy.floorBasisPoints !== null) throw new TypeError(`${stage} diagnostic floor must be null`);
    } else {
      const floor = requiredInteger(stagePolicy.floorBasisPoints, `${stage} floor basis points`, 1);
      if (floor > 10_000) throw new TypeError(`${stage} floor basis points invalid`);
    }
  }
  return { minimumConclusiveUnits, minimumCompletedManifests };
}

function validateStageMetric(metric) {
  if (!CIRCUIT_STAGES.includes(metric?.stage)) throw new TypeError('checkpoint stage metric invalid');
  requiredText(metric.metricId, `${metric.stage} metric ID`);
  for (const field of [
    'numerator', 'denominator', 'conclusiveNumerator', 'conclusiveDenominator',
    'retryableUnits', 'structuralTerminalUnits',
  ]) requiredInteger(metric[field], `${metric.stage} ${field}`);
  if (metric.numerator > metric.denominator
    || metric.conclusiveNumerator > metric.conclusiveDenominator
    || metric.conclusiveDenominator + metric.retryableUnits !== metric.denominator
    || metric.conclusiveNumerator !== metric.numerator) {
    throw new Error(`${metric.stage} checkpoint metric accounting drift`);
  }
  if (typeof metric.diagnosticOnly !== 'boolean') throw new TypeError(`${metric.stage} diagnostic flag invalid`);
  requiredHash(metric.epochSha256, `${metric.stage} epoch SHA-256`);
  return metric;
}

export function evaluateHistoricalDimensionsStageCircuitBreakers({
  checkpoints,
  policy,
  currentEpochs,
}) {
  const thresholds = validateStagePolicy(policy);
  const epochMap = normalizeEpochs(currentEpochs);
  const groups = new Map();
  const legacyDiagnostics = [];
  for (const checkpoint of requiredArray(checkpoints, 'scale circuit checkpoints')) {
    const checkpointId = requiredText(checkpoint?.checkpointId, 'scale circuit checkpoint ID');
    const cohortKey = requiredText(checkpoint?.cohortKey, `${checkpointId} cohort key`);
    const manifestId = requiredText(checkpoint?.manifestId, `${checkpointId} manifest ID`);
    if (!Array.isArray(checkpoint.stageMetrics)) {
      legacyDiagnostics.push({
        checkpointId, cohortKey, manifestId,
        reason: 'LEGACY_CHECKPOINT_HAS_NO_TYPED_STAGE_METRICS',
      });
      continue;
    }
    for (const metric of checkpoint.stageMetrics.map(validateStageMetric)) {
      const key = [cohortKey, metric.stage, metric.epochSha256].join('|');
      const group = groups.get(key) ?? {
        cohortKey, stage: metric.stage, epochSha256: metric.epochSha256,
        checkpointIds: [], manifestIds: new Set(), numerator: 0, denominator: 0,
        conclusiveNumerator: 0, conclusiveDenominator: 0,
        retryableUnits: 0, structuralTerminalUnits: 0,
      };
      group.checkpointIds.push(checkpointId);
      group.manifestIds.add(manifestId);
      for (const field of [
        'numerator', 'denominator', 'conclusiveNumerator', 'conclusiveDenominator',
        'retryableUnits', 'structuralTerminalUnits',
      ]) group[field] += metric[field];
      groups.set(key, group);
    }
  }
  const haltedCohorts = [];
  const reopenedCohorts = [];
  const stageSummaries = [];
  for (const group of groups.values()) {
    const stagePolicy = policy.stages[group.stage];
    const currentEpochSha256 = stageEpochSha256(group.stage, epochMap);
    const row = {
      ...group,
      manifestIds: [...group.manifestIds].sort(),
      completedManifests: group.manifestIds.size,
      currentEpochSha256,
    };
    stageSummaries.push(row);
    if (group.epochSha256 !== currentEpochSha256) {
      reopenedCohorts.push({
        cohortKey: group.cohortKey,
        stage: group.stage,
        priorEpochSha256: group.epochSha256,
        currentEpochSha256,
        reason: 'RELEVANT_EPOCH_CHANGED',
      });
      continue;
    }
    if (stagePolicy.diagnosticOnly
      || group.conclusiveDenominator < thresholds.minimumConclusiveUnits
      || group.manifestIds.size < thresholds.minimumCompletedManifests) continue;
    const upperBound = oneSidedWilsonUpperBound(
      group.conclusiveNumerator,
      group.conclusiveDenominator,
      policy.confidence.z,
    );
    if (upperBound * 10_000 < stagePolicy.floorBasisPoints) {
      haltedCohorts.push({
        cohortKey: group.cohortKey,
        stage: group.stage,
        epochSha256: group.epochSha256,
        checkpointIds: [...group.checkpointIds],
        manifestIds: row.manifestIds,
        conclusiveNumerator: group.conclusiveNumerator,
        conclusiveDenominator: group.conclusiveDenominator,
        retryableUnits: group.retryableUnits,
        floorBasisPoints: stagePolicy.floorBasisPoints,
        wilsonUpperBasisPoints: Math.round(upperBound * 10_000),
        reason: 'WILSON_UPPER_BOUND_BELOW_STAGE_FLOOR',
      });
    }
  }
  const sorter = (left, right) => left.cohortKey.localeCompare(right.cohortKey)
    || left.stage.localeCompare(right.stage)
    || String(left.epochSha256 ?? left.priorEpochSha256).localeCompare(
      String(right.epochSha256 ?? right.priorEpochSha256),
    );
  return Object.freeze({
    haltedCohorts: Object.freeze(haltedCohorts.sort(sorter)),
    reopenedCohorts: Object.freeze(reopenedCohorts.sort(sorter)),
    stageSummaries: Object.freeze(stageSummaries.sort(sorter)),
    legacyDiagnostics: Object.freeze(legacyDiagnostics.sort((left, right) => (
      left.checkpointId.localeCompare(right.checkpointId)
    ))),
  });
}

export function selectHistoricalDimensionsScaleDecision({
  nextBatches,
  counters,
  haltedCohorts = [],
  operationalState = {},
}) {
  const allowedOperational = {
    safety: new Set(['PASSED', 'FAILED']),
    resourceBudget: new Set(['AVAILABLE', 'EXHAUSTED']),
    onlineExternalState: new Set(['NOT_REQUIRED', 'AVAILABLE', 'REQUIRED_UNAVAILABLE']),
  };
  for (const [field, allowed] of Object.entries(allowedOperational)) {
    const value = operationalState[field] ?? {
      safety: 'PASSED', resourceBudget: 'AVAILABLE', onlineExternalState: 'NOT_REQUIRED',
    }[field];
    if (!allowed.has(value)) throw new TypeError(`operational state ${field} invalid`);
  }
  const globalStops = [
    [operationalState.safety === 'FAILED', 'STOP_SAFETY', 'SAFETY_OR_AUDIT_FAILURE'],
    [operationalState.resourceBudget === 'EXHAUSTED', 'STOP_RESOURCE_BUDGET', 'RESOURCE_BUDGET_EXHAUSTED'],
    [operationalState.onlineExternalState === 'REQUIRED_UNAVAILABLE', 'STOP_EXTERNAL_STATE', 'REQUIRED_ONLINE_EXTERNAL_STATE_UNAVAILABLE'],
  ];
  const stopped = globalStops.find(([condition]) => condition);
  if (stopped) return Object.freeze({
    status: stopped[1], allowedManifestId: null, allowedWorkstreamId: null,
    p1Blocked: requiredInteger(counters.p0EligibleTargets, 'P0 eligible targets') > 0,
    reason: stopped[2], cohortKey: null,
  });
  const manifests = new Map(requiredArray(nextBatches.manifests, 'bounded manifests')
    .map((manifest) => [manifest.manifestId, manifest]));
  const stream = (id) => requiredArray(nextBatches.workstreams, 'bounded workstreams')
    .find((row) => row.workstreamId === id);
  const blocked = new Set(haltedCohorts.map((row) => requiredText(row.cohortKey, 'halted cohort key')));
  const select = (workstreamId, priorityClass) => {
    const row = requiredObject(stream(workstreamId), `${workstreamId} workstream`);
    const candidates = requiredArray(row.manifestIds, `${workstreamId} manifest IDs`)
      .map((id) => manifests.get(id))
      .filter((manifest) => manifest?.constraints?.priorityClass === priorityClass);
    return { row, manifest: candidates.find((manifest) => !blocked.has(manifest.cohortKey)) ?? null };
  };
  const p0Eligible = requiredInteger(counters.p0EligibleTargets, 'P0 eligible targets');
  const p1Eligible = requiredInteger(counters.p1EligibleTargets, 'P1 eligible targets');
  if (p0Eligible > 0) {
    const { row, manifest } = select('CURRENT_DIMENSIONS', 'P0_CURRENT_MISSING_DIMENSIONS');
    if (manifest) return Object.freeze({
      status: 'RUN_P0', allowedManifestId: manifest.manifestId,
      allowedWorkstreamId: 'CURRENT_DIMENSIONS', p1Blocked: true,
      reason: 'P0_CURRENT_DIMENSIONS_FIRST_RUNNABLE_COHORT', cohortKey: manifest.cohortKey,
    });
    const eligibleCohorts = row.eligibleCohortsByPriority?.P0_CURRENT_MISSING_DIMENSIONS ?? 0;
    const windowedCohorts = row.windowedCohortsByPriority?.P0_CURRENT_MISSING_DIMENSIONS ?? 0;
    return Object.freeze({
      status: eligibleCohorts > windowedCohorts
        ? 'STOP_P0_WINDOW_EXHAUSTED' : 'STOP_NO_RUNNABLE_MANIFESTS',
      allowedManifestId: null, allowedWorkstreamId: 'CURRENT_DIMENSIONS', p1Blocked: true,
      reason: eligibleCohorts > windowedCohorts
        ? 'VISIBLE_P0_COHORTS_BLOCKED_DEFERRED_P0_REMAINS'
        : 'ZERO_RUNNABLE_P0_MANIFESTS',
      cohortKey: null,
    });
  }
  if (p1Eligible > 0) {
    const { row, manifest } = select('HISTORICAL_DIMENSIONS', 'P1_HISTORICAL_MISSING_DIMENSIONS');
    if (manifest) return Object.freeze({
      status: 'RUN_P1', allowedManifestId: manifest.manifestId,
      allowedWorkstreamId: 'HISTORICAL_DIMENSIONS', p1Blocked: false,
      reason: 'P0_EMPTY_P1_FIRST_RUNNABLE_COHORT', cohortKey: manifest.cohortKey,
    });
    const eligibleCohorts = row.eligibleCohortsByPriority?.P1_HISTORICAL_MISSING_DIMENSIONS ?? 0;
    const windowedCohorts = row.windowedCohortsByPriority?.P1_HISTORICAL_MISSING_DIMENSIONS ?? 0;
    return Object.freeze({
      status: eligibleCohorts > windowedCohorts
        ? 'STOP_P1_WINDOW_EXHAUSTED' : 'STOP_NO_RUNNABLE_MANIFESTS',
      allowedManifestId: null, allowedWorkstreamId: 'HISTORICAL_DIMENSIONS', p1Blocked: false,
      reason: eligibleCohorts > windowedCohorts
        ? 'VISIBLE_P1_COHORTS_BLOCKED_DEFERRED_P1_REMAINS'
        : 'ZERO_RUNNABLE_P1_MANIFESTS',
      cohortKey: null,
    });
  }
  return Object.freeze({
    status: 'COMPLETE', allowedManifestId: null, allowedWorkstreamId: null,
    p1Blocked: false, reason: 'NO_ELIGIBLE_DIMENSIONS_TARGETS', cohortKey: null,
  });
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
  if (checkpoint.stageMetrics !== undefined) {
    const metrics = requiredArray(checkpoint.stageMetrics, `${checkpointId} stage metrics`)
      .map(validateStageMetric);
    const expectedStages = checkpoint.stage === 'DISCOVERY'
      ? ['DISCOVERY']
      : ['ACQUISITION', 'MINERU', 'IDENTITY', 'DIMENSIONS_RECEIPT', 'INSTALLATION_FIT'];
    if (!canonicalEqual(metrics.map((row) => row.stage), expectedStages)) {
      throw new Error(`${checkpointId} stage metric sequence drift`);
    }
  }
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

function validateScaleArtifactBindings(value, label) {
  const bindings = requiredObject(value, label);
  if (!canonicalEqual(Object.keys(bindings).sort(), [...SCALE_ARTIFACT_BINDING_FIELDS].sort())) {
    throw new TypeError(`${label} fields invalid`);
  }
  for (const field of SCALE_ARTIFACT_BINDING_FIELDS) requiredHash(bindings[field], `${label} ${field}`);
  return bindings;
}

function validateRebaseline(value, previousCounters, previousCompletedAt) {
  const rebaseline = requiredObject(value, 'scale rebaseline');
  const { semanticRebaselineSha256, ...semantic } = rebaseline;
  const rebaselineId = requiredText(rebaseline.rebaselineId, 'scale rebaseline ID');
  if (canonicalJsonSha256(semantic) !== requiredHash(
    semanticRebaselineSha256,
    `${rebaselineId} semantic SHA-256`,
  )) throw new Error(`${rebaselineId} rebaseline semantic hash drift`);
  const activatedAt = requiredTimestamp(rebaseline.activatedAt, `${rebaselineId} activation time`);
  if (previousCompletedAt && Date.parse(activatedAt) < Date.parse(previousCompletedAt)) {
    throw new Error(`${rebaselineId} activation time is out of order`);
  }
  if (rebaseline.reason !== 'RELEASE_DAG_RECONCILIATION') {
    throw new TypeError(`${rebaselineId} rebaseline reason invalid`);
  }
  requiredInteger(rebaseline.afterEntryCount, `${rebaselineId} entry offset`);
  requiredHash(rebaseline.priorControlSha256, `${rebaselineId} prior control SHA-256`);
  const priorBindings = validateScaleArtifactBindings(
    rebaseline.priorArtifactBindings,
    `${rebaselineId} prior artifact bindings`,
  );
  const nextBindings = validateScaleArtifactBindings(
    rebaseline.nextArtifactBindings,
    `${rebaselineId} next artifact bindings`,
  );
  const changedBindings = requiredArray(
    rebaseline.changedArtifactBindings,
    `${rebaselineId} changed artifact bindings`,
  );
  const expectedChangedBindings = SCALE_ARTIFACT_BINDING_FIELDS
    .filter((field) => priorBindings[field] !== nextBindings[field]);
  if (!expectedChangedBindings.length || !canonicalEqual(changedBindings, expectedChangedBindings)) {
    throw new Error(`${rebaselineId} changed artifact binding accounting drift`);
  }
  const before = validateCounterSet(rebaseline.previousCounters, `${rebaselineId} previous counters`);
  const after = validateCounterSet(rebaseline.nextCounters, `${rebaselineId} next counters`);
  if (!canonicalEqual(before, previousCounters)) {
    throw new Error(`${rebaselineId} rebaseline counter chain drift`);
  }
  for (const field of MONOTONIC_COUNTERS) {
    if (after[field] !== before[field]) {
      throw new Error(`${rebaselineId} coverage counters cannot change during rebaseline: ${field}`);
    }
  }
  const queueCounterDeltas = requiredObject(
    rebaseline.queueCounterDeltas,
    `${rebaselineId} queue counter deltas`,
  );
  if (!canonicalEqual(Object.keys(queueCounterDeltas).sort(), [...QUEUE_COUNTERS].sort())) {
    throw new TypeError(`${rebaselineId} queue counter delta fields invalid`);
  }
  let changedQueueCounters = 0;
  for (const field of QUEUE_COUNTERS) {
    const delta = requiredSignedInteger(queueCounterDeltas[field], `${rebaselineId} ${field} delta`);
    if (delta !== after[field] - before[field]) {
      throw new Error(`${rebaselineId} queue counter delta drift: ${field}`);
    }
    if (delta !== 0) changedQueueCounters += 1;
  }
  if (changedQueueCounters === 0) throw new Error(`${rebaselineId} rebaseline has no queue counter change`);
  return { rebaseline, activatedAt, after };
}

function validateLedger(ledger, currentCounters) {
  if (![1, HISTORICAL_DIMENSIONS_SCALE_LEDGER_SCHEMA_VERSION].includes(ledger?.schemaVersion)) {
    throw new TypeError('historical dimensions scale ledger schema v1 or v2 required');
  }
  requiredText(ledger.ledgerId, 'scale ledger ID');
  requiredTimestamp(ledger.activatedAt, 'scale ledger activation time');
  const policy = ledger.schemaVersion === 1
    ? structuredClone(HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY)
    : structuredClone(requiredObject(ledger.policy, 'stage circuit policy'));
  validateStagePolicy(policy);
  const baseline = validateCounterSet(ledger.baseline?.counters, 'scale baseline counters');
  let previous = baseline;
  let previousCompletedAt = ledger.activatedAt;
  const checkpoints = [];
  const rebaselines = [];
  const ids = new Set();
  const runs = new Set();
  const entries = requiredArray(ledger.entries, 'scale ledger entries');
  const transitions = requiredArray(ledger.rebaselines ?? [], 'scale ledger rebaselines');
  let transitionIndex = 0;
  for (let entryIndex = 0; entryIndex <= entries.length; entryIndex += 1) {
    while (transitionIndex < transitions.length
      && transitions[transitionIndex]?.afterEntryCount === entryIndex) {
      const result = validateRebaseline(transitions[transitionIndex], previous, previousCompletedAt);
      if (ids.has(result.rebaseline.rebaselineId)) {
        throw new Error(`duplicate scale rebaseline: ${result.rebaseline.rebaselineId}`);
      }
      ids.add(result.rebaseline.rebaselineId);
      rebaselines.push(result.rebaseline);
      previous = result.after;
      previousCompletedAt = result.activatedAt;
      transitionIndex += 1;
    }
    if (entryIndex === entries.length) break;
    const row = entries[entryIndex];
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
  if (transitionIndex !== transitions.length) {
    throw new Error('scale rebaseline entry offset is out of order or exceeds ledger entries');
  }
  if (!canonicalEqual(previous, currentCounters)) {
    throw new Error('current counters changed without a recorded scale checkpoint');
  }
  return {
    checkpoints,
    rebaselines,
    policy,
  };
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
  if (manifest?.cohortKeyVersion === '1' && manifest?.cohortKey) {
    return requiredText(manifest.cohortKey, 'manifest cohort key');
  }
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

function scaleArtifactBindings(input, epochs) {
  return {
    nextBatchesSha256: canonicalJsonSha256(input.nextBatches),
    programStatusSha256: canonicalJsonSha256(input.programStatus),
    receiptAuditSha256: canonicalJsonSha256(input.receiptAudit),
    replacementAuditSha256: canonicalJsonSha256(input.replacementAudit),
    fitPublicationAuditSha256: canonicalJsonSha256(input.fitPublicationAudit),
    epochsSha256: canonicalJsonSha256(epochs),
  };
}

function sourceBindings(input, epochs) {
  return {
    ledgerSha256: canonicalJsonSha256(input.ledger),
    ...scaleArtifactBindings(input, epochs),
  };
}

export function buildHistoricalDimensionsScaleControl(input) {
  const counters = canonicalHistoricalDimensionsScaleCounters(input);
  const ledger = validateLedger(requiredObject(input?.ledger, 'scale ledger'), counters);
  const epochs = normalizedEpochRows(input?.epochs);
  const epochMap = normalizeEpochs(epochs);
  const circuits = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: ledger.checkpoints,
    policy: ledger.policy,
    currentEpochs: epochs,
  });
  const operationalState = {
    safety: input.operationalState?.safety ?? 'PASSED',
    resourceBudget: input.operationalState?.resourceBudget ?? 'AVAILABLE',
    onlineExternalState: input.operationalState?.onlineExternalState ?? 'NOT_REQUIRED',
  };
  const semantic = {
    schemaVersion: HISTORICAL_DIMENSIONS_SCALE_CONTROL_SCHEMA_VERSION,
    generatedAt: requiredTimestamp(input.generatedAt, 'scale control generation time'),
    policy: {
      ...ledger.policy,
      p0BeforeP1: true,
      scalarReceiptRequiredForReplacementAutoFill: true,
      receiptReplayAndZeroPublicationViolationsRequired: true,
    },
    sourceBindings: sourceBindings(input, epochs),
    epochs,
    operationalState,
    counters: structuredClone(counters),
    checkpointCount: ledger.checkpoints.length,
    rebaselineCount: ledger.rebaselines.length,
    latestRebaseline: ledger.rebaselines.length ? (() => {
      const latest = ledger.rebaselines.at(-1);
      return {
        rebaselineId: latest.rebaselineId,
        activatedAt: latest.activatedAt,
        reason: latest.reason,
        queueCounterDeltas: structuredClone(latest.queueCounterDeltas),
        changedArtifactBindings: [...latest.changedArtifactBindings],
      };
    })() : null,
    haltedCohorts: circuits.haltedCohorts,
    reopenedCohorts: circuits.reopenedCohorts,
    stageSummaries: circuits.stageSummaries,
    legacyDiagnostics: circuits.legacyDiagnostics,
    weeklyThroughput: weeklyThroughput(ledger.checkpoints),
    projection: projection(ledger.checkpoints, counters),
    decision: selectHistoricalDimensionsScaleDecision({
      nextBatches: input.nextBatches,
      counters,
      haltedCohorts: circuits.haltedCohorts,
      operationalState,
    }),
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
    throw new TypeError('historical dimensions scale control schema v2 required');
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
    stageMetrics: structuredClone(stage === 'DISCOVERY'
      ? buildHistoricalDimensionsDiscoveryStageMetrics(funnel, control.epochs)
      : buildHistoricalDimensionsRecoveryStageMetrics(run, control.epochs)),
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
  if (control.sourceBindings.epochsSha256 !== canonicalJsonSha256(
    normalizedEpochRows(shared.epochs),
  )) throw new Error('scale checkpoint processor or policy epoch drift');
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
      stageMetrics: structuredClone(stage === 'DISCOVERY'
        ? buildHistoricalDimensionsDiscoveryStageMetrics(funnel, control.epochs)
        : buildHistoricalDimensionsRecoveryStageMetrics(run, control.epochs)),
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

export function recordHistoricalDimensionsScaleRebaseline({
  priorControl,
  ledger,
  currentInput,
  activatedAt,
  reason,
}) {
  validateScaleControl(priorControl);
  requiredObject(ledger, 'scale rebaseline ledger');
  if (priorControl.sourceBindings.ledgerSha256 !== canonicalJsonSha256(ledger)) {
    throw new Error('scale rebaseline prior control ledger binding drift');
  }
  validateLedger(ledger, validateCounterSet(
    priorControl.counters,
    'scale rebaseline prior control counters',
  ));
  const shared = requiredObject(currentInput, 'current scale-control input');
  const epochs = normalizedEpochRows(shared.epochs);
  const nextCounters = canonicalHistoricalDimensionsScaleCounters(shared);
  const previousCounters = structuredClone(priorControl.counters);
  for (const field of MONOTONIC_COUNTERS) {
    if (nextCounters[field] !== previousCounters[field]) {
      throw new Error(`coverage counters cannot change during release DAG rebaseline: ${field}`);
    }
  }
  const priorArtifactBindings = Object.fromEntries(SCALE_ARTIFACT_BINDING_FIELDS.map((field) => [
    field,
    requiredHash(priorControl.sourceBindings[field], `prior control ${field}`),
  ]));
  const nextArtifactBindings = scaleArtifactBindings(shared, epochs);
  const changedArtifactBindings = SCALE_ARTIFACT_BINDING_FIELDS
    .filter((field) => priorArtifactBindings[field] !== nextArtifactBindings[field]);
  if (!changedArtifactBindings.length) {
    throw new Error('release DAG rebaseline requires a changed bound artifact');
  }
  const queueCounterDeltas = Object.fromEntries(QUEUE_COUNTERS.map((field) => [
    field,
    nextCounters[field] - previousCounters[field],
  ]));
  if (Object.values(queueCounterDeltas).every((delta) => delta === 0)) {
    throw new Error('release DAG rebaseline requires a queue counter change');
  }
  const activation = requiredTimestamp(activatedAt, 'scale rebaseline activation time');
  if (reason !== 'RELEASE_DAG_RECONCILIATION') {
    throw new TypeError('scale rebaseline reason invalid');
  }
  const identitySha256 = canonicalJsonSha256({
    activatedAt: activation,
    afterEntryCount: ledger.entries.length,
    priorControlSha256: priorControl.semanticControlSha256,
    nextArtifactBindings,
    nextCounters,
  });
  const semantic = {
    rebaselineId: `historical-dimensions-rebaseline-${identitySha256.slice(0, 24)}`,
    activatedAt: activation,
    afterEntryCount: ledger.entries.length,
    reason,
    priorControlSha256: priorControl.semanticControlSha256,
    priorArtifactBindings,
    nextArtifactBindings,
    changedArtifactBindings,
    previousCounters,
    nextCounters: structuredClone(nextCounters),
    queueCounterDeltas,
  };
  const rebaseline = {
    ...semantic,
    semanticRebaselineSha256: canonicalJsonSha256(semantic),
  };
  const nextLedger = structuredClone(ledger);
  nextLedger.rebaselines = [...(nextLedger.rebaselines ?? []), rebaseline];
  const control = buildHistoricalDimensionsScaleControl({ ...shared, ledger: nextLedger });
  return Object.freeze({
    rebaseline: Object.freeze(rebaseline),
    ledger: Object.freeze(nextLedger),
    control,
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
