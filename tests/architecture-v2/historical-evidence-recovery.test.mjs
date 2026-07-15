import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  RECOVERY_CHECKPOINTS,
  buildHistoricalEvidenceRecoveryQueue,
} from '../../src/domain/historical-evidence-recovery.mjs';

const COMPLETE_FIELDS = [
  { field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', page: null, quote: null },
  { field: 'closedEnvelope.heightMm', value: 850, unit: 'mm', page: null, quote: null },
  { field: 'closedEnvelope.depthMm', value: 600, unit: 'mm', page: null, quote: null },
];

function jsonSha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reference(overrides = {}) {
  return {
    referenceId: 'fa_ref_measure',
    category: 'dishwasher',
    brand: 'Example',
    model: 'EX100',
    lifecycleState: 'CURRENT_RETAIL',
    lookupAction: 'MEASURE_REQUIRED',
    catalogProductIds: ['product-1'],
    dimensionsMm: null,
    registryDimensionState: 'MISSING_DIMENSIONS',
    sources: [],
    ...overrides,
  };
}

function document(overrides = {}) {
  return {
    id: 'doc_measure',
    sourceUrl: 'https://example.com.au/manuals/family.pdf',
    authorType: 'manufacturer',
    transportHostType: 'manufacturer',
    identityOutcome: 'exact',
    productLinks: [{ legacyRuntimeId: 'product-1', canonicalProductId: 'fa_prod_1' }],
    fields: COMPLETE_FIELDS,
    state: 'quarantined',
    rejectionReason: 'legacy_evidence_missing_page_level_v2_provenance',
    ...overrides,
  };
}

test('recovery queue downloads a shared document once while preserving per-model proof targets', () => {
  const queue = buildHistoricalEvidenceRecoveryQueue({
    historicalReference: {
      generatedAt: '2026-07-12T00:00:00.000Z',
      records: [
        reference(),
        reference({
          referenceId: 'fa_ref_confirm', model: 'EX200', lifecycleState: 'CATALOG_ARCHIVED',
          lookupAction: 'CONFIRM_REQUIRED', catalogProductIds: ['product-2'],
          dimensionsMm: { width: 598, height: 845, depth: 610 },
          registryDimensionState: 'CONSISTENT',
          sources: [{
            sourceId: 'energy-rating:dishwasher',
            snapshotSha256: 'a'.repeat(64),
            sourceLines: [42],
          }],
        }),
      ],
    },
    sourceDocuments: [
      document(),
      document({
        id: 'doc_confirm',
        productLinks: [{ legacyRuntimeId: 'product-2', canonicalProductId: 'fa_prod_2' }],
      }),
    ],
  });

  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.targets.length, 2);
  assert.equal(queue.jobs[0].targetIds.length, 2);
  assert.equal(queue.jobs[0].acquisitionRoute, 'OFFICIAL_RECEIPT_REBUILD');
  assert.equal(queue.jobs[0].authorityBrand, 'Example');
  assert.equal(queue.jobs[0].authorityMode, 'official');
  assert.deepEqual(queue.jobs[0].checkpoints, RECOVERY_CHECKPOINTS);
  assert.deepEqual(
    queue.targets.map((target) => target.referenceId),
    ['fa_ref_measure', 'fa_ref_confirm'],
  );
  assert.deepEqual(queue.targets[0].legacyDimensionHintMm, {
    width: 600, height: 850, depth: 600,
  });
  assert.deepEqual(queue.targets[0].requestedFields, [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
  ]);
  assert.equal(queue.targets[0].publicationEligible, false);
  assert.deepEqual(queue.targets[0].candidateJobIds, [queue.jobs[0].jobId]);
  assert.equal(queue.targets[0].primaryJobId, queue.jobs[0].jobId);
  assert.deepEqual(queue.targets[1].registryDimensionHints, [{
    sourceId: 'energy-rating:dishwasher',
    snapshotSha256: 'a'.repeat(64),
    dimensionsMm: { width: 598, height: 845, depth: 610 },
  }]);
  assert.equal(queue.summary.documents, 2);
  assert.equal(queue.summary.fetchJobs, 1);
  assert.equal(queue.summary.candidateEdges, 2);
  assert.equal(queue.summary.targets, 2);
  assert.equal(queue.summary.uniqueReferences, 2);
  assert.deepEqual(queue.summary.byCurrentAction, {
    CONFIRM_REQUIRED: 1,
    MEASURE_REQUIRED: 1,
  });
});

