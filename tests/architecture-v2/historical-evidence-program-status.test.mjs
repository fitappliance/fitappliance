import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalEvidenceProgramStatus,
  renderHistoricalEvidenceProgramStatusMarkdown,
} from '../../src/domain/historical-evidence-program-status.mjs';

function entry(referenceId, contentTypes) {
  return {
    referenceId,
    acceptanceStatus: 'accepted',
    sources: contentTypes.map((contentType, index) => ({
      sourceType: contentType === 'application/pdf'
        ? 'official_exact_model_pdf'
        : contentType === 'text/html'
          ? 'official_exact_model_product_page'
          : 'official_exact_model_api',
      contentType,
      sourceUrl: `https://example.com/${referenceId}/${index}`,
    })),
  };
}

function fixture() {
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    classification: {
      schemaVersion: 1,
      records: Array.from({ length: 5 }, (_, index) => ({
        referenceId: `ref-${index + 1}`,
        operationalClass: index < 4 ? 'COMPLETE_RECEIPT' : 'OFFICIAL_DISCOVERY',
      })),
      summary: {
        records: 5,
        uniqueReferenceIds: 5,
        modelsWithDocumentLinks: 4,
        modelsWithoutDocumentLinks: 1,
        byOperationalClass: { COMPLETE_RECEIPT: 4, OFFICIAL_DISCOVERY: 1 },
      },
    },
    knowledge: {
      schemaVersion: 4,
      summary: {
        mineruDocuments: 3,
        validMineruDocuments: 2,
        invalidMineruDocuments: 1,
        documentsWithObservations: 1,
        documentsWithoutObservations: 1,
        parserReplays: 4,
        completeParserReplays: 2,
      },
    },
    documentGraph: {
      schemaVersion: 1,
      summary: {
        indexedPdfDocuments: 3,
        validIndexedPdfDocuments: 2,
        invalidIndexedPdfDocuments: 1,
        uniquePdfDocuments: 3,
        physicalFiles: 3,
        physicallyStoredUniqueDocuments: 2,
        duplicatePhysicalFiles: 1,
        documentFamilies: 1,
        sourceUrls: 2,
        sourceVersions: 2,
        conflictingSourceUrls: 0,
        modelEdges: 4,
        mappedModelEdges: 3,
        byProofLevel: {
          EXACT_MODEL_PROVEN: 1,
          MODEL_LIST_PROVEN: 1,
          FAMILY_SCOPE_ONLY: 1,
          UNMAPPED: 1,
        },
        nonIndexedClassificationLinks: 0,
        nonIndexedClassificationLinksByLane: {},
      },
      sourceVersions: [{ sourceVersionId: 'source-1' }, { sourceVersionId: 'source-2' }],
      nonIndexedClassificationLinks: [],
      families: [{ familyId: 'family-1' }],
      documents: [
        {
          pdfSha256: 'a'.repeat(64), validity: 'VALID',
          modelEdges: [{
            referenceId: 'ref-1',
            proofLevel: 'EXACT_MODEL_PROVEN',
            proofLocators: [{ type: 'CURRENT_RECEIPT', documentId: 'receipt-document-1' }],
          }],
        },
        {
          pdfSha256: 'b'.repeat(64), validity: 'VALID',
          modelEdges: [
            {
              referenceId: 'ref-2',
              proofLevel: 'MODEL_LIST_PROVEN',
              proofLocators: [{
                type: 'MINERU_MODEL_ROW',
                page: 1,
                fragmentSha256: 'd'.repeat(64),
              }],
            },
            { referenceId: 'ref-3', proofLevel: 'FAMILY_SCOPE_ONLY', proofLocators: [{ type: 'KNOWLEDGE_FAMILY_SCOPE' }] },
          ],
        },
        {
          pdfSha256: 'c'.repeat(64), validity: 'INVALID',
          modelEdges: [{ referenceId: null, proofLevel: 'UNMAPPED', proofLocators: [{ type: 'INDEX_MAPPING_STATUS' }] }],
        },
      ],
    },
    acquisitionQueue: {
      schemaVersion: 1,
      records: [{ referenceId: 'ref-5' }],
      sources: [],
      summary: {
        classificationRecords: 5,
        queuedModels: 1,
        excluded: { COMPLETE_RECEIPT: 4, OFFICIAL_HTML_ONLY: 0, NO_OFFICIAL_SOURCE: 0 },
      },
    },
    executableQueue: {
      schemaVersion: 2,
      jobs: [],
      targets: [],
      discoveryTargets: [{ referenceId: 'ref-5', candidateJobIds: [] }],
      deferredTargets: [],
      summary: {
        acquisitionRecords: 1,
        fetchJobs: 0,
        targets: 1,
        acquisitionTargets: 0,
        discoveryTargets: 1,
        deferredTargets: 0,
        resolverOnlyTargets: 0,
        candidateEdges: 0,
        suppressedPriorResolverOnlyTargets: 0,
        excluded: {},
      },
    },
    acceptanceBundle: {
      schemaVersion: 1,
      entries: [
        entry('ref-1', ['application/pdf']),
        entry('ref-2', ['text/html']),
        entry('ref-3', ['application/json']),
        entry('ref-4', ['application/pdf', 'text/html']),
      ],
    },
    attemptLedger: {
      schemaVersion: 1,
      summary: { targetAttempts: 1, resolverOnlySuppressions: 1 },
    },
    targetState: {
      schemaVersion: 2,
      sourceBindings: {
        classificationSha256: '1'.repeat(64),
        acquisitionQueueSha256: '2'.repeat(64),
        executableQueueSha256: '3'.repeat(64),
        acceptanceBundleSha256: '4'.repeat(64),
        attemptLedgerSha256: '5'.repeat(64),
      },
      summary: {
        records: 5,
        actionable: 1,
        completed: 4,
        blocked: 0,
        actionableBlockedOverlap: 0,
        terminal: 4,
        byState: { DIMENSIONS_RECEIPT: 4, SOURCE_DISCOVERY_REQUIRED: 1 },
        byStateClass: { ACTIONABLE: 1, COMPLETED: 4 },
      },
      records: Array.from({ length: 5 }, (_, index) => ({
        referenceId: `ref-${index + 1}`,
        state: index < 4 ? 'DIMENSIONS_RECEIPT' : 'SOURCE_DISCOVERY_REQUIRED',
        stateClass: index < 4 ? 'COMPLETED' : 'ACTIONABLE',
        actionable: index === 4,
        terminal: index < 4,
      })),
    },
    mineruBackfillAudit: {
      schemaVersion: 1,
      summary: {
        physicalFiles: 3,
        uniqueDocuments: 2,
        duplicatePhysicalFiles: 1,
        indexed: 2,
        missing: 0,
      },
    },
    receiptReplayAudit: {
      schemaVersion: 1,
      summary: { entries: 4, sources: 5, passed: 5, failed: 0 },
    },
    replacementAudit: {
      schemaVersion: 1,
      summary: {
        referenceRecords: 5,
        publicRecords: 5,
        currentCatalogProducts: 3,
        byLookupAction: {
          AUTO_FILL: 4,
          CONFIRM_REQUIRED: 1,
          MEASURE_REQUIRED: 0,
          QUARANTINED: 0,
        },
        issueCount: 0,
      },
    },
    fitPublicationAudit: {
      schemaVersion: 1,
      summary: {
        products: 3,
        receiptBoundDimensions: 2,
        receiptBoundVerified: 0,
        violations: 0,
      },
    },
  };
}

