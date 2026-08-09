import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve, sep } from 'node:path';

import { loadActiveRetailRelease } from './active-retail-release.mjs';
import { assertSha256 } from './fit-v4-contract.mjs';

export const FIT_V4_RUN_MANIFEST_SCHEMA_VERSION = 1;
export const FIT_V4_CHECKPOINT_SCHEMA_VERSION = 1;

const FOUR_POLICIES = ['dishwasher', 'dryer', 'refrigerator', 'washingMachine'];
const THREE_SCHEMAS = ['knowledge', 'result', 'site'];
const MANIFEST_ID = /^fit_v4_manifest_[a-f0-9]{24}$/;
const RUN_ID = /^fit_v4_run_[a-f0-9]{24}$/;
const FIVE_TRUST_REGISTRIES = [
  'knowledgePolicyBundle', 'knowledgeReferenceRegistry', 'consentApprovalRegistry',
  'rightsEvidenceSet', 'calibrationLabelRegistry',
];
const NULLABLE_TRUST_REGISTRIES = new Set(['consentApprovalRegistry', 'calibrationLabelRegistry']);
const PROTECTED_DEPLOYMENT_SEGMENTS = new Set(['public', 'pages', 'api', 'pdf-evidence']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function semanticHash(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} key set invalid`);
  }
  return value;
}

function instant(value, label) {
  const parsed = new Date(text(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} invalid`);
  return parsed.toISOString();
}

function exactHashObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} required`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${label} key set invalid`);
  for (const key of keys) assertSha256(value[key], `${label} ${key}`);
  return canonical(value);
}

function trustedRegistryHashes(value) {
  exactKeys(value, FIVE_TRUST_REGISTRIES, 'trusted registry hashes');
  return canonical(Object.fromEntries(FIVE_TRUST_REGISTRIES.map((key) => {
    if (value[key] === null && NULLABLE_TRUST_REGISTRIES.has(key)) return [key, null];
    return [key, assertSha256(value[key], `trusted registry ${key}`)];
  })));
}

