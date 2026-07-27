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
    reconciliation: { registryAxisPermutationToleranceMm: 10, officialSemanticResolutionVersion: 1 },
    parser: {
      format: 'content_list_v2',
      name: 'MinerU',
      version: '3.4.4',
      modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      claimParserRevision: '2026-07-16.2',
      backend: 'pipeline',
      method: 'auto',
      tableEnabled: true,
      formulaEnabled: false,
    },
  };
}

function receiptSource({
  sourceUrl = 'https://example.com.au/prior.pdf',
  contentSha256 = SHA_A,
  bindingSha256 = SHA_B,
  model = 'EX100',
  identityOutcome = 'exact',
} = {}) {
  return {
    authority: 'manufacturer',
    sourceType: sourceUrl.endsWith('.pdf') ? 'official_exact_model_pdf' : 'official_exact_model_html',
    sourceUrl,
    finalUrl: sourceUrl,
    contentType: sourceUrl.endsWith('.pdf') ? 'application/pdf' : 'text/html',
    contentSha256,
    supersedesContentSha256: [],
    identity: {
      brand: 'Example', model, category: 'dishwasher', outcome: identityOutcome,
    },
    claims: [{
      field: 'closedEnvelope.widthMm',
      value: { kind: 'fixed', mm: 600 },
      sourceLabel: 'Width 600 mm',
    }],
    verificationReceipt: {
      schemaVersion: 3,
      bindingSha256,
      policyVersion: '2026-07-13.1',
      verifiedAt: '2026-07-13T00:00:00.000Z',
    },
  };
}

function receiptReplayAudit(bundle, outcomes) {
  const semantic = {
    sourceBundleSha256: canonicalJsonSha256(bundle),
    outcomes,
  };
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    ...semantic,
    semanticAuditSha256: canonicalJsonSha256(semantic),
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

test('batch preserves per-target required attempts and candidate source roles', () => {
  const queue = fixtureQueue();
  const [primaryJob, optionalJob] = queue.jobs;
  primaryJob.sourceRoles = ['manufacturer_document'];
  optionalJob.sourceRoles = ['manufacturer_product_page'];
  queue.targets[0].candidateEdges = [{
    jobId: primaryJob.jobId,
    requiredAttempt: true,
  }, {
    jobId: optionalJob.jobId,
    requiredAttempt: false,
  }];
  const result = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: { targetIds: [queue.targets[0].targetId] },
  });
  const byId = new Map(result.artifactJobs.map((row) => [row.jobId, row]));

  assert.equal(byId.get(primaryJob.jobId).sourceRole, 'manufacturer_document');
  assert.deepEqual(byId.get(primaryJob.jobId).requiredTargetIds, [queue.targets[0].targetId]);
  assert.equal(byId.get(optionalJob.jobId).sourceRole, 'manufacturer_product_page');
  assert.deepEqual(byId.get(optionalJob.jobId).requiredTargetIds, []);
});

