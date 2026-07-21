import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalExecutableRecoveryQueue } from '../../src/domain/historical-executable-recovery-queue.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const QUEUE_SHA = 'a'.repeat(64);
const POLICY_SHA = 'b'.repeat(64);

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

function reference(record, overrides = {}) {
  return {
    referenceId: record.referenceId,
    category: record.category,
    brand: record.brand,
    model: record.model,
    lifecycleState: record.lifecycleState,
    lookupAction: 'MEASURE_REQUIRED',
    dimensionsMm: null,
    sources: [],
    catalogProductIds: record.legacyRuntimeIds,
    ...overrides,
  };
}

function candidate(candidateId, sourceUrl, authorityBrand, applicableReferenceIds) {
  return {
    candidateId,
    sourceUrl,
    authorityBrand,
    expectedContentType: 'application/pdf',
    categories: ['fridge'],
    documentTypes: ['installation_guide'],
    sourceRoles: ['manufacturer_document'],
    applicableReferenceIds,
    sourceRanks: applicableReferenceIds.map((referenceId) => ({ referenceId, sourceRank: 1 })),
    discoveries: [{
      resolverId: 'fixture-resolver',
      resolverVersion: '1',
      discoveryMethod: 'fixture',
      retrievedAt: '2026-07-19T00:00:00.000Z',
      runId: null,
      runContentSha256: null,
      discoveryProvenance: null,
    }],
  };
}

function edge(candidateId, sourceRank = 1) {
  return {
    candidateId,
    exactModelUrlSignal: true,
    sourceModelHintExact: true,
    requiredAttempt: true,
    sourceModelHints: [],
    documentTypes: ['installation_guide'],
    discoveryStrategyIds: ['fixture-resolver@1:fixture'],
    sourceRank,
  };
}

function manifestTarget(record, state, candidateEdges = [], overrides = {}) {
  return {
    referenceId: record.referenceId,
    acquisitionId: record.acquisitionId,
    category: record.category,
    brand: record.brand,
    model: record.model,
    lifecycleState: record.lifecycleState,
    priority: record.priority,
    route: record.route,
    executionReadiness: record.executionReadiness,
    state,
    terminal: state === 'NO_CANDIDATE_COMPLETE',
    retryableDiscovery: state === 'DISCOVERY_RETRYABLE',
    resolverContract: [{
      resolverId: 'fixture-resolver', version: '1', scope: 'exact-model', required: true,
    }],
    resolverResults: [],
    incompleteResolverIds: state === 'DISCOVERY_RETRYABLE' ? ['fixture-resolver'] : [],
    lastDiscoveryRunId: null,
    lastDiscoveryAt: null,
    referenceHintSourceIds: [],
    candidateEdges,
    ...overrides,
  };
}

function candidateManifest(records, candidates, targets) {
  const semanticPayload = {
    sourceAcquisitionQueueSha256: QUEUE_SHA,
    runBindings: [],
    candidates,
    targets,
  };
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    semanticManifestSha256: canonicalJsonSha256(semanticPayload),
    policy: {},
    ...semanticPayload,
    summary: {
      acquisitionRecords: records.length,
      targets: targets.length,
      candidates: candidates.length,
      candidateEdges: targets.reduce((sum, target) => sum + target.candidateEdges.length, 0),
      runBindings: 0,
      byState: Object.fromEntries([...new Set(targets.map((target) => target.state))]
        .sort().map((state) => [state, targets.filter((target) => target.state === state).length])),
    },
  };
}

function buildInput(records, manifest, overrides = {}) {
  return {
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-19T00:00:00.000Z',
      semanticQueueSha256: QUEUE_SHA,
      records,
      sources: [],
    },
    candidateManifest: manifest,
    historicalReference: { records: records.map((record) => reference(record)) },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    ...overrides,
  };
}

