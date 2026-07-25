import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { buildHistoricalEvidenceBoundedBatches } from '../../src/domain/historical-evidence-bounded-batch.mjs';

import {
  claimParserImplementationIdentity,
  manufacturerDocumentStrategiesIdentity,
  manufacturerSourcePolicyIdentity,
  officialResolverOptionsForObjectStore,
  officialArtifactFetchOptions,
  parseHistoricalEvidenceRecoveryRunArgs,
  recoveryCandidateResolversForTarget,
  resolveHistoricalEvidenceRecoveryIoPaths,
  runHistoricalEvidenceRecovery,
} from '../../scripts/architecture-v2/run-historical-evidence-recovery.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const PARSER_SHA = 'c'.repeat(64);
const FIELDS = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];

function familyCanaries(input, policyValue, queueValue = { queue: true }) {
  const semantic = {
    schemaVersion: 2,
    generatedAt: '2026-07-13T00:00:00.000Z',
    documentGraphSha256: 'd'.repeat(64),
    executableQueueSha256: canonicalJsonSha256(queueValue),
    policySha256: canonicalJsonSha256(policyValue),
    parserContractSha256: PARSER_SHA,
    processorEpochs: {},
    families: [],
    targetDecisions: input.targets.map((target) => ({
      targetId: target.targetId,
      referenceId: target.referenceId,
      executionLane: 'ACQUISITION',
      familyIds: [],
      assignment: 'UNSCOPED_SINGLETON',
      runnerAllowed: true,
      fanoutEligible: false,
      reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
    })),
  };
  return {
    ...semantic,
    semanticCanarySha256: canonicalJsonSha256(semantic),
    summary: {},
  };
}

function blockCanaryTarget(canaries, targetId) {
  const next = structuredClone(canaries);
  const decision = next.targetDecisions.find((entry) => entry.targetId === targetId);
  const familyId = `test-family-${targetId}`;
  const contractValue = {
    schemaVersion: 1,
    family: {
      familyId,
      category: 'dishwasher',
      brand: 'Example',
      groupType: 'document_family',
      documentIds: [],
      pdfSha256s: [],
      grammarProfileIds: [],
    },
    graphSourceUrls: [],
    candidateSourceUrls: [],
    resolverContracts: [],
    policySha256: next.policySha256,
    parserContractSha256: next.parserContractSha256,
    processorEpochs: next.processorEpochs,
  };
  next.families.push({
    familyId,
    category: 'dishwasher',
    brand: 'Example',
    groupType: 'document_family',
    groupName: 'Test blocked family',
    targetIds: [targetId],
    representativeTargetId: targetId,
    provenRepresentativeTargetIds: [],
    contract: { ...contractValue, sha256: canonicalJsonSha256(contractValue) },
    state: 'FAILED_SOURCE',
    stateReason: 'POST_CANARY_TRANSPORT_FAILURE',
  });
  Object.assign(decision, {
    familyIds: [familyId],
    assignment: 'FAMILY_CANARY',
    familyState: 'FAILED_SOURCE',
    representativeTargetId: targetId,
    runnerAllowed: false,
    fanoutEligible: false,
    reason: 'FAMILY_FAILED_SOURCE',
  });
  const semantic = {
    schemaVersion: next.schemaVersion,
    generatedAt: next.generatedAt,
    documentGraphSha256: next.documentGraphSha256,
    executableQueueSha256: next.executableQueueSha256,
    policySha256: next.policySha256,
    parserContractSha256: next.parserContractSha256,
    processorEpochs: next.processorEpochs,
    families: next.families,
    targetDecisions: next.targetDecisions,
  };
  next.semanticCanarySha256 = canonicalJsonSha256(semantic);
  return next;
}

test('recovery fetch options preserve model, category and discovery provenance end to end', () => {
  const discoveryProvenance = { method: 'official_market_api', matchedModel: 'W4104C.W.AU' };
  const options = officialArtifactFetchOptions(policy(), {
    expectedModel: 'W4104C.W',
    expectedCategory: 'washing_machine',
    discoveryProvenance,
  });

  assert.equal(options.expectedModel, 'W4104C.W');
  assert.equal(options.expectedCategory, 'washing_machine');
  assert.equal(options.discoveryProvenance, discoveryProvenance);
});

