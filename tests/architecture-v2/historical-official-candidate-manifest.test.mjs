import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildHistoricalOfficialCandidateManifest,
  normalizeHistoricalCandidateUrl,
  urlHasExactModelSignal,
} from '../../src/domain/historical-official-candidate-manifest.mjs';
import { validateEvidenceSourceResolverResult } from '../../src/domain/evidence-source-adapter-contract.mjs';
import { buildHistoricalEvidenceBoundedBatches } from '../../src/domain/historical-evidence-bounded-batch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  parseHistoricalOfficialCandidateDiscoveryArgs,
  runHistoricalOfficialCandidateDiscovery,
  selectHistoricalOfficialCandidateTargets,
} from '../../scripts/architecture-v2/run-historical-official-candidate-discovery.mjs';

const SHA = (character) => character.repeat(64);

function acquisitionRecord(referenceId, overrides = {}) {
  return {
    schemaVersion: 1,
    acquisitionId: `acquisition-${referenceId}`,
    referenceId,
    category: 'fridge',
    brand: 'Alpha',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CATALOG_ARCHIVED',
    priority: 'P1_CATALOG_ARCHIVED',
    groupType: 'unclassified',
    groupName: null,
    operationalClass: 'OFFICIAL_DISCOVERY',
    route: 'OFFICIAL_DISCOVERY',
    executionReadiness: 'DISCOVERY_READY',
    candidateSourceIds: [],
    resolverIds: ['alpha-official'],
    legacyRecoveryTargetIds: [],
    legacyRuntimeIds: [`legacy-${referenceId}`],
    canonicalProductIds: [],
    offlineReplayOutcome: null,
    ...overrides,
  };
}

function resolverResult({
  resolverId = 'alpha-official',
  completion = 'complete',
  candidates = [],
  required = true,
  failures = [],
} = {}) {
  return {
    schemaVersion: 1,
    resolverId,
    version: '1',
    scope: 'exact_model_documents',
    required,
    completion,
    candidates: candidates.map((candidate) => ({
      sourceUrl: candidate.sourceUrl,
      resolverId,
      resolverVersion: '1',
      discoveryMethod: candidate.discoveryMethod ?? 'official_support_index',
      documentType: candidate.documentType ?? 'installation_guide',
      sourceModelHint: candidate.sourceModelHint ?? null,
      authorityMode: candidate.authorityMode ?? 'official',
      sourceRole: candidate.sourceRole ?? 'manufacturer_document',
      requiredAttempt: candidate.requiredAttempt ?? true,
      batchJobId: null,
      ...(candidate.discoveryProvenance ? {
        discoveryProvenance: candidate.discoveryProvenance,
      } : {}),
    })),
    failures,
  };
}

function rebindDiscoveryRun(value) {
  const { storageObject: priorStorageObject, ...payload } = value;
  payload.targets = payload.targets.map((target) => ({
    ...target,
    resolvers: target.resolvers.map(validateEvidenceSourceResolverResult),
  }));
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    ...payload,
    storageObject: {
      contentSha256,
      byteSize: bytes.length,
      objectPath: `evidence/discovery/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`,
      markerSha256: priorStorageObject?.markerSha256 ?? SHA('c'),
    },
  };
}

function discoveryRun(targets) {
  return rebindDiscoveryRun({
    schemaVersion: 1,
    runId: 'candidate-canary-20260719',
    startedAt: '2026-07-19T01:00:00.000Z',
    completedAt: '2026-07-19T01:01:00.000Z',
    sourceAcquisitionQueueSha256: SHA('a'),
    selection: { brand: 'Alpha', category: 'fridge', limit: 4 },
    targets,
  });
}

function fixture() {
  const records = [
    acquisitionRecord('abc-123', { candidateSourceIds: ['source-seed'] }),
    acquisitionRecord('no-100'),
    acquisitionRecord('manual-gap', {
      brand: 'Beta',
      executionReadiness: 'RESOLVER_GAP',
      resolverIds: [],
      candidateSourceIds: ['source-retailer'],
    }),
    acquisitionRecord('retry-9'),
  ];
  const contract = [{
    resolverId: 'alpha-official',
    version: '1',
    scope: 'exact_model_documents',
    required: true,
  }];
  return {
    generatedAt: '2026-07-19T01:01:00.000Z',
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-07-17T04:19:39.580Z',
      semanticQueueSha256: SHA('a'),
      records,
      sources: [
        {
          sourceId: 'source-seed',
          sourceUrl: 'https://manuals.alpha.example/ABC-123.pdf#page=4',
          sourceAuthority: 'OFFICIAL',
          receiptEligible: true,
          documentIds: ['doc-seed'],
          referenceIds: ['abc-123'],
        },
        {
          sourceId: 'source-retailer',
          sourceUrl: 'https://retailer.example/manual-gap.pdf',
          sourceAuthority: 'REFERENCE',
          receiptEligible: false,
          documentIds: ['doc-retailer'],
          referenceIds: ['manual-gap'],
        },
      ],
      summary: { queuedModels: records.length },
    },
    resolverContractsByReference: new Map([
      ['abc-123', contract],
      ['no-100', contract],
      ['manual-gap', []],
      ['retry-9', contract],
    ]),
    discoveryRuns: [discoveryRun([
      {
        referenceId: 'abc-123',
        brand: 'Alpha',
        model: 'ABC-123',
        category: 'fridge',
        resolvers: [resolverResult({ candidates: [{
          sourceUrl: 'https://manuals.alpha.example/ABC-123.pdf',
          sourceModelHint: 'ABC-123',
        }] })],
      },
      {
        referenceId: 'no-100',
        brand: 'Alpha',
        model: 'NO-100',
        category: 'fridge',
        resolvers: [resolverResult()],
      },
      {
        referenceId: 'retry-9',
        brand: 'Alpha',
        model: 'RETRY-9',
        category: 'fridge',
        resolvers: [resolverResult({
          completion: 'timed_out',
          failures: [{ code: 'resolver_timeout', message: 'bounded timeout' }],
        })],
      },
    ])],
    officialCandidateValidator: () => true,
  };
}

