import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildHistoricalEvidenceRecoveryBatch,
  parseHistoricalEvidenceRecoveryBatchArgs,
} from '../../src/domain/historical-evidence-recovery-batch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { parseHistoricalEvidenceRecoveryBatchCliArgs } from '../../scripts/architecture-v2/build-historical-evidence-recovery-batch.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function job(jobId, targetIds, overrides = {}) {
  return {
    jobId,
    sourceUrl: `https://example.com.au/${jobId}.pdf`,
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds,
    ...overrides,
  };
}

function target(targetId, model, candidateJobIds, overrides = {}) {
  return {
    targetId,
    referenceId: `ref-${model}`,
    legacyRuntimeId: `legacy-${model}`,
    canonicalProductId: `product-${model}`,
    category: 'dishwasher',
    brand: 'Example',
    model,
    lifecycleState: 'CURRENT_RETAIL',
    currentLookupAction: 'MEASURE_REQUIRED',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    legacyDimensionHintMm: { width: 600, height: 850, depth: 600 },
    legacyHints: [{
      sourceDocumentId: `doc-${model}`,
      dimensionsMm: { width: 600, height: 850, depth: 600 },
    }],
    registryDimensionHints: [],
    publicationEligible: false,
    requestedFields: FIELDS,
    sourceDocumentIds: [`doc-${model}`],
    candidateJobIds,
    primaryJobId: candidateJobIds[0],
    ...overrides,
  };
}

function fixtureQueue() {
  const targetA = 'recovery_target_aaaaaaaaaaaaaaaaaaaaaaaa';
  const targetB = 'recovery_target_bbbbbbbbbbbbbbbbbbbbbbbb';
  const targetC = 'recovery_target_cccccccccccccccccccccccc';
  const jobA = 'recovery_aaaaaaaaaaaaaaaaaaaaaaaa';
  const jobB = 'recovery_bbbbbbbbbbbbbbbbbbbbbbbb';
  const jobC = 'recovery_cccccccccccccccccccccccc';
  return {
    schemaVersion: 2,
    generatedAt: '2026-07-12T00:00:00.000Z',
    policy: {},
    summary: {},
    jobs: [
      job(jobA, [targetA, targetB]),
      job(jobB, [targetA], { acquisitionRoute: 'OFFICIAL_HOST_AUTHORITY_VALIDATION' }),
      job(jobC, [targetC], {
        authorityBrand: 'Other',
        authorityMode: 'reference',
        acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY',
        priorityClass: 'P3_HISTORICAL_CONFIRMATION',
      }),
    ],
    targets: [
      target(targetA, 'EX100', [jobA, jobB], {
        registryDimensionHints: [{
          sourceId: 'energy-rating:dishwasher',
          snapshotSha256: SHA_A,
          dimensionsMm: { width: 598, height: 845, depth: 610 },
        }],
      }),
      target(targetB, 'EX200', [jobA]),
      target(targetC, 'OT300', [jobC], {
        brand: 'Other',
        canonicalProductId: null,
        lifecycleState: 'CATALOG_ARCHIVED',
        currentLookupAction: 'CONFIRM_REQUIRED',
        priorityClass: 'P3_HISTORICAL_CONFIRMATION',
      }),
    ],
  };
}

function fixturePolicy() {
  return {
    schemaVersion: 1,
    policyVersion: '2026-07-13.1',
    queueSchemaVersion: 2,
    supportedReceiptSchemaVersions: [2, 3],
    supportedClaimSemanticsVersions: [1, 2],
    requestedFields: FIELDS,
    authorityModes: ['official', 'reference'],
    lifecycleStates: ['CURRENT_RETAIL', 'CATALOG_ARCHIVED'],
    concurrency: { network: 2, perHost: 1, mineru: 1 },
    retry: { fetchAttempts: 3, mineruAttempts: 2, baseDelayMs: 1000 },
    limits: {
      timeoutMs: 30_000, resolverTimeoutMs: 120_000,
      maximumBytes: 20_971_520, maximumRedirects: 5,
    },
    lock: { heartbeatMs: 15_000, staleAfterMs: 90_000 },
    reconciliation: { registryAxisPermutationToleranceMm: 10 },
    parser: {
      format: 'content_list_v2',
      name: 'MinerU',
      version: '3.4.4',
      modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      backend: 'pipeline',
      method: 'auto',
      tableEnabled: true,
      formulaEnabled: false,
    },
  };
}

