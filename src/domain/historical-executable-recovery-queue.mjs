import { createHash } from 'node:crypto';

import {
  activeHistoricalAttemptSuppressions,
  activeHistoricalResolverSuppressions,
  activeHistoricalSourceAcceptances,
} from './historical-evidence-recovery-attempt-ledger.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const REQUESTED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);
const RECOVERY_ROUTE = Object.freeze({
  PARSER_REPAIR: 'OFFICIAL_RECEIPT_REBUILD',
  PDF_RECONVERT: 'OFFICIAL_RECEIPT_REBUILD',
  OFFICIAL_REACQUIRE: 'OFFICIAL_RECEIPT_REBUILD',
  OFFICIAL_REDISCOVERY: 'OFFICIAL_HOST_AUTHORITY_VALIDATION',
  OFFICIAL_DISCOVERY: 'OFFICIAL_HOST_AUTHORITY_VALIDATION',
  IDENTITY_CLOSURE: 'OFFICIAL_HOST_AUTHORITY_VALIDATION',
  CONFLICT_CLOSURE: 'OFFICIAL_RECEIPT_REBUILD',
});
const PRIORITY_ORDER = Object.freeze({
  P0_CURRENT_MISSING_DIMENSIONS: 0,
  P1_HISTORICAL_MISSING_DIMENSIONS: 1,
  P2_CURRENT_CONFIRMATION: 2,
  P3_HISTORICAL_CONFIRMATION: 3,
  P4_CONFLICT_RESOLUTION: 4,
});
const ACQUISITION_ROUTE_ORDER = Object.freeze({
  OFFICIAL_RECEIPT_REBUILD: 0,
  OFFICIAL_HOST_AUTHORITY_VALIDATION: 1,
  OFFICIAL_SOURCE_DISCOVERY_REQUIRED: 2,
  MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY: 3,
});
const CANDIDATE_MANIFEST_STATES = new Set([
  'CANDIDATES_READY',
  'DISCOVERY_RETRYABLE',
  'RESEARCH_REQUIRED',
  'NO_CANDIDATE_COMPLETE',
]);