function discoveryControlPlane(input) {
  const records = input.acquisitionQueue.records.filter((record) => record.resolverIds.length > 0);
  const targets = records.map((record) => ({
    targetId: `target-${record.referenceId}`,
    referenceId: record.referenceId,
    brand: record.brand,
    model: record.model,
    category: record.category,
    lifecycleState: record.lifecycleState,
    priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS',
    executionLane: 'BOUNDED_DISCOVERY',
    candidateJobIds: [],
    primaryJobId: null,
  }));
  const executableQueue = {
    schemaVersion: 2,
    generatedAt: input.acquisitionQueue.generatedAt,
    sourceAcquisitionQueueSha256: input.acquisitionQueue.semanticQueueSha256,
    sourceOfficialCandidateManifestSha256: SHA('b'),
    evidenceProcessorEpochs: {},
    jobs: [],
    targets: [],
    discoveryTargets: targets,
    deferredTargets: [],
    summary: {
      targets: targets.length,
      acquisitionTargets: 0,
      discoveryTargets: targets.length,
      deferredTargets: 0,
    },
  };
  const targetState = {
    schemaVersion: 1,
    generatedAt: input.acquisitionQueue.generatedAt,
    summary: { records: targets.length },
    records: targets.map((row) => ({
      referenceId: row.referenceId,
      category: row.category,
      canonicalBrand: row.brand,
      model: row.model,
      lifecycleState: row.lifecycleState,
      state: 'SOURCE_DISCOVERY_REQUIRED',
      stateClass: 'ACTIONABLE',
      actionable: true,
      terminal: false,
      binding: {
        type: 'executable_queue',
        targetId: row.targetId,
        executionLane: row.executionLane,
        candidateJobIds: [],
      },
      reopeningConditions: [],
    })),
  };
  const canarySemantic = {
    schemaVersion: 2,
    generatedAt: input.acquisitionQueue.generatedAt,
    documentGraphSha256: SHA('c'),
    executableQueueSha256: canonicalJsonSha256(executableQueue),
    policySha256: SHA('d'),
    parserContractSha256: SHA('e'),
    processorEpochs: {},
    families: [],
    targetDecisions: targets.map((row) => ({
      targetId: row.targetId,
      referenceId: row.referenceId,
      executionLane: row.executionLane,
      familyIds: [],
      assignment: 'UNSCOPED_SINGLETON',
      runnerAllowed: true,
      fanoutEligible: false,
      reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
    })),
  };
  const familyCanaries = {
    ...canarySemantic,
    semanticCanarySha256: canonicalJsonSha256(canarySemantic),
    summary: {},
  };
  const boundedBatches = buildHistoricalEvidenceBoundedBatches({
    executableQueue,
    targetState,
    familyCanaries,
  });
  return { boundedBatches, executableQueue, targetState, familyCanaries };
}

function target(manifest, referenceId) {
  return manifest.targets.find((record) => record.referenceId === referenceId);
}

test('normalizes trusted URLs and records exact-model path or query signals', () => {
  assert.equal(
    normalizeHistoricalCandidateUrl('https://Manuals.Example.com:443/docs/ABC-123.pdf#page=3'),
    'https://manuals.example.com/docs/ABC-123.pdf',
  );
  assert.equal(urlHasExactModelSignal('https://example.com/docs/ABC-123.pdf', 'ABC-123'), true);
  assert.equal(urlHasExactModelSignal('https://example.com/download?id=ABC-123', 'ABC-123'), true);
  assert.equal(urlHasExactModelSignal('https://example.com/docs/ABC-1234.pdf', 'ABC-123'), false);
  assert.throws(() => normalizeHistoricalCandidateUrl('http://example.com/manual.pdf'), /HTTPS/i);
});