function metricById(status, id) {
  return status.metrics.find((metric) => metric.id === id);
}

test('builds a grain-safe model, document, parser, source-lane and Fit funnel', () => {
  const status = buildHistoricalEvidenceProgramStatus(fixture());

  assert.equal(status.schemaVersion, 1);
  assert.equal(metricById(status, 'model.inventory_classified').numerator, 5);
  assert.equal(metricById(status, 'model.with_document_links').rateBasisPoints, 8000);
  assert.equal(metricById(status, 'document.backfill_unique_indexed').grain, 'unique_pdf_content');
  assert.equal(metricById(status, 'document.graph_indexed_nodes').numerator, 3);
  assert.equal(metricById(status, 'document.graph_valid_nodes').denominator, 3);
  assert.equal(metricById(status, 'document.graph_proven_model_applicability').grain, 'document_model_edge');
  assert.equal(metricById(status, 'document.graph_proven_model_applicability').numerator, 2);
  assert.equal(metricById(status, 'parser.complete_replays').rateBasisPoints, 5000);
  assert.equal(metricById(status, 'accepted_source_lane.pdf_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.html_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.json_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.mixed').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.pdf_involved').numerator, 2);
  assert.equal(metricById(status, 'target_state.actionable').numerator, 1);
  assert.equal(metricById(status, 'target_state.completed').numerator, 4);
  assert.equal(metricById(status, 'target_state.actionable_blocked_overlap').numerator, 0);
  assert.equal(metricById(status, 'fit.receipt_bound_verified').numerator, 0);
  assert.ok(status.metrics.every((metric) => (
    typeof metric.grain === 'string'
      && Number.isInteger(metric.numerator)
      && Number.isInteger(metric.denominator)
      && Object.hasOwn(metric, 'rateBasisPoints')
      && typeof metric.sourceArtifact === 'string'
  )));
  assert.deepEqual(status.controls.map((control) => control.status), [
    'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS',
  ]);
  assert.ok(!status.diagnostics.some((diagnostic) => (
    diagnostic.code === 'EXECUTION_GRAPH_RESOLVER_ONLY'
  )));
});

test('reports release-scoped publication audit sources when supplied', () => {
  const input = fixture();
  input.sourceArtifacts = {
    replacementAudit: 'data/architecture-v2/releases/release-example/historical-replacement-audit.json',
    fitPublicationAudit: 'data/architecture-v2/releases/release-example/fit-publication-audit.json',
  };

  const status = buildHistoricalEvidenceProgramStatus(input);
  assert.equal(
    metricById(status, 'model.replacement_auto_fill').sourceArtifact,
    input.sourceArtifacts.replacementAudit,
  );
  assert.equal(
    metricById(status, 'fit.receipt_bound_dimensions').sourceArtifact,
    input.sourceArtifacts.fitPublicationAudit,
  );
});

test('renders explicit grains and does not merge the two document inventories', () => {
  const markdown = renderHistoricalEvidenceProgramStatusMarkdown(
    buildHistoricalEvidenceProgramStatus(fixture()),
  );

  assert.match(markdown, /Model evidence funnel/);
  assert.match(markdown, /Unique PDF content/);
  assert.match(markdown, /MinerU knowledge document/);
  assert.match(markdown, /PDF only/);
  assert.doesNotMatch(markdown, /EXECUTION_GRAPH_RESOLVER_ONLY/);
  assert.doesNotMatch(markdown, /2\s*\/\s*3 unique PDFs and MinerU documents/);
});

test('fails closed when an ordinary acquisition lane has targets but no materialized edge', () => {
  const input = fixture();
  input.executableQueue.targets = [{ referenceId: 'ref-5', candidateJobIds: [] }];
  input.executableQueue.discoveryTargets = [];
  input.executableQueue.summary.acquisitionTargets = 1;
  input.executableQueue.summary.discoveryTargets = 0;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /acquisition execution graph.*candidate edge/i,
  );
});