test('discovery and acquisition share content-addressed finder options for every stateful resolver', () => {
  const writeObject = async () => {};
  const options = officialResolverOptionsForObjectStore({ writeObject });
  for (const brand of [
    'bosch', 'beko', 'haier', 'asko', 'esatto', 'miele', 'fisherPaykel',
  ]) {
    assert.equal(options[brand].finderOptions.writeObject, writeObject, brand);
  }
});

test('recovery toolchain identity binds the complete manufacturer document strategy policy', () => {
  const first = manufacturerDocumentStrategiesIdentity({
    schemaVersion: 1,
    policyVersion: '2026-07-15.1',
    transport: { curlPreferredHosts: ['resource.electrolux.com.au'] },
  });
  const second = manufacturerDocumentStrategiesIdentity({
    schemaVersion: 1,
    policyVersion: '2026-07-15.2',
    transport: {
      curlPreferredHosts: ['resource.electrolux.com.au', 'www.westinghouse.com.au'],
      curlHttp1OnlyHosts: ['www.westinghouse.com.au'],
    },
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('recovery toolchain identity binds the manufacturer source policy', () => {
  const first = manufacturerSourcePolicyIdentity({
    schemaVersion: 1,
    policyVersion: '2026-07-15.1',
    officialHtmlModelVariantSuffixes: {},
  });
  const second = manufacturerSourcePolicyIdentity({
    schemaVersion: 1,
    policyVersion: '2026-07-16.1',
    officialHtmlModelVariantSuffixes: { westinghouse: { fridge: ['L', 'R'] } },
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('recovery toolchain identity changes when claim parser implementation changes', () => {
  const first = claimParserImplementationIdentity(new Map([
    ['src/domain/mineru-document.mjs', Buffer.from('grammar-v1')],
    ['src/domain/evidence-claim-semantics.mjs', Buffer.from('semantics-v1')],
  ]));
  const second = claimParserImplementationIdentity(new Map([
    ['src/domain/mineru-document.mjs', Buffer.from('grammar-v2')],
    ['src/domain/evidence-claim-semantics.mjs', Buffer.from('semantics-v1')],
  ]));

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(claimParserImplementationIdentity(new Map([
    ['src/domain/evidence-claim-semantics.mjs', Buffer.from('semantics-v1')],
    ['src/domain/mineru-document.mjs', Buffer.from('grammar-v1')],
  ])), first);
});

function batch(targetCount = 1) {
  const artifactJobs = [{
    jobId: 'job-a', sourceUrl: 'https://official.example.com/a.pdf', authorityBrand: 'Example',
    authorityMode: 'official', acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', targetIds: ['target-a'],
  }];
  const targets = [{
    targetId: 'target-a', referenceId: 'reference-a', legacyRuntimeId: 'legacy-a',
    canonicalProductId: 'product-a', brand: 'Example', model: 'EX100', category: 'dishwasher',
    lifecycleState: 'CURRENT_RETAIL', requestedFields: FIELDS, primaryJobId: 'job-a',
    candidateJobIds: ['job-a'], publicationEligible: false,
    reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
  }];
  if (targetCount === 2) {
    artifactJobs.push({
      jobId: 'job-b', sourceUrl: 'https://official.example.com/b.pdf', authorityBrand: 'Example',
      authorityMode: 'official', acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
      priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS', targetIds: ['target-b'],
    });
    targets.push({
      targetId: 'target-b', referenceId: 'reference-b', legacyRuntimeId: 'legacy-b',
      canonicalProductId: 'product-b', brand: 'Example', model: 'EX200', category: 'dishwasher',
      lifecycleState: 'CURRENT_RETAIL', requestedFields: FIELDS, primaryJobId: 'job-b',
      candidateJobIds: ['job-b'], publicationEligible: false,
      reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
    });
  }
  return {
    schemaVersion: 1, batchId: 'run-test-batch', generatedAt: '2026-07-13T00:00:00.000Z',
    queue: { schemaVersion: 2, sha256: SHA_A },
    policy: { version: '2026-07-13.1', sha256: SHA_B },
    selection: { jobIds: [], targetIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs, targets,
    summary: { artifactJobs: artifactJobs.length, targets: targets.length, candidateEdges: targets.length },
  };
}

function policy() {
  return {
    schemaVersion: 1,
    policyVersion: '2026-07-13.1', queueSchemaVersion: 2,
    supportedReceiptSchemaVersions: [2, 3], supportedClaimSemanticsVersions: [1, 2],
    requestedFields: FIELDS, authorityModes: ['official', 'reference'],
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
      format: 'content_list_v2', name: 'MinerU', version: '3.4.4',
      modelRevision: 'e'.repeat(40), backend: 'pipeline', method: 'auto',
      claimParserRevision: '2026-07-16.4',
      tableEnabled: true, formulaEnabled: false,
    },
  };
}

async function fixture({ targetCount = 1 } = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'fitappliance-run-'));
  const inputPath = join(root, 'batch.json');
  const policyPath = join(root, 'policy.json');
  const queuePath = join(root, 'queue.json');
  const targetStatePath = join(root, 'target-state.json');
  const boundedBatchesPath = join(root, 'bounded-batches.json');
  const outputPath = join(root, 'results.json');
  const input = batch(targetCount);
  const policyValue = policy();
  const queueTargets = input.targets.map((row) => ({
    targetId: row.targetId,
    referenceId: row.referenceId,
    brand: row.brand,
    model: row.model,
    category: row.category,
    lifecycleState: row.lifecycleState,
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    executionLane: 'ACQUISITION',
    candidateJobIds: [...row.candidateJobIds],
    primaryJobId: row.primaryJobId,
  }));
  const queueValue = {
    schemaVersion: 2,
    generatedAt: '2026-07-13T00:00:00.000Z',
    sourceAcquisitionQueueSha256: '1'.repeat(64),
    sourceOfficialCandidateManifestSha256: '2'.repeat(64),
    evidenceProcessorEpochs: {},
    jobs: input.artifactJobs.map((row) => ({ jobId: row.jobId, targetIds: [...row.targetIds] })),
    targets: queueTargets,
    discoveryTargets: [],
    deferredTargets: [],
    summary: {
      targets: queueTargets.length,
      acquisitionTargets: queueTargets.length,
      discoveryTargets: 0,
      deferredTargets: 0,
    },
  };
  input.queue.sha256 = canonicalJsonSha256(queueValue);
  input.policy.sha256 = canonicalJsonSha256(policyValue);
  const familyCanaryValue = familyCanaries(input, policyValue, queueValue);
  const targetState = {
    schemaVersion: 2,
    generatedAt: '2026-07-13T00:00:00.000Z',
    sourceBindings: {
      classificationSha256: '3'.repeat(64),
      acquisitionQueueSha256: '4'.repeat(64),
      executableQueueSha256: '5'.repeat(64),
      acceptanceBundleSha256: '6'.repeat(64),
      attemptLedgerSha256: '7'.repeat(64),
    },
    summary: { records: queueTargets.length },
    records: queueTargets.map((row) => ({
      referenceId: row.referenceId,
      category: row.category,
      canonicalBrand: row.brand,
      model: row.model,
      lifecycleState: row.lifecycleState,
      state: 'CANDIDATE_READY',
      stateClass: 'ACTIONABLE',
      actionable: true,
      terminal: false,
      binding: {
        type: 'executable_queue',
        targetId: row.targetId,
        executionLane: row.executionLane,
        candidateJobIds: [...row.candidateJobIds],
      },
      reopeningConditions: [],
    })),
  };
  const boundedBatches = buildHistoricalEvidenceBoundedBatches({
    executableQueue: queueValue,
    targetState,
    familyCanaries: familyCanaryValue,
    maximumTargets: 10,
  });
  await fs.writeFile(inputPath, JSON.stringify(input));
  await fs.writeFile(policyPath, JSON.stringify(policyValue));
  await fs.writeFile(queuePath, JSON.stringify(queueValue));
  await fs.writeFile(targetStatePath, JSON.stringify(targetState));
  await fs.writeFile(boundedBatchesPath, JSON.stringify(boundedBatches));
  return {
    root,
    inputPath,
    policyPath,
    queuePath,
    targetStatePath,
    boundedBatchesPath,
    outputPath,
    input,
    policyValue,
    queueValue,
    targetState,
    boundedBatches,
    familyCanaries: familyCanaryValue,
  };
}

function acceptedOutcome(targetId = 'target-a') {
  const outcome = {
    targetId, status: 'accepted', failureCode: null,
    candidateInventorySha256: 'c'.repeat(64),
    candidateInventory: {},
    sources: [{ contentSha256: 'd'.repeat(64) }],
    geometryProjection: { evidenceLevel: 'dimensions' },
    reconciliation: {
      conflictingFields: [], conflictHints: [], missingFields: [], supersessionViolations: [],
      axisPermutationResolution: null, lowerAuthorityResolution: null, conflictReason: null,
    },
    semanticOutcomeSha256: 'e'.repeat(64),
  };
  return outcome;
}

function dependencies(fixtureState, overrides = {}) {
  let current = '2026-07-13T00:00:00.000Z';
  return {
    fs,
    now: () => current,
    setNow: (value) => { current = value; },
    processIdentity: { pid: 111, startIdentity: 'process-one' },
    host: 'test-host',
    isProcessAlive: async () => false,
    verifyStorageRoot: async () => ({
      root: fixtureState.root,
      markerSha256: 'f'.repeat(64),
      volumeUuid: 'test-volume',
    }),
    verifyTools: async () => ({
      runnerVersion: '1', nodeVersion: process.version,
      mineruVersion: fixtureState.policyValue.parser.version,
      modelRevision: fixtureState.policyValue.parser.modelRevision,
      claimParserImplementationSha256: PARSER_SHA,
      evidenceProcessorEpochs: {},
    }),
    readFamilyCanaries: async (path) => {
      if (path.startsWith(join(fixtureState.root, 'runs/historical-evidence-recovery'))) {
        return JSON.parse(await fs.readFile(path, 'utf8'));
      }
      return structuredClone(fixtureState.familyCanaries);
    },
    graphRunner: async (pending, graphDependencies) => {
      const outcome = acceptedOutcome(pending.targets[0].targetId);
      await graphDependencies.onTransition({
        entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
        semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
      });
      return { outcomes: [outcome] };
    },
    graphDependencies: {},
    ...overrides,
  };
}

test('CLI parser requires tracked manifests and rejects legacy broad selections', () => {
  assert.deepEqual(parseHistoricalEvidenceRecoveryRunArgs([
    '--input', 'in.json', '--output=out.json', '--run-id', 'run-1',
    '--manifest-input', 'bounded.json', '--manifest-id', 'historical_batch_abc',
    '--network-concurrency', '2', '--mineru-concurrency=1',
  ]), {
    input: 'in.json', output: 'out.json', manifestInput: 'bounded.json',
    manifestId: 'historical_batch_abc', runId: 'run-1', resume: false, dryRun: false,
    jobIds: [], targetIds: [], routes: [], limit: null,
    networkConcurrency: 2, mineruConcurrency: 1,
  });
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([]), /manifest-id.*required/i);
  for (const flag of ['--allow-all', '--require-selection', '--job-id', '--target-id', '--route', '--limit']) {
    assert.throws(
      () => parseHistoricalEvidenceRecoveryRunArgs([flag, 'unsafe']),
      /prohibited.*manifest-id/i,
    );
  }
  const resume = parseHistoricalEvidenceRecoveryRunArgs(['--resume', '--run-id', 'run-1']);
  assert.equal(resume.resume, true);
  assert.equal(resume.runId, 'run-1');
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', 'run-1', '--manifest-input', 'other.json',
  ]), /manifest-input.*run-local/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', 'run-1', '--input', 'other.json',
  ]), /input.*run-local/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', '../escape',
  ]), /run ID.*safe/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs(['--resume']), /run-id.*resume/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs(['--unknown']), /unknown argument/i);
});

