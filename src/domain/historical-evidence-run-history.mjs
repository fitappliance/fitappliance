import * as defaultFs from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAudit,
} from './historical-evidence-recovery-contract.mjs';

const ACCEPTED_STATUSES = new Set(['accepted', 'receipt_accepted_non_scalar']);
const TERMINAL_STATUSES = new Set([
  'claims_incomplete', 'conflict_quarantined', 'identity_rejected', 'terminal_failure',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function resolverContract(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${label} resolver contract required`);
  }
  const normalized = values.map((value) => ({
    resolverId: requiredText(value?.resolverId, `${label} resolver ID`),
    version: requiredText(value?.version, `${label} resolver version`),
    scope: requiredText(value?.scope, `${label} resolver scope`),
    required: value?.required === true,
  })).sort((left, right) => left.resolverId.localeCompare(right.resolverId));
  if (new Set(normalized.map((value) => value.resolverId)).size !== normalized.length) {
    throw new TypeError(`${label} resolver IDs must be unique`);
  }
  return normalized;
}

function sameResolverContract(prior, current) {
  if (!Array.isArray(prior) || prior.length === 0) return false;
  return JSON.stringify(resolverContract(prior, 'prior'))
    === JSON.stringify(resolverContract(current, 'current'));
}

function exhaustedSourceDiscovery(outcome) {
  const inventory = outcome?.candidateInventory;
  return outcome?.status === 'claims_incomplete'
    && outcome?.failureCode === 'source_authority'
    && inventory?.completionStatus === 'complete'
    && Array.isArray(inventory.candidates)
    && inventory.candidates.length === 0
    && Array.isArray(inventory.incompleteResolvers)
    && inventory.incompleteResolvers.length === 0
    && Array.isArray(inventory.missingBatchCandidateJobIds)
    && inventory.missingBatchCandidateJobIds.length === 0
    && Array.isArray(inventory.resolvers)
    && inventory.resolvers.length > 0
    && inventory.resolvers.every((resolver) => resolver.completion === 'complete');
}

export function historicalRunTargetSuppression({
  priorState,
  targetId,
  currentPolicySha256,
  currentToolchainSha256,
  currentResolverContract,
  currentHasExplicitCandidateJobs = false,
  verifiedRepairReopen = false,
}) {
  const target = priorState?.targets?.[targetId];
  const outcome = target?.outcome;
  if (target?.state !== 'completed' || !outcome) return null;

  let reason = null;
  if (exhaustedSourceDiscovery(outcome)) {
    if (currentHasExplicitCandidateJobs) return null;
    reason = 'completed_exhausted_source_discovery';
  } else {
    if (priorState.input?.policySha256 !== currentPolicySha256) return null;
    if (!sameResolverContract(outcome.candidateInventory?.resolvers, currentResolverContract)) return null;
    if (ACCEPTED_STATUSES.has(outcome.status)) {
      if (verifiedRepairReopen) return null;
      reason = 'completed_unpromoted_acceptance';
    } else if (TERMINAL_STATUSES.has(outcome.status)
      && priorState.input?.toolchainSha256 === currentToolchainSha256) {
      reason = 'completed_terminal_same_epoch';
    }
  }
  if (!reason) return null;

  return {
    targetId,
    priorRunId: requiredText(priorState.runId, 'prior run ID'),
    priorStatus: outcome.status,
    priorFailureCode: outcome.failureCode ?? null,
    reason,
  };
}

function receiptSetSha256(target) {
  const sources = target?.reconciliationContext?.activeReceiptSources;
  if (!Array.isArray(sources)) return null;
  const rows = [];
  for (const source of sources) {
    const contentSha256 = String(source?.contentSha256 ?? '');
    const bindingSha256 = String(source?.verificationReceipt?.bindingSha256 ?? '');
    if (!/^[a-f0-9]{64}$/.test(contentSha256) || !/^[a-f0-9]{64}$/.test(bindingSha256)) return null;
    rows.push({ contentSha256, bindingSha256 });
  }
  rows.sort((left, right) => left.contentSha256.localeCompare(right.contentSha256)
    || left.bindingSha256.localeCompare(right.bindingSha256));
  if (new Set(rows.map((row) => `${row.contentSha256}:${row.bindingSha256}`)).size !== rows.length) return null;
  return canonicalJsonSha256(rows);
}

function auditSemanticView(audit) {
  return {
    mode: audit.mode,
    batchId: audit.batchId,
    batchSha256: audit.batchSha256,
    queueSha256: audit.queueSha256,
    policySha256: audit.policySha256,
    resultsSha256: audit.resultsSha256,
    priorBundleSha256: audit.priorBundleSha256,
    priorObjectsReplayed: audit.priorObjectsReplayed,
    checkedTargets: audit.checkedTargets,
    checkedObjects: audit.checkedObjects,
    repairs: audit.repairs ?? [],
    violations: audit.violations,
  };
}

function verifiedParserRepairReopen({
  targetId,
  currentTarget,
  priorState,
  priorBatch,
  priorResults,
  priorAudit,
}) {
  if (currentTarget?.repairExistingReceipt !== true || !priorBatch || !priorResults || !priorAudit) return false;
  try {
    validateHistoricalEvidenceRecoveryAudit(priorAudit);
  } catch {
    return false;
  }
  const semanticSha256 = canonicalJsonSha256(auditSemanticView(priorAudit));
  if (priorAudit.semanticAuditSha256 !== semanticSha256
    || priorAudit.auditId !== `historical-recovery-audit-${semanticSha256.slice(0, 24)}`
    || priorAudit.mode !== 'online'
    || priorAudit.status !== 'failed'
    || priorAudit.priorObjectsReplayed !== true
    || priorAudit.batchSha256 !== canonicalJsonSha256(priorBatch)
    || priorAudit.resultsSha256 !== canonicalJsonSha256(priorResults)
    || priorResults.runId !== priorState.runId
    || priorResults.batchId !== priorBatch.batchId
    || (priorState.input?.batchSha256 && priorState.input.batchSha256 !== priorAudit.batchSha256)
    || !priorAudit.violations.includes(`prior object ${targetId}: artifact attestation receipt mismatch`)) {
    return false;
  }
  const priorTargets = (priorBatch.targets ?? []).filter((target) => target.targetId === targetId);
  if (priorTargets.length !== 1) return false;
  const priorReceiptSet = receiptSetSha256(priorTargets[0]);
  const currentReceiptSet = receiptSetSha256(currentTarget);
  return priorReceiptSet !== null && currentReceiptSet !== null && priorReceiptSet !== currentReceiptSet;
}

async function readRepairEvidence(fs, runRoot) {
  try {
    const [priorBatch, priorResults, priorAudit] = await Promise.all([
      fs.readFile(join(runRoot, 'batch.json'), 'utf8').then(JSON.parse),
      fs.readFile(join(runRoot, 'results.json'), 'utf8').then(JSON.parse),
      fs.readFile(join(runRoot, 'audit.json'), 'utf8').then(JSON.parse),
    ]);
    return { priorBatch, priorResults, priorAudit };
  } catch {
    return null;
  }
}

export async function scanHistoricalEvidenceRunHistory({
  storageRoot,
  selectedBatch,
  currentPolicySha256,
  currentToolchainSha256,
  resolverContractForTarget,
  excludeRunId = null,
  fs = defaultFs,
}) {
  const root = join(requiredText(storageRoot, 'storage root'), 'runs', 'historical-evidence-recovery');
  if (!selectedBatch || !Array.isArray(selectedBatch.targets)) {
    throw new TypeError('selected recovery batch required');
  }
  if (typeof resolverContractForTarget !== 'function') {
    throw new TypeError('resolver contract factory required');
  }
  let directories;
  try {
    directories = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const contracts = new Map(selectedBatch.targets.map((target) => [
    target.targetId,
    resolverContractForTarget(target),
  ]));
  const officialArtifactJobIds = new Set((selectedBatch.artifactJobs ?? [])
    .filter((job) => job.authorityMode === 'official')
    .map((job) => job.jobId));
  const explicitCandidateJobs = new Map(selectedBatch.targets.map((target) => [
    target.targetId,
    (target.candidateJobIds ?? []).some((jobId) => officialArtifactJobIds.has(jobId)),
  ]));
  const conflicts = [];
  for (const directory of directories.filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (directory.name === excludeRunId) continue;
    let priorState;
    try {
      priorState = JSON.parse(await fs.readFile(join(root, directory.name, 'state.json'), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`historical run state is malformed: ${directory.name}`, { cause: error });
    }
    if (priorState?.schemaVersion !== 1 || priorState?.runId !== directory.name
      || !priorState?.input?.policySha256 || !priorState?.input?.toolchainSha256
      || !priorState?.targets || typeof priorState.targets !== 'object') {
      throw new Error(`historical run state is malformed: ${directory.name}`);
    }
    const currentTargets = new Map(selectedBatch.targets.map((target) => [target.targetId, target]));
    const hasAcceptedRepairCandidate = selectedBatch.targets.some((target) => (
      target.repairExistingReceipt === true
      && ACCEPTED_STATUSES.has(priorState.targets?.[target.targetId]?.outcome?.status)
    ));
    const repairEvidence = hasAcceptedRepairCandidate
      ? await readRepairEvidence(fs, join(root, directory.name))
      : null;
    for (const target of selectedBatch.targets) {
      const verifiedRepairReopen = repairEvidence ? verifiedParserRepairReopen({
        targetId: target.targetId,
        currentTarget: currentTargets.get(target.targetId),
        priorState,
        ...repairEvidence,
      }) : false;
      const suppression = historicalRunTargetSuppression({
        priorState,
        targetId: target.targetId,
        currentPolicySha256,
        currentToolchainSha256,
        currentResolverContract: contracts.get(target.targetId),
        currentHasExplicitCandidateJobs: explicitCandidateJobs.get(target.targetId),
        verifiedRepairReopen,
      });
      if (suppression) conflicts.push({
        ...suppression,
        brand: target.brand,
        model: target.model,
      });
    }
  }
  return conflicts.sort((left, right) => left.targetId.localeCompare(right.targetId)
    || left.priorRunId.localeCompare(right.priorRunId));
}
