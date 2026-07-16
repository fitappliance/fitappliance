import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalExecutableRecoveryQueue } from '../../src/domain/historical-executable-recovery-queue.mjs';
import { historicalResolverContractSha256 } from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';

const fields = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function acquisition(referenceId, overrides = {}) {
  return {
    acquisitionId: `acquisition-${referenceId}`,
    referenceId,
    category: 'fridge',
    brand: 'Example',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CURRENT_RETAIL',
    priority: 'P0_CURRENT_RETAIL',
    operationalClass: 'OFFICIAL_DISCOVERY',
    route: 'OFFICIAL_DISCOVERY',
    executionReadiness: 'DISCOVERY_READY',
    candidateSourceIds: [],
    resolverIds: ['example-resolver'],
    legacyRecoveryTargetIds: [],
    legacyRuntimeIds: [`product-${referenceId}`],
    canonicalProductIds: [`canonical-${referenceId}`],
    ...overrides,
  };
}

function reference(referenceId, overrides = {}) {
  return {
    referenceId,
    category: 'fridge',
    brand: 'Example',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CURRENT_RETAIL',
    lookupAction: 'MEASURE_REQUIRED',
    dimensionsMm: null,
    sources: [],
    catalogProductIds: [`product-${referenceId}`],
    ...overrides,
  };
}

test('materializes official and resolver-only targets without fabricating source URLs', () => {
  const records = [
    acquisition('official', { candidateSourceIds: ['source-official'] }),
    acquisition('registry', {
      lifecycleState: 'REGISTRY_ONLY',
      priority: 'P2_REGISTRY_ONLY',
      legacyRuntimeIds: [],
      canonicalProductIds: [],
    }),
    acquisition('identity', {
      operationalClass: 'IDENTITY_RESEARCH', route: 'IDENTITY_CLOSURE',
      executionReadiness: 'RESEARCH_REQUIRED',
    }),
  ];
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records,
      sources: [{
        sourceId: 'source-official',
        sourceUrl: 'https://example.com/official.pdf',
        sourceAuthority: 'OFFICIAL',
        receiptEligible: true,
        documentIds: ['doc-official'],
        referenceIds: ['official'],
      }],
    },
    historicalReference: {
      records: [
        reference('official'),
        reference('registry', { lifecycleState: 'REGISTRY_ONLY', catalogProductIds: [] }),
        reference('identity'),
      ],
    },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
  });

  assert.equal(queue.schemaVersion, 2);
  assert.equal(queue.targets.length, 2);
  assert.equal(queue.jobs.length, 1);
  const registry = queue.targets.find((target) => target.referenceId === 'registry');
  assert.equal(registry.lifecycleState, 'REGISTRY_ONLY');
  assert.equal(registry.legacyRuntimeId, 'historical-registry');
  assert.equal(registry.primaryJobId, null);
  assert.deepEqual(registry.candidateJobIds, []);
  assert.deepEqual(registry.requestedFields, fields);
  assert.equal(queue.summary.excluded.RESEARCH_REQUIRED, 1);
});

test('materializes resolver-backed identity closure but keeps unresolved identity research excluded', () => {
  const records = [
    acquisition('identity-resolved', {
      operationalClass: 'IDENTITY_RESEARCH',
      route: 'IDENTITY_CLOSURE',
      executionReadiness: 'DISCOVERY_READY',
      resolverIds: ['example-resolver'],
    }),
    acquisition('identity-unresolved', {
      operationalClass: 'IDENTITY_RESEARCH',
      route: 'IDENTITY_CLOSURE',
      executionReadiness: 'RESEARCH_REQUIRED',
      resolverIds: [],
    }),
  ];
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records,
      sources: [],
    },
    historicalReference: {
      records: [reference('identity-resolved'), reference('identity-unresolved')],
    },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
  });

  assert.equal(queue.targets.length, 1);
  assert.equal(queue.targets[0].referenceId, 'identity-resolved');
  assert.equal(queue.targets[0].primaryJobId, null);
  assert.equal(queue.summary.excluded.RESEARCH_REQUIRED, 1);
});