test('resume without repeated filters uses the immutable run batch and run-local results path', () => {
  const parsed = parseHistoricalEvidenceRecoveryRunArgs(['--resume', '--run-id', 'run-1']);
  assert.deepEqual(resolveHistoricalEvidenceRecoveryIoPaths(parsed, {
    storageRoot: '/evidence-root',
    repoRootPath: '/repo',
  }), {
    input: '/evidence-root/runs/historical-evidence-recovery/run-1/batch.json',
    output: '/evidence-root/runs/historical-evidence-recovery/run-1/results.json',
    policy: '/evidence-root/runs/historical-evidence-recovery/run-1/policy.json',
    queue: '/evidence-root/runs/historical-evidence-recovery/run-1/queue.json',
    familyCanaries: '/evidence-root/runs/historical-evidence-recovery/run-1/family-canaries.json',
    targetState: '/evidence-root/runs/historical-evidence-recovery/run-1/target-state.json',
    boundedBatches: '/evidence-root/runs/historical-evidence-recovery/run-1/bounded-manifest.json',
  });
});

test('brand-specific discovery makes the generic resolver supplemental instead of release-blocking', async () => {
  const fisherPaykel = recoveryCandidateResolversForTarget({
    brand: 'Fisher & Paykel', model: 'DW60CDW2', category: 'dishwasher',
  }, {
    coreResolver: async () => ({
      schemaVersion: 1,
      resolverId: 'architecture-v2-core-official-discovery',
      version: '1',
      scope: 'explicit_urls_product_pages_templates_and_bounded_sitemaps',
      required: true,
      completion: 'complete',
      candidates: [],
      failures: [],
    }),
  });
  assert.equal(fisherPaykel[0].resolverId, 'architecture-v2-core-official-discovery');
  assert.equal(fisherPaykel[0].required, false);
  assert.equal((await fisherPaykel[0].resolve({})).required, false);
  assert.equal(fisherPaykel[1].resolverId, 'fisher-paykel-official-support');
  assert.equal(fisherPaykel[1].required, true);

  const unsupported = recoveryCandidateResolversForTarget({
    brand: 'Unsupported Brand', model: 'EX100', category: 'dishwasher',
  });
  assert.equal(unsupported.length, 1);
  assert.equal(unsupported[0].required, true);
});

