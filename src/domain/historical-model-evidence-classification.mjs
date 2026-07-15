import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const ENUMS = {
  categories: ['dishwasher', 'dryer', 'fridge', 'washing_machine'],
  lifecycleStates: ['CURRENT_RETAIL', 'CATALOG_ARCHIVED', 'REGISTRY_ONLY', 'UNKNOWN_RETAIL'],
  groupTypes: ['marketing_series', 'document_family', 'parser_family', 'model_specific', 'unclassified'],
  corpusStates: ['RECEIPT_BOUND', 'CURRENT_MINERU', 'STORED_PDF', 'LEGACY_METADATA_ONLY', 'SOURCE_URL_ONLY', 'NO_SOURCE'],
  sourceAuthorities: ['OFFICIAL', 'REFERENCE', 'MIXED', 'NONE'],
  identityScopes: ['EXACT_MODEL', 'PAGE_SCOPED_EXACT', 'DOCUMENT_FAMILY', 'ALIAS_CANDIDATE', 'AMBIGUOUS', 'UNPROVEN'],
  extractionStates: ['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE', 'PARTIAL_AXIS', 'NO_DIMENSION_EXPRESSION', 'PARSER_GAP', 'NOT_PARSED'],
  conflictStates: ['NONE', 'REGISTRY_CONFLICT', 'SOURCE_CONFLICT', 'IDENTITY_CONFLICT', 'INVALID_DIMENSIONS'],
  receiptStates: ['CURRENT_VALID', 'LEGACY_UNBOUND', 'STALE_POLICY', 'NONE'],
  operationalClasses: [
    'COMPLETE_RECEIPT', 'OFFLINE_REPLAY', 'OFFLINE_PARSER_REPAIR', 'PDF_RECONVERT',
    'OFFICIAL_REACQUIRE', 'REFERENCE_REDISCOVERY', 'OFFICIAL_DISCOVERY', 'IDENTITY_RESEARCH',
    'CONFLICT_QUARANTINE', 'OFFICIAL_HTML_ONLY', 'NO_OFFICIAL_SOURCE',
  ],
  priorities: ['P0_CURRENT_RETAIL', 'P1_CATALOG_ARCHIVED', 'P2_REGISTRY_ONLY', 'P3_CONFLICT'],
};

export const CLASSIFICATION_ENUMS = Object.freeze(Object.fromEntries(
  Object.entries(ENUMS).map(([key, values]) => [key, Object.freeze([...values])]),
));

const CORPUS_RANK = new Map(CLASSIFICATION_ENUMS.corpusStates.map((value, index) => [value, index]));
const IDENTITY_RANK = new Map(CLASSIFICATION_ENUMS.identityScopes.map((value, index) => [value, index]));
const EXTRACTION_RANK = new Map(CLASSIFICATION_ENUMS.extractionStates.map((value, index) => [value, index]));
const RECEIPT_RANK = new Map(CLASSIFICATION_ENUMS.receiptStates.map((value, index) => [value, index]));
const UNRESOLVED_IDENTITIES = new Set(['DOCUMENT_FAMILY', 'ALIAS_CANDIDATE', 'AMBIGUOUS']);

const ACTION_BY_CLASS = Object.freeze({
  COMPLETE_RECEIPT: 'NO_ACTION',
  OFFLINE_REPLAY: 'REPLAY_CURRENT_MINERU',
  OFFLINE_PARSER_REPAIR: 'REPAIR_SHARED_GRAMMAR',
  PDF_RECONVERT: 'CONVERT_STORED_PDF',
  OFFICIAL_REACQUIRE: 'REACQUIRE_OFFICIAL_SOURCE',
  REFERENCE_REDISCOVERY: 'REDISCOVER_OFFICIAL_SOURCE',
  OFFICIAL_DISCOVERY: 'DISCOVER_OFFICIAL_SOURCE',
  IDENTITY_RESEARCH: 'RUN_IDENTITY_CLOSURE',
  CONFLICT_QUARANTINE: 'RUN_CONFLICT_CLOSURE',
  OFFICIAL_HTML_ONLY: 'RECORD_NO_PDF_HTML_TERMINAL',
  NO_OFFICIAL_SOURCE: 'RECORD_NO_SOURCE_TERMINAL',
});