function nullableClockBinding(value, label) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be null or a bundle binding`);
  exactKeys(value, ['bundleSha256', 'observedAt'], label);
  return canonical({
    bundleSha256: assertSha256(value.bundleSha256, `${label} bundle`),
    observedAt: instant(value.observedAt, `${label} observedAt`),
  });
}

function retailEvidenceClock(value, asOf) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('retail evidence clock binding required');
  exactKeys(value, ['bundleSha256', 'oldestObservedAt', 'freshestObservedAt'], 'retail evidence clock binding');
  const oldestObservedAt = instant(value.oldestObservedAt, 'oldest retail evidence observation');
  const freshestObservedAt = instant(value.freshestObservedAt, 'freshest retail evidence observation');
  if (oldestObservedAt > freshestObservedAt || freshestObservedAt > asOf) throw new TypeError('retail evidence clock range invalid');
  return canonical({
    bundleSha256: assertSha256(value.bundleSha256, 'retail evidence clock bundle'),
    oldestObservedAt,
    freshestObservedAt,
  });
}

async function assertIsolatedRoot(path, label) {
  const absolute = resolve(text(path, label));
  if (absolute.split(sep).some((part) => PROTECTED_DEPLOYMENT_SEGMENTS.has(part))) {
    throw new Error(`${label} is outside the isolated Fit V4 shadow store`);
  }
  const { root } = parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        const target = await realpath(current);
        if (target.split(sep).some((segment) => PROTECTED_DEPLOYMENT_SEGMENTS.has(segment))) {
          throw new Error(`${label} symlink resolves into a protected deployment path`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  let existing = absolute;
  while (true) {
    try {
      const resolved = await realpath(existing);
      if (resolved.split(sep).some((part) => PROTECTED_DEPLOYMENT_SEGMENTS.has(part))) {
        throw new Error(`${label} resolves into a protected deployment path`);
      }
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
  }
  return absolute;
}

function manifestSemantic({ active, input, asOf }) {
  return canonical({
    schemaVersion: FIT_V4_RUN_MANIFEST_SCHEMA_VERSION,
    activeRelease: {
      releaseCandidateId: active.descriptor.releaseCandidateId,
      activatedAt: active.descriptor.activatedAt,
      catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
      historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
      authorizationManifestSha256: active.descriptor.artifacts.authorizationManifest.sha256,
    },
    identityMapSha256: assertSha256(input.identityMapSha256, 'identity map'),
    receiptBundleSha256: assertSha256(input.receiptBundleSha256, 'V4 receipt bundle'),
    fieldMapSha256: assertSha256(input.fieldMapSha256, 'field map'),
    schemaHashes: exactHashObject(input.schemaHashes, THREE_SCHEMAS, 'schema hashes'),
    policyHashes: exactHashObject(input.policyHashes, FOUR_POLICIES, 'policy hashes'),
    trustedRegistryHashes: trustedRegistryHashes(input.trustedRegistryHashes),
    policyEpoch: text(input.policyEpoch, 'policy epoch'),
    scenarioSetSha256: assertSha256(input.scenarioSetSha256, 'scenario set'),
    clockBindings: {
      retailEvidence: retailEvidenceClock(input.retailEvidenceClock, asOf),
      documentRevision: nullableClockBinding(input.documentRevisionClock, 'document revision clock'),
      siteObservation: nullableClockBinding(input.siteObservationClock, 'site observation clock'),
    },
    asOf,
  });
}

export async function createFitV4RunManifest(input, { root, descriptorPath } = {}) {
  if (!input || typeof input !== 'object') throw new TypeError('Fit V4 run input required');
  const asOf = instant(input.asOf, 'run asOf');
  const generatedAt = instant(input.generatedAt, 'run generatedAt');
  const active = await loadActiveRetailRelease({ root, descriptorPath });
  const semantic = manifestSemantic({ active, input, asOf });
  const semanticSha256 = semanticHash(semantic);
  const payload = canonical({
    schemaVersion: FIT_V4_RUN_MANIFEST_SCHEMA_VERSION,
    manifestId: `fit_v4_manifest_${semanticSha256.slice(0, 24)}`,
    runId: `fit_v4_run_${semanticSha256.slice(0, 24)}`,
    semanticSha256,
    semantic,
    generatedAt,
    clocks: {
      asOf,
      generatedAt,
      activeReleaseActivatedAt: semantic.activeRelease.activatedAt,
      retailEvidence: semantic.clockBindings.retailEvidence,
      documentRevision: semantic.clockBindings.documentRevision,
      siteObservation: semantic.clockBindings.siteObservation,
      policyEpoch: semantic.policyEpoch,
    },
  });
  return freezeDeep({ ...payload, manifestSha256: semanticHash(payload) });
}

export function validateFitV4RunManifest(value) {
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'semanticSha256', 'semantic',
    'generatedAt', 'clocks', 'manifestSha256',
  ], 'Fit V4 run manifest');
  if (!value || value.schemaVersion !== FIT_V4_RUN_MANIFEST_SCHEMA_VERSION
    || !MANIFEST_ID.test(String(value.manifestId)) || !RUN_ID.test(String(value.runId))) {
    throw new TypeError('Fit V4 run manifest invalid');
  }
  exactKeys(value.semantic, [
    'schemaVersion', 'activeRelease', 'identityMapSha256', 'receiptBundleSha256',
    'fieldMapSha256', 'schemaHashes', 'policyHashes', 'trustedRegistryHashes', 'policyEpoch',
    'scenarioSetSha256', 'clockBindings', 'asOf',
  ], 'Fit V4 run semantic manifest');
  if (value.semantic.schemaVersion !== FIT_V4_RUN_MANIFEST_SCHEMA_VERSION) throw new TypeError('Fit V4 semantic schema invalid');
  exactKeys(value.semantic.activeRelease, [
    'releaseCandidateId', 'activatedAt', 'catalogSha256', 'historicalReferenceSha256',
    'authorizationManifestSha256',
  ], 'active release binding');
  text(value.semantic.activeRelease.releaseCandidateId, 'active release candidate');
  if (instant(value.semantic.activeRelease.activatedAt, 'active release activation') !== value.semantic.activeRelease.activatedAt) {
    throw new TypeError('active release activation must be canonical');
  }
  for (const key of ['catalogSha256', 'historicalReferenceSha256', 'authorizationManifestSha256']) {
    assertSha256(value.semantic.activeRelease[key], `active release ${key}`);
  }
  for (const key of ['identityMapSha256', 'receiptBundleSha256', 'fieldMapSha256', 'scenarioSetSha256']) {
    assertSha256(value.semantic[key], `semantic ${key}`);
  }
  exactHashObject(value.semantic.schemaHashes, THREE_SCHEMAS, 'schema hashes');
  exactHashObject(value.semantic.policyHashes, FOUR_POLICIES, 'policy hashes');
  trustedRegistryHashes(value.semantic.trustedRegistryHashes);
  text(value.semantic.policyEpoch, 'policy epoch');
  if (instant(value.semantic.asOf, 'run asOf') !== value.semantic.asOf) throw new TypeError('run asOf must be canonical');
  exactKeys(value.semantic.clockBindings, ['retailEvidence', 'documentRevision', 'siteObservation'], 'clock bindings');
  retailEvidenceClock(value.semantic.clockBindings.retailEvidence, value.semantic.asOf);
  nullableClockBinding(value.semantic.clockBindings.documentRevision, 'document revision clock');
  nullableClockBinding(value.semantic.clockBindings.siteObservation, 'site observation clock');
  if (instant(value.generatedAt, 'run generatedAt') !== value.generatedAt) throw new TypeError('run generatedAt must be canonical');
  exactKeys(value.clocks, [
    'asOf', 'generatedAt', 'activeReleaseActivatedAt', 'retailEvidence',
    'documentRevision', 'siteObservation', 'policyEpoch',
  ], 'manifest clocks');
  const expectedSemantic = semanticHash(value.semantic);
  if (value.semanticSha256 !== expectedSemantic
    || value.manifestId !== `fit_v4_manifest_${expectedSemantic.slice(0, 24)}`
    || value.runId !== `fit_v4_run_${expectedSemantic.slice(0, 24)}`) {
    throw new TypeError('Fit V4 run semantic binding drift');
  }
  const { manifestSha256: ignored, ...payload } = value;
  if (value.manifestSha256 !== semanticHash(payload)) throw new TypeError('Fit V4 run manifest hash drift');
  const expectedClocks = canonical({
    asOf: value.semantic.asOf,
    generatedAt: value.generatedAt,
    activeReleaseActivatedAt: value.semantic.activeRelease.activatedAt,
    retailEvidence: value.semantic.clockBindings.retailEvidence,
    documentRevision: value.semantic.clockBindings.documentRevision,
    siteObservation: value.semantic.clockBindings.siteObservation,
    policyEpoch: value.semantic.policyEpoch,
  });
  if (JSON.stringify(value.clocks) !== JSON.stringify(expectedClocks)) throw new TypeError('Fit V4 run clock binding drift');
  return value;
}

async function atomicWrite(path, bytes, { immutable = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  if (immutable) {
    try {
      await stat(path);
      throw new Error(`immutable artifact exists: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    const verification = await readFile(temporary);
    if (sha256(verification) !== sha256(bytes)) throw new Error(`temporary artifact verification failed: ${basename(path)}`);
    await rename(temporary, path);
    const written = await readFile(path);
    if (sha256(written) !== sha256(bytes)) throw new Error(`renamed artifact verification failed: ${basename(path)}`);
  } finally {
    await rm(temporary, { force: true });
  }
}

