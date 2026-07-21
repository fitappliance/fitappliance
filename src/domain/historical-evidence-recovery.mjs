import { createHash } from 'node:crypto';

const LEGACY_PROVENANCE_GAP = 'legacy_evidence_missing_page_level_v2_provenance';
const AXIS_FIELDS = Object.freeze({
  width: 'closedEnvelope.widthMm',
  height: 'closedEnvelope.heightMm',
  depth: 'closedEnvelope.depthMm',
});

export const RECOVERY_CHECKPOINTS = Object.freeze([
  'FETCH_AND_HASH',
  'MINERU_CONTENT_LIST_V2',
  'EXACT_MODEL_IDENTITY',
  'AXIS_AND_RANGE_SEMANTICS',
  'OFFICIAL_SOURCE_AUTHORITY',
  'CROSS_SOURCE_CONFLICT_CHECK',
  'RECEIPT_BOUND_PROJECTION',
]);

const PRIORITY_ORDER = Object.freeze({
  P0_CURRENT_MISSING_DIMENSIONS: 0,
  P1_HISTORICAL_MISSING_DIMENSIONS: 1,
  P2_CURRENT_CONFIRMATION: 2,
  P3_HISTORICAL_CONFIRMATION: 3,
  P4_CONFLICT_RESOLUTION: 4,
});

const ROUTE_ORDER = Object.freeze({
  OFFICIAL_RECEIPT_REBUILD: 0,
  OFFICIAL_HOST_AUTHORITY_VALIDATION: 1,
  OFFICIAL_SOURCE_DISCOVERY_REQUIRED: 2,
  MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY: 3,
});

