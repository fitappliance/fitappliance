import { createHash } from 'node:crypto';
import * as defaultFs from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryBatch,
} from './historical-evidence-recovery-contract.mjs';

const TERMINAL_TARGET_STATUSES = new Set([
  'accepted', 'receipt_accepted_non_scalar', 'identity_rejected', 'claims_incomplete',
  'conflict_quarantined', 'terminal_failure',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function timestamp(value, label) {
  const normalized = requiredText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${label} invalid`);
  return new Date(normalized).toISOString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function underRoot(root, relativePath) {
  if (isAbsolute(String(relativePath ?? ''))) throw new TypeError('absolute storage path rejected');
  const path = resolve(root, ...String(relativePath).split('/'));
  if (!path.startsWith(`${root}${sep}`)) throw new TypeError('storage path escapes root');
  return path;
}

async function syncDirectory(fs, path) {
  let handle;
  try {
    handle = await fs.open(path, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

let temporaryCounter = 0;

async function durableAtomicWrite(fs, path, bytes, token = 'writer') {
  await fs.mkdir(dirname(path), { recursive: true });
  temporaryCounter += 1;
  const temporary = `${path}.tmp-${token}-${temporaryCounter}`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await syncDirectory(fs, dirname(path));
    await fs.rename(temporary, path);
    await syncDirectory(fs, dirname(path));
  } catch (error) {
    await handle?.close();
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readOptional(fs, path) {
  try {
    return await fs.readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function lockAgeMs(lock, now) {
  return Date.parse(now) - Date.parse(lock.heartbeatAt);
}

function validateLock(lock) {
  if (!lock || lock.schemaVersion !== 1 || !lock.ownerToken || !lock.host
    || !Number.isInteger(lock.process?.pid) || !lock.process?.startIdentity
    || !Number.isFinite(Date.parse(lock.heartbeatAt))) {
    throw new Error('run lock is malformed');
  }
  return lock;
}

function freshState({ runId, batch, toolchain, storageIdentity, now }) {
  return {
    schemaVersion: 1,
    runId,
    batchId: batch.batchId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    input: {
      batchSha256: canonicalJsonSha256(batch),
      queueSha256: batch.queue.sha256,
      policySha256: batch.policy.sha256,
      toolchainSha256: canonicalJsonSha256(toolchain),
      toolchain: structuredClone(toolchain),
      storageIdentity: structuredClone(storageIdentity),
    },
    artifacts: Object.fromEntries([...batch.artifactJobs]
      .sort((left, right) => left.jobId.localeCompare(right.jobId))
      .map((job) => [job.jobId, {
        job: structuredClone(job),
        discovered: false,
        state: 'queued', attempts: 0, failureCode: null, reason: null,
        contentSha256: null, artifactRecord: null,
      }])),
    targets: Object.fromEntries([...batch.targets]
      .sort((left, right) => left.targetId.localeCompare(right.targetId))
      .map((target) => [target.targetId, {
        state: 'queued', attempts: 0, status: null, outcome: null,
      }])),
    semanticOutcomeSha256: null,
    lastError: null,
  };
}

function verifyStateBindings(state, { runId, batch, toolchain, storageIdentity }) {
  if (state?.schemaVersion !== 1 || state.runId !== runId || state.batchId !== batch.batchId) {
    throw new Error('run state identity drift');
  }
  if (state.input?.batchSha256 !== canonicalJsonSha256(batch)
    || state.input?.queueSha256 !== batch.queue.sha256
    || state.input?.policySha256 !== batch.policy.sha256) {
    throw new Error('batch input drift blocks resume');
  }
  if (state.input?.toolchainSha256 !== canonicalJsonSha256(toolchain)) {
    throw new Error('toolchain drift blocks resume');
  }
  if (canonicalJsonSha256(state.input?.storageIdentity) !== canonicalJsonSha256(storageIdentity)) {
    throw new Error('storage identity drift blocks resume');
  }
  const artifactIds = [...batch.artifactJobs.map((job) => job.jobId)].sort();
  const targetIds = [...batch.targets.map((target) => target.targetId)].sort();
  const stateArtifactIds = Object.keys(state.artifacts ?? {}).sort();
  const missingArtifactIds = artifactIds.filter((jobId) => !stateArtifactIds.includes(jobId));
  const invalidExtraArtifacts = stateArtifactIds
    .filter((jobId) => !artifactIds.includes(jobId))
    .filter((jobId) => state.artifacts[jobId]?.discovered !== true
      || state.artifacts[jobId]?.job?.jobId !== jobId);
  if (missingArtifactIds.length || invalidExtraArtifacts.length
    || JSON.stringify(Object.keys(state.targets ?? {}).sort()) !== JSON.stringify(targetIds)) {
    throw new Error('run state graph drift');
  }
}

function prepareResume(state, now) {
  const resumed = structuredClone(state);
  resumed.status = 'running';
  resumed.updatedAt = now;
  resumed.completedAt = null;
  resumed.lastError = null;
  for (const artifact of Object.values(resumed.artifacts)) {
    if (artifact.state !== 'available') {
      artifact.state = 'queued';
      artifact.failureCode = null;
      artifact.reason = null;
    }
  }
  for (const target of Object.values(resumed.targets)) {
    if (target.state === 'completed' && TERMINAL_TARGET_STATUSES.has(target.outcome?.status)) continue;
    target.state = 'queued';
    target.status = null;
    target.outcome = null;
  }
  return resumed;
}

export function createEvidenceRecoveryStateStore(options) {
  const fs = options.fs ?? defaultFs;
  const storageRoot = resolve(requiredText(options.storageRoot, 'storage root'));
  const runId = requiredText(options.runId, 'run ID');
  const batch = options.batch;
  const toolchain = options.toolchain;
  const storageIdentity = options.storageIdentity;
  const now = options.now ?? (() => new Date().toISOString());
  const processIdentity = options.processIdentity;
  const host = requiredText(options.host, 'lock host');
  const isProcessAlive = options.isProcessAlive ?? (async () => false);
  const lockPolicy = options.lockPolicy;
  if (!Number.isInteger(processIdentity?.pid) || !processIdentity?.startIdentity) {
    throw new TypeError('process identity with PID and start identity required');
  }
  if (!Number.isInteger(lockPolicy?.staleAfterMs) || lockPolicy.staleAfterMs < 1) {
    throw new TypeError('lock stale timeout required');
  }
  const runDirectory = underRoot(storageRoot, `runs/historical-evidence-recovery/${runId}`);
  const paths = Object.freeze({
    runDirectory,
    batch: join(runDirectory, 'batch.json'),
    state: join(runDirectory, 'state.json'),
    lock: join(runDirectory, 'lock.json'),
    events: join(runDirectory, 'events.ndjson'),
  });
  let state = null;
  let ownerToken = null;
  let mutationTail = Promise.resolve();

  function serializeMutation(task) {
    const pending = mutationTail.then(task, task);
    mutationTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  const lockValue = () => {
    const at = timestamp(now(), 'lock time');
    ownerToken ??= canonicalJsonSha256({ runId, host, processIdentity, acquiredAt: at });
    return {
      schemaVersion: 1,
      runId,
      ownerToken,
      host,
      process: structuredClone(processIdentity),
      acquiredAt: at,
      heartbeatAt: at,
    };
  };

  async function existingLockStatus() {
    const bytes = await readOptional(fs, paths.lock);
    if (!bytes) return { available: true, lock: null, raw: null };
    let lock;
    try { lock = validateLock(JSON.parse(bytes)); } catch (error) { throw new Error(`run lock malformed: ${error.message}`); }
    const at = timestamp(now(), 'current time');
    const stale = lockAgeMs(lock, at) > lockPolicy.staleAfterMs;
    const alive = await isProcessAlive(lock.process);
    return { available: stale && !alive, stale, alive, lock, raw: bytes };
  }

  async function acquireLock() {
    await fs.mkdir(runDirectory, { recursive: true });
    const value = lockValue();
    let handle;
    try {
      handle = await fs.open(paths.lock, 'wx');
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
      await handle.close();
      await syncDirectory(fs, runDirectory);
      return;
    } catch (error) {
      await handle?.close();
      if (error?.code !== 'EEXIST') throw error;
    }

    const status = await existingLockStatus();
    if (!status.available) throw new Error('run lock held by a live or non-stale owner');
    const stalePath = `${paths.lock}.stale-${value.ownerToken.slice(0, 12)}`;
    await fs.rename(paths.lock, stalePath);
    const captured = await fs.readFile(stalePath);
    if (!captured.equals(status.raw)) {
      try { await fs.rename(stalePath, paths.lock); } catch {}
      throw new Error('run lock changed during stale recovery');
    }
    try {
      handle = await fs.open(paths.lock, 'wx');
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rm(stalePath, { force: true });
      await syncDirectory(fs, runDirectory);
    } catch (error) {
      await handle?.close();
      try { await fs.rename(stalePath, paths.lock); } catch {}
      throw error;
    }
  }

  async function releaseLock() {
    if (!ownerToken) return;
    const bytes = await readOptional(fs, paths.lock);
    if (bytes) {
      const lock = validateLock(JSON.parse(bytes));
      if (lock.ownerToken === ownerToken) {
        await fs.rm(paths.lock, { force: true });
        await syncDirectory(fs, runDirectory);
      }
    }
    ownerToken = null;
  }

  async function writeState(nextState) {
    nextState.updatedAt = timestamp(now(), 'state update time');
    await durableAtomicWrite(fs, paths.state, `${JSON.stringify(nextState, null, 2)}\n`, String(processIdentity.pid));
    state = structuredClone(nextState);
    return structuredClone(state);
  }

  async function readState() {
    const bytes = await fs.readFile(paths.state);
    return JSON.parse(bytes);
  }

  async function appendEvent(event) {
    await fs.mkdir(runDirectory, { recursive: true });
    const handle = await fs.open(paths.events, 'a');
    try {
      await handle.writeFile(`${JSON.stringify(event)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function readEvents() {
    const bytes = await readOptional(fs, paths.events);
    if (!bytes) return [];
    const text = bytes.toString('utf8');
    const lines = text.split('\n');
    const completeFinalLine = text.endsWith('\n');
    const events = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]) continue;
      try {
        events.push(JSON.parse(lines[index]));
      } catch (error) {
        const isTruncatedFinal = !completeFinalLine && index === lines.length - 1;
        if (!isTruncatedFinal) throw new Error(`event stream corruption at line ${index + 1}`);
      }
    }
    return events;
  }

  async function open({ resume }) {
    validateHistoricalEvidenceRecoveryBatch(batch);
    await acquireLock();
    try {
      const existing = await readOptional(fs, paths.state);
      if (!resume) {
        if (existing) throw new Error('run state already exists; use resume or a new run ID');
        if (await readOptional(fs, paths.batch)) {
          throw new Error('run batch snapshot already exists without state; use a new run ID');
        }
        await durableAtomicWrite(
          fs,
          paths.batch,
          `${JSON.stringify(batch, null, 2)}\n`,
          String(processIdentity.pid),
        );
        state = freshState({
          runId, batch, toolchain, storageIdentity,
          now: timestamp(now(), 'state creation time'),
        });
        await writeState(state);
        return structuredClone(state);
      }
      if (!existing) throw new Error('resume requested but run state is missing');
      const loaded = JSON.parse(existing);
      const batchSnapshotBytes = await readOptional(fs, paths.batch);
      if (!batchSnapshotBytes) throw new Error('run batch snapshot missing');
      let batchSnapshot;
      try { batchSnapshot = JSON.parse(batchSnapshotBytes); } catch { throw new Error('run batch snapshot invalid'); }
      try { validateHistoricalEvidenceRecoveryBatch(batchSnapshot); } catch (error) {
        throw new Error(`run batch snapshot invalid: ${error.message}`);
      }
      if (canonicalJsonSha256(batchSnapshot) !== canonicalJsonSha256(batch)
        || canonicalJsonSha256(batchSnapshot) !== loaded.input?.batchSha256) {
        throw new Error('run batch snapshot drift blocks resume');
      }
      verifyStateBindings(loaded, { runId, batch, toolchain, storageIdentity });
      state = prepareResume(loaded, timestamp(now(), 'resume time'));
      await writeState(state);
      return structuredClone(state);
    } catch (error) {
      await releaseLock();
      throw error;
    }
  }

  function applyTransition(delta) {
    return serializeMutation(async () => {
    if (!state) state = await readState();
    const next = structuredClone(state);
    if (delta.entity === 'artifact') {
      let artifact = next.artifacts[delta.id];
      if (!artifact) {
        const job = delta.artifactJob;
        if (delta.state !== 'running' || !job || job.jobId !== delta.id
          || !String(job.jobId).startsWith('discovered_')
          || new URL(job.sourceUrl).protocol !== 'https:') {
          throw new Error(`unknown artifact transition ${delta.id}`);
        }
        artifact = {
          job: structuredClone(job),
          discovered: true,
          state: 'queued', attempts: 0, failureCode: null, reason: null,
          contentSha256: null, artifactRecord: null,
        };
        next.artifacts[delta.id] = artifact;
      }
      if (delta.state === 'running') artifact.attempts += 1;
      artifact.state = delta.state;
      artifact.failureCode = delta.failureCode ?? null;
      artifact.reason = delta.reason ?? null;
      artifact.contentSha256 = delta.contentSha256 ?? artifact.contentSha256;
      if (delta.artifactRecord) artifact.artifactRecord = structuredClone(delta.artifactRecord);
    } else if (delta.entity === 'target') {
      const target = next.targets[delta.id];
      if (!target) throw new Error(`unknown target transition ${delta.id}`);
      if (delta.state === 'running') target.attempts += 1;
      target.state = delta.state;
      target.status = delta.status ?? target.status;
      if (delta.outcome) target.outcome = structuredClone(delta.outcome);
    } else {
      throw new TypeError('transition entity must be artifact or target');
    }
    await writeState(next);
    await appendEvent({ schemaVersion: 1, at: timestamp(now(), 'event time'), ...structuredClone(delta) });
    return structuredClone(state);
    });
  }

  function updateRunStatus(status, fields = {}) {
    return serializeMutation(async () => {
      if (!state) state = await readState();
      const next = { ...structuredClone(state), status, ...structuredClone(fields) };
      await writeState(next);
      await appendEvent({ schemaVersion: 1, at: timestamp(now(), 'event time'), entity: 'run', id: runId, state: status });
      return structuredClone(state);
    });
  }

  return Object.freeze({
    paths,
    open,
    readState,
    readEvents,
    applyTransition,
    releaseLock,
    async inspectLockAvailability() {
      validateHistoricalEvidenceRecoveryBatch(batch);
      return existingLockStatus();
    },
    async heartbeat() {
      if (!ownerToken) throw new Error('cannot heartbeat an unowned lock');
      const bytes = await fs.readFile(paths.lock);
      const lock = validateLock(JSON.parse(bytes));
      if (lock.ownerToken !== ownerToken) throw new Error('lock ownership lost');
      lock.heartbeatAt = timestamp(now(), 'heartbeat time');
      await durableAtomicWrite(fs, paths.lock, `${JSON.stringify(lock, null, 2)}\n`, String(processIdentity.pid));
    },
    markInterrupted: (reason) => updateRunStatus('interrupted', { lastError: String(reason) }),
    markFailed: (reason) => updateRunStatus('failed', { lastError: String(reason) }),
    markCompleted: (semanticOutcomeSha256) => updateRunStatus('completed', {
      semanticOutcomeSha256,
      completedAt: timestamp(now(), 'completion time'),
      lastError: null,
    }),
    async findArtifactRecord(transportKey) {
      if (!state) state = await readState();
      const match = Object.values(state.artifacts)
        .map((artifact) => artifact.artifactRecord)
        .find((record) => record?.transportKey === transportKey);
      return match ? structuredClone(match) : null;
    },
  });
}

