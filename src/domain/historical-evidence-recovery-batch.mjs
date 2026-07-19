import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryPolicy,
} from './historical-evidence-recovery-contract.mjs';

const SELECTION_KEYS = new Set(['jobIds', 'routes', 'priorities', 'brands', 'targetIds', 'limit']);

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function brandKey(value) {
  return text(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function modelKey(value) {
  return text(value, 'model').toUpperCase();
}

function identityKey(value) {
  if (!value?.brand || !value?.model || !value?.category) return null;
  return `${brandKey(value.brand)}\0${modelKey(value.model)}\0${value.category}`;
}

function uniqueSorted(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return [...new Set(values.map((value) => text(value, label)))].sort((a, b) => a.localeCompare(b));
}

function normalizeSelection(selection = {}) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('selection must be an object');
  }
  for (const key of Object.keys(selection)) {
    if (!SELECTION_KEYS.has(key)) throw new TypeError(`unknown selection key: ${key}`);
  }
  const limit = selection.limit ?? null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new TypeError('selection limit must be a positive integer');
  }
  return {
    jobIds: uniqueSorted(selection.jobIds, 'selection job ID'),
    routes: uniqueSorted(selection.routes, 'selection route'),
    priorities: uniqueSorted(selection.priorities, 'selection priority'),
    brands: uniqueSorted(selection.brands, 'selection brand'),
    targetIds: uniqueSorted(selection.targetIds, 'selection target ID'),
    limit,
  };
}

function sourceSnapshot(source) {
  const hasReceiptReference = source?.verificationReceipt !== undefined
    || source?.receiptBindingSha256 !== undefined;
  const receiptBindingSha256 = source?.verificationReceipt?.bindingSha256
    ?? source?.receiptBindingSha256;
  const hasBinding = /^[a-f0-9]{64}$/.test(String(receiptBindingSha256 ?? ''));
  if (!hasReceiptReference && !hasBinding) return null;

  const validContentHash = /^[a-f0-9]{64}$/.test(String(source?.contentSha256 ?? ''));
  let trustedUrl = false;
  try {
    const url = new URL(String(source?.sourceUrl ?? ''));
    trustedUrl = url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    trustedUrl = false;
  }
  const replayable = trustedUrl
    && validContentHash
    && hasBinding
    && source?.identity
    && typeof source.identity === 'object'
    && !Array.isArray(source.identity)
    && Array.isArray(source?.claims)
    && source.claims.length > 0
    && source?.verificationReceipt
    && typeof source.verificationReceipt === 'object'
    && !Array.isArray(source.verificationReceipt)
    && source.verificationReceipt.bindingSha256 === receiptBindingSha256;
  if (!replayable) {
    throw new TypeError('active receipt source must be a complete replayable source snapshot');
  }
  return structuredClone(source);
}

function outcomeIdentity(outcome) {
  if (typeof outcome?.identity === 'string') return outcome.identity;
  return outcome?.identity?.outcome ?? outcome?.source?.identity?.outcome ?? null;
}