export const DEFAULT_CLASSIFICATION_POLICY = Object.freeze({
  schemaVersion: 1,
  policyVersion: 'historical-model-evidence-classification-v1',
  expectedReferenceCount: 8095,
  blockingConflicts: Object.freeze(['SOURCE_CONFLICT', 'IDENTITY_CONFLICT', 'INVALID_DIMENSIONS']),
  receiptEligibleAuthorities: Object.freeze(['OFFICIAL']),
  exactIdentityScopes: Object.freeze(['EXACT_MODEL', 'PAGE_SCOPED_EXACT']),
  completeExtractionStates: Object.freeze(['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE']),
  currentReceiptState: 'CURRENT_VALID',
  lifecyclePriorities: Object.freeze({
    CURRENT_RETAIL: 'P0_CURRENT_RETAIL',
    CATALOG_ARCHIVED: 'P1_CATALOG_ARCHIVED',
    REGISTRY_ONLY: 'P2_REGISTRY_ONLY',
    UNKNOWN_RETAIL: 'P2_REGISTRY_ONLY',
  }),
  conflictPriority: 'P3_CONFLICT',
  actions: ACTION_BY_CLASS,
});

function requireEnum(value, values, label) {
  if (!values.includes(value)) throw new TypeError(`invalid ${label}: ${value}`);
  return value;
}

function requireString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function requireSha256(value, label) {
  const hash = String(value ?? '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(hash)) throw new TypeError(`${label} must be a SHA-256`);
  return hash;
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeStrings(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return [...new Set(values.map((value) => requireString(value, label)))].sort();
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]
    .sort((left, right) => String(left).localeCompare(String(right)));
}

function normalizeDocumentLink(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('document link must be an object');
  }
  return {
    documentId: requireString(value.documentId, 'documentId'),
    ...(value.sourceUrl ? { sourceUrl: requireString(value.sourceUrl, 'sourceUrl') } : {}),
    evidenceObjectIds: normalizeStrings(value.evidenceObjectIds ?? [], 'evidence object ID'),
    reasonCodes: normalizeStrings(value.reasonCodes ?? [], 'reason code'),
    corpusState: requireEnum(value.corpusState, CLASSIFICATION_ENUMS.corpusStates, 'corpus state'),
    sourceAuthority: requireEnum(value.sourceAuthority, CLASSIFICATION_ENUMS.sourceAuthorities, 'source authority'),
    identityScope: requireEnum(value.identityScope, CLASSIFICATION_ENUMS.identityScopes, 'identity scope'),
    extractionState: requireEnum(value.extractionState, CLASSIFICATION_ENUMS.extractionStates, 'extraction state'),
    receiptState: requireEnum(value.receiptState, CLASSIFICATION_ENUMS.receiptStates, 'receipt state'),
    ...(value.sourcePdfSha256 ? { sourcePdfSha256: requireSha256(value.sourcePdfSha256, 'source PDF hash') } : {}),
    ...(value.grammarProfileId ? { grammarProfileId: requireString(value.grammarProfileId, 'grammar profile ID') } : {}),
  };
}

function strongest(values, rank, fallback) {
  return values.reduce((best, value) => (rank.get(value) < rank.get(best) ? value : best), fallback);
}

function aggregateAuthority(links) {
  const values = new Set(links.map((entry) => entry.sourceAuthority).filter((value) => value !== 'NONE'));
  if (values.has('MIXED') || (values.has('OFFICIAL') && values.has('REFERENCE'))) return 'MIXED';
  if (values.has('OFFICIAL')) return 'OFFICIAL';
  if (values.has('REFERENCE')) return 'REFERENCE';
  return 'NONE';
}

