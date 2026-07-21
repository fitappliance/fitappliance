import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const DOCUMENT_PRIORITY = Object.freeze({
  P0_CURRENT_LINKED: 0,
  P1_ARCHIVED_LINKED: 1,
  P2_REGISTRY_LINKED: 2,
  P2_COVERAGE_COMPLETE: 3,
  P3_UNLINKED: 4,
});

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function requiredHash(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!SHA256.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function uniqueSortedNumbers(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function modelOrder(left, right) {
  return left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId);
}

function documentPriority(linkedModels) {
  if (linkedModels.length
    && linkedModels.every((model) => model.operationalClass === 'COMPLETE_RECEIPT')) {
    return 'P2_COVERAGE_COMPLETE';
  }
  if (linkedModels.some((model) => model.lifecycleState === 'CURRENT_RETAIL')) return 'P0_CURRENT_LINKED';
  if (linkedModels.some((model) => model.lifecycleState === 'CATALOG_ARCHIVED')) return 'P1_ARCHIVED_LINKED';
  if (linkedModels.length) return 'P2_REGISTRY_LINKED';
  return 'P3_UNLINKED';
}

function broadIdentityScope(model) {
  return model.identityScope !== 'EXACT_MODEL'
    || ['document_family', 'marketing_series', 'parser_family'].includes(model.groupType);
}

function documentRepairClass(scan, hybrid, linkedModels) {
  if (!scan || scan.status !== 'current') return 'PRIMARY_REPAIR_REQUIRED';
  if (!scan.imageOnlyDimensionPages.length) return 'PRIMARY_TEXT_ONLY';
  if (hybrid?.status === 'current') return 'HYBRID_COMPLETE_REVIEW_REQUIRED';
  if (!linkedModels.length) return 'HYBRID_REQUIRED_UNLINKED';
  if (linkedModels.every((model) => model.operationalClass === 'COMPLETE_RECEIPT')) {
    return 'HYBRID_OPTIONAL_COVERAGE_COMPLETE';
  }
  if (linkedModels.length === 1 && !broadIdentityScope(linkedModels[0])) {
    return 'HYBRID_REQUIRED_EXACT_MODEL';
  }
  if (linkedModels.length > 1 || linkedModels.some((model) => (
    ['document_family', 'marketing_series', 'parser_family'].includes(model.groupType)
  ))) return 'HYBRID_REQUIRED_SERIES_SCOPE';
  return 'HYBRID_REQUIRED_IDENTITY_RESEARCH';
}

function terminalRepairState(record) {
  if (record.operationalClass === 'COMPLETE_RECEIPT') return 'RECEIPT_COMPLETE';
  if (record.operationalClass === 'OFFICIAL_HTML_ONLY') return 'OFFICIAL_HTML_TERMINAL';
  if (record.operationalClass === 'NO_OFFICIAL_SOURCE') return 'NO_OFFICIAL_SOURCE_TERMINAL';
  if (record.operationalClass === 'CONFLICT_QUARANTINE') return 'CONFLICT_CLOSURE_REQUIRED';
  if (record.operationalClass === 'IDENTITY_RESEARCH') return 'IDENTITY_CLOSURE_REQUIRED';
  return null;
}

function modelRepairState(record, linkedDocuments) {
  const terminal = terminalRepairState(record);
  if (terminal) return terminal;
  const classes = new Set(linkedDocuments.map((document) => document.repairClass));
  if (classes.has('HYBRID_COMPLETE_REVIEW_REQUIRED')) return 'HYBRID_REVIEW_OR_CORROBORATION';
  if (classes.has('HYBRID_REQUIRED_SERIES_SCOPE')
    || classes.has('HYBRID_REQUIRED_IDENTITY_RESEARCH')
    || classes.has('HYBRID_REQUIRED_UNLINKED')) return 'HYBRID_IDENTITY_SCOPE_REQUIRED';
  if (classes.has('HYBRID_REQUIRED_EXACT_MODEL')) return 'HYBRID_REPAIR_READY';
  if (classes.has('PRIMARY_REPAIR_REQUIRED')) return 'PRIMARY_REPAIR_REQUIRED';
  if (classes.has('PRIMARY_TEXT_ONLY')) return 'OFFLINE_TEXT_REPLAY';
  if ((record.documentLinks ?? []).some((link) => link.sourceUrl)) {
    return 'OFFICIAL_REACQUIRE_OR_REDISCOVER';
  }
  if (['OFFICIAL_REACQUIRE', 'REFERENCE_REDISCOVERY'].includes(record.operationalClass)) {
    return 'OFFICIAL_REACQUIRE_OR_REDISCOVER';
  }
  return 'OFFICIAL_DISCOVERY_REQUIRED';
}

function normalizeScan(scan) {
  const pages = uniqueSortedNumbers((scan.imageOnlyDimensionPages ?? []).map(Number));
  if (pages.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new TypeError('image-only page numbers invalid');
  }
  const pageCount = Number(scan.pageCount ?? 0);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pages.some((page) => page > pageCount)) {
    throw new TypeError('primary scan page count invalid');
  }
  return {
    sourcePdfSha256: requiredHash(scan.sourcePdfSha256, 'primary scan PDF hash'),
    status: String(scan.status ?? 'unknown'),
    pageCount,
    imageOnlyDimensionPages: pages,
    ...(scan.derivedContentSha256 ? {
      derivedContentSha256: requiredHash(scan.derivedContentSha256, 'primary derived content hash'),
    } : {}),
  };
}

