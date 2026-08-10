import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve, sep } from 'node:path';

import { loadActiveRetailRelease } from './active-retail-release.mjs';
import { assertSha256 } from './fit-v4-contract.mjs';
import {
  selectFitV4SyntheticScenario,
  validateFitV4SyntheticScenarioSetEnvelope,
} from './fit-v4-scenario-binding.mjs';

export const FIT_V4_RUN_MANIFEST_SCHEMA_VERSION = 2;
export const FIT_V4_CHECKPOINT_SCHEMA_VERSION = 2;

const FOUR_POLICIES = ['dishwasher', 'dryer', 'refrigerator', 'washingMachine'];
const THREE_SCHEMAS = ['knowledge', 'result', 'site'];
const MANIFEST_ID = /^fit_v4_manifest_[a-f0-9]{24}$/;
const RUN_ID = /^fit_v4_run_[a-f0-9]{24}$/;
const AUDIT_ID = /^fit_v4_shadow_audit_[a-f0-9]{24}$/;
const SHADOW_AUDIT_BINDING_CHECK_IDS = [
  'ACTIVE_RELEASE',
  'CONFLICT_SET',
  'POLICY',
  'RECEIPT_LIFECYCLE',
  'SITE_OBSERVATION',
  'SOURCE_REVISION',
];
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

function rejectLiveEphemeral(value) {
  if (value?.scenarioBindingKind === 'LIVE_EPHEMERAL') {
    const error = new TypeError('LIVE_EPHEMERAL_NOT_PERSISTABLE');
    error.code = 'LIVE_EPHEMERAL_NOT_PERSISTABLE';
    throw error;
  }
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

function manifestSemantic({ active, input, asOf, selected }) {
  const siteObservation = nullableClockBinding(input.siteObservationClock, 'site observation clock');
  if (!siteObservation || siteObservation.bundleSha256 !== selected.scenarioBinding.scenarioMemberSha256) {
    throw new TypeError('site observation clock must bind the selected scenario member');
  }
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
    scenarioBinding: selected.scenarioBinding,
    clockBindings: {
      retailEvidence: retailEvidenceClock(input.retailEvidenceClock, asOf),
      documentRevision: nullableClockBinding(input.documentRevisionClock, 'document revision clock'),
      siteObservation,
    },
    asOf,
  });
}

