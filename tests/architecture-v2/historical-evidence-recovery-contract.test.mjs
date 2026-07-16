import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
  rollbackHistoricalEvidenceRecoveryBundleBatch,
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
const EMPTY_RECONCILIATION = {
  conflictingFields: [], conflictHints: [], missingFields: [], supersessionViolations: [],
  axisPermutationResolution: null, lowerAuthorityResolution: null, conflictReason: null,
};

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
    selection: { jobIds: [], targetIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: [
      artifactJob(),
      artifactJob({
        jobId: JOB_B,
        sourceUrl: 'https://example.com.au/alternate.pdf',
        acquisitionRoute: 'OFFICIAL_HOST_AUTHORITY_VALIDATION',
      }),
    ],
    targets: [target()],
    summary: {
      artifactJobs: 2,
      targets: 1,
      candidateEdges: 2,
      excludedPriorAcceptedTargets: 0,
      excludedPriorCandidateJobs: 0,
    },
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
      reconciliation: null,
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
      reconciliation: structuredClone(EMPTY_RECONCILIATION),
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
  assert.equal(policy.reconciliation.registryAxisPermutationToleranceMm, 10);
  assert.equal(policy.reconciliation.officialSemanticResolutionVersion, 1);
  assert.equal(policy.parser.claimParserRevision, '2026-07-16.7');
  assert.ok(policy.limits.resolverTimeoutMs > policy.limits.timeoutMs);
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
  assert.throws(
    () => validateHistoricalEvidenceRecoveryPolicy({
      ...policy,
      limits: { ...policy.limits, resolverTimeoutMs: policy.limits.timeoutMs },
    }),
    /resolverTimeoutMs/i,
  );
  assert.throws(
    () => validateHistoricalEvidenceRecoveryPolicy({
      ...policy,
      parser: { ...policy.parser, claimParserRevision: 'latest' },
    }),
    /claimParserRevision/i,
  );
});

test('batch contract validates both sides of the artifact-target graph', () => {
  assert.deepEqual(validateHistoricalEvidenceRecoveryBatch(batch()), batch());
  const legacySummary = batch();
  delete legacySummary.summary.excludedPriorAcceptedTargets;
  delete legacySummary.summary.excludedPriorCandidateJobs;
  assert.deepEqual(validateHistoricalEvidenceRecoveryBatch(legacySummary), legacySummary);
  assert.throws(
    () => validateHistoricalEvidenceRecoveryBatch(batch({
      summary: {
        artifactJobs: 2,
        targets: 1,
        candidateEdges: 2,
        excludedPriorAcceptedTargets: 0,
      },
    })),
    /must appear together/i,
  );
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
      summary: {
        artifactJobs: 1,
        targets: 1,
        candidateEdges: 1,
        excludedPriorAcceptedTargets: 0,
        excludedPriorCandidateJobs: 0,
      },
    })),
    /authority mode/i,
  );
});

test('resolver-only registry target is valid without a fabricated artifact URL', () => {
  const value = batch({
    artifactJobs: [],
    targets: [target({
      lifecycleState: 'REGISTRY_ONLY',
      legacyRuntimeId: 'historical-fa_ref_example',
      canonicalProductId: null,
      primaryJobId: null,
      candidateJobIds: [],
    })],
    summary: {
      artifactJobs: 0,
      targets: 1,
      candidateEdges: 0,
      excludedPriorAcceptedTargets: 0,
      excludedPriorCandidateJobs: 0,
    },
  });

  assert.equal(validateHistoricalEvidenceRecoveryBatch(value), value);
});