function aggregateIdentityScope(links, policy) {
  const currentExactReceipt = links.find((entry) => (
    entry.receiptState === policy.currentReceiptState
    && policy.receiptEligibleAuthorities.includes(entry.sourceAuthority)
    && policy.exactIdentityScopes.includes(entry.identityScope)
    && policy.completeExtractionStates.includes(entry.extractionState)
    && hasExplicitEvidence(entry)
  ));
  if (currentExactReceipt) return currentExactReceipt.identityScope;

  const unresolvedPrecedence = ['AMBIGUOUS', 'ALIAS_CANDIDATE', 'DOCUMENT_FAMILY'];
  const unresolved = unresolvedPrecedence.find((scope) => links.some((entry) => entry.identityScope === scope));
  if (unresolved) return unresolved;
  return strongest(links.map((entry) => entry.identityScope), IDENTITY_RANK, 'UNPROVEN');
}

function hasExplicitEvidence(link) {
  return link.evidenceObjectIds.length > 0 && link.reasonCodes.length > 0;
}

export function validateHistoricalModelEvidenceClassificationPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('classification policy must be an object');
  }
  if (value.schemaVersion !== 1) throw new TypeError('classification policy schemaVersion 1 required');
  const policy = {
    schemaVersion: 1,
    policyVersion: requireString(value.policyVersion, 'classification policy version'),
    expectedReferenceCount: Number(value.expectedReferenceCount),
    blockingConflicts: normalizeStrings(value.blockingConflicts, 'blocking conflict'),
    receiptEligibleAuthorities: normalizeStrings(value.receiptEligibleAuthorities, 'receipt authority'),
    exactIdentityScopes: normalizeStrings(value.exactIdentityScopes, 'exact identity scope'),
    completeExtractionStates: normalizeStrings(value.completeExtractionStates, 'complete extraction state'),
    currentReceiptState: requireEnum(value.currentReceiptState, CLASSIFICATION_ENUMS.receiptStates, 'current receipt state'),
    lifecyclePriorities: structuredClone(value.lifecyclePriorities ?? {}),
    conflictPriority: requireEnum(value.conflictPriority, CLASSIFICATION_ENUMS.priorities, 'conflict priority'),
    actions: structuredClone(value.actions ?? {}),
  };
  if (!Number.isSafeInteger(policy.expectedReferenceCount) || policy.expectedReferenceCount < 1) {
    throw new TypeError('classification policy expectedReferenceCount must be a positive safe integer');
  }
  for (const conflict of policy.blockingConflicts) requireEnum(conflict, CLASSIFICATION_ENUMS.conflictStates, 'blocking conflict');
  for (const authority of policy.receiptEligibleAuthorities) requireEnum(authority, CLASSIFICATION_ENUMS.sourceAuthorities, 'receipt authority');
  for (const scope of policy.exactIdentityScopes) requireEnum(scope, CLASSIFICATION_ENUMS.identityScopes, 'exact identity scope');
  for (const state of policy.completeExtractionStates) requireEnum(state, CLASSIFICATION_ENUMS.extractionStates, 'complete extraction state');
  for (const lifecycle of CLASSIFICATION_ENUMS.lifecycleStates) {
    requireEnum(policy.lifecyclePriorities[lifecycle], CLASSIFICATION_ENUMS.priorities, `${lifecycle} lifecycle priority`);
  }
  for (const operationalClass of CLASSIFICATION_ENUMS.operationalClasses) {
    requireString(policy.actions[operationalClass], `${operationalClass} action`);
  }
  return policy;
}

function lifecyclePriority(lifecycleState, conflictState, policy) {
  if (policy.blockingConflicts.includes(conflictState)) return policy.conflictPriority;
  return policy.lifecyclePriorities[lifecycleState];
}

