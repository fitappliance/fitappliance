import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const TRANSIENT_FAILURES = new Set(['transport', 'discovery', 'discovery_incomplete', 'environment']);
const SKIPPED_STATUSES = new Set([
  'accepted', 'unchanged', 'not_attempted_optional', 'reference_only', 'previous_terminal_suppressed',
]);

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

function validateRunBindings(batch, results, audit) {
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
  return { batchSha256, resultsSha256 };
}

function attemptEntry({ target, candidate, outcome, batch, results, audit, bindings }) {
  const failureCode = text(outcome.failureCode, 'candidate failure code');
  const normalizedSourceUrl = sourceUrl(candidate.sourceUrl);
  const contentSha256 = outcome.artifactBinding?.contentSha256
    ?? outcome.source?.contentSha256
    ?? null;
  if (contentSha256 !== null) sha256(contentSha256, 'candidate content SHA-256');
  const reason = text(outcome.reason ?? `${outcome.status}:${failureCode}`, 'candidate failure reason');
  const seed = {
    runId: results.runId,
    targetId: target.targetId,
    sourceUrl: normalizedSourceUrl,
    contentSha256,
    status: outcome.status,
    failureCode,
    policySha256: results.policySha256,
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

export function buildHistoricalEvidenceRecoveryAttemptLedger({
  batch,
  results,
  audit,
  priorLedger = null,
  generatedAt,
}) {
  const bindings = validateRunBindings(batch, results, audit);
  const targets = new Map((batch.targets ?? []).map((target) => [target.targetId, target]));
  const entries = new Map((priorLedger?.entries ?? []).map((entry) => [entry.attemptId, structuredClone(entry)]));
  const resolutions = new Map((priorLedger?.resolutions ?? [])
    .map((entry) => [entry.resolutionId, structuredClone(entry)]));
  const sourceAcceptances = new Map((priorLedger?.sourceAcceptances ?? [])
    .map((entry) => [entry.sourceAcceptanceId, structuredClone(entry)]));
  for (const result of results.outcomes ?? []) {
    const target = targets.get(result.targetId);
    if (!target) throw new Error(`attempt target missing: ${result.targetId}`);
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
      if (existing && canonicalJsonSha256(existing) !== canonicalJsonSha256(entry)) {
        throw new Error(`conflicting attempt ledger entry: ${entry.attemptId}`);
      }
      entries.set(entry.attemptId, entry);
    }
  }
  const materialized = [...entries.values()].sort((left, right) => left.attemptId.localeCompare(right.attemptId));
  const materializedResolutions = [...resolutions.values()]
    .sort((left, right) => left.resolutionId.localeCompare(right.resolutionId));
  const materializedSourceAcceptances = [...sourceAcceptances.values()]
    .sort((left, right) => left.sourceAcceptanceId.localeCompare(right.sourceAcceptanceId));
  const resolvedAttemptIds = new Set(materializedResolutions.map((entry) => entry.attemptId));
  const activeSuppressions = materialized.filter((entry) => (
    entry.suppressesSamePolicySource && !resolvedAttemptIds.has(entry.attemptId)
  ));
  return {
    schemaVersion: 1,
    ledgerId: priorLedger?.ledgerId ?? 'historical-evidence-recovery-attempts-v1',
    generatedAt: timestamp(generatedAt, 'attempt ledger generation time'),
    entries: materialized,
    resolutions: materializedResolutions,
    sourceAcceptances: materializedSourceAcceptances,
    summary: {
      entries: materialized.length,
      resolutions: materializedResolutions.length,
      sourceAcceptances: materializedSourceAcceptances.length,
      suppressions: activeSuppressions.length,
      resolvedSuppressions: materialized.filter((entry) => (
        entry.suppressesSamePolicySource && resolvedAttemptIds.has(entry.attemptId)
      )).length,
      retryable: materialized.filter((entry) => !entry.suppressesSamePolicySource).length,
      byStatus: countBy(materialized, 'status'),
      byDisposition: countBy(materialized, 'disposition'),
    },
  };
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
}) {
  if (!ledger?.entries) return [];
  const resolvedAttemptIds = new Set((ledger.resolutions ?? []).map((entry) => entry.attemptId));
  return ledger.entries
    .filter((entry) => entry.suppressesSamePolicySource === true
      && !resolvedAttemptIds.has(entry.attemptId)
      && entry.contentSha256 !== null
      && entry.policySha256 === policySha256
      && (entry.targetId === targetId || entry.referenceId === referenceId))
    .map((entry) => ({
      attemptId: entry.attemptId,
      sourceUrl: entry.sourceUrl,
      contentSha256: entry.contentSha256,
      status: entry.status,
      failureCode: entry.failureCode,
      policySha256: entry.policySha256,
    }))
    .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl)
      || left.attemptId.localeCompare(right.attemptId));
}
