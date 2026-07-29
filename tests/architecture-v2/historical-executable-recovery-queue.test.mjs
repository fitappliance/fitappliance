import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalExecutableRecoveryQueue as buildQueueFromManifest } from '../../src/domain/historical-executable-recovery-queue.mjs';
import { historicalResolverContractSha256 } from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from '../../src/domain/beko-product-page-dimensions.mjs';
import { SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY } from '../../src/domain/smeg-pdf-dimensions.mjs';

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

function candidateManifestFor(acquisitionQueue) {
  const officialSources = acquisitionQueue.sources.filter((source) => (
    source.sourceAuthority === 'OFFICIAL' && source.receiptEligible === true
  ));
  const candidates = officialSources.map((source) => ({
    candidateId: `candidate-${source.sourceId}`,
    sourceUrl: source.sourceUrl,
    authorityBrand: acquisitionQueue.records.find((record) => (
      (source.referenceIds ?? []).includes(record.referenceId)
    ))?.brand ?? 'Example',
    expectedContentType: source.sourceUrl.endsWith('.pdf') ? 'application/pdf' : 'text/html',
    categories: [...new Set(acquisitionQueue.records.filter((record) => (
      (source.referenceIds ?? []).includes(record.referenceId)
    )).map((record) => record.category))].sort(),
    documentTypes: [source.sourceUrl.endsWith('.pdf') ? 'manual' : 'product_page'],
    sourceRoles: ['manufacturer_document'],
    applicableReferenceIds: [...source.referenceIds].sort(),
    sourceRanks: source.referenceIds.map((referenceId) => ({ referenceId, sourceRank: 1 })),
    discoveries: [{
      resolverId: 'fixture-resolver', resolverVersion: '1', discoveryMethod: 'fixture',
      retrievedAt: acquisitionQueue.generatedAt, runId: null, runContentSha256: null,
      discoveryProvenance: null,
    }],
  }));
  const candidateBySourceId = new Map(officialSources.map((source, index) => [
    source.sourceId, candidates[index],
  ]));
  const targets = acquisitionQueue.records.map((record) => {
    const candidateEdges = record.candidateSourceIds
      .map((sourceId) => candidateBySourceId.get(sourceId))
      .filter(Boolean)
      .map((candidate, index) => ({
        candidateId: candidate.candidateId,
        exactModelUrlSignal: true,
        sourceModelHintExact: true,
        requiredAttempt: true,
        sourceModelHints: [record.model],
        documentTypes: [...candidate.documentTypes],
        discoveryStrategyIds: ['fixture-resolver@1:fixture'],
        sourceRank: index + 1,
      }));
    for (const edge of candidateEdges) {
      const candidate = candidates.find((row) => row.candidateId === edge.candidateId);
      candidate.sourceRanks.find((binding) => binding.referenceId === record.referenceId).sourceRank = edge.sourceRank;
    }
    const state = candidateEdges.length > 0
      ? 'CANDIDATES_READY'
      : record.executionReadiness === 'RESEARCH_REQUIRED' ? 'RESEARCH_REQUIRED' : 'DISCOVERY_RETRYABLE';
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
      terminal: false,
      retryableDiscovery: state === 'DISCOVERY_RETRYABLE',
      resolverContract: [{ resolverId: 'fixture-resolver', version: '1', scope: 'exact-model', required: true }],
      resolverResults: [],
      incompleteResolverIds: state === 'DISCOVERY_RETRYABLE' ? ['fixture-resolver'] : [],
      lastDiscoveryRunId: null,
      lastDiscoveryAt: null,
      referenceHintSourceIds: [],
      candidateEdges,
    };
  });
  const semanticPayload = {
    sourceAcquisitionQueueSha256: acquisitionQueue.semanticQueueSha256,
    runBindings: [], candidates, targets,
  };
  return {
    schemaVersion: 1,
    generatedAt: acquisitionQueue.generatedAt,
    semanticManifestSha256: canonicalJsonSha256(semanticPayload),
    policy: {},
    ...semanticPayload,
    summary: {
      acquisitionRecords: acquisitionQueue.records.length,
      targets: targets.length,
      candidates: candidates.length,
      candidateEdges: targets.reduce((sum, target) => sum + target.candidateEdges.length, 0),
      runBindings: 0,
      byState: Object.fromEntries([...new Set(targets.map((target) => target.state))].sort()
        .map((state) => [state, targets.filter((target) => target.state === state).length])),
    },
  };
}

