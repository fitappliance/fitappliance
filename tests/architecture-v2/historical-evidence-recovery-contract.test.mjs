import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
  validateHistoricalEvidenceRecoveryAudit,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryPolicy,
  validateHistoricalEvidenceRecoveryResults,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const TARGET_ID = 'recovery_target_1234567890abcdef12345678';
const JOB_A = 'recovery_aaaaaaaaaaaaaaaaaaaaaaaa';
const JOB_B = 'recovery_bbbbbbbbbbbbbbbbbbbbbbbb';
const FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function artifactJob(overrides = {}) {
  return {
    jobId: JOB_A,
    sourceUrl: 'https://example.com.au/manual.pdf',
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds: [TARGET_ID],
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    targetId: TARGET_ID,
    referenceId: 'fa_ref_example',
    legacyRuntimeId: 'example-1',
    canonicalProductId: 'fa_prod_example',
    brand: 'Example',
    model: 'EX100',
    category: 'dishwasher',
    lifecycleState: 'CURRENT_RETAIL',
    requestedFields: FIELDS,
    primaryJobId: JOB_A,
    candidateJobIds: [JOB_A, JOB_B],
    publicationEligible: false,
    reconciliationContext: {
      activeReceiptSources: [],
      registryHints: [],
      legacyHints: [{
        sourceDocumentId: 'doc-example',
        dimensionsMm: { width: 600, height: 850, depth: 600 },
      }],
    },
    ...overrides,
  };
}

function batch(overrides = {}) {
  return {
    schemaVersion: 1,
    batchId: 'historical-recovery-batch-example',
    generatedAt: '2026-07-13T00:00:00.000Z',
    queue: { schemaVersion: 2, sha256: SHA_A },
    policy: { version: '2026-07-13.1', sha256: SHA_B },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: [
      artifactJob(),
      artifactJob({
        jobId: JOB_B,
        sourceUrl: 'https://example.com.au/alternate.pdf',
        acquisitionRoute: 'OFFICIAL_HOST_AUTHORITY_VALIDATION',
      }),
    ],
    targets: [target()],
    summary: { artifactJobs: 2, targets: 1, candidateEdges: 2 },
    ...overrides,
  };
}

function results(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-example',
    batchId: 'historical-recovery-batch-example',
    batchSha256: SHA_A,
    queueSha256: SHA_A,
    policySha256: SHA_B,
    startedAt: '2026-07-13T00:00:00.000Z',
    completedAt: '2026-07-13T00:01:00.000Z',
    semanticOutcomeSha256: SHA_C,
    outcomes: [{
      targetId: TARGET_ID,
      status: 'terminal_failure',
      failureCode: 'identity',
      candidateInventorySha256: SHA_A,
      candidateInventory: null,
      sources: [],
      geometryProjection: null,
      semanticOutcomeSha256: SHA_B,
    }],
    summary: { targets: 1, accepted: 0, nonScalar: 0, retryable: 0, terminal: 1 },
    ...overrides,
  };
}

function audit(overrides = {}) {
  return {
    schemaVersion: 1,
    auditId: 'audit-example',
    generatedAt: '2026-07-13T00:02:00.000Z',
    mode: 'online',
    status: 'passed',
    batchId: 'historical-recovery-batch-example',
    batchSha256: SHA_A,
    queueSha256: SHA_A,
    policySha256: SHA_B,
    resultsSha256: SHA_C,
    priorBundleSha256: null,
    checkedTargets: 1,
    checkedObjects: 0,
    violations: [],
    semanticAuditSha256: SHA_A,
    ...overrides,
  };
}