test('batch deterministically selects targets and preserves every alternate candidate edge', () => {
  const queue = fixtureQueue();
  const input = {
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: { jobIds: [queue.jobs[0].jobId], limit: 1 },
  };
  const first = buildHistoricalEvidenceRecoveryBatch(input);
  const second = buildHistoricalEvidenceRecoveryBatch(input);

  assert.deepEqual(first, second);
  assert.equal(canonicalJsonSha256(first), canonicalJsonSha256(second));
  assert.equal(first.targets.length, 1);
  assert.deepEqual(first.targets[0].candidateJobIds, [queue.jobs[0].jobId, queue.jobs[1].jobId]);
  assert.deepEqual(first.artifactJobs.map((row) => row.jobId), [queue.jobs[0].jobId, queue.jobs[1].jobId]);
  assert.ok(first.artifactJobs.every((row) => row.targetIds.length === 1));
  assert.equal(first.summary.candidateEdges, 2);
  assert.equal(first.targets[0].publicationEligible, false);
});

test('batch summary accounts for targets already covered by cumulative acceptance', () => {
  const queue = fixtureQueue();
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      entries: [{
        ...queue.targets[0],
        acceptanceStatus: 'accepted',
      }],
    }],
  });

  assert.equal(batch.summary.excludedPriorAcceptedTargets, 1);
  assert.equal(batch.summary.excludedPriorCandidateJobs, 2);
  assert.ok(batch.targets.every((target) => target.targetId !== queue.targets[0].targetId));
});

test('batch snapshots non-authoritative registry and legacy hints plus active receipt bindings', () => {
  const queue = fixtureQueue();
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      outcomes: [{
        targetId: queue.targets[0].targetId,
        brand: 'Example',
        model: 'EX100',
        category: 'dishwasher',
        outcome: 'quarantined',
        receipt: 'passed',
        source: {
          sourceUrl: 'https://example.com.au/prior.pdf',
          contentSha256: SHA_A,
          verificationReceipt: { bindingSha256: SHA_B },
        },
      }],
    }],
    selection: { brands: ['example'], limit: 1 },
  });

  assert.deepEqual(batch.targets[0].reconciliationContext, {
    activeReceiptSources: [{
      sourceUrl: 'https://example.com.au/prior.pdf',
      contentSha256: SHA_A,
      receiptBindingSha256: SHA_B,
    }],
    registryHints: [{
      sourceId: 'energy-rating:dishwasher',
      snapshotSha256: SHA_A,
      dimensionsMm: { width: 598, height: 845, depth: 610 },
    }],
    legacyHints: [{
      sourceDocumentId: 'doc-EX100',
      dimensionsMm: { width: 600, height: 850, depth: 600 },
    }],
  });
});

test('accepted targets are excluded without deleting other cumulative entries', () => {
  const queue = fixtureQueue();
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      entries: [{
        targetId: queue.targets[0].targetId,
        brand: 'Example', model: 'EX100', category: 'dishwasher',
        acceptanceStatus: 'accepted',
      }, {
        targetId: 'recovery_target_not_in_queue',
        brand: 'Elsewhere', model: 'OLD1', category: 'fridge',
        acceptanceStatus: 'accepted',
      }],
    }, {
      outcomes: [{
        brand: 'Example', model: 'EX200', category: 'dishwasher',
        outcome: 'accepted', receipt: 'passed',
      }],
    }],
    selection: {},
  });

  assert.deepEqual(batch.targets.map((row) => row.model), ['OT300']);
  assert.equal(batch.summary.targets, 1);
});

test('explicit parser repair reopens one accepted target without hydrating its invalid receipt', () => {
  const queue = fixtureQueue();
  queue.targets[0].repairExistingReceipt = true;
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      entries: [{
        targetId: queue.targets[0].targetId,
        brand: 'Example', model: 'EX100', category: 'dishwasher',
        acceptanceStatus: 'accepted',
        sources: [{
          sourceUrl: 'https://example.com.au/old.pdf', contentSha256: SHA_A,
          verificationReceipt: { bindingSha256: SHA_B },
        }],
      }],
    }],
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.equal(batch.targets.length, 1);
  assert.deepEqual(batch.targets[0].reconciliationContext.activeReceiptSources, []);
});