test('reuses legacy reconciliation hints but not stale legacy candidate edges', () => {
  const legacyTarget = {
    targetId: 'legacy-target',
    referenceId: 'official',
    legacyRuntimeId: 'product-official',
    canonicalProductId: 'canonical-official',
    brand: 'Example',
    model: 'OFFICIAL',
    category: 'fridge',
    lifecycleState: 'CURRENT_RETAIL',
    requestedFields: fields,
    primaryJobId: 'stale-job',
    candidateJobIds: ['stale-job'],
    registryDimensionHints: [],
    legacyHints: [{
      sourceDocumentId: 'legacy-doc',
      dimensionsMm: { width: 600, height: 1700, depth: 650 },
    }],
    sourceDocumentIds: ['legacy-doc'],
    publicationEligible: false,
  };
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('official')],
      sources: [],
    },
    historicalReference: { records: [reference('official')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [legacyTarget] },
  });

  assert.equal(queue.targets[0].targetId, 'legacy-target');
  assert.deepEqual(queue.targets[0].legacyHints, legacyTarget.legacyHints);
  assert.deepEqual(queue.targets[0].candidateJobIds, []);
});

test('materializes parser repair from the official PDF while preserving accepted target identity', () => {
  const record = acquisition('repair', {
    operationalClass: 'OFFLINE_PARSER_REPAIR',
    route: 'PARSER_REPAIR',
    executionReadiness: 'OFFLINE_REPAIR',
    candidateSourceIds: ['source-repair'],
    canonicalProductIds: [],
  });
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [record],
      sources: [{
        sourceId: 'source-repair', sourceUrl: 'https://example.com/repair.pdf',
        sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['pdf:repair'], referenceIds: ['repair'],
      }],
    },
    historicalReference: { records: [reference('repair')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    priorAcceptanceBundle: { entries: [{
      targetId: 'accepted-repair-target', referenceId: 'repair',
      legacyRuntimeId: 'accepted-runtime', canonicalProductId: 'accepted-product',
      brand: 'Example', model: 'REPAIR', category: 'fridge',
      lifecycleState: 'CURRENT_RETAIL', acceptanceStatus: 'accepted',
    }] },
  });

  assert.equal(queue.targets.length, 1);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.targets[0].targetId, 'accepted-repair-target');
  assert.equal(queue.targets[0].canonicalProductId, 'accepted-product');
  assert.equal(queue.targets[0].repairExistingReceipt, true);
  assert.equal(queue.jobs[0].acquisitionRoute, 'OFFICIAL_RECEIPT_REBUILD');
});

test('same-policy terminal source becomes resolver-only but preserves alternative-source research', () => {
  const sourceUrl = 'https://example.com/repointed-family.pdf';
  const policySha256 = 'b'.repeat(64);
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('official', { candidateSourceIds: ['source-official'] })],
      sources: [{
        sourceId: 'source-official', sourceUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['pdf:family'], referenceIds: ['official'],
      }],
    },
    historicalReference: { records: [reference('official')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    recoveryPolicySha256: policySha256,
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [{
        attemptId: 'attempt-family', targetId: 'recovery_target_ignored',
        referenceId: 'official', sourceUrl, contentSha256: 'c'.repeat(64),
        status: 'identity_rejected', failureCode: 'identity', policySha256,
        suppressesSamePolicySource: true,
      }],
    },
  });

  assert.equal(queue.jobs.length, 0);
  assert.equal(queue.targets.length, 1);
  assert.deepEqual(queue.targets[0].candidateJobIds, []);
  assert.equal(queue.targets[0].priorAttemptSuppressions.length, 1);
  assert.equal(queue.targets[0].priorAttemptSuppressions[0].sourceUrl, sourceUrl);
  assert.equal(queue.summary.suppressedPriorTerminalEdges, 1);

  const changedPolicy = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('official', { candidateSourceIds: ['source-official'] })],
      sources: [{
        sourceId: 'source-official', sourceUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['pdf:family'], referenceIds: ['official'],
      }],
    },
    historicalReference: { records: [reference('official')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    recoveryPolicySha256: 'd'.repeat(64),
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [{
        attemptId: 'attempt-family', targetId: 'recovery_target_ignored',
        referenceId: 'official', sourceUrl, contentSha256: 'c'.repeat(64),
        status: 'identity_rejected', failureCode: 'identity', policySha256,
        suppressesSamePolicySource: true,
      }],
    },
  });
  assert.equal(changedPolicy.jobs.length, 1);
  assert.equal(changedPolicy.targets[0].priorAttemptSuppressions, undefined);
});