function runDirectory(runsRoot, runId) {
  return join(runsRoot, runId);
}

function lockBytes(ownerId) {
  const record = canonical({
    schemaVersion: 1,
    ownerId: text(ownerId, 'lock owner ID'),
    pid: process.pid,
    createdAt: new Date().toISOString(),
    nonce: randomBytes(16).toString('hex'),
  });
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  return { record, bytes, bytesSha256: sha256(bytes) };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function recoverStaleLock(path, recovery) {
  if (!recovery || typeof recovery !== 'object') return false;
  assertSha256(recovery.expectedLockSha256, 'stale lock ownership hash');
  if (!Number.isFinite(recovery.staleAfterMs) || recovery.staleAfterMs < 0) {
    throw new TypeError('stale lock age threshold must be finite and non-negative');
  }
  const bytes = await readFile(path);
  if (sha256(bytes) !== recovery.expectedLockSha256) throw new Error('stale lock ownership hash mismatch');
  let record;
  try {
    record = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('stale lock ownership record invalid');
  }
  exactKeys(record, ['schemaVersion', 'ownerId', 'pid', 'createdAt', 'nonce'], 'stale lock record');
  if (record.schemaVersion !== 1 || !Number.isInteger(record.pid) || record.pid <= 0
    || !/^[a-f0-9]{32}$/.test(record.nonce)) throw new Error('stale lock ownership record invalid');
  text(record.ownerId, 'stale lock owner ID');
  const createdAt = Date.parse(instant(record.createdAt, 'stale lock createdAt'));
  if (Date.now() - createdAt < recovery.staleAfterMs) throw new Error('lock has not reached the stale age threshold');
  if (processIsAlive(record.pid)) throw new Error('lock owner process is still alive');
  const current = await readFile(path);
  if (sha256(current) !== recovery.expectedLockSha256) throw new Error('stale lock ownership changed during recovery');
  await rm(path);
  return true;
}

async function acquireExclusiveLock(path, conflictMessage, { ownerId, staleLockRecovery } = {}) {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      const lock = lockBytes(ownerId ?? 'fit-v4-lock');
      handle = await open(path, 'wx');
      await handle.writeFile(lock.bytes);
      await handle.sync();
      return { ...lock, close: () => handle.close() };
    } catch (error) {
      await handle?.close();
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 0 && await recoverStaleLock(path, staleLockRecovery)) continue;
      throw new Error(conflictMessage);
    }
  }
  throw new Error(conflictMessage);
}

