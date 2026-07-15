import { createHash } from 'node:crypto';

const REQUESTED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);
const EXECUTABLE_ROUTES = new Set([
  'PARSER_REPAIR',
  'OFFICIAL_REACQUIRE',
  'OFFICIAL_REDISCOVERY',
  'OFFICIAL_DISCOVERY',
]);
const RECOVERY_ROUTE = Object.freeze({
  PARSER_REPAIR: 'OFFICIAL_RECEIPT_REBUILD',
  OFFICIAL_REACQUIRE: 'OFFICIAL_RECEIPT_REBUILD',
  OFFICIAL_REDISCOVERY: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY',
  OFFICIAL_DISCOVERY: 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
});
const PRIORITY_ORDER = Object.freeze({
  P0_CURRENT_MISSING_DIMENSIONS: 0,
  P1_HISTORICAL_MISSING_DIMENSIONS: 1,
  P2_CURRENT_CONFIRMATION: 2,
  P3_HISTORICAL_CONFIRMATION: 3,
  P4_CONFLICT_RESOLUTION: 4,
});

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

export function buildHistoricalExecutableRecoveryQueue({
  acquisitionQueue,
  historicalReference,
  legacyRecoveryQueue,
  priorAcceptanceBundle = { entries: [] },
}) {
  if (acquisitionQueue?.schemaVersion !== 1 || !Array.isArray(acquisitionQueue.records)
    || !Array.isArray(acquisitionQueue.sources)) {
    throw new TypeError('historical acquisition queue schema v1 required');
  }
  if (!Array.isArray(historicalReference?.records)) throw new TypeError('historical reference records required');
  if (legacyRecoveryQueue?.schemaVersion !== 2 || !Array.isArray(legacyRecoveryQueue.targets)) {
    throw new TypeError('legacy recovery queue schema v2 required');
  }
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
  const excluded = {};

  for (const record of acquisitionQueue.records) {
    if (!EXECUTABLE_ROUTES.has(record.route)) {
      const reason = record.executionReadiness ?? record.route;
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      continue;
    }
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
    const priority = priorityClass(reference);
    const candidateJobIds = [];
    const sourceDocumentIds = new Set(legacy?.sourceDocumentIds ?? []);
    for (const sourceId of record.candidateSourceIds ?? []) {
      const source = sources.get(sourceId);
      if (!source) throw new Error(`acquisition source missing ${sourceId}`);
      for (const documentId of source.documentIds ?? []) sourceDocumentIds.add(documentId);
      if (source.sourceAuthority !== 'OFFICIAL' || source.receiptEligible !== true) continue;
      const acquisitionRoute = RECOVERY_ROUTE[record.route];
      const jobId = id('recovery', [source.sourceUrl, record.brand, acquisitionRoute, priority].join('\0'));
      const job = jobs.get(jobId) ?? {
        jobId,
        sourceUrl: source.sourceUrl,
        authorityBrand: record.brand,
        authorityMode: 'official',
        acquisitionRoute,
        priorityClass: priority,
        targetIds: [],
      };
      job.targetIds.push(targetId);
      jobs.set(jobId, job);
      candidateJobIds.push(jobId);
    }
    candidateJobIds.sort();
    const legacyRuntimeId = accepted?.legacyRuntimeId
      ?? record.legacyRuntimeIds?.[0]
      ?? reference.catalogProductIds?.[0]
      ?? `historical-${record.referenceId}`;
    targets.push({
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
      candidateJobIds,
      primaryJobId: candidateJobIds[0] ?? null,
      repairExistingReceipt: record.route === 'PARSER_REPAIR',
    });
  }

  const materializedJobs = [...jobs.values()].map((job) => ({
    ...job,
    targetIds: [...new Set(job.targetIds)].sort(),
  })).sort((left, right) => left.jobId.localeCompare(right.jobId));
  targets.sort(targetOrder);
  return {
    schemaVersion: 2,
    generatedAt: new Date(acquisitionQueue.generatedAt).toISOString(),
    sourceAcquisitionQueueSha256: acquisitionQueue.semanticQueueSha256,
    policy: {
      resolverOnlyTargetsAllowed: true,
      officialSourceRequiredForReceiptPromotion: true,
      registryOnlyHistoricalPublication: true,
    },
    summary: {
      acquisitionRecords: acquisitionQueue.records.length,
      fetchJobs: materializedJobs.length,
      targets: targets.length,
      resolverOnlyTargets: targets.filter((target) => target.candidateJobIds.length === 0).length,
      candidateEdges: materializedJobs.reduce((sum, job) => sum + job.targetIds.length, 0),
      uniqueReferences: new Set(targets.map((target) => target.referenceId)).size,
      byLifecycle: countBy(targets, (target) => target.lifecycleState),
      byPriority: countBy(targets, (target) => target.priorityClass),
      excluded: Object.fromEntries(Object.entries(excluded).sort(([left], [right]) => left.localeCompare(right))),
    },
    jobs: materializedJobs,
    targets,
  };
}
