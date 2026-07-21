import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  buildHistoricalEvidenceFamilyCanaries,
  validateHistoricalEvidenceFamilyCanarySelection,
} from '../../src/domain/historical-evidence-family-canary.mjs';

const PARSER_SHA = 'a'.repeat(64);
const PROCESSOR_SHA = 'b'.repeat(64);
const PDF_A = 'c'.repeat(64);
const PDF_B = 'd'.repeat(64);
const GRAPH_SHA = 'e'.repeat(64);
const CURRENT_URL = 'https://official.example/family-a.pdf';
const OTHER_URL = 'https://official.example/other-family.pdf';

function target({
  targetId,
  referenceId,
  model,
  priorityClass = 'P1_HISTORICAL_MISSING_DIMENSIONS',
  executionLane = 'BOUNDED_DISCOVERY',
  candidateJobIds = [],
  resolverVersion = '1',
}) {
  return {
    targetId,
    referenceId,
    legacyRuntimeId: `legacy-${targetId}`,
    canonicalProductId: null,
    category: 'fridge',
    brand: 'Example',
    model,
    lifecycleState: priorityClass.startsWith('P0') ? 'CURRENT_RETAIL' : 'CATALOG_ARCHIVED',
    priorityClass,
    requestedFields: [
      'closedEnvelope.widthMm',
      'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
    ],
    sourceDocumentIds: [],
    legacyHints: [],
    registryDimensionHints: [],
    publicationEligible: false,
    repairExistingReceipt: false,
    executionLane,
    candidateJobIds,
    primaryJobId: candidateJobIds[0] ?? null,
    ...(executionLane === 'BOUNDED_DISCOVERY' ? {
      resolverContract: [{
        resolverId: 'example-official-discovery',
        version: resolverVersion,
        scope: 'exact_model_and_family_documents',
        required: true,
      }],
      incompleteResolverIds: ['example-official-discovery'],
      candidateManifestState: 'DISCOVERY_RETRYABLE',
    } : {
      candidateManifestState: 'CANDIDATES_READY',
      candidateEdges: candidateJobIds.map((jobId, index) => ({
        candidateId: `candidate-${jobId}`,
        exactModelUrlSignal: true,
        sourceModelHintExact: true,
        requiredAttempt: true,
        sourceModelHints: [model],
        documentTypes: ['specification_sheet'],
        discoveryStrategyIds: ['fixture'],
        sourceRank: index + 1,
        jobId,
        acquisitionRoute: 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
        priorityClass,
      })),
    }),
  };
}

function document({ documentId, pdfSha256, sourceVersionId, edges }) {
  return {
    documentId,
    pdfSha256,
    validity: 'VALID',
    physicalPaths: [],
    physicalCopyCount: 0,
    sourceVersionIds: [sourceVersionId],
    mineruObject: {
      schemaVersion: 1,
      format: 'content_list_v2',
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: 'model-revision',
      sourcePdfSha256: pdfSha256,
      contentSha256: 'f'.repeat(64),
      objectPath: 'evidence/derived/mineru-json/object.json',
      byteSize: 10,
      pageCount: 1,
    },
    grammarProfileIds: ['example-family-v1'],
    familyIds: [documentId === 'doc-a' ? 'family-a' : 'family-b'],
    modelEdges: edges,
  };
}