test('results require one typed terminal or accepted outcome per target', () => {
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results()), results());
  const disagreement = {
    ...EMPTY_RECONCILIATION,
    conflictHints: [{
      sourceRole: 'registry_hint', sourceId: 'energy-rating:dryer',
      kind: 'lower_authority_disagreement', fields: ['depthMm'],
      dimensionsMm: { widthMm: 600, heightMm: 850, depthMm: 670 },
    }],
  };
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results({
    outcomes: [{ ...results().outcomes[0], reconciliation: disagreement }],
  })).outcomes[0].reconciliation, disagreement);
  const exactAxisProof = {
    ...EMPTY_RECONCILIATION,
    conflictHints: [{
      sourceRole: 'registry_hint', sourceId: 'energy-rating:fridge',
      kind: 'axis_permutation', fields: ['heightMm', 'widthMm'],
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
    axisPermutationResolution: 'exact_official_axis_proof',
  };
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results({
    outcomes: [{ ...results().outcomes[0], reconciliation: exactAxisProof }],
  })).outcomes[0].reconciliation, exactAxisProof);
  const exactLegacyProof = {
    ...EMPTY_RECONCILIATION,
    conflictHints: [{
      sourceRole: 'legacy_hint', sourceId: 'legacy-catalog',
      kind: 'lower_authority_disagreement', fields: ['widthMm'],
      dimensionsMm: { widthMm: 910, heightMm: 1830, depthMm: 731 },
    }],
    lowerAuthorityResolution: 'exact_official_axis_proof_over_legacy_hint',
  };
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results({
    outcomes: [{ ...results().outcomes[0], reconciliation: exactLegacyProof }],
  })).outcomes[0].reconciliation, exactLegacyProof);
  const officialSemanticProof = {
    ...EMPTY_RECONCILIATION,
    officialSemanticResolution: 'explicit_appliance_depth_with_exact_product_page_corroboration',
  };
  assert.deepEqual(validateHistoricalEvidenceRecoveryResults(results({
    outcomes: [{ ...results().outcomes[0], reconciliation: officialSemanticProof }],
  })).outcomes[0].reconciliation, officialSemanticProof);
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
    () => validateHistoricalEvidenceRecoveryResults(results({
      outcomes: [{
        ...results().outcomes[0], status: 'accepted', failureCode: null,
        candidateInventory: {}, sources: [{ contentSha256: SHA_C }], geometryProjection: {},
        reconciliation: null,
      }],
      summary: { targets: 1, accepted: 1, nonScalar: 0, retryable: 0, terminal: 0 },
    })),
    /accepted.*reconciliation/i,
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
  assert.deepEqual(
    validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle({
      entries: [{
        ...bundle().entries[0],
        lifecycleState: 'REGISTRY_ONLY',
        canonicalProductId: null,
      }],
    })).entries[0].lifecycleState,
    'REGISTRY_ONLY',
  );
});

test('bundle batch rollback is hash-bound and removes only one promoted lineage', () => {
  const input = bundle();
  const result = rollbackHistoricalEvidenceRecoveryBundleBatch(input, {
    batchId: 'historical-recovery-batch-example',
    expectedBundleSha256: canonicalJsonSha256(input),
  });
  assert.equal(result.removedEntries, 1);
  assert.deepEqual(result.bundle.entries, []);
  assert.deepEqual(result.bundle.lineage, []);
  assert.throws(() => rollbackHistoricalEvidenceRecoveryBundleBatch(input, {
    batchId: 'historical-recovery-batch-example',
    expectedBundleSha256: SHA_A,
  }), /changed before rollback/i);
  assert.throws(() => rollbackHistoricalEvidenceRecoveryBundleBatch(input, {
    batchId: 'missing-batch',
    expectedBundleSha256: canonicalJsonSha256(input),
  }), /lineage/i);
});

test('bundle batch rollback can remove a terminal-only lineage with no promoted entries', () => {
  const input = bundle({
    entries: [],
    lineage: [{
      batchId: 'historical-recovery-terminal-only',
      batchSha256: SHA_A,
      queueSha256: SHA_B,
      resultsSha256: SHA_C,
      auditSha256: 'd'.repeat(64),
    }],
  });
  const result = rollbackHistoricalEvidenceRecoveryBundleBatch(input, {
    batchId: 'historical-recovery-terminal-only',
    expectedBundleSha256: canonicalJsonSha256(input),
  });

  assert.equal(result.removedEntries, 0);
  assert.deepEqual(result.bundle.entries, []);
  assert.deepEqual(result.bundle.lineage, []);
});