function buildQueue(input) {
  return buildQueueFromManifest({
    ...input,
    candidateManifest: input.candidateManifest ?? candidateManifestFor(input.acquisitionQueue),
  });
}

test('materializes acquisition and bounded-discovery targets without fabricating source URLs', () => {
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
  const queue = buildQueue({
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
  assert.equal(queue.targets.length, 1);
  assert.equal(queue.discoveryTargets.length, 1);
  assert.equal(queue.jobs.length, 1);
  const registry = queue.discoveryTargets.find((target) => target.referenceId === 'registry');
  assert.equal(registry.lifecycleState, 'REGISTRY_ONLY');
  assert.equal(registry.legacyRuntimeId, 'historical-registry');
  assert.equal(registry.primaryJobId, null);
  assert.deepEqual(registry.candidateJobIds, []);
  assert.deepEqual(registry.requestedFields, fields);
  assert.equal(queue.summary.excluded.RESEARCH_REQUIRED, 1);
});

test('keeps retryable candidate observations non-executable until required resolvers complete', () => {
  const record = acquisition('partial', { candidateSourceIds: ['source-partial'] });
  const acquisitionQueue = {
    schemaVersion: 1,
    generatedAt: '2026-07-14T00:00:00.000Z',
    semanticQueueSha256: 'a'.repeat(64),
    records: [record],
    sources: [{
      sourceId: 'source-partial',
      sourceUrl: 'https://example.com/partial.pdf',
      sourceAuthority: 'OFFICIAL',
      receiptEligible: true,
      documentIds: ['doc-partial'],
      referenceIds: ['partial'],
    }],
  };
  const manifest = candidateManifestFor(acquisitionQueue);
  manifest.targets[0].state = 'DISCOVERY_RETRYABLE';
  manifest.targets[0].retryableDiscovery = true;
  manifest.targets[0].incompleteResolverIds = ['fixture-resolver'];
  manifest.summary.byState = { DISCOVERY_RETRYABLE: 1 };
  manifest.semanticManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: manifest.sourceAcquisitionQueueSha256,
    runBindings: manifest.runBindings,
    candidates: manifest.candidates,
    targets: manifest.targets,
  });

  const queue = buildQueue({
    acquisitionQueue,
    candidateManifest: manifest,
    historicalReference: { records: [reference('partial')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
  });

  assert.equal(queue.jobs.length, 0);
  assert.equal(queue.targets.length, 0);
  assert.equal(queue.discoveryTargets.length, 1);
  assert.deepEqual(queue.discoveryTargets[0].candidateJobIds, []);
  assert.deepEqual(queue.discoveryTargets[0].observedCandidateIds, [manifest.candidates[0].candidateId]);
  assert.equal(queue.summary.candidateEdges, 0);
  assert.equal(queue.summary.observedCandidateEdges, 1);
  assert.equal(queue.summary.isolatedNonReadyCandidateEdges, 1);
});

test('stops rerunning a legacy aggregate resolver after its diagnostic discovery', () => {
  const record = acquisition('legacy-resolver');
  const acquisitionQueue = {
    schemaVersion: 1,
    generatedAt: '2026-07-14T00:00:00.000Z',
    semanticQueueSha256: 'a'.repeat(64),
    records: [record],
    sources: [],
  };
  const manifest = candidateManifestFor(acquisitionQueue);
  manifest.targets[0].legacyAggregateResolverIds = ['fixture-resolver'];
  manifest.targets[0].lastDiscoveryRunId = 'legacy-resolver-diagnostic-run';
  manifest.targets[0].lastDiscoveryAt = '2026-07-14T00:01:00.000Z';
  manifest.semanticManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: manifest.sourceAcquisitionQueueSha256,
    runBindings: manifest.runBindings,
    candidates: manifest.candidates,
    targets: manifest.targets,
  });

  const queue = buildQueue({
    acquisitionQueue,
    candidateManifest: manifest,
    historicalReference: { records: [reference('legacy-resolver')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
  });

  assert.equal(queue.discoveryTargets.length, 0);
  assert.equal(queue.deferredTargets.length, 1);
  assert.equal(queue.deferredTargets[0].dispositionReason, 'LEGACY_RESOLVER_CONTRACT');
  assert.equal(queue.summary.excluded.LEGACY_RESOLVER_CONTRACT, 1);
});

test('stops only the diagnosed legacy target without suppressing unresolved siblings or ready candidates', () => {
  const records = [
    acquisition('legacy-diagnostic'),
    acquisition('legacy-unseen'),
    acquisition('legacy-revised'),
    acquisition('legacy-positive', { candidateSourceIds: ['source-positive'] }),
  ];
  const acquisitionQueue = {
    schemaVersion: 1,
    generatedAt: '2026-07-14T00:00:00.000Z',
    semanticQueueSha256: 'a'.repeat(64),
    records,
    sources: [{
      sourceId: 'source-positive',
      sourceUrl: 'https://example.com/positive.pdf',
      sourceAuthority: 'OFFICIAL',
      receiptEligible: true,
      documentIds: ['doc-positive'],
      referenceIds: ['legacy-positive'],
    }],
  };
  const manifest = candidateManifestFor(acquisitionQueue);
  const diagnostic = manifest.targets.find((target) => target.referenceId === 'legacy-diagnostic');
  diagnostic.legacyAggregateResolverIds = ['fixture-resolver'];
  diagnostic.lastDiscoveryRunId = 'legacy-resolver-diagnostic-run';
  diagnostic.lastDiscoveryAt = '2026-07-14T00:01:00.000Z';
  const revised = manifest.targets.find((target) => target.referenceId === 'legacy-revised');
  revised.resolverContract[0].version = '2';
  manifest.semanticManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: manifest.sourceAcquisitionQueueSha256,
    runBindings: manifest.runBindings,
    candidates: manifest.candidates,
    targets: manifest.targets,
  });

  const queue = buildQueue({
    acquisitionQueue,
    candidateManifest: manifest,
    historicalReference: { records: records.map((record) => reference(record.referenceId)) },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
  });

  assert.deepEqual(queue.discoveryTargets.map((target) => target.referenceId).sort(), [
    'legacy-revised',
    'legacy-unseen',
  ]);
  assert.deepEqual(queue.deferredTargets.map((target) => target.referenceId), [
    'legacy-diagnostic',
  ]);
  assert.deepEqual(queue.deferredTargets[0].legacyAggregateResolverIds, ['fixture-resolver']);
  assert.equal(queue.summary.excluded.LEGACY_RESOLVER_CONTRACT, 1);
  assert.equal(queue.targets.length, 1);
  assert.equal(queue.targets[0].referenceId, 'legacy-positive');
});