test('recovery queue keeps retailer mirrors as discovery evidence and reports every exclusion', () => {
  const queue = buildHistoricalEvidenceRecoveryQueue({
    historicalReference: {
      generatedAt: '2026-07-12T00:00:00.000Z',
      records: [
        reference(),
        reference({
          referenceId: 'fa_ref_auto', model: 'EX300', lookupAction: 'AUTO_FILL',
          catalogProductIds: ['product-3'],
        }),
      ],
    },
    sourceDocuments: [
      document({
        sourceUrl: 'https://retailer.example/manual.pdf',
        authorType: 'unknown',
        transportHostType: 'retailer',
      }),
      document({ id: 'doc_ambiguous', identityOutcome: 'ambiguous' }),
      document({ id: 'doc_incomplete', fields: COMPLETE_FIELDS.slice(0, 2) }),
      document({
        id: 'doc_auto',
        productLinks: [{ legacyRuntimeId: 'product-3', canonicalProductId: 'fa_prod_3' }],
      }),
      document({ id: 'doc_unsafe', sourceUrl: 'http://example.com/manual.pdf' }),
      document({
        id: 'doc_unlinked',
        productLinks: [{ legacyRuntimeId: 'missing-product', canonicalProductId: null }],
      }),
    ],
  });

  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].acquisitionRoute, 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY');
  assert.equal(queue.jobs[0].authorityMode, 'reference');
  assert.equal(queue.targets[0].publicationEligible, false);
  assert.deepEqual(queue.summary.excluded, {
    ALREADY_AUTO_FILL: 1,
    HISTORICAL_REFERENCE_NOT_FOUND: 1,
    IDENTITY_NOT_EXACT: 1,
    INCOMPLETE_LEGACY_DIMENSIONS: 1,
    UNSAFE_SOURCE_URL: 1,
  });
});

test('recovery queue orders current missing dimensions before historical and confirmation work', () => {
  const records = [
    reference({ referenceId: 'archived-missing', lifecycleState: 'CATALOG_ARCHIVED', catalogProductIds: ['p2'] }),
    reference({ referenceId: 'current-confirm', lookupAction: 'CONFIRM_REQUIRED', catalogProductIds: ['p3'] }),
    reference({ referenceId: 'current-missing', catalogProductIds: ['p1'] }),
  ];
  const queue = buildHistoricalEvidenceRecoveryQueue({
    historicalReference: { generatedAt: '2026-07-12T00:00:00.000Z', records },
    sourceDocuments: [
      document({ id: 'd2', sourceUrl: 'https://example.com.au/p2.pdf', productLinks: [{ legacyRuntimeId: 'p2', canonicalProductId: null }] }),
      document({ id: 'd3', sourceUrl: 'https://example.com.au/p3.pdf', productLinks: [{ legacyRuntimeId: 'p3', canonicalProductId: null }] }),
      document({ id: 'd1', sourceUrl: 'https://example.com.au/p1.pdf', productLinks: [{ legacyRuntimeId: 'p1', canonicalProductId: null }] }),
    ],
  });

  assert.deepEqual(queue.targets.map((target) => target.priorityClass), [
    'P0_CURRENT_MISSING_DIMENSIONS',
    'P1_HISTORICAL_MISSING_DIMENSIONS',
    'P2_CURRENT_CONFIRMATION',
  ]);
});