test('materializes ranked candidate edges, deduplicates a shared fetch, and isolates the same URL across brands', () => {
  const sharedUrl = 'https://documents.example.com/shared-family.pdf';
  const alternateUrl = 'https://documents.example.com/model-one.pdf';
  const records = [
    acquisition('one'),
    acquisition('two', {
      lifecycleState: 'CATALOG_ARCHIVED', priority: 'P1_CATALOG_ARCHIVED',
      legacyRuntimeIds: [], canonicalProductIds: [],
    }),
    acquisition('other', { brand: 'Other' }),
  ];
  const candidates = [
    candidate('candidate-example-shared', sharedUrl, 'Example', ['one', 'two']),
    candidate('candidate-example-alternate', alternateUrl, 'Example', ['one']),
    candidate('candidate-other-shared', sharedUrl, 'Other', ['other']),
  ];
  candidates[1].sourceRanks[0].sourceRank = 2;
  const targets = [
    manifestTarget(records[0], 'CANDIDATES_READY', [
      edge('candidate-example-shared', 1), edge('candidate-example-alternate', 2),
    ]),
    manifestTarget(records[1], 'CANDIDATES_READY', [edge('candidate-example-shared', 1)]),
    manifestTarget(records[2], 'CANDIDATES_READY', [edge('candidate-other-shared', 1)]),
  ];
  const manifest = candidateManifest(records, candidates, targets);
  const queue = buildHistoricalExecutableRecoveryQueue(buildInput(records, manifest));

  assert.equal(queue.jobs.length, 3);
  assert.equal(queue.targets.length, 3);
  assert.equal(queue.discoveryTargets.length, 0);
  assert.equal(queue.summary.candidateEdges, 4);
  assert.equal(queue.sourceOfficialCandidateManifestSha256, manifest.semanticManifestSha256);
  assert.ok(queue.jobs.every((job) => job.acquisitionRoute === 'OFFICIAL_HOST_AUTHORITY_VALIDATION'));
  const sameUrlJobs = queue.jobs.filter((job) => job.sourceUrl === sharedUrl);
  assert.equal(sameUrlJobs.length, 2);
  const exampleShared = sameUrlJobs.find((job) => job.authorityBrand === 'Example');
  assert.deepEqual(exampleShared.targetIds, queue.targets
    .filter((target) => ['one', 'two'].includes(target.referenceId))
    .map((target) => target.targetId).sort());
  assert.equal(exampleShared.priorityClass, 'P0_CURRENT_MISSING_DIMENSIONS');
  const one = queue.targets.find((target) => target.referenceId === 'one');
  assert.deepEqual(one.candidateEdges.map((candidateEdge) => candidateEdge.sourceRank), [1, 2]);
  assert.deepEqual(one.candidateJobIds, one.candidateEdges.map((candidateEdge) => candidateEdge.jobId));
});

test('separates retryable discovery and gives every non-acquisition target a typed reason', () => {
  const records = [
    acquisition('retry'), acquisition('research'), acquisition('complete-none'), acquisition('suppressed'),
  ];
  const suppressedUrl = 'https://documents.example.com/suppressed.pdf';
  const candidates = [candidate('candidate-suppressed', suppressedUrl, 'Example', ['suppressed'])];
  const targets = [
    manifestTarget(records[0], 'DISCOVERY_RETRYABLE'),
    manifestTarget(records[1], 'RESEARCH_REQUIRED'),
    manifestTarget(records[2], 'NO_CANDIDATE_COMPLETE', [], {
      terminal: true, retryableDiscovery: false, incompleteResolverIds: [],
    }),
    manifestTarget(records[3], 'CANDIDATES_READY', [edge('candidate-suppressed')], {
      retryableDiscovery: false, incompleteResolverIds: [],
    }),
  ];
  const manifest = candidateManifest(records, candidates, targets);
  const queue = buildHistoricalExecutableRecoveryQueue(buildInput(records, manifest, {
    recoveryPolicySha256: POLICY_SHA,
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [{
        attemptId: 'attempt-suppressed', targetId: 'ignored', referenceId: 'suppressed',
        sourceUrl: suppressedUrl, contentSha256: 'c'.repeat(64), status: 'identity_rejected',
        failureCode: 'identity', policySha256: POLICY_SHA, suppressesSamePolicySource: true,
      }],
    },
  }));

  assert.equal(queue.targets.length, 0);
  assert.deepEqual(queue.discoveryTargets.map((target) => target.referenceId), ['retry', 'suppressed']);
  assert.equal(queue.summary.resolverOnlyTargets, 0);
  assert.deepEqual(queue.summary.excluded, {
    NO_CANDIDATE_COMPLETE: 1,
    RESEARCH_REQUIRED: 1,
  });
  assert.equal(queue.summary.suppressedPriorTerminalEdges, 1);
});

