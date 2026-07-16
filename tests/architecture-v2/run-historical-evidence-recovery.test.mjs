import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

import {
  manufacturerDocumentStrategiesIdentity,
  manufacturerSourcePolicyIdentity,
  parseHistoricalEvidenceRecoveryRunArgs,
  recoveryCandidateResolversForTarget,
  resolveHistoricalEvidenceRecoveryIoPaths,
  runHistoricalEvidenceRecovery,
} from '../../scripts/architecture-v2/run-historical-evidence-recovery.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const FIELDS = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];

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
    reconciliation: { registryAxisPermutationToleranceMm: 10 },
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
  const outputPath = join(root, 'results.json');
  const input = batch(targetCount);
  const policyValue = policy();
  const queueValue = { queue: true };
  input.queue.sha256 = canonicalJsonSha256(queueValue);
  input.policy.sha256 = canonicalJsonSha256(policyValue);
  await fs.writeFile(inputPath, JSON.stringify(input));
  await fs.writeFile(policyPath, JSON.stringify(policyValue));
  await fs.writeFile(queuePath, JSON.stringify(queueValue));
  return { root, inputPath, policyPath, queuePath, outputPath, input, policyValue, queueValue };
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
    }),
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

test('CLI parser supports recovery filters and rejects unsafe or incomplete combinations', () => {
  assert.deepEqual(parseHistoricalEvidenceRecoveryRunArgs([
    '--input', 'in.json', '--output=out.json', '--run-id', 'run-1', '--resume',
    '--require-selection',
    '--job-id', 'job-a', '--target-id', 'target-a',
    '--route=OFFICIAL_RECEIPT_REBUILD', '--limit', '2',
    '--network-concurrency', '2', '--mineru-concurrency=1',
  ]), {
    input: 'in.json', output: 'out.json', runId: 'run-1', resume: true, dryRun: false,
    requireSelection: true,
    jobIds: ['job-a'], targetIds: ['target-a'], routes: ['OFFICIAL_RECEIPT_REBUILD'], limit: 2,
    networkConcurrency: 2, mineruConcurrency: 1,
  });
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([]), /selection.*required/i);
  const allowAll = parseHistoricalEvidenceRecoveryRunArgs(['--allow-all']);
  assert.equal(allowAll.networkConcurrency, null);
  assert.equal(allowAll.mineruConcurrency, null);
  assert.equal(allowAll.requireSelection, false);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--allow-all', '--limit', '1',
  ]), /allow-all.*selection/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--allow-all', '--require-selection', '--limit', '1',
  ]), /allow-all.*require-selection/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs(['--require-selection']), /selection.*required/i);
  assert.equal(parseHistoricalEvidenceRecoveryRunArgs([
    '--require-selection', '--route', 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
  ]).requireSelection, true);
  const resume = parseHistoricalEvidenceRecoveryRunArgs(['--resume', '--run-id', 'run-1']);
  assert.equal(resume.resume, true);
  assert.equal(resume.runId, 'run-1');
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', 'run-1', '--allow-all',
  ]), /resume.*allow-all/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', 'run-1', '--require-selection',
  ]), /selection.*required/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs([
    '--resume', '--run-id', '../escape',
  ]), /run ID.*safe/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs(['--resume']), /run-id.*resume/i);
  assert.throws(() => parseHistoricalEvidenceRecoveryRunArgs(['--limit', '0']), /positive integer/i);
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

test('fresh run persists immutable queue and policy snapshots beside run state', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  await runHistoricalEvidenceRecovery({
    input: f.inputPath, output: f.outputPath, policy: f.policyPath, queue: f.queuePath,
    storageRoot: f.root, runId: 'run-snapshots', resume: false, dryRun: false,
    jobIds: [], routes: [], limit: null, networkConcurrency: 2, mineruConcurrency: 1,
  }, dependencies(f));

  const runDirectory = join(f.root, 'runs/historical-evidence-recovery/run-snapshots');
  assert.deepEqual(JSON.parse(await fs.readFile(join(runDirectory, 'queue.json'), 'utf8')), f.queueValue);
  assert.deepEqual(JSON.parse(await fs.readFile(join(runDirectory, 'policy.json'), 'utf8')), f.policyValue);
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
});
