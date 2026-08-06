import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDimensionExpressionKnowledge } from '../../src/domain/dimension-expression-knowledge.mjs';
import { buildHistoricalDocumentFamilyGraph } from '../../src/domain/historical-document-family-graph.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';

const PDF_A = 'a'.repeat(64);
const PDF_B = 'b'.repeat(64);
const PDF_C = 'c'.repeat(64);
const JSON_A = '1'.repeat(64);
const JSON_B = '2'.repeat(64);
const JSON_C = '3'.repeat(64);
const SHARED_URL = 'https://official.example/manual.pdf';

function mineruObject(pdfSha256, contentSha256) {
  return {
    schemaVersion: 1,
    format: 'content_list_v2',
    parserName: 'MinerU',
    parserVersion: '3.4.4',
    modelRevision: 'model-revision-1',
    sourcePdfSha256: pdfSha256,
    contentSha256,
    objectPath: `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`,
    byteSize: 100,
    pageCount: 2,
  };
}

function reference(referenceId, model) {
  return {
    referenceId,
    category: 'fridge',
    brand: 'Example',
    model,
  };
}

function indexedDocument(pdfSha256, contentSha256, sourceUrls, identities = []) {
  return {
    pdfSha256,
    contentSha256,
    validity: 'VALID',
    mappingStatus: identities.length ? 'MAPPED_TARGET_IDENTITY' : 'UNMAPPED_SOURCE_PDF',
    sourceUrls,
    identities,
    mineruObject: mineruObject(pdfSha256, contentSha256),
  };
}