export async function writeFitV4RunManifest({ runsRoot, manifest }) {
  validateFitV4RunManifest(manifest);
  const root = await assertIsolatedRoot(runsRoot, 'runs root');
  const lockPath = join(root, '.manifest-locks', `${manifest.runId}.lock`);
  const lock = await acquireExclusiveLock(lockPath, `duplicate or concurrent manifest writer for ${manifest.runId}`, {
    ownerId: `manifest:${manifest.runId}`,
  });
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPath = join(root, manifest.runId, 'manifest.json');
  const indexPath = join(root, 'manifests', `${manifest.manifestId}.json`);
  let wroteManifest = false;
  try {
    await atomicWrite(manifestPath, bytes, { immutable: true });
    wroteManifest = true;
    await atomicWrite(indexPath, bytes, { immutable: true });
    return manifest;
  } catch (error) {
    if (wroteManifest) await rm(manifestPath, { force: true });
    throw error;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export function buildFitV4Checkpoint({ manifest, stage, inputHashes, outputSha256 }) {
  validateFitV4RunManifest(manifest);
  if (!/^[a-z][a-z0-9-]*$/.test(String(stage ?? ''))) throw new TypeError('checkpoint stage invalid');
  if (!inputHashes || typeof inputHashes !== 'object' || Array.isArray(inputHashes) || Object.keys(inputHashes).length === 0) {
    throw new TypeError('checkpoint input hashes required');
  }
  for (const [key, value] of Object.entries(inputHashes)) assertSha256(value, `checkpoint input ${key}`);
  assertSha256(outputSha256, 'checkpoint output');
  const semantic = canonical({
    schemaVersion: FIT_V4_CHECKPOINT_SCHEMA_VERSION,
    manifestId: manifest.manifestId,
    runId: manifest.runId,
    stage,
    inputHashes,
    outputSha256,
  });
  const checkpointSha256 = semanticHash(semantic);
  return freezeDeep({ ...semantic, checkpointId: `fit_v4_checkpoint_${checkpointSha256.slice(0, 24)}`, checkpointSha256 });
}

function validateCheckpoint(value, manifest) {
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'stage', 'inputHashes', 'outputSha256',
    'checkpointId', 'checkpointSha256',
  ], 'checkpoint');
  if (value.schemaVersion !== FIT_V4_CHECKPOINT_SCHEMA_VERSION) throw new TypeError('checkpoint schema invalid');
  const rebuilt = buildFitV4Checkpoint({
    manifest, stage: value?.stage, inputHashes: value?.inputHashes, outputSha256: value?.outputSha256,
  });
  if (JSON.stringify(canonical(value)) !== JSON.stringify(canonical(rebuilt))
    || value.checkpointId !== rebuilt.checkpointId || value.checkpointSha256 !== rebuilt.checkpointSha256
    || value.manifestId !== manifest.manifestId || value.runId !== manifest.runId) {
    throw new TypeError('checkpoint binding mismatch');
  }
  return rebuilt;
}

async function readIndexedManifest(runsRoot, manifestId) {
  if (!MANIFEST_ID.test(String(manifestId ?? ''))) throw new TypeError('explicit manifest ID required for resume');
  const root = await assertIsolatedRoot(runsRoot, 'runs root');
  const indexed = JSON.parse(await readFile(join(root, 'manifests', `${manifestId}.json`), 'utf8'));
  validateFitV4RunManifest(indexed);
  const runCopy = JSON.parse(await readFile(join(root, indexed.runId, 'manifest.json'), 'utf8'));
  validateFitV4RunManifest(runCopy);
  if (JSON.stringify(indexed) !== JSON.stringify(runCopy)) throw new TypeError('persisted run manifest index mismatch');
  return indexed;
}

