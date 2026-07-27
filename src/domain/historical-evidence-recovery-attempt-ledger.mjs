import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import {
  historicalAttemptProcessorCapability,
  legacyEvidenceProcessorEpoch,
  validateEvidenceProcessorEpochs,
} from './evidence-processor-epoch.mjs';

const TRANSIENT_FAILURES = new Set(['transport', 'discovery', 'discovery_incomplete', 'environment']);
const SKIPPED_STATUSES = new Set([
  'accepted', 'unchanged', 'not_attempted_optional', 'reference_only', 'previous_terminal_suppressed',
]);
const EXHAUSTED_CANDIDATE_STATUSES = new Set([
  'claims_incomplete', 'identity_rejected', 'mineru_failure',
  'previous_terminal_suppressed', 'reference_only',
]);
const TARGET_CONFLICT_REASON = 'complete_conflicting_candidate_inventory';

function text(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function sha256(value, label) {
  const normalized = text(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function timestamp(value, label) {
  const normalized = text(value, label);
  if (Number.isNaN(Date.parse(normalized))) throw new TypeError(`${label} invalid`);
  return new Date(normalized).toISOString();
}

function sourceUrl(value) {
  const url = new URL(text(value, 'attempt source URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('attempt source URL must be trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function disposition(failureCode) {
  if (TRANSIENT_FAILURES.has(failureCode)) return 'RETRY_TRANSIENT';
  if (failureCode === 'identity') return 'SEEK_ALTERNATIVE_OFFICIAL_SOURCE';
  if (failureCode === 'claim_semantics') return 'SEEK_EXACT_MODEL_FIELD_SOURCE';
  if (failureCode === 'source_authority') return 'SEEK_OFFICIAL_SOURCE';
  if (failureCode === 'mineru') return 'RETRY_AFTER_PARSER_OR_POLICY_CHANGE';
  if (failureCode === 'payload') return 'SEEK_ALTERNATIVE_OR_CHANGED_CONTENT';
  return 'RETRY_AFTER_POLICY_CHANGE';
}

function countBy(entries, key) {
  const result = {};
  for (const entry of entries) result[entry[key]] = (result[entry[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function sameSourceFact(left, right, keys) {
  return keys.every((key) => left[key] === right[key]);
}

function sameReauditedFact(left, right) {
  const withoutAuditReceipt = (value) => {
    const { auditSha256: _auditSha256, ...fact } = value;
    return fact;
  };
  return canonicalJsonSha256(withoutAuditReceipt(left))
    === canonicalJsonSha256(withoutAuditReceipt(right));
}

export function historicalResolverContractSha256(resolvers) {
  if (!Array.isArray(resolvers) || resolvers.length === 0) {
    throw new TypeError('resolver contract requires at least one resolver');
  }
  const normalized = resolvers.map((resolver) => ({
    resolverId: text(resolver.resolverId, 'resolver contract ID'),
    version: text(resolver.version, 'resolver contract version'),
    scope: text(resolver.scope, 'resolver contract scope'),
    required: resolver.required === true,
  })).sort((left, right) => left.resolverId.localeCompare(right.resolverId));
  if (new Set(normalized.map((resolver) => resolver.resolverId)).size !== normalized.length) {
    throw new TypeError('resolver contract contains duplicate resolver IDs');
  }
  return canonicalJsonSha256(normalized);
}

function validateRunStateBinding(state, { batch, results, batchSha256 }) {
  if (!state) return { evidenceProcessorEpochs: {} };
  if (state.schemaVersion !== 1 || state.status !== 'completed'
    || state.runId !== results.runId || state.batchId !== batch.batchId
    || state.input?.batchSha256 !== batchSha256
    || state.input?.policySha256 !== results.policySha256) {
    throw new Error('attempt ledger run-state binding mismatch');
  }
  const toolchainSha256 = sha256(state.input?.toolchainSha256, 'run-state toolchain SHA-256');
  if (canonicalJsonSha256(state.input?.toolchain) !== toolchainSha256) {
    throw new Error('attempt ledger run-state toolchain drift');
  }
  return {
    toolchainSha256,
    evidenceProcessorEpochs: state.input.toolchain?.evidenceProcessorEpochs
      ? validateEvidenceProcessorEpochs(state.input.toolchain.evidenceProcessorEpochs)
      : {},
  };
}

function validateRunBindings(batch, results, audit, state) {
  if (audit?.mode !== 'online' || audit?.status !== 'passed') {
    throw new Error('attempt ledger requires a passing online audit');
  }
  const batchSha256 = canonicalJsonSha256(batch);
  const resultsSha256 = canonicalJsonSha256(results);
  if (results.batchId !== batch.batchId || audit.batchId !== batch.batchId
    || results.batchSha256 !== batchSha256 || audit.batchSha256 !== batchSha256
    || audit.resultsSha256 !== resultsSha256
    || results.queueSha256 !== batch.queue.sha256
    || results.policySha256 !== batch.policy.sha256) {
    throw new Error('attempt ledger run binding mismatch');
  }
  return {
    batchSha256,
    resultsSha256,
    ...validateRunStateBinding(state, { batch, results, batchSha256 }),
  };
}

function attemptEntry({ target, candidate, outcome, batch, results, audit, bindings }) {
  const failureCode = text(outcome.failureCode, 'candidate failure code');
  const normalizedSourceUrl = sourceUrl(candidate.sourceUrl);
  const contentSha256 = outcome.artifactBinding?.contentSha256
    ?? outcome.source?.contentSha256
    ?? null;
  if (contentSha256 !== null) sha256(contentSha256, 'candidate content SHA-256');
  const reason = text(outcome.reason ?? `${outcome.status}:${failureCode}`, 'candidate failure reason');
  const processorCapability = historicalAttemptProcessorCapability({
    brand: target.brand,
    sourceUrl: normalizedSourceUrl,
    failureCode,
  });
  const evidenceProcessorSha256 = processorCapability
    ? bindings.evidenceProcessorEpochs?.[processorCapability]
    : null;
  if (processorCapability && !evidenceProcessorSha256) {
    throw new Error(`attempt processor epoch missing: ${processorCapability}`);
  }
  const seed = {
    runId: results.runId,
    targetId: target.targetId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: outcome.status,
    failureCode,
    policySha256: results.policySha256,
    ...(processorCapability ? { processorCapability, evidenceProcessorSha256 } : {}),
    reasonSha256: canonicalJsonSha256(reason),
  };
  return {
    attemptId: `historical_attempt_${canonicalJsonSha256(seed).slice(0, 24)}`,
    targetId: target.targetId,
    referenceId: target.referenceId,
    legacyRuntimeId: target.legacyRuntimeId,
    canonicalProductId: target.canonicalProductId ?? null,
    brand: target.brand,
    model: target.model,
    category: target.category,
    lifecycleState: target.lifecycleState,
    sourceUrl: normalizedSourceUrl,
    finalUrl: outcome.artifactBinding?.finalUrl ?? outcome.source?.finalUrl ?? null,
    contentSha256,
    status: text(outcome.status, 'candidate status'),
    failureCode,
    reason,
    reasonSha256: seed.reasonSha256,
    disposition: disposition(failureCode),
    suppressesSamePolicySource: !TRANSIENT_FAILURES.has(failureCode) && contentSha256 !== null,
    policySha256: results.policySha256,
    ...(processorCapability ? { processorCapability, evidenceProcessorSha256 } : {}),
    candidateInventorySha256: sha256(
      results.outcomes.find((entry) => entry.targetId === target.targetId).candidateInventorySha256,
      'candidate inventory SHA-256',
    ),
    semanticOutcomeSha256: sha256(
      results.outcomes.find((entry) => entry.targetId === target.targetId).semanticOutcomeSha256,
      'semantic outcome SHA-256',
    ),
    batchId: batch.batchId,
    batchSha256: bindings.batchSha256,
    runId: results.runId,
    resultsSha256: bindings.resultsSha256,
    auditSha256: sha256(audit.semanticAuditSha256, 'audit SHA-256'),
    attemptedAt: timestamp(results.completedAt, 'attempt completion time'),
  };
}

function resolutionEntry({ attempt, target, candidate, outcome, batch, results, audit, bindings }) {
  const normalizedSourceUrl = sourceUrl(candidate.sourceUrl);
  const contentSha256 = sha256(
    outcome.source?.contentSha256 ?? outcome.artifactBinding?.contentSha256,
    'resolved candidate content SHA-256',
  );
  const candidateResult = results.outcomes.find((entry) => entry.targetId === target.targetId);
  const seed = {
    attemptId: attempt.attemptId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: outcome.status,
    policySha256: results.policySha256,
    semanticOutcomeSha256: candidateResult.semanticOutcomeSha256,
  };
  return {
    resolutionId: `historical_resolution_${canonicalJsonSha256(seed).slice(0, 24)}`,
    attemptId: attempt.attemptId,
    targetId: target.targetId,
    referenceId: target.referenceId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: text(outcome.status, 'resolution status'),
    policySha256: results.policySha256,
    candidateInventorySha256: sha256(
      candidateResult.candidateInventorySha256,
      'resolution candidate inventory SHA-256',
    ),
    semanticOutcomeSha256: sha256(
      candidateResult.semanticOutcomeSha256,
      'resolution semantic outcome SHA-256',
    ),
    batchId: batch.batchId,
    batchSha256: bindings.batchSha256,
    runId: results.runId,
    resultsSha256: bindings.resultsSha256,
    auditSha256: sha256(audit.semanticAuditSha256, 'resolution audit SHA-256'),
    resolvedAt: timestamp(results.completedAt, 'resolution completion time'),
  };
}

function sourceAcceptanceEntry({ target, candidate, outcome, batch, results, audit, bindings }) {
  const normalizedSourceUrl = sourceUrl(candidate.sourceUrl);
  const contentSha256 = sha256(
    outcome.source?.contentSha256 ?? outcome.artifactBinding?.contentSha256,
    'accepted candidate content SHA-256',
  );
  const candidateResult = results.outcomes.find((entry) => entry.targetId === target.targetId);
  const seed = {
    targetId: target.targetId,
    referenceId: target.referenceId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: outcome.status,
    policySha256: results.policySha256,
  };
  return {
    sourceAcceptanceId: `historical_source_acceptance_${canonicalJsonSha256(seed).slice(0, 24)}`,
    targetId: target.targetId,
    referenceId: target.referenceId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: text(outcome.status, 'source acceptance status'),
    policySha256: results.policySha256,
    candidateInventorySha256: sha256(
      candidateResult.candidateInventorySha256,
      'source acceptance candidate inventory SHA-256',
    ),
    semanticOutcomeSha256: sha256(
      candidateResult.semanticOutcomeSha256,
      'source acceptance semantic outcome SHA-256',
    ),
    batchId: batch.batchId,
    batchSha256: bindings.batchSha256,
    runId: results.runId,
    resultsSha256: bindings.resultsSha256,
    auditSha256: sha256(audit.semanticAuditSha256, 'source acceptance audit SHA-256'),
    acceptedAt: timestamp(results.completedAt, 'source acceptance completion time'),
  };
}

function targetAttemptEntry({ target, result, batch, results, audit, bindings }) {
  const inventory = result.candidateInventory;
  const candidates = inventory?.candidates ?? [];
  const terminalResult = ![
    'accepted', 'receipt_accepted_non_scalar', 'retryable_failure', 'unchanged',
  ].includes(result.status) && !TRANSIENT_FAILURES.has(result.failureCode);
  const exhaustedCandidates = candidates.every((candidate) => (
    candidate?.outcome
      && EXHAUSTED_CANDIDATE_STATUSES.has(candidate.outcome.status)
      && (candidate.authorityMode !== 'reference'
      || candidate.outcome.status === 'reference_only')
  ));
  const conflictingFields = [...new Set((result.reconciliation?.conflictingFields ?? [])
    .map((field) => text(field, 'target conflict field')))].sort();
  const reconciliationConflict = result.status === 'conflict_quarantined'
    && result.failureCode === 'conflict'
    && conflictingFields.length > 0
    && candidates.some((candidate) => (
      candidate.authorityMode === 'official'
        && ['accepted', 'unchanged'].includes(candidate.outcome?.status)
    ));
  if (!terminalResult
    || inventory?.completionStatus !== 'complete'
    || (!exhaustedCandidates && !reconciliationConflict)
    || (inventory.incompleteResolvers ?? []).length !== 0
    || (inventory.missingBatchCandidateJobIds ?? []).length !== 0) return null;
  const resolvers = (inventory.resolvers ?? []).map((resolver) => ({
    resolverId: text(resolver.resolverId, 'resolver ID'),
    version: text(resolver.version, 'resolver version'),
    scope: text(resolver.scope, 'resolver scope'),
    required: resolver.required === true,
    completion: text(resolver.completion, 'resolver completion'),
    candidateCount: Number(resolver.candidateCount),
  })).sort((left, right) => left.resolverId.localeCompare(right.resolverId));
  if (!resolvers.length || resolvers.some((resolver) => (
    resolver.completion !== 'complete'
      || !Number.isInteger(resolver.candidateCount)
      || resolver.candidateCount < 0
  ))) return null;
  const resolverSetSha256 = canonicalJsonSha256(resolvers);
  const seed = {
    runId: results.runId,
    targetId: target.targetId,
    policySha256: results.policySha256,
    resolverSetSha256,
    candidateInventorySha256: result.candidateInventorySha256,
    semanticOutcomeSha256: result.semanticOutcomeSha256,
  };
  return {
    targetAttemptId: `historical_target_attempt_${canonicalJsonSha256(seed).slice(0, 24)}`,
    targetId: target.targetId,
    referenceId: target.referenceId,
    legacyRuntimeId: target.legacyRuntimeId,
    canonicalProductId: target.canonicalProductId ?? null,
    brand: target.brand,
    model: target.model,
    category: target.category,
    lifecycleState: target.lifecycleState,
    status: result.status,
    failureCode: result.failureCode,
    reason: reconciliationConflict
      ? TARGET_CONFLICT_REASON
      : candidates.length === 0
        ? 'complete_zero_candidate_inventory'
        : 'complete_exhausted_candidate_inventory',
    disposition: reconciliationConflict
      ? 'RUN_CONFLICT_CLOSURE'
      : 'AWAIT_RESOLVER_OR_POLICY_CHANGE',
    suppressesSamePolicyResolverOnly: true,
    ...(reconciliationConflict ? { conflictingFields } : {}),
    resolverSetSha256,
    resolvers,
    policySha256: results.policySha256,
    candidateInventorySha256: sha256(
      result.candidateInventorySha256,
      'target candidate inventory SHA-256',
    ),
    semanticOutcomeSha256: sha256(
      result.semanticOutcomeSha256,
      'target semantic outcome SHA-256',
    ),
    batchId: batch.batchId,
    batchSha256: bindings.batchSha256,
    runId: results.runId,
    resultsSha256: bindings.resultsSha256,
    auditSha256: sha256(audit.semanticAuditSha256, 'target audit SHA-256'),
    attemptedAt: timestamp(results.completedAt, 'target attempt completion time'),
  };
}

function targetAttemptResolutionEntry({ attempt, target, result, batch, results, audit, bindings }) {
  const seed = {
    targetAttemptId: attempt.targetAttemptId,
    runId: results.runId,
    targetId: target.targetId,
    semanticOutcomeSha256: result.semanticOutcomeSha256,
  };
  return {
    targetAttemptResolutionId: `historical_target_resolution_${canonicalJsonSha256(seed).slice(0, 24)}`,
    targetAttemptId: attempt.targetAttemptId,
    targetId: target.targetId,
    referenceId: target.referenceId,
    status: 'accepted',
    reason: 'target_reconciliation_accepted',
    policySha256: results.policySha256,
    semanticOutcomeSha256: sha256(
      result.semanticOutcomeSha256,
      'target resolution semantic outcome SHA-256',
    ),
    batchId: batch.batchId,
    batchSha256: bindings.batchSha256,
    runId: results.runId,
    resultsSha256: bindings.resultsSha256,
    auditSha256: sha256(audit.semanticAuditSha256, 'target resolution audit SHA-256'),
    resolvedAt: timestamp(results.completedAt, 'target resolution completion time'),
  };
}

export function buildHistoricalEvidenceRecoveryAttemptLedger({
  batch,
  results,
  audit,
  state = null,
  priorLedger = null,
  generatedAt,
}) {
  const bindings = validateRunBindings(batch, results, audit, state);
  const targets = new Map((batch.targets ?? []).map((target) => [target.targetId, target]));
  const entries = new Map((priorLedger?.entries ?? []).map((entry) => [entry.attemptId, structuredClone(entry)]));
  const resolutions = new Map((priorLedger?.resolutions ?? [])
    .map((entry) => [entry.resolutionId, structuredClone(entry)]));
  const sourceAcceptances = new Map((priorLedger?.sourceAcceptances ?? [])
    .map((entry) => [entry.sourceAcceptanceId, structuredClone(entry)]));
  const targetAttempts = new Map((priorLedger?.targetAttempts ?? [])
    .map((entry) => [entry.targetAttemptId, structuredClone(entry)]));
  const targetAttemptResolutions = new Map((priorLedger?.targetAttemptResolutions ?? [])
    .map((entry) => [entry.targetAttemptResolutionId, structuredClone(entry)]));
  for (const result of results.outcomes ?? []) {
    const target = targets.get(result.targetId);
    if (!target) throw new Error(`attempt target missing: ${result.targetId}`);
    const targetAttempt = targetAttemptEntry({ target, result, batch, results, audit, bindings });
    if (targetAttempt) {
      const existing = targetAttempts.get(targetAttempt.targetAttemptId);
      if (existing && !sameReauditedFact(existing, targetAttempt)) {
        throw new Error(`conflicting target attempt ledger entry: ${targetAttempt.targetAttemptId}`);
      }
      if (!existing) targetAttempts.set(targetAttempt.targetAttemptId, targetAttempt);
    }
    if (result.status === 'accepted') {
      for (const attempt of targetAttempts.values()) {
        if (attempt.reason !== TARGET_CONFLICT_REASON
          || (attempt.targetId !== target.targetId && attempt.referenceId !== target.referenceId)) continue;
        const resolution = targetAttemptResolutionEntry({
          attempt, target, result, batch, results, audit, bindings,
        });
        const existing = targetAttemptResolutions.get(resolution.targetAttemptResolutionId);
        if (existing && !sameReauditedFact(existing, resolution)) {
          throw new Error(`conflicting target attempt resolution: ${resolution.targetAttemptResolutionId}`);
        }
        if (!existing) {
          targetAttemptResolutions.set(resolution.targetAttemptResolutionId, resolution);
        }
      }
    }
    for (const candidate of result.candidateInventory?.candidates ?? []) {
      const outcome = candidate.outcome;
      if (!outcome || candidate.authorityMode !== 'official') continue;
      if (['accepted', 'unchanged'].includes(outcome.status)) {
        const sourceAcceptance = sourceAcceptanceEntry({
          target, candidate, outcome, batch, results, audit, bindings,
        });
        const existingAcceptance = sourceAcceptances.get(sourceAcceptance.sourceAcceptanceId);
        if (existingAcceptance && !sameSourceFact(existingAcceptance, sourceAcceptance, [
          'sourceAcceptanceId', 'targetId', 'referenceId', 'sourceUrl',
          'contentSha256', 'status', 'policySha256',
        ])) {
          throw new Error(`conflicting source acceptance: ${sourceAcceptance.sourceAcceptanceId}`);
        }
        if (!existingAcceptance) {
          sourceAcceptances.set(sourceAcceptance.sourceAcceptanceId, sourceAcceptance);
        }
        const normalizedSourceUrl = sourceUrl(candidate.sourceUrl);
        const contentSha256 = outcome.source?.contentSha256
          ?? outcome.artifactBinding?.contentSha256
          ?? null;
        for (const attempt of entries.values()) {
          if (contentSha256 === null || attempt.contentSha256 !== contentSha256
            || attempt.sourceUrl !== normalizedSourceUrl
            || (attempt.targetId !== target.targetId && attempt.referenceId !== target.referenceId)) continue;
          const resolution = resolutionEntry({
            attempt, target, candidate, outcome, batch, results, audit, bindings,
          });
          const existing = resolutions.get(resolution.resolutionId);
          if (existing && !sameSourceFact(existing, resolution, [
            'attemptId', 'targetId', 'referenceId', 'sourceUrl', 'contentSha256', 'status', 'policySha256',
          ])) {
            throw new Error(`conflicting attempt resolution: ${resolution.resolutionId}`);
          }
          if (!existing) resolutions.set(resolution.resolutionId, resolution);
        }
        continue;
      }
      if (SKIPPED_STATUSES.has(outcome.status)) continue;
      const entry = attemptEntry({ target, candidate, outcome, batch, results, audit, bindings });
      const existing = entries.get(entry.attemptId);
      if (existing && !sameReauditedFact(existing, entry)) {
        throw new Error(`conflicting attempt ledger entry: ${entry.attemptId}`);
      }
      if (!existing) entries.set(entry.attemptId, entry);
    }
  }
  const materialized = [...entries.values()].sort((left, right) => left.attemptId.localeCompare(right.attemptId));
  const materializedResolutions = [...resolutions.values()]
    .sort((left, right) => left.resolutionId.localeCompare(right.resolutionId));
  const materializedSourceAcceptances = [...sourceAcceptances.values()]
    .sort((left, right) => left.sourceAcceptanceId.localeCompare(right.sourceAcceptanceId));
  const materializedTargetAttempts = [...targetAttempts.values()]
    .sort((left, right) => left.targetAttemptId.localeCompare(right.targetAttemptId));
  const materializedTargetAttemptResolutions = [...targetAttemptResolutions.values()]
    .sort((left, right) => (
      left.targetAttemptResolutionId.localeCompare(right.targetAttemptResolutionId)
    ));
  const resolvedAttemptIds = new Set(materializedResolutions.map((entry) => entry.attemptId));
  const activeSuppressions = materialized.filter((entry) => (
    entry.suppressesSamePolicySource && !resolvedAttemptIds.has(entry.attemptId)
  ));
  const processorEpochMigrations = Array.isArray(priorLedger?.processorEpochMigrations)
    ? structuredClone(priorLedger.processorEpochMigrations)
    : priorLedger?.processorEpochMigration
      ? [structuredClone(priorLedger.processorEpochMigration)]
      : [];
  return {
    schemaVersion: 1,
    ledgerId: priorLedger?.ledgerId ?? 'historical-evidence-recovery-attempts-v1',
    generatedAt: timestamp(generatedAt, 'attempt ledger generation time'),
    ...(processorEpochMigrations.length ? {
      processorEpochMigration: structuredClone(processorEpochMigrations.at(-1)),
      processorEpochMigrations,
    } : {}),
    entries: materialized,
    resolutions: materializedResolutions,
    sourceAcceptances: materializedSourceAcceptances,
    targetAttempts: materializedTargetAttempts,
    targetAttemptResolutions: materializedTargetAttemptResolutions,
    summary: {
      entries: materialized.length,
      resolutions: materializedResolutions.length,
      sourceAcceptances: materializedSourceAcceptances.length,
      suppressions: activeSuppressions.length,
      resolvedSuppressions: materialized.filter((entry) => (
        entry.suppressesSamePolicySource && resolvedAttemptIds.has(entry.attemptId)
      )).length,
      retryable: materialized.filter((entry) => !entry.suppressesSamePolicySource).length,
      targetAttempts: materializedTargetAttempts.length,
      resolverOnlySuppressions: materializedTargetAttempts.filter(
        (entry) => entry.suppressesSamePolicyResolverOnly,
      ).length,
      byStatus: countBy(materialized, 'status'),
      byDisposition: countBy(materialized, 'disposition'),
    },
  };
}

export function activeHistoricalTargetConflicts({ ledger }) {
  if (ledger?.schemaVersion !== 1 || !Array.isArray(ledger.targetAttempts)) {
    throw new TypeError('historical attempt ledger with target attempts required');
  }
  const resolved = new Set((ledger.targetAttemptResolutions ?? []).map((resolution) => (
    text(resolution.targetAttemptId, 'target attempt resolution binding')
  )));
  return ledger.targetAttempts.filter((attempt) => (
    attempt.reason === TARGET_CONFLICT_REASON
      && attempt.status === 'conflict_quarantined'
      && attempt.failureCode === 'conflict'
      && !resolved.has(attempt.targetAttemptId)
  )).map((attempt) => structuredClone(attempt));
}

export function activeHistoricalResolverSuppressions({
  ledger,
  targetId,
  referenceId,
  policySha256,
  resolverContractSha256,
  evidenceProcessorEpochs = {},
}) {
  if (!ledger?.targetAttempts || !/^[a-f0-9]{64}$/.test(String(resolverContractSha256 ?? ''))) return [];
  if (activeHistoricalSourceAcceptances({ ledger, targetId, referenceId, policySha256 }).length) return [];
  const resolvedAttemptIds = new Set((ledger.resolutions ?? []).map((entry) => entry.attemptId));
  const processorReopenedSource = (ledger.entries ?? []).some((entry) => {
    if (entry.policySha256 !== policySha256 || resolvedAttemptIds.has(entry.attemptId)
      || (entry.targetId !== targetId && entry.referenceId !== referenceId)) return false;
    const capability = historicalAttemptProcessorCapability(entry);
    if (!capability || entry.processorCapability !== capability
      || !/^[a-f0-9]{64}$/.test(String(entry.evidenceProcessorSha256 ?? ''))) return false;
    const currentEpoch = evidenceProcessorEpochs?.[capability];
    return /^[a-f0-9]{64}$/.test(String(currentEpoch ?? ''))
      && currentEpoch !== entry.evidenceProcessorSha256;
  });
  return ledger.targetAttempts.filter((entry) => (
    entry.suppressesSamePolicyResolverOnly === true
      && (entry.targetId === targetId || entry.referenceId === referenceId)
      && (entry.reason === 'complete_zero_candidate_inventory'
        || (!processorReopenedSource
          && entry.policySha256 === policySha256
          && historicalResolverContractSha256(entry.resolvers) === resolverContractSha256))
  ));
}

export function activeHistoricalSourceAcceptances({
  ledger,
  targetId,
  referenceId,
  policySha256,
}) {
  if (!ledger?.sourceAcceptances) return [];
  const matches = ledger.sourceAcceptances
    .filter((entry) => ['accepted', 'unchanged'].includes(entry.status)
      && entry.policySha256 === policySha256
      && (entry.targetId === targetId || entry.referenceId === referenceId));
  const bySource = new Map();
  for (const entry of matches) {
    const key = `${entry.sourceUrl}\0${entry.contentSha256}`;
    if (!bySource.has(key)) bySource.set(key, entry);
  }
  return [...bySource.values()]
    .map((entry) => ({
      sourceAcceptanceId: entry.sourceAcceptanceId,
      sourceUrl: entry.sourceUrl,
      contentSha256: entry.contentSha256,
      status: entry.status,
      policySha256: entry.policySha256,
    }))
    .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl)
      || left.sourceAcceptanceId.localeCompare(right.sourceAcceptanceId));
}

export function activeHistoricalAttemptSuppressions({
  ledger,
  targetId,
  referenceId,
  policySha256,
  evidenceProcessorEpochs = {},
}) {
  if (!ledger?.entries) return [];
  const resolvedAttemptIds = new Set((ledger.resolutions ?? []).map((entry) => entry.attemptId));
  return ledger.entries
    .filter((entry) => {
      if (entry.suppressesSamePolicySource !== true) return false;
      if (resolvedAttemptIds.has(entry.attemptId) || entry.contentSha256 === null
        || entry.policySha256 !== policySha256
        || (entry.targetId !== targetId && entry.referenceId !== referenceId)) return false;
      const capability = historicalAttemptProcessorCapability(entry);
      if (!capability) return true;
      if (entry.processorCapability !== capability || !entry.evidenceProcessorSha256) return true;
      const currentEpoch = evidenceProcessorEpochs?.[capability];
      if (!/^[a-f0-9]{64}$/.test(String(currentEpoch ?? ''))) return true;
      return entry.evidenceProcessorSha256 === currentEpoch;
    })
    .map((entry) => ({
      attemptId: entry.attemptId,
      sourceUrl: entry.sourceUrl,
      contentSha256: entry.contentSha256,
      status: entry.status,
      failureCode: entry.failureCode,
      policySha256: entry.policySha256,
      ...(entry.processorCapability ? {
        processorCapability: entry.processorCapability,
        evidenceProcessorSha256: entry.evidenceProcessorSha256,
      } : {}),
    }))
    .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl)
      || left.attemptId.localeCompare(right.attemptId));
}

export function migrateHistoricalAttemptLedgerProcessorEpochs({
  ledger,
  runStates,
  migratedAt,
}) {
  if (!ledger || !Array.isArray(ledger.entries)) throw new TypeError('attempt ledger entries required');
  if (!(runStates instanceof Map)) throw new TypeError('attempt ledger run states map required');
  const migrated = structuredClone(ledger);
  let migratedEntries = 0;
  let boundEntries = 0;
  let unboundEntries = 0;
  for (const entry of migrated.entries) {
    const capability = historicalAttemptProcessorCapability(entry);
    if (!capability) continue;
    if (entry.processorCapability || entry.evidenceProcessorSha256) {
      if (entry.processorCapability !== capability
        || !/^[a-f0-9]{64}$/.test(String(entry.evidenceProcessorSha256 ?? ''))) {
        throw new Error(`attempt processor binding malformed: ${entry.attemptId}`);
      }
      boundEntries += 1;
      continue;
    }
    const state = runStates.get(entry.runId);
    if (!state) {
      unboundEntries += 1;
      continue;
    }
    const binding = validateRunStateBinding(state, {
      batch: { batchId: entry.batchId },
      results: { runId: entry.runId, policySha256: entry.policySha256 },
      batchSha256: entry.batchSha256,
    });
    const stateEpoch = binding.evidenceProcessorEpochs[capability];
    entry.processorCapability = capability;
    entry.evidenceProcessorSha256 = stateEpoch ?? legacyEvidenceProcessorEpoch({
      capability,
      toolchainSha256: binding.toolchainSha256,
    });
    migratedEntries += 1;
    boundEntries += 1;
  }
  const migrationHistory = Array.isArray(ledger.processorEpochMigrations)
    ? structuredClone(ledger.processorEpochMigrations)
    : ledger.processorEpochMigration
      ? [structuredClone(ledger.processorEpochMigration)]
      : [];
  if (migratedEntries === 0 && migrationHistory.length) return migrated;
  if (migratedEntries === 0 && boundEntries === 0 && unboundEntries === 0) return migrated;
  const migration = {
    migratedAt: timestamp(migratedAt, 'processor epoch migration time'),
    migratedEntries,
    boundEntries,
    unboundEntries,
    failClosedUnboundEntries: true,
    mode: migratedEntries > 0 ? 'binding' : 'bound_inventory_snapshot',
  };
  migrated.processorEpochMigration = migration;
  migrated.processorEpochMigrations = [...migrationHistory, structuredClone(migration)];
  return migrated;
}