test('run concurrency can be reduced but cannot override audited policy maxima', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  await assert.rejects(() => runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-unsafe-concurrency', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 3, mineruConcurrency: 1,
  }, dependencies(f)), /network concurrency.*policy maximum/i);

  let observed;
  const deps = dependencies(f, {
    graphRunner: async (pending, graphDependencies) => {
      observed = {
        network: graphDependencies.networkConcurrency,
        perHost: graphDependencies.perHostConcurrency,
        mineru: graphDependencies.mineruConcurrency,
      };
      const outcome = acceptedOutcome(pending.targets[0].targetId);
      await graphDependencies.onTransition({
        entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
        semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
      });
      return { outcomes: [outcome] };
    },
  });
  await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-lower-concurrency', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 1, mineruConcurrency: 1,
  }, deps);
  assert.deepEqual(observed, { network: 1, perHost: 1, mineru: 1 });
});

test('fresh run writes one validated result and checkpoints the completed target', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const deps = dependencies(f);
  const result = await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-fresh', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, deps);

  assert.equal(result.summary.accepted, 1);
  assert.equal(result.batchSha256, canonicalJsonSha256(f.input));
  assert.deepEqual(JSON.parse(await fs.readFile(f.outputPath, 'utf8')), result);
  assert.deepEqual(JSON.parse(await fs.readFile(join(
    f.root, 'runs/historical-evidence-recovery/run-fresh/results.json',
  ), 'utf8')), result);
  const state = JSON.parse(await fs.readFile(join(
    f.root, 'runs/historical-evidence-recovery/run-fresh/state.json',
  ), 'utf8'));
  assert.equal(state.status, 'completed');
  assert.equal(state.targets['target-a'].outcome.status, 'accepted');
});

