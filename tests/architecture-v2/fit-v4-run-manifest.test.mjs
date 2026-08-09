import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acquireFitV4RunWriter,
  buildFitV4Checkpoint,
  compareAndSwapFitV4ShadowPointer,
  createFitV4RunManifest,
  resumeFitV4Run,
  validateFitV4RunManifest,
  writeFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const SHA = (digit) => digit.repeat(64);
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function rehashManifest(value) {
  const copy = structuredClone(value);
  copy.semanticSha256 = semanticHash(copy.semantic);
  copy.manifestId = `fit_v4_manifest_${copy.semanticSha256.slice(0, 24)}`;
  copy.runId = `fit_v4_run_${copy.semanticSha256.slice(0, 24)}`;
  const { manifestSha256: ignored, ...payload } = copy;
  copy.manifestSha256 = semanticHash(payload);
  return copy;
}

function inputs(overrides = {}) {
  return {
    asOf: '2026-08-08T00:00:00.000Z', generatedAt: '2026-08-08T01:00:00.000Z',
    identityMapSha256: SHA('1'), receiptBundleSha256: SHA('2'), fieldMapSha256: SHA('3'),
    schemaHashes: { knowledge: SHA('4'), site: SHA('5'), result: SHA('6') },
    policyHashes: { refrigerator: SHA('7'), dishwasher: SHA('8'), washingMachine: SHA('9'), dryer: SHA('a') },
    trustedRegistryHashes: {
      knowledgePolicyBundle: SHA('d'), knowledgeReferenceRegistry: SHA('e'),
      consentApprovalRegistry: null, rightsEvidenceSet: SHA('f'), calibrationLabelRegistry: null,
    },
    scenarioSetSha256: SHA('b'), policyEpoch: 'fit-policy-v4.0.0',
    retailEvidenceClock: {
      bundleSha256: SHA('c'),
      oldestObservedAt: '2026-07-01T00:00:00.000Z',
      freshestObservedAt: '2026-08-01T00:00:00.000Z',
    },
    documentRevisionClock: null,
    siteObservationClock: null,
    ...overrides,
  };
}

test('semantic run identity includes complete inputs and keeps activation and evidence clocks distinct', async () => {
  const first = await createFitV4RunManifest(inputs(), { root: ROOT });
  const generatedLater = await createFitV4RunManifest(inputs({ generatedAt: '2026-08-09T01:00:00.000Z' }), { root: ROOT });
  assert.equal(first.runId, generatedLater.runId);
  assert.notEqual(first.generatedAt, generatedLater.generatedAt);
  assert.equal(first.clocks.asOf, inputs().asOf);
  assert.equal(first.clocks.policyEpoch, inputs().policyEpoch);
  assert.equal(first.clocks.retailEvidence.bundleSha256, inputs().retailEvidenceClock.bundleSha256);
  assert.ok(first.clocks.activeReleaseActivatedAt);
  assert.notEqual(first.clocks.activeReleaseActivatedAt, first.clocks.retailEvidence.freshestObservedAt);
  assert.equal(Object.hasOwn(first.clocks, 'retailFreshness'), false);
  assert.equal(first.clocks.documentRevision, null);
  assert.equal(first.clocks.siteObservation, null);

  for (const changed of [
    { asOf: '2026-08-09T00:00:00.000Z' },
    { identityMapSha256: SHA('d') },
    { receiptBundleSha256: SHA('d') },
    { fieldMapSha256: SHA('d') },
    { schemaHashes: { ...inputs().schemaHashes, knowledge: SHA('d') } },
    { policyHashes: { ...inputs().policyHashes, dryer: SHA('d') } },
    { trustedRegistryHashes: { ...inputs().trustedRegistryHashes, knowledgePolicyBundle: SHA('0') } },
    { scenarioSetSha256: SHA('d') },
    { policyEpoch: 'fit-policy-v4.0.1' },
    { retailEvidenceClock: { ...inputs().retailEvidenceClock, bundleSha256: SHA('d') } },
  ]) {
    const result = await createFitV4RunManifest(inputs(changed), { root: ROOT });
    assert.notEqual(result.runId, first.runId, JSON.stringify(changed));
  }
});