function fixture({ sourceUrl = CURRENT_URL, resolverVersion = '1' } = {}) {
  const graph = {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    semanticGraphSha256: GRAPH_SHA,
    sourceVersions: [
      {
        sourceVersionId: 'source-a',
        sourceUrl: CURRENT_URL,
        pdfSha256: PDF_A,
        versionOrdinal: 1,
        versionCount: 1,
        ordinalBasis: 'CONTENT_HASH_ORDER_ONLY',
        contentConflict: false,
      },
      {
        sourceVersionId: 'source-b',
        sourceUrl: OTHER_URL,
        pdfSha256: PDF_B,
        versionOrdinal: 1,
        versionCount: 1,
        ordinalBasis: 'CONTENT_HASH_ORDER_ONLY',
        contentConflict: false,
      },
    ],
    nonIndexedClassificationLinks: [],
    documents: [
      document({
        documentId: 'doc-a',
        pdfSha256: PDF_A,
        sourceVersionId: 'source-a',
        edges: [
          {
            referenceId: 'ref-a',
            proofLevel: 'EXACT_MODEL_PROVEN',
            proofLocators: [{ type: 'CURRENT_RECEIPT', documentId: 'receipt-a' }],
          },
          {
            referenceId: 'ref-b',
            proofLevel: 'FAMILY_SCOPE_ONLY',
            proofLocators: [{ type: 'KNOWLEDGE_FAMILY_SCOPE', familyId: 'family-a' }],
          },
        ],
      }),
      document({
        documentId: 'doc-b',
        pdfSha256: PDF_B,
        sourceVersionId: 'source-b',
        edges: [{
          referenceId: 'ref-c',
          proofLevel: 'FAMILY_SCOPE_ONLY',
          proofLocators: [{ type: 'KNOWLEDGE_FAMILY_SCOPE', familyId: 'family-b' }],
        }],
      }),
    ],
    families: [
      {
        familyId: 'family-a',
        category: 'fridge',
        brand: 'Example',
        groupType: 'parser_family',
        groupName: 'Example family A',
        documentIds: ['doc-a'],
        pdfSha256s: [PDF_A],
        grammarProfileIds: ['example-family-v1'],
        referenceIds: ['ref-a', 'ref-b'],
      },
      {
        familyId: 'family-b',
        category: 'fridge',
        brand: 'Example',
        groupType: 'document_family',
        groupName: 'Example family B',
        documentIds: ['doc-b'],
        pdfSha256s: [PDF_B],
        grammarProfileIds: [],
        referenceIds: ['ref-c'],
      },
    ],
    summary: {
      indexedPdfDocuments: 2,
      validIndexedPdfDocuments: 2,
      invalidIndexedPdfDocuments: 0,
      uniquePdfDocuments: 2,
      physicalFiles: 0,
      physicallyStoredUniqueDocuments: 0,
      duplicatePhysicalFiles: 0,
      documentFamilies: 2,
      sourceUrls: 2,
      sourceVersions: 2,
      conflictingSourceUrls: 0,
      modelEdges: 3,
      mappedModelEdges: 3,
      byProofLevel: { EXACT_MODEL_PROVEN: 1, FAMILY_SCOPE_ONLY: 2 },
      nonIndexedClassificationLinks: 0,
      nonIndexedClassificationLinksByLane: {},
    },
  };
  const jobs = [{
    jobId: 'job-a',
    candidateId: 'candidate-job-a',
    sourceUrl,
    authorityBrand: 'Example',
    authorityMode: 'official',
    expectedContentType: 'application/pdf',
    documentTypes: ['specification_sheet'],
    sourceRoles: ['manufacturer_document'],
    acquisitionRoute: 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
    acquisitionRoutes: ['OFFICIAL_SOURCE_DISCOVERY_REQUIRED'],
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    priorityClasses: ['P0_CURRENT_MISSING_DIMENSIONS'],
    targetIds: ['target-a'],
  }];
  const queue = {
    schemaVersion: 2,
    generatedAt: '2026-07-19T00:00:00.000Z',
    sourceAcquisitionQueueSha256: '1'.repeat(64),
    sourceOfficialCandidateManifestSha256: '2'.repeat(64),
    jobs,
    targets: [target({
      targetId: 'target-a',
      referenceId: 'ref-a',
      model: 'EX100',
      priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
      executionLane: 'ACQUISITION',
      candidateJobIds: ['job-a'],
    })],
    discoveryTargets: [
      target({
        targetId: 'target-b',
        referenceId: 'ref-b',
        model: 'EX200',
        priorityClass: 'P1_HISTORICAL_MISSING_DIMENSIONS',
        resolverVersion,
      }),
      target({
        targetId: 'target-c',
        referenceId: 'ref-c',
        model: 'EX300',
        priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
        resolverVersion,
      }),
      target({
        targetId: 'target-none',
        referenceId: 'ref-none',
        model: 'EX400',
        resolverVersion,
      }),
    ],
    deferredTargets: [],
    summary: {
      acquisitionRecords: 4,
      fetchJobs: 1,
      targets: 4,
      acquisitionTargets: 1,
      discoveryTargets: 3,
      deferredTargets: 0,
      resolverOnlyTargets: 0,
      candidateEdges: 1,
      uniqueReferences: 4,
      suppressedPriorTerminalEdges: 0,
      suppressedPriorAcceptedSourceEdges: 0,
      suppressedPriorResolverOnlyTargets: 0,
      byLifecycle: { CURRENT_RETAIL: 2, CATALOG_ARCHIVED: 2 },
      byPriority: {
        P0_CURRENT_MISSING_DIMENSIONS: 2,
        P1_HISTORICAL_MISSING_DIMENSIONS: 2,
      },
      byExecutionLane: { ACQUISITION: 1, BOUNDED_DISCOVERY: 3 },
      deferredByReason: {},
      excluded: {},
    },
  };
  const policy = {
    schemaVersion: 1,
    policyVersion: '2026-07-19.1',
    parser: { claimParserRevision: 'fixture-v1' },
  };
  const attemptLedger = {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    entries: [],
    sourceAcceptances: [],
    targetAttempts: [],
    summary: {},
  };
  return {
    generatedAt: '2026-07-19T00:00:00.000Z',
    documentGraph: graph,
    executableQueue: queue,
    policy,
    attemptLedger,
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
    previousCanaries: null,
  };
}