test('fresh run can select one resolver-only target by exact target ID', async (t) => {
  const f = await fixture({ targetCount: 2 });
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  let observedTargetIds = [];
  const result = await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-target-selection', resume: false, dryRun: false,
    jobIds: [], targetIds: ['target-b'], routes: [], limit: null,
    networkConcurrency: 2, mineruConcurrency: 1,
  }, dependencies(f, {
    graphRunner: async (pending, graphDependencies) => {
      observedTargetIds = pending.targets.map((target) => target.targetId);
      const outcome = acceptedOutcome('target-b');
      await graphDependencies.onTransition({
        entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
        semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
      });
      return { outcomes: [outcome] };
    },
  }));

  assert.deepEqual(observedTargetIds, ['target-b']);
  const persistedBatch = JSON.parse(await fs.readFile(join(
    f.root, 'runs/historical-evidence-recovery/run-target-selection/batch.json',
  ), 'utf8'));
  assert.deepEqual(persistedBatch.selection.targetIds, ['target-b']);
  assert.equal(result.summary.accepted, 1);
});

test('manifest-bound run persists queue, target state, policy, canary and selected manifest snapshots', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const manifest = f.boundedBatches.manifests[0];
  await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: f.queuePath,
    targetState: f.targetStatePath, boundedBatches: f.boundedBatchesPath,
    manifestId: manifest.manifestId,
    storageRoot: f.root, runId: 'run-snapshots', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, dependencies(f));

  const runDirectory = join(f.root, 'runs/historical-evidence-recovery/run-snapshots');
  assert.deepEqual(JSON.parse(await fs.readFile(join(runDirectory, 'queue.json'), 'utf8')), f.queueValue);
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(runDirectory, 'target-state.json'), 'utf8')),
    f.targetState,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(join(runDirectory, 'policy.json'), 'utf8')), f.policyValue);
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(runDirectory, 'family-canaries.json'), 'utf8')),
    f.familyCanaries,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(runDirectory, 'bounded-manifest.json'), 'utf8')),
    manifest,
  );
});

