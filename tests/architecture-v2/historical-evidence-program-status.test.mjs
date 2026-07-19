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
      schemaVersion: 3,
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
      targets: [{ referenceId: 'ref-5', candidateJobIds: [] }],
      summary: {
        acquisitionRecords: 1,
        fetchJobs: 0,
        targets: 1,
        resolverOnlyTargets: 1,
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
  assert.equal(metricById(status, 'parser.complete_replays').rateBasisPoints, 5000);
  assert.equal(metricById(status, 'accepted_source_lane.pdf_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.html_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.json_only').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.mixed').numerator, 1);
  assert.equal(metricById(status, 'accepted_source_lane.pdf_involved').numerator, 2);
  assert.equal(metricById(status, 'fit.receipt_bound_verified').numerator, 0);
  assert.ok(status.metrics.every((metric) => (
    typeof metric.grain === 'string'
      && Number.isInteger(metric.numerator)
      && Number.isInteger(metric.denominator)
      && Object.hasOwn(metric, 'rateBasisPoints')
      && typeof metric.sourceArtifact === 'string'
  )));
  assert.deepEqual(status.controls.map((control) => control.status), [
    'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS',
  ]);
  assert.ok(status.diagnostics.some((diagnostic) => (
    diagnostic.code === 'EXECUTION_GRAPH_RESOLVER_ONLY'
  )));
});

test('renders explicit grains and does not merge the two document inventories', () => {
  const markdown = renderHistoricalEvidenceProgramStatusMarkdown(
    buildHistoricalEvidenceProgramStatus(fixture()),
  );

  assert.match(markdown, /Model evidence funnel/);
  assert.match(markdown, /Unique PDF content/);
  assert.match(markdown, /MinerU knowledge document/);
  assert.match(markdown, /PDF only/);
  assert.match(markdown, /EXECUTION_GRAPH_RESOLVER_ONLY/);
  assert.doesNotMatch(markdown, /2\s*\/\s*3 unique PDFs and MinerU documents/);
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
    /knowledge schema version 3 required/,
  );
});