test('same-policy complete zero-candidate discovery suppresses only resolver-only targets', () => {
  const policySha256 = 'b'.repeat(64);
  const targetAttempt = {
    targetAttemptId: 'target-attempt-official',
    targetId: 'recovery_target_ignored',
    referenceId: 'official',
    status: 'claims_incomplete',
    failureCode: 'source_authority',
    policySha256,
    suppressesSamePolicyResolverOnly: true,
    resolvers: [{
      resolverId: 'official-resolver', version: '1', scope: 'exact-model', required: true,
    }],
  };
  const currentResolverContractSha256 = historicalResolverContractSha256(targetAttempt.resolvers);
  const base = {
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('official')],
      sources: [],
    },
    historicalReference: { records: [reference('official')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    priorAttemptLedger: { schemaVersion: 1, entries: [], targetAttempts: [targetAttempt] },
  };

  const suppressed = buildHistoricalExecutableRecoveryQueue({
    ...base,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => currentResolverContractSha256,
  });
  assert.equal(suppressed.targets.length, 0);
  assert.equal(suppressed.summary.suppressedPriorResolverOnlyTargets, 1);

  const changedPolicy = buildHistoricalExecutableRecoveryQueue({
    ...base,
    recoveryPolicySha256: 'd'.repeat(64),
    resolverContractSha256ForTarget: () => currentResolverContractSha256,
  });
  assert.equal(changedPolicy.targets.length, 1);
  assert.deepEqual(changedPolicy.targets[0].candidateJobIds, []);

  const changedResolver = buildHistoricalExecutableRecoveryQueue({
    ...base,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => historicalResolverContractSha256([{
      ...targetAttempt.resolvers[0], version: '2',
    }]),
  });
  assert.equal(changedResolver.targets.length, 1);
  assert.deepEqual(changedResolver.targets[0].candidateJobIds, []);

  const explicitSource = structuredClone(base);
  explicitSource.acquisitionQueue.records[0].candidateSourceIds = ['source-official'];
  explicitSource.acquisitionQueue.sources = [{
    sourceId: 'source-official', sourceUrl: 'https://example.com/new-official.pdf',
    sourceAuthority: 'OFFICIAL', receiptEligible: true,
    documentIds: ['pdf:new'], referenceIds: ['official'],
  }];
  const reopened = buildHistoricalExecutableRecoveryQueue({
    ...explicitSource,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => currentResolverContractSha256,
  });
  assert.equal(reopened.targets.length, 1);
  assert.equal(reopened.jobs.length, 1);
});

test('same-policy accepted source is not fetched again while its conflicted target remains researchable', () => {
  const sourceUrl = 'https://example.com/exact-model-manual.pdf';
  const policySha256 = 'b'.repeat(64);
  const input = {
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('conflict', {
        operationalClass: 'CONFLICT_QUARANTINE',
        route: 'OFFICIAL_REACQUIRE',
        executionReadiness: 'BOUNDED_READY',
        candidateSourceIds: ['source-official'],
      })],
      sources: [{
        sourceId: 'source-official', sourceUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['pdf:manual'], referenceIds: ['conflict'],
      }],
    },
    historicalReference: { records: [reference('conflict')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [],
      resolutions: [],
      sourceAcceptances: [{
        sourceAcceptanceId: 'source-acceptance-manual',
        targetId: 'different-target-id', referenceId: 'conflict', sourceUrl,
        contentSha256: 'c'.repeat(64), status: 'accepted', policySha256,
      }],
    },
  };

  const queue = buildHistoricalExecutableRecoveryQueue({
    ...input, recoveryPolicySha256: policySha256,
  });
  assert.equal(queue.jobs.length, 0);
  assert.equal(queue.targets.length, 1);
  assert.deepEqual(queue.targets[0].candidateJobIds, []);
  assert.equal(queue.targets[0].priorSourceAcceptances.length, 1);
  assert.equal(queue.targets[0].priorSourceAcceptances[0].sourceUrl, sourceUrl);
  assert.equal(queue.summary.suppressedPriorAcceptedSourceEdges, 1);

  const changedPolicy = buildHistoricalExecutableRecoveryQueue({
    ...input, recoveryPolicySha256: 'd'.repeat(64),
  });
  assert.equal(changedPolicy.jobs.length, 1);
  assert.equal(changedPolicy.targets[0].priorSourceAcceptances, undefined);
});