function family(result, familyId) {
  return result.families.find((entry) => entry.familyId === familyId);
}

function decision(result, targetId) {
  return result.targetDecisions.find((entry) => entry.targetId === targetId);
}

function rehashCanaries(value) {
  const next = structuredClone(value);
  next.semanticCanarySha256 = canonicalJsonSha256({
    schemaVersion: next.schemaVersion,
    generatedAt: next.generatedAt,
    documentGraphSha256: next.documentGraphSha256,
    executableQueueSha256: next.executableQueueSha256,
    policySha256: next.policySha256,
    parserContractSha256: next.parserContractSha256,
    processorEpochs: next.processorEpochs,
    families: next.families,
    targetDecisions: next.targetDecisions,
  });
  return next;
}

function setFamilyState(value, familyId, state, stateReason) {
  const next = structuredClone(value);
  const familyEntry = family(next, familyId);
  familyEntry.state = state;
  familyEntry.stateReason = stateReason;
  for (const targetDecision of next.targetDecisions.filter(
    (entry) => entry.familyIds.length === 1 && entry.familyIds[0] === familyId,
  )) {
    const representative = targetDecision.targetId === familyEntry.representativeTargetId;
    targetDecision.familyState = state;
    targetDecision.runnerAllowed = state === 'PASSED'
      || (['CANARY_READY', 'REOPENED'].includes(state) && representative);
    targetDecision.fanoutEligible = state === 'PASSED';
    targetDecision.reason = state === 'PASSED'
      ? 'FAMILY_CANARY_PASSED'
      : targetDecision.runnerAllowed
        ? 'FAMILY_CANARY_EXECUTION'
        : `FAMILY_${state}`;
  }
  return rehashCanaries(next);
}

test('selects one deterministic representative and never leaks state across families', () => {
  const input = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  const result = buildHistoricalEvidenceFamilyCanaries(input);

  assert.equal(family(result, 'family-a').state, 'CANARY_READY');
  assert.equal(family(result, 'family-a').representativeTargetId, 'target-a');
  assert.equal(decision(result, 'target-a').runnerAllowed, true);
  assert.equal(decision(result, 'target-b').runnerAllowed, false);
  assert.equal(family(result, 'family-b').state, 'CANARY_READY');
  assert.equal(family(result, 'family-b').representativeTargetId, 'target-c');
  assert.equal(decision(result, 'target-c').runnerAllowed, true);
  assert.equal(decision(result, 'target-none').assignment, 'UNSCOPED_SINGLETON');
  assert.equal(decision(result, 'target-none').fanoutEligible, false);
});

test('initial pass requires proven target identity and overlap with the current candidate source', () => {
  const matching = buildHistoricalEvidenceFamilyCanaries(fixture());
  assert.equal(family(matching, 'family-a').state, 'PASSED');
  assert.deepEqual(family(matching, 'family-a').provenRepresentativeTargetIds, ['target-a']);
  assert.equal(decision(matching, 'target-b').runnerAllowed, true);

  const changed = buildHistoricalEvidenceFamilyCanaries(fixture({
    sourceUrl: 'https://official.example/new-template.pdf',
  }));
  assert.equal(family(changed, 'family-a').state, 'CANARY_READY');
  assert.equal(decision(changed, 'target-b').runnerAllowed, false);
});