test('candidate manifest bindings and candidate-ready edge invariants fail closed', () => {
  const record = acquisition('one');
  const missingEdgeTarget = manifestTarget(record, 'CANDIDATES_READY');
  const invalid = candidateManifest([record], [], [missingEdgeTarget]);
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], invalid)),
    /candidate-ready.*edge/i,
  );

  const validCandidate = candidate('candidate-one', 'https://documents.example.com/one.pdf', 'Example', ['one']);
  const validTarget = manifestTarget(record, 'CANDIDATES_READY', [edge(validCandidate.candidateId)]);
  const queueDrift = candidateManifest([record], [validCandidate], [validTarget]);
  queueDrift.sourceAcquisitionQueueSha256 = 'd'.repeat(64);
  queueDrift.semanticManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: queueDrift.sourceAcquisitionQueueSha256,
    runBindings: queueDrift.runBindings,
    candidates: queueDrift.candidates,
    targets: queueDrift.targets,
  });
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], queueDrift)),
    /acquisition queue.*binding/i,
  );

  const targetDrift = candidateManifest([record], [validCandidate], [validTarget]);
  targetDrift.targets[0].route = 'OFFICIAL_REACQUIRE';
  targetDrift.semanticManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: targetDrift.sourceAcquisitionQueueSha256,
    runBindings: targetDrift.runBindings,
    candidates: targetDrift.candidates,
    targets: targetDrift.targets,
  });
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], targetDrift)),
    /target identity drift/i,
  );

  const duplicateUrlCandidate = structuredClone(validCandidate);
  duplicateUrlCandidate.candidateId = 'candidate-one-duplicate';
  duplicateUrlCandidate.sourceRanks[0].sourceRank = 2;
  const duplicateUrlTarget = manifestTarget(record, 'CANDIDATES_READY', [
    edge(validCandidate.candidateId, 1), edge(duplicateUrlCandidate.candidateId, 2),
  ]);
  const duplicateUrl = candidateManifest(
    [record], [validCandidate, duplicateUrlCandidate], [duplicateUrlTarget],
  );
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], duplicateUrl)),
    /duplicate candidate URL/i,
  );

  const rankGapCandidate = structuredClone(validCandidate);
  rankGapCandidate.sourceRanks[0].sourceRank = 2;
  const rankGap = candidateManifest(
    [record], [rankGapCandidate], [manifestTarget(record, 'CANDIDATES_READY', [
      edge(rankGapCandidate.candidateId, 2),
    ])],
  );
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], rankGap)),
    /edge rank invalid/i,
  );

  const terminalWithCandidate = candidateManifest(
    [record], [validCandidate], [manifestTarget(record, 'NO_CANDIDATE_COMPLETE', [
      edge(validCandidate.candidateId),
    ], {
      terminal: true, retryableDiscovery: false, incompleteResolverIds: [],
    })],
  );
  assert.throws(
    () => buildHistoricalExecutableRecoveryQueue(buildInput([record], terminalWithCandidate)),
    /terminal.*candidate edge/i,
  );
});