export function pendingRecoveryBatch(batch, state) {
  validateHistoricalEvidenceRecoveryBatch(batch);
  const pendingTargets = batch.targets.filter((target) => {
    const targetState = state.targets?.[target.targetId];
    return !(targetState?.state === 'completed' && TERMINAL_TARGET_STATUSES.has(targetState.outcome?.status));
  });
  const pendingTargetIds = new Set(pendingTargets.map((target) => target.targetId));
  const requiredJobIds = new Set(pendingTargets.flatMap((target) => target.candidateJobIds));
  const artifactJobs = batch.artifactJobs
    .filter((job) => requiredJobIds.has(job.jobId))
    .map((job) => ({ ...structuredClone(job), targetIds: job.targetIds.filter((targetId) => pendingTargetIds.has(targetId)) }));
  const result = {
    ...structuredClone(batch),
    artifactJobs,
    targets: structuredClone(pendingTargets),
    summary: {
      artifactJobs: artifactJobs.length,
      targets: pendingTargets.length,
      candidateEdges: artifactJobs.reduce((count, job) => count + job.targetIds.length, 0),
    },
  };
  return validateHistoricalEvidenceRecoveryBatch(result);
}

export async function verifyEvidenceStorageRoot(storageRoot, options = {}) {
  const fs = options.fs ?? defaultFs;
  const root = await fs.realpath(resolve(requiredText(storageRoot, 'storage root')));
  const markerPath = join(root, '.fitappliance-storage-root.json');
  const bytes = await fs.readFile(markerPath);
  let marker;
  try { marker = JSON.parse(bytes); } catch { throw new Error('storage marker JSON invalid'); }
  if (marker?.schemaVersion !== 1 || marker.projectId !== 'fitappliance'
    || marker.storageRole !== 'architecture-v2-evidence'
    || !marker.volumeUuid) {
    throw new Error('storage marker identity invalid');
  }
  if (typeof options.getVolumeUuid !== 'function') throw new TypeError('mounted volume UUID resolver required');
  const mountedVolumeUuid = requiredText(await options.getVolumeUuid(root), 'mounted volume UUID');
  if (mountedVolumeUuid.toUpperCase() !== String(marker.volumeUuid).toUpperCase()) {
    throw new Error(`mounted volume UUID mismatch: expected ${marker.volumeUuid}, received ${mountedVolumeUuid}`);
  }
  return {
    root,
    markerSha256: canonicalJsonSha256(marker),
    volumeUuid: String(marker.volumeUuid).toUpperCase(),
  };
}

export function createEvidenceObjectStore(storageRoot, options = {}) {
  const fs = options.fs ?? defaultFs;
  const root = resolve(requiredText(storageRoot, 'storage root'));
  return Object.freeze({
    async readObject(relativePath) {
      return fs.readFile(underRoot(root, relativePath));
    },
    async writeObject(relativePath, bytes) {
      const path = underRoot(root, relativePath);
      const payload = Buffer.from(bytes ?? []);
      if (!payload.length) throw new TypeError('non-empty evidence object required');
      const existing = await readOptional(fs, path);
      if (existing) {
        if (sha256(existing) !== sha256(payload)) throw new Error('content-addressed object collision');
        return;
      }
      await durableAtomicWrite(fs, path, payload, 'object');
    },
  });
}