test('same URL under different brands creates independent authority jobs', () => {
  const queue = buildHistoricalEvidenceRecoveryQueue({
    historicalReference: {
      generatedAt: '2026-07-12T00:00:00.000Z',
      records: [
        reference({ referenceId: 'ref-a', brand: 'Brand A', model: 'A1', catalogProductIds: ['p-a'] }),
        reference({ referenceId: 'ref-b', brand: 'Brand B', model: 'B1', catalogProductIds: ['p-b'] }),
      ],
    },
    sourceDocuments: [
      document({ id: 'doc-a', productLinks: [{ legacyRuntimeId: 'p-a', canonicalProductId: 'fa-a' }] }),
      document({ id: 'doc-b', productLinks: [{ legacyRuntimeId: 'p-b', canonicalProductId: 'fa-b' }] }),
    ],
  });

  assert.equal(queue.jobs.length, 2);
  assert.deepEqual(queue.jobs.map((job) => job.authorityBrand), ['Brand A', 'Brand B']);
  assert.ok(queue.jobs.every((job) => job.authorityMode === 'official'));
  assert.equal(new Set(queue.jobs.map((job) => job.jobId)).size, 2);
  assert.ok(queue.jobs.every((job) => job.targetIds.length === 1));
});

test('one target with two source URLs owns one state node and two candidate edges', () => {
  const queue = buildHistoricalEvidenceRecoveryQueue({
    historicalReference: {
      generatedAt: '2026-07-12T00:00:00.000Z',
      records: [reference()],
    },
    sourceDocuments: [
      document({ id: 'doc-primary', sourceUrl: 'https://example.com.au/a.pdf' }),
      document({ id: 'doc-alternate', sourceUrl: 'https://example.com.au/b.pdf' }),
    ],
  });

  assert.equal(queue.jobs.length, 2);
  assert.equal(queue.targets.length, 1);
  assert.equal(queue.targets[0].candidateJobIds.length, 2);
  assert.equal(queue.targets[0].primaryJobId, queue.targets[0].candidateJobIds[0]);
  assert.ok(queue.jobs.every((job) => job.targetIds[0] === queue.targets[0].targetId));
  assert.equal(queue.summary.targets, 1);
  assert.equal(queue.summary.candidateEdges, 2);
  assert.equal(queue.summary.multiCandidateTargets, 1);
});

test('normal Architecture V2 build does not generate the next recovery epoch queue', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(packageJson.scripts['build:historical-evidence-recovery-queue'], /build-historical-evidence-recovery-queue/);
  assert.doesNotMatch(packageJson.scripts['build:architecture-v2'], /historical-evidence-recovery-queue/);
});

test('committed source queue matches its audited epoch and excludes scalar promoted targets', async () => {
  const [sourceRegistry, historicalReference, committedQueue] = await Promise.all([
    readFile('data/architecture-v2/generated/source-documents.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/generated/historical-appliance-reference.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json', 'utf8').then(JSON.parse),
  ]);
  const rebuilt = buildHistoricalEvidenceRecoveryQueue({
    sourceDocuments: sourceRegistry.documents,
    historicalReference,
  });
  const replayed = buildHistoricalEvidenceRecoveryQueue({
    sourceDocuments: sourceRegistry.documents,
    historicalReference,
  });

  assert.equal(jsonSha256(committedQueue), jsonSha256(rebuilt));
  assert.equal(jsonSha256(rebuilt), jsonSha256(replayed));
  for (const promotedModel of ['WD8560F1', 'KBM5302AC']) {
    assert.equal(committedQueue.targets.some((target) => target.model === promotedModel), false);
    assert.equal(rebuilt.targets.some((target) => target.model === promotedModel), false);
  }
  assert.ok(committedQueue.summary.fetchJobs > 1_500);
  assert.ok(committedQueue.summary.uniqueReferences > 1_500);
  assert.equal(new Set(committedQueue.jobs.map((job) => job.sourceUrl)).size, committedQueue.jobs.length);
  assert.ok(committedQueue.targets.every((target) => target.publicationEligible === false));
  assert.equal(new Set(committedQueue.targets.map((target) => target.targetId)).size, committedQueue.targets.length);
  assert.equal(committedQueue.summary.candidateEdges, committedQueue.jobs
    .reduce((count, job) => count + job.targetIds.length, 0));
});