test('manifest-bound resume uses only the run-local control-plane snapshots', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const manifest = f.boundedBatches.manifests[0];
  const firstDependencies = dependencies(f, {
    graphRunner: async () => {
      throw Object.assign(new Error('manifest-bound interrupt'), { code: 'INTERRUPTED' });
    },
  });
  await assert.rejects(() => runHistoricalEvidenceRecovery({
    input: f.inputPath,
    output: f.outputPath,
    policy: f.policyPath,
    queue: f.queuePath,
    targetState: f.targetStatePath,
    boundedBatches: f.boundedBatchesPath,
    manifestId: manifest.manifestId,
    storageRoot: f.root,
    runId: 'run-manifest-resume',
    resume: false,
    dryRun: false,
    jobIds: [],
    routes: [],
    limit: null,
    networkConcurrency: 2,
    mineruConcurrency: 1,
  }, firstDependencies), /manifest-bound interrupt/);

  const runDirectory = join(f.root, 'runs/historical-evidence-recovery/run-manifest-resume');
  const resumeDependencies = dependencies(f, {
    processIdentity: { pid: 444, startIdentity: 'manifest-resume-process' },
  });
  resumeDependencies.setNow('2026-07-13T00:01:00.000Z');
  const result = await runHistoricalEvidenceRecovery({
    input: join(runDirectory, 'batch.json'),
    output: join(runDirectory, 'results.json'),
    policy: join(runDirectory, 'policy.json'),
    queue: join(runDirectory, 'queue.json'),
    targetState: join(runDirectory, 'target-state.json'),
    boundedBatches: join(runDirectory, 'bounded-manifest.json'),
    manifestId: null,
    storageRoot: f.root,
    runId: 'run-manifest-resume',
    resume: true,
    dryRun: false,
    jobIds: [],
    routes: [],
    limit: null,
    networkConcurrency: 2,
    mineruConcurrency: 1,
  }, resumeDependencies);

  assert.equal(result.summary.accepted, 1);
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(runDirectory, 'bounded-manifest.json'), 'utf8')),
    manifest,
  );
});

test('fresh run rejects a family-blocked target before run state or graph execution', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  let graphInvoked = false;
  f.familyCanaries = blockCanaryTarget(f.familyCanaries, 'target-a');

  await assert.rejects(() => runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-canary-blocked', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, dependencies(f, {
    graphRunner: async () => { graphInvoked = true; },
  })), /blocked by family canary/i);

  assert.equal(graphInvoked, false);
  await assert.rejects(() => fs.access(f.outputPath), /ENOENT/);
  await assert.rejects(() => fs.access(join(
    f.root, 'runs/historical-evidence-recovery/run-canary-blocked',
  )), /ENOENT/);
});

test('dry-run validates environment and graph without network, run state, or tracked output', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const result = await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-dry', resume: false, dryRun: true,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, dependencies(f, { graphRunner: async () => assert.fail('dry-run must not invoke graph/network') }));

  assert.equal(result.dryRun, true);
  await assert.rejects(() => fs.access(f.outputPath), /ENOENT/);
  await assert.rejects(() => fs.access(join(f.root, 'runs/historical-evidence-recovery/run-dry')), /ENOENT/);
});