export async function createFitV4RunManifest(input, { root, descriptorPath } = {}) {
  rejectLiveEphemeral(input);
  if (!input || typeof input !== 'object') throw new TypeError('Fit V4 run input required');
  const selected = selectFitV4SyntheticScenario(
    input.scenarioSetManifest,
    input.selectedScenarioMemberId,
    input.scenarioSiteOptions,
  );
  const asOf = instant(input.asOf, 'run asOf');
  const generatedAt = instant(input.generatedAt, 'run generatedAt');
  const active = await loadActiveRetailRelease({ root, descriptorPath });
  const semantic = manifestSemantic({ active, input, asOf, selected });
  const semanticSha256 = semanticHash(semantic);
  const payload = canonical({
    schemaVersion: FIT_V4_RUN_MANIFEST_SCHEMA_VERSION,
    manifestId: `fit_v4_manifest_${semanticSha256.slice(0, 24)}`,
    runId: `fit_v4_run_${semanticSha256.slice(0, 24)}`,
    semanticSha256,
    semantic,
    scenarioSetManifest: input.scenarioSetManifest,
    selectedScenarioMemberId: selected.scenarioBinding.scenarioMemberId,
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
  rejectLiveEphemeral(value);
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'semanticSha256', 'semantic',
    'scenarioSetManifest', 'selectedScenarioMemberId', 'generatedAt', 'clocks',
    'manifestSha256',
  ], 'Fit V4 run manifest');
  if (!value || value.schemaVersion !== FIT_V4_RUN_MANIFEST_SCHEMA_VERSION
    || !MANIFEST_ID.test(String(value.manifestId)) || !RUN_ID.test(String(value.runId))) {
    throw new TypeError('Fit V4 run manifest invalid');
  }
  exactKeys(value.semantic, [
    'schemaVersion', 'activeRelease', 'identityMapSha256', 'receiptBundleSha256',
    'fieldMapSha256', 'schemaHashes', 'policyHashes', 'trustedRegistryHashes', 'policyEpoch',
    'scenarioBinding', 'clockBindings', 'asOf',
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
  for (const key of ['identityMapSha256', 'receiptBundleSha256', 'fieldMapSha256']) {
    assertSha256(value.semantic[key], `semantic ${key}`);
  }
  exactKeys(value.semantic.scenarioBinding, [
    'scenarioBindingKind', 'scenarioSetId', 'scenarioSetSha256',
    'scenarioMemberId', 'scenarioMemberSha256',
  ], 'scenario binding');
  if (value.semantic.scenarioBinding.scenarioBindingKind !== 'PERSISTED_SYNTHETIC') {
    throw new TypeError('persisted synthetic scenario binding required');
  }
  const scenarioSetManifest = validateFitV4SyntheticScenarioSetEnvelope(value.scenarioSetManifest);
  const selectedMember = scenarioSetManifest.members.find(
    (member) => member.scenarioMemberId === value.selectedScenarioMemberId,
  );
  if (!selectedMember) throw new TypeError('selected scenario member absent from persisted scenario set');
  const expectedScenarioBinding = canonical({
    scenarioBindingKind: 'PERSISTED_SYNTHETIC',
    scenarioSetId: scenarioSetManifest.scenarioSetId,
    scenarioSetSha256: scenarioSetManifest.scenarioSetSha256,
    scenarioMemberId: selectedMember.scenarioMemberId,
    scenarioMemberSha256: selectedMember.scenarioMemberSha256,
  });
  if (JSON.stringify(value.semantic.scenarioBinding) !== JSON.stringify(expectedScenarioBinding)) {
    throw new TypeError('persisted scenario set/member binding drift');
  }
  assertSha256(value.semantic.scenarioBinding.scenarioSetSha256, 'scenario set');
  assertSha256(value.semantic.scenarioBinding.scenarioMemberSha256, 'scenario member');
  exactHashObject(value.semantic.schemaHashes, THREE_SCHEMAS, 'schema hashes');
  exactHashObject(value.semantic.policyHashes, FOUR_POLICIES, 'policy hashes');
  trustedRegistryHashes(value.semantic.trustedRegistryHashes);
  text(value.semantic.policyEpoch, 'policy epoch');
  if (instant(value.semantic.asOf, 'run asOf') !== value.semantic.asOf) throw new TypeError('run asOf must be canonical');
  exactKeys(value.semantic.clockBindings, ['retailEvidence', 'documentRevision', 'siteObservation'], 'clock bindings');
  retailEvidenceClock(value.semantic.clockBindings.retailEvidence, value.semantic.asOf);
  nullableClockBinding(value.semantic.clockBindings.documentRevision, 'document revision clock');
  nullableClockBinding(value.semantic.clockBindings.siteObservation, 'site observation clock');
  if (value.semantic.clockBindings.siteObservation?.bundleSha256
    !== value.semantic.scenarioBinding.scenarioMemberSha256) {
    throw new TypeError('site observation clock scenario member binding drift');
  }
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
    manifestSha256: manifest.manifestSha256,
    stage,
    inputHashes,
    outputSha256,
  });
  const checkpointSha256 = semanticHash(semantic);
  return freezeDeep({ ...semantic, checkpointId: `fit_v4_checkpoint_${checkpointSha256.slice(0, 24)}`, checkpointSha256 });
}