test('fails closed when classification and acquisition accounting drift', () => {
  const input = fixture();
  input.acquisitionQueue.summary.queuedModels = 2;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /acquisition model accounting mismatch/,
  );
});

test('fails closed when classification document-link accounting drifts', () => {
  const input = fixture();
  input.classification.summary.modelsWithoutDocumentLinks = 2;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /classification document-link accounting mismatch/,
  );
});

test('fails closed when MinerU document accounting drifts', () => {
  const input = fixture();
  input.knowledge.summary.documentsWithoutObservations = 0;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /MinerU observation accounting mismatch/,
  );
});

test('fails closed when the document graph misses a MinerU index node', () => {
  const input = fixture();
  input.documentGraph.documents.pop();

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /document graph.*accounting mismatch/i,
  );
});

test('fails closed when a proven document edge points outside model classification', () => {
  const input = fixture();
  input.documentGraph.documents[0].modelEdges[0].referenceId = 'ref-missing';

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /document graph reference missing from classification/i,
  );
});

test('fails closed when parser replay is presented as exact proof without a source locator', () => {
  const input = fixture();
  input.documentGraph.documents[0].modelEdges[0].proofLocators = [{
    type: 'MINERU_EXACT_MODEL_REPLAY',
  }];
  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /exact-model proof locator invalid/i,
  );
});

test('fails closed when accepted evidence points outside the classification', () => {
  const input = fixture();
  input.acceptanceBundle.entries[0].referenceId = 'ref-missing';

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /acceptance reference missing from classification/,
  );
});

test('fails closed when acceptance receipt replay does not cover the bundle', () => {
  const input = fixture();
  input.receiptReplayAudit.summary.entries = 3;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /receipt replay entry accounting mismatch/,
  );
});

test('fails closed when replacement and classification inventories drift', () => {
  const input = fixture();
  input.replacementAudit.summary.referenceRecords = 4;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /replacement reference accounting mismatch/,
  );
});

test('rejects unknown input schema versions', () => {
  const input = fixture();
  input.knowledge.schemaVersion = 99;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /knowledge schema version 4 required/,
  );
});

test('fails closed when target-state and executable actionable counts drift', () => {
  const input = fixture();
  input.targetState.summary.actionable = 0;

  assert.throws(
    () => buildHistoricalEvidenceProgramStatus(input),
    /target-state actionable accounting mismatch/,
  );
});