test('resume requires explicit manifest ID and the complete expected semantic input set', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-resume-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await writeFitV4RunManifest({ runsRoot: directory, manifest });
  const checkpoint = buildFitV4Checkpoint({
    manifest, stage: 'knowledge', inputHashes: { receipts: inputs().receiptBundleSha256 }, outputSha256: SHA('d'),
  });
  const writer = await acquireFitV4RunWriter({ runsRoot: directory, manifest, writerId: 'writer-a' });
  await writer.writeCheckpoint(checkpoint);
  await writer.close();

  await assert.rejects(() => resumeFitV4Run({ runsRoot: directory, root: ROOT }), /manifest ID required/i);
  await assert.rejects(() => resumeFitV4Run({
    runsRoot: directory, root: ROOT, manifestId: manifest.manifestId,
  }), /expected semantic inputs|required/i);
  await assert.doesNotReject(() => resumeFitV4Run({
    runsRoot: directory, root: ROOT, manifestId: manifest.manifestId, expectedInputs: inputs(),
  }));

  for (const changed of [
    { identityMapSha256: SHA('e') }, { receiptBundleSha256: SHA('e') }, { fieldMapSha256: SHA('e') },
    { schemaHashes: { ...inputs().schemaHashes, result: SHA('e') } },
    { policyHashes: { ...inputs().policyHashes, refrigerator: SHA('e') } },
    { trustedRegistryHashes: { ...inputs().trustedRegistryHashes, rightsEvidenceSet: SHA('0') } },
    { scenarioSetSha256: SHA('e') }, { policyEpoch: 'fit-policy-v4.0.2' },
    { asOf: '2026-08-10T00:00:00.000Z' },
  ]) {
    await assert.rejects(() => resumeFitV4Run({
      runsRoot: directory, root: ROOT, manifestId: manifest.manifestId,
      expectedInputs: inputs(changed),
    }), /semantic|manifest|drift/i, JSON.stringify(changed));
  }

  const checkpointPath = join(directory, manifest.runId, 'checkpoints', 'knowledge.json');
  const changedCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  changedCheckpoint.outputSha256 = SHA('e');
  await writeFile(checkpointPath, `${JSON.stringify(changedCheckpoint)}\n`);
  await assert.rejects(() => resumeFitV4Run({
    runsRoot: directory, root: ROOT, manifestId: manifest.manifestId, expectedInputs: inputs(),
  }), /checkpoint/i);
});

test('manifest creation is exclusive under concurrency and a loser never removes or overwrites the winner', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-manifest-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  const results = await Promise.allSettled([
    writeFitV4RunManifest({ runsRoot: directory, manifest }),
    writeFitV4RunManifest({ runsRoot: directory, manifest }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const persisted = JSON.parse(await readFile(join(directory, manifest.runId, 'manifest.json'), 'utf8'));
  const indexed = JSON.parse(await readFile(join(directory, 'manifests', `${manifest.manifestId}.json`), 'utf8'));
  assert.deepEqual(persisted, manifest);
  assert.deepEqual(indexed, manifest);
});

test('manifest validation rejects self-consistent structural schema bypasses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-manifest-schema-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  const mutations = [
    (copy) => { copy.semantic.extra = true; },
    (copy) => { delete copy.semantic.policyHashes.dryer; },
    (copy) => { copy.semantic.policyHashes.extra = SHA('f'); },
    (copy) => { delete copy.semantic.trustedRegistryHashes.knowledgeReferenceRegistry; },
    (copy) => { copy.semantic.trustedRegistryHashes.extra = SHA('f'); },
    (copy) => { copy.semantic.trustedRegistryHashes.consentApprovalRegistry = 'not-a-hash'; },
    (copy) => { delete copy.semantic.schemaHashes.site; },
    (copy) => { copy.semantic.schemaHashes.extra = SHA('f'); },
    (copy) => { delete copy.semantic.clockBindings.documentRevision; },
    (copy) => { copy.semantic.clockBindings.retailEvidence.extra = true; },
    (copy) => { copy.semantic.activeRelease.extra = true; },
    (copy) => { copy.semantic.asOf = 'not-an-instant'; },
    (copy) => { copy.clocks.extra = true; },
    (copy) => { delete copy.generatedAt; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(manifest);
    mutate(copy);
    const forged = rehashManifest(copy);
    await assert.rejects(() => writeFitV4RunManifest({ runsRoot: directory, manifest: forged }), /manifest|semantic|key|schema|clock|invalid|required/i);
  }
  assert.deepEqual(validateFitV4RunManifest(manifest), manifest);
});

test('isolated roots reject lexical and symlink traversal into deployable paths', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-isolation-symlink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const deployed = join(directory, 'public');
  const linked = join(directory, 'shadow-link');
  await mkdir(deployed);
  await symlink(deployed, linked);
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await assert.rejects(() => writeFitV4RunManifest({ runsRoot: linked, manifest }), /isolated|symlink|deploy/i);
});