function selectOperationalClass(links, conflictState, terminalState, policy) {
  if (policy.blockingConflicts.includes(conflictState)) return 'CONFLICT_QUARANTINE';
  if (terminalState === 'OFFICIAL_HTML_ONLY') return 'OFFICIAL_HTML_ONLY';
  if (terminalState === 'NO_OFFICIAL_SOURCE') return 'NO_OFFICIAL_SOURCE';

  const exactOfficial = links.filter((entry) => policy.receiptEligibleAuthorities.includes(entry.sourceAuthority)
    && policy.exactIdentityScopes.includes(entry.identityScope));
  const failedReceiptReplay = exactOfficial.find((entry) => (
    entry.reasonCodes.some((code) => code.startsWith('CURRENT_RECEIPT_REPLAY_FAILED_'))
  ));
  if (failedReceiptReplay) {
    if (!hasExplicitEvidence(failedReceiptReplay)) {
      throw new TypeError('failed receipt replay requires an evidence object ID and reason code');
    }
    return 'OFFLINE_PARSER_REPAIR';
  }
  const completeReceipt = exactOfficial.find((entry) => entry.receiptState === policy.currentReceiptState
    && policy.completeExtractionStates.includes(entry.extractionState));
  if (completeReceipt) {
    if (!hasExplicitEvidence(completeReceipt)) {
      throw new TypeError('current receipt requires an evidence object ID and reason code');
    }
    return 'COMPLETE_RECEIPT';
  }

  const replay = exactOfficial.find((entry) => entry.corpusState === 'CURRENT_MINERU'
    && policy.completeExtractionStates.includes(entry.extractionState));
  if (replay) {
    if (!hasExplicitEvidence(replay)) throw new TypeError('offline replay requires an evidence object ID and reason code');
    return 'OFFLINE_REPLAY';
  }
  if (exactOfficial.some((entry) => entry.corpusState === 'CURRENT_MINERU')) return 'OFFLINE_PARSER_REPAIR';

  if (links.some((entry) => entry.corpusState === 'STORED_PDF')) return 'PDF_RECONVERT';
  if (links.some((entry) => entry.sourceAuthority === 'OFFICIAL'
    && entry.sourceUrl)) return 'OFFICIAL_REACQUIRE';
  if (links.some((entry) => UNRESOLVED_IDENTITIES.has(entry.identityScope))) return 'IDENTITY_RESEARCH';
  if (links.some((entry) => ['REFERENCE', 'MIXED'].includes(entry.sourceAuthority))) return 'REFERENCE_REDISCOVERY';
  return 'OFFICIAL_DISCOVERY';
}