test('batch preserves target-specific discovery provenance bindings', () => {
  const queue = fixtureQueue();
  const provenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    requestedModel: queue.targets[0].model,
    matchedModel: queue.targets[0].model,
    artifactUrl: queue.jobs[0].sourceUrl,
  };
  queue.targets[0].candidateEdges = [{
    jobId: queue.jobs[0].jobId,
    requiredAttempt: true,
    discoveryProvenance: provenance,
  }, {
    jobId: queue.jobs[1].jobId,
    requiredAttempt: true,
  }];

  const result = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.deepEqual(result.artifactJobs[0].discoveryProvenanceBindings, [{
    targetId: queue.targets[0].targetId,
    targetModel: queue.targets[0].model,
    targetCategory: queue.targets[0].category,
    discoveryProvenance: provenance,
  }]);
  assert.equal(result.artifactJobs[1].discoveryProvenanceBindings, undefined);
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

test('batch snapshots non-authoritative hints plus complete replayable active receipt sources', () => {
  const queue = fixtureQueue();
  const priorSource = receiptSource();
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
        source: priorSource,
      }],
    }],
    selection: { brands: ['example'], limit: 1 },
  });

  assert.deepEqual(batch.targets[0].reconciliationContext, {
    activeReceiptSources: [priorSource],
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

test('batch drops terminal suppressions captured under an older recovery policy', () => {
  const queue = fixtureQueue();
  const policy = fixturePolicy();
  const currentPolicySha256 = canonicalJsonSha256(policy);
  queue.targets[0].priorAttemptSuppressions = [{
    attemptId: 'historical_attempt_old_policy',
    sourceUrl: 'https://example.com.au/old-policy.pdf',
    contentSha256: SHA_A,
    status: 'identity_rejected',
    failureCode: 'identity',
    policySha256: SHA_B,
  }, {
    attemptId: 'historical_attempt_current_policy',
    sourceUrl: 'https://example.com.au/current-policy.pdf',
    contentSha256: SHA_A,
    status: 'identity_rejected',
    failureCode: 'identity',
    policySha256: currentPolicySha256,
  }];

  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy,
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.deepEqual(batch.targets[0].reconciliationContext.priorAttemptSuppressions, [{
    attemptId: 'historical_attempt_current_policy',
    sourceUrl: 'https://example.com.au/current-policy.pdf',
    contentSha256: SHA_A,
    status: 'identity_rejected',
    failureCode: 'identity',
    policySha256: currentPolicySha256,
  }]);
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
        outcome: 'accepted', receipt: 'passed', identity: 'exact',
      }],
    }],
    selection: {},
  });

  assert.deepEqual(batch.targets.map((row) => row.model), ['OT300']);
  assert.equal(batch.summary.targets, 1);
});

test('legacy marketing-alias acceptance remains recoverable until exact identity is proved', () => {
  const queue = fixtureQueue();
  const priorSource = receiptSource({
    sourceUrl: 'https://example.com.au/alias-product-page',
    identityOutcome: 'official_marketing_alias',
  });
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      outcomes: [{
        brand: 'Example', model: 'EX100', category: 'dishwasher',
        outcome: 'accepted', receipt: 'passed', identity: 'official_marketing_alias',
        source: priorSource,
      }],
    }],
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.deepEqual(batch.targets.map((row) => row.model), ['EX100']);
  assert.deepEqual(batch.targets[0].reconciliationContext.activeReceiptSources, [priorSource]);
  assert.equal(batch.summary.excludedPriorAcceptedTargets, 0);
});

test('batch fails closed when prior acceptance contains only a compact receipt reference', () => {
  const queue = fixtureQueue();
  assert.throws(() => buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [{
      outcomes: [{
        targetId: queue.targets[0].targetId,
        brand: 'Example', model: 'EX100', category: 'dishwasher',
        outcome: 'quarantined', receipt: 'passed',
        source: {
          sourceUrl: 'https://example.com.au/prior.pdf',
          contentSha256: SHA_A,
          receiptBindingSha256: SHA_B,
        },
      }],
    }],
    selection: { targetIds: [queue.targets[0].targetId] },
  }), /active receipt source.*replayable/i);
});

test('explicit parser repair reopens one accepted target without hydrating its invalid receipt', () => {
  const queue = fixtureQueue();
  queue.targets[0].repairExistingReceipt = true;
  const failedSource = receiptSource({ sourceUrl: 'https://example.com.au/old.pdf' });
  const bundle = {
    entries: [{
      targetId: queue.targets[0].targetId,
      referenceId: queue.targets[0].referenceId,
      brand: 'Example', model: 'EX100', category: 'dishwasher',
      acceptanceStatus: 'accepted',
      sources: [failedSource],
    }],
  };
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [bundle],
    receiptReplayAudit: receiptReplayAudit(bundle, [{
      targetId: queue.targets[0].targetId,
      referenceId: queue.targets[0].referenceId,
      contentSha256: failedSource.contentSha256,
      receiptBindingSha256: failedSource.verificationReceipt.bindingSha256,
      status: 'failed',
      failureCode: 'receipt_replay_mismatch',
    }]),
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.equal(batch.targets.length, 1);
  assert.deepEqual(batch.targets[0].reconciliationContext.activeReceiptSources, []);
  assert.equal(batch.targets[0].repairExistingReceipt, true);
});