function normalizeHybrid(index) {
  const processedPages = uniqueSortedNumbers((index.processedPages ?? []).map(Number));
  if (index.profileId !== 'hybrid-image-high-v1' || !processedPages.length
    || processedPages.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new TypeError('current image fallback index required');
  }
  return {
    sourcePdfSha256: requiredHash(index.sourcePdfSha256, 'hybrid PDF hash'),
    status: String(index.status ?? 'unknown'),
    profileId: index.profileId,
    processedPages,
    derivedContentSha256: requiredHash(index.derivedContentSha256, 'hybrid derived content hash'),
  };
}

export function buildHistoricalPdfImageRepairQueue({
  classification,
  historicalReference,
  pdfDocuments,
  primaryScans,
  hybridIndexes = [],
  generatedAt,
}) {
  if (classification?.schemaVersion !== 1 || !Array.isArray(classification.records)) {
    throw new TypeError('historical model classification schema v1 required');
  }
  if (!Array.isArray(historicalReference?.records)) throw new TypeError('historical reference records required');
  if (!Array.isArray(pdfDocuments) || !Array.isArray(primaryScans) || !Array.isArray(hybridIndexes)) {
    throw new TypeError('PDF inventory and parser scans required');
  }
  const timestamp = new Date(generatedAt).toISOString();
  const references = new Map(historicalReference.records.map((record) => [record.referenceId, record]));
  if (references.size !== historicalReference.records.length) throw new Error('duplicate historical reference ID');
  if (classification.records.length !== references.size
    || classification.records.some((record) => !references.has(record.referenceId))) {
    throw new Error('image repair queue requires complete historical model coverage');
  }

  const documentsByHash = new Map();
  for (const document of pdfDocuments) {
    const sourcePdfSha256 = requiredHash(document.sourcePdfSha256, 'PDF inventory hash');
    if (documentsByHash.has(sourcePdfSha256)) throw new Error(`duplicate PDF inventory hash ${sourcePdfSha256}`);
    documentsByHash.set(sourcePdfSha256, {
      sourcePdfSha256,
      byteSize: Number(document.byteSize),
      paths: uniqueSorted(document.paths ?? []),
    });
  }
  const scans = new Map(primaryScans.map((scan) => {
    const normalized = normalizeScan(scan);
    return [normalized.sourcePdfSha256, normalized];
  }));
  if (scans.size !== primaryScans.length) throw new Error('duplicate primary PDF scan');
  const hybrids = new Map(hybridIndexes.map((index) => {
    const normalized = normalizeHybrid(index);
    return [normalized.sourcePdfSha256, normalized];
  }));
  if (hybrids.size !== hybridIndexes.length) throw new Error('duplicate hybrid PDF index');
  for (const hash of [...scans.keys(), ...hybrids.keys()]) {
    if (!documentsByHash.has(hash)) throw new Error(`parser index is outside PDF baseline: ${hash}`);
  }

  const modelsByHash = new Map();
  const sourceLinksByHash = new Map();
  for (const record of classification.records) {
    for (const hash of uniqueSorted((record.documentLinks ?? [])
      .map((link) => link.sourcePdfSha256)
      .filter(Boolean)
      .map((value) => requiredHash(value, 'classified PDF hash')))) {
      if (!documentsByHash.has(hash)) continue;
      if (!modelsByHash.has(hash)) modelsByHash.set(hash, []);
      modelsByHash.get(hash).push({
        referenceId: record.referenceId,
        category: record.category,
        brand: record.canonicalBrand,
        model: record.model,
        lifecycleState: record.lifecycleState,
        operationalClass: record.operationalClass,
        identityScope: record.identityScope,
        groupType: record.groupType,
        groupName: record.groupName,
        grammarProfileIds: uniqueSorted(record.grammarProfileIds ?? []),
      });
    }
    for (const link of record.documentLinks ?? []) {
      if (!link.sourcePdfSha256) continue;
      const hash = requiredHash(link.sourcePdfSha256, 'classified PDF hash');
      if (!documentsByHash.has(hash)) continue;
      if (!sourceLinksByHash.has(hash)) sourceLinksByHash.set(hash, new Map());
      const normalized = {
        referenceId: record.referenceId,
        documentId: String(link.documentId ?? ''),
        sourceUrl: link.sourceUrl ?? null,
        sourceAuthority: String(link.sourceAuthority ?? 'NONE'),
        identityScope: String(link.identityScope ?? 'UNPROVEN'),
      };
      const key = [normalized.referenceId, normalized.documentId, normalized.sourceUrl ?? '',
        normalized.sourceAuthority, normalized.identityScope].join('\0');
      sourceLinksByHash.get(hash).set(key, normalized);
    }
  }

  const documents = [...documentsByHash.values()].map((document) => {
    const linkedModels = [...(modelsByHash.get(document.sourcePdfSha256) ?? [])].sort(modelOrder);
    const scan = scans.get(document.sourcePdfSha256) ?? null;
    const hybrid = hybrids.get(document.sourcePdfSha256) ?? null;
    const repairClass = documentRepairClass(scan, hybrid, linkedModels);
    return {
      schemaVersion: 1,
      ...document,
      priority: documentPriority(linkedModels),
      repairClass,
      primaryScan: scan,
      hybridIndex: hybrid,
      referenceIds: linkedModels.map((model) => model.referenceId).sort(),
      linkedModels,
      sourceLinks: [...(sourceLinksByHash.get(document.sourcePdfSha256)?.values() ?? [])]
        .sort((left, right) => left.referenceId.localeCompare(right.referenceId)
          || left.documentId.localeCompare(right.documentId)),
      publicationEligible: false,
    };
  }).sort((left, right) => DOCUMENT_PRIORITY[left.priority] - DOCUMENT_PRIORITY[right.priority]
    || left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
  const documentByHash = new Map(documents.map((document) => [document.sourcePdfSha256, document]));

  const modelRecords = classification.records.map((record) => {
    const reference = references.get(record.referenceId);
    const pdfHashes = uniqueSorted((record.documentLinks ?? [])
      .map((link) => link.sourcePdfSha256)
      .filter((hash) => hash && documentByHash.has(hash)));
    const linkedDocuments = pdfHashes.map((hash) => documentByHash.get(hash));
    return {
      schemaVersion: 1,
      referenceId: record.referenceId,
      category: record.category,
      brand: record.canonicalBrand,
      model: record.model,
      lifecycleState: record.lifecycleState,
      lookupAction: reference.lookupAction,
      identityScope: record.identityScope,
      groupType: record.groupType,
      groupName: record.groupName,
      operationalClass: record.operationalClass,
      grammarProfileIds: uniqueSorted(record.grammarProfileIds ?? []),
      sourcePdfSha256: pdfHashes,
      repairState: modelRepairState(record, linkedDocuments),
      publicationEligible: record.operationalClass === 'COMPLETE_RECEIPT',
    };
  }).sort(modelOrder);

  const semantic = {
    sourceClassificationSha256: requiredHash(
      classification.semanticClassificationSha256,
      'classification semantic hash',
    ),
    documents,
    modelRecords,
  };
  return {
    schemaVersion: 1,
    generatedAt: timestamp,
    semanticQueueSha256: canonicalJsonSha256(semantic),
    ...semantic,
    summary: {
      models: {
        total: modelRecords.length,
        byRepairState: countBy(modelRecords, (record) => record.repairState),
        byLifecycle: countBy(modelRecords, (record) => record.lifecycleState),
      },
      documents: {
        total: documents.length,
        imageFallbackCandidates: documents.filter((document) => (
          document.primaryScan?.imageOnlyDimensionPages.length > 0
        )).length,
        imageFallbackPages: documents.reduce((sum, document) => (
          sum + (document.primaryScan?.imageOnlyDimensionPages.length ?? 0)
        ), 0),
        byRepairClass: countBy(documents, (document) => document.repairClass),
        byPriority: countBy(documents, (document) => document.priority),
      },
    },
  };
}

export function selectHistoricalPdfImageRepairs(queue, options = {}) {
  if (!Array.isArray(queue?.documents)) throw new TypeError('historical PDF image repair queue required');
  const repairClasses = new Set(options.repairClasses ?? ['HYBRID_REQUIRED_EXACT_MODEL']);
  if (!repairClasses.size) throw new TypeError('at least one repair class required');
  const priority = options.priority == null ? null : requiredText(options.priority, 'repair priority');
  const sha256 = options.sha256 == null ? null : requiredHash(options.sha256, 'repair PDF hash');
  const sha256s = options.sha256s == null
    ? null
    : new Set(options.sha256s.map((value) => requiredHash(value, 'repair PDF hash')));
  if (sha256 && sha256s) throw new TypeError('use one repair PDF hash selector');
  if (sha256s && !sha256s.size) throw new TypeError('repair PDF hash list cannot be empty');
  const limit = options.limit == null ? 10 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('positive repair limit required');
  if (sha256s && limit < sha256s.size) throw new Error('repair limit cannot truncate an explicit PDF hash list');
  const selected = queue.documents
    .filter((document) => repairClasses.has(document.repairClass))
    .filter((document) => priority == null || document.priority === priority)
    .filter((document) => sha256 == null || document.sourcePdfSha256 === sha256)
    .filter((document) => sha256s == null || sha256s.has(document.sourcePdfSha256))
    .sort((left, right) => (DOCUMENT_PRIORITY[left.priority] ?? 99) - (DOCUMENT_PRIORITY[right.priority] ?? 99)
      || left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
  if (sha256 && !selected.length) throw new Error(`repair PDF hash not found or ineligible: ${sha256}`);
  if (sha256s && selected.length !== sha256s.size) {
    const selectedHashes = new Set(selected.map((document) => document.sourcePdfSha256));
    const missing = [...sha256s].filter((hash) => !selectedHashes.has(hash));
    throw new Error(`repair PDF hashes not found or ineligible: ${missing.join(', ')}`);
  }
  return selected.slice(0, limit);
}

const CLOSED_FIELD_AXIS = Object.freeze({
  'closedEnvelope.widthMm': 'width',
  'closedEnvelope.heightMm': 'height',
  'closedEnvelope.depthMm': 'depth',
});
const AXIS_PERMUTATIONS = Object.freeze([
  ['width', 'height', 'depth'],
  ['width', 'depth', 'height'],
  ['height', 'width', 'depth'],
  ['height', 'depth', 'width'],
  ['depth', 'width', 'height'],
  ['depth', 'height', 'width'],
]);

function extractedDimensions(claims) {
  const dimensions = {};
  for (const claim of claims ?? []) {
    const axis = CLOSED_FIELD_AXIS[claim.field];
    if (!axis) continue;
    let value = null;
    if (claim.value?.kind === 'fixed' && Number.isFinite(claim.value.mm)) {
      value = claim.value.mm;
    } else if (claim.value?.kind === 'range'
      && Number.isFinite(claim.value.minMm)
      && Number.isFinite(claim.value.maxMm)
      && claim.value.minMm <= claim.value.maxMm) {
      value = { kind: 'range', minMm: claim.value.minMm, maxMm: claim.value.maxMm };
    }
    if (value == null) continue;
    if (dimensions[axis] != null
      && JSON.stringify(dimensions[axis]) !== JSON.stringify(value)) return null;
    dimensions[axis] = value;
  }
  return ['width', 'height', 'depth'].every((axis) => (
    Number.isFinite(dimensions[axis]) || dimensions[axis]?.kind === 'range'
  ))
    ? dimensions
    : null;
}

export function reconcileMineruProfileExtractions({ primary, hybrid }) {
  if (!primary || typeof primary !== 'object' || !hybrid || typeof hybrid !== 'object') {
    throw new TypeError('primary and hybrid MinerU extraction outcomes required');
  }
  const primaryDimensions = primary.status === 'extracted'
    ? extractedDimensions(primary.claims)
    : null;
  const hybridDimensions = hybrid.status === 'extracted'
    ? extractedDimensions(hybrid.claims)
    : null;
  const profileDimensions = {
    primary: primaryDimensions,
    hybrid: hybridDimensions,
  };

  if (primaryDimensions && hybridDimensions) {
    const agrees = ['width', 'height', 'depth'].every((axis) => (
      JSON.stringify(primaryDimensions[axis]) === JSON.stringify(hybridDimensions[axis])
    ));
    if (!agrees) {
      return {
        status: 'failed',
        failureCode: 'PROFILE_DIMENSION_CONFLICT',
        error: 'primary and hybrid MinerU profiles disagree on closed-envelope dimensions',
        profileDimensions,
      };
    }
    return {
      ...primary,
      extractionProfile: 'cross_profile_agreement',
      profileDimensions,
    };
  }
  if (primaryDimensions) {
    return { ...primary, extractionProfile: 'primary', profileDimensions };
  }
  if (hybridDimensions) {
    return { ...hybrid, extractionProfile: 'hybrid', profileDimensions };
  }

  const failurePrecedence = [
    'IDENTITY_SCOPE_UNRESOLVED',
    'AMBIGUOUS_DIMENSION_VALUES',
    'EXTRACTION_FAILED',
    'HYBRID_REPAIR_REQUIRED',
    'NO_USABLE_DIMENSION_CLAIMS',
  ];
  const failures = [primary, hybrid].filter((entry) => entry.status === 'failed');
  const selectedCode = failurePrecedence.find((code) => (
    failures.some((entry) => entry.failureCode === code)
  )) ?? 'NO_USABLE_DIMENSION_CLAIMS';
  return {
    status: 'failed',
    failureCode: selectedCode,
    error: failures.map((entry) => String(entry.error ?? entry.failureCode ?? 'profile incomplete'))
      .join(' | ')
      .slice(0, 4096) || 'neither MinerU profile contains complete closed-envelope dimensions',
    profileDimensions,
  };
}

function withinTolerance(left, right, toleranceMm) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= toleranceMm;
}

function evidenceContains(value, candidate, toleranceMm) {
  if (Number.isFinite(value)) return withinTolerance(value, candidate, toleranceMm);
  return value?.kind === 'range'
    && Number.isFinite(value.minMm)
    && Number.isFinite(value.maxMm)
    && candidate >= value.minMm - toleranceMm
    && candidate <= value.maxMm + toleranceMm;
}

function fixedDimensions(dimensions) {
  return dimensions && ['width', 'height', 'depth'].every((axis) => Number.isFinite(dimensions[axis]))
    ? structuredClone(dimensions)
    : null;
}

function corroboration(reference, dimensions, toleranceMm) {
  const registry = reference?.registryDimensionState === 'CONSISTENT'
    ? reference.dimensionsMm
    : null;
  if (!registry || !['width', 'height', 'depth'].every((axis) => Number.isFinite(registry[axis]))) {
    return { state: 'NO_INDEPENDENT_CORROBORATION', registryDimensionsMm: null };
  }
  if (['width', 'height', 'depth'].every((axis) => (
    evidenceContains(dimensions[axis], registry[axis], toleranceMm)
  ))) return {
    state: Object.values(dimensions).some((value) => value?.kind === 'range')
      ? 'AGREES_WITHIN_RANGE'
      : 'AGREES',
    registryDimensionsMm: structuredClone(registry),
  };
  const permutation = AXIS_PERMUTATIONS.find((order) => (
    order.some((axis, index) => axis !== ['width', 'height', 'depth'][index])
    && ['width', 'height', 'depth'].every((axis, index) => (
      evidenceContains(dimensions[axis], registry[order[index]], toleranceMm)
    ))
  ));
  return {
    state: permutation ? 'AXIS_PERMUTATION_CONFLICT' : 'DIMENSION_CONFLICT',
    registryDimensionsMm: structuredClone(registry),
    ...(permutation ? { registryAxisOrder: permutation } : {}),
  };
}

function officialSource(document, referenceId) {
  return (document.sourceLinks ?? []).find((link) => (
    link.referenceId === referenceId
    && link.sourceAuthority === 'OFFICIAL'
    && typeof link.sourceUrl === 'string'
    && /^https:\/\//i.test(link.sourceUrl)
  )) ?? null;
}

function auditDecision({ extraction, document, reference, dimensions, corroborated }) {
  if (extraction.status !== 'extracted') return extraction.failureCode ?? 'EXTRACTION_FAILED';
  if (!dimensions) return 'NON_SCALAR_OR_INCOMPLETE_DIMENSIONS';
  if (['DIMENSION_CONFLICT', 'AXIS_PERMUTATION_CONFLICT'].includes(corroborated.state)) {
    return 'DIMENSION_CONFLICT_QUARANTINE';
  }
  if (!officialSource(document, extraction.referenceId)) return 'OFFICIAL_PROVENANCE_REDISCOVERY_REQUIRED';
  if (!['AGREES', 'AGREES_WITHIN_RANGE'].includes(corroborated.state)) {
    return 'INDEPENDENT_CORROBORATION_REQUIRED';
  }
  if (document.linkedModels.find((model) => model.referenceId === extraction.referenceId)
    ?.operationalClass === 'COMPLETE_RECEIPT') return 'ARCHIVAL_REDUNDANT_EVIDENCE';
  return 'READY_FOR_RECEIPT_REPLAY';
}

function auditEvidenceBinding(document) {
  const primaryContentSha256 = requiredHash(
    document.primaryScan?.derivedContentSha256,
    'hybrid audit primary content hash',
  );
  const hasHybrid = document.hybridIndex != null;
  const hybridContentSha256 = hasHybrid
    ? requiredHash(document.hybridIndex.derivedContentSha256, 'hybrid audit derived content hash')
    : null;
  if (hasHybrid && document.hybridIndex.profileId !== 'hybrid-image-high-v1') {
    throw new TypeError('hybrid audit evidence profile invalid');
  }
  const processedPages = hasHybrid
    ? uniqueSortedNumbers(document.hybridIndex.processedPages ?? [])
    : [];
  if (hasHybrid && (!processedPages.length
    || processedPages.some((page) => !Number.isInteger(page) || page < 1))) {
    throw new TypeError('hybrid audit processed pages invalid');
  }
  return {
    sourcePdfSha256: requiredHash(document.sourcePdfSha256, 'hybrid audit PDF hash'),
    primaryContentSha256,
    hybridContentSha256,
    profileId: hasHybrid ? document.hybridIndex.profileId : 'pipeline-auto-v1',
    processedPages,
  };
}

export function buildHistoricalPdfImageRepairAudit({
  queue,
  historicalReference,
  extractions,
  generatedAt,
  toleranceMm = 2,
}) {
  if (!Array.isArray(queue?.documents) || !SHA256.test(String(queue.semanticQueueSha256 ?? ''))) {
    throw new TypeError('historical PDF image repair queue required');
  }
  if (!Array.isArray(historicalReference?.records) || !Array.isArray(extractions)) {
    throw new TypeError('historical references and extraction outcomes required');
  }
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0 || toleranceMm > 20) {
    throw new TypeError('bounded dimension tolerance required');
  }
  const references = new Map(historicalReference.records.map((record) => [record.referenceId, record]));
  const documents = new Map(queue.documents.map((document) => [document.sourcePdfSha256, document]));
  const expected = queue.documents
    .filter((document) => document.primaryScan?.status === 'current'
      && document.linkedModels?.length > 0)
    .flatMap((document) => document.linkedModels.map((model) => (
      `${document.sourcePdfSha256}\0${model.referenceId}`
    )));
  const extractionMap = new Map(extractions.map((extraction) => [
    `${requiredHash(extraction.sourcePdfSha256, 'extraction PDF hash')}\0${requiredText(extraction.referenceId, 'extraction reference')}`,
    extraction,
  ]));
  if (extractionMap.size !== extractions.length || expected.length !== extractionMap.size
    || expected.some((key) => !extractionMap.has(key))) {
    throw new Error('hybrid audit extraction coverage mismatch');
  }
  const outcomes = expected.map((key) => {
    const extraction = extractionMap.get(key);
    const document = documents.get(extraction.sourcePdfSha256);
    const reference = references.get(extraction.referenceId);
    if (!document || !reference) throw new Error(`hybrid audit target missing: ${key}`);
    const dimensionEvidence = extraction.status === 'extracted'
      ? extractedDimensions(extraction.claims)
      : null;
    const corroborated = dimensionEvidence
      ? corroboration(reference, dimensionEvidence, toleranceMm)
      : { state: 'NOT_EVALUATED', registryDimensionsMm: null };
    const decision = auditDecision({
      extraction, document, reference, dimensions: dimensionEvidence, corroborated,
    });
    return {
      schemaVersion: 1,
      sourcePdfSha256: extraction.sourcePdfSha256,
      referenceId: extraction.referenceId,
      brand: document.linkedModels.find((model) => model.referenceId === extraction.referenceId)?.brand ?? null,
      model: document.linkedModels.find((model) => model.referenceId === extraction.referenceId)?.model ?? null,
      extractionStatus: extraction.status,
      ...(extraction.extractionProfile ? { extractionProfile: extraction.extractionProfile } : {}),
      ...(extraction.profileDimensions ? { profileDimensions: extraction.profileDimensions } : {}),
      ...(extraction.failureCode ? { failureCode: extraction.failureCode } : {}),
      ...(extraction.error ? { error: String(extraction.error).slice(0, 4096) } : {}),
      dimensionEvidence,
      dimensionsMm: fixedDimensions(dimensionEvidence),
      corroboration: corroborated,
      officialSource: officialSource(document, extraction.referenceId),
      evidenceBinding: auditEvidenceBinding(document),
      decision,
      publicationEligible: false,
    };
  }).sort((left, right) => left.referenceId.localeCompare(right.referenceId)
    || left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
  const semantic = {
    sourceQueueSha256: queue.semanticQueueSha256,
    auditScope: 'CURRENT_PRIMARY_PLUS_OPTIONAL_HYBRID',
    toleranceMm,
    outcomes,
  };
  return {
    schemaVersion: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    semanticAuditSha256: canonicalJsonSha256(semantic),
    ...semantic,
    summary: {
      targets: outcomes.length,
      documents: new Set(outcomes.map((outcome) => outcome.sourcePdfSha256)).size,
      byDecision: countBy(outcomes, (outcome) => outcome.decision),
      readyForReceiptReplay: outcomes.filter((outcome) => outcome.decision === 'READY_FOR_RECEIPT_REPLAY').length,
      publicationEligible: 0,
    },
  };
}