test('stale writer locks require exact ownership evidence, sufficient age, and a dead process', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-stale-writer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await writeFitV4RunManifest({ runsRoot: directory, manifest });
  const lockPath = join(directory, manifest.runId, 'writer.lock');
  await mkdir(join(directory, manifest.runId), { recursive: true });
  const stale = {
    schemaVersion: 1, ownerId: 'crashed-writer', pid: 999999,
    createdAt: '2020-01-01T00:00:00.000Z', nonce: 'a'.repeat(32),
  };
  const staleBytes = Buffer.from(`${JSON.stringify(stale)}\n`);
  await writeFile(lockPath, staleBytes);
  const staleSha256 = createHash('sha256').update(staleBytes).digest('hex');

  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-a',
    staleLockRecovery: { expectedLockSha256: '0'.repeat(64), staleAfterMs: 1 },
  }), /ownership|hash|lock/i);
  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-a',
    staleLockRecovery: { expectedLockSha256: staleSha256, staleAfterMs: Number.MAX_SAFE_INTEGER },
  }), /age|stale|lock/i);
  const writer = await acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-a',
    staleLockRecovery: { expectedLockSha256: staleSha256, staleAfterMs: 1 },
  });
  await writer.close();

  const live = {
    schemaVersion: 1, ownerId: 'live-writer', pid: process.pid,
    createdAt: '2020-01-01T00:00:00.000Z', nonce: 'b'.repeat(32),
  };
  const liveBytes = Buffer.from(`${JSON.stringify(live)}\n`);
  await writeFile(lockPath, liveBytes);
  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-b',
    staleLockRecovery: {
      expectedLockSha256: createHash('sha256').update(liveBytes).digest('hex'), staleAfterMs: 1,
    },
  }), /alive|active|lock/i);
});

test('checkpoint validation rejects changed schemaVersion and extra or missing fields', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-checkpoint-schema-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await writeFitV4RunManifest({ runsRoot: directory, manifest });
  const writer = await acquireFitV4RunWriter({ runsRoot: directory, manifest, writerId: 'writer-schema' });
  const checkpoint = buildFitV4Checkpoint({
    manifest, stage: 'knowledge', inputHashes: { receipts: inputs().receiptBundleSha256 }, outputSha256: SHA('d'),
  });
  for (const mutate of [
    (copy) => { copy.schemaVersion = 99; },
    (copy) => { copy.extra = true; },
    (copy) => { delete copy.schemaVersion; },
  ]) {
    const copy = structuredClone(checkpoint);
    mutate(copy);
    await assert.rejects(() => writer.writeCheckpoint(copy), /checkpoint|key set|schema/i);
  }
  await writer.close();
});

