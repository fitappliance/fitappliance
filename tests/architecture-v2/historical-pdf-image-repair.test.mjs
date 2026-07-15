import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalPdfImageRepairAudit,
  buildHistoricalPdfImageRepairQueue,
  reconcileMineruProfileExtractions,
  selectHistoricalPdfImageRepairs,
} from '../../src/domain/historical-pdf-image-repair.mjs';

function classified(referenceId, overrides = {}) {
  return {
    schemaVersion: 1,
    referenceId,
    category: 'dishwasher',
    canonicalBrand: 'Example',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CURRENT_RETAIL',
    identityScope: 'EXACT_MODEL',
    operationalClass: 'OFFLINE_PARSER_REPAIR',
    priority: 'P0_CURRENT_RETAIL',
    groupType: 'model_specific',
    groupName: referenceId.toUpperCase(),
    grammarProfileIds: [],
    documentLinks: [],
    ...overrides,
  };
}

function reference(referenceId, overrides = {}) {
  return {
    referenceId,
    lifecycleState: 'CURRENT_RETAIL',
    lookupAction: 'MEASURE_REQUIRED',
    registryDimensionState: 'NONE',
    dimensionsMm: null,
    ...overrides,
  };
}

test('image repair queue accounts for every model and every physical PDF exactly once', () => {
  const imageHash = 'a'.repeat(64);
  const textHash = 'b'.repeat(64);
  const orphanHash = 'c'.repeat(64);
  const records = [
    classified('current-exact', {
      documentLinks: [{ documentId: `pdf:${imageHash}`, sourcePdfSha256: imageHash }],
    }),
    classified('archived-series', {
      lifecycleState: 'CATALOG_ARCHIVED', priority: 'P1_CATALOG_ARCHIVED',
      identityScope: 'AMBIGUOUS', groupType: 'document_family', groupName: 'Shared manual',
      documentLinks: [{ documentId: `pdf:${imageHash}`, sourcePdfSha256: imageHash }],
    }),
    classified('text-only', {
      operationalClass: 'OFFLINE_REPLAY',
      documentLinks: [{ documentId: `pdf:${textHash}`, sourcePdfSha256: textHash }],
    }),
    classified('missing', {
      operationalClass: 'REFERENCE_REDISCOVERY',
      documentLinks: [{ documentId: 'source:missing', sourceUrl: 'https://example.com/missing.pdf' }],
    }),
    classified('complete', { operationalClass: 'COMPLETE_RECEIPT' }),
  ];
  const queue = buildHistoricalPdfImageRepairQueue({
    classification: {
      schemaVersion: 1,
      semanticClassificationSha256: 'd'.repeat(64),
      records,
    },
    historicalReference: {
      records: records.map((record) => reference(record.referenceId, {
        lifecycleState: record.lifecycleState,
      })),
    },
    pdfDocuments: [imageHash, textHash, orphanHash].map((sourcePdfSha256) => ({
      sourcePdfSha256, byteSize: 100, paths: [`evidence/${sourcePdfSha256}.pdf`],
    })),
    primaryScans: [
      { sourcePdfSha256: imageHash, status: 'current', pageCount: 10, imageOnlyDimensionPages: [10, 2, 1] },
      { sourcePdfSha256: textHash, status: 'current', pageCount: 2, imageOnlyDimensionPages: [] },
      { sourcePdfSha256: orphanHash, status: 'current', pageCount: 1, imageOnlyDimensionPages: [1] },
    ],
    hybridIndexes: [],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.summary.models.total, 5);
  assert.equal(queue.summary.documents.total, 3);
  assert.equal(queue.modelRecords.length, 5);
  assert.equal(queue.documents.length, 3);
  assert.equal(new Set(queue.modelRecords.map((row) => row.referenceId)).size, 5);
  assert.equal(new Set(queue.documents.map((row) => row.sourcePdfSha256)).size, 3);

  const image = queue.documents.find((row) => row.sourcePdfSha256 === imageHash);
  assert.equal(image.repairClass, 'HYBRID_REQUIRED_SERIES_SCOPE');
  assert.equal(image.priority, 'P0_CURRENT_LINKED');
  assert.deepEqual(image.primaryScan.imageOnlyDimensionPages, [1, 2, 10]);
  assert.deepEqual(image.referenceIds, ['archived-series', 'current-exact']);
  assert.equal(
    queue.modelRecords.find((row) => row.referenceId === 'current-exact').repairState,
    'HYBRID_IDENTITY_SCOPE_REQUIRED',
  );
  assert.equal(
    queue.modelRecords.find((row) => row.referenceId === 'text-only').repairState,
    'OFFLINE_TEXT_REPLAY',
  );
  assert.equal(
    queue.modelRecords.find((row) => row.referenceId === 'missing').repairState,
    'OFFICIAL_REACQUIRE_OR_REDISCOVER',
  );
  assert.equal(
    queue.modelRecords.find((row) => row.referenceId === 'complete').repairState,
    'RECEIPT_COMPLETE',
  );
  assert.equal(
    queue.documents.find((row) => row.sourcePdfSha256 === orphanHash).repairClass,
    'HYBRID_REQUIRED_UNLINKED',
  );
});

test('current hybrid cache remains review-only until model evidence is corroborated', () => {
  const sourcePdfSha256 = 'e'.repeat(64);
  const record = classified('hybrid', {
    documentLinks: [{ documentId: `pdf:${sourcePdfSha256}`, sourcePdfSha256 }],
  });
  const queue = buildHistoricalPdfImageRepairQueue({
    classification: {
      schemaVersion: 1,
      semanticClassificationSha256: 'f'.repeat(64),
      records: [record],
    },
    historicalReference: { records: [reference('hybrid')] },
    pdfDocuments: [{ sourcePdfSha256, byteSize: 100, paths: ['evidence/hybrid.pdf'] }],
    primaryScans: [{
      sourcePdfSha256, status: 'current', pageCount: 2, imageOnlyDimensionPages: [1],
    }],
    hybridIndexes: [{
      sourcePdfSha256, status: 'current', profileId: 'hybrid-image-high-v1',
      processedPages: [1], derivedContentSha256: '1'.repeat(64),
    }],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.documents[0].repairClass, 'HYBRID_COMPLETE_REVIEW_REQUIRED');
  assert.equal(queue.modelRecords[0].repairState, 'HYBRID_REVIEW_OR_CORROBORATION');
  assert.equal(queue.modelRecords[0].publicationEligible, false);
});

test('image-only PDFs linked only to receipt-complete models are archival, not P0 repair work', () => {
  const sourcePdfSha256 = '9'.repeat(64);
  const record = classified('already-covered', {
    operationalClass: 'COMPLETE_RECEIPT',
    documentLinks: [{ documentId: `pdf:${sourcePdfSha256}`, sourcePdfSha256 }],
  });
  const queue = buildHistoricalPdfImageRepairQueue({
    classification: {
      schemaVersion: 1,
      semanticClassificationSha256: '8'.repeat(64),
      records: [record],
    },
    historicalReference: { records: [reference('already-covered')] },
    pdfDocuments: [{ sourcePdfSha256, byteSize: 100, paths: ['evidence/already-covered.pdf'] }],
    primaryScans: [{
      sourcePdfSha256, status: 'current', pageCount: 3, imageOnlyDimensionPages: [2],
    }],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.documents[0].repairClass, 'HYBRID_OPTIONAL_COVERAGE_COMPLETE');
  assert.equal(queue.documents[0].priority, 'P2_COVERAGE_COMPLETE');
  assert.deepEqual(selectHistoricalPdfImageRepairs(queue), []);
});

test('repair selection defaults to bounded exact-model work and supports deterministic resume filters', () => {
  const queue = {
    documents: [
      { sourcePdfSha256: 'a'.repeat(64), priority: 'P0_CURRENT_LINKED', repairClass: 'HYBRID_REQUIRED_EXACT_MODEL' },
      { sourcePdfSha256: 'b'.repeat(64), priority: 'P0_CURRENT_LINKED', repairClass: 'HYBRID_REQUIRED_SERIES_SCOPE' },
      { sourcePdfSha256: 'c'.repeat(64), priority: 'P1_ARCHIVED_LINKED', repairClass: 'HYBRID_REQUIRED_EXACT_MODEL' },
      { sourcePdfSha256: 'd'.repeat(64), priority: 'P0_CURRENT_LINKED', repairClass: 'HYBRID_COMPLETE_REVIEW_REQUIRED' },
    ],
  };
  assert.deepEqual(
    selectHistoricalPdfImageRepairs(queue, { limit: 1 }).map((row) => row.sourcePdfSha256),
    ['a'.repeat(64)],
  );
  assert.deepEqual(
    selectHistoricalPdfImageRepairs(queue, { priority: 'P1_ARCHIVED_LINKED' })
      .map((row) => row.sourcePdfSha256),
    ['c'.repeat(64)],
  );
  assert.deepEqual(
    selectHistoricalPdfImageRepairs(queue, {
      repairClasses: ['HYBRID_REQUIRED_SERIES_SCOPE'], sha256: 'b'.repeat(64),
    }).map((row) => row.sourcePdfSha256),
    ['b'.repeat(64)],
  );
  assert.deepEqual(
    selectHistoricalPdfImageRepairs(queue, {
      repairClasses: ['HYBRID_REQUIRED_SERIES_SCOPE', 'HYBRID_REQUIRED_EXACT_MODEL'],
      sha256s: ['c'.repeat(64), 'b'.repeat(64)],
    }).map((row) => row.sourcePdfSha256),
    ['b'.repeat(64), 'c'.repeat(64)],
  );
  assert.throws(
    () => selectHistoricalPdfImageRepairs(queue, { sha256: 'e'.repeat(64) }),
    /not found/i,
  );
});

test('primary and hybrid MinerU profiles are reconciled without mixing partial axes', () => {
  const claims = (depth) => [
    { field: 'closedEnvelope.widthMm', value: { kind: 'fixed', mm: 600 } },
    { field: 'closedEnvelope.heightMm', value: { kind: 'fixed', mm: 850 } },
    { field: 'closedEnvelope.depthMm', value: { kind: 'fixed', mm: depth } },
  ];
  const primary = { status: 'extracted', claims: claims(650), identitySignals: ['primary'] };
  const failedHybrid = {
    status: 'failed', failureCode: 'NO_USABLE_DIMENSION_CLAIMS', error: 'no claims',
  };
  const primaryOnly = reconcileMineruProfileExtractions({ primary, hybrid: failedHybrid });
  assert.equal(primaryOnly.status, 'extracted');
  assert.equal(primaryOnly.extractionProfile, 'primary');
  assert.deepEqual(primaryOnly.claims, primary.claims);

  const rangedPrimary = {
    status: 'extracted',
    claims: [
      claims(650)[0],
      {
        field: 'closedEnvelope.heightMm',
        value: { kind: 'range', minMm: 820, maxMm: 880 },
      },
      claims(650)[2],
    ],
  };
  const ranged = reconcileMineruProfileExtractions({ primary: rangedPrimary, hybrid: failedHybrid });
  assert.equal(ranged.status, 'extracted');
  assert.equal(ranged.extractionProfile, 'primary');
  assert.deepEqual(ranged.profileDimensions.primary.height, {
    kind: 'range', minMm: 820, maxMm: 880,
  });

  const hybridOnly = reconcileMineruProfileExtractions({
    primary: { status: 'extracted', claims: claims(650).slice(0, 2) },
    hybrid: { status: 'extracted', claims: claims(650), identitySignals: ['hybrid'] },
  });
  assert.equal(hybridOnly.status, 'extracted');
  assert.equal(hybridOnly.extractionProfile, 'hybrid');

  const agreement = reconcileMineruProfileExtractions({
    primary,
    hybrid: { status: 'extracted', claims: claims(650), identitySignals: ['hybrid'] },
  });
  assert.equal(agreement.status, 'extracted');
  assert.equal(agreement.extractionProfile, 'cross_profile_agreement');

  const conflict = reconcileMineruProfileExtractions({
    primary,
    hybrid: { status: 'extracted', claims: claims(670), identitySignals: ['hybrid'] },
  });
  assert.equal(conflict.status, 'failed');
  assert.equal(conflict.failureCode, 'PROFILE_DIMENSION_CONFLICT');

  const partialOnly = reconcileMineruProfileExtractions({
    primary: { status: 'extracted', claims: claims(650).slice(0, 2) },
    hybrid: { status: 'extracted', claims: claims(650).slice(2) },
  });
  assert.equal(partialOnly.status, 'failed');
  assert.equal(partialOnly.failureCode, 'NO_USABLE_DIMENSION_CLAIMS');
});

test('hybrid audit requires official provenance and independent axis agreement before receipt replay', () => {
  const hashes = ['a', 'b', 'c', 'd'].map((value) => value.repeat(64));
  const models = ['ready', 'provenance', 'conflict', 'family'];
  const documents = models.map((model, index) => ({
    sourcePdfSha256: hashes[index],
    repairClass: 'HYBRID_COMPLETE_REVIEW_REQUIRED',
    primaryScan: {
      status: 'current',
      derivedContentSha256: '1'.repeat(64),
      imageOnlyDimensionPages: [1],
    },
    hybridIndex: {
      profileId: 'hybrid-image-high-v1',
      derivedContentSha256: '2'.repeat(64),
      processedPages: [1],
    },
    linkedModels: [{
      referenceId: model, category: 'dryer', brand: 'Example', model: model.toUpperCase(),
      lifecycleState: 'CURRENT_RETAIL', operationalClass: 'OFFICIAL_DISCOVERY',
    }],
    sourceLinks: index === 1 ? [] : [{
      referenceId: model, sourceAuthority: 'OFFICIAL',
      sourceUrl: `https://manufacturer.example/${model}.pdf`,
    }],
  }));
  const fixedClaims = (depth) => [
    { field: 'closedEnvelope.widthMm', value: { kind: 'fixed', mm: 600 } },
    { field: 'closedEnvelope.heightMm', value: { kind: 'fixed', mm: 850 } },
    { field: 'closedEnvelope.depthMm', value: { kind: 'fixed', mm: depth } },
  ];
  const audit = buildHistoricalPdfImageRepairAudit({
    queue: { semanticQueueSha256: 'e'.repeat(64), documents },
    historicalReference: { records: models.map((referenceId) => ({
      referenceId, registryDimensionState: 'CONSISTENT',
      dimensionsMm: { width: 600, height: 850, depth: 650 },
    })) },
    extractions: [
      { sourcePdfSha256: hashes[0], referenceId: 'ready', status: 'extracted', claims: fixedClaims(650) },
      { sourcePdfSha256: hashes[1], referenceId: 'provenance', status: 'extracted', claims: fixedClaims(650) },
      { sourcePdfSha256: hashes[2], referenceId: 'conflict', status: 'extracted', claims: fixedClaims(670) },
      { sourcePdfSha256: hashes[3], referenceId: 'family', status: 'failed', failureCode: 'IDENTITY_SCOPE_UNRESOLVED' },
    ],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });
  assert.deepEqual(Object.fromEntries(audit.outcomes.map((row) => [row.referenceId, row.decision])), {
    ready: 'READY_FOR_RECEIPT_REPLAY',
    provenance: 'OFFICIAL_PROVENANCE_REDISCOVERY_REQUIRED',
    conflict: 'DIMENSION_CONFLICT_QUARANTINE',
    family: 'IDENTITY_SCOPE_UNRESOLVED',
  });
  assert.deepEqual(audit.outcomes.find((row) => row.referenceId === 'ready').evidenceBinding, {
    sourcePdfSha256: hashes[0],
    primaryContentSha256: '1'.repeat(64),
    hybridContentSha256: '2'.repeat(64),
    profileId: 'hybrid-image-high-v1',
    processedPages: [1],
  });
  assert.ok(audit.outcomes.every((row) => row.publicationEligible === false));
});

test('hybrid audit preserves adjustable ranges and corroborates a registry value inside the range', () => {
  const pdfHash = '9'.repeat(64);
  const audit = buildHistoricalPdfImageRepairAudit({
    queue: {
      semanticQueueSha256: '8'.repeat(64),
      documents: [{
        sourcePdfSha256: pdfHash,
        repairClass: 'HYBRID_COMPLETE_REVIEW_REQUIRED',
        primaryScan: {
          status: 'current', derivedContentSha256: '1'.repeat(64), imageOnlyDimensionPages: [1],
        },
        hybridIndex: {
          profileId: 'hybrid-image-high-v1', derivedContentSha256: '2'.repeat(64), processedPages: [1],
        },
        linkedModels: [{
          referenceId: 'range', category: 'dishwasher', brand: 'Example', model: 'RANGE1',
          lifecycleState: 'CURRENT_RETAIL', operationalClass: 'OFFICIAL_DISCOVERY',
        }],
        sourceLinks: [{
          referenceId: 'range', sourceAuthority: 'OFFICIAL',
          sourceUrl: 'https://manufacturer.example/RANGE1.pdf',
        }],
      }],
    },
    historicalReference: { records: [{
      referenceId: 'range', registryDimensionState: 'CONSISTENT',
      dimensionsMm: { width: 597, height: 850, depth: 574 },
    }] },
    extractions: [{
      sourcePdfSha256: pdfHash,
      referenceId: 'range',
      status: 'extracted',
      extractionProfile: 'primary',
      claims: [
        { field: 'closedEnvelope.widthMm', value: { kind: 'fixed', mm: 597 } },
        { field: 'closedEnvelope.heightMm', value: { kind: 'range', minMm: 820, maxMm: 880 } },
        { field: 'closedEnvelope.depthMm', value: { kind: 'fixed', mm: 574 } },
      ],
    }],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });
  assert.equal(audit.outcomes[0].decision, 'READY_FOR_RECEIPT_REPLAY');
  assert.equal(audit.outcomes[0].corroboration.state, 'AGREES_WITHIN_RANGE');
  assert.deepEqual(audit.outcomes[0].dimensionEvidence.height, {
    kind: 'range', minMm: 820, maxMm: 880,
  });
  assert.equal(audit.outcomes[0].dimensionsMm, null);
});

test('corpus audit keeps primary-only PDF decisions when no hybrid profile is applicable', () => {
  const pdfHash = '6'.repeat(64);
  const audit = buildHistoricalPdfImageRepairAudit({
    queue: {
      semanticQueueSha256: '5'.repeat(64),
      documents: [{
        sourcePdfSha256: pdfHash,
        repairClass: 'PRIMARY_TEXT_ONLY',
        primaryScan: {
          status: 'current', derivedContentSha256: '1'.repeat(64), imageOnlyDimensionPages: [],
        },
        hybridIndex: null,
        linkedModels: [{
          referenceId: 'primary', category: 'fridge', brand: 'Example', model: 'PRIMARY1',
          lifecycleState: 'CATALOG_ARCHIVED', operationalClass: 'OFFICIAL_REACQUIRE',
        }],
        sourceLinks: [{
          referenceId: 'primary', sourceAuthority: 'OFFICIAL',
          sourceUrl: 'https://manufacturer.example/PRIMARY1.pdf',
        }],
      }],
    },
    historicalReference: { records: [{
      referenceId: 'primary', registryDimensionState: 'CONSISTENT',
      dimensionsMm: { width: 600, height: 1700, depth: 650 },
    }] },
    extractions: [{
      sourcePdfSha256: pdfHash,
      referenceId: 'primary',
      status: 'extracted',
      extractionProfile: 'primary',
      claims: [
        { field: 'closedEnvelope.widthMm', value: { kind: 'fixed', mm: 600 } },
        { field: 'closedEnvelope.heightMm', value: { kind: 'fixed', mm: 1700 } },
        { field: 'closedEnvelope.depthMm', value: { kind: 'fixed', mm: 650 } },
      ],
    }],
    generatedAt: '2026-07-14T00:00:00.000Z',
  });
  assert.equal(audit.summary.targets, 1);
  assert.equal(audit.outcomes[0].decision, 'READY_FOR_RECEIPT_REPLAY');
  assert.deepEqual(audit.outcomes[0].evidenceBinding, {
    sourcePdfSha256: pdfHash,
    primaryContentSha256: '1'.repeat(64),
    hybridContentSha256: null,
    profileId: 'pipeline-auto-v1',
    processedPages: [],
  });
});