test('builds one inspectable discovery state per queued model without promoting retailer hints', () => {
  const manifest = buildHistoricalOfficialCandidateManifest(fixture());

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.summary.targets, 4);
  assert.deepEqual(manifest.summary.byState, {
    DISCOVERY_RETRYABLE: 3,
    RESEARCH_REQUIRED: 1,
  });
  assert.equal(manifest.candidates.length, 1);
  assert.equal(target(manifest, 'abc-123').candidateEdges.length, 1);
  assert.equal(target(manifest, 'abc-123').candidateEdges[0].sourceRank, 1);
  assert.equal(target(manifest, 'abc-123').candidateEdges[0].exactModelUrlSignal, true);
  assert.equal(manifest.candidates[0].expectedContentType, 'application/pdf');
  assert.deepEqual(manifest.candidates[0].applicableReferenceIds, ['abc-123']);
  assert.equal(target(manifest, 'abc-123').state, 'DISCOVERY_RETRYABLE');
  assert.deepEqual(target(manifest, 'abc-123').legacyAggregateResolverIds, ['alpha-official']);
  assert.equal(target(manifest, 'no-100').state, 'DISCOVERY_RETRYABLE');
  assert.equal(target(manifest, 'no-100').terminal, false);
  assert.equal(target(manifest, 'retry-9').state, 'DISCOVERY_RETRYABLE');
  assert.equal(target(manifest, 'retry-9').retryableDiscovery, true);
  assert.equal(target(manifest, 'manual-gap').state, 'RESEARCH_REQUIRED');
  assert.deepEqual(target(manifest, 'manual-gap').referenceHintSourceIds, ['source-retailer']);
  assert.deepEqual(target(manifest, 'manual-gap').candidateEdges, []);
});

test('deduplicates one URL within a brand but isolates the same URL across brands', () => {
  const input = fixture();
  input.acquisitionQueue.records.push(acquisitionRecord('beta-1', {
    brand: 'Beta',
    model: 'ABC-123',
  }));
  input.acquisitionQueue.summary.queuedModels += 1;
  input.resolverContractsByReference.set('beta-1', [{
    resolverId: 'beta-official', version: '1', scope: 'exact_model_documents', required: true,
  }]);
  input.discoveryRuns[0].targets.push({
    referenceId: 'beta-1',
    brand: 'Beta',
    model: 'ABC-123',
    category: 'fridge',
    resolvers: [resolverResult({
      resolverId: 'beta-official',
      candidates: [{ sourceUrl: 'https://manuals.alpha.example/ABC-123.pdf' }],
    })],
  });
  input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);

  const manifest = buildHistoricalOfficialCandidateManifest(input);
  assert.equal(manifest.candidates.length, 2);
  assert.notEqual(
    target(manifest, 'abc-123').candidateEdges[0].candidateId,
    target(manifest, 'beta-1').candidateEdges[0].candidateId,
  );
});

test('fails closed when a resolver labels a non-official host as official', () => {
  const input = fixture();
  input.officialCandidateValidator = () => false;
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(input),
    /official candidate host rejected/i,
  );
});

test('never emits complete no-source from a missing, timed-out, truncated, or failed required resolver', () => {
  for (const completion of ['timed_out', 'truncated', 'failed', 'unknown']) {
    const input = fixture();
    input.discoveryRuns[0].targets[1].resolvers[0] = resolverResult({
      completion,
      failures: completion === 'complete' ? [] : [{ code: 'incomplete', message: completion }],
    });
    input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);
    assert.equal(
      target(buildHistoricalOfficialCandidateManifest(input), 'no-100').state,
      'DISCOVERY_RETRYABLE',
      completion,
    );
  }
  const input = fixture();
  input.discoveryRuns[0].targets[1].resolvers = [];
  input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);
  assert.equal(target(buildHistoricalOfficialCandidateManifest(input), 'no-100').state, 'DISCOVERY_RETRYABLE');
});

test('legacy aggregate completion cannot authorize terminal zero-source', () => {
  const input = fixture();
  assert.equal(
    target(buildHistoricalOfficialCandidateManifest(input), 'no-100').state,
    'DISCOVERY_RETRYABLE',
  );
});