function isTerminalResultAcceptance(outcome) {
  const accepted = (outcome.outcome === 'accepted' && outcome.receipt === 'passed')
    || ['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)
    || ['accepted', 'receipt_accepted_non_scalar'].includes(outcome.acceptanceStatus);
  return accepted && outcomeIdentity(outcome) === 'exact';
}

function indexPriorAcceptance(existingAcceptanceBundles) {
  if (!Array.isArray(existingAcceptanceBundles)) {
    throw new TypeError('existingAcceptanceBundles must be an array');
  }
  const acceptedTargetIds = new Set();
  const acceptedIdentities = new Set();
  const sourcesByTargetId = new Map();
  const sourcesByIdentity = new Map();

  function addSource(row, source) {
    const snapshot = sourceSnapshot(source);
    if (!snapshot) return;
    const targetId = row?.targetId ? String(row.targetId) : null;
    const identity = identityKey(row);
    for (const [key, map] of [[targetId, sourcesByTargetId], [identity, sourcesByIdentity]]) {
      if (!key) continue;
      const values = map.get(key) ?? [];
      values.push(snapshot);
      map.set(key, values);
    }
  }

  function markAccepted(row) {
    if (row?.targetId) acceptedTargetIds.add(String(row.targetId));
    const identity = identityKey(row);
    if (identity) acceptedIdentities.add(identity);
  }

  for (const bundle of existingAcceptanceBundles) {
    if (!bundle || typeof bundle !== 'object') throw new TypeError('acceptance input must be an object');
    for (const entry of bundle.entries ?? []) {
      if (['accepted', 'receipt_accepted_non_scalar'].includes(entry.acceptanceStatus)) markAccepted(entry);
      for (const source of entry.sources ?? (entry.source ? [entry.source] : [])) addSource(entry, source);
    }

    const batchEntries = new Map((bundle.batch?.entries ?? [])
      .map((entry) => [String(entry.id ?? entry.targetId ?? ''), entry]));
    const resultContainer = bundle.results ?? bundle;
    for (const rawOutcome of resultContainer.outcomes ?? []) {
      const batchEntry = batchEntries.get(String(rawOutcome.id ?? rawOutcome.targetId ?? '')) ?? {};
      const outcome = { ...batchEntry, ...rawOutcome };
      if (isTerminalResultAcceptance(outcome)) markAccepted(outcome);
      addSource(outcome, outcome.source);
    }
  }

  function sourcesFor(target) {
    const combined = [
      ...(sourcesByTargetId.get(target.targetId) ?? []),
      ...(sourcesByIdentity.get(identityKey(target)) ?? []),
    ];
    return [...new Map(combined.map((source) => [
      `${source.contentSha256}\0${source.verificationReceipt.bindingSha256}\0${source.sourceUrl}`,
      source,
    ])).values()].sort((left, right) => (
      left.contentSha256.localeCompare(right.contentSha256)
      || left.sourceUrl.localeCompare(right.sourceUrl)
    ));
  }

  return {
    isAccepted(target) {
      return acceptedTargetIds.has(target.targetId) || acceptedIdentities.has(identityKey(target));
    },
    sourcesFor,
  };
}

function receiptReplayOutcomeKey(value) {
  return [
    text(value.targetId, 'receipt replay target ID'),
    text(value.referenceId, 'receipt replay reference ID'),
    text(value.contentSha256, 'receipt replay content hash'),
    text(value.receiptBindingSha256, 'receipt replay binding hash'),
  ].join('\0');
}

function receiptSourceOutcomeKey(entry, source) {
  return [
    text(entry.targetId, 'accepted target ID'),
    text(entry.referenceId, 'accepted reference ID'),
    text(source.contentSha256, 'accepted source content hash'),
    text(source.verificationReceipt?.bindingSha256, 'accepted source receipt binding'),
  ].join('\0');
}

function buildReceiptRepairIndex(audit, cumulativeBundle) {
  if (!audit || audit.schemaVersion !== 1 || !Array.isArray(audit.outcomes)) {
    throw new TypeError('receipt replay audit schema v1 required for parser repair');
  }
  if (!cumulativeBundle || !Array.isArray(cumulativeBundle.entries)) {
    throw new TypeError('cumulative acceptance bundle required for parser repair');
  }
  const semantic = {
    sourceBundleSha256: audit.sourceBundleSha256,
    outcomes: audit.outcomes,
  };
  if (audit.semanticAuditSha256 !== canonicalJsonSha256(semantic)) {
    throw new Error('receipt replay audit digest mismatch');
  }
  if (audit.sourceBundleSha256 !== canonicalJsonSha256(cumulativeBundle)) {
    throw new Error('receipt replay audit acceptance bundle binding mismatch');
  }
  const outcomes = new Map();
  for (const outcome of audit.outcomes) {
    if (!['passed', 'failed'].includes(outcome?.status)) {
      throw new TypeError('receipt replay outcome status invalid');
    }
    const key = receiptReplayOutcomeKey(outcome);
    if (outcomes.has(key)) throw new Error(`duplicate receipt replay outcome: ${key}`);
    outcomes.set(key, outcome);
  }
  const entries = new Map();
  for (const entry of cumulativeBundle.entries) {
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(entry.acceptanceStatus)) continue;
    if (entries.has(entry.targetId)) throw new Error(`duplicate cumulative acceptance target: ${entry.targetId}`);
    entries.set(entry.targetId, entry);
  }
  return {
    sourcesFor(target) {
      const entry = entries.get(target.targetId);
      if (!entry || entry.referenceId !== target.referenceId || identityKey(entry) !== identityKey(target)) {
        throw new Error(`parser repair acceptance target binding missing: ${target.targetId}`);
      }
      let failed = 0;
      const passed = [];
      for (const source of entry.sources ?? []) {
        const outcome = outcomes.get(receiptSourceOutcomeKey(entry, source));
        if (!outcome) throw new Error(`parser repair receipt replay outcome missing: ${target.targetId}`);
        if (outcome.status === 'failed') {
          failed += 1;
          continue;
        }
        passed.push(sourceSnapshot(source));
      }
      if (failed < 1) throw new Error(`parser repair requires a failed receipt replay: ${target.targetId}`);
      return passed.sort((left, right) => (
        left.contentSha256.localeCompare(right.contentSha256)
        || left.sourceUrl.localeCompare(right.sourceUrl)
      ));
    },
  };
}