export function classifyHistoricalModelEvidence(input) {
  const record = input?.reference;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('historical reference is required');
  }
  const policy = validateHistoricalModelEvidenceClassificationPolicy(input?.policy ?? DEFAULT_CLASSIFICATION_POLICY);
  const category = requireEnum(record.category, CLASSIFICATION_ENUMS.categories, 'category');
  const lifecycleState = requireEnum(record.lifecycleState, CLASSIFICATION_ENUMS.lifecycleStates, 'lifecycle state');
  const conflictState = requireEnum(input?.conflictState ?? 'NONE', CLASSIFICATION_ENUMS.conflictStates, 'conflict state');
  const terminalState = input?.terminalState ?? null;
  if (terminalState !== null && !['OFFICIAL_HTML_ONLY', 'NO_OFFICIAL_SOURCE'].includes(terminalState)) {
    throw new TypeError(`invalid terminal state: ${terminalState}`);
  }
  const links = (input?.documentLinks ?? []).map(normalizeDocumentLink)
    .sort((left, right) => left.documentId.localeCompare(right.documentId)
      || (left.sourcePdfSha256 ?? '').localeCompare(right.sourcePdfSha256 ?? ''));
  const documentIds = new Set();
  for (const link of links) {
    if (documentIds.has(link.documentId)) throw new Error(`duplicate document link: ${link.documentId}`);
    documentIds.add(link.documentId);
  }
  const operationalClass = selectOperationalClass(links, conflictState, terminalState, policy);
  const corpusValues = links.map((entry) => entry.corpusState);
  const extractionValues = links.map((entry) => entry.extractionState);
  const receiptValues = links.map((entry) => entry.receiptState);

  return {
    schemaVersion: 1,
    referenceId: requireString(record.referenceId, 'referenceId'),
    category,
    canonicalBrand: requireString(record.brand, 'brand'),
    model: requireString(record.model, 'model'),
    lifecycleState,
    groupType: requireEnum(input?.groupType ?? 'unclassified', CLASSIFICATION_ENUMS.groupTypes, 'group type'),
    groupName: input?.groupName ? requireString(input.groupName, 'group name') : null,
    bestCorpusState: strongest(corpusValues, CORPUS_RANK, 'NO_SOURCE'),
    sourceAuthority: aggregateAuthority(links),
    identityScope: aggregateIdentityScope(links, policy),
    extractionState: strongest(extractionValues, EXTRACTION_RANK, 'NOT_PARSED'),
    conflictState,
    receiptState: strongest(receiptValues, RECEIPT_RANK, 'NONE'),
    corpusSummary: countBy(links, (entry) => entry.corpusState),
    documentLinks: links,
    operationalClass,
    nextAction: policy.actions[operationalClass],
    priority: lifecyclePriority(lifecycleState, conflictState, policy),
  };
}

function normalizeGroup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('classification group must be an object');
  return {
    groupType: requireEnum(value.groupType, CLASSIFICATION_ENUMS.groupTypes, 'group type'),
    groupName: requireString(value.groupName, 'group name'),
    grammarProfileIds: normalizeStrings(value.grammarProfileIds ?? [], 'grammar profile ID'),
  };
}

function referenceConflictState(reference, explicit) {
  if (explicit) return requireEnum(explicit, CLASSIFICATION_ENUMS.conflictStates, 'conflict state');
  if (['INVALID_DIMENSIONS', 'AXIS_SUSPECT'].includes(reference.evidenceState)) return 'INVALID_DIMENSIONS';
  if (reference.evidenceState === 'INTERNAL_CONFLICT') return 'REGISTRY_CONFLICT';
  return 'NONE';
}

function linksFor(value, referenceId) {
  if (value instanceof Map) return value.get(referenceId) ?? [];
  return value?.[referenceId] ?? [];
}

function compareClassificationRecords(left, right) {
  return left.category.localeCompare(right.category)
    || left.canonicalBrand.localeCompare(right.canonicalBrand)
    || left.model.localeCompare(right.model)
    || left.referenceId.localeCompare(right.referenceId);
}

