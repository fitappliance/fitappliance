#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import * as defaultFs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildRetailLifecycleRefreshPlan,
  buildRetailLifecycleRefreshRun,
  retailerRawObjectPath,
  validateRetailLifecycleRefreshPlan,
  validateRetailLifecycleRefreshRun,
} from '../../src/domain/retail-lifecycle-refresh-execution.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';

const require = createRequire(import.meta.url);
const { buildPartnerizeRetailerSnapshot } = require('../affiliate/partnerize-tgg.js');
const {
  AO_ORIGIN,
  buildAoFailedRetailerSnapshot,
  buildAoRetailerSnapshot,
  fetchJsonWithBytes,
  slugFromProductUrl,
} = require('../discovery-pipeline/lib/appliances-online-product-api.js');
const execFile = promisify(execFileCallback);
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE_POLICY_ID = 'the-good-guys-partnerize-feed-v1';
const AO_SOURCE_POLICY_ID = 'appliances-online-product-api-v1';

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function safeRunId(value) {
  const result = required(value, 'retailer refresh run ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) throw new TypeError('retailer refresh run ID is unsafe');
  return result;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

async function readJsonWithHash(fs, path) {
  const bytes = await fs.readFile(path);
  return { document: JSON.parse(bytes), sha256: sha256(bytes) };
}

async function readOptional(fs, path) {
  try {
    return await fs.readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function durableAtomicWrite(fs, path, value, { exclusive = false } = {}) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (exclusive && await readOptional(fs, path)) {
    await fs.rm(temporary, { force: true });
    throw new Error(`retailer refresh file already exists: ${path}`);
  }
  await fs.rename(temporary, path);
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the retailer refresh storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report the retailer refresh volume UUID');
  return value;
}

function currentProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireRunLock(fs, lockPath, { runId, resume, isProcessAlive, now }) {
  const token = sha256(`${runId}\0${process.pid}\0${now()}\0${Math.random()}`);
  const lock = { schemaVersion: 1, runId, token, host: hostname(), pid: process.pid, acquiredAt: now() };
  const write = async () => {
    await fs.mkdir(dirname(lockPath), { recursive: true });
    const handle = await fs.open(lockPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  try {
    await write();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    if (!resume || await isProcessAlive(existing.pid)) {
      throw new Error('retailer refresh run lock is held');
    }
    const stalePath = `${lockPath}.stale-${token.slice(0, 12)}`;
    await fs.rename(lockPath, stalePath);
    try {
      await write();
      await fs.rm(stalePath, { force: true });
    } catch (replacementError) {
      await fs.rename(stalePath, lockPath).catch(() => {});
      throw replacementError;
    }
  }
  return async () => {
    const bytes = await readOptional(fs, lockPath);
    if (!bytes) return;
    const current = JSON.parse(bytes);
    if (current.token === token) await fs.rm(lockPath, { force: true });
  };
}

function adapterFromPolicy(policy, sourcePolicyId) {
  const source = policy.sources.find((candidate) => candidate.id === sourcePolicyId);
  if (!source) throw new TypeError(`retailer source policy missing ${sourcePolicyId}`);
  return {
    id: source.id,
    retailer: source.retailer,
    sourceType: source.sourceType,
    allowedHosts: source.allowedHosts,
    minimumIntervalMs: source.minimumIntervalMs,
    robotsReviewedAt: policy.reviewedAt,
    termsReviewedAt: policy.reviewedAt,
    policyVersion: `${policy.policyVersion}:${source.id}`,
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  };
}

function stateForRawObject({ runId, plan, rawObject }) {
  const document = {
    schemaVersion: 1,
    statePolicyVersion: 'retail-lifecycle-refresh-run-state-v1',
    runId,
    status: 'source_stored',
    planId: plan.planId,
    planSemanticSha256: plan.semanticSha256,
    rawObject,
  };
  document.semanticSha256 = canonicalSha256(document);
  return document;
}

function validateRawState(state, { runId, plan }) {
  if (!state || state.schemaVersion !== 1
    || state.statePolicyVersion !== 'retail-lifecycle-refresh-run-state-v1'
    || state.runId !== runId || state.status !== 'source_stored'
    || state.planId !== plan.planId || state.planSemanticSha256 !== plan.semanticSha256) {
    throw new Error('retailer refresh run state drift');
  }
  const clone = structuredClone(state);
  delete clone.semanticSha256;
  if (state.semanticSha256 !== canonicalSha256(clone)) throw new Error('retailer refresh run state integrity mismatch');
  return state;
}

function planSourceTaskEntries(plan) {
  return plan.targets.flatMap((target) => target.sourceTasks.map((sourceTask) => ({ target, sourceTask })));
}

function trailingConsecutiveFailures(plan, records) {
  const byId = new Map(records.map((record) => [record.baselineLinkId, record]));
  let count = 0;
  for (const { sourceTask } of planSourceTaskEntries(plan)) {
    const record = byId.get(sourceTask.baselineLinkId);
    if (!record) break;
    count = record.outcome === 'failed' ? count + 1 : 0;
  }
  return count;
}

function buildAoState({ runId, plan, records, status = 'running', stopReason = null }) {
  const document = {
    schemaVersion: 1,
    statePolicyVersion: 'retail-lifecycle-ao-refresh-state-v2',
    runId,
    status,
    stopReason,
    planId: plan.planId,
    planSemanticSha256: plan.semanticSha256,
    records: structuredClone(records),
    consecutiveFailures: trailingConsecutiveFailures(plan, records),
  };
  document.semanticSha256 = canonicalSha256(document);
  return document;
}

function validateAoState(state, { runId, plan }) {
  if (!state || state.schemaVersion !== 1
    || state.statePolicyVersion !== 'retail-lifecycle-ao-refresh-state-v2'
    || state.runId !== runId || !['running', 'blocked'].includes(state.status)
    || state.planId !== plan.planId || state.planSemanticSha256 !== plan.semanticSha256
    || !Array.isArray(state.records)) {
    throw new Error('AO retailer refresh run state drift');
  }
  const clone = structuredClone(state);
  delete clone.semanticSha256;
  if (state.semanticSha256 !== canonicalSha256(clone)) throw new Error('AO retailer refresh run state integrity mismatch');
  const ids = state.records.map((record) => record.baselineLinkId);
  if (new Set(ids).size !== ids.length) throw new Error('AO retailer refresh state contains duplicate targets');
  const completed = new Set(ids);
  const expectedPrefix = planSourceTaskEntries(plan)
    .slice(0, ids.length)
    .map(({ sourceTask }) => sourceTask.baselineLinkId);
  if (ids.some((id) => !expectedPrefix.includes(id))
    || expectedPrefix.some((id) => !completed.has(id))) {
    throw new Error('AO retailer refresh state is not a completed target prefix');
  }
  if (state.consecutiveFailures !== trailingConsecutiveFailures(plan, state.records)) {
    throw new Error('AO retailer refresh consecutive failure state mismatch');
  }
  return state;
}

function hashOrder(seed, value) {
  return sha256(`${seed}\0${value}`);
}

function orderedAoCanonicalProductIds(inventory, { executionState, seed }) {
  const candidates = inventory.items.filter((item) => item.sourceTasks.some((task) => (
    task.sourcePolicyId === AO_SOURCE_POLICY_ID && task.executionState === executionState
  )));
  const byCategory = new Map();
  for (const item of candidates) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const categories = [...byCategory].sort(([left], [right]) => left.localeCompare(right));
  for (const [, items] of categories) {
    items.sort((left, right) => hashOrder(seed, left.canonicalProductId)
      .localeCompare(hashOrder(seed, right.canonicalProductId)));
  }
  const ordered = [];
  let round = 0;
  while (ordered.length < candidates.length) {
    let added = false;
    for (const [, items] of categories) {
      const item = items[round];
      if (!item) continue;
      ordered.push(item.canonicalProductId);
      added = true;
    }
    if (!added) break;
    round += 1;
  }
  if (ordered.length !== candidates.length || new Set(ordered).size !== ordered.length) {
    throw new Error('AO exact-product selection accounting mismatch');
  }
  return ordered;
}

function aoSourceTaskCount(inventory, canonicalProductId, executionState) {
  const item = inventory.items.find((candidate) => candidate.canonicalProductId === canonicalProductId);
  if (!item) throw new Error(`AO selection product is missing from inventory: ${canonicalProductId}`);
  const count = item.sourceTasks.filter((task) => (
    task.sourcePolicyId === AO_SOURCE_POLICY_ID && task.executionState === executionState
  )).length;
  if (count < 1) throw new Error(`AO selection product has no executable source tasks: ${canonicalProductId}`);
  return count;
}

function partitionAoProductsBySourceTaskBudget(inventory, ordered, { executionState, batchSize }) {
  const batches = [];
  let current = [];
  let sourceTasks = 0;
  for (const canonicalProductId of ordered) {
    const productTasks = aoSourceTaskCount(inventory, canonicalProductId, executionState);
    if (productTasks > batchSize) {
      throw new Error(`AO product exceeds one-run source task budget: ${canonicalProductId}`);
    }
    if (current.length > 0 && sourceTasks + productTasks > batchSize) {
      batches.push(current);
      current = [];
      sourceTasks = 0;
    }
    current.push(canonicalProductId);
    sourceTasks += productTasks;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function selectAoCanaryCanonicalProductIds(inventory, {
  canaryIndex = 0,
  canarySize = 20,
} = {}) {
  if (!Number.isInteger(canaryIndex) || canaryIndex < 0) throw new TypeError('AO canary index must be non-negative');
  if (!Number.isInteger(canarySize) || canarySize < 1 || canarySize > 20) {
    throw new TypeError('AO canary size must be between 1 and 20');
  }
  const ordered = orderedAoCanonicalProductIds(inventory, {
    executionState: 'BOUNDED_CANARY_ONLY',
    seed: `ao-canary-v1:${canaryIndex}`,
  });
  return (partitionAoProductsBySourceTaskBudget(inventory, ordered, {
    executionState: 'BOUNDED_CANARY_ONLY',
    batchSize: canarySize,
  })[0] ?? []).sort();
}

export function selectAoScaleCanonicalProductIds(inventory, {
  batchIndex = 0,
  batchSize = 100,
} = {}) {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) throw new TypeError('AO scale batch index must be non-negative');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new TypeError('AO scale batch size must be between 1 and 100');
  }
  const ordered = orderedAoCanonicalProductIds(inventory, {
    executionState: 'RUNNABLE_POLICY_REVIEWED_SOURCE',
    seed: 'ao-scale-v1',
  });
  const selected = partitionAoProductsBySourceTaskBudget(inventory, ordered, {
    executionState: 'RUNNABLE_POLICY_REVIEWED_SOURCE',
    batchSize,
  })[batchIndex] ?? [];
  if (selected.length === 0) throw new Error(`AO scale batch ${batchIndex} has no executable targets`);
  return selected.sort();
}

async function defaultFetchAoTarget(target, sourceTask, observedAt, dependencies = {}) {
  const productUrl = sourceTask.url;
  const slug = slugFromProductUrl(productUrl);
  if (!slug) throw new Error('AO exact product URL does not contain a product slug');
  const date = observedAt.slice(0, 10).split('-').map((part) => Number(part)).join('-');
  return fetchJsonWithBytes(
    `${AO_ORIGIN}/api/v2/product/slug/${encodeURIComponent(slug)}?date=${date}`,
    { fetchImpl: dependencies.fetchImpl, timeoutMs: dependencies.timeoutMs },
  );
}

export async function collectAoRetailLifecycleRefreshRun(options, dependencies = {}) {
  const fs = dependencies.fs ?? defaultFs;
  const root = resolve(options.root ?? defaultRoot);
  const storageRoot = resolve(required(options.storageRoot, 'retailer refresh storage root'));
  const runId = safeRunId(options.runId);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const storageIdentity = dependencies.storageIdentity ?? await verifyEvidenceStorageRoot(storageRoot, {
    fs,
    getVolumeUuid: dependencies.getVolumeUuid ?? mountedVolumeUuid,
  });
  const runDirectory = join(storageIdentity.root, 'runs', 'retail-lifecycle-refresh', runId);
  const paths = {
    runDirectory,
    lock: join(runDirectory, 'lock.json'),
    plan: join(runDirectory, 'plan.json'),
    state: join(runDirectory, 'state.json'),
    run: join(runDirectory, 'run.json'),
  };
  const releaseLock = await acquireRunLock(fs, paths.lock, {
    runId,
    resume: options.resume === true,
    isProcessAlive: dependencies.isProcessAlive ?? currentProcessAlive,
    now,
  });
  try {
    const [inventory, projection, policy] = await Promise.all([
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory')),
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'publicProjection')),
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
    ]);
    const aoSource = policy.document.sources.find((source) => source.id === AO_SOURCE_POLICY_ID);
    if (!aoSource) throw new Error(`retailer source policy missing ${AO_SOURCE_POLICY_ID}`);
    let selectedCanonicalProductIds;
    if (aoSource.termsReviewState === 'pending_automated_scale_review') {
      if (options.batchIndex != null || options.batchSize != null) {
        throw new Error('AO canary policy does not accept scale batch options');
      }
      selectedCanonicalProductIds = selectAoCanaryCanonicalProductIds(inventory.document, {
        canaryIndex: options.canaryIndex ?? 0,
        canarySize: options.canarySize ?? 20,
      });
    } else if (aoSource.termsReviewState === 'reviewed_bounded_exact_product_api') {
      if (options.canaryIndex != null || options.canarySize != null) {
        throw new Error('reviewed AO scale policy does not accept canary options');
      }
      selectedCanonicalProductIds = selectAoScaleCanonicalProductIds(inventory.document, {
        batchIndex: options.batchIndex ?? 0,
        batchSize: options.batchSize ?? aoSource.automationControls?.maximumTargetsPerRun,
      });
    } else {
      throw new Error(`AO source policy is not executable: ${aoSource.termsReviewState}`);
    }
    const plan = buildRetailLifecycleRefreshPlan({
      inventory: inventory.document,
      inventorySha256: inventory.sha256,
      publicProjection: projection.document,
      publicProjectionSha256: projection.sha256,
      sourcePolicy: policy.document,
      sourcePolicySha256: policy.sha256,
      sourcePolicyId: AO_SOURCE_POLICY_ID,
      observedAt: options.observedAt,
      selectedCanonicalProductIds,
    });
    const existingPlanBytes = await readOptional(fs, paths.plan);
    if (options.resume) {
      if (!existingPlanBytes) throw new Error('AO retailer refresh resume plan is missing');
      const existingPlan = validateRetailLifecycleRefreshPlan(JSON.parse(existingPlanBytes));
      if (existingPlan.semanticSha256 !== plan.semanticSha256) throw new Error('AO retailer refresh plan drift blocks resume');
    } else {
      if (existingPlanBytes || await readOptional(fs, paths.run)) {
        throw new Error('AO retailer refresh run already exists; use --resume or a new run ID');
      }
      await durableAtomicWrite(fs, paths.plan, `${JSON.stringify(plan, null, 2)}\n`, { exclusive: true });
    }

    const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root, { fs });
    const existingRunBytes = await readOptional(fs, paths.run);
    if (existingRunBytes) {
      const run = validateRetailLifecycleRefreshRun(JSON.parse(existingRunBytes));
      if (run.plan.semanticSha256 !== plan.semanticSha256) throw new Error('AO completed run plan drift');
      await verifyRunObject(run, objectStore);
      return { run, paths, resumedCompletedRun: true };
    }

    const stateBytes = await readOptional(fs, paths.state);
    let state = stateBytes
      ? validateAoState(JSON.parse(stateBytes), { runId, plan })
      : buildAoState({ runId, plan, records: [] });
    if (state.status === 'blocked') throw new Error(`AO retailer refresh is policy-blocked: ${state.stopReason}`);
    if (!stateBytes) {
      await durableAtomicWrite(fs, paths.state, `${JSON.stringify(state, null, 2)}\n`, { exclusive: true });
    }
    const recordsBySourceTask = new Map(state.records.map((record) => [record.baselineLinkId, record]));
    const fetchTarget = dependencies.fetchAoTarget
      ?? ((target, sourceTask, observedAt) => defaultFetchAoTarget(target, sourceTask, observedAt, dependencies));
    const sleep = dependencies.sleep ?? ((ms) => new Promise((accept) => setTimeout(accept, ms)));
    let attemptedInProcess = recordsBySourceTask.size > 0 ? 1 : 0;
    for (const { target, sourceTask } of planSourceTaskEntries(plan)) {
      if (recordsBySourceTask.has(sourceTask.baselineLinkId)) continue;
      if (attemptedInProcess > 0) await sleep(plan.sourceContract.minimumIntervalMs);
      attemptedInProcess += 1;
      let record;
      let rawObject = null;
      let rawBytes = null;
      try {
        const response = await fetchTarget(target, sourceTask, plan.observedAt);
        rawBytes = Buffer.from(response.bytes);
        const contentSha256 = sha256(rawBytes);
        rawObject = {
          sha256: contentSha256,
          byteSize: rawBytes.length,
          objectPath: retailerRawObjectPath(contentSha256, 'json'),
          mediaType: 'application/json',
        };
        const snapshot = await buildAoRetailerSnapshot({
          adapter: adapterFromPolicy(policy.document, AO_SOURCE_POLICY_ID),
          canonicalProductId: target.canonicalProductId,
          expectedModel: target.model,
          productPayload: response.payload,
          productRawBytes: rawBytes,
          productUrl: sourceTask.url,
          observedAt: plan.observedAt,
          rawSourceReference: `retailer-object:sha256:${contentSha256}`,
        });
        await objectStore.writeObject(rawObject.objectPath, rawBytes);
        record = {
          recordId: sourceTask.baselineLinkId,
          baselineLinkId: sourceTask.baselineLinkId,
          canonicalProductId: target.canonicalProductId,
          outcome: 'succeeded',
          rawObject,
          snapshot,
          quarantines: [],
        };
      } catch (error) {
        const message = String(error?.message ?? error);
        const policyStop = /HTTP\s+(403|429)\b/i.test(message);
        const identityMismatch = ['AO_MODEL_MISMATCH', 'AO_URI_MISMATCH'].includes(error?.code);
        if (rawBytes == null && error?.rawResponseBytes != null) {
          rawBytes = Buffer.from(error.rawResponseBytes);
          const contentSha256 = sha256(rawBytes);
          rawObject = {
            sha256: contentSha256,
            byteSize: rawBytes.length,
            objectPath: retailerRawObjectPath(contentSha256, 'json'),
            mediaType: 'application/json',
          };
        }
        const rawBoundFailure = rawObject != null && rawBytes != null;
        if (policyStop) {
          state = buildAoState({
            runId,
            plan,
            records: [...recordsBySourceTask.values()].sort((left, right) => left.recordId.localeCompare(right.recordId)),
            status: 'blocked',
            stopReason: 'HTTP_POLICY_STOP',
          });
          await durableAtomicWrite(fs, paths.state, `${JSON.stringify(state, null, 2)}\n`);
          throw new Error(`${state.stopReason}: ${message}`);
        }
        if (identityMismatch && (rawObject == null || rawBytes == null)) {
          throw new Error('AO identity mismatch did not retain raw response metadata');
        }
        if (rawBoundFailure) await objectStore.writeObject(rawObject.objectPath, rawBytes);
        const failureContext = identityMismatch ? {
          kind: 'identity_mismatch',
          reasonCode: error.code,
          baselineLinkId: sourceTask.baselineLinkId,
          sourceUrl: sourceTask.url,
          expectedModel: error.expectedModel,
          receivedModel: error.receivedModel,
          receivedUrl: error.receivedUrl,
          rawPayloadSha256: rawObject.sha256,
        } : rawBoundFailure ? {
          kind: 'response_contract_failure',
          reasonCode: 'AO_RESPONSE_CONTRACT_FAILURE',
          baselineLinkId: sourceTask.baselineLinkId,
          sourceUrl: sourceTask.url,
          rawPayloadSha256: rawObject.sha256,
        } : null;
        const snapshot = await buildAoFailedRetailerSnapshot({
          adapter: adapterFromPolicy(policy.document, AO_SOURCE_POLICY_ID),
          canonicalProductId: target.canonicalProductId,
          observedAt: plan.observedAt,
          rawSourceReference: rawBoundFailure
            ? `retailer-object:sha256:${rawObject.sha256}`
            : `ao-api-attempt:${runId}:${sourceTask.baselineLinkId}`,
          collectionError: message,
          rawPayloadSha256: rawBoundFailure ? rawObject.sha256 : null,
          failureContext,
        });
        record = {
          recordId: sourceTask.baselineLinkId,
          baselineLinkId: sourceTask.baselineLinkId,
          canonicalProductId: target.canonicalProductId,
          outcome: 'failed',
          rawObject: rawBoundFailure ? rawObject : null,
          snapshot,
          error: message,
          quarantines: identityMismatch ? [{
            kind: 'identity_mismatch',
            baselineLinkId: sourceTask.baselineLinkId,
            reasonCode: error.code,
          }] : [],
        };
      }
      recordsBySourceTask.set(sourceTask.baselineLinkId, record);
      const records = [...recordsBySourceTask.values()].sort((left, right) => left.recordId.localeCompare(right.recordId));
      const consecutiveFailures = trailingConsecutiveFailures(plan, records);
      const failureStop = consecutiveFailures >= plan.sourceContract.maximumConsecutiveFailures;
      state = buildAoState({
        runId,
        plan,
        records,
        status: failureStop ? 'blocked' : 'running',
        stopReason: failureStop ? 'CONSECUTIVE_FAILURE_STOP' : null,
      });
      await durableAtomicWrite(fs, paths.state, `${JSON.stringify(state, null, 2)}\n`);
      if (failureStop) {
        throw new Error(`CONSECUTIVE_FAILURE_STOP: ${consecutiveFailures} consecutive AO collection failures`);
      }
      await dependencies.afterRecord?.({ record, state, paths });
    }
    const run = buildRetailLifecycleRefreshRun({
      runId,
      plan,
      records: [...recordsBySourceTask.values()],
    });
    await durableAtomicWrite(fs, paths.run, `${JSON.stringify(run, null, 2)}\n`, { exclusive: true });
    return { run, paths, resumedCompletedRun: false };
  } finally {
    await releaseLock();
  }
}

async function verifyRunObject(run, objectStore) {
  for (const record of run.records.filter((candidate) => candidate.rawObject != null)) {
    const bytes = await objectStore.readObject(record.rawObject.objectPath);
    if (bytes.length !== record.rawObject.byteSize || sha256(bytes) !== record.rawObject.sha256) {
      throw new Error(`retailer refresh raw object integrity mismatch: ${record.recordId}`);
    }
  }
}

export async function collectPartnerizeRetailLifecycleRefreshRun(options, dependencies = {}) {
  const fs = dependencies.fs ?? defaultFs;
  const root = resolve(options.root ?? defaultRoot);
  const storageRoot = resolve(required(options.storageRoot, 'retailer refresh storage root'));
  const runId = safeRunId(options.runId);
  const sourcePolicyId = options.sourcePolicyId ?? DEFAULT_SOURCE_POLICY_ID;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const storageIdentity = dependencies.storageIdentity ?? await verifyEvidenceStorageRoot(storageRoot, {
    fs,
    getVolumeUuid: dependencies.getVolumeUuid ?? mountedVolumeUuid,
  });
  const runDirectory = join(storageIdentity.root, 'runs', 'retail-lifecycle-refresh', runId);
  const paths = {
    runDirectory,
    lock: join(runDirectory, 'lock.json'),
    plan: join(runDirectory, 'plan.json'),
    state: join(runDirectory, 'state.json'),
    run: join(runDirectory, 'run.json'),
  };
  const releaseLock = await acquireRunLock(fs, paths.lock, {
    runId,
    resume: options.resume === true,
    isProcessAlive: dependencies.isProcessAlive ?? currentProcessAlive,
    now,
  });
  try {
    const [inventory, projection, policy] = await Promise.all([
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory')),
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'publicProjection')),
      readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
    ]);
    const plan = buildRetailLifecycleRefreshPlan({
      inventory: inventory.document,
      inventorySha256: inventory.sha256,
      publicProjection: projection.document,
      publicProjectionSha256: projection.sha256,
      sourcePolicy: policy.document,
      sourcePolicySha256: policy.sha256,
      sourcePolicyId,
      observedAt: options.observedAt,
    });
    const existingPlanBytes = await readOptional(fs, paths.plan);
    if (options.resume) {
      if (!existingPlanBytes) throw new Error('retailer refresh resume plan is missing');
      const existingPlan = validateRetailLifecycleRefreshPlan(JSON.parse(existingPlanBytes));
      if (existingPlan.semanticSha256 !== plan.semanticSha256) {
        throw new Error('retailer refresh plan drift blocks resume');
      }
    } else {
      if (existingPlanBytes || await readOptional(fs, paths.run)) {
        throw new Error('retailer refresh run already exists; use --resume or a new run ID');
      }
      await durableAtomicWrite(fs, paths.plan, `${JSON.stringify(plan, null, 2)}\n`, { exclusive: true });
    }

    const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root, { fs });
    const existingRunBytes = await readOptional(fs, paths.run);
    if (existingRunBytes) {
      const run = validateRetailLifecycleRefreshRun(JSON.parse(existingRunBytes));
      if (run.plan.semanticSha256 !== plan.semanticSha256) throw new Error('retailer refresh completed run plan drift');
      await verifyRunObject(run, objectStore);
      return { run, paths, resumedCompletedRun: true };
    }

    let rawObject;
    const stateBytes = await readOptional(fs, paths.state);
    if (stateBytes) {
      if (!options.resume) throw new Error('retailer refresh partial state requires --resume');
      rawObject = validateRawState(JSON.parse(stateBytes), { runId, plan }).rawObject;
      const bytes = await objectStore.readObject(rawObject.objectPath);
      if (bytes.length !== rawObject.byteSize || sha256(bytes) !== rawObject.sha256) {
        throw new Error('retailer refresh resume raw object integrity mismatch');
      }
    } else {
      const feedPath = resolve(required(options.feedPath, 'Partnerize feed path'));
      const feedBytes = await fs.readFile(feedPath);
      const contentSha256 = sha256(feedBytes);
      rawObject = {
        sha256: contentSha256,
        byteSize: feedBytes.length,
        objectPath: retailerRawObjectPath(contentSha256, 'csv'),
        mediaType: 'text/csv',
      };
      await objectStore.writeObject(rawObject.objectPath, feedBytes);
      await durableAtomicWrite(
        fs,
        paths.state,
        `${JSON.stringify(stateForRawObject({ runId, plan, rawObject }), null, 2)}\n`,
        { exclusive: true },
      );
      await dependencies.afterObjectStored?.({ rawObject, paths });
    }

    const feedBytes = await objectStore.readObject(rawObject.objectPath);
    const result = await buildPartnerizeRetailerSnapshot({
      adapter: adapterFromPolicy(policy.document, sourcePolicyId),
      catalogProducts: plan.catalogScope.map((product) => ({
        canonicalProductId: product.canonicalProductId,
        cat: product.category,
        brand: product.brand,
        model: product.model,
      })),
      feedRawBytes: feedBytes,
      observedAt: plan.observedAt,
      rawSourceReference: `retailer-object:sha256:${rawObject.sha256}`,
      complete: true,
    });
    const run = buildRetailLifecycleRefreshRun({
      runId,
      plan,
      records: [{
        recordId: `partnerize_feed_${rawObject.sha256.slice(0, 24)}`,
        outcome: 'succeeded',
        rawObject,
        snapshot: result.snapshot,
        quarantines: result.quarantines,
      }],
    });
    await durableAtomicWrite(fs, paths.run, `${JSON.stringify(run, null, 2)}\n`, { exclusive: true });
    return { run, paths, resumedCompletedRun: false };
  } finally {
    await releaseLock();
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export function parseArgs(args) {
  const supported = new Set([
    '--root', '--storage-root', '--run-id', '--feed', '--observed-at', '--source-policy-id', '--resume',
    '--canary-index', '--canary-size', '--batch-index', '--batch-size',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${flag}`);
    if (flag !== '--resume') index += 1;
  }
  return {
    root: option(args, '--root') ?? defaultRoot,
    storageRoot: option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT,
    runId: option(args, '--run-id'),
    feedPath: option(args, '--feed'),
    observedAt: option(args, '--observed-at'),
    sourcePolicyId: option(args, '--source-policy-id') ?? DEFAULT_SOURCE_POLICY_ID,
    canaryIndex: option(args, '--canary-index') == null ? null : Number(option(args, '--canary-index')),
    canarySize: option(args, '--canary-size') == null ? null : Number(option(args, '--canary-size')),
    batchIndex: option(args, '--batch-index') == null ? null : Number(option(args, '--batch-index')),
    batchSize: option(args, '--batch-size') == null ? null : Number(option(args, '--batch-size')),
    resume: args.includes('--resume'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const collector = options.sourcePolicyId === AO_SOURCE_POLICY_ID
    ? collectAoRetailLifecycleRefreshRun
    : collectPartnerizeRetailLifecycleRefreshRun;
  collector(options)
    .then(({ run, paths, resumedCompletedRun }) => {
      process.stdout.write(`${JSON.stringify({
        run: paths.run,
        runId: run.runId,
        summary: run.summary,
        resumedCompletedRun,
      }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