test('one post-gate canary failure blocks sibling fan-out under the same family contract', () => {
  const initialInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  const initial = buildHistoricalEvidenceFamilyCanaries(initialInput);
  const nextInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  nextInput.generatedAt = '2026-07-19T01:00:00.000Z';
  nextInput.attemptLedger.generatedAt = nextInput.generatedAt;
  nextInput.previousCanaries = initial;
  nextInput.attemptLedger.entries = [{
    attemptId: 'attempt-source-failure',
    targetId: 'target-a',
    referenceId: 'ref-a',
    sourceUrl: 'https://official.example/new-template.pdf',
    status: 'transport_failure',
    failureCode: 'transport',
    policySha256: canonicalJsonSha256(nextInput.policy),
    attemptedAt: '2026-07-19T00:30:00.000Z',
  }];

  const result = buildHistoricalEvidenceFamilyCanaries(nextInput);
  assert.equal(family(result, 'family-a').state, 'FAILED_SOURCE');
  assert.equal(family(result, 'family-a').stateEvidence.attemptId, 'attempt-source-failure');
  assert.equal(decision(result, 'target-a').runnerAllowed, false);
  assert.equal(decision(result, 'target-b').runnerAllowed, false);
  assert.equal(family(result, 'family-b').state, 'CANARY_READY');
  assert.equal(decision(result, 'target-c').runnerAllowed, true);
});

test('parser failure applies only when bound to the current processor epoch', () => {
  const initial = buildHistoricalEvidenceFamilyCanaries(fixture({
    sourceUrl: 'https://official.example/new-template.pdf',
  }));
  const nextInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  nextInput.generatedAt = '2026-07-19T01:00:00.000Z';
  nextInput.attemptLedger.generatedAt = nextInput.generatedAt;
  nextInput.previousCanaries = initial;
  nextInput.attemptLedger.entries = [{
    attemptId: 'attempt-parser-failure',
    targetId: 'target-a',
    referenceId: 'ref-a',
    sourceUrl: 'https://official.example/new-template.pdf',
    status: 'mineru_failure',
    failureCode: 'mineru',
    policySha256: canonicalJsonSha256(nextInput.policy),
    processorCapability: 'example-parser',
    evidenceProcessorSha256: PROCESSOR_SHA,
    attemptedAt: '2026-07-19T00:30:00.000Z',
  }];

  assert.equal(
    family(buildHistoricalEvidenceFamilyCanaries(nextInput), 'family-a').state,
    'FAILED_PARSER',
  );
  nextInput.attemptLedger.entries[0].evidenceProcessorSha256 = '1'.repeat(64);
  assert.equal(
    family(buildHistoricalEvidenceFamilyCanaries(nextInput), 'family-a').state,
    'CANARY_READY',
  );
});

test('parser, source-template and resolver contract changes reopen prior terminal states', () => {
  const initialInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  const initial = buildHistoricalEvidenceFamilyCanaries(initialInput);
  const failed = setFamilyState(initial, 'family-a', 'FAILED_PARSER', 'CANARY_PARSER_FAILURE');

  const parserChanged = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  parserChanged.previousCanaries = failed;
  parserChanged.parserContractSha256 = '9'.repeat(64);
  assert.equal(
    family(buildHistoricalEvidenceFamilyCanaries(parserChanged), 'family-a').state,
    'REOPENED',
  );

  const sourceChanged = fixture({ sourceUrl: 'https://official.example/third-template.pdf' });
  sourceChanged.previousCanaries = failed;
  sourceChanged.generatedAt = '2026-07-19T01:00:00.000Z';
  sourceChanged.attemptLedger.generatedAt = sourceChanged.generatedAt;
  sourceChanged.attemptLedger.entries = [{
    attemptId: 'old-contract-failure',
    targetId: 'target-a',
    referenceId: 'ref-a',
    sourceUrl: 'https://official.example/new-template.pdf',
    status: 'transport_failure',
    failureCode: 'transport',
    policySha256: canonicalJsonSha256(sourceChanged.policy),
    attemptedAt: '2026-07-19T00:30:00.000Z',
  }];
  assert.equal(
    family(buildHistoricalEvidenceFamilyCanaries(sourceChanged), 'family-a').state,
    'REOPENED',
  );

  const resolverBase = buildHistoricalEvidenceFamilyCanaries(fixture({ resolverVersion: '1' }));
  const failedResolver = setFamilyState(
    resolverBase,
    'family-b',
    'FAILED_SOURCE',
    'CANARY_SOURCE_FAILURE',
  );
  const resolverChanged = fixture({ resolverVersion: '2' });
  resolverChanged.previousCanaries = failedResolver;
  assert.equal(
    family(buildHistoricalEvidenceFamilyCanaries(resolverChanged), 'family-b').state,
    'REOPENED',
  );
});