function fixture() {
  const references = [
    reference('ref_exact', 'EX100'),
    reference('ref_list', 'ML200'),
    reference('ref_family', 'FM300'),
    reference('ref_alias', 'AL400X'),
    reference('ref_second', 'EX500'),
  ];
  const identity = (model) => ({ category: 'fridge', brand: 'Example', model });
  const family = {
    groupType: 'document_family',
    groupName: 'Shared installation manual',
    models: ['EX100', 'ML200', 'FM300'],
    pdfSha256s: [PDF_A],
    sourceUrls: [SHARED_URL],
    parserProfileIds: ['grammar_shared_v1'],
    parserReplays: [{
      pdfSha256: PDF_A,
      category: 'fridge',
      brand: 'Example',
      model: 'EX100',
      extractionState: 'ALL_AXIS_SCALAR',
      identityScope: 'EXACT_MODEL',
      claimFields: ['closedEnvelope.widthMm'],
      grammarProfileIds: ['grammar_shared_v1'],
      reasonCode: 'PARSED_COMPLETE',
    }],
    expressions: [{
      observationId: 'dimension_expression_model_row',
      pdfSha256: PDF_A,
      contentSha256: JSON_A,
      page: 2,
      fragmentSha256: '4'.repeat(64),
      identities: [identity('ML200')],
      modelBinding: 'SAME_FRAGMENT_EXACT_MODEL',
      boundModels: ['ML200'],
      patternKind: 'MODEL_ROW_DIMENSION_MATRIX',
      modelExpression: 'ML200',
      parserDecision: 'SUPPORTED_EXACT_MODEL_ROW_MATRIX',
    }],
    seriesEvidence: [],
  };
  const secondFamily = {
    groupType: 'model_specific',
    groupName: 'EX500',
    models: ['EX500'],
    pdfSha256s: [PDF_B],
    sourceUrls: [SHARED_URL],
    parserProfileIds: ['grammar_model_v1'],
    parserReplays: [{
      pdfSha256: PDF_B,
      category: 'fridge',
      brand: 'Example',
      model: 'EX500',
      extractionState: 'ALL_AXIS_SCALAR',
      identityScope: 'EXACT_MODEL',
      claimFields: ['closedEnvelope.widthMm'],
      grammarProfileIds: ['grammar_model_v1'],
      reasonCode: 'PARSED_COMPLETE',
    }],
    expressions: [],
    seriesEvidence: [],
  };
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    historicalReference: { schemaVersion: 1, records: references },
    dimensionKnowledge: {
      schemaVersion: 4,
      generatedAt: '2026-07-19T00:00:00.000Z',
      summary: {
        mineruDocuments: 3,
        validMineruDocuments: 3,
        invalidMineruDocuments: 0,
      },
      indexedDocuments: [
        indexedDocument(PDF_A, JSON_A, [SHARED_URL], [
          identity('EX100'), identity('ML200'), identity('FM300'),
        ]),
        indexedDocument(PDF_B, JSON_B, [SHARED_URL], [identity('EX500')]),
        indexedDocument(PDF_C, JSON_C, [], []),
      ],
      categories: [{
        category: 'fridge',
        brands: [{
          canonicalBrand: 'Example',
          families: [family, secondFamily],
        }],
      }],
      unmappedDocuments: [{
        pdfSha256: PDF_C,
        contentSha256: JSON_C,
        sourceUrls: [],
        mappingStatus: 'UNMAPPED_SOURCE_PDF',
      }],
      invalidDocuments: [],
    },
    legacyPdfAudit: {
      schemaVersion: 1,
      summary: {
        physicalFiles: 4,
        uniquePdfDocuments: 3,
        duplicatePhysicalFiles: 1,
      },
      pdfDocuments: [
        {
          sourcePdfSha256: PDF_A,
          physicalPaths: [
            `evidence/objects/sha256/aa/${PDF_A}.pdf`,
            `evidence/web/sha256/aa/aa/${PDF_A}.pdf`,
          ],
        },
        { sourcePdfSha256: PDF_B, physicalPaths: [`evidence/web/sha256/bb/bb/${PDF_B}.pdf`] },
        { sourcePdfSha256: PDF_C, physicalPaths: [`evidence/web/sha256/cc/cc/${PDF_C}.pdf`] },
      ],
    },
    classification: {
      schemaVersion: 1,
      records: [
        {
          ...references[0],
          documentLinks: [{
            documentId: `pdf:${PDF_A}`,
            sourcePdfSha256: PDF_A,
            identityScope: 'EXACT_MODEL',
            receiptState: 'CURRENT_VALID',
            grammarProfileId: 'grammar_shared_v1',
          }],
        },
        {
          ...references[1],
          documentLinks: [{
            documentId: `pdf:${PDF_A}`,
            sourcePdfSha256: PDF_A,
            identityScope: 'EXACT_MODEL',
            receiptState: 'NONE',
          }],
        },
        {
          ...references[2],
          documentLinks: [{
            documentId: `pdf:${PDF_A}`,
            sourcePdfSha256: PDF_A,
            identityScope: 'EXACT_MODEL',
            receiptState: 'NONE',
          }],
        },
        {
          ...references[3],
          documentLinks: [{
            documentId: `pdf:${PDF_A}`,
            sourcePdfSha256: PDF_A,
            identityScope: 'ALIAS_CANDIDATE',
            receiptState: 'NONE',
          }],
        },
        {
          ...references[4],
          documentLinks: [{
            documentId: `pdf:${PDF_B}`,
            sourcePdfSha256: PDF_B,
            identityScope: 'EXACT_MODEL',
            receiptState: 'NONE',
          }],
        },
      ],
    },
  };
}

test('dimension knowledge v4 preserves one flat MinerU object record per index', () => {
  const identity = { category: 'fridge', brand: 'Example', model: 'EX100' };
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-19T00:00:00.000Z',
    historicalRecords: [reference('ref_exact', 'EX100')],
    documents: [{
      ...indexedDocument(PDF_A, JSON_A, [SHARED_URL], [identity]),
      parserVersion: '3.4.4',
      modelRevision: 'model-revision-1',
      contentList: [[]],
    }],
    invalidDocuments: [],
  });

  assert.equal(knowledge.schemaVersion, 4);
  assert.equal(knowledge.indexedDocuments.length, knowledge.summary.mineruDocuments);
  assert.equal(knowledge.indexedDocuments[0].mineruObject.sourcePdfSha256, PDF_A);
  assert.equal(knowledge.indexedDocuments[0].mineruObject.contentSha256, JSON_A);
});