export async function acquireFitV4RunWriter({ runsRoot, manifest, writerId, staleLockRecovery }) {
  validateFitV4RunManifest(manifest);
  text(writerId, 'writer ID');
  const persisted = await readIndexedManifest(runsRoot, manifest.manifestId);
  if (JSON.stringify(persisted) !== JSON.stringify(manifest)) throw new TypeError('persisted run manifest differs from requested writer manifest');
  const root = await assertIsolatedRoot(runsRoot, 'runs root');
  const directory = runDirectory(root, manifest.runId);
  await mkdir(join(directory, 'checkpoints'), { recursive: true });
  const lockPath = join(directory, 'writer.lock');
  const lock = await acquireExclusiveLock(lockPath, `duplicate or concurrent writer lock for ${manifest.runId}`, {
    ownerId: writerId,
    staleLockRecovery,
  });
  await lock.close();
  let closed = false;
  return Object.freeze({
    async writeCheckpoint(checkpoint) {
      if (closed) throw new Error('writer is closed');
      const accepted = validateCheckpoint(checkpoint, manifest);
      await atomicWrite(
        join(directory, 'checkpoints', `${accepted.stage}.json`),
        Buffer.from(`${JSON.stringify(accepted, null, 2)}\n`),
        { immutable: true },
      );
      return accepted;
    },
    async close() {
      if (closed) return;
      const current = await readFile(lockPath);
      if (sha256(current) !== lock.bytesSha256) throw new Error('writer lock ownership drift');
      await rm(lockPath, { force: true });
      closed = true;
    },
  });
}

export async function resumeFitV4Run({ runsRoot, manifestId, expectedInputs, root, descriptorPath }) {
  const manifest = await readIndexedManifest(runsRoot, manifestId);
  if (!expectedInputs || typeof expectedInputs !== 'object') throw new TypeError('complete expected semantic inputs required for resume');
  const expected = await createFitV4RunManifest(expectedInputs, { root, descriptorPath });
  if (expected.runId !== manifest.runId || expected.semanticSha256 !== manifest.semanticSha256
    || JSON.stringify(expected.semantic) !== JSON.stringify(manifest.semantic)) {
    throw new Error('resume semantic manifest drift');
  }
  const isolatedRoot = await assertIsolatedRoot(runsRoot, 'runs root');
  const checkpointDirectory = join(runDirectory(isolatedRoot, manifest.runId), 'checkpoints');
  let names = [];
  try {
    names = await readdir(checkpointDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const checkpoints = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) throw new TypeError('unexpected checkpoint artifact');
    const checkpoint = validateCheckpoint(JSON.parse(await readFile(join(checkpointDirectory, name), 'utf8')), manifest);
    if (name !== `${checkpoint.stage}.json`) throw new TypeError('checkpoint filename and stage mismatch');
    checkpoints.push(checkpoint);
  }
  return freezeDeep({ manifest, checkpoints });
}

export async function compareAndSwapFitV4ShadowPointer({ shadowRoot, expectedRunId, nextRunId, verify }) {
  if (typeof verify !== 'function') throw new TypeError('verification callback required before shadow pointer replacement');
  const root = await assertIsolatedRoot(shadowRoot, 'shadow root');
  await mkdir(root, { recursive: true });
  if (expectedRunId !== null && !RUN_ID.test(String(expectedRunId))) throw new TypeError('expected shadow run ID invalid');
  if (!RUN_ID.test(String(nextRunId))) throw new TypeError('next shadow run ID invalid');
  const path = join(root, 'active-shadow.json');
  const lockPath = join(root, 'active-shadow.lock');
  const lock = await acquireExclusiveLock(lockPath, 'duplicate or concurrent shadow pointer writer lock', {
    ownerId: `shadow-pointer:${nextRunId}`,
  });
  try {
    let prior = null;
    try {
      prior = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if ((prior?.runId ?? null) !== expectedRunId) throw new Error('stale compare-and-swap shadow pointer');
    const next = freezeDeep({ schemaVersion: 1, pointerType: 'FIT_V4_ACTIVE_SHADOW', runId: nextRunId });
    await verify(next);
    await atomicWrite(path, Buffer.from(`${JSON.stringify(next, null, 2)}\n`));
    return next;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
