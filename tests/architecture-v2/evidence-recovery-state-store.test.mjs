import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createEvidenceRecoveryStateStore,
  pendingRecoveryBatch,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const FIELDS = [
  'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
];

function job(jobId, targetIds) {
  return {
    jobId,
    sourceUrl: `https://official.example.com/${jobId}.pdf`,
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds,
  };
}

function target(targetId, jobId) {
  return {
    targetId,
    referenceId: `reference-${targetId}`,
    legacyRuntimeId: `legacy-${targetId}`,
    canonicalProductId: `product-${targetId}`,
    brand: 'Example',
    model: targetId.toUpperCase(),
    category: 'dishwasher',
    lifecycleState: 'CURRENT_RETAIL',
    requestedFields: FIELDS,
    primaryJobId: jobId,
    candidateJobIds: [jobId],
    publicationEligible: false,
    reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
  };
}

function batch() {
  const jobs = [job('job-a', ['target-a']), job('job-b', ['target-b'])];
  const targets = [target('target-a', 'job-a'), target('target-b', 'job-b')];
  return {
    schemaVersion: 1,
    batchId: 'historical-recovery-state-test',
    generatedAt: '2026-07-13T00:00:00.000Z',
    queue: { schemaVersion: 2, sha256: SHA_A },
    policy: { version: '2026-07-13.1', sha256: SHA_B },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: jobs,
    targets,
    summary: { artifactJobs: 2, targets: 2, candidateEdges: 2 },
  };
}

async function fixture(overrides = {}) {
  const storageRoot = await fs.mkdtemp(join(tmpdir(), 'fitappliance-state-'));
  let current = '2026-07-13T00:00:00.000Z';
  const options = {
    storageRoot,
    runId: 'run-test',
    batch: batch(),
    toolchain: { runnerVersion: '1', mineruVersion: '3.4.4', modelRevision: 'e'.repeat(40) },
    storageIdentity: { root: storageRoot, markerSha256: 'c'.repeat(64), volumeUuid: 'volume-test' },
    lockPolicy: { heartbeatMs: 15_000, staleAfterMs: 90_000 },
    now: () => current,
    processIdentity: { pid: 111, startIdentity: 'process-one' },
    host: 'test-host',
    isProcessAlive: async () => false,
    fs,
    ...overrides,
  };
  return {
    storageRoot,
    options,
    setNow(value) { current = value; },
  };
}

function acceptedOutcome(targetId) {
  return {
    targetId,
    status: 'accepted',
    failureCode: null,
    candidateInventorySha256: 'd'.repeat(64),
    candidateInventory: {},
    sources: [{ contentSha256: 'e'.repeat(64) }],
    geometryProjection: { evidenceLevel: 'dimensions' },
    semanticOutcomeSha256: 'f'.repeat(64),
  };
}

test('fresh run creates an exclusive lock and authoritative queued state', async (t) => {
  const { storageRoot, options } = await fixture();
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const store = createEvidenceRecoveryStateStore(options);
  const state = await store.open({ resume: false });

  assert.equal(state.status, 'running');
  assert.deepEqual(Object.keys(state.artifacts), ['job-a', 'job-b']);
  assert.deepEqual(Object.keys(state.targets), ['target-a', 'target-b']);
  assert.ok(Object.values(state.artifacts).every((entry) => entry.state === 'queued'));
  assert.ok(Object.values(state.targets).every((entry) => entry.state === 'queued'));
  assert.deepEqual(JSON.parse(await fs.readFile(store.paths.batch, 'utf8')), options.batch);
  assert.equal(JSON.parse(await fs.readFile(store.paths.lock, 'utf8')).process.startIdentity, 'process-one');
  await store.releaseLock();
});