test('graph deduplicates physical copies and assigns only evidence-backed model proof levels', () => {
  const graph = buildHistoricalDocumentFamilyGraph(fixture());
  const document = graph.documents.find((entry) => entry.pdfSha256 === PDF_A);
  const byReference = new Map(document.modelEdges.map((edge) => [edge.referenceId, edge]));

  assert.equal(graph.summary.indexedPdfDocuments, 3);
  assert.equal(graph.summary.uniquePdfDocuments, 3);
  assert.equal(graph.summary.physicalFiles, 4);
  assert.equal(graph.summary.duplicatePhysicalFiles, 1);
  assert.equal(document.physicalPaths.length, 2);
  assert.equal(byReference.get('ref_exact').proofLevel, 'EXACT_MODEL_PROVEN');
  assert.equal(byReference.get('ref_list').proofLevel, 'MODEL_LIST_PROVEN');
  assert.equal(byReference.get('ref_family').proofLevel, 'FAMILY_SCOPE_ONLY');
  assert.equal(byReference.get('ref_alias').proofLevel, 'ALIAS_RESEARCH');
  assert.ok(byReference.get('ref_exact').proofLocators.some((entry) => entry.type === 'CURRENT_RECEIPT'));
  assert.ok(byReference.get('ref_list').proofLocators.some((entry) => entry.type === 'MINERU_MODEL_ROW'));
});

test('shared-family membership never fans out exact-model proof', () => {
  const graph = buildHistoricalDocumentFamilyGraph(fixture());
  const edge = graph.documents.find((entry) => entry.pdfSha256 === PDF_A)
    .modelEdges.find((entry) => entry.referenceId === 'ref_family');
  assert.equal(edge.proofLevel, 'FAMILY_SCOPE_ONLY');
  assert.ok(edge.proofLocators.every((entry) => entry.type !== 'CURRENT_RECEIPT'));
  assert.ok(edge.proofLocators.every((entry) => entry.type !== 'MINERU_MODEL_ROW'));
});

test('parser replay without a page-bound locator or receipt remains family scope', () => {
  const input = fixture();
  input.classification.records[0].documentLinks[0].receiptState = 'NONE';

  const graph = buildHistoricalDocumentFamilyGraph(input);
  const edge = graph.documents.find((entry) => entry.pdfSha256 === PDF_A)
    .modelEdges.find((entry) => entry.referenceId === 'ref_exact');

  assert.equal(edge.proofLevel, 'FAMILY_SCOPE_ONLY');
  assert.ok(edge.proofLocators.some((entry) => entry.type === 'MINERU_REPLAY_HINT'));
});

test('nested replay and locator evidence cannot escape its declared document family', () => {
  const replayInput = fixture();
  replayInput.dimensionKnowledge.categories[0].brands[0].families[0]
    .parserReplays[0].pdfSha256 = PDF_C;
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(replayInput),
    /parser replay PDF is outside document family/i,
  );

  const expressionInput = fixture();
  expressionInput.dimensionKnowledge.categories[0].brands[0].families[0]
    .expressions[0].pdfSha256 = PDF_C;
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(expressionInput),
    /expression PDF is outside document family/i,
  );

  const identityInput = fixture();
  identityInput.dimensionKnowledge.categories[0].brands[0].families[0]
    .expressions[0].identities = [];
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(identityInput),
    /exact MinerU expression identity missing or ambiguous/i,
  );

  const brandInput = fixture();
  brandInput.dimensionKnowledge.categories[0].brands[0].families[0]
    .parserReplays[0].brand = 'Different Brand';
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(brandInput),
    /parser replay identity is outside document family/i,
  );
});

test('exact MinerU expressions require a page and immutable fragment locator', () => {
  const input = fixture();
  input.dimensionKnowledge.categories[0].brands[0].families[0].expressions[0].page = null;
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(input),
    /exact MinerU expression locator incomplete/i,
  );
});

test('one URL with different content hashes remains two explicit source versions', () => {
  const graph = buildHistoricalDocumentFamilyGraph(fixture());
  const versions = graph.sourceVersions.filter((entry) => entry.sourceUrl === SHARED_URL);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.map((entry) => entry.pdfSha256).sort(), [PDF_A, PDF_B]);
  assert.ok(versions.every((entry) => entry.contentConflict === true));
  assert.notEqual(
    graph.documents.find((entry) => entry.pdfSha256 === PDF_A).documentId,
    graph.documents.find((entry) => entry.pdfSha256 === PDF_B).documentId,
  );
});