test('fresh run blocks completed history before graph, run state, or tracked output', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  let scannedTargetIds = [];
  let graphInvoked = false;
  const deps = dependencies(f, {
    scanRunHistory: async ({ selectedBatch }) => {
      scannedTargetIds = selectedBatch.targets.map((target) => target.targetId);
      return [{
        targetId: 'target-a', priorRunId: 'prior-run', priorStatus: 'claims_incomplete',
        priorFailureCode: 'source_authority', reason: 'completed_exhausted_source_discovery',
        brand: 'Example', model: 'EX100',
      }];
    },
    graphRunner: async () => { graphInvoked = true; },
  });

  await assert.rejects(() => runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-history-blocked', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, deps), /completed run history blocks repeated targets.*prior-run.*completed_exhausted_source_discovery/i);

  assert.deepEqual(scannedTargetIds, ['target-a']);
  assert.equal(graphInvoked, false);
  await assert.rejects(() => fs.access(f.outputPath), /ENOENT/);
  await assert.rejects(() => fs.access(join(
    f.root, 'runs/historical-evidence-recovery/run-history-blocked',
  )), /ENOENT/);
});

test('interrupted run resumes only pending work and matches uninterrupted semantic digest', async (t) => {
  const f = await fixture({ targetCount: 2 });
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const firstAttempted = [];
  const firstDeps = dependencies(f, {
    graphRunner: async (pending, graphDependencies) => {
      const outcome = acceptedOutcome(pending.targets[0].targetId);
      firstAttempted.push(outcome.targetId);
      await graphDependencies.onTransition({
        entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
        semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
      });
      throw Object.assign(new Error('simulated interrupt'), { code: 'INTERRUPTED' });
    },
  });
  await assert.rejects(() => runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-resume', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, firstDeps), /simulated interrupt/);
  const interruptedState = JSON.parse(await fs.readFile(join(
    f.root, 'runs/historical-evidence-recovery/run-resume/state.json',
  ), 'utf8'));
  assert.equal(interruptedState.status, 'interrupted');
  assert.equal(interruptedState.targets['target-a'].state, 'completed');
  assert.equal(interruptedState.targets['target-b'].state, 'queued');
  assert.deepEqual(firstAttempted, ['target-a']);

  const originalFamilyCanaries = f.familyCanaries;
  f.familyCanaries = blockCanaryTarget(f.familyCanaries, 'target-b');
  const resumedAttempted = [];
  const resumeDeps = dependencies(f, {
    processIdentity: { pid: 222, startIdentity: 'process-two' },
    graphRunner: async (pending, graphDependencies) => {
      const outcomes = [];
      for (const target of pending.targets) {
        resumedAttempted.push(target.targetId);
        const outcome = acceptedOutcome(target.targetId);
        outcomes.push(outcome);
        await graphDependencies.onTransition({
          entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
          semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
        });
      }
      return { outcomes };
    },
  });
  resumeDeps.setNow('2026-07-13T00:01:00.000Z');
  const resumed = await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-resume', resume: true, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, resumeDeps);

  f.familyCanaries = originalFamilyCanaries;
  const uninterruptedPath = join(f.root, 'uninterrupted.json');
  const uninterruptedDeps = dependencies(f, {
    processIdentity: { pid: 333, startIdentity: 'process-three' },
    graphRunner: async (pending, graphDependencies) => {
      const outcomes = [];
      for (const target of pending.targets) {
        const outcome = acceptedOutcome(target.targetId);
        outcomes.push(outcome);
        await graphDependencies.onTransition({
          entity: 'target', id: outcome.targetId, state: 'completed', status: outcome.status,
          semanticOutcomeSha256: outcome.semanticOutcomeSha256, outcome,
        });
      }
      return { outcomes };
    },
  });
  const uninterrupted = await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: uninterruptedPath, policy: f.policyPath, queue: null,
    storageRoot: f.root, runId: 'run-uninterrupted', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, uninterruptedDeps);

  assert.deepEqual(resumedAttempted, ['target-b']);
  assert.equal(resumed.semanticOutcomeSha256, uninterrupted.semanticOutcomeSha256);
  const persistedCanaries = JSON.parse(await fs.readFile(join(
    f.root, 'runs/historical-evidence-recovery/run-resume/family-canaries.json',
  ), 'utf8'));
  assert.equal(
    persistedCanaries.targetDecisions.find((decision) => decision.targetId === 'target-b').runnerAllowed,
    true,
  );
});