function id(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function priorityClass(reference) {
  const current = reference.lifecycleState === 'CURRENT_RETAIL';
  if (reference.lookupAction === 'MEASURE_REQUIRED') {
    return current ? 'P0_CURRENT_MISSING_DIMENSIONS' : 'P1_HISTORICAL_MISSING_DIMENSIONS';
  }
  if (reference.lookupAction === 'CONFIRM_REQUIRED') {
    return current ? 'P2_CURRENT_CONFIRMATION' : 'P3_HISTORICAL_CONFIRMATION';
  }
  return 'P4_CONFLICT_RESOLUTION';
}

function completeDimensions(value) {
  return value && ['width', 'height', 'depth']
    .every((axis) => Number.isFinite(Number(value[axis])) && Number(value[axis]) > 0);
}

function registryHints(reference) {
  if (reference.registryDimensionState !== 'CONSISTENT' || !completeDimensions(reference.dimensionsMm)) return [];
  return (reference.sources ?? [])
    .filter((source) => source.sourceId !== 'fitappliance:catalog'
      && !String(source.sourceId).startsWith('historical-recovery:')
      && /^[a-f0-9]{64}$/.test(String(source.snapshotSha256 ?? '')))
    .map((source) => ({
      sourceId: source.sourceId,
      snapshotSha256: source.snapshotSha256,
      dimensionsMm: {
        width: Number(reference.dimensionsMm.width),
        height: Number(reference.dimensionsMm.height),
        depth: Number(reference.dimensionsMm.depth),
      },
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function targetOrder(left, right) {
  return PRIORITY_ORDER[left.priorityClass] - PRIORITY_ORDER[right.priorityClass]
    || left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId);
}

function selectLegacyTarget(record, legacyByReference) {
  const candidates = legacyByReference.get(record.referenceId) ?? [];
  if (candidates.length > 1) throw new Error(`multiple legacy recovery targets for ${record.referenceId}`);
  return candidates[0] ?? null;
}

function normalizedBrand(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function trustedHttpsUrl(value, label) {
  let url;
  try { url = new URL(String(value ?? '')); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  return url.toString();
}

function validateCandidateManifest(candidateManifest, acquisitionQueue) {
  if (candidateManifest?.schemaVersion !== 1 || !Array.isArray(candidateManifest.candidates)
    || !Array.isArray(candidateManifest.targets) || !Array.isArray(candidateManifest.runBindings)) {
    throw new TypeError('historical official candidate manifest schema v1 required');
  }
  const expectedManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: candidateManifest.sourceAcquisitionQueueSha256,
    runBindings: candidateManifest.runBindings,
    candidates: candidateManifest.candidates,
    targets: candidateManifest.targets,
  });
  if (candidateManifest.semanticManifestSha256 !== expectedManifestSha256) {
    throw new Error('candidate manifest semantic SHA-256 mismatch');
  }
  if (candidateManifest.sourceAcquisitionQueueSha256 !== acquisitionQueue.semanticQueueSha256) {
    throw new Error('candidate manifest acquisition queue binding mismatch');
  }

  const recordsByReference = new Map();
  for (const record of acquisitionQueue.records) {
    if (recordsByReference.has(record.referenceId)) {
      throw new Error(`duplicate acquisition reference: ${record.referenceId}`);
    }
    recordsByReference.set(record.referenceId, record);
  }
  const candidatesById = new Map();
  const candidateIdsByAuthorityUrl = new Map();
  for (const candidate of candidateManifest.candidates) {
    if (!candidate?.candidateId || candidatesById.has(candidate.candidateId)) {
      throw new Error(`duplicate or missing candidate ID: ${candidate?.candidateId ?? ''}`);
    }
    const sourceUrl = trustedHttpsUrl(candidate.sourceUrl, 'candidate source URL');
    if (!candidate.authorityBrand || !Array.isArray(candidate.applicableReferenceIds)
      || !Array.isArray(candidate.categories) || !Array.isArray(candidate.sourceRanks)) {
      throw new TypeError(`candidate binding arrays required: ${candidate.candidateId}`);
    }
    const authorityUrlKey = `${normalizedBrand(candidate.authorityBrand)}\0${sourceUrl}`;
    if (candidateIdsByAuthorityUrl.has(authorityUrlKey)) {
      throw new Error(`duplicate candidate URL within authority brand: ${sourceUrl}`);
    }
    candidateIdsByAuthorityUrl.set(authorityUrlKey, candidate.candidateId);
    candidatesById.set(candidate.candidateId, candidate);
  }

  const targetsByReference = new Map();
  const usedReferencesByCandidate = new Map();
  for (const target of candidateManifest.targets) {
    const record = recordsByReference.get(target?.referenceId);
    if (!record || targetsByReference.has(target.referenceId)) {
      throw new Error(`candidate manifest target coverage invalid: ${target?.referenceId ?? ''}`);
    }
    if (target.acquisitionId !== record.acquisitionId
      || normalizedBrand(target.brand) !== normalizedBrand(record.brand)
      || String(target.model).toUpperCase() !== String(record.model).toUpperCase()
      || target.category !== record.category || target.lifecycleState !== record.lifecycleState
      || target.priority !== record.priority || target.route !== record.route
      || target.executionReadiness !== record.executionReadiness) {
      throw new Error(`candidate manifest target identity drift: ${target.referenceId}`);
    }
    if (!CANDIDATE_MANIFEST_STATES.has(target.state) || !Array.isArray(target.candidateEdges)
      || !Array.isArray(target.resolverContract) || !Array.isArray(target.resolverResults)
      || !Array.isArray(target.incompleteResolverIds)) {
      throw new TypeError(`candidate manifest target state invalid: ${target.referenceId}`);
    }
    if (target.terminal !== (target.state === 'NO_CANDIDATE_COMPLETE')
      || typeof target.retryableDiscovery !== 'boolean') {
      throw new TypeError(`candidate manifest target terminal semantics invalid: ${target.referenceId}`);
    }
    if (target.state === 'CANDIDATES_READY' && target.candidateEdges.length === 0) {
      throw new Error(`candidate-ready target has no candidate edge: ${target.referenceId}`);
    }
    if (target.state === 'CANDIDATES_READY'
      && (target.retryableDiscovery || target.incompleteResolverIds.length > 0)) {
      throw new Error(`candidate-ready target has incomplete resolver state: ${target.referenceId}`);
    }
    if (target.state === 'DISCOVERY_RETRYABLE'
      && (!target.retryableDiscovery || target.incompleteResolverIds.length === 0)) {
      throw new Error(`retryable target has complete resolver state: ${target.referenceId}`);
    }
    if (target.state === 'NO_CANDIDATE_COMPLETE' && target.candidateEdges.length > 0) {
      throw new Error(`terminal target contains candidate edge: ${target.referenceId}`);
    }
    if (target.state === 'NO_CANDIDATE_COMPLETE'
      && (target.retryableDiscovery || target.incompleteResolverIds.length > 0)) {
      throw new Error(`terminal target has incomplete resolver state: ${target.referenceId}`);
    }
    const seenCandidateIds = new Set();
    const seenRanks = new Set();
    for (const edge of target.candidateEdges) {
      const candidate = candidatesById.get(edge.candidateId);
      if (!candidate) throw new Error(`target candidate missing: ${edge.candidateId}`);
      if (seenCandidateIds.has(edge.candidateId) || !Number.isInteger(edge.sourceRank)
        || edge.sourceRank < 1 || seenRanks.has(edge.sourceRank)) {
        throw new Error(`target candidate edge rank invalid: ${target.referenceId}`);
      }
      seenCandidateIds.add(edge.candidateId);
      seenRanks.add(edge.sourceRank);
      if (!candidate.applicableReferenceIds.includes(target.referenceId)
        || !candidate.categories.includes(target.category)
        || normalizedBrand(candidate.authorityBrand) !== normalizedBrand(target.brand)) {
        throw new Error(`target candidate binding invalid: ${target.referenceId} ${edge.candidateId}`);
      }
      const rankBinding = candidate.sourceRanks.find((binding) => binding.referenceId === target.referenceId);
      if (rankBinding?.sourceRank !== edge.sourceRank) {
        throw new Error(`target candidate source-rank binding invalid: ${target.referenceId} ${edge.candidateId}`);
      }
      const used = usedReferencesByCandidate.get(edge.candidateId) ?? new Set();
      used.add(target.referenceId);
      usedReferencesByCandidate.set(edge.candidateId, used);
    }
    const orderedRanks = [...seenRanks].sort((left, right) => left - right);
    if (orderedRanks.some((rank, index) => rank !== index + 1)) {
      throw new Error(`target candidate edge rank invalid: ${target.referenceId}`);
    }
    targetsByReference.set(target.referenceId, target);
  }
  if (targetsByReference.size !== recordsByReference.size) {
    throw new Error('candidate manifest does not cover every acquisition target');
  }
  for (const [candidateId, candidate] of candidatesById) {
    const used = sortedUnique(usedReferencesByCandidate.get(candidateId) ?? []);
    if (canonicalJsonSha256(used) !== canonicalJsonSha256(sortedUnique(candidate.applicableReferenceIds))) {
      throw new Error(`candidate applicable-reference binding drift: ${candidateId}`);
    }
  }
  const byState = countBy(candidateManifest.targets, (target) => target.state);
  const edgeCount = candidateManifest.targets
    .reduce((sum, target) => sum + target.candidateEdges.length, 0);
  if (candidateManifest.summary?.acquisitionRecords !== recordsByReference.size
    || candidateManifest.summary.targets !== targetsByReference.size
    || candidateManifest.summary.candidates !== candidatesById.size
    || candidateManifest.summary.candidateEdges !== edgeCount
    || candidateManifest.summary.runBindings !== candidateManifest.runBindings.length
    || canonicalJsonSha256(candidateManifest.summary.byState) !== canonicalJsonSha256(byState)) {
    throw new Error('candidate manifest summary accounting mismatch');
  }
  return { candidatesById, targetsByReference };
}

function selectedPriority(values) {
  return [...values].sort((left, right) => PRIORITY_ORDER[left] - PRIORITY_ORDER[right])[0];
}

function selectedAcquisitionRoute(values) {
  return [...values].sort((left, right) => (
    ACQUISITION_ROUTE_ORDER[left] - ACQUISITION_ROUTE_ORDER[right]
      || left.localeCompare(right)
  ))[0];
}

export function buildHistoricalExecutableRecoveryQueue({
  acquisitionQueue,
  candidateManifest,
  historicalReference,
  legacyRecoveryQueue,
  priorAcceptanceBundle = { entries: [] },
  priorAttemptLedger = { entries: [] },
  recoveryPolicySha256 = null,
  evidenceProcessorEpochs = {},
  resolverContractSha256ForTarget = null,
}) {
  if (acquisitionQueue?.schemaVersion !== 1 || !Array.isArray(acquisitionQueue.records)
    || !Array.isArray(acquisitionQueue.sources)) {
    throw new TypeError('historical acquisition queue schema v1 required');
  }
  if (!Array.isArray(historicalReference?.records)) throw new TypeError('historical reference records required');
  if (legacyRecoveryQueue?.schemaVersion !== 2 || !Array.isArray(legacyRecoveryQueue.targets)) {
    throw new TypeError('legacy recovery queue schema v2 required');
  }
  const { candidatesById, targetsByReference: candidateTargetsByReference } = validateCandidateManifest(
    candidateManifest,
    acquisitionQueue,
  );
  const references = new Map(historicalReference.records.map((record) => [record.referenceId, record]));
  const sources = new Map(acquisitionQueue.sources.map((source) => [source.sourceId, source]));
  const legacyByReference = new Map();
  for (const target of legacyRecoveryQueue.targets) {
    const values = legacyByReference.get(target.referenceId) ?? [];
    values.push(target);
    legacyByReference.set(target.referenceId, values);
  }
  const acceptedByReference = new Map();
  for (const entry of priorAcceptanceBundle?.entries ?? []) {
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(entry.acceptanceStatus)) continue;
    if (acceptedByReference.has(entry.referenceId)) {
      throw new Error(`multiple accepted targets for ${entry.referenceId}`);
    }
    acceptedByReference.set(entry.referenceId, entry);
  }
  const jobs = new Map();
  const targets = [];
  const discoveryTargets = [];
  const deferredTargets = [];
  const excluded = {};
  let suppressedPriorTerminalEdges = 0;
  let suppressedPriorAcceptedSourceEdges = 0;
  let suppressedPriorResolverOnlyTargets = 0;

  for (const record of acquisitionQueue.records) {
    const candidateTarget = candidateTargetsByReference.get(record.referenceId);
    if (!candidateTarget) throw new Error(`candidate manifest reference missing ${record.referenceId}`);
    const reference = references.get(record.referenceId);
    if (!reference) throw new Error(`acquisition reference missing ${record.referenceId}`);
    if (reference.lifecycleState !== record.lifecycleState) {
      throw new Error(`acquisition lifecycle drift for ${record.referenceId}`);
    }
    const legacy = selectLegacyTarget(record, legacyByReference);
    const accepted = record.route === 'PARSER_REPAIR'
      ? (acceptedByReference.get(record.referenceId) ?? null)
      : null;
    const targetId = accepted?.targetId
      ?? legacy?.targetId
      ?? id('recovery_target', `historical-acquisition-v1\0${record.referenceId}`);
    const resolverContractSha256 = typeof resolverContractSha256ForTarget === 'function'
      ? resolverContractSha256ForTarget({
        targetId,
        referenceId: record.referenceId,
        brand: record.brand,
        model: record.model,
        category: record.category,
      })
      : null;
    const priority = priorityClass(reference);
    const candidateEdges = [];
    const priorAttemptSuppressions = recoveryPolicySha256
      ? activeHistoricalAttemptSuppressions({
        ledger: priorAttemptLedger,
        targetId,
        referenceId: record.referenceId,
        policySha256: recoveryPolicySha256,
        evidenceProcessorEpochs,
      })
      : [];
    const priorSourceAcceptances = recoveryPolicySha256
      ? activeHistoricalSourceAcceptances({
        ledger: priorAttemptLedger,
        targetId,
        referenceId: record.referenceId,
        policySha256: recoveryPolicySha256,
      })
      : [];
    const priorResolverSuppressions = recoveryPolicySha256
      ? activeHistoricalResolverSuppressions({
        ledger: priorAttemptLedger,
        targetId,
        referenceId: record.referenceId,
        policySha256: recoveryPolicySha256,
        resolverContractSha256,
        evidenceProcessorEpochs,
      })
      : [];
    const terminalUrls = new Set(priorAttemptSuppressions.map((entry) => entry.sourceUrl));
    const acceptedUrls = new Set(priorSourceAcceptances.map((entry) => entry.sourceUrl));
    const sourceDocumentIds = new Set(legacy?.sourceDocumentIds ?? []);
    for (const sourceId of record.candidateSourceIds ?? []) {
      const source = sources.get(sourceId);
      if (!source) throw new Error(`acquisition source missing ${sourceId}`);
      for (const documentId of source.documentIds ?? []) sourceDocumentIds.add(documentId);
    }
    const legacyRuntimeId = accepted?.legacyRuntimeId
      ?? record.legacyRuntimeIds?.[0]
      ?? reference.catalogProductIds?.[0]
      ?? `historical-${record.referenceId}`;
    const baseTarget = {
      targetId,
      referenceId: record.referenceId,
      legacyRuntimeId,
      canonicalProductId: accepted?.canonicalProductId ?? record.canonicalProductIds?.[0] ?? null,
      category: record.category,
      brand: record.brand,
      model: record.model,
      lifecycleState: record.lifecycleState,
      currentLookupAction: reference.lookupAction,
      priorityClass: priority,
      requestedFields: [...REQUESTED_FIELDS],
      sourceDocumentIds: [...sourceDocumentIds].sort(),
      legacyHints: structuredClone(legacy?.legacyHints ?? []),
      registryDimensionHints: registryHints(reference),
      publicationEligible: false,
      repairExistingReceipt: record.route === 'PARSER_REPAIR',
      ...(priorAttemptSuppressions.length > 0 ? { priorAttemptSuppressions } : {}),
      ...(priorSourceAcceptances.length > 0 ? { priorSourceAcceptances } : {}),
    };
    const legacyAggregateResolverIds = sortedUnique(
      candidateTarget.legacyAggregateResolverIds ?? [],
    );

    const defer = (dispositionReason) => {
      if (dispositionReason === 'ACTIVE_RESOLVER_SUPPRESSION') {
        suppressedPriorResolverOnlyTargets += 1;
      } else {
        increment(excluded, dispositionReason);
      }
      deferredTargets.push({
        ...baseTarget,
        executionLane: 'DEFERRED',
        candidateManifestState: candidateTarget.state,
        dispositionReason,
        candidateIds: candidateTarget.candidateEdges.map((edge) => edge.candidateId),
        resolverContract: structuredClone(candidateTarget.resolverContract),
        incompleteResolverIds: [...candidateTarget.incompleteResolverIds],
        ...(legacyAggregateResolverIds.length > 0 ? {
          legacyAggregateResolverIds,
        } : {}),
      });
    };

    if (candidateTarget.state === 'NO_CANDIDATE_COMPLETE') {
      defer('NO_CANDIDATE_COMPLETE');
      continue;
    }
    if (candidateTarget.state === 'RESEARCH_REQUIRED') {
      defer('RESEARCH_REQUIRED');
      continue;
    }
    if (candidateTarget.state === 'DISCOVERY_RETRYABLE') {
      if (legacyAggregateResolverIds.length > 0) {
        defer('LEGACY_RESOLVER_CONTRACT');
        continue;
      }
      if (priorResolverSuppressions.length > 0) {
        defer('ACTIVE_RESOLVER_SUPPRESSION');
        continue;
      }
      discoveryTargets.push({
        ...baseTarget,
        executionLane: 'BOUNDED_DISCOVERY',
        discoveryReason: 'CANDIDATE_MANIFEST_RETRYABLE',
        candidateManifestState: candidateTarget.state,
        candidateJobIds: [],
        primaryJobId: null,
        observedCandidateIds: candidateTarget.candidateEdges.map((edge) => edge.candidateId),
        resolverContract: structuredClone(candidateTarget.resolverContract),
        incompleteResolverIds: [...candidateTarget.incompleteResolverIds],
      });
      continue;
    }

    const acquisitionRoute = RECOVERY_ROUTE[record.route];
    if (!acquisitionRoute) throw new Error(`candidate-ready acquisition route unsupported: ${record.route}`);
    for (const edge of candidateTarget.candidateEdges) {
      const candidate = candidatesById.get(edge.candidateId);
      if (acceptedUrls.has(candidate.sourceUrl)) {
        suppressedPriorAcceptedSourceEdges += 1;
        continue;
      }
      if (terminalUrls.has(candidate.sourceUrl)) {
        suppressedPriorTerminalEdges += 1;
        continue;
      }
      const jobId = id('recovery', `historical-official-candidate-v1\0${candidate.candidateId}`);
      const job = jobs.get(jobId) ?? {
        jobId,
        candidateId: candidate.candidateId,
        sourceUrl: candidate.sourceUrl,
        authorityBrand: candidate.authorityBrand,
        authorityMode: 'official',
        expectedContentType: candidate.expectedContentType,
        documentTypes: [...candidate.documentTypes],
        sourceRoles: [...candidate.sourceRoles],
        acquisitionRoutes: new Set(),
        priorityClasses: new Set(),
        targetIds: new Set(),
      };
      if (job.candidateId !== candidate.candidateId
        || normalizedBrand(job.authorityBrand) !== normalizedBrand(record.brand)) {
        throw new Error(`candidate fetch-job identity collision: ${candidate.candidateId}`);
      }
      job.acquisitionRoutes.add(acquisitionRoute);
      job.priorityClasses.add(priority);
      job.targetIds.add(targetId);
      jobs.set(jobId, job);
      candidateEdges.push({
        ...structuredClone(edge),
        jobId,
        acquisitionRoute,
        priorityClass: priority,
      });
    }
    candidateEdges.sort((left, right) => left.sourceRank - right.sourceRank
      || left.candidateId.localeCompare(right.candidateId));
    if (candidateEdges.length === 0) {
      if ((candidateTarget.retryableDiscovery === true || candidateTarget.state === 'CANDIDATES_READY')
        && priorResolverSuppressions.length === 0) {
        discoveryTargets.push({
          ...baseTarget,
          executionLane: 'BOUNDED_DISCOVERY',
          discoveryReason: 'ALL_CANDIDATES_SUPPRESSED_DISCOVERY_RETRYABLE',
          candidateManifestState: candidateTarget.state,
          candidateJobIds: [],
          primaryJobId: null,
          observedCandidateIds: candidateTarget.candidateEdges.map((edge) => edge.candidateId),
          resolverContract: structuredClone(candidateTarget.resolverContract),
          incompleteResolverIds: [...candidateTarget.incompleteResolverIds],
        });
      } else {
        defer(priorResolverSuppressions.length > 0
          ? 'ACTIVE_RESOLVER_SUPPRESSION'
          : 'ALL_CANDIDATES_SUPPRESSED');
      }
      continue;
    }
    const candidateJobIds = candidateEdges.map((edge) => edge.jobId);
    targets.push({
      ...baseTarget,
      executionLane: 'ACQUISITION',
      candidateManifestState: candidateTarget.state,
      candidateEdges,
      candidateJobIds,
      primaryJobId: candidateJobIds[0],
    });
  }

  const materializedJobs = [...jobs.values()].map((job) => ({
    jobId: job.jobId,
    candidateId: job.candidateId,
    sourceUrl: job.sourceUrl,
    authorityBrand: job.authorityBrand,
    authorityMode: job.authorityMode,
    expectedContentType: job.expectedContentType,
    documentTypes: [...job.documentTypes].sort(),
    sourceRoles: [...job.sourceRoles].sort(),
    acquisitionRoute: selectedAcquisitionRoute(job.acquisitionRoutes),
    acquisitionRoutes: [...job.acquisitionRoutes].sort(),
    priorityClass: selectedPriority(job.priorityClasses),
    priorityClasses: [...job.priorityClasses]
      .sort((left, right) => PRIORITY_ORDER[left] - PRIORITY_ORDER[right]),
    targetIds: [...job.targetIds].sort(),
  })).sort((left, right) => left.jobId.localeCompare(right.jobId));
  targets.sort(targetOrder);
  discoveryTargets.sort(targetOrder);
  deferredTargets.sort(targetOrder);
  const workTargets = [...targets, ...discoveryTargets];
  return {
    schemaVersion: 2,
    generatedAt: new Date(acquisitionQueue.generatedAt).toISOString(),
    sourceAcquisitionQueueSha256: acquisitionQueue.semanticQueueSha256,
    sourceOfficialCandidateManifestSha256: candidateManifest.semanticManifestSha256,
    evidenceProcessorEpochs: structuredClone(evidenceProcessorEpochs),
    policy: {
      resolverOnlyTargetsAllowed: false,
      discoveryTargetsSeparatedFromAcquisition: true,
      nonReadyCandidateObservationsExecutable: false,
      officialSourceRequiredForReceiptPromotion: true,
      registryOnlyHistoricalPublication: true,
    },
    summary: {
      acquisitionRecords: acquisitionQueue.records.length,
      fetchJobs: materializedJobs.length,
      targets: workTargets.length,
      acquisitionTargets: targets.length,
      discoveryTargets: discoveryTargets.length,
      deferredTargets: deferredTargets.length,
      resolverOnlyTargets: 0,
      candidateEdges: materializedJobs.reduce((sum, job) => sum + job.targetIds.length, 0),
      observedCandidateEdges: candidateManifest.summary.candidateEdges,
      isolatedNonReadyCandidateEdges: candidateManifest.targets
        .filter((target) => target.state !== 'CANDIDATES_READY')
        .reduce((sum, target) => sum + target.candidateEdges.length, 0),
      uniqueReferences: new Set(workTargets.map((target) => target.referenceId)).size,
      suppressedPriorTerminalEdges,
      suppressedPriorAcceptedSourceEdges,
      suppressedPriorResolverOnlyTargets,
      byLifecycle: countBy(workTargets, (target) => target.lifecycleState),
      byPriority: countBy(workTargets, (target) => target.priorityClass),
      byExecutionLane: {
        ACQUISITION: targets.length,
        BOUNDED_DISCOVERY: discoveryTargets.length,
      },
      deferredByReason: countBy(deferredTargets, (target) => target.dispositionReason),
      excluded: Object.fromEntries(Object.entries(excluded).sort(([left], [right]) => left.localeCompare(right))),
    },
    jobs: materializedJobs,
    targets,
    discoveryTargets,
    deferredTargets,
  };
}