test('live lock is rejected and a stale dead-owner lock is safely reclaimed', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });

  const live = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 222, startIdentity: 'process-two' },
    isProcessAlive: async (identity) => identity.startIdentity === 'process-one',
  });
  await assert.rejects(() => live.open({ resume: true }), /lock.*held|live lock/i);

  fixtureState.setNow('2026-07-13T00:02:00.000Z');
  const replacement = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 333, startIdentity: 'process-three' },
    isProcessAlive: async () => false,
  });
  const resumed = await replacement.open({ resume: true });
  assert.equal(resumed.status, 'running');
  assert.equal(JSON.parse(await fs.readFile(replacement.paths.lock, 'utf8')).process.startIdentity, 'process-three');
  await replacement.releaseLock();
});

test('two stale-lock reclaimers cannot both become the writer', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });
  fixtureState.setNow('2026-07-13T00:02:00.000Z');
  const contender = (pid, startIdentity) => createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid, startIdentity },
    isProcessAlive: async (identity) => identity.startIdentity !== 'process-one',
  });
  const left = contender(222, 'process-two');
  const right = contender(333, 'process-three');
  const settled = await Promise.allSettled([
    left.open({ resume: true }),
    right.open({ resume: true }),
  ]);
  assert.equal(settled.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((entry) => entry.status === 'rejected').length, 1);
  if (settled[0].status === 'fulfilled') await left.releaseLock();
  if (settled[1].status === 'fulfilled') await right.releaseLock();
});

test('state checkpoints dominate a truncated final diagnostic event', async (t) => {
  const { storageRoot, options } = await fixture();
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const store = createEvidenceRecoveryStateStore(options);
  await store.open({ resume: false });
  await store.applyTransition({
    entity: 'target', id: 'target-a', state: 'completed', status: 'accepted',
    semanticOutcomeSha256: 'f'.repeat(64), outcome: acceptedOutcome('target-a'),
  });
  await fs.appendFile(store.paths.events, '{"truncated":');

  const state = await store.readState();
  const events = await store.readEvents();
  assert.equal(state.targets['target-a'].outcome.status, 'accepted');
  assert.ok(events.some((event) => event.entity === 'target' && event.id === 'target-a'));
  assert.ok(!events.some((event) => event.truncated));
  await store.markInterrupted('simulated signal');
  assert.equal((await store.readState()).status, 'interrupted');
  await store.releaseLock();
});

test('persisted artifact record is available for rehydration after process restart', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });
  const artifactRecord = {
    schemaVersion: 1,
    transportKey: '1'.repeat(64),
    contentSha256: '2'.repeat(64),
    objectPath: 'evidence/web/sha256/22/22/object.pdf',
  };
  await first.applyTransition({
    entity: 'artifact', id: 'job-a', state: 'available',
    contentSha256: artifactRecord.contentSha256, artifactRecord,
  });
  await first.releaseLock();

  fixtureState.setNow('2026-07-13T00:00:01.000Z');
  const second = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 222, startIdentity: 'process-two' },
  });
  await second.open({ resume: true });
  assert.deepEqual(await second.findArtifactRecord(artifactRecord.transportKey), artifactRecord);
  await second.releaseLock();
});

test('discovered artifact jobs append immutably and survive resume without weakening the batch graph', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });
  const discoveredJob = {
    jobId: 'discovered_1234567890abcdef12345678',
    sourceUrl: 'https://official.example.com/discovered.pdf',
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
    priorityClass: 'P2_CURRENT_CONFIRMATION',
    targetIds: ['target-a'],
  };
  await first.applyTransition({
    entity: 'artifact', id: discoveredJob.jobId, state: 'running', artifactJob: discoveredJob,
  });
  await first.releaseLock();

  fixtureState.setNow('2026-07-13T00:00:01.000Z');
  const second = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 222, startIdentity: 'process-two' },
  });
  const resumed = await second.open({ resume: true });
  assert.equal(resumed.artifacts[discoveredJob.jobId].discovered, true);
  assert.deepEqual(resumed.artifacts[discoveredJob.jobId].job, discoveredJob);
  assert.equal(resumed.artifacts[discoveredJob.jobId].state, 'queued');
  await second.releaseLock();
});