test('unmapped indexed MinerU documents remain explicit graph nodes', () => {
  const graph = buildHistoricalDocumentFamilyGraph(fixture());
  const document = graph.documents.find((entry) => entry.pdfSha256 === PDF_C);
  assert.deepEqual(document.modelEdges, [{
    referenceId: null,
    proofLevel: 'UNMAPPED',
    proofLocators: [{ type: 'INDEX_MAPPING_STATUS', mappingStatus: 'UNMAPPED_SOURCE_PDF' }],
  }]);
});

test('graph fails closed on duplicate PDF hashes with conflicting MinerU objects', () => {
  const input = fixture();
  input.dimensionKnowledge.indexedDocuments.push(
    indexedDocument(PDF_A, '9'.repeat(64), [SHARED_URL], []),
  );
  input.dimensionKnowledge.summary.mineruDocuments += 1;
  input.dimensionKnowledge.summary.validMineruDocuments += 1;
  assert.throws(
    () => buildHistoricalDocumentFamilyGraph(input),
    /duplicate PDF hash|conflicting MinerU/i,
  );
});

test('model wildcard and suffix punctuation never collapse into an exact-model identity', () => {
  const input = fixture();
  input.historicalReference.records.push(reference('ref_wildcard', 'EX100*'));
  input.classification.records.push({
    ...reference('ref_wildcard', 'EX100*'),
    documentLinks: [],
  });

  const graph = buildHistoricalDocumentFamilyGraph(input);
  const edges = graph.documents.find((entry) => entry.pdfSha256 === PDF_A).modelEdges;
  assert.ok(edges.some((edge) => edge.referenceId === 'ref_exact'));
  assert.ok(!edges.some((edge) => edge.referenceId === 'ref_wildcard'));
});

test('non-PDF receipt links stay outside the indexed PDF graph with a typed lane', () => {
  const input = fixture();
  const jsonHash = 'd'.repeat(64);
  input.classification.records[0].documentLinks.push({
    documentId: `pdf:${jsonHash}`,
    sourcePdfSha256: jsonHash,
    sourceUrl: 'https://official.example/api/product.json',
    evidenceObjectIds: [`evidence/web/sha256/dd/dd/${jsonHash}.json`],
    identityScope: 'EXACT_MODEL',
    receiptState: 'CURRENT_VALID',
  });

  const graph = buildHistoricalDocumentFamilyGraph(input);
  assert.equal(graph.summary.nonIndexedClassificationLinks, 1);
  assert.deepEqual(graph.nonIndexedClassificationLinks, [{
    referenceId: 'ref_exact',
    contentSha256: jsonHash,
    sourceUrl: 'https://official.example/api/product.json',
    contentLane: 'JSON',
    documentId: `pdf:${jsonHash}`,
  }]);
  assert.ok(!graph.documents.some((document) => document.pdfSha256 === jsonHash));
});

test('generated graph is a deterministic replay of committed MinerU and model inputs', async () => {
  const readJson = async (relativePath) => JSON.parse(await readFile(new URL(
    `../../${relativePath}`,
    import.meta.url,
  ), 'utf8'));
  const [activeRecovery, dimensionKnowledge, legacyPdfAudit, classification, committed] = await Promise.all([
    loadHistoricalRecoveryActiveRelease(),
    readJson('data/architecture-v2/generated/dimension-expression-observations.json'),
    readJson('data/architecture-v2/reviews/automated/legacy-pdf-library-audit.json'),
    readJson('data/architecture-v2/generated/historical-model-evidence-classification.json'),
    readJson('data/architecture-v2/generated/historical-document-family-graph.json'),
  ]);
  const replayed = buildHistoricalDocumentFamilyGraph({
    generatedAt: dimensionKnowledge.generatedAt,
    historicalReference: activeRecovery.reference,
    dimensionKnowledge,
    legacyPdfAudit,
    classification,
  });

  assert.deepEqual(replayed, committed);
  assert.equal(
    new Set(committed.documents.map((document) => document.pdfSha256)).size,
    dimensionKnowledge.summary.mineruDocuments,
  );
  assert.equal(committed.summary.indexedPdfDocuments, dimensionKnowledge.indexedDocuments.length);
  assert.ok(committed.documents.flatMap((document) => document.modelEdges)
    .filter((edge) => edge.proofLevel === 'EXACT_MODEL_PROVEN')
    .every((edge) => edge.proofLocators.some((locator) => [
      'CURRENT_RECEIPT',
      'MINERU_EXACT_MODEL_LOCATOR',
    ].includes(locator.type))));
});