export function buildHistoricalModelEvidenceClassification(input) {
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const policy = validateHistoricalModelEvidenceClassificationPolicy(input?.policy ?? DEFAULT_CLASSIFICATION_POLICY);
  const references = Array.isArray(input?.historicalRecords) ? input.historicalRecords : [];
  if (references.length !== policy.expectedReferenceCount) {
    throw new Error(`historical classification expected ${policy.expectedReferenceCount} records; found ${references.length}`);
  }
  const referenceIds = new Set();
  for (const reference of references) {
    const id = requireString(reference.referenceId, 'referenceId');
    if (referenceIds.has(id)) throw new Error(`duplicate reference ID: ${id}`);
    referenceIds.add(id);
  }
  for (const collection of [input?.linksByReference, input?.groupsByReference, input?.conflictsByReference]) {
    if (!collection || collection instanceof Map) continue;
    for (const referenceId of Object.keys(collection)) {
      if (!referenceIds.has(referenceId)) throw new Error(`classification input references unknown model: ${referenceId}`);
    }
  }

  const records = references.map((reference) => {
    const groups = (linksFor(input?.groupsByReference, reference.referenceId) ?? [])
      .map(normalizeGroup)
      .sort((left, right) => left.groupType.localeCompare(right.groupType)
        || left.groupName.localeCompare(right.groupName));
    const primary = groups.find((entry) => entry.groupType === 'marketing_series')
      ?? groups.find((entry) => entry.groupType === 'document_family')
      ?? groups.find((entry) => entry.groupType === 'parser_family')
      ?? groups[0]
      ?? null;
    const conflictState = referenceConflictState(
      reference,
      input?.conflictsByReference instanceof Map
        ? input.conflictsByReference.get(reference.referenceId)
        : input?.conflictsByReference?.[reference.referenceId],
    );
    const classified = classifyHistoricalModelEvidence({
      reference,
      policy,
      conflictState,
      documentLinks: linksFor(input?.linksByReference, reference.referenceId),
      groupType: primary?.groupType ?? 'unclassified',
      groupName: primary?.groupName ?? null,
    });
    return {
      ...classified,
      rawBrandVariants: sortedUnique((reference.rawIdentityVariants ?? []).map((entry) => entry.brand)),
      groups,
      grammarProfileIds: sortedUnique([
        ...groups.flatMap((entry) => entry.grammarProfileIds),
        ...classified.documentLinks.map((entry) => entry.grammarProfileId).filter(Boolean),
      ]),
    };
  }).sort(compareClassificationRecords);

  const categorySummaries = CLASSIFICATION_ENUMS.categories.map((category) => {
    const categoryRecords = records.filter((record) => record.category === category);
    return {
      category,
      records: categoryRecords.length,
      brands: new Set(categoryRecords.map((record) => record.canonicalBrand)).size,
      documentLinks: categoryRecords.reduce((sum, record) => sum + record.documentLinks.length, 0),
      byOperationalClass: countBy(categoryRecords, (record) => record.operationalClass),
    };
  });
  const groupedGaps = new Map();
  for (const record of records.filter((entry) => entry.operationalClass !== 'COMPLETE_RECEIPT')) {
    const key = `${record.category}\0${record.canonicalBrand}\0${record.operationalClass}`;
    groupedGaps.set(key, (groupedGaps.get(key) ?? 0) + 1);
  }
  const topGaps = [...groupedGaps].map(([key, models]) => {
    const [category, brand, operationalClass] = key.split('\0');
    return { category, brand, operationalClass, models };
  }).sort((left, right) => right.models - left.models
    || left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand)
    || left.operationalClass.localeCompare(right.operationalClass)).slice(0, 50);

  const summary = {
    records: records.length,
    uniqueReferenceIds: referenceIds.size,
    documentLinks: records.reduce((sum, record) => sum + record.documentLinks.length, 0),
    modelsWithDocumentLinks: records.filter((record) => record.documentLinks.length > 0).length,
    modelsWithoutDocumentLinks: records.filter((record) => record.documentLinks.length === 0).length,
    byCategory: countBy(records, (record) => record.category),
    byLifecycle: countBy(records, (record) => record.lifecycleState),
    byOperationalClass: countBy(records, (record) => record.operationalClass),
    byNextAction: countBy(records, (record) => record.nextAction),
    bySourceAuthority: countBy(records, (record) => record.sourceAuthority),
    byIdentityScope: countBy(records, (record) => record.identityScope),
    byExtractionState: countBy(records, (record) => record.extractionState),
    byConflictState: countBy(records, (record) => record.conflictState),
    byReceiptState: countBy(records, (record) => record.receiptState),
  };
  const semantic = {
    schemaVersion: 1,
    policyVersion: policy.policyVersion,
    summary,
    categorySummaries,
    topGaps,
    records,
  };
  return {
    schemaVersion: 1,
    generatedAt,
    policyVersion: policy.policyVersion,
    semanticClassificationSha256: canonicalJsonSha256(semantic),
    summary,
    categorySummaries,
    topGaps,
    records,
  };
}