test('resume skips terminal targets and requeues only retryable or interrupted work', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });
  await first.applyTransition({
    entity: 'target', id: 'target-a', state: 'completed', status: 'accepted',
    semanticOutcomeSha256: 'f'.repeat(64), outcome: acceptedOutcome('target-a'),
  });
  const retryable = {
    ...acceptedOutcome('target-b'),
    status: 'retryable_failure', failureCode: 'transport', sources: [], geometryProjection: null,
  };
  await first.applyTransition({
    entity: 'target', id: 'target-b', state: 'completed', status: retryable.status,
    semanticOutcomeSha256: retryable.semanticOutcomeSha256, outcome: retryable,
  });
  await first.markInterrupted('test');
  await first.releaseLock();

  fixtureState.setNow('2026-07-13T00:00:01.000Z');
  const second = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 222, startIdentity: 'process-two' },
  });
  const resumed = await second.open({ resume: true });
  const pending = pendingRecoveryBatch(options.batch, resumed);
  assert.deepEqual(pending.targets.map((entry) => entry.targetId), ['target-b']);
  assert.deepEqual(pending.artifactJobs.map((entry) => entry.jobId), ['job-b']);
  assert.equal(resumed.targets['target-a'].state, 'completed');
  assert.equal(resumed.targets['target-b'].state, 'queued');
  await second.releaseLock();
});

test('resume rejects batch and toolchain drift before mutating state', async (t) => {
  const fixtureState = await fixture();
  const { storageRoot, options } = fixtureState;
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const first = createEvidenceRecoveryStateStore(options);
  await first.open({ resume: false });
  await first.releaseLock();

  const changedBatch = structuredClone(options.batch);
  changedBatch.targets[0].model = 'CHANGED';
  const batchDrift = createEvidenceRecoveryStateStore({
    ...options, batch: changedBatch, processIdentity: { pid: 222, startIdentity: 'process-two' },
  });
  await assert.rejects(() => batchDrift.open({ resume: true }), /batch.*drift|input.*drift/i);

  const toolDrift = createEvidenceRecoveryStateStore({
    ...options,
    toolchain: { ...options.toolchain, mineruVersion: '9.9.9' },
    processIdentity: { pid: 333, startIdentity: 'process-three' },
  });
  await assert.rejects(() => toolDrift.open({ resume: true }), /toolchain.*drift/i);

  await fs.writeFile(first.paths.batch, JSON.stringify({ ...options.batch, batchId: 'tampered' }));
  const snapshotDrift = createEvidenceRecoveryStateStore({
    ...options,
    processIdentity: { pid: 444, startIdentity: 'process-four' },
  });
  await assert.rejects(() => snapshotDrift.open({ resume: true }), /batch snapshot.*drift/i);
});

test('invalid duplicate target batch is rejected before a lock is created', async (t) => {
  const { storageRoot, options } = await fixture();
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const invalid = structuredClone(options.batch);
  invalid.targets.push(structuredClone(invalid.targets[0]));
  invalid.summary.targets += 1;
  const store = createEvidenceRecoveryStateStore({ ...options, batch: invalid });
  await assert.rejects(() => store.open({ resume: false }), /duplicate target/i);
  await assert.rejects(() => fs.access(store.paths.lock), /ENOENT/);
});

test('storage preflight rejects marker and mounted volume identity mismatch', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fitappliance-storage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(join(root, '.fitappliance-storage-root.json'), JSON.stringify({
    schemaVersion: 1,
    projectId: 'fitappliance',
    storageRole: 'architecture-v2-evidence',
    volumeUuid: 'expected-volume',
  }));
  await assert.rejects(() => verifyEvidenceStorageRoot(root, {
    fs,
    getVolumeUuid: async () => 'wrong-volume',
  }), /volume UUID.*mismatch/i);
});