function legacyHints(target) {
  if (Array.isArray(target.legacyHints)) {
    return target.legacyHints.map((hint) => ({
      sourceDocumentId: hint.sourceDocumentId,
      dimensionsMm: hint.dimensionsMm,
    }));
  }
  const hints = target.legacyDimensionHintMm
    ? [target.legacyDimensionHintMm]
    : (target.legacyDimensionHintsMm ?? []);
  if (hints.length > 1) {
    throw new TypeError(`target ${target.targetId} has unpaired legacy dimension hints`);
  }
  return (target.sourceDocumentIds ?? []).map((sourceDocumentId) => ({
    sourceDocumentId,
    dimensionsMm: hints[0],
  }));
}

function matchesSelection(target, jobsById, selection) {
  if (selection.targetIds.length > 0 && !selection.targetIds.includes(target.targetId)) return false;
  const candidates = target.candidateJobIds.map((jobId) => jobsById.get(jobId));
  if (candidates.some((job) => !job)) throw new TypeError(`target ${target.targetId} has a missing candidate job`);
  if (selection.jobIds.length > 0
    && !candidates.some((job) => selection.jobIds.includes(job.jobId))) return false;
  if (selection.routes.length > 0
    && !candidates.some((job) => selection.routes.includes(job.acquisitionRoute))) return false;
  if (selection.priorities.length > 0 && !selection.priorities.includes(target.priorityClass)) return false;
  if (selection.brands.length > 0) {
    const selectedBrands = new Set(selection.brands.map(brandKey));
    if (!selectedBrands.has(brandKey(target.brand))) return false;
  }
  return true;
}

function materializeTarget(target, prior, repair, policySha256) {
  const priorAttemptSuppressions = (target.priorAttemptSuppressions ?? [])
    .filter((entry) => entry.policySha256 === policySha256);
  return {
    targetId: target.targetId,
    referenceId: target.referenceId,
    legacyRuntimeId: target.legacyRuntimeId,
    canonicalProductId: target.canonicalProductId ?? null,
    brand: target.brand,
    model: target.model,
    category: target.category,
    lifecycleState: target.lifecycleState,
    requestedFields: [...target.requestedFields],
    primaryJobId: target.primaryJobId,
    candidateJobIds: [...target.candidateJobIds],
    publicationEligible: false,
    ...(target.repairExistingReceipt === true ? { repairExistingReceipt: true } : {}),
    reconciliationContext: {
      activeReceiptSources: target.repairExistingReceipt
        ? repair.sourcesFor(target)
        : prior.sourcesFor(target),
      ...(priorAttemptSuppressions.length > 0 ? {
        priorAttemptSuppressions: structuredClone(priorAttemptSuppressions),
      } : {}),
      registryHints: (target.registryDimensionHints ?? []).map((hint) => ({
        sourceId: hint.sourceId,
        snapshotSha256: hint.snapshotSha256,
        dimensionsMm: hint.dimensionsMm,
      })),
      legacyHints: legacyHints(target),
    },
  };
}

