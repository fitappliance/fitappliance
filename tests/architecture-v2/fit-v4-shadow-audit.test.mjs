import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FIT_V4_SHADOW_AUDIT_BOUNDARIES,
  auditFitV4Shadow,
  rollbackFitV4ShadowAudit,
  runFitV4ShadowAudit,
  verifyFitV4ShadowAuditArtifact,
} from '../../scripts/architecture-v2/audit-fit-v4-shadow.mjs';
import {
  acquireFitV4RunWriter,
  compareAndSwapFitV4ShadowPointer,
  createFitV4RunManifest,
  writeFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import { evaluateFitV4Shadow } from '../../src/domain/fit-v4-shadow.mjs';
import {
  buildTrustedFitV4Input,
  observation,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const SHA = (digit) => digit.repeat(64);
const DAY = 24 * 60 * 60 * 1000;

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function manifestInputs(overrides = {}) {
  const replayInput = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  return {
    asOf: '2026-08-08T00:00:00.000Z',
    generatedAt: '2026-08-08T01:00:00.000Z',
    identityMapSha256: replayInput.identityMapSha256,
    receiptBundleSha256: replayInput.receiptBundleSha256,
    fieldMapSha256: semanticHash(replayInput.fieldMap),
    schemaHashes: { knowledge: SHA('4'), site: SHA('5'), result: SHA('6') },
    policyHashes: {
      refrigerator: semanticHash(FIT_POLICY_PACKS_V4.refrigerator),
      dishwasher: semanticHash(FIT_POLICY_PACKS_V4.dishwasher),
      washingMachine: semanticHash(FIT_POLICY_PACKS_V4.washing_machine),
      dryer: semanticHash(FIT_POLICY_PACKS_V4.dryer),
    },
    trustedRegistryHashes: {
      knowledgePolicyBundle: replayInput.trustedPolicyBundle.bundleSha256,
      knowledgeReferenceRegistry: replayInput.trustedReferenceRegistry.registrySha256,
      consentApprovalRegistry: null,
      rightsEvidenceSet: replayInput.runManifest.semantic.trustedRegistryHashes.rightsEvidenceSet,
      calibrationLabelRegistry: null,
    },
    scenarioSetSha256: replayInput.siteScenarioSha256,
    policyEpoch: replayInput.policyPack.packVersion,
    retailEvidenceClock: {
      bundleSha256: SHA('c'),
      oldestObservedAt: '2026-07-01T00:00:00.000Z',
      freshestObservedAt: '2026-08-01T00:00:00.000Z',
    },
    documentRevisionClock: {
      bundleSha256: SHA('d'), observedAt: '2026-08-02T00:00:00.000Z',
    },
    siteObservationClock: {
      bundleSha256: replayInput.siteScenarioSha256, observedAt: '2026-08-07T00:00:00.000Z',
    },
    ...overrides,
  };
}

function auditInput(manifest, overrides = {}) {
  const replayInput = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  replayInput.runId = manifest.runId;
  replayInput.runManifest = manifest;
  replayInput.expectedManifest = structuredClone(manifest);
  const result = evaluateFitV4Shadow(replayInput);
  const input = {
    expectedManifest: manifest,
    publicMutation: false,
    bindings: {
      sourceRevision: {
        expectedSha256: manifest.semantic.clockBindings.documentRevision.bundleSha256,
        observedSha256: manifest.semantic.clockBindings.documentRevision.bundleSha256,
        superseded: false,
      },
      conflictSet: {
        expectedSha256: SHA('f'), observedSha256: SHA('f'), unresolvedCount: 0,
      },
      receiptLifecycle: {
        expectedBundleSha256: manifest.semantic.receiptBundleSha256,
        observedBundleSha256: manifest.semantic.receiptBundleSha256,
        status: 'ACTIVE', withdrawn: false,
      },
      policy: {
        expectedEpoch: manifest.semantic.policyEpoch,
        observedEpoch: manifest.semantic.policyEpoch,
        expectedHashes: structuredClone(manifest.semantic.policyHashes),
        observedHashes: structuredClone(manifest.semantic.policyHashes),
      },
      activeRelease: {
        expected: structuredClone(manifest.semantic.activeRelease),
        observed: structuredClone(manifest.semantic.activeRelease),
      },
      siteObservation: {
        expectedBundleSha256: manifest.semantic.clockBindings.siteObservation.bundleSha256,
        observedBundleSha256: manifest.semantic.clockBindings.siteObservation.bundleSha256,
        observedAt: manifest.semantic.clockBindings.siteObservation.observedAt,
        asOf: manifest.semantic.asOf,
        maximumAgeMs: 30 * DAY,
      },
    },
    evaluations: [{ result, replayInput }],
  };
  return { ...input, ...overrides };
}

async function fixture(t, inputOverrides = {}) {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fit-v4-shadow-audit-'));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const manifest = await createFitV4RunManifest(manifestInputs(inputOverrides), { root: ROOT });
  return {
    storageRoot,
    root: ROOT,
    runsRoot: join(storageRoot, 'runs'),
    shadowRoot: join(storageRoot, 'shadow'),
    manifest,
    expectedInputs: manifestInputs(inputOverrides),
    auditInput: auditInput(manifest),
  };
}

test('pure audit derives applicability from a replayed evaluator result', async () => {
  const manifest = await createFitV4RunManifest(manifestInputs(), { root: ROOT });
  const input = auditInput(manifest);
  const first = auditFitV4Shadow({ manifest, ...input });
  assert.deepEqual(auditFitV4Shadow({ manifest, ...auditInput(manifest) }), first);
  assert.equal(first.verdict, 'PASS');

  assert.ok(first.evaluationSummary[0].applicableHardFieldCount > 0);
  assert.ok(first.evaluationSummary[0].outcomeCheckCount > 0);

  const declared = auditInput(manifest);
  declared.evaluations[0].applicableHardFieldIds = [];
  assert.throws(() => auditFitV4Shadow({ manifest, ...declared }), /evaluation.*key|applicable.*caller|schema/i);

  const forged = auditInput(manifest);
  forged.evaluations[0].result = structuredClone(forged.evaluations[0].result);
  forged.evaluations[0].result.installationOutcome.status = 'VERIFIED_FIT';
  const forgedAudit = auditFitV4Shadow({ manifest, ...forged });
  assert.equal(forgedAudit.verdict, 'FAIL');
  assert.ok(forgedAudit.reasonCodes.includes('EVALUATION_REPLAY_DRIFT'));
});

test('artifact verification independently rebuilds semantic bytes and rejects self-rehashed tampering', async () => {
  const manifest = await createFitV4RunManifest(manifestInputs(), { root: ROOT });
  const input = auditInput(manifest);
  const artifact = auditFitV4Shadow({ manifest, ...input });
  assert.deepEqual(verifyFitV4ShadowAuditArtifact({ artifact, manifest, ...input }), artifact);

  const forged = structuredClone(artifact);
  forged.verdict = 'FAIL';
  forged.reasonCodes = ['FORGED'];
  const { auditId: ignoredId, semanticSha256: ignoredHash, ...semantic } = forged;
  forged.semanticSha256 = semanticHash(semantic);
  forged.auditId = `fit_v4_shadow_audit_${forged.semanticSha256.slice(0, 24)}`;
  assert.throws(
    () => verifyFitV4ShadowAuditArtifact({ artifact: forged, manifest, ...input }),
    /artifact|semantic|independent|mismatch/i,
  );

  const changedManifest = structuredClone(manifest);
  changedManifest.semantic.policyEpoch = 'fit-policy-v4.9.9';
  changedManifest.semanticSha256 = semanticHash(changedManifest.semantic);
  changedManifest.manifestId = `fit_v4_manifest_${changedManifest.semanticSha256.slice(0, 24)}`;
  changedManifest.runId = `fit_v4_run_${changedManifest.semanticSha256.slice(0, 24)}`;
  const { manifestSha256: ignored, ...payload } = changedManifest;
  changedManifest.manifestSha256 = semanticHash(payload);
  const changed = auditFitV4Shadow({ manifest: changedManifest, ...input });
  assert.equal(changed.verdict, 'FAIL');
  assert.ok(changed.reasonCodes.includes('MANIFEST_EXPECTATION_DRIFT'));

  const sameSemanticDifferentManifest = structuredClone(manifest);
  sameSemanticDifferentManifest.generatedAt = '2026-08-09T01:00:00.000Z';
  sameSemanticDifferentManifest.clocks.generatedAt = sameSemanticDifferentManifest.generatedAt;
  const { manifestSha256: ignoredManifestHash, ...sameSemanticPayload } = sameSemanticDifferentManifest;
  sameSemanticDifferentManifest.manifestSha256 = semanticHash(sameSemanticPayload);
  const exactHashAudit = auditFitV4Shadow({
    manifest,
    ...auditInput(sameSemanticDifferentManifest),
  });
  assert.equal(exactHashAudit.verdict, 'FAIL');
  assert.ok(exactHashAudit.reasonCodes.includes('MANIFEST_EXPECTATION_DRIFT'));
});

test('source, conflict, active release, receipt, policy and site drift stay distinct and fail closed', async () => {
  const manifest = await createFitV4RunManifest(manifestInputs(), { root: ROOT });
  const cases = [
    ['SOURCE_REVISION_SUPERSEDED', (copy) => { copy.bindings.sourceRevision.superseded = true; copy.bindings.sourceRevision.observedSha256 = SHA('0'); }],
    ['CONFLICT_SET_DRIFT', (copy) => { copy.bindings.conflictSet.observedSha256 = SHA('0'); copy.bindings.conflictSet.unresolvedCount = 1; }],
    ['ACTIVE_RELEASE_DRIFT', (copy) => { copy.bindings.activeRelease.observed.catalogSha256 = SHA('0'); }],
    ['RECEIPT_WITHDRAWN', (copy) => { copy.bindings.receiptLifecycle.status = 'WITHDRAWN'; copy.bindings.receiptLifecycle.withdrawn = true; }],
    ['POLICY_EPOCH_DRIFT', (copy) => { copy.bindings.policy.observedEpoch = 'fit-policy-v4.0.1'; }],
    ['SITE_OBSERVATION_CLOCK_DRIFT', (copy) => { copy.bindings.siteObservation.asOf = '2026-08-01T00:00:00.000Z'; }],
    ['SITE_OBSERVATION_STALE', (copy) => { copy.bindings.siteObservation.observedAt = '2026-06-01T00:00:00.000Z'; }],
    ['SITE_OBSERVATION_FUTURE', (copy) => { copy.bindings.siteObservation.observedAt = '2026-08-09T00:00:00.000Z'; }],
  ];
  for (const [code, mutate] of cases) {
    const input = auditInput(manifest);
    mutate(input);
    const artifact = auditFitV4Shadow({ manifest, ...input });
    assert.equal(artifact.verdict, 'FAIL', code);
    assert.ok(artifact.reasonCodes.includes(code), `${code}: ${artifact.reasonCodes}`);
  }

  const checks = auditFitV4Shadow({ manifest, ...auditInput(manifest) }).bindingChecks;
  assert.deepEqual(checks.map((item) => item.checkId), [
    'ACTIVE_RELEASE', 'CONFLICT_SET', 'POLICY', 'RECEIPT_LIFECYCLE', 'SITE_OBSERVATION', 'SOURCE_REVISION',
  ]);
});

test('unknown site age and prohibited public/user/score data fail closed', async () => {
  const manifest = await createFitV4RunManifest(manifestInputs(), { root: ROOT });
  const unknown = auditInput(manifest);
  unknown.bindings.siteObservation.observedAt = null;
  const unknownAudit = auditFitV4Shadow({ manifest, ...unknown });
  assert.equal(unknownAudit.verdict, 'FAIL');
  assert.ok(unknownAudit.reasonCodes.includes('SITE_OBSERVATION_UNKNOWN'));

  for (const [key, value] of [
    ['publicMutation', true],
    ['publicationEligible', true],
    ['publicationEligibility', true],
    ['score', 99],
    ['fit_score', 99],
    ['userId', 'person-1'],
    ['user_id', 'person-1'],
    ['publicPath', '/public/data/catalog.json'],
    ['outputPath', '/tmp/public/data/catalog.json'],
    ['moduleImport', '../../public/scripts/runtime.js'],
  ]) {
    const input = auditInput(manifest);
    if (key === 'publicMutation') input[key] = value;
    else input.evaluations[0][key] = value;
    assert.throws(() => auditFitV4Shadow({ manifest, ...input }), /public|publication|score|user|prohibited|isolation/i, key);
  }
});

test('fresh run writes immutable audit and checkpoint before CAS; identical replay preserves bytes', async (t) => {
  const item = await fixture(t);
  const result = await runFitV4ShadowAudit({
    ...item, expectedRunId: null, writerId: 'fresh-run',
  });
  assert.equal(result.artifact.verdict, 'PASS');
  assert.equal(result.replayed, false);
  const auditPath = join(item.runsRoot, item.manifest.runId, 'shadow-audit.json');
  const beforeBytes = await readFile(auditPath);
  const beforeStat = await stat(auditPath);
  assert.equal(JSON.parse(await readFile(join(item.shadowRoot, 'active-shadow.json'), 'utf8')).runId, item.manifest.runId);
  assert.ok(await stat(join(item.runsRoot, item.manifest.runId, 'checkpoints', 'shadow-audit.json')));

  const replay = await runFitV4ShadowAudit({
    ...item, expectedRunId: item.manifest.runId, writerId: 'replay-run',
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(await readFile(auditPath), beforeBytes);
  assert.equal((await stat(auditPath)).ino, beforeStat.ino);

  const laterInputs = manifestInputs({ generatedAt: '2026-08-09T01:00:00.000Z' });
  const laterManifest = await createFitV4RunManifest(laterInputs, { root: ROOT });
  assert.equal(laterManifest.runId, item.manifest.runId);
  const semanticReplay = await runFitV4ShadowAudit({
    runsRoot: item.runsRoot,
    shadowRoot: item.shadowRoot,
    root: ROOT,
    manifest: laterManifest,
    expectedInputs: laterInputs,
    auditInput: item.auditInput,
    expectedRunId: item.manifest.runId,
    writerId: 'semantic-replay',
  });
  assert.equal(semanticReplay.replayed, true);
  assert.deepEqual(await readFile(auditPath), beforeBytes);
  assert.equal((await stat(auditPath)).ino, beforeStat.ino);

  await assert.rejects(() => runFitV4ShadowAudit({
    ...item,
    expectedInputs: manifestInputs({ scenarioSetSha256: SHA('0') }),
    expectedRunId: item.manifest.runId,
    writerId: 'drifted-resume',
  }), /resume|semantic|manifest|drift/i);

  await assert.rejects(() => runFitV4ShadowAudit({
    ...item,
    expectedRunId: `fit_v4_run_${'f'.repeat(24)}`,
    writerId: 'stale-complete-replay',
  }), /expected|compare-and-swap|pointer|stale/i);
});

test('run input cannot override the persisted manifest identity', async (t) => {
  const item = await fixture(t);
  const otherInputs = manifestInputs({ scenarioSetSha256: SHA('0') });
  const otherManifest = await createFitV4RunManifest(otherInputs, { root: ROOT });
  await assert.rejects(() => runFitV4ShadowAudit({
    ...item,
    auditInput: {
      ...item.auditInput,
      manifest: otherManifest,
    },
    expectedRunId: null,
    writerId: 'manifest-override',
  }), /manifest|audit input|override|key set/i);
});

test('all eight audit boundaries fail deterministically and converge on replay without accepting temp files', async (t) => {
  assert.deepEqual(FIT_V4_SHADOW_AUDIT_BOUNDARIES, [
    'before-temp-audit-write', 'after-temp-audit-write',
    'before-audit-rename', 'after-audit-rename',
    'before-checkpoint-write', 'after-checkpoint-write',
    'before-pointer-cas', 'after-pointer-cas',
  ]);
  for (const boundary of FIT_V4_SHADOW_AUDIT_BOUNDARIES) {
    const item = await fixture(t);
    await assert.rejects(
      () => runFitV4ShadowAudit({ ...item, expectedRunId: null, writerId: boundary, faultAt: boundary }),
      (error) => Boolean(error?.code === 'FIT_V4_SHADOW_FAULT'
        && error?.boundary === boundary && error?.safeResumePoint),
      boundary,
    );
    const runFiles = await readdir(join(item.runsRoot, item.manifest.runId));
    assert.equal(runFiles.some((name) => name.includes('.tmp-')), false, boundary);
    const replay = await runFitV4ShadowAudit({
      ...item, expectedRunId: boundary === 'after-pointer-cas' ? item.manifest.runId : null,
      writerId: `${boundary}-replay`,
    });
    assert.equal(replay.artifact.verdict, 'PASS', boundary);
    assert.equal(JSON.parse(await readFile(join(item.shadowRoot, 'active-shadow.json'), 'utf8')).runId, item.manifest.runId);
  }
});

test('run and pointer writer concurrency reject the second writer', async (t) => {
  const item = await fixture(t);
  await writeFitV4RunManifest({ runsRoot: item.runsRoot, manifest: item.manifest });
  const heldWriter = await acquireFitV4RunWriter({
    runsRoot: item.runsRoot, manifest: item.manifest, writerId: 'held-writer',
  });
  await assert.rejects(() => runFitV4ShadowAudit({
    ...item, expectedRunId: null, writerId: 'second-writer',
  }), /writer|lock/i);
  await heldWriter.close();
  await assert.rejects(() => runFitV4ShadowAudit({
    ...item,
    expectedRunId: null,
    writerId: 'prepare-pointer-race',
    faultAt: 'before-pointer-cas',
  }), (error) => error?.code === 'FIT_V4_SHADOW_FAULT');

  let release;
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const target = `fit_v4_run_${'f'.repeat(24)}`;
  const heldPointer = compareAndSwapFitV4ShadowPointer({
    shadowRoot: item.shadowRoot, expectedRunId: null, nextRunId: target,
    verify: async () => { entered(); await releasePromise; },
  });
  await enteredPromise;
  await assert.rejects(() => rollbackFitV4ShadowAudit({
    runsRoot: item.runsRoot,
    shadowRoot: item.shadowRoot,
    expectedRunId: null,
    targetRunId: item.manifest.runId,
    manifest: item.manifest,
    auditInput: item.auditInput,
  }), /pointer|writer|lock/i);
  release();
  await heldPointer;
});

test('new run retains old bytes and verified CAS rollback restores the prior run', async (t) => {
  const first = await fixture(t);
  await runFitV4ShadowAudit({ ...first, expectedRunId: null, writerId: 'run-a' });
  const firstPath = join(first.runsRoot, first.manifest.runId, 'shadow-audit.json');
  const firstBytes = await readFile(firstPath);

  const secondInputs = manifestInputs({
    retailEvidenceClock: {
      bundleSha256: SHA('0'),
      oldestObservedAt: '2026-07-01T00:00:00.000Z',
      freshestObservedAt: '2026-08-01T00:00:00.000Z',
    },
  });
  const secondManifest = await createFitV4RunManifest(secondInputs, { root: ROOT });
  const secondAuditInput = auditInput(secondManifest);
  await runFitV4ShadowAudit({
    runsRoot: first.runsRoot,
    shadowRoot: first.shadowRoot,
    root: ROOT,
    manifest: secondManifest,
    expectedInputs: secondInputs,
    auditInput: secondAuditInput,
    expectedRunId: first.manifest.runId,
    writerId: 'run-b',
  });
  assert.deepEqual(await readFile(firstPath), firstBytes);

  const pointer = await rollbackFitV4ShadowAudit({
    runsRoot: first.runsRoot,
    shadowRoot: first.shadowRoot,
    expectedRunId: secondManifest.runId,
    targetRunId: first.manifest.runId,
    manifest: first.manifest,
    auditInput: first.auditInput,
  });
  assert.equal(pointer.runId, first.manifest.runId);
  assert.deepEqual(await readFile(firstPath), firstBytes);

  await assert.rejects(() => rollbackFitV4ShadowAudit({
    runsRoot: first.runsRoot,
    shadowRoot: first.shadowRoot,
    expectedRunId: first.manifest.runId,
    targetRunId: secondManifest.runId,
    manifest: first.manifest,
    auditInput: first.auditInput,
  }), /target|manifest|audit|mismatch/i);
});

test('rollback rejects an audit artifact that never reached its bound checkpoint', async (t) => {
  const item = await fixture(t);
  await assert.rejects(() => runFitV4ShadowAudit({
    ...item,
    expectedRunId: null,
    writerId: 'artifact-only',
    faultAt: 'after-audit-rename',
  }), (error) => error?.code === 'FIT_V4_SHADOW_FAULT');
  assert.ok(await stat(join(item.runsRoot, item.manifest.runId, 'shadow-audit.json')));
  await assert.rejects(() => rollbackFitV4ShadowAudit({
    runsRoot: item.runsRoot,
    shadowRoot: item.shadowRoot,
    expectedRunId: null,
    targetRunId: item.manifest.runId,
    manifest: item.manifest,
    auditInput: item.auditInput,
  }), /checkpoint|incomplete|rollback/i);
});

test('implementation remains isolated from public runtime and public bytes stay unchanged', async () => {
  const before = await hashTree(join(ROOT, 'public'));
  const source = await readFile(new URL('../../scripts/architecture-v2/audit-fit-v4-shadow.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()["'][^"']*public\//);
  assert.deepEqual(await hashTree(join(ROOT, 'public')), before);
});

async function hashTree(root) {
  const names = (await readdir(root, { recursive: true })).sort();
  const files = [];
  for (const name of names) {
    try {
      const value = await readFile(join(root, name));
      files.push([name, createHash('sha256').update(value).digest('hex')]);
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
  return files;
}
