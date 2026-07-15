import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXACT_SCOPES = new Set(['EXACT_MODEL', 'PAGE_SCOPED_EXACT']);
const COMPLETE_EXTRACTIONS = new Set(['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE']);

function requireString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function normalizedHash(value) {
  const hash = String(value ?? '').trim().toLowerCase();
  return SHA256_PATTERN.test(hash) ? hash : null;
}

function exactKey(category, brand, model) {
  return `${String(category ?? '').toLowerCase()}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]
    .sort((left, right) => String(left).localeCompare(String(right)));
}

function addToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function sourceDocumentAuthority(document) {
  if (document?.authorType === 'manufacturer' && document?.transportHostType === 'manufacturer') return 'OFFICIAL';
  if (document?.transportHostType === 'retailer') return 'REFERENCE';
  return 'NONE';
}

function aggregateAuthority(values) {
  const set = new Set(values.filter((value) => value && value !== 'NONE'));
  if (set.has('MIXED') || (set.has('OFFICIAL') && set.has('REFERENCE'))) return 'MIXED';
  if (set.has('OFFICIAL')) return 'OFFICIAL';
  if (set.has('REFERENCE')) return 'REFERENCE';
  return 'NONE';
}

function aggregateIdentity(values) {
  if (values.includes('PAGE_SCOPED_EXACT')) return 'PAGE_SCOPED_EXACT';
  if (values.includes('EXACT_MODEL')) return 'EXACT_MODEL';
  if (values.includes('DOCUMENT_FAMILY')) return 'DOCUMENT_FAMILY';
  if (values.includes('ALIAS_CANDIDATE')) return 'ALIAS_CANDIDATE';
  if (values.includes('AMBIGUOUS')) return 'AMBIGUOUS';
  return 'UNPROVEN';
}

function aggregateExtraction(values) {
  if (values.includes('ALL_AXIS_SCALAR')) return 'ALL_AXIS_SCALAR';
  if (values.includes('ALL_AXIS_RANGE')) return 'ALL_AXIS_RANGE';
  if (values.includes('PARTIAL_AXIS')) return 'PARTIAL_AXIS';
  if (values.includes('PARSER_GAP')) return 'PARSER_GAP';
  if (values.includes('NO_DIMENSION_EXPRESSION')) return 'NO_DIMENSION_EXPRESSION';
  return 'NOT_PARSED';
}

function modelLinksFromSourceDocument(document, referencesByCatalogId) {
  const references = [];
  for (const link of document?.productLinks ?? []) {
    for (const reference of referencesByCatalogId.get(link.legacyRuntimeId) ?? []) references.push(reference);
  }
  return sortedUnique(references.map((entry) => entry.referenceId)).map((referenceId) => {
    const reference = references.find((entry) => entry.referenceId === referenceId);
    // Product-link metadata proves association, not that the PDF body names the exact SKU.
    // Only MinerU grammar evidence or a current receipt may upgrade this scope.
    const scope = document.identityOutcome === 'alias' ? 'ALIAS_CANDIDATE' : 'UNPROVEN';
    return {
      referenceId,
      category: reference.category,
      brand: reference.brand,
      model: reference.model,
      identityScope: scope,
      extractionState: 'NOT_PARSED',
      linkBasis: 'SOURCE_DOCUMENT_PRODUCT_LINK',
    };
  });
}

function normalizeGrammarDocument(value, referencesByExactKey) {
  const sourcePdfSha256 = normalizedHash(value?.sourcePdfSha256);
  if (!sourcePdfSha256) throw new TypeError('grammar document source PDF hash required');
  const modelLinks = [];
  for (const link of value.modelLinks ?? []) {
    const reference = referencesByExactKey.get(exactKey(link.category, link.brand, link.model));
    if (!reference) continue;
    modelLinks.push({
      referenceId: reference.referenceId,
      category: reference.category,
      brand: reference.brand,
      model: reference.model,
      identityScope: link.identityScope ?? 'UNPROVEN',
      extractionState: link.extractionState ?? value.extractionState ?? 'NOT_PARSED',
      linkBasis: 'MINERU_GRAMMAR_OBSERVATION',
    });
  }
  return {
    sourcePdfSha256,
    extractionState: value.extractionState ?? 'NOT_PARSED',
    grammarProfileIds: sortedUnique(value.grammarProfileIds ?? []),
    modelLinks,
  };
}

function deduplicateModelLinks(links) {
  const byReference = new Map();
  for (const link of links) {
    const current = byReference.get(link.referenceId);
    if (!current) {
      byReference.set(link.referenceId, link);
      continue;
    }
    const identityScope = aggregateIdentity([current.identityScope, link.identityScope]);
    const extractionState = aggregateExtraction([current.extractionState, link.extractionState]);
    const strongestIdentity = current.identityScope === identityScope ? current : link;
    byReference.set(link.referenceId, {
      ...strongestIdentity,
      identityScope,
      extractionState,
      linkBasis: sortedUnique([current.linkBasis, link.linkBasis]).join('+'),
    });
  }
  return [...byReference.values()].sort((left, right) => left.referenceId.localeCompare(right.referenceId));
}

function repairActionFor(document) {
  if (!document.mineruIndex) return 'CONVERT_STORED_PDF';
  if (document.mineruIndex.status !== 'indexed') return 'RECONVERT_STORED_PDF';
  if (!document.modelLinks.length) return 'IDENTITY_RESEARCH';
  if (!EXACT_SCOPES.has(document.identityScope)) return 'IDENTITY_RESEARCH';
  if (document.receiptTargetIds.length > 0) return 'NO_ACTION';
  if (document.sourceAuthority !== 'OFFICIAL') return 'REFERENCE_REDISCOVERY';
  const exactLinks = document.modelLinks.filter((entry) => EXACT_SCOPES.has(entry.identityScope));
  if (exactLinks.length && exactLinks.every((entry) => COMPLETE_EXTRACTIONS.has(entry.extractionState))) {
    return 'OFFLINE_REPLAY';
  }
  return 'OFFLINE_PARSER_REPAIR';
}

export function buildLegacyPdfLibraryAudit(input) {
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const historicalRecords = Array.isArray(input?.historicalRecords) ? input.historicalRecords : [];
  const referencesByExactKey = new Map();
  const referencesByCatalogId = new Map();
  const referencesById = new Map();
  for (const reference of historicalRecords) {
    const referenceId = requireString(reference.referenceId, 'historical reference ID');
    if (referencesById.has(referenceId)) throw new Error(`duplicate historical reference: ${referenceId}`);
    referencesById.set(referenceId, reference);
    referencesByExactKey.set(exactKey(reference.category, reference.brand, reference.model), reference);
    for (const productId of reference.catalogProductIds ?? []) addToMap(referencesByCatalogId, productId, reference);
  }

  const sourceDocuments = Array.isArray(input?.sourceDocuments) ? input.sourceDocuments : [];
  const sourceByHash = new Map();
  const sourceByUrl = new Map();
  const sourceByProductId = new Map();
  const sourceModelLinks = new Map();
  for (const document of sourceDocuments) {
    const id = requireString(document.id, 'source document ID');
    const hash = normalizedHash(document.sha256);
    if (hash) addToMap(sourceByHash, hash, document);
    for (const url of sortedUnique([normalizedUrl(document.sourceUrl), normalizedUrl(document.finalUrl)])) addToMap(sourceByUrl, url, document);
    for (const link of document.productLinks ?? []) {
      addToMap(sourceByProductId, link.legacyRuntimeId, document);
      addToMap(sourceByProductId, link.canonicalProductId, document);
    }
    sourceModelLinks.set(id, modelLinksFromSourceDocument(document, referencesByCatalogId));
  }

  const grammarByHash = new Map((input?.grammarDocuments ?? []).map((entry) => {
    const normalized = normalizeGrammarDocument(entry, referencesByExactKey);
    return [normalized.sourcePdfSha256, normalized];
  }));
  const mineruByHash = new Map();
  for (const index of input?.mineruIndexes ?? []) {
    const hash = normalizedHash(index.sourcePdfSha256);
    if (!hash) throw new TypeError('MinerU index source PDF hash required');
    if (mineruByHash.has(hash)) throw new Error(`duplicate MinerU index: ${hash}`);
    mineruByHash.set(hash, structuredClone(index));
  }
  const receiptsByHash = new Map();
  for (const entry of input?.receiptEntries ?? []) {
    for (const source of entry.sources ?? []) {
      const hash = normalizedHash(source.contentSha256);
      if (!hash) continue;
      addToMap(receiptsByHash, hash, { targetId: entry.targetId, referenceId: entry.referenceId });
    }
  }

  const pdfHashes = new Set();
  const pdfDocuments = (input?.pdfInventory?.entries ?? []).map((pdf) => {
    const sourcePdfSha256 = normalizedHash(pdf.sourcePdfSha256);
    if (!sourcePdfSha256) throw new TypeError('physical PDF source hash required');
    if (pdfHashes.has(sourcePdfSha256)) throw new Error(`duplicate physical PDF hash: ${sourcePdfSha256}`);
    pdfHashes.add(sourcePdfSha256);
    const documents = sourceByHash.get(sourcePdfSha256) ?? [];
    const grammar = grammarByHash.get(sourcePdfSha256);
    const receipts = receiptsByHash.get(sourcePdfSha256) ?? [];
    const modelLinks = deduplicateModelLinks([
      ...documents.flatMap((document) => sourceModelLinks.get(document.id) ?? []),
      ...(grammar?.modelLinks ?? []),
      ...receipts.map((receipt) => {
        const reference = referencesById.get(receipt.referenceId);
        return reference ? {
          referenceId: reference.referenceId,
          category: reference.category,
          brand: reference.brand,
          model: reference.model,
          identityScope: 'EXACT_MODEL',
          extractionState: grammar?.extractionState ?? 'NOT_PARSED',
          linkBasis: 'CURRENT_RECEIPT',
        } : null;
      }).filter(Boolean),
    ]);
    const sourceAuthority = aggregateAuthority([
      ...documents.map(sourceDocumentAuthority),
      ...(receipts.length ? ['OFFICIAL'] : []),
    ]);
    const identityScope = aggregateIdentity([
      ...modelLinks.map((entry) => entry.identityScope),
    ]);
    const document = {
      sourcePdfSha256,
      byteSize: Number(pdf.byteSize ?? 0),
      physicalPaths: sortedUnique(pdf.paths ?? []),
      sourceDocumentIds: sortedUnique(documents.map((entry) => entry.id)),
      sourceAuthority,
      identityScope,
      extractionState: aggregateExtraction(modelLinks.length
        ? modelLinks.map((entry) => entry.extractionState)
        : [grammar?.extractionState ?? 'NOT_PARSED']),
      grammarProfileIds: grammar?.grammarProfileIds ?? [],
      modelLinks,
      mineruIndex: mineruByHash.get(sourcePdfSha256) ?? null,
      receiptTargetIds: sortedUnique(receipts.map((entry) => entry.targetId)),
      legacyFieldState: documents.some((entry) => entry.parserVersion !== '3.4.4' || entry.fields?.length)
        ? 'LEGACY_UNBOUND' : 'NONE',
      issueCodes: [],
    };
    if (!documents.length && !grammar && !receipts.length) document.issueCodes.push('ORPHAN_PHYSICAL_PDF');
    if (!document.mineruIndex) document.issueCodes.push('MISSING_MINERU_INDEX');
    else if (document.mineruIndex.status !== 'indexed') document.issueCodes.push('STALE_OR_INVALID_MINERU_INDEX');
    document.repairAction = repairActionFor(document);
    return document;
  }).sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));

  const legacySummaries = (input?.legacySummaries ?? []).map((summary) => {
    const data = summary.data ?? {};
    const direct = referencesByExactKey.get(exactKey(data.category, data.brand, data.model));
    const productReferences = referencesByCatalogId.get(data.product_id) ?? [];
    const productMatchedSourceIds = new Set((sourceByProductId.get(data.product_id) ?? []).map((entry) => entry.id));
    const matchedSources = sortedUnique([
      ...productMatchedSourceIds,
      ...(sourceByUrl.get(normalizedUrl(data.source_url)) ?? []).map((entry) => entry.id),
    ]).map((id) => sourceDocuments.find((entry) => entry.id === id));
    const summaryIdentityKey = exactKey(data.category, data.brand, data.model);
    const compatibleSourceLinks = matchedSources.flatMap((document) => (
      sourceModelLinks.get(document.id) ?? []
    ).filter((link) => productMatchedSourceIds.has(document.id)
      || exactKey(link.category, link.brand, link.model) === summaryIdentityKey));
    const referenceIds = sortedUnique([
      ...(direct ? [direct.referenceId] : []),
      ...productReferences.map((entry) => entry.referenceId),
      ...compatibleSourceLinks.map((entry) => entry.referenceId),
    ]);
    const clearances = data.extracted?.clearance_requirements ?? {};
    const flags = data.extracted?.flags ?? {};
    const issueCodes = ['LEGACY_FIELDS_UNBOUND'];
    if (Object.values(clearances).some((value) => Number(value) === 0)) issueCodes.push('LEGACY_ZERO_CLEARANCE_UNTRUSTED');
    if (Object.values(flags).some((value) => typeof value === 'boolean')) issueCodes.push('LEGACY_BOOLEAN_FLAG_UNTRUSTED');
    if (matchedSources.length > 0 && compatibleSourceLinks.length === 0
      && !direct && productReferences.length === 0) issueCodes.push('LEGACY_SOURCE_IDENTITY_CONFLICT');
    if (!referenceIds.length) issueCodes.push('UNMATCHED_LEGACY_SUMMARY');
    return {
      relativePath: requireString(summary.relativePath, 'legacy summary path'),
      productId: data.product_id ?? null,
      category: data.category ?? null,
      brand: data.brand ?? null,
      model: data.model ?? null,
      modelKey: exactKey(data.category, data.brand, data.model),
      sourceUrl: normalizedUrl(data.source_url),
      sourceDocumentIds: sortedUnique(matchedSources.map((entry) => entry.id)),
      sourceAuthority: aggregateAuthority(matchedSources.map(sourceDocumentAuthority)),
      referenceIds,
      claimState: 'LEGACY_UNBOUND',
      issueCodes: sortedUnique(issueCodes),
    };
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const duplicateLegacyModelKeys = [...new Set(legacySummaries.map((entry) => entry.modelKey))]
    .map((modelKey) => ({
      modelKey,
      relativePaths: legacySummaries.filter((entry) => entry.modelKey === modelKey).map((entry) => entry.relativePath),
    }))
    .filter((entry) => entry.relativePaths.length > 1)
    .sort((left, right) => left.modelKey.localeCompare(right.modelKey));
  const orphanMineruIndexes = [...mineruByHash.values()]
    .filter((entry) => !pdfHashes.has(entry.sourcePdfSha256))
    .sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
  const physicalFiles = pdfDocuments.reduce((sum, entry) => sum + entry.physicalPaths.length, 0);
  const uniqueModelLinks = new Set(pdfDocuments.flatMap((entry) => entry.modelLinks.map((link) => link.referenceId)));

  return {
    schemaVersion: 1,
    generatedAt,
    summary: {
      physicalFiles: physicalFiles + (input?.pdfInventory?.invalidFiles ?? []).length,
      uniquePdfDocuments: pdfDocuments.length,
      duplicatePhysicalFiles: physicalFiles - pdfDocuments.length,
      invalidPdfFiles: (input?.pdfInventory?.invalidFiles ?? []).length,
      mineruIndexes: mineruByHash.size,
      orphanMineruIndexes: orphanMineruIndexes.length,
      legacySummaries: legacySummaries.length,
      matchedLegacySummaries: legacySummaries.filter((entry) => entry.referenceIds.length > 0).length,
      unmatchedLegacySummaries: legacySummaries.filter((entry) => entry.referenceIds.length === 0).length,
      sourceDocuments: sourceDocuments.length,
      modelLinks: uniqueModelLinks.size,
      byRepairAction: countBy(pdfDocuments, (entry) => entry.repairAction),
    },
    invalidPdfFiles: structuredClone(input?.pdfInventory?.invalidFiles ?? []),
    orphanMineruIndexes,
    duplicateLegacyModelKeys,
    pdfDocuments,
    legacySummaries,
  };
}
