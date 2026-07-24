import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const HASH = /^[a-f0-9]{64}$/;
const PROOF_LEVELS = new Set([
  'EXACT_MODEL_PROVEN',
  'MODEL_LIST_PROVEN',
  'FAMILY_SCOPE_ONLY',
  'ALIAS_RESEARCH',
  'UNMAPPED',
]);
const EXACT_BINDINGS = new Set([
  'SAME_FRAGMENT_EXACT_MODEL',
  'SAME_PAGE_EXACT_MODEL',
  'SAME_DOCUMENT_EXACT_MODEL',
]);
const MODEL_LIST_PATTERNS = new Set([
  'MODEL_ROW_DIMENSION_MATRIX',
  'MODEL_COLUMN_DIMENSION_MATRIX',
]);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hash(value, label) {
  const normalized = text(value).toLowerCase();
  if (!HASH.test(normalized)) throw new TypeError(`${label} must be SHA-256`);
  return normalized;
}

function identifier(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function normalizedBrand(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedModel(value) {
  return text(value).toUpperCase();
}

function exactKey(category, brand, model) {
  return `${text(category)}\0${normalizedBrand(brand)}\0${normalizedModel(model)}`;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function stableLocators(values) {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()]
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function selectedProofLevel(levels) {
  if (levels.has('EXACT_MODEL_PROVEN')) return 'EXACT_MODEL_PROVEN';
  if (levels.has('MODEL_LIST_PROVEN')) return 'MODEL_LIST_PROVEN';
  if (levels.has('ALIAS_RESEARCH')) return 'ALIAS_RESEARCH';
  if (levels.has('FAMILY_SCOPE_ONLY')) return 'FAMILY_SCOPE_ONLY';
  return 'UNMAPPED';
}

function normalizedMineruObject(indexed) {
  const object = indexed.mineruObject ?? {};
  const pdfSha256 = hash(indexed.pdfSha256, 'indexed PDF');
  const contentSha256 = indexed.contentSha256 == null
    ? null
    : hash(indexed.contentSha256, 'indexed MinerU content');
  if (object.sourcePdfSha256 !== pdfSha256) {
    throw new Error(`MinerU source PDF binding mismatch: ${pdfSha256}`);
  }
  if ((object.contentSha256 ?? null) !== contentSha256) {
    throw new Error(`MinerU content binding mismatch: ${pdfSha256}`);
  }
  if (object.format !== 'content_list_v2' || object.parserName !== 'MinerU') {
    throw new TypeError(`MinerU content_list_v2 object required: ${pdfSha256}`);
  }
  if (contentSha256 && !text(object.objectPath)) {
    throw new TypeError(`MinerU object path required: ${pdfSha256}`);
  }
  return {
    schemaVersion: Number.isInteger(object.schemaVersion) ? object.schemaVersion : 1,
    format: object.format,
    parserName: object.parserName,
    parserVersion: text(object.parserVersion) || null,
    modelRevision: text(object.modelRevision) || null,
    sourcePdfSha256: pdfSha256,
    contentSha256,
    objectPath: text(object.objectPath) || null,
    byteSize: Number.isInteger(object.byteSize) ? object.byteSize : null,
    pageCount: Number.isInteger(object.pageCount) ? object.pageCount : null,
  };
}

function validateInputs(input) {
  const historicalReference = input?.historicalReference;
  const knowledge = input?.dimensionKnowledge;
  const legacy = input?.legacyPdfAudit;
  const classification = input?.classification;
  if (historicalReference?.schemaVersion !== 1 || !Array.isArray(historicalReference.records)) {
    throw new TypeError('historical reference schema v1 required');
  }
  if (knowledge?.schemaVersion !== 4 || !Array.isArray(knowledge.indexedDocuments)
    || !Array.isArray(knowledge.categories)) {
    throw new TypeError('dimension knowledge schema v4 with indexedDocuments required');
  }
  if (legacy?.schemaVersion !== 1 || !Array.isArray(legacy.pdfDocuments)) {
    throw new TypeError('legacy PDF audit schema v1 required');
  }
  if (classification?.schemaVersion !== 1 || !Array.isArray(classification.records)) {
    throw new TypeError('historical classification schema v1 required');
  }
  const valid = knowledge.indexedDocuments.filter((document) => document.validity === 'VALID').length;
  const invalid = knowledge.indexedDocuments.filter((document) => document.validity === 'INVALID').length;
  if (knowledge.indexedDocuments.some((document) => !['VALID', 'INVALID'].includes(document.validity))
    || knowledge.summary?.mineruDocuments !== knowledge.indexedDocuments.length
    || knowledge.summary?.validMineruDocuments !== valid
    || knowledge.summary?.invalidMineruDocuments !== invalid) {
    throw new Error('dimension knowledge indexed-document accounting mismatch');
  }
}

function addEdge(edgeMaps, pdfSha256, referenceId, proofLevel, locator) {
  if (!PROOF_LEVELS.has(proofLevel) || !referenceId) return;
  const documentEdges = edgeMaps.get(pdfSha256);
  if (!documentEdges) throw new Error(`model edge references unknown indexed PDF: ${pdfSha256}`);
  const edge = documentEdges.get(referenceId) ?? { levels: new Set(), locators: [] };
  edge.levels.add(proofLevel);
  edge.locators.push(locator);
  documentEdges.set(referenceId, edge);
}

function familyIdFor(category, brand, groupType, groupName) {
  return identifier('document_family', [category, normalizedBrand(brand), groupType, groupName].join('\0'));
}

function requireFamilyPdf(pdfSha256, familyPdfSha256s, evidenceLabel, familyId) {
  if (!familyPdfSha256s.has(pdfSha256)) {
    throw new Error(`${evidenceLabel} is outside document family: ${familyId}`);
  }
}

function sourceUrl(value) {
  const normalized = text(value);
  if (!normalized) return null;
  let parsed;
  try { parsed = new URL(normalized); } catch { throw new TypeError(`invalid source URL: ${normalized}`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError(`unsupported source URL: ${normalized}`);
  }
  return parsed.toString();
}

function classificationContentLane(link) {
  const values = [...(link.evidenceObjectIds ?? []), link.sourceUrl].map(text).filter(Boolean);
  if (values.some((value) => /\.json(?:$|[?#])/i.test(value))) return 'JSON';
  if (values.some((value) => /\.html?(?:$|[?#])/i.test(value))) return 'HTML';
  if (values.some((value) => /\.pdf(?:$|[?#])/i.test(value)
    || /^(?:storage:)?evidence\/(?:objects|web)\/.*\.pdf$/i.test(value))) return 'PDF';
  return 'UNKNOWN';
}

function activeReleaseSourceBindings(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('document graph active-release source bindings invalid');
  }
  const releaseCandidateId = text(value.releaseCandidateId);
  if (!releaseCandidateId) throw new TypeError('document graph release candidate ID required');
  const hashes = Object.fromEntries([
    ['publicProjectionSha256', value.publicProjectionSha256],
    ['historicalReferenceSha256', value.historicalReferenceSha256],
    ['authorizationManifestSha256', value.authorizationManifestSha256],
  ].map(([key, raw]) => [key, hash(raw, `document graph ${key}`)]));
  return { releaseCandidateId, ...hashes };
}

export function buildHistoricalDocumentFamilyGraph(input) {
  validateInputs(input);
  const generatedAt = new Date(input.generatedAt).toISOString();
  const sourceBindings = activeReleaseSourceBindings(input.classification.sourceBindings);
  const referencesById = new Map();
  const referencesByExactKey = new Map();
  for (const reference of input.historicalReference.records) {
    if (!reference?.referenceId || referencesById.has(reference.referenceId)) {
      throw new Error(`duplicate or missing historical reference: ${reference?.referenceId ?? ''}`);
    }
    const key = exactKey(reference.category, reference.brand, reference.model);
    if (referencesByExactKey.has(key)) throw new Error(`duplicate exact historical identity: ${key}`);
    referencesById.set(reference.referenceId, reference);
    referencesByExactKey.set(key, reference);
  }

  const indexedByHash = new Map();
  for (const indexed of input.dimensionKnowledge.indexedDocuments) {
    const pdfSha256 = hash(indexed.pdfSha256, 'indexed PDF');
    if (indexedByHash.has(pdfSha256)) {
      const current = indexedByHash.get(pdfSha256);
      const sameObject = current.contentSha256 === indexed.contentSha256
        && canonicalJsonSha256(current.mineruObject) === canonicalJsonSha256(indexed.mineruObject);
      throw new Error(`${sameObject ? 'duplicate PDF hash' : 'conflicting MinerU object'}: ${pdfSha256}`);
    }
    const identities = (indexed.identities ?? []).map((identity) => ({
      category: text(identity.category),
      brand: text(identity.brand),
      model: text(identity.model),
    })).filter((identity) => identity.category && identity.brand && identity.model)
      .sort((left, right) => exactKey(left.category, left.brand, left.model)
        .localeCompare(exactKey(right.category, right.brand, right.model)));
    indexedByHash.set(pdfSha256, {
      pdfSha256,
      validity: indexed.validity,
      invalidReason: text(indexed.invalidReason) || null,
      mappingStatus: text(indexed.mappingStatus) || 'UNMAPPED',
      sourceUrls: sortedUnique((indexed.sourceUrls ?? []).map(sourceUrl)),
      identities,
      contentSha256: indexed.contentSha256 == null
        ? null
        : hash(indexed.contentSha256, 'indexed MinerU content'),
      mineruObject: normalizedMineruObject(indexed),
    });
  }

  const physicalByHash = new Map();
  for (const document of input.legacyPdfAudit.pdfDocuments) {
    const pdfSha256 = hash(document.sourcePdfSha256, 'legacy PDF');
    if (!indexedByHash.has(pdfSha256)) throw new Error(`physical PDF missing from MinerU index: ${pdfSha256}`);
    if (physicalByHash.has(pdfSha256)) throw new Error(`duplicate physical PDF audit node: ${pdfSha256}`);
    physicalByHash.set(pdfSha256, sortedUnique(document.physicalPaths ?? []));
  }
  const physicalFiles = [...physicalByHash.values()].reduce((sum, paths) => sum + paths.length, 0);
  if (input.legacyPdfAudit.summary?.physicalFiles !== physicalFiles
    || input.legacyPdfAudit.summary?.uniquePdfDocuments !== physicalByHash.size
    || input.legacyPdfAudit.summary?.duplicatePhysicalFiles !== physicalFiles - physicalByHash.size) {
    throw new Error('legacy physical PDF accounting mismatch');
  }

  const edgeMaps = new Map([...indexedByHash.keys()].map((pdfSha256) => [pdfSha256, new Map()]));
  const familiesById = new Map();
  const familyIdsByPdf = new Map([...indexedByHash.keys()].map((pdfSha256) => [pdfSha256, new Set()]));

  for (const category of input.dimensionKnowledge.categories) {
    for (const brand of category.brands ?? []) {
      for (const family of brand.families ?? []) {
        const familyId = familyIdFor(
          category.category,
          brand.canonicalBrand,
          family.groupType,
          family.groupName,
        );
        const pdfSha256s = sortedUnique((family.pdfSha256s ?? []).map((value) => hash(value, 'family PDF')));
        const familyPdfSha256s = new Set(pdfSha256s);
        const familyModels = new Set((family.models ?? []).map(normalizedModel));
        if (pdfSha256s.some((pdfSha256) => !indexedByHash.has(pdfSha256))) {
          throw new Error(`document family references unknown indexed PDF: ${familyId}`);
        }
        const familyNode = familiesById.get(familyId) ?? {
          familyId,
          category: text(category.category),
          brand: text(brand.canonicalBrand),
          groupType: text(family.groupType),
          groupName: text(family.groupName),
          pdfSha256s: new Set(),
          grammarProfileIds: new Set(),
          referenceIds: new Set(),
        };
        for (const pdfSha256 of pdfSha256s) {
          familyNode.pdfSha256s.add(pdfSha256);
          familyIdsByPdf.get(pdfSha256).add(familyId);
        }
        for (const grammar of family.parserProfileIds ?? []) familyNode.grammarProfileIds.add(grammar);
        for (const model of family.models ?? []) {
          const reference = referencesByExactKey.get(exactKey(
            category.category,
            brand.canonicalBrand,
            model,
          ));
          if (!reference) continue;
          familyNode.referenceIds.add(reference.referenceId);
          for (const pdfSha256 of pdfSha256s) addEdge(
            edgeMaps,
            pdfSha256,
            reference.referenceId,
            'FAMILY_SCOPE_ONLY',
            {
              type: 'KNOWLEDGE_FAMILY_SCOPE',
              familyId,
              groupType: text(family.groupType),
              groupName: text(family.groupName),
            },
          );
        }
        for (const replay of family.parserReplays ?? []) {
          if (replay.identityScope !== 'EXACT_MODEL') continue;
          const pdfSha256 = hash(replay.pdfSha256, 'parser replay PDF');
          requireFamilyPdf(pdfSha256, familyPdfSha256s, 'parser replay PDF', familyId);
          if (exactKey(replay.category, replay.brand, replay.model)
              !== exactKey(category.category, brand.canonicalBrand, replay.model)
            || !familyModels.has(normalizedModel(replay.model))) {
            throw new Error(`parser replay identity is outside document family: ${familyId}`);
          }
          const reference = referencesByExactKey.get(exactKey(replay.category, replay.brand, replay.model));
          if (!reference) continue;
          familyNode.referenceIds.add(reference.referenceId);
          addEdge(edgeMaps, pdfSha256, reference.referenceId, 'FAMILY_SCOPE_ONLY', {
            type: 'MINERU_REPLAY_HINT',
            identityScope: replay.identityScope,
            category: text(replay.category),
            brand: text(replay.brand),
            model: text(replay.model),
            reasonCode: text(replay.reasonCode),
            grammarProfileIds: sortedUnique(replay.grammarProfileIds ?? []),
          });
        }
        for (const expression of family.expressions ?? []) {
          if (!EXACT_BINDINGS.has(expression.modelBinding)) continue;
          const pdfSha256 = hash(expression.pdfSha256, 'expression PDF');
          requireFamilyPdf(pdfSha256, familyPdfSha256s, 'expression PDF', familyId);
          if (!Number.isInteger(expression.page) || expression.page < 0 || !expression.fragmentSha256) {
            throw new Error(`exact MinerU expression locator incomplete: ${familyId}`);
          }
          const fragmentSha256 = hash(expression.fragmentSha256, 'expression fragment');
          for (const model of expression.boundModels ?? []) {
            const expectedIdentityKey = exactKey(category.category, brand.canonicalBrand, model);
            const matchingIdentities = (expression.identities ?? []).filter((identity) => (
              exactKey(identity.category, identity.brand, identity.model) === expectedIdentityKey
            ));
            if (matchingIdentities.length !== 1 || !familyModels.has(normalizedModel(model))) {
              throw new Error(`exact MinerU expression identity missing or ambiguous: ${familyId}`);
            }
            const reference = referencesByExactKey.get(expectedIdentityKey);
            if (!reference) continue;
            familyNode.referenceIds.add(reference.referenceId);
            const isModelList = MODEL_LIST_PATTERNS.has(expression.patternKind)
              && normalizedModel(expression.modelExpression) === normalizedModel(model);
            addEdge(
              edgeMaps,
              pdfSha256,
              reference.referenceId,
              isModelList ? 'MODEL_LIST_PROVEN' : 'EXACT_MODEL_PROVEN',
              {
                type: isModelList ? 'MINERU_MODEL_ROW' : 'MINERU_EXACT_MODEL_LOCATOR',
                observationId: text(expression.observationId),
                page: expression.page,
                fragmentSha256,
                modelBinding: expression.modelBinding,
                patternKind: text(expression.patternKind),
              },
            );
          }
        }
        for (const evidence of family.seriesEvidence ?? []) {
          const pdfSha256 = hash(evidence.pdfSha256, 'series evidence PDF');
          requireFamilyPdf(pdfSha256, familyPdfSha256s, 'series evidence PDF', familyId);
          if (exactKey(evidence.category, evidence.brand, evidence.model)
              !== exactKey(category.category, brand.canonicalBrand, evidence.model)
            || !familyModels.has(normalizedModel(evidence.model))) {
            throw new Error(`model-list identity is outside document family: ${familyId}`);
          }
          if (!Number.isInteger(evidence.page) || evidence.page < 0 || !text(evidence.quote)) {
            throw new Error(`MinerU model-list locator incomplete: ${familyId}`);
          }
          const reference = referencesByExactKey.get(exactKey(
            evidence.category,
            evidence.brand,
            evidence.model,
          ));
          if (!reference) continue;
          familyNode.referenceIds.add(reference.referenceId);
          addEdge(edgeMaps, pdfSha256, reference.referenceId, 'MODEL_LIST_PROVEN', {
            type: 'MINERU_MODEL_LIST_LOCATOR',
            page: evidence.page,
            quote: text(evidence.quote),
            seriesName: text(evidence.seriesName),
          });
        }
        familiesById.set(familyId, familyNode);
      }
    }
  }

  for (const indexed of indexedByHash.values()) {
    for (const identity of indexed.identities) {
      const reference = referencesByExactKey.get(exactKey(identity.category, identity.brand, identity.model));
      if (!reference) continue;
      addEdge(edgeMaps, indexed.pdfSha256, reference.referenceId, 'FAMILY_SCOPE_ONLY', {
        type: 'INDEX_IDENTITY_HINT',
        mappingStatus: indexed.mappingStatus,
      });
    }
  }

  const nonIndexedClassificationLinks = [];
  for (const record of input.classification.records) {
    const reference = referencesById.get(record.referenceId);
    if (!reference) throw new Error(`classification reference missing from historical inventory: ${record.referenceId}`);
    for (const link of record.documentLinks ?? []) {
      if (!link.sourcePdfSha256) continue;
      const pdfSha256 = hash(link.sourcePdfSha256, 'classification PDF');
      if (!indexedByHash.has(pdfSha256)) {
        nonIndexedClassificationLinks.push({
          referenceId: record.referenceId,
          contentSha256: pdfSha256,
          sourceUrl: link.sourceUrl ? sourceUrl(link.sourceUrl) : null,
          contentLane: classificationContentLane(link),
          documentId: text(link.documentId),
        });
        continue;
      }
      let proofLevel = 'FAMILY_SCOPE_ONLY';
      let locator = {
        type: 'CLASSIFICATION_ASSOCIATION',
        identityScope: text(link.identityScope),
        receiptState: text(link.receiptState),
      };
      if (link.receiptState === 'CURRENT_VALID' && link.identityScope === 'EXACT_MODEL') {
        if (!text(link.documentId)) {
          throw new Error(`current receipt document ID missing: ${record.referenceId}`);
        }
        proofLevel = 'EXACT_MODEL_PROVEN';
        locator = {
          type: 'CURRENT_RECEIPT',
          documentId: text(link.documentId),
          receiptState: link.receiptState,
        };
      } else if (link.identityScope === 'ALIAS_CANDIDATE') {
        proofLevel = 'ALIAS_RESEARCH';
        locator = {
          type: 'CLASSIFICATION_ALIAS',
          documentId: text(link.documentId),
          identityScope: link.identityScope,
        };
      }
      addEdge(edgeMaps, pdfSha256, record.referenceId, proofLevel, locator);
    }
  }

  const sourceHashesByUrl = new Map();
  for (const indexed of indexedByHash.values()) {
    for (const url of indexed.sourceUrls) {
      const hashes = sourceHashesByUrl.get(url) ?? new Set();
      hashes.add(indexed.pdfSha256);
      sourceHashesByUrl.set(url, hashes);
    }
  }
  const sourceVersions = [];
  const sourceVersionIdsByPdf = new Map([...indexedByHash.keys()].map((pdfSha256) => [pdfSha256, []]));
  for (const [url, hashSet] of [...sourceHashesByUrl].sort(([left], [right]) => left.localeCompare(right))) {
    const hashes = [...hashSet].sort();
    for (const [index, pdfSha256] of hashes.entries()) {
      const sourceVersionId = identifier('source_version', `${url}\0${pdfSha256}`);
      sourceVersions.push({
        sourceVersionId,
        sourceUrl: url,
        pdfSha256,
        versionOrdinal: index + 1,
        versionCount: hashes.length,
        ordinalBasis: 'CONTENT_HASH_ORDER_ONLY',
        contentConflict: hashes.length > 1,
      });
      sourceVersionIdsByPdf.get(pdfSha256).push(sourceVersionId);
    }
  }

  const documents = [...indexedByHash.values()].map((indexed) => {
    const edgeMap = edgeMaps.get(indexed.pdfSha256);
    const modelEdges = [...edgeMap].map(([referenceId, edge]) => ({
      referenceId,
      proofLevel: selectedProofLevel(edge.levels),
      proofLocators: stableLocators(edge.locators),
    })).sort((left, right) => left.referenceId.localeCompare(right.referenceId));
    if (!modelEdges.length) modelEdges.push({
      referenceId: null,
      proofLevel: 'UNMAPPED',
      proofLocators: [{ type: 'INDEX_MAPPING_STATUS', mappingStatus: indexed.mappingStatus }],
    });
    return {
      documentId: identifier('pdf_document', indexed.pdfSha256),
      pdfSha256: indexed.pdfSha256,
      validity: indexed.validity,
      ...(indexed.invalidReason ? { invalidReason: indexed.invalidReason } : {}),
      physicalPaths: physicalByHash.get(indexed.pdfSha256) ?? [],
      physicalCopyCount: (physicalByHash.get(indexed.pdfSha256) ?? []).length,
      sourceVersionIds: [...sourceVersionIdsByPdf.get(indexed.pdfSha256)].sort(),
      mineruObject: indexed.mineruObject,
      grammarProfileIds: sortedUnique([
        ...[...familyIdsByPdf.get(indexed.pdfSha256)].flatMap((familyId) => (
          [...familiesById.get(familyId).grammarProfileIds]
        )),
        ...modelEdges.flatMap((edge) => edge.proofLocators.flatMap((locator) => (
          locator.grammarProfileIds ?? []
        ))),
      ]),
      familyIds: [...familyIdsByPdf.get(indexed.pdfSha256)].sort(),
      modelEdges,
    };
  }).sort((left, right) => left.pdfSha256.localeCompare(right.pdfSha256));

  const documentByHash = new Map(documents.map((document) => [document.pdfSha256, document]));
  const families = [...familiesById.values()].map((family) => {
    const pdfSha256s = [...family.pdfSha256s].sort();
    return {
      familyId: family.familyId,
      category: family.category,
      brand: family.brand,
      groupType: family.groupType,
      groupName: family.groupName,
      documentIds: pdfSha256s.map((pdfSha256) => documentByHash.get(pdfSha256).documentId),
      pdfSha256s,
      grammarProfileIds: [...family.grammarProfileIds].sort(),
      referenceIds: [...family.referenceIds].sort(),
    };
  }).sort((left, right) => left.familyId.localeCompare(right.familyId));
  const allModelEdges = documents.flatMap((document) => document.modelEdges);
  nonIndexedClassificationLinks.sort((left, right) => (
    left.referenceId.localeCompare(right.referenceId)
      || left.contentSha256.localeCompare(right.contentSha256)
      || left.documentId.localeCompare(right.documentId)
  ));
  const summary = {
    indexedPdfDocuments: documents.length,
    validIndexedPdfDocuments: documents.filter((document) => document.validity === 'VALID').length,
    invalidIndexedPdfDocuments: documents.filter((document) => document.validity === 'INVALID').length,
    uniquePdfDocuments: documents.length,
    physicalFiles,
    physicallyStoredUniqueDocuments: physicalByHash.size,
    duplicatePhysicalFiles: physicalFiles - physicalByHash.size,
    documentFamilies: families.length,
    sourceUrls: sourceHashesByUrl.size,
    sourceVersions: sourceVersions.length,
    conflictingSourceUrls: [...sourceHashesByUrl.values()].filter((hashes) => hashes.size > 1).length,
    modelEdges: allModelEdges.length,
    mappedModelEdges: allModelEdges.filter((edge) => edge.referenceId !== null).length,
    byProofLevel: countBy(allModelEdges, (edge) => edge.proofLevel),
    nonIndexedClassificationLinks: nonIndexedClassificationLinks.length,
    nonIndexedClassificationLinksByLane: countBy(
      nonIndexedClassificationLinks,
      (entry) => entry.contentLane,
    ),
  };
  const semantic = {
    schemaVersion: 1,
    ...(sourceBindings ? { sourceBindings } : {}),
    policy: {
      contentHashIsDocumentIdentity: true,
      familyMembershipCanAuthoriseExactModel: false,
      sourceUrlHashConflictMergesDocuments: false,
      dimensionsReceiptAuthorityChanged: false,
    },
    summary,
    sourceVersions,
    nonIndexedClassificationLinks,
    documents,
    families,
  };
  return {
    ...semantic,
    generatedAt,
    semanticGraphSha256: canonicalJsonSha256(semantic),
  };
}