function markdownTable(headers, rows) {
  const line = (values) => `| ${values.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function renderHistoricalModelEvidenceClassificationMarkdown(snapshot) {
  const summary = snapshot?.summary;
  if (!summary || !Array.isArray(snapshot?.records)) throw new TypeError('classification snapshot required');
  const groups = new Map();
  for (const record of snapshot.records) {
    for (const group of record.groups ?? []) {
      const key = `${record.category}\0${record.canonicalBrand}\0${group.groupType}\0${group.groupName}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  }
  const groupRows = [...groups].map(([key, models]) => [...key.split('\0'), String(models)])
    .sort((left, right) => Number(right[4]) - Number(left[4]) || left.join('\0').localeCompare(right.join('\0')))
    .slice(0, 40);
  const lines = [
    '# Historical Model Evidence Classification',
    '',
    `Generated: ${snapshot.generatedAt}`,
    '',
    `Coverage: **${summary.records.toLocaleString('en-AU')} / ${summary.uniqueReferenceIds.toLocaleString('en-AU')}** unique historical models.`,
    `Models with document links: **${summary.modelsWithDocumentLinks.toLocaleString('en-AU')}**; without links: **${summary.modelsWithoutDocumentLinks.toLocaleString('en-AU')}**.`,
    '',
    'This is a research and repair classification. It does not grant publication authority.',
    '',
    '## Category Coverage',
    '',
    markdownTable(
      ['Category', 'Models', 'Brands', 'Document links'],
      (snapshot.categorySummaries ?? []).map((entry) => [entry.category, String(entry.records), String(entry.brands), String(entry.documentLinks)]),
    ),
    '',
    '## Operational Classes',
    '',
    markdownTable(['Class', 'Models'], Object.entries(summary.byOperationalClass).map(([key, value]) => [key, String(value)])),
    '',
    '## Observed Brand / Series / PDF Grammar Groups',
    '',
    groupRows.length ? markdownTable(['Category', 'Brand', 'Group type', 'Group', 'Models'], groupRows) : 'No groups observed.',
    '',
    '## Highest-Impact Gaps',
    '',
    markdownTable(
      ['Category', 'Brand', 'Class', 'Models'],
      (snapshot.topGaps ?? []).map((entry) => [entry.category, entry.brand, entry.operationalClass, String(entry.models)]),
    ),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function buildHistoricalModelPdfBaseline(input) {
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const records = input?.historicalReference?.records;
  if (!Array.isArray(records)) throw new TypeError('historical reference records are required');
  const expectedReferenceCount = input?.expectedReferenceCount ?? DEFAULT_CLASSIFICATION_POLICY.expectedReferenceCount;
  if (!Number.isSafeInteger(expectedReferenceCount) || expectedReferenceCount < 1) {
    throw new TypeError('expected reference count must be a positive safe integer');
  }
  if (records.length !== expectedReferenceCount) {
    throw new Error(`historical reference expected ${expectedReferenceCount} records; found ${records.length}`);
  }
  const referenceIds = new Set();
  for (const record of records) {
    const id = requireString(record.referenceId, 'referenceId');
    if (referenceIds.has(id)) throw new Error(`duplicate reference ID: ${id}`);
    referenceIds.add(id);
    requireEnum(record.category, CLASSIFICATION_ENUMS.categories, 'category');
    requireEnum(record.lifecycleState, CLASSIFICATION_ENUMS.lifecycleStates, 'lifecycle state');
  }

  const artifactHashes = Object.fromEntries(Object.entries(input?.artifactHashes ?? {})
    .map(([name, hash]) => [requireString(name, 'artifact hash name'), requireSha256(hash, `${name} artifact hash`)])
    .sort(([left], [right]) => left.localeCompare(right)));
  const pdfEntries = input?.pdfInventory?.entries ?? [];
  const invalidFiles = input?.pdfInventory?.invalidFiles ?? [];
  const seenPdfHashes = new Set();
  const normalizedPdfEntries = [];
  let validPhysicalFiles = 0;
  for (const entry of pdfEntries) {
    const hash = requireSha256(entry.sourcePdfSha256, 'PDF source hash');
    if (seenPdfHashes.has(hash)) throw new Error(`duplicate PDF inventory hash: ${hash}`);
    seenPdfHashes.add(hash);
    const paths = normalizeStrings(entry.paths ?? [], 'PDF path');
    if (paths.length === 0) throw new TypeError(`PDF inventory paths required: ${hash}`);
    validPhysicalFiles += paths.length;
    normalizedPdfEntries.push({
      sourcePdfSha256: hash,
      byteSize: Number(entry.byteSize ?? 0),
      paths,
    });
  }
  const mineruIndexes = Array.isArray(input?.mineruIndexes) ? input.mineruIndexes : [];
  const receiptEntries = input?.acceptanceBundle?.entries ?? [];
  for (const entry of receiptEntries) {
    if (!referenceIds.has(entry.referenceId)) {
      throw new Error(`receipt reference missing from historical reference: ${entry.referenceId}`);
    }
  }

  const summary = {
    models: {
      total: records.length,
      byCategory: countBy(records, (record) => record.category),
      byLifecycle: countBy(records, (record) => record.lifecycleState),
      byEvidenceState: countBy(records, (record) => String(record.evidenceState ?? 'UNKNOWN')),
      byLookupAction: countBy(records, (record) => String(record.lookupAction ?? 'UNKNOWN')),
    },
    legacySummaries: { files: (input?.legacySummaries ?? []).length },
    sourceDocuments: { records: (input?.sourceDocuments ?? []).length },
    pdfs: {
      physicalFiles: validPhysicalFiles + invalidFiles.length,
      validPhysicalFiles,
      uniqueDocuments: pdfEntries.length,
      duplicatePhysicalFiles: validPhysicalFiles - pdfEntries.length,
      invalidFiles: invalidFiles.length,
    },
    mineru: {
      indexes: mineruIndexes.length,
      byStatus: countBy(mineruIndexes, (entry) => String(entry.status ?? 'unknown')),
    },
    receipts: {
      entries: receiptEntries.length,
      uniqueReferences: new Set(receiptEntries.map((entry) => entry.referenceId)).size,
    },
    projections: structuredClone(input?.projections ?? {}),
  };
  const semantic = {
    schemaVersion: 1,
    expectedReferenceCount,
    artifactHashes,
    sourceSnapshotHashes: structuredClone(input?.historicalReference?.sourceSnapshotHashes ?? {}),
    summary,
    referenceIds: [...referenceIds].sort(),
    pdfDocuments: normalizedPdfEntries.sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256)),
    invalidPdfFiles: invalidFiles.map((entry) => ({
      relativePath: String(entry.relativePath ?? ''),
      error: String(entry.error ?? 'invalid PDF'),
    })).sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    mineruIndexes: mineruIndexes.map((entry) => ({
      sourcePdfSha256: requireSha256(entry.sourcePdfSha256, 'MinerU source PDF hash'),
      status: String(entry.status ?? 'unknown'),
      parserVersion: entry.parserVersion ?? null,
      modelRevision: entry.modelRevision ?? null,
    })).sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256)),
    receiptTargets: receiptEntries.map((entry) => ({
      targetId: requireString(entry.targetId, 'receipt targetId'),
      referenceId: requireString(entry.referenceId, 'receipt referenceId'),
    })).sort((left, right) => left.targetId.localeCompare(right.targetId)),
  };

  return {
    schemaVersion: 1,
    generatedAt,
    semanticBaselineSha256: canonicalJsonSha256(semantic),
    artifactHashes,
    sourceSnapshotHashes: semantic.sourceSnapshotHashes,
    summary,
    environment: structuredClone(input?.environment ?? {}),
    semantic,
  };
}
