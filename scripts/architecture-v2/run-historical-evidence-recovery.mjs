#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { hostname } from 'node:os';
import * as defaultFs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { acquireEvidenceArtifact, attestEvidenceArtifactForCase } from '../../src/domain/evidence-artifact-pipeline.mjs';
import { collectEvidenceCandidates } from '../../src/domain/evidence-candidate-inventory.mjs';
import { reconcileEvidenceClaims } from '../../src/domain/evidence-claim-reconciliation.mjs';
import { discoverRankedEvidenceCandidates } from '../../src/domain/evidence-source-discovery.mjs';
import {
  createEvidenceObjectStore,
  createEvidenceRecoveryStateStore,
  pendingRecoveryBatch,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryPolicy,
  validateHistoricalEvidenceRecoveryResults,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';
import { fetchOfficialArtifactResilient } from '../../src/domain/official-artifact-transport.mjs';
import { runReceiptBoundEvidenceBatch } from '../../src/domain/receipt-bound-evidence-batch-runner.mjs';
import { buildArchitectureV2ResolverAdapters } from '../pdf-pipeline/architecture-v2-resolver-adapters.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

export function parseHistoricalEvidenceRecoveryRunArgs(argv) {
  const result = {
    input: null,
    output: null,
    runId: null,
    resume: false,
    dryRun: false,
    jobIds: [],
    routes: [],
    limit: null,
    networkConcurrency: 2,
    mineruConcurrency: 1,
  };
  const textFlags = new Map([
    ['--input', 'input'], ['--output', 'output'], ['--run-id', 'runId'],
  ]);
  const repeatable = new Map([['--job-id', 'jobIds'], ['--route', 'routes']]);
  const numeric = new Map([
    ['--limit', 'limit'], ['--network-concurrency', 'networkConcurrency'],
    ['--mineru-concurrency', 'mineruConcurrency'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    let value = separator === -1 ? null : raw.slice(separator + 1);
    if (flag === '--resume') { result.resume = true; continue; }
    if (flag === '--dry-run') { result.dryRun = true; continue; }
    if (textFlags.has(flag)) {
      value ??= argv[++index];
      result[textFlags.get(flag)] = requiredText(value, flag);
      continue;
    }
    if (repeatable.has(flag)) {
      value ??= argv[++index];
      result[repeatable.get(flag)].push(requiredText(value, flag));
      continue;
    }
    if (numeric.has(flag)) {
      value ??= argv[++index];
      result[numeric.get(flag)] = positiveInteger(value, flag);
      continue;
    }
    throw new TypeError(`unknown argument: ${raw}`);
  }
  result.jobIds = [...new Set(result.jobIds)].sort();
  result.routes = [...new Set(result.routes)].sort();
  if (result.resume && !result.runId) throw new TypeError('--run-id is required with --resume');
  return result;
}

function selectedBatch(batch, options) {
  if (!options.jobIds.length && !options.routes.length && options.limit === null) return structuredClone(batch);
  const jobsById = new Map(batch.artifactJobs.map((job) => [job.jobId, job]));
  for (const jobId of options.jobIds) {
    if (!jobsById.has(jobId)) throw new TypeError(`unknown selected job ID: ${jobId}`);
  }
  let targets = batch.targets.filter((target) => {
    const jobs = target.candidateJobIds.map((jobId) => jobsById.get(jobId));
    return (!options.jobIds.length || jobs.some((job) => options.jobIds.includes(job.jobId)))
      && (!options.routes.length || jobs.some((job) => options.routes.includes(job.acquisitionRoute)));
  });
  if (options.limit !== null) targets = targets.slice(0, options.limit);
  const targetIds = new Set(targets.map((target) => target.targetId));
  const jobIds = new Set(targets.flatMap((target) => target.candidateJobIds));
  const artifactJobs = batch.artifactJobs
    .filter((job) => jobIds.has(job.jobId))
    .map((job) => ({ ...structuredClone(job), targetIds: job.targetIds.filter((targetId) => targetIds.has(targetId)) }));
  const selection = {
    ...structuredClone(batch.selection),
    jobIds: options.jobIds.length ? [...options.jobIds] : [...batch.selection.jobIds],
    routes: options.routes.length ? [...options.routes] : [...batch.selection.routes],
    limit: options.limit ?? batch.selection.limit,
  };
  const sliceSha = canonicalJsonSha256({
    sourceBatchId: batch.batchId,
    selection,
    targetIds: targets.map((target) => target.targetId),
  });
  return validateHistoricalEvidenceRecoveryBatch({
    ...structuredClone(batch),
    batchId: `${batch.batchId}-slice-${sliceSha.slice(0, 12)}`,
    selection,
    artifactJobs,
    targets: structuredClone(targets),
    summary: {
      artifactJobs: artifactJobs.length,
      targets: targets.length,
      candidateEdges: artifactJobs.reduce((count, job) => count + job.targetIds.length, 0),
    },
  });
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000, maxBuffer: 1024 * 1024 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000, maxBuffer: 1024 * 1024 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report a mounted volume UUID');
  return value;
}

async function processStartIdentity(pid) {
  const { stdout } = await execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 5_000, maxBuffer: 64 * 1024 });
  return requiredText(stdout, 'process start identity');
}

async function defaultProcessIdentity() {
  return { pid: process.pid, startIdentity: await processStartIdentity(process.pid) };
}

async function defaultIsProcessAlive(identity) {
  try {
    return await processStartIdentity(identity.pid) === identity.startIdentity;
  } catch {
    return false;
  }
}

async function defaultVerifyTools(policy) {
  const binary = process.env.FITAPPLIANCE_MINERU_BIN ?? 'mineru';
  const { stdout } = await execFile(binary, ['-v'], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const version = /\bversion\s+(\d+\.\d+\.\d+)\b/i.exec(stdout)?.[1];
  const revision = /\bfitappliance-model-revision\s+([a-f0-9]{40})\b/i.exec(stdout)?.[1];
  if (version !== policy.parser.version || revision !== policy.parser.modelRevision) {
    throw new Error('MinerU tool identity does not match recovery policy');
  }
  return {
    runnerVersion: '1',
    nodeVersion: process.version,
    mineruVersion: version,
    modelRevision: revision,
    claimSemanticsVersion: 2,
  };
}

async function durableOutputWrite(fs, path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  const handle = await fs.open(temporary, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, path);
}

async function fetchWithRetry(url, brand, policy) {
  let lastError;
  for (let attempt = 1; attempt <= policy.retry.fetchAttempts; attempt += 1) {
    try {
      return await fetchOfficialArtifactResilient(url, brand, {
        timeoutMs: policy.limits.timeoutMs,
        maximumBytes: policy.limits.maximumBytes,
        maximumRedirects: policy.limits.maximumRedirects,
        allowCurlFallback: true,
      });
    } catch (error) {
      lastError = error;
      if (attempt < policy.retry.fetchAttempts && policy.retry.baseDelayMs > 0) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, policy.retry.baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

function defaultGraphDependencies({ policy, storageIdentity, store, now }) {
  const objectStore = createEvidenceObjectStore(storageIdentity.root);
  const artifactCache = new Map();
  const contentCache = new Map();
  return {
    acquireArtifact: async (job, context) => {
      if (job.authorityMode !== 'official') {
        throw Object.assign(new Error('reference transport is not enabled in the official recovery lane'), { code: 'source_authority' });
      }
      return acquireEvidenceArtifact({ sourceUrl: job.sourceUrl }, {
        authorityBrand: job.authorityBrand,
        authorityMode: job.authorityMode,
        transportPolicySha256: policy.policySha256 ?? canonicalJsonSha256(policy),
        artifactCache,
        contentCache,
        readArtifactRecord: (transportKey) => store.findArtifactRecord(transportKey),
        readObject: objectStore.readObject,
        writeObject: objectStore.writeObject,
        fetchArtifact: (url, brand) => fetchWithRetry(url, brand, policy),
        processPdf: (bytes) => context.withMineru(() => runMineruPdfToJson(bytes, {
          storageRoot: storageIdentity.root,
          maximumPdfBytes: policy.limits.maximumBytes,
        })),
      });
    },
    attestTarget: (target, artifact) => attestEvidenceArtifactForCase(target, artifact, {
      now: now(),
      requestedFields: target.requestedFields,
      claimSemanticsVersion: 2,
      requireRequestedFieldCoverage: true,
    }),
    collectCandidates: collectEvidenceCandidates,
    candidateResolversForTarget: (target) => [{
      resolverId: 'architecture-v2-core-official-discovery',
      version: '1',
      scope: 'explicit_urls_product_pages_templates_and_bounded_sitemaps',
      required: true,
      resolve: (caseRecord) => discoverRankedEvidenceCandidates(caseRecord),
    }, ...buildArchitectureV2ResolverAdapters(target)],
    reconcileClaims: reconcileEvidenceClaims,
    projectGeometry: projectEvidenceGeometry,
    networkConcurrency: policy.concurrency.network,
    perHostConcurrency: policy.concurrency.perHost,
    mineruConcurrency: policy.concurrency.mineru,
    resolverTimeoutMs: policy.limits.timeoutMs,
  };
}

function resultsFromOutcomes(batch, state, outcomes, completedAt) {
  const sorted = [...outcomes].sort((left, right) => left.targetId.localeCompare(right.targetId));
  const semanticOutcomeSha256 = canonicalJsonSha256(sorted.map((outcome) => ({
    targetId: outcome.targetId,
    semanticOutcomeSha256: outcome.semanticOutcomeSha256,
  })));
  return validateHistoricalEvidenceRecoveryResults({
    schemaVersion: 1,
    runId: state.runId,
    batchId: batch.batchId,
    batchSha256: canonicalJsonSha256(batch),
    queueSha256: batch.queue.sha256,
    policySha256: batch.policy.sha256,
    startedAt: state.createdAt,
    completedAt,
    semanticOutcomeSha256,
    outcomes: sorted,
    summary: {
      targets: sorted.length,
      accepted: sorted.filter((row) => row.status === 'accepted').length,
      nonScalar: sorted.filter((row) => row.status === 'receipt_accepted_non_scalar').length,
      retryable: sorted.filter((row) => row.status === 'retryable_failure').length,
      terminal: sorted.filter((row) => !['accepted', 'receipt_accepted_non_scalar', 'retryable_failure'].includes(row.status)).length,
    },
  });
}

export async function runHistoricalEvidenceRecovery(options, dependencies = {}) {
  const fs = dependencies.fs ?? defaultFs;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const rawBatch = JSON.parse(await fs.readFile(resolve(options.input), 'utf8'));
  validateHistoricalEvidenceRecoveryBatch(rawBatch);
  const policy = JSON.parse(await fs.readFile(resolve(options.policy), 'utf8'));
  validateHistoricalEvidenceRecoveryPolicy(policy);
  if (canonicalJsonSha256(policy) !== rawBatch.policy.sha256) throw new Error('recovery policy hash drift');
  if (options.queue) {
    const queue = JSON.parse(await fs.readFile(resolve(options.queue), 'utf8'));
    if (canonicalJsonSha256(queue) !== rawBatch.queue.sha256) throw new Error('recovery queue hash drift');
  }
  const batch = selectedBatch(rawBatch, options);
  const verifyStorage = dependencies.verifyStorageRoot
    ?? ((root) => verifyEvidenceStorageRoot(root, { fs, getVolumeUuid: mountedVolumeUuid }));
  const storageIdentity = await verifyStorage(options.storageRoot);
  const verifyTools = dependencies.verifyTools ?? defaultVerifyTools;
  const toolchain = await verifyTools(policy);
  const runId = options.runId ?? `${options.dryRun ? 'dry' : 'run'}-${batch.batchId}-${now().replace(/[^0-9]/g, '').slice(0, 14)}`;
  const processIdentity = dependencies.processIdentity ?? await defaultProcessIdentity();
  const createStore = dependencies.stateStoreFactory ?? createEvidenceRecoveryStateStore;
  const store = createStore({
    storageRoot: storageIdentity.root,
    runId,
    batch,
    toolchain,
    storageIdentity,
    lockPolicy: policy.lock,
    now,
    processIdentity,
    host: dependencies.host ?? hostname(),
    isProcessAlive: dependencies.isProcessAlive ?? defaultIsProcessAlive,
    fs,
  });

  if (options.dryRun) {
    const lock = await store.inspectLockAvailability();
    if (!lock.available) throw new Error('run lock is not available for dry-run');
    return {
      dryRun: true,
      runId,
      batchId: batch.batchId,
      batchSha256: canonicalJsonSha256(batch),
      queueSha256: batch.queue.sha256,
      policySha256: batch.policy.sha256,
      toolchainSha256: canonicalJsonSha256(toolchain),
      storageIdentity,
      summary: structuredClone(batch.summary),
    };
  }

  let opened = false;
  let heartbeatTimer = null;
  let heartbeatError = null;
  try {
    let state = await store.open({ resume: options.resume });
    opened = true;
    const schedule = dependencies.setInterval ?? setInterval;
    const cancel = dependencies.clearInterval ?? clearInterval;
    heartbeatTimer = schedule(() => {
      store.heartbeat().catch((error) => { heartbeatError = error; });
    }, policy.lock.heartbeatMs);
    heartbeatTimer?.unref?.();

    const pending = pendingRecoveryBatch(batch, state);
    if (pending.targets.length > 0) {
      const graphRunner = dependencies.graphRunner ?? runReceiptBoundEvidenceBatch;
      const baseGraphDependencies = defaultGraphDependencies({ policy, storageIdentity, store, now });
      const externalTransition = dependencies.graphDependencies?.onTransition;
      const signal = dependencies.signal;
      const graphDependencies = {
        ...baseGraphDependencies,
        ...(dependencies.graphDependencies ?? {}),
        networkConcurrency: options.networkConcurrency,
        mineruConcurrency: options.mineruConcurrency,
        onTransition: async (delta) => {
          await store.applyTransition(delta);
          if (externalTransition) await externalTransition(delta);
          if (heartbeatError) throw heartbeatError;
          if (signal?.aborted) throw Object.assign(new Error('recovery interrupted by signal'), { code: 'INTERRUPTED' });
        },
      };
      const graphResult = await graphRunner(pending, graphDependencies);
      state = await store.readState();
      for (const outcome of graphResult?.outcomes ?? []) {
        if (state.targets[outcome.targetId]?.outcome?.semanticOutcomeSha256 === outcome.semanticOutcomeSha256) continue;
        await store.applyTransition({
          entity: 'target', id: outcome.targetId, state: 'completed',
          status: outcome.status, semanticOutcomeSha256: outcome.semanticOutcomeSha256,
          outcome,
        });
      }
    }
    if (heartbeatError) throw heartbeatError;
    state = await store.readState();
    const outcomes = Object.values(state.targets).map((target) => target.outcome).filter(Boolean);
    if (outcomes.length !== batch.targets.length) throw new Error('recovery target outcome accounting incomplete');
    const result = resultsFromOutcomes(batch, state, outcomes, new Date(now()).toISOString());
    await store.markCompleted(result.semanticOutcomeSha256);
    await durableOutputWrite(fs, resolve(options.output), result);
    cancel(heartbeatTimer);
    heartbeatTimer = null;
    await store.releaseLock();
    opened = false;
    return result;
  } catch (error) {
    if (opened) {
      if (error?.code === 'INTERRUPTED' || dependencies.signal?.aborted) await store.markInterrupted(error.message);
      else await store.markFailed(error.message);
    }
    throw error;
  } finally {
    const cancel = dependencies.clearInterval ?? clearInterval;
    if (heartbeatTimer) cancel(heartbeatTimer);
    if (opened) await store.releaseLock();
  }
}

async function main(argv) {
  const parsed = parseHistoricalEvidenceRecoveryRunArgs(argv);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const input = resolve(parsed.input ?? resolve(repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json'));
    const output = resolve(parsed.output ?? resolve(repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-results.json'));
    const result = await runHistoricalEvidenceRecovery({
      ...parsed,
      input,
      output,
      policy: resolve(repoRoot, 'data/architecture-v2/policies/historical-evidence-recovery-policy.json'),
      queue: resolve(repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json'),
      storageRoot: process.env.FITAPPLIANCE_STORAGE_ROOT,
    }, { signal: controller.signal });
    process.stdout.write(`${JSON.stringify(result.dryRun ? result : result.summary, null, 2)}\n`);
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