export function buildHistoricalEvidenceRecoveryBatch({
  queue,
  policy,
  existingAcceptanceBundles = [],
  receiptReplayAudit = null,
  selection = {},
}) {
  if (queue?.schemaVersion !== 2 || !Array.isArray(queue.jobs) || !Array.isArray(queue.targets)) {
    throw new TypeError('historical evidence recovery queue schema v2 required');
  }
  validateHistoricalEvidenceRecoveryPolicy(policy);
  const normalizedSelection = normalizeSelection(selection);
  const jobsById = new Map(queue.jobs.map((job) => [job.jobId, job]));
  if (jobsById.size !== queue.jobs.length) throw new TypeError('duplicate queue artifact job');
  for (const requestedJobId of normalizedSelection.jobIds) {
    if (!jobsById.has(requestedJobId)) throw new TypeError(`unknown selected job ID: ${requestedJobId}`);
  }
  const prior = indexPriorAcceptance(existingAcceptanceBundles);
  const selectionMatchedTargets = queue.targets
    .filter((target) => matchesSelection(target, jobsById, normalizedSelection));
  const excludedPriorTargets = selectionMatchedTargets
    .filter((target) => target.repairExistingReceipt !== true && prior.isAccepted(target));
  const excludedPriorCandidateJobIds = new Set(excludedPriorTargets
    .flatMap((target) => target.candidateJobIds));
  let selectedTargets = selectionMatchedTargets
    .filter((target) => target.repairExistingReceipt === true || !prior.isAccepted(target));
  if (normalizedSelection.limit !== null) selectedTargets = selectedTargets.slice(0, normalizedSelection.limit);
  const repair = selectedTargets.some((target) => target.repairExistingReceipt === true)
    ? buildReceiptRepairIndex(receiptReplayAudit, existingAcceptanceBundles[0])
    : { sourcesFor: () => [] };

  const targetIds = new Set(selectedTargets.map((target) => target.targetId));
  const selectedJobIds = new Set(selectedTargets.flatMap((target) => target.candidateJobIds));
  const artifactJobs = queue.jobs
    .filter((job) => selectedJobIds.has(job.jobId))
    .map((job) => ({
      jobId: job.jobId,
      sourceUrl: job.sourceUrl,
      authorityBrand: job.authorityBrand,
      authorityMode: job.authorityMode,
      acquisitionRoute: job.acquisitionRoute,
      priorityClass: job.priorityClass,
      targetIds: job.targetIds.filter((targetId) => targetIds.has(targetId)),
    }));
  const policySha256 = canonicalJsonSha256(policy);
  const targets = selectedTargets.map((target) => materializeTarget(target, prior, repair, policySha256));
  const candidateEdgeCount = artifactJobs.reduce((count, job) => count + job.targetIds.length, 0);
  if (targets.length > 0 && candidateEdgeCount === 0) {
    throw new Error('acquisition batch contains targets but no candidate edge');
  }
  const queueSha256 = canonicalJsonSha256(queue);
  const semanticBatchSha256 = canonicalJsonSha256({
    queueSha256,
    policySha256,
    selection: normalizedSelection,
    targetIds: targets.map((target) => target.targetId),
    candidateEdges: artifactJobs.map((job) => [job.jobId, job.targetIds]),
  });
  const batch = {
    schemaVersion: 1,
    batchId: `historical-recovery-${semanticBatchSha256.slice(0, 24)}`,
    generatedAt: new Date(queue.generatedAt).toISOString(),
    queue: { schemaVersion: queue.schemaVersion, sha256: queueSha256 },
    policy: { version: policy.policyVersion, sha256: policySha256 },
    selection: normalizedSelection,
    artifactJobs,
    targets,
    summary: {
      artifactJobs: artifactJobs.length,
      targets: targets.length,
      candidateEdges: candidateEdgeCount,
      excludedPriorAcceptedTargets: excludedPriorTargets.length,
      excludedPriorCandidateJobs: excludedPriorCandidateJobIds.size,
    },
  };
  return validateHistoricalEvidenceRecoveryBatch(batch);
}

export function parseHistoricalEvidenceRecoveryBatchArgs(argv) {
  const selection = {
    jobIds: [], routes: [], priorities: [], brands: [], targetIds: [], limit: null,
  };
  const flags = new Map([
    ['--job-id', 'jobIds'],
    ['--route', 'routes'],
    ['--priority', 'priorities'],
    ['--brand', 'brands'],
    ['--target-id', 'targetIds'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    let value = separator === -1 ? null : raw.slice(separator + 1);
    if (flag === '--limit') {
      value ??= argv[++index];
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1) throw new TypeError('--limit must be a positive integer');
      selection.limit = limit;
      continue;
    }
    const key = flags.get(flag);
    if (!key) throw new TypeError(`unknown argument: ${raw}`);
    value ??= argv[++index];
    selection[key].push(text(value, flag));
  }
  return normalizeSelection(selection);
}