function validateCheckpoint(value, manifest) {
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'manifestSha256', 'stage', 'inputHashes', 'outputSha256',
    'checkpointId', 'checkpointSha256',
  ], 'checkpoint');
  if (value.schemaVersion !== FIT_V4_CHECKPOINT_SCHEMA_VERSION) throw new TypeError('checkpoint schema invalid');
  const rebuilt = buildFitV4Checkpoint({
    manifest, stage: value?.stage, inputHashes: value?.inputHashes, outputSha256: value?.outputSha256,
  });
  if (JSON.stringify(canonical(value)) !== JSON.stringify(canonical(rebuilt))
    || value.checkpointId !== rebuilt.checkpointId || value.checkpointSha256 !== rebuilt.checkpointSha256
    || value.manifestId !== manifest.manifestId || value.runId !== manifest.runId
    || value.manifestSha256 !== manifest.manifestSha256) {
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

export async function resumeFitV4Run({ runsRoot, manifest, expectedInputs, root, descriptorPath }) {
  validateFitV4RunManifest(manifest);
  const persistedManifest = await readIndexedManifest(runsRoot, manifest.manifestId);
  if (JSON.stringify(persistedManifest) !== JSON.stringify(manifest)) {
    throw new TypeError('persisted run manifest differs from requested resume manifest');
  }
  if (!expectedInputs || typeof expectedInputs !== 'object') throw new TypeError('complete expected semantic inputs required for resume');
  const expected = await createFitV4RunManifest(expectedInputs, { root, descriptorPath });
  if (expected.runId !== persistedManifest.runId || expected.semanticSha256 !== persistedManifest.semanticSha256
    || JSON.stringify(expected.semantic) !== JSON.stringify(persistedManifest.semantic)) {
    throw new Error('resume semantic manifest drift');
  }
  const isolatedRoot = await assertIsolatedRoot(runsRoot, 'runs root');
  const checkpointDirectory = join(runDirectory(isolatedRoot, persistedManifest.runId), 'checkpoints');
  let names = [];
  try {
    names = await readdir(checkpointDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const checkpoints = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) throw new TypeError('unexpected checkpoint artifact');
    const checkpoint = validateCheckpoint(JSON.parse(await readFile(join(checkpointDirectory, name), 'utf8')), persistedManifest);
    if (name !== `${checkpoint.stage}.json`) throw new TypeError('checkpoint filename and stage mismatch');
    checkpoints.push(checkpoint);
  }
  return freezeDeep({ manifest: persistedManifest, checkpoints });
}

export function validateFitV4ShadowPointer(value) {
  exactKeys(value, ['schemaVersion', 'pointerType', 'manifestId', 'runId', 'manifestSha256'], 'Fit V4 shadow pointer');
  if (value.schemaVersion !== 2 || value.pointerType !== 'FIT_V4_ACTIVE_SHADOW'
    || !MANIFEST_ID.test(String(value.manifestId)) || !RUN_ID.test(String(value.runId))) {
    throw new TypeError('Fit V4 shadow pointer schema invalid');
  }
  assertSha256(value.manifestSha256, 'Fit V4 shadow pointer manifest');
  return value;
}

function validateShadowAuditActivationBody(artifact) {
  if (!Array.isArray(artifact.evaluationSummary) || artifact.evaluationSummary.length === 0) {
    throw new TypeError('shadow audit activation summary invalid');
  }
  let priorProductId = null;
  for (const row of artifact.evaluationSummary) {
    exactKeys(row, [
      'productId', 'category', 'applicableHardFieldCount', 'outcomeCheckCount',
    ], 'shadow audit activation summary row');
    const productId = text(row.productId, 'shadow audit activation product ID');
    text(row.category, 'shadow audit activation category');
    for (const key of ['applicableHardFieldCount', 'outcomeCheckCount']) {
      if (!Number.isInteger(row[key]) || row[key] < 0) {
        throw new TypeError(`shadow audit activation ${key} invalid`);
      }
    }
    if (priorProductId !== null && priorProductId.localeCompare(productId) > 0) {
      throw new TypeError('shadow audit activation summary order invalid');
    }
    priorProductId = productId;
  }
  if (!Array.isArray(artifact.bindingChecks)
    || artifact.bindingChecks.length !== SHADOW_AUDIT_BINDING_CHECK_IDS.length) {
    throw new TypeError('shadow audit activation binding checks invalid');
  }
  for (let index = 0; index < SHADOW_AUDIT_BINDING_CHECK_IDS.length; index += 1) {
    const check = artifact.bindingChecks[index];
    exactKeys(check, ['checkId', 'pass', 'reasonCodes'], 'shadow audit activation binding check');
    if (check.checkId !== SHADOW_AUDIT_BINDING_CHECK_IDS[index]
      || check.pass !== true || !Array.isArray(check.reasonCodes) || check.reasonCodes.length !== 0) {
      throw new TypeError('shadow audit activation binding check invalid');
    }
  }
}

async function validateShadowActivationProof(runsRoot, manifest) {
  const root = await assertIsolatedRoot(runsRoot, 'runs root');
  const directory = runDirectory(root, manifest.runId);
  let checkpointBytes;
  let auditBytes;
  try {
    [checkpointBytes, auditBytes] = await Promise.all([
      readFile(join(directory, 'checkpoints', 'shadow-audit.json')),
      readFile(join(directory, 'shadow-audit.json')),
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') throw new TypeError('shadow audit activation proof missing');
    throw error;
  }
  const checkpoint = validateCheckpoint(JSON.parse(checkpointBytes), manifest);
  if (checkpoint.stage !== 'shadow-audit') throw new TypeError('shadow audit activation checkpoint required');
  exactKeys(checkpoint.inputHashes, ['auditInput', 'manifest'], 'shadow audit activation inputs');
  const artifact = JSON.parse(auditBytes);
  if (checkpoint.inputHashes.manifest !== manifest.manifestSha256
    || checkpoint.inputHashes.auditInput !== artifact.inputSemanticSha256
    || checkpoint.outputSha256 !== sha256(auditBytes)) {
    throw new TypeError('shadow audit activation checkpoint binding drift');
  }
  exactKeys(artifact, [
    'schemaVersion', 'artifactType', 'manifestId', 'runId', 'manifestSha256',
    'scenarioBinding', 'inputSemanticSha256', 'publicMutation', 'evaluationSummary',
    'bindingChecks', 'verdict', 'reasonCodes', 'semanticSha256', 'auditId',
  ], 'shadow audit activation artifact');
  validateShadowAuditActivationBody(artifact);
  const { semanticSha256, auditId, ...semantic } = artifact;
  const expectedSemanticSha256 = semanticHash(semantic);
  assertSha256(artifact.inputSemanticSha256, 'shadow audit activation input');
  if (artifact.schemaVersion !== 2 || artifact.artifactType !== 'FIT_V4_SHADOW_AUDIT'
    || artifact.manifestId !== manifest.manifestId || artifact.runId !== manifest.runId
    || artifact.manifestSha256 !== manifest.manifestSha256
    || JSON.stringify(artifact.scenarioBinding) !== JSON.stringify(manifest.semantic.scenarioBinding)
    || artifact.publicMutation !== false || artifact.verdict !== 'PASS'
    || !Array.isArray(artifact.reasonCodes) || artifact.reasonCodes.length !== 0
    || semanticSha256 !== expectedSemanticSha256
    || auditId !== `fit_v4_shadow_audit_${expectedSemanticSha256.slice(0, 24)}`
    || !AUDIT_ID.test(auditId)) {
    throw new TypeError('shadow audit activation artifact invalid');
  }
  if (!auditBytes.equals(Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`))) {
    throw new TypeError('shadow audit activation artifact bytes invalid');
  }
  return { checkpoint, artifact };
}

export async function compareAndSwapFitV4ShadowPointer(options) {
  exactKeys(options, ['runsRoot', 'shadowRoot', 'expectedPointer', 'nextManifest'], 'shadow pointer CAS input');
  const { runsRoot, shadowRoot, expectedPointer, nextManifest } = options;
  validateFitV4RunManifest(nextManifest);
  if (expectedPointer !== null) validateFitV4ShadowPointer(expectedPointer);
  const persisted = await readIndexedManifest(runsRoot, nextManifest.manifestId);
  if (JSON.stringify(persisted) !== JSON.stringify(nextManifest)) {
    throw new TypeError('next shadow pointer manifest differs from exact persisted manifest');
  }
  await validateShadowActivationProof(runsRoot, persisted);
  const root = await assertIsolatedRoot(shadowRoot, 'shadow root');
  await mkdir(root, { recursive: true });
  const path = join(root, 'active-shadow.json');
  const lockPath = join(root, 'active-shadow.lock');
  const lock = await acquireExclusiveLock(lockPath, 'duplicate or concurrent shadow pointer writer lock', {
    ownerId: `shadow-pointer:${nextManifest.runId}`,
  });
  try {
    let prior = null;
    try {
      const priorBytes = await readFile(path);
      prior = validateFitV4ShadowPointer(JSON.parse(priorBytes));
      const canonicalBytes = Buffer.from(`${JSON.stringify(prior, null, 2)}\n`);
      if (!priorBytes.equals(canonicalBytes)) throw new TypeError('Fit V4 shadow pointer bytes invalid');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (JSON.stringify(prior) !== JSON.stringify(expectedPointer)) {
      throw new Error('stale compare-and-swap shadow pointer');
    }
    const next = freezeDeep(canonical({
      schemaVersion: 2,
      pointerType: 'FIT_V4_ACTIVE_SHADOW',
      manifestId: persisted.manifestId,
      runId: persisted.runId,
      manifestSha256: persisted.manifestSha256,
    }));
    await atomicWrite(path, Buffer.from(`${JSON.stringify(next, null, 2)}\n`));
    return next;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export function readHistoricalFitV4RunManifestV1(value) {
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'semanticSha256', 'semantic',
    'generatedAt', 'clocks', 'manifestSha256',
  ], 'historical Fit V4 run manifest');
  if (value.schemaVersion !== 1 || value.semantic?.schemaVersion !== 1
    || !MANIFEST_ID.test(String(value.manifestId)) || !RUN_ID.test(String(value.runId))) {
    throw new TypeError('historical Fit V4 run manifest schema 1 required');
  }
  if (Object.hasOwn(value.semantic, 'scenarioBinding')) {
    throw new TypeError('historical Fit V4 run manifest cannot contain schema-2 scenario binding');
  }
  exactKeys(value.semantic, [
    'schemaVersion', 'activeRelease', 'identityMapSha256', 'receiptBundleSha256',
    'fieldMapSha256', 'schemaHashes', 'policyHashes', 'trustedRegistryHashes',
    'policyEpoch', 'scenarioSetSha256', 'clockBindings', 'asOf',
  ], 'historical Fit V4 semantic manifest');
  exactKeys(value.semantic.activeRelease, [
    'releaseCandidateId', 'activatedAt', 'catalogSha256', 'historicalReferenceSha256',
    'authorizationManifestSha256',
  ], 'historical active release binding');
  text(value.semantic.activeRelease.releaseCandidateId, 'historical active release candidate');
  if (instant(value.semantic.activeRelease.activatedAt, 'historical active release activation')
    !== value.semantic.activeRelease.activatedAt) {
    throw new TypeError('historical active release activation must be canonical');
  }
  for (const key of ['catalogSha256', 'historicalReferenceSha256', 'authorizationManifestSha256']) {
    assertSha256(value.semantic.activeRelease[key], `historical active release ${key}`);
  }
  for (const key of ['identityMapSha256', 'receiptBundleSha256', 'fieldMapSha256', 'scenarioSetSha256']) {
    assertSha256(value.semantic[key], `historical semantic ${key}`);
  }
  exactHashObject(value.semantic.schemaHashes, THREE_SCHEMAS, 'historical schema hashes');
  exactHashObject(value.semantic.policyHashes, FOUR_POLICIES, 'historical policy hashes');
  trustedRegistryHashes(value.semantic.trustedRegistryHashes);
  text(value.semantic.policyEpoch, 'historical policy epoch');
  if (instant(value.semantic.asOf, 'historical run asOf') !== value.semantic.asOf) {
    throw new TypeError('historical run asOf must be canonical');
  }
  exactKeys(value.semantic.clockBindings, ['retailEvidence', 'documentRevision', 'siteObservation'], 'historical clock bindings');
  retailEvidenceClock(value.semantic.clockBindings.retailEvidence, value.semantic.asOf);
  nullableClockBinding(value.semantic.clockBindings.documentRevision, 'historical document revision clock');
  nullableClockBinding(value.semantic.clockBindings.siteObservation, 'historical site observation clock');
  assertSha256(value.semantic.scenarioSetSha256, 'historical scenario set');
  const semanticSha256 = semanticHash(value.semantic);
  if (value.semanticSha256 !== semanticSha256
    || value.manifestId !== `fit_v4_manifest_${semanticSha256.slice(0, 24)}`
    || value.runId !== `fit_v4_run_${semanticSha256.slice(0, 24)}`) {
    throw new TypeError('historical Fit V4 run semantic binding drift');
  }
  const { manifestSha256: ignored, ...payload } = value;
  if (value.manifestSha256 !== semanticHash(payload)) {
    throw new TypeError('historical Fit V4 run manifest hash drift');
  }
  if (instant(value.generatedAt, 'historical run generatedAt') !== value.generatedAt) {
    throw new TypeError('historical run generatedAt must be canonical');
  }
  exactKeys(value.clocks, [
    'asOf', 'generatedAt', 'activeReleaseActivatedAt', 'retailEvidence',
    'documentRevision', 'siteObservation', 'policyEpoch',
  ], 'historical manifest clocks');
  const expectedClocks = canonical({
    asOf: value.semantic.asOf,
    generatedAt: value.generatedAt,
    activeReleaseActivatedAt: value.semantic.activeRelease.activatedAt,
    retailEvidence: value.semantic.clockBindings.retailEvidence,
    documentRevision: value.semantic.clockBindings.documentRevision,
    siteObservation: value.semantic.clockBindings.siteObservation,
    policyEpoch: value.semantic.policyEpoch,
  });
  if (JSON.stringify(value.clocks) !== JSON.stringify(expectedClocks)) {
    throw new TypeError('historical Fit V4 run clock binding drift');
  }
  return freezeDeep(value);
}

export function readHistoricalFitV4CheckpointV1(value, manifest) {
  const historicalManifest = readHistoricalFitV4RunManifestV1(manifest);
  exactKeys(value, [
    'schemaVersion', 'manifestId', 'runId', 'stage', 'inputHashes', 'outputSha256',
    'checkpointId', 'checkpointSha256',
  ], 'historical Fit V4 checkpoint');
  if (value.schemaVersion !== 1 || value.manifestId !== historicalManifest.manifestId
    || value.runId !== historicalManifest.runId
    || !/^[a-z][a-z0-9-]*$/.test(String(value.stage ?? ''))) {
    throw new TypeError('historical Fit V4 checkpoint schema 1 required');
  }
  if (!value.inputHashes || typeof value.inputHashes !== 'object' || Array.isArray(value.inputHashes)
    || Object.keys(value.inputHashes).length === 0) {
    throw new TypeError('historical Fit V4 checkpoint input hashes required');
  }
  for (const [key, hash] of Object.entries(value.inputHashes)) {
    assertSha256(hash, `historical checkpoint input ${key}`);
  }
  assertSha256(value.outputSha256, 'historical checkpoint output');
  const semantic = canonical({
    schemaVersion: 1,
    manifestId: value.manifestId,
    runId: value.runId,
    stage: value.stage,
    inputHashes: value.inputHashes,
    outputSha256: value.outputSha256,
  });
  const checkpointSha256 = semanticHash(semantic);
  if (value.checkpointSha256 !== checkpointSha256
    || value.checkpointId !== `fit_v4_checkpoint_${checkpointSha256.slice(0, 24)}`) {
    throw new TypeError('historical Fit V4 checkpoint binding drift');
  }
  return freezeDeep(value);
}

export function readHistoricalFitV4ShadowPointerV1(value) {
  exactKeys(value, ['schemaVersion', 'pointerType', 'runId'], 'historical Fit V4 shadow pointer');
  if (value.schemaVersion !== 1 || value.pointerType !== 'FIT_V4_ACTIVE_SHADOW'
    || !RUN_ID.test(String(value.runId))) {
    throw new TypeError('historical Fit V4 shadow pointer schema 1 required');
  }
  return freezeDeep(value);
}
