import * as defaultFs from 'node:fs/promises';
import { join } from 'node:path';

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
    for (const target of selectedBatch.targets) {
      const suppression = historicalRunTargetSuppression({
        priorState,
        targetId: target.targetId,
        currentPolicySha256,
        currentToolchainSha256,
        currentResolverContract: contracts.get(target.targetId),
        currentHasExplicitCandidateJobs: explicitCandidateJobs.get(target.targetId),
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