const REQUESTED_FIELDS = Object.freeze([
  AXIS_FIELDS.width,
  AXIS_FIELDS.height,
  AXIS_FIELDS.depth,
]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function countBy(rows, keyFor) {
  const counts = {};
  for (const row of rows) {
    const key = keyFor(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function increment(counts, reason) {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function brandKey(value) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) throw new TypeError('recovery target brand required');
  return key;
}

function modelKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!key) throw new TypeError('recovery target model required');
  return key;
}

function legacyDimensions(fields) {
  const dimensions = {};
  for (const [axis, fieldName] of Object.entries(AXIS_FIELDS)) {
    const values = [...new Set((fields ?? [])
      .filter((field) => field?.field === fieldName)
      .map((field) => Number(field.value))
      .filter((value) => Number.isFinite(value) && value > 0))];
    if (values.length === 0) return { reason: 'INCOMPLETE_LEGACY_DIMENSIONS' };
    if (values.length > 1) return { reason: 'CONFLICTING_LEGACY_DIMENSIONS' };
    dimensions[axis] = values[0];
  }
  return { dimensions };
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

function acquisitionRoute(documents) {
  if (documents.every((document) => (
    document.transportHostType === 'manufacturer' && document.authorType === 'manufacturer'
  ))) return 'OFFICIAL_RECEIPT_REBUILD';
  if (documents.every((document) => document.transportHostType === 'manufacturer')) {
    return 'OFFICIAL_HOST_AUTHORITY_VALIDATION';
  }
  if (documents.some((document) => document.transportHostType === 'retailer')) {
    return 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY';
  }
  return 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED';
}

function recoveryJobId(sourceUrl, authorityContext = null) {
  const seed = authorityContext ? `${sourceUrl}\0${authorityContext}` : sourceUrl;
  return `recovery_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function recoveryTargetId(target) {
  const seed = [
    'historical-evidence-target-v1',
    target.referenceId,
    String(target.legacyRuntimeId).toLowerCase(),
    brandKey(target.brand),
    modelKey(target.model),
    target.category,
    ...REQUESTED_FIELDS,
  ].join('\0');
  return `recovery_target_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function authorityMode(document) {
  return document.transportHostType === 'manufacturer' ? 'official' : 'reference';
}

function targetOrder(left, right) {
  return PRIORITY_ORDER[left.priorityClass] - PRIORITY_ORDER[right.priorityClass]
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId);
}

function jobOrder(left, right) {
  return PRIORITY_ORDER[left.priorityClass] - PRIORITY_ORDER[right.priorityClass]
    || ROUTE_ORDER[left.acquisitionRoute] - ROUTE_ORDER[right.acquisitionRoute]
    || left.sourceUrl.localeCompare(right.sourceUrl)
    || left.authorityBrand.localeCompare(right.authorityBrand, 'en-AU', { sensitivity: 'base' });
}

function targetHints(target) {
  if (target.legacyDimensionHintMm) return [target.legacyDimensionHintMm];
  return target.legacyDimensionHintsMm ?? [];
}

function completeDimensions(value) {
  return value && ['width', 'height', 'depth']
    .every((axis) => Number.isFinite(Number(value[axis])) && Number(value[axis]) > 0);
}

function registryDimensionHints(reference) {
  if (reference.registryDimensionState !== 'CONSISTENT' || !completeDimensions(reference.dimensionsMm)) {
    return [];
  }
  return (reference.sources ?? [])
    .filter((source) => source?.sourceId !== 'fitappliance:catalog'
      && /^[a-f0-9]{64}$/.test(String(source?.snapshotSha256 ?? '')))
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

function mergeObjectRows(left = [], right = [], keyFor = JSON.stringify) {
  return [...new Map([...left, ...right].map((value) => [keyFor(value), value])).values()]
    .sort((a, b) => keyFor(a).localeCompare(keyFor(b)));
}

function assertCompatibleTarget(left, right) {
  for (const key of [
    'targetId', 'referenceId', 'legacyRuntimeId', 'category', 'brand', 'model',
    'lifecycleState', 'currentLookupAction', 'priorityClass', 'publicationEligible',
  ]) {
    if (left[key] !== right[key]) throw new TypeError(`conflicting recovery target ${left.targetId}: ${key}`);
  }
  if (left.canonicalProductId && right.canonicalProductId
    && left.canonicalProductId !== right.canonicalProductId) {
    throw new TypeError(`conflicting recovery target ${left.targetId}: canonicalProductId`);
  }
}

function mergeTargetFacts(existing, next) {
  assertCompatibleTarget(existing, next);
  existing.canonicalProductId ??= next.canonicalProductId;
  existing.sourceDocumentIds = [...new Set([
    ...existing.sourceDocumentIds,
    ...next.sourceDocumentIds,
  ])].sort();
  existing.legacyHints = mergeObjectRows(
    existing.legacyHints,
    next.legacyHints,
    (value) => `${value.sourceDocumentId}\0${JSON.stringify(value.dimensionsMm)}`,
  );
  const legacyByDocument = new Map();
  for (const hint of existing.legacyHints) {
    const serialized = JSON.stringify(hint.dimensionsMm);
    const prior = legacyByDocument.get(hint.sourceDocumentId);
    if (prior && prior !== serialized) {
      throw new TypeError(`conflicting legacy hint for source document ${hint.sourceDocumentId}`);
    }
    legacyByDocument.set(hint.sourceDocumentId, serialized);
  }
  existing.registryDimensionHints = mergeObjectRows(
    existing.registryDimensionHints,
    next.registryDimensionHints,
    (value) => `${value.sourceId}\0${value.snapshotSha256}\0${JSON.stringify(value.dimensionsMm)}`,
  );
  const hints = [...new Map([...targetHints(existing), ...targetHints(next)]
    .map((value) => [JSON.stringify(value), value])).values()];
  if (hints.length === 1) {
    existing.legacyDimensionHintMm = hints[0];
    delete existing.legacyDimensionHintsMm;
    delete existing.legacyHintsConflict;
  } else {
    existing.legacyDimensionHintsMm = hints;
    existing.legacyHintsConflict = true;
    delete existing.legacyDimensionHintMm;
  }
}

function mergeTargets(targets) {
  const byId = new Map();
  for (const target of targets) {
    const normalized = {
      ...target,
      targetId: recoveryTargetId(target),
      requestedFields: [...REQUESTED_FIELDS],
      sourceDocumentIds: [target.sourceDocumentId],
      legacyHints: [{
        sourceDocumentId: target.sourceDocumentId,
        dimensionsMm: target.legacyDimensionHintMm,
      }],
    };
    delete normalized.sourceDocumentId;
    const existing = byId.get(normalized.targetId);
    if (existing) mergeTargetFacts(existing, normalized);
    else byId.set(normalized.targetId, normalized);
  }
  return [...byId.values()].sort(targetOrder);
}

export function buildHistoricalEvidenceRecoveryQueue({ sourceDocuments, historicalReference }) {
  if (!Array.isArray(sourceDocuments) || !Array.isArray(historicalReference?.records)) {
    throw new TypeError('source documents and historical reference records are required');
  }
  if (Number.isNaN(Date.parse(historicalReference.generatedAt))) {
    throw new TypeError('historical reference generatedAt must be an ISO timestamp');
  }

  const referencesByCatalogId = new Map();
  for (const reference of historicalReference.records) {
    for (const catalogProductId of reference.catalogProductIds ?? []) {
      const key = String(catalogProductId).toLowerCase();
      const rows = referencesByCatalogId.get(key) ?? [];
      rows.push(reference);
      referencesByCatalogId.set(key, rows);
    }
  }

  const excluded = {};
  const selectedDocumentIds = new Set();
  const grouped = new Map();
  for (const document of sourceDocuments) {
    if (document?.rejectionReason !== LEGACY_PROVENANCE_GAP) {
      increment(excluded, 'NOT_LEGACY_PROVENANCE_GAP');
      continue;
    }
    if (document.identityOutcome !== 'exact') {
      increment(excluded, 'IDENTITY_NOT_EXACT');
      continue;
    }
    const dimensionsResult = legacyDimensions(document.fields);
    if (!dimensionsResult.dimensions) {
      increment(excluded, dimensionsResult.reason);
      continue;
    }
    const sourceUrl = safeHttpsUrl(document.sourceUrl);
    if (!sourceUrl) {
      increment(excluded, 'UNSAFE_SOURCE_URL');
      continue;
    }

    let documentSelected = false;
    for (const link of document.productLinks ?? []) {
      const references = referencesByCatalogId.get(String(link?.legacyRuntimeId ?? '').toLowerCase()) ?? [];
      if (references.length === 0) {
        increment(excluded, 'HISTORICAL_REFERENCE_NOT_FOUND');
        continue;
      }
      for (const reference of references) {
        if (reference.lookupAction === 'AUTO_FILL') {
          increment(excluded, 'ALREADY_AUTO_FILL');
          continue;
        }
        const mode = authorityMode(document);
        const groupKey = `${sourceUrl}\0${brandKey(reference.brand)}\0${mode}`;
        const group = grouped.get(groupKey) ?? {
          sourceUrl,
          authorityBrand: reference.brand,
          authorityMode: mode,
          documents: [],
          targets: [],
        };
        if (!group.documents.some((candidate) => candidate.id === document.id)) group.documents.push(document);
        group.targets.push({
          sourceDocumentId: document.id,
          referenceId: reference.referenceId,
          legacyRuntimeId: String(link.legacyRuntimeId),
          canonicalProductId: link.canonicalProductId ?? null,
          category: reference.category,
          brand: reference.brand,
          model: reference.model,
          lifecycleState: reference.lifecycleState,
          currentLookupAction: reference.lookupAction,
          priorityClass: priorityClass(reference),
          legacyDimensionHintMm: dimensionsResult.dimensions,
          registryDimensionHints: registryDimensionHints(reference),
          publicationEligible: false,
        });
        grouped.set(groupKey, group);
        documentSelected = true;
      }
    }
    if (documentSelected) selectedDocumentIds.add(document.id);
  }

  const contextCountByUrl = countBy([...grouped.values()], (group) => group.sourceUrl);
  const jobsWithTargets = [...grouped.values()].map((group) => {
    const targets = mergeTargets(group.targets);
    const authorityContext = contextCountByUrl[group.sourceUrl] > 1
      ? `${brandKey(group.authorityBrand)}\0${group.authorityMode}`
      : null;
    return {
      jobId: recoveryJobId(group.sourceUrl, authorityContext),
      sourceUrl: group.sourceUrl,
      authorityBrand: group.authorityBrand,
      authorityMode: group.authorityMode,
      acquisitionRoute: acquisitionRoute(group.documents),
      priorityClass: targets[0].priorityClass,
      transportHostTypes: [...new Set(group.documents.map((document) => document.transportHostType))].sort(),
      authorTypes: [...new Set(group.documents.map((document) => document.authorType))].sort(),
      checkpoints: [...RECOVERY_CHECKPOINTS],
      targets,
    };
  }).sort(jobOrder);

  const targetsById = new Map();
  const jobs = jobsWithTargets.map(({ targets: jobTargets, ...job }) => {
    const targetIds = [];
    for (const target of jobTargets) {
      targetIds.push(target.targetId);
      const existing = targetsById.get(target.targetId);
      if (existing) {
        mergeTargetFacts(existing, target);
        existing.candidateJobIds.push(job.jobId);
      } else {
        targetsById.set(target.targetId, {
          ...target,
          candidateJobIds: [job.jobId],
        });
      }
    }
    return { ...job, targetIds };
  });

  const jobRank = new Map(jobs.map((job, index) => [job.jobId, index]));
  const targets = [...targetsById.values()].map((target) => {
    target.candidateJobIds = [...new Set(target.candidateJobIds)]
      .sort((left, right) => jobRank.get(left) - jobRank.get(right));
    target.primaryJobId = target.candidateJobIds[0];
    return target;
  }).sort(targetOrder);

  const uniqueReferenceIds = new Set(targets.map((target) => target.referenceId));
  return freezeDeep({
    schemaVersion: 2,
    generatedAt: new Date(historicalReference.generatedAt).toISOString(),
    policy: {
      legacyDimensionsAreHintsOnly: true,
      automaticPublicationRequiresAllCheckpoints: true,
      officialSourceRequiredForReceiptPromotion: true,
      authorityContextRequired: true,
    },
    summary: {
      documents: selectedDocumentIds.size,
      fetchJobs: jobs.length,
      targets: targets.length,
      candidateEdges: jobs.reduce((count, job) => count + job.targetIds.length, 0),
      multiCandidateTargets: targets.filter((target) => target.candidateJobIds.length > 1).length,
      uniqueReferences: uniqueReferenceIds.size,
      byCurrentAction: countBy(targets, (target) => target.currentLookupAction),
      byLifecycle: countBy(targets, (target) => target.lifecycleState),
      byCategory: countBy(targets, (target) => target.category),
      byAcquisitionRoute: countBy(jobs, (job) => job.acquisitionRoute),
      excluded: Object.fromEntries(Object.entries(excluded).sort(([left], [right]) => left.localeCompare(right))),
    },
    jobs,
    targets,
  });
}