test('tampered prior state or event boundary is rejected before projection', () => {
  const previous = buildHistoricalEvidenceFamilyCanaries(fixture({
    sourceUrl: 'https://official.example/new-template.pdf',
  }));
  const stateTampered = structuredClone(previous);
  family(stateTampered, 'family-a').state = 'PASSED';
  const stateInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  stateInput.previousCanaries = stateTampered;
  assert.throws(
    () => buildHistoricalEvidenceFamilyCanaries(stateInput),
    /previous family canary semantic hash drift/i,
  );

  const timeTampered = structuredClone(previous);
  timeTampered.generatedAt = '2026-07-18T00:00:00.000Z';
  const timeInput = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  timeInput.previousCanaries = timeTampered;
  assert.throws(
    () => buildHistoricalEvidenceFamilyCanaries(timeInput),
    /previous family canary semantic hash drift/i,
  );
});

test('multiple canonical families remain explicit singleton research without authorising either family', () => {
  const input = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  input.documentGraph.families[1].referenceIds.push('ref-b');
  input.documentGraph.documents[1].modelEdges.push({
    referenceId: 'ref-b',
    proofLevel: 'FAMILY_SCOPE_ONLY',
    proofLocators: [{ type: 'KNOWLEDGE_FAMILY_SCOPE', familyId: 'family-b' }],
  });
  input.documentGraph.summary.modelEdges += 1;
  input.documentGraph.summary.mappedModelEdges += 1;
  input.documentGraph.summary.byProofLevel.FAMILY_SCOPE_ONLY += 1;

  const result = buildHistoricalEvidenceFamilyCanaries(input);
  assert.equal(decision(result, 'target-b').assignment, 'MULTI_FAMILY_SINGLETON');
  assert.equal(decision(result, 'target-b').fanoutEligible, false);
  assert.equal(decision(result, 'target-b').runnerAllowed, true);
  assert.deepEqual(decision(result, 'target-b').familyIds, ['family-a', 'family-b']);
  assert.notEqual(family(result, 'family-a').representativeTargetId, 'target-b');
  assert.notEqual(family(result, 'family-b').representativeTargetId, 'target-b');
});

test('runner selection rejects a blocked sibling and all contract drift', () => {
  const input = fixture({ sourceUrl: 'https://official.example/new-template.pdf' });
  const canaries = buildHistoricalEvidenceFamilyCanaries(input);
  const queueSha256 = canonicalJsonSha256(input.executableQueue);
  const policySha256 = canonicalJsonSha256(input.policy);
  const batch = {
    schemaVersion: 1,
    queue: { schemaVersion: 2, sha256: queueSha256 },
    policy: { version: 'fixture', sha256: policySha256 },
    targets: [{ targetId: 'target-a', referenceId: 'ref-a' }],
  };

  assert.doesNotThrow(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch,
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
  }));
  assert.throws(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch: { ...batch, targets: [{ targetId: 'target-b', referenceId: 'ref-b' }] },
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
  }), /blocked by family canary/i);
  assert.throws(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch,
    parserContractSha256: '8'.repeat(64),
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
  }), /parser contract drift/i);
  assert.throws(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch: { ...batch, queue: { schemaVersion: 2, sha256: '7'.repeat(64) } },
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
  }), /queue hash drift/i);
  assert.throws(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch,
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': '6'.repeat(64) },
  }), /processor epoch drift/i);
  assert.throws(() => validateHistoricalEvidenceFamilyCanarySelection({
    canaries,
    batch: { ...batch, targets: [{ targetId: 'target-a', referenceId: 'ref-b' }] },
    parserContractSha256: PARSER_SHA,
    processorEpochs: { 'example-parser': PROCESSOR_SHA },
  }), /target reference drift/i);
});