test('run writer requires the persisted indexed/run manifest and remains exclusive', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-writer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-a',
  }), /persisted|manifest|ENOENT/i);
  await writeFitV4RunManifest({ runsRoot: directory, manifest });
  const first = await acquireFitV4RunWriter({ runsRoot: directory, manifest, writerId: 'writer-a' });
  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-b',
  }), /writer|lock/i);
  await first.close();

  const indexPath = join(directory, 'manifests', `${manifest.manifestId}.json`);
  const drifted = JSON.parse(await readFile(indexPath, 'utf8'));
  drifted.generatedAt = '2026-08-11T00:00:00.000Z';
  await writeFile(indexPath, JSON.stringify(drifted));
  await assert.rejects(() => acquireFitV4RunWriter({
    runsRoot: directory, manifest, writerId: 'writer-c',
  }), /manifest|hash|drift/i);
});

test('shadow CAS verifies while readers still see prior bytes and failed verification leaves bytes untouched', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-pointer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runA = `fit_v4_run_${'a'.repeat(24)}`;
  const runB = `fit_v4_run_${'b'.repeat(24)}`;
  const pointerPath = join(directory, 'active-shadow.json');
  await assert.rejects(() => compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory, expectedRunId: null, nextRunId: runA,
  }), /verification callback required/i);
  await compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory, expectedRunId: null, nextRunId: runA, verify: async () => {},
  });
  const priorBytes = await readFile(pointerPath);
  await compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory,
    expectedRunId: runA,
    nextRunId: runB,
    verify: async (candidate) => {
      assert.equal(candidate.runId, runB);
      assert.deepEqual(await readFile(pointerPath), priorBytes);
    },
  });
  assert.equal(JSON.parse(await readFile(pointerPath, 'utf8')).runId, runB);

  const beforeFailure = await readFile(pointerPath);
  await assert.rejects(() => compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory,
    expectedRunId: runB,
    nextRunId: runA,
    verify: async () => { throw new Error('verification failed'); },
  }), /verification failed/i);
  assert.deepEqual(await readFile(pointerPath), beforeFailure);
});

test('shadow pointer CAS permits only one concurrent writer', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-pointer-writer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let enteredVerification;
  const verificationEntered = new Promise((resolve) => { enteredVerification = resolve; });
  let releaseVerification;
  const verificationRelease = new Promise((resolve) => { releaseVerification = resolve; });
  const first = compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory, expectedRunId: null, nextRunId: `fit_v4_run_${'a'.repeat(24)}`,
    verify: async () => { enteredVerification(); await verificationRelease; },
  });
  await verificationEntered;
  await assert.rejects(() => compareAndSwapFitV4ShadowPointer({
    shadowRoot: directory, expectedRunId: null, nextRunId: `fit_v4_run_${'b'.repeat(24)}`,
    verify: async () => {},
  }), /writer|lock/i);
  releaseVerification();
  await first;
});

test('V4 isolation is structural and uses a clear protective public path guard', async () => {
  const moduleNames = ['fit-v4-contract.mjs', 'installation-evidence-receipt-v4.mjs', 'fit-v4-run-manifest.mjs'];
  const runtimeFiles = await readdir(join(ROOT, 'public'), { recursive: true });
  for (const relative of runtimeFiles.filter((name) => /\.(?:js|mjs|html)$/.test(name))) {
    const source = await readFile(join(ROOT, 'public', relative), 'utf8');
    const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.equal(imports.some((specifier) => moduleNames.some((name) => specifier.endsWith(name))), false, relative);
  }
  const runSource = await readFile(new URL('../../src/domain/fit-v4-run-manifest.mjs', import.meta.url), 'utf8');
  assert.match(runSource, /PROTECTED_DEPLOYMENT_SEGMENTS[^;]+['"]public['"]/s);
  assert.doesNotMatch(runSource, /\['pub',\s*'lic'\]/);

  const manifest = await createFitV4RunManifest(inputs(), { root: ROOT });
  await assert.rejects(() => writeFitV4RunManifest({
    runsRoot: join(tmpdir(), 'fit-v4-isolation', 'public'), manifest,
  }), /isolated/i);
});