test('separates resolver-backed identity discovery and keeps unresolved identity research deferred', () => {
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
  const queue = buildQueue({
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

  assert.equal(queue.targets.length, 0);
  assert.equal(queue.discoveryTargets.length, 1);
  assert.equal(queue.discoveryTargets[0].referenceId, 'identity-resolved');
  assert.equal(queue.discoveryTargets[0].primaryJobId, null);
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
  const queue = buildQueue({
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

  assert.equal(queue.discoveryTargets[0].targetId, 'legacy-target');
  assert.deepEqual(queue.discoveryTargets[0].legacyHints, legacyTarget.legacyHints);
  assert.deepEqual(queue.discoveryTargets[0].candidateJobIds, []);
});

test('materializes parser repair from the official PDF while preserving accepted target identity', () => {
  const record = acquisition('repair', {
    operationalClass: 'OFFLINE_PARSER_REPAIR',
    route: 'PARSER_REPAIR',
    executionReadiness: 'OFFLINE_REPAIR',
    candidateSourceIds: ['source-repair'],
    canonicalProductIds: [],
  });
  const queue = buildQueue({
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

test('same-policy terminal source moves to bounded discovery and preserves alternative-source research', () => {
  const sourceUrl = 'https://example.com/repointed-family.pdf';
  const policySha256 = 'b'.repeat(64);
  const queue = buildQueue({
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
  assert.equal(queue.targets.length, 0);
  assert.equal(queue.discoveryTargets.length, 1);
  assert.deepEqual(queue.discoveryTargets[0].candidateJobIds, []);
  assert.equal(queue.discoveryTargets[0].priorAttemptSuppressions.length, 1);
  assert.equal(queue.discoveryTargets[0].priorAttemptSuppressions[0].sourceUrl, sourceUrl);
  assert.equal(queue.summary.suppressedPriorTerminalEdges, 1);

  const changedPolicy = buildQueue({
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

test('a permanent missing source and exhausted resolver defer the target instead of rerunning acquisition', () => {
  const sourceUrl = 'https://example.com/missing.pdf';
  const policySha256 = 'b'.repeat(64);
  const resolverContract = [{
    resolverId: 'fixture-resolver', version: '1', scope: 'exact-model', required: true,
  }];
  const acquisitionQueue = {
    schemaVersion: 1,
    generatedAt: '2026-07-14T00:00:00.000Z',
    semanticQueueSha256: 'a'.repeat(64),
    records: [acquisition('missing', { candidateSourceIds: ['source-missing'] })],
    sources: [{
      sourceId: 'source-missing', sourceUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
      documentIds: ['doc-missing'], referenceIds: ['missing'],
    }],
  };
  const queue = buildQueue({
    acquisitionQueue,
    historicalReference: { records: [reference('missing')] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => historicalResolverContractSha256(resolverContract),
    priorAttemptLedger: {
      schemaVersion: 1,
      resolutions: [],
      sourceAcceptances: [],
      entries: [{
        attemptId: 'attempt-missing', targetId: 'different-target', referenceId: 'missing',
        sourceUrl, contentSha256: null, status: 'terminal_failure', failureCode: 'payload',
        reason: 'http_404', policySha256, suppressesSamePolicySource: true,
      }],
      targetAttempts: [{
        targetAttemptId: 'target-attempt-missing', targetId: 'different-target', referenceId: 'missing',
        reason: 'complete_exhausted_candidate_inventory', policySha256,
        suppressesSamePolicyResolverOnly: true, resolvers: resolverContract,
      }],
    },
  });

  assert.equal(queue.targets.length, 0);
  assert.equal(queue.discoveryTargets.length, 0);
  assert.equal(queue.deferredTargets.length, 1);
  assert.equal(queue.deferredTargets[0].dispositionReason, 'ACTIVE_RESOLVER_SUPPRESSION');
});

test('a bounded Beko HTML processor change reopens only the product page and keeps its PDF identity rejection closed', () => {
  const policySha256 = 'b'.repeat(64);
  const htmlUrl = 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x';
  const pdfUrl = 'https://www.beko.com/content/manual.pdf';
  const queue = buildQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-17T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('beko', {
        brand: 'Beko', model: 'BBM450X', candidateSourceIds: ['source-html', 'source-pdf'],
      })],
      sources: [{
        sourceId: 'source-html', sourceUrl: htmlUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['html:beko'], referenceIds: ['beko'],
      }, {
        sourceId: 'source-pdf', sourceUrl: pdfUrl, sourceAuthority: 'OFFICIAL', receiptEligible: true,
        documentIds: ['pdf:beko'], referenceIds: ['beko'],
      }],
    },
    historicalReference: { records: [reference('beko', { brand: 'Beko', model: 'BBM450X' })] },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    recoveryPolicySha256: policySha256,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: '2'.repeat(64) },
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [{
        attemptId: 'attempt-html', targetId: 'ignored', referenceId: 'beko', brand: 'Beko',
        sourceUrl: htmlUrl, contentSha256: 'c'.repeat(64), status: 'claims_incomplete',
        failureCode: 'claim_semantics', policySha256, suppressesSamePolicySource: true,
        processorCapability: BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY,
        evidenceProcessorSha256: '1'.repeat(64),
      }, {
        attemptId: 'attempt-pdf', targetId: 'ignored', referenceId: 'beko', brand: 'Beko',
        sourceUrl: pdfUrl, contentSha256: 'd'.repeat(64), status: 'identity_rejected',
        failureCode: 'identity', policySha256, suppressesSamePolicySource: true,
      }],
    },
  });

  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].sourceUrl, htmlUrl);
  assert.deepEqual(queue.targets[0].candidateJobIds, [queue.jobs[0].jobId]);
  assert.deepEqual(queue.targets[0].priorAttemptSuppressions.map((entry) => entry.sourceUrl), [pdfUrl]);
});

test('a bounded Smeg MinerU processor change reopens only its exact Techspec PDF failure', () => {
  const policySha256 = 'b'.repeat(64);
  const techspecUrl = 'https://sys.smeg.com.au/Product/Techspecs/DWAI6314X.pdf';
  const manualUrl = 'https://sys.smeg.com.au/Manuals/DWAI6314X.pdf';
  const queue = buildQueue({
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-17T00:00:00.000Z',
      semanticQueueSha256: 'a'.repeat(64),
      records: [acquisition('smeg', {
        category: 'dishwasher', brand: 'Smeg', model: 'DWAI6314X',
        candidateSourceIds: ['source-techspec', 'source-manual'],
      })],
      sources: [{
        sourceId: 'source-techspec', sourceUrl: techspecUrl, sourceAuthority: 'OFFICIAL',
        receiptEligible: true, documentIds: ['pdf:smeg-techspec'], referenceIds: ['smeg'],
      }, {
        sourceId: 'source-manual', sourceUrl: manualUrl, sourceAuthority: 'OFFICIAL',
        receiptEligible: true, documentIds: ['pdf:smeg-manual'], referenceIds: ['smeg'],
      }],
    },
    historicalReference: {
      records: [reference('smeg', { category: 'dishwasher', brand: 'Smeg', model: 'DWAI6314X' })],
    },
    legacyRecoveryQueue: { schemaVersion: 2, jobs: [], targets: [] },
    recoveryPolicySha256: policySha256,
    evidenceProcessorEpochs: { [SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY]: '2'.repeat(64) },
    priorAttemptLedger: {
      schemaVersion: 1,
      entries: [{
        attemptId: 'attempt-techspec', targetId: 'ignored', referenceId: 'smeg', brand: 'Smeg',
        sourceUrl: techspecUrl, contentSha256: 'c'.repeat(64), status: 'mineru_failure',
        failureCode: 'mineru', policySha256, suppressesSamePolicySource: true,
        processorCapability: SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY,
        evidenceProcessorSha256: '1'.repeat(64),
      }, {
        attemptId: 'attempt-manual', targetId: 'ignored', referenceId: 'smeg', brand: 'Smeg',
        sourceUrl: manualUrl, contentSha256: 'd'.repeat(64), status: 'identity_rejected',
        failureCode: 'identity', policySha256, suppressesSamePolicySource: true,
      }],
    },
  });

  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].sourceUrl, techspecUrl);
  assert.deepEqual(queue.targets[0].candidateJobIds, [queue.jobs[0].jobId]);
  assert.deepEqual(queue.targets[0].priorAttemptSuppressions.map((entry) => entry.sourceUrl), [manualUrl]);
});

test('same-policy complete zero-candidate discovery stays suppressed across resolver revisions', () => {
  const policySha256 = 'b'.repeat(64);
  const targetAttempt = {
    targetAttemptId: 'target-attempt-official',
    targetId: 'recovery_target_ignored',
    referenceId: 'official',
    status: 'claims_incomplete',
    failureCode: 'source_authority',
    reason: 'complete_zero_candidate_inventory',
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

  const suppressed = buildQueue({
    ...base,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => currentResolverContractSha256,
  });
  assert.equal(suppressed.targets.length, 0);
  assert.equal(suppressed.summary.suppressedPriorResolverOnlyTargets, 1);

  const changedPolicy = buildQueue({
    ...base,
    recoveryPolicySha256: 'd'.repeat(64),
    resolverContractSha256ForTarget: () => currentResolverContractSha256,
  });
  assert.equal(changedPolicy.targets.length, 0);
  assert.equal(changedPolicy.summary.suppressedPriorResolverOnlyTargets, 1);

  const changedResolver = buildQueue({
    ...base,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => historicalResolverContractSha256([{
      ...targetAttempt.resolvers[0], version: '2',
    }]),
  });
  assert.equal(changedResolver.targets.length, 0);
  assert.equal(changedResolver.summary.suppressedPriorResolverOnlyTargets, 1);

  const explicitSource = structuredClone(base);
  explicitSource.acquisitionQueue.records[0].candidateSourceIds = ['source-official'];
  explicitSource.acquisitionQueue.sources = [{
    sourceId: 'source-official', sourceUrl: 'https://example.com/new-official.pdf',
    sourceAuthority: 'OFFICIAL', receiptEligible: true,
    documentIds: ['pdf:new'], referenceIds: ['official'],
  }];
  const reopened = buildQueue({
    ...explicitSource,
    recoveryPolicySha256: policySha256,
    resolverContractSha256ForTarget: () => historicalResolverContractSha256([{
      ...targetAttempt.resolvers[0], version: '2',
    }]),
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

  const queue = buildQueue({
    ...input, recoveryPolicySha256: policySha256,
  });
  assert.equal(queue.jobs.length, 0);
  assert.equal(queue.targets.length, 0);
  assert.equal(queue.discoveryTargets.length, 1);
  assert.deepEqual(queue.discoveryTargets[0].candidateJobIds, []);
  assert.equal(queue.discoveryTargets[0].priorSourceAcceptances.length, 1);
  assert.equal(queue.discoveryTargets[0].priorSourceAcceptances[0].sourceUrl, sourceUrl);
  assert.equal(queue.summary.suppressedPriorAcceptedSourceEdges, 1);

  const changedPolicy = buildQueue({
    ...input, recoveryPolicySha256: 'd'.repeat(64),
  });
  assert.equal(changedPolicy.jobs.length, 1);
  assert.equal(changedPolicy.targets[0].priorSourceAcceptances, undefined);
});