function bundle(overrides = {}) {
  return {
    schemaVersion: 1,
    bundleId: 'historical-recovery-cumulative-v1',
    generatedAt: '2026-07-13T00:03:00.000Z',
    policySha256: SHA_B,
    entries: [{
      targetId: TARGET_ID,
      referenceId: 'fa_ref_example',
      legacyRuntimeId: 'example-1',
      canonicalProductId: 'fa_prod_example',
      brand: 'Example',
      model: 'EX100',
      category: 'dishwasher',
      lifecycleState: 'CURRENT_RETAIL',
      acceptanceStatus: 'accepted',
      sourceBatchId: 'historical-recovery-batch-example',
      auditSha256: SHA_A,
      sources: [{ contentSha256: SHA_C }],
      geometryProjection: { evidenceLevel: 'dimensions' },
    }],
    lineage: [{
      batchId: 'historical-recovery-batch-example',
      batchSha256: SHA_A,
      queueSha256: SHA_A,
      resultsSha256: SHA_C,
      auditSha256: SHA_A,
    }],
    ...overrides,
  };
}

test('canonical JSON SHA ignores object key order but preserves array order', () => {
  assert.equal(canonicalJsonSha256({ b: 2, a: 1 }), canonicalJsonSha256({ a: 1, b: 2 }));
  assert.notEqual(canonicalJsonSha256([1, 2]), canonicalJsonSha256([2, 1]));
  assert.throws(() => canonicalJsonSha256({ unsafe: undefined }), /JSON value/i);
});

test('committed recovery policy pins queue, receipt, claim, transport, lock and MinerU contracts', async () => {
  const policy = JSON.parse(await readFile(
    'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
    'utf8',
  ));
  assert.deepEqual(validateHistoricalEvidenceRecoveryPolicy(policy), policy);
  assert.deepEqual(policy.supportedReceiptSchemaVersions, [2, 3]);
  assert.deepEqual(policy.supportedClaimSemanticsVersions, [1, 2]);
  assert.deepEqual(policy.requestedFields, FIELDS);
  assert.throws(
    () => validateHistoricalEvidenceRecoveryPolicy({ ...policy, unexpected: true }),
    /unknown key/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryPolicy({
      ...policy,
      concurrency: { ...policy.concurrency, perHost: policy.concurrency.network + 1 },
    }),
    /perHost/i,
  );
});

test('batch contract validates both sides of the artifact-target graph', () => {
  assert.deepEqual(validateHistoricalEvidenceRecoveryBatch(batch()), batch());
  assert.throws(
    () => validateHistoricalEvidenceRecoveryBatch(batch({
      targets: [target({ candidateJobIds: [JOB_A, 'recovery_missing'] })],
    })),
    /candidate job/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryBatch(batch({
      targets: [target(), target()],
    })),
    /duplicate target/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryBatch(batch({
      artifactJobs: [artifactJob({ authorityMode: 'retailer' })],
      targets: [target({ candidateJobIds: [JOB_A] })],
      summary: { artifactJobs: 1, targets: 1, candidateEdges: 1 },
    })),
    /authority mode/i,
  );
});

test('results require one typed terminal or accepted outcome per target', () => {
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results()), results());
  assert.throws(
    () => validateHistoricalEvidenceRecoveryResults(results({
      outcomes: [results().outcomes[0], results().outcomes[0]],
      summary: { targets: 2, accepted: 0, nonScalar: 0, retryable: 0, terminal: 2 },
    })),
    /duplicate outcome/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryResults(results({
      outcomes: [{
        ...results().outcomes[0], status: 'accepted', failureCode: null,
        candidateInventory: {}, sources: [], geometryProjection: {},
      }],
      summary: { targets: 1, accepted: 1, nonScalar: 0, retryable: 0, terminal: 0 },
    })),
    /accepted.*source/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryResults({ ...results(), batchSha256: 'bad' }),
    /batch SHA/i,
  );
});

test('audit and cumulative bundle contracts fail closed on violations and duplicate targets', () => {
  assert.deepEqual(validateHistoricalEvidenceRecoveryAudit(audit()), audit());
  assert.throws(
    () => validateHistoricalEvidenceRecoveryAudit(audit({ status: 'passed', violations: ['hash drift'] })),
    /passed audit.*violation/i,
  );
  assert.deepEqual(validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle()), bundle());
  assert.throws(
    () => validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle({
      entries: [bundle().entries[0], bundle().entries[0]],
    })),
    /duplicate.*target/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle({
      entries: [{ ...bundle().entries[0], lifecycleState: 'REGISTRY_ONLY' }],
    })),
    /lifecycle/i,
  );
});