test('all required schema-v2 source lanes must complete before candidates or zero-source become ready', () => {
  const input = fixture();
  const hash = SHA('d');
  const provenance = {
    schemaVersion: 1,
    method: 'official_sitemap',
    market: 'AU',
    discoveryUrl: 'https://manuals.alpha.example/sitemap.xml',
    requestedModel: 'NO-100',
    contentType: 'application/xml',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/dd/dd/${hash}.xml`,
    byteSize: 200,
  };
  const laneContracts = [
    { laneId: 'current_product', required: true, supported: true },
    { laneId: 'discontinued_archive', required: true, supported: true },
    { laneId: 'support_search_api', required: false, supported: false },
    { laneId: 'official_document_cdn', required: true, supported: true },
    { laneId: 'official_product_detail', required: true, supported: true },
  ];
  const completeLanes = laneContracts.map((lane) => ({
    ...lane,
    status: lane.supported ? 'complete' : 'unsupported',
    candidateCount: 0,
    provenance: lane.supported ? [provenance] : [],
    reason: lane.supported ? null : 'No public support API.',
  }));
  input.resolverContractsByReference.set('no-100', [{
    schemaVersion: 2,
    resolverId: 'alpha-official',
    version: '2',
    scope: 'all_declared_official_source_lanes',
    required: true,
    sourceLanes: laneContracts,
  }]);
  input.discoveryRuns[0].targets[1].resolvers = [{
    schemaVersion: 2,
    resolverId: 'alpha-official',
    version: '2',
    scope: 'all_declared_official_source_lanes',
    required: true,
    completion: 'complete',
    sourceLanes: completeLanes,
    candidates: [],
    failures: [],
  }];
  input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);
  assert.equal(target(buildHistoricalOfficialCandidateManifest(input), 'no-100').state, 'NO_CANDIDATE_COMPLETE');

  const partial = fixture();
  partial.resolverContractsByReference.set('no-100', input.resolverContractsByReference.get('no-100'));
  partial.discoveryRuns[0].targets[1].resolvers = [{
    ...input.discoveryRuns[0].targets[1].resolvers[0],
    completion: 'retryable',
    sourceLanes: completeLanes.map((lane) => lane.laneId === 'discontinued_archive'
      ? { ...lane, status: 'retryable', provenance: [], reason: 'Archive request timed out.' }
      : lane.laneId === 'official_document_cdn'
        ? { ...lane, candidateCount: 1 }
        : lane),
    candidates: [{
      sourceUrl: 'https://manuals.alpha.example/NO-100.pdf',
      resolverId: 'alpha-official',
      resolverVersion: '2',
      sourceLaneId: 'official_document_cdn',
      discoveryMethod: 'official_product_page_document_link',
      documentType: 'installation_guide',
      sourceModelHint: 'NO-100',
      authorityMode: 'official',
      sourceRole: 'manufacturer_document',
      requiredAttempt: true,
      batchJobId: null,
    }],
    failures: [{ code: 'archive_timeout', message: 'Archive request timed out.' }],
  }];
  partial.discoveryRuns[0] = rebindDiscoveryRun(partial.discoveryRuns[0]);
  const partialTarget = target(buildHistoricalOfficialCandidateManifest(partial), 'no-100');
  assert.equal(partialTarget.state, 'DISCOVERY_RETRYABLE');
  assert.equal(partialTarget.candidateEdges.length, 1);
  assert.deepEqual(partialTarget.incompleteSourceLaneIds, [
    'alpha-official:discontinued_archive',
  ]);

  const wrongModel = fixture();
  wrongModel.resolverContractsByReference.set('no-100', input.resolverContractsByReference.get('no-100'));
  wrongModel.discoveryRuns[0].targets[1].resolvers = [{
    ...input.discoveryRuns[0].targets[1].resolvers[0],
    sourceLanes: completeLanes.map((lane) => ({
      ...lane,
      provenance: lane.provenance.map((entry) => ({ ...entry, requestedModel: 'OTHER-100' })),
    })),
  }];
  wrongModel.discoveryRuns[0] = rebindDiscoveryRun(wrongModel.discoveryRuns[0]);
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(wrongModel),
    /source lane.*model binding/i,
  );

  const wrongMarket = fixture();
  wrongMarket.resolverContractsByReference.set('no-100', input.resolverContractsByReference.get('no-100'));
  wrongMarket.discoveryRuns[0].targets[1].resolvers = [{
    ...input.discoveryRuns[0].targets[1].resolvers[0],
    sourceLanes: completeLanes.map((lane) => ({
      ...lane,
      provenance: lane.provenance.map((entry) => ({ ...entry, market: 'NZ' })),
    })),
  }];
  wrongMarket.discoveryRuns[0] = rebindDiscoveryRun(wrongMarket.discoveryRuns[0]);
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(wrongMarket),
    /source lane.*market binding/i,
  );

  const wrongHost = fixture();
  wrongHost.officialCandidateValidator = ({ sourceUrl }) => new URL(sourceUrl).hostname.endsWith('alpha.example');
  wrongHost.resolverContractsByReference.set('no-100', input.resolverContractsByReference.get('no-100'));
  wrongHost.discoveryRuns[0].targets[1].resolvers = [{
    ...input.discoveryRuns[0].targets[1].resolvers[0],
    sourceLanes: completeLanes.map((lane) => ({
      ...lane,
      provenance: lane.provenance.map((entry) => ({
        ...entry,
        discoveryUrl: 'https://retailer.example/sitemap.xml',
      })),
    })),
  }];
  wrongHost.discoveryRuns[0] = rebindDiscoveryRun(wrongHost.discoveryRuns[0]);
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(wrongHost),
    /source lane.*official host binding/i,
  );
});

test('rebuilds idempotently from its prior manifest and rejects tampered run bindings', () => {
  const input = fixture();
  input.discoveryRuns[0].targets[1].resolvers[0] = resolverResult({
    candidates: [{
      sourceUrl: 'https://manuals.alpha.example/NO-100.pdf',
      documentType: 'installation_guide',
      sourceModelHint: 'NO-100',
    }],
  });
  input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);
  const secondRun = structuredClone(input.discoveryRuns[0]);
  secondRun.runId = 'candidate-follow-up-20260719';
  secondRun.startedAt = '2026-07-19T01:02:00.000Z';
  secondRun.completedAt = '2026-07-19T01:03:00.000Z';
  secondRun.targets[1].resolvers[0] = resolverResult({
    candidates: [{
      sourceUrl: 'https://manuals.alpha.example/NO-100.pdf',
      documentType: 'quick_reference_guide',
      sourceModelHint: 'NO100-AU',
      sourceRole: 'manufacturer_quick_reference',
    }],
  });
  input.discoveryRuns.push(rebindDiscoveryRun(secondRun));
  const first = buildHistoricalOfficialCandidateManifest(input);
  const second = buildHistoricalOfficialCandidateManifest({
    ...input,
    priorManifest: first,
    discoveryRuns: [],
  });
  assert.equal(second.semanticManifestSha256, first.semanticManifestSha256);
  assert.deepEqual(second.candidates, first.candidates);
  assert.deepEqual(second.targets, first.targets);

  const tamperedRun = fixture();
  tamperedRun.discoveryRuns[0].storageObject.byteSize += 1;
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(tamperedRun),
    /byte size|payload binding/i,
  );
  const wrongQueue = fixture();
  wrongQueue.discoveryRuns[0].sourceAcquisitionQueueSha256 = SHA('f');
  wrongQueue.discoveryRuns[0] = rebindDiscoveryRun(wrongQueue.discoveryRuns[0]);
  assert.throws(
    () => buildHistoricalOfficialCandidateManifest(wrongQueue),
    /acquisition queue binding mismatch/i,
  );
});

test('queue refresh time does not append a duplicate classified-source discovery', () => {
  const firstInput = fixture();
  const first = buildHistoricalOfficialCandidateManifest(firstInput);
  const refreshedInput = fixture();
  refreshedInput.acquisitionQueue.generatedAt = '2026-07-20T00:00:00.000Z';
  refreshedInput.generatedAt = '2026-07-20T00:00:00.000Z';
  const refreshed = buildHistoricalOfficialCandidateManifest({
    ...refreshedInput,
    priorManifest: first,
    discoveryRuns: [],
  });
  assert.equal(refreshed.semanticManifestSha256, first.semanticManifestSha256);
  assert.deepEqual(refreshed.candidates, first.candidates);
  assert.deepEqual(refreshed.targets, first.targets);
});

test('replays a global official candidate through its hash-bound Australian discovery provenance', () => {
  const input = fixture();
  const hash = SHA('b');
  const sourceUrl = 'https://global.alpha.example/manuals/NO-100.pdf';
  input.discoveryRuns[0].targets[1].resolvers[0] = resolverResult({
    candidates: [{
      sourceUrl,
      sourceModelHint: 'NO-100',
      discoveryProvenance: {
        schemaVersion: 1,
        method: 'official_support_api',
        market: 'AU',
        sourceMarket: 'AU',
        discoveryUrl: 'https://support.alpha.example/au/api/products/NO-100',
        requestedModel: 'NO-100',
        matchedModel: 'NO-100',
        artifactUrl: sourceUrl,
        artifactLinkUrl: sourceUrl,
        discoveryContentSha256: hash,
        discoveryObjectPath: `evidence/web/sha256/bb/bb/${hash}.json`,
        discoveryByteSize: 321,
        discoveryRecordType: 'support_document_resource',
        documentId: 'documents:0',
        documentTitleKey: 'Installation|Installation Guide (English)',
        originalFileName: 'NO-100.pdf',
      },
    }],
  });
  input.discoveryRuns[0] = rebindDiscoveryRun(input.discoveryRuns[0]);
  input.officialCandidateValidator = (candidate) => (
    candidate.sourceUrl.includes('ABC-123') || candidate.discoveryProvenance?.market === 'AU'
  );
  const first = buildHistoricalOfficialCandidateManifest(input);
  const replayed = buildHistoricalOfficialCandidateManifest({
    ...input,
    priorManifest: first,
    discoveryRuns: [],
  });
  assert.equal(replayed.semanticManifestSha256, first.semanticManifestSha256);
  assert.deepEqual(replayed.candidates, first.candidates);
});

test('online discovery CLI requires a tracked manifest and rejects legacy selectors', () => {
  assert.throws(() => parseHistoricalOfficialCandidateDiscoveryArgs([]), /manifest-id/i);
  for (const flag of ['--brand', '--category', '--reference-id', '--limit']) {
    assert.throws(
      () => parseHistoricalOfficialCandidateDiscoveryArgs([flag, 'unsafe']),
      /prohibited.*manifest-id/i,
    );
  }
  const parsed = parseHistoricalOfficialCandidateDiscoveryArgs([
    '--manifest-id', 'historical_batch_abc',
    '--run-id', 'alpha-fridge-canary', '--storage-root', '/tmp/evidence',
  ]);
  assert.equal(parsed.manifestId, 'historical_batch_abc');
  const selected = selectHistoricalOfficialCandidateTargets(fixture().acquisitionQueue, {
    referenceIds: ['abc-123', 'no-100'], brand: null, category: null, limit: 2,
  });
  assert.deepEqual(selected.map((record) => record.referenceId), ['abc-123', 'no-100']);
});

test('online discovery persists an immutable run object before updating the offline manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-candidate-discovery-'));
  const storageRoot = join(directory, 'storage');
  const inputPath = join(directory, 'acquisition.json');
  const outputPath = join(directory, 'manifest.json');
  const input = fixture();
  const controlPlane = discoveryControlPlane(input);
  const boundedManifest = controlPlane.boundedBatches.manifests[0];
  await writeFile(inputPath, `${JSON.stringify(input.acquisitionQueue)}\n`);
  const times = [new Date('2026-07-19T02:00:00.000Z'), new Date('2026-07-19T02:01:00.000Z')];
  try {
    const result = await runHistoricalOfficialCandidateDiscovery([
      '--manifest-id', boundedManifest.manifestId,
      '--run-id', 'alpha-fridge-unit-canary', '--storage-root', storageRoot,
      '--input', inputPath, '--output', outputPath,
    ], {
      verifyStorageRoot: async () => ({
        root: storageRoot,
        markerSha256: SHA('d'),
        volumeUuid: 'UNIT-TEST',
      }),
      controlPlane,
      now: () => times.shift(),
      resolversForRecord: () => [{
        resolverId: 'alpha-official',
        version: '1',
        scope: 'exact_model_documents',
        required: true,
        resolve: async () => resolverResult({ candidates: [{
          sourceUrl: 'https://manuals.alpha.example/ABC-123-install.pdf',
          sourceModelHint: 'ABC-123',
        }] }),
      }],
      resolverContractsByReference: input.resolverContractsByReference,
      officialCandidateValidator: () => true,
      writeOutput: () => {},
    });
    const stored = await readFile(join(storageRoot, result.run.storageObject.objectPath));
    assert.equal(createHash('sha256').update(stored).digest('hex'), result.run.storageObject.contentSha256);
    const persisted = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(persisted.runBindings[0].runId, 'alpha-fridge-unit-canary');
    assert.equal(target(persisted, 'abc-123').state, 'DISCOVERY_RETRYABLE');
    assert.equal(target(persisted, 'abc-123').candidateEdges.length, 2);
    assert.deepEqual(result.run.boundedManifest, boundedManifest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('online discovery rejects a schema-v2 lane whose content-addressed provenance object is missing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-lane-object-missing-'));
  const storageRoot = join(directory, 'storage');
  const inputPath = join(directory, 'acquisition.json');
  const outputPath = join(directory, 'manifest.json');
  const input = fixture();
  const controlPlane = discoveryControlPlane(input);
  const boundedManifest = controlPlane.boundedBatches.manifests[0];
  await writeFile(inputPath, `${JSON.stringify(input.acquisitionQueue)}\n`);
  const laneContracts = [
    { laneId: 'current_product', required: true, supported: true },
    { laneId: 'discontinued_archive', required: true, supported: true },
    { laneId: 'support_search_api', required: true, supported: true },
    { laneId: 'official_document_cdn', required: true, supported: true },
    { laneId: 'official_product_detail', required: true, supported: true },
  ];
  const hash = SHA('e');
  const provenance = {
    schemaVersion: 1,
    method: 'official_sitemap',
    market: 'AU',
    discoveryUrl: 'https://manuals.alpha.example/sitemap.xml',
    requestedModel: 'ABC-123',
    contentType: 'application/xml',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/ee/ee/${hash}.xml`,
    byteSize: 100,
  };
  const resolverContract = {
    schemaVersion: 2,
    resolverId: 'alpha-official',
    version: '2',
    scope: 'all_declared_official_source_lanes',
    required: true,
    sourceLanes: laneContracts,
  };
  const contracts = new Map(input.acquisitionQueue.records.map((record) => [
    record.referenceId,
    record.resolverIds.length ? [resolverContract] : [],
  ]));
  try {
    await assert.rejects(
      runHistoricalOfficialCandidateDiscovery([
        '--manifest-id', boundedManifest.manifestId,
        '--run-id', 'alpha-missing-lane-object', '--storage-root', storageRoot,
        '--input', inputPath, '--output', outputPath,
      ], {
        verifyStorageRoot: async () => ({
          root: storageRoot,
          markerSha256: SHA('e'),
          volumeUuid: 'UNIT-TEST',
        }),
        controlPlane,
        now: (() => {
          const times = [new Date('2026-07-19T02:30:00.000Z'), new Date('2026-07-19T02:31:00.000Z')];
          return () => times.shift();
        })(),
        resolversForRecord: () => [{
          ...resolverContract,
          resolve: async () => ({
            ...resolverContract,
            completion: 'complete',
            sourceLanes: laneContracts.map((lane) => ({
              ...lane,
              status: 'complete',
              candidateCount: 0,
              provenance: [provenance],
              reason: null,
            })),
            candidates: [],
            failures: [],
          }),
        }],
        resolverContractsByReference: contracts,
        officialCandidateValidator: () => true,
        writeOutput: () => {},
      }),
      /source lane provenance object.*missing/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('online discovery resumes an externally indexed run after manifest persistence fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-candidate-resume-'));
  const storageRoot = join(directory, 'storage');
  const inputPath = join(directory, 'acquisition.json');
  const outputPath = join(directory, 'manifest.json');
  const input = fixture();
  const controlPlane = discoveryControlPlane(input);
  const boundedManifest = controlPlane.boundedBatches.manifests[0];
  await writeFile(inputPath, `${JSON.stringify(input.acquisitionQueue)}\n`);
  const argv = [
    '--manifest-id', boundedManifest.manifestId,
    '--run-id', 'alpha-fridge-resume-canary', '--storage-root', storageRoot,
    '--input', inputPath, '--output', outputPath,
  ];
  const times = [new Date('2026-07-19T03:00:00.000Z'), new Date('2026-07-19T03:01:00.000Z')];
  let resolverCalls = 0;
  const common = {
    controlPlane,
    verifyStorageRoot: async () => ({
      root: storageRoot,
      markerSha256: SHA('e'),
      volumeUuid: 'UNIT-TEST',
    }),
    now: () => {
      const value = times.shift();
      if (!value) throw new Error('network discovery unexpectedly restarted');
      return value;
    },
    resolversForRecord: () => [{
      resolverId: 'alpha-official',
      version: '1',
      scope: 'exact_model_documents',
      required: true,
      resolve: async () => {
        resolverCalls += 1;
        return resolverResult();
      },
    }],
    resolverContractsByReference: input.resolverContractsByReference,
    officialCandidateValidator: () => true,
    writeOutput: () => {},
  };
  try {
    await assert.rejects(
      runHistoricalOfficialCandidateDiscovery(argv, {
        ...common,
        writeManifest: async () => { throw new Error('simulated manifest write failure'); },
      }),
      /simulated manifest write failure/,
    );
    const resumed = await runHistoricalOfficialCandidateDiscovery(argv, common);
    assert.equal(resumed.resumed, true);
    assert.equal(resolverCalls, 1);
    assert.equal(resumed.run.runId, 'alpha-fridge-resume-canary');
    const persisted = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(persisted.runBindings[0].runId, 'alpha-fridge-resume-canary');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('online discovery revalidates candidate provenance objects before resuming an indexed run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-candidate-resume-object-'));
  const inputPath = join(directory, 'acquisition.json');
  const outputPath = join(directory, 'manifest.json');
  const input = fixture();
  const controlPlane = discoveryControlPlane(input);
  const boundedManifest = controlPlane.boundedBatches.manifests[0];
  await writeFile(inputPath, `${JSON.stringify(input.acquisitionQueue)}\n`);
  const objects = new Map();
  const objectStore = {
    async writeObject(path, bytes) { objects.set(path, Buffer.from(bytes)); },
    async readObject(path) {
      if (!objects.has(path)) {
        const error = new Error(`missing ${path}`);
        error.code = 'ENOENT';
        throw error;
      }
      return Buffer.from(objects.get(path));
    },
  };
  const laneContracts = [
    'current_product',
    'discontinued_archive',
    'support_search_api',
    'official_document_cdn',
    'official_product_detail',
  ].map((laneId) => ({ laneId, required: true, supported: true }));
  const resolverContract = {
    schemaVersion: 2,
    resolverId: 'alpha-official',
    version: '2',
    scope: 'all_declared_official_source_lanes',
    required: true,
    sourceLanes: laneContracts,
  };
  const contracts = new Map(input.acquisitionQueue.records.map((record) => [
    record.referenceId,
    record.resolverIds.length ? [resolverContract] : [],
  ]));
  const candidateObjectPaths = [];
  let resolverCalls = 0;
  const common = {
    objectStore,
    controlPlane,
    verifyStorageRoot: async () => ({
      root: directory,
      markerSha256: SHA('f'),
      volumeUuid: 'UNIT-TEST',
    }),
    now: (() => {
      const times = [new Date('2026-07-19T03:30:00.000Z'), new Date('2026-07-19T03:31:00.000Z')];
      return () => times.shift() ?? (() => { throw new Error('network discovery unexpectedly restarted'); })();
    })(),
    resolversForRecord: () => [{
      ...resolverContract,
      resolve: async (record) => {
        resolverCalls += 1;
        const bytes = Buffer.from(`official source index for ${record.model}`);
        const hash = createHash('sha256').update(bytes).digest('hex');
        const objectPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
        await objectStore.writeObject(objectPath, bytes);
        const candidateBytes = Buffer.from(`official product page for ${record.model}`);
        const candidateHash = createHash('sha256').update(candidateBytes).digest('hex');
        const candidateObjectPath = `evidence/web/sha256/${candidateHash.slice(0, 2)}/${candidateHash.slice(2, 4)}/${candidateHash}.html`;
        candidateObjectPaths.push(candidateObjectPath);
        await objectStore.writeObject(candidateObjectPath, candidateBytes);
        const productUrl = `https://manuals.alpha.example/products/${record.model}`;
        const documentUrl = `https://manuals.alpha.example/documents/${record.model}.pdf`;
        const provenance = {
          schemaVersion: 1,
          method: 'official_product_page',
          market: 'AU',
          discoveryUrl: productUrl,
          requestedModel: record.model,
          contentType: 'text/html',
          contentSha256: hash,
          objectPath,
          byteSize: bytes.length,
        };
        return {
          ...resolverContract,
          completion: 'complete',
          sourceLanes: laneContracts.map((lane) => ({
            ...lane,
            status: 'complete',
            candidateCount: lane.laneId === 'official_document_cdn' ? 1 : 0,
            provenance: [provenance],
            reason: null,
          })),
          candidates: [{
            sourceUrl: documentUrl,
            resolverId: resolverContract.resolverId,
            resolverVersion: resolverContract.version,
            discoveryMethod: 'official_product_page_document_link',
            documentType: 'installation_guide',
            sourceModelHint: record.model,
            authorityMode: 'official',
            sourceRole: 'manufacturer_document',
            requiredAttempt: true,
            batchJobId: null,
            sourceLaneId: 'official_document_cdn',
            discoveryProvenance: {
              schemaVersion: 1,
              method: 'official_product_page',
              market: 'AU',
              discoveryUrl: productUrl,
              requestedModel: record.model,
              matchedModel: record.model,
              artifactUrl: documentUrl,
              artifactLinkUrl: documentUrl,
              discoveryContentSha256: candidateHash,
              discoveryObjectPath: candidateObjectPath,
              discoveryByteSize: candidateBytes.length,
            },
          }],
          failures: [],
        };
      },
    }],
    resolverContractsByReference: contracts,
    officialCandidateValidator: () => true,
    writeOutput: () => {},
  };
  const argv = [
    '--manifest-id', boundedManifest.manifestId,
    '--run-id', 'alpha-resume-object-canary',
    '--storage-root', directory,
    '--input', inputPath,
    '--output', outputPath,
  ];
  try {
    await assert.rejects(
      runHistoricalOfficialCandidateDiscovery(argv, {
        ...common,
        writeManifest: async () => { throw new Error('simulated manifest write failure'); },
      }),
      /simulated manifest write failure/,
    );
    const callsAfterFirstRun = resolverCalls;
    objects.delete(candidateObjectPaths[0]);
    await assert.rejects(
      runHistoricalOfficialCandidateDiscovery(argv, common),
      /candidate discovery provenance object.*missing/i,
    );
    assert.equal(resolverCalls, callsAfterFirstRun);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('network concurrency bounds resolver calls rather than only target workers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-candidate-concurrency-'));
  const storageRoot = join(directory, 'storage');
  const inputPath = join(directory, 'acquisition.json');
  const outputPath = join(directory, 'manifest.json');
  const input = fixture();
  const controlPlane = discoveryControlPlane(input);
  const boundedManifest = controlPlane.boundedBatches.manifests[0];
  await writeFile(inputPath, `${JSON.stringify(input.acquisitionQueue)}\n`);
  const times = [new Date('2026-07-19T04:00:00.000Z'), new Date('2026-07-19T04:01:00.000Z')];
  let active = 0;
  let maximumActive = 0;
  const resolver = (resolverId, required) => ({
    resolverId,
    version: '1',
    scope: 'exact_model_documents',
    required,
    resolve: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      active -= 1;
      return resolverResult({ resolverId, required });
    },
  });
  try {
    await runHistoricalOfficialCandidateDiscovery([
      '--manifest-id', boundedManifest.manifestId,
      '--network-concurrency', '1', '--run-id', 'alpha-concurrency-canary',
      '--storage-root', storageRoot, '--input', inputPath, '--output', outputPath,
    ], {
      verifyStorageRoot: async () => ({
        root: storageRoot,
        markerSha256: SHA('f'),
        volumeUuid: 'UNIT-TEST',
      }),
      controlPlane,
      now: () => times.shift(),
      resolversForRecord: () => [
        resolver('alpha-official', true),
        resolver('alpha-secondary', false),
      ],
      resolverContractsByReference: input.resolverContractsByReference,
      officialCandidateValidator: () => true,
      writeOutput: () => {},
    });
    assert.equal(maximumActive, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