test('parser repair preserves only prior receipt sources that passed the bound replay audit', () => {
  const queue = fixtureQueue();
  queue.targets[0].repairExistingReceipt = true;
  const failedSource = receiptSource({ sourceUrl: 'https://example.com.au/old.pdf' });
  const passedSource = receiptSource({
    sourceUrl: 'https://example.com.au/old-product-page',
    contentSha256: 'c'.repeat(64),
    bindingSha256: 'd'.repeat(64),
  });
  const bundle = {
    entries: [{
      targetId: queue.targets[0].targetId,
      referenceId: queue.targets[0].referenceId,
      brand: 'Example', model: 'EX100', category: 'dishwasher',
      acceptanceStatus: 'accepted',
      sources: [failedSource, passedSource],
    }],
  };
  const audit = receiptReplayAudit(bundle, [{
    targetId: queue.targets[0].targetId,
    referenceId: queue.targets[0].referenceId,
    contentSha256: failedSource.contentSha256,
    receiptBindingSha256: failedSource.verificationReceipt.bindingSha256,
    status: 'failed',
    failureCode: 'receipt_replay_mismatch',
  }, {
    targetId: queue.targets[0].targetId,
    referenceId: queue.targets[0].referenceId,
    contentSha256: passedSource.contentSha256,
    receiptBindingSha256: passedSource.verificationReceipt.bindingSha256,
    status: 'passed',
    failureCode: null,
  }]);

  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [bundle],
    receiptReplayAudit: audit,
    selection: { targetIds: [queue.targets[0].targetId] },
  });

  assert.deepEqual(batch.targets[0].reconciliationContext.activeReceiptSources, [passedSource]);
});

test('parser repair fails closed without a replay audit bound to the cumulative bundle', () => {
  const queue = fixtureQueue();
  queue.targets[0].repairExistingReceipt = true;
  const source = receiptSource();
  const bundle = {
    entries: [{
      targetId: queue.targets[0].targetId,
      referenceId: queue.targets[0].referenceId,
      brand: 'Example', model: 'EX100', category: 'dishwasher',
      acceptanceStatus: 'accepted', sources: [source],
    }],
  };

  assert.throws(() => buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [bundle],
    selection: { targetIds: [queue.targets[0].targetId] },
  }), /receipt replay audit.*required/i);

  const drifted = receiptReplayAudit({ entries: [] }, [{
    targetId: queue.targets[0].targetId,
    referenceId: queue.targets[0].referenceId,
    contentSha256: source.contentSha256,
    receiptBindingSha256: source.verificationReceipt.bindingSha256,
    status: 'failed', failureCode: 'receipt_replay_mismatch',
  }]);
  assert.throws(() => buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [bundle],
    receiptReplayAudit: drifted,
    selection: { targetIds: [queue.targets[0].targetId] },
  }), /receipt replay audit.*bundle/i);
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

test('an acquisition batch rejects a selected target with no candidate edge before network execution', () => {
  const queue = fixtureQueue();
  queue.targets[1] = target(queue.targets[1].targetId, 'EX200', [], {
    primaryJobId: null,
  });
  assert.throws(() => buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy: fixturePolicy(),
    existingAcceptanceBundles: [],
    selection: { targetIds: [queue.targets[1].targetId] },
  }), /acquisition batch.*candidate edge/i);
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

test('committed full batch is reproducible and isolates non-ready candidate observations', async () => {
  const [queue, policy, cumulativeBundle, receiptReplayAudit, pdfBatch, pdfResults,
    rangeBatch, rangeResults, committed] = await Promise.all([
    readFile('data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/policies/historical-evidence-recovery-policy.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-acceptance-receipt-replay-audit.json', 'utf8').then(JSON.parse),
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
    receiptReplayAudit,
    selection: {},
  });
  assert.equal(canonicalJsonSha256(committed), canonicalJsonSha256(rebuilt));
  assert.equal(committed.targets.length, queue.summary.acquisitionTargets);
  assert.ok(committed.targets.every((target) => target.candidateJobIds.length > 0));
  assert.equal(committed.summary.candidateEdges, queue.summary.candidateEdges);
  if (queue.summary.acquisitionTargets === 0) {
    assert.equal(queue.summary.candidateEdges, 0);
    assert.ok(queue.summary.observedCandidateEdges > 0);
    assert.equal(
      queue.summary.isolatedNonReadyCandidateEdges,
      queue.summary.observedCandidateEdges,
    );
  }
  assert.equal(new Set(committed.targets.map((row) => row.targetId)).size, committed.targets.length);
});