test('receipt-accepted non-scalar targets are also terminal for cumulative batch selection', () => {
  const queue = fixtureQueue();
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      entries: [{
        targetId: queue.targets[0].targetId,
        brand: 'Example', model: 'EX100', category: 'dishwasher',
        acceptanceStatus: 'receipt_accepted_non_scalar',
      }],
    }],
    selection: { brands: ['Example'] },
  });

  assert.deepEqual(batch.targets.map((row) => row.model), ['EX200']);
});

test('route, priority and brand filters combine and limit counts targets rather than jobs', () => {
  const queue = fixtureQueue();
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: {
      routes: ['MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY'],
      priorities: ['P3_HISTORICAL_CONFIRMATION'],
      brands: ['OTHER'],
      limit: 1,
    },
  });
  assert.deepEqual(batch.targets.map((row) => row.model), ['OT300']);
  assert.equal(batch.artifactJobs.length, 1);
  assert.equal(batch.targets[0].lifecycleState, 'CATALOG_ARCHIVED');
  assert.equal(batch.targets[0].canonicalProductId, null);
});

test('target ID filters allow a resolver-only conflict canary to be selected exactly', () => {
  const queue = fixtureQueue();
  queue.targets[1] = target(queue.targets[1].targetId, 'EX200', [], {
    primaryJobId: null,
  });
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: { targetIds: [queue.targets[1].targetId] },
  });

  assert.deepEqual(batch.targets.map((row) => row.model), ['EX200']);
  assert.equal(batch.artifactJobs.length, 0);
  assert.deepEqual(batch.selection.targetIds, [queue.targets[1].targetId]);
});

test('CLI parser rejects unknown flags and supports repeatable filters', () => {
  assert.deepEqual(parseHistoricalEvidenceRecoveryBatchArgs([
    '--job-id', 'job-a', '--job-id=job-b', '--route', 'OFFICIAL_RECEIPT_REBUILD',
    '--priority=P0_CURRENT_MISSING_DIMENSIONS', '--brand', 'Example',
    '--target-id', 'target-a', '--target-id=target-b', '--limit', '5',
  ]), {
    jobIds: ['job-a', 'job-b'],
    routes: ['OFFICIAL_RECEIPT_REBUILD'],
    priorities: ['P0_CURRENT_MISSING_DIMENSIONS'],
    brands: ['Example'],
    targetIds: ['target-a', 'target-b'],
    limit: 5,
  });
  assert.throws(() => parseHistoricalEvidenceRecoveryBatchArgs(['--unknown']), /unknown argument/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryBatchArgs(['--limit', '0']), /limit/i);
});

test('batch CLI keeps canary output separate from the canonical full batch', () => {
  assert.deepEqual(parseHistoricalEvidenceRecoveryBatchCliArgs([
    '--output', '/tmp/fp-canary.json',
    '--brand', 'Fisher & Paykel',
    '--limit', '10',
  ]), {
    output: '/tmp/fp-canary.json',
    selection: {
      jobIds: [], routes: [], priorities: [], brands: ['Fisher & Paykel'],
      targetIds: [], limit: 10,
    },
  });
  assert.throws(
    () => parseHistoricalEvidenceRecoveryBatchCliArgs(['--output', 'one.json', '--output', 'two.json']),
    /output.*once/i,
  );
});

test('committed full batch is reproducible from the queue, policy and cumulative acceptance artifacts', async () => {
  const [queue, policy, cumulativeBundle, pdfBatch, pdfResults,
    rangeBatch, rangeResults, committed] = await Promise.all([
    readFile('data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/policies/historical-evidence-recovery-policy.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/pdf-brand-acceptance-batch.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-batch.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-results.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json', 'utf8').then(JSON.parse),
  ]);
  const rebuilt = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy,
    existingAcceptanceBundles: [
      cumulativeBundle,
      { batch: pdfBatch, results: pdfResults },
      { batch: rangeBatch, results: rangeResults },
    ],
    selection: {},
  });
  assert.equal(canonicalJsonSha256(committed), canonicalJsonSha256(rebuilt));
  assert.ok(committed.targets.length > 1_500);
  assert.equal(new Set(committed.targets.map((row) => row.targetId)).size, committed.targets.length);
});
