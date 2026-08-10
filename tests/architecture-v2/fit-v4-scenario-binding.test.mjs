import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateSiteProfileV4 } from '../../src/domain/site-profile-v4.mjs';
import { auditFitV4ShadowResult } from '../../src/domain/fit-v4-audit.mjs';
import { evaluateFitV4Shadow } from '../../src/domain/fit-v4-shadow.mjs';
import {
  acquireFitV4RunWriter,
  buildFitV4Checkpoint,
  compareAndSwapFitV4ShadowPointer,
  createFitV4RunManifest,
  resumeFitV4Run,
  validateFitV4RunManifest,
  writeFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';
import {
  buildTrustedFitV4Input,
  FIELD_MAP,
  observation,
  writeFitV4PassingShadowActivationProof,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';

const AS_OF = '2026-08-08T00:00:00.000Z';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;

function site(width) {
  const scenario = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', width)],
  });
  return scenario.runManifest.scenarioSetManifest.members.find(
    (member) => member.scenarioMemberId === scenario.runManifest.selectedScenarioMemberId,
  ).siteProfile;
}

function input(members = [site(610)]) {
  return {
    purpose: 'FIT_V4_PRIVATE_SHADOW_EVALUATION',
    category: 'refrigerator',
    configurationScope: { installationMode: 'freestanding' },
    metadata: { frozenAt: AS_OF, source: 'WP3_TEST' },
    members,
  };
}

function liveSite(width = 610) {
  const profile = structuredClone(site(width));
  profile.profileId = 'session-wp3-live';
  profile.sourceKind = 'real_site';
  for (const row of profile.observations) {
    row.source = { kind: 'real_site_ephemeral', sourceId: `session-${row.id}` };
    row.method = row.observationType === 'measurement' ? 'user_measurement' : 'user_declaration';
  }
  return profile;
}

const siteOptions = {
  fieldMap: FIELD_MAP,
  asOf: AS_OF,
  maxObservationAgeMs: 7 * 24 * 60 * 60 * 1000,
};

test('WP3 scenario authority builds one canonical set and selects exact distinct members', async () => {
  const {
    buildFitV4SyntheticScenarioSet,
    selectFitV4SyntheticScenario,
    validateFitV4SyntheticScenarioSet,
  } = await import('../../src/domain/fit-v4-scenario-binding.mjs');
  const manifest = buildFitV4SyntheticScenarioSet(input([site(610), site(590)]), siteOptions);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.artifactType, 'FIT_V4_SYNTHETIC_SCENARIO_SET');
  assert.match(manifest.scenarioSetId, /^fit_v4_scenario_set_[a-f0-9]{24}$/);
  assert.match(manifest.scenarioSetSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.members.length, 2);
  assert.deepEqual(validateFitV4SyntheticScenarioSet(manifest, siteOptions), manifest);

  const [leftMember, rightMember] = manifest.members;
  const left = selectFitV4SyntheticScenario(manifest, leftMember.scenarioMemberId, siteOptions);
  const right = selectFitV4SyntheticScenario(manifest, rightMember.scenarioMemberId, siteOptions);
  assert.equal(left.scenarioBinding.scenarioBindingKind, 'PERSISTED_SYNTHETIC');
  assert.equal(left.scenarioBinding.scenarioSetSha256, right.scenarioBinding.scenarioSetSha256);
  assert.notEqual(left.scenarioBinding.scenarioMemberSha256, right.scenarioBinding.scenarioMemberSha256);
  assert.deepEqual(left.siteProfile, leftMember.siteProfile);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(left), true);
});

test('WP3 scenario authority rejects structural drift but accepts a fully rebuilt successor as new authority', async () => {
  const {
    buildFitV4SyntheticScenarioSet,
    selectFitV4SyntheticScenario,
    validateFitV4SyntheticScenarioSet,
  } = await import('../../src/domain/fit-v4-scenario-binding.mjs');
  const predecessor = buildFitV4SyntheticScenarioSet(input([site(590), site(610)]), siteOptions);
  const mutations = [
    (copy) => { copy.members.reverse(); },
    (copy) => { copy.members.pop(); },
    (copy) => { copy.members.push(structuredClone(copy.members[0])); },
    (copy) => { copy.members[0].siteProfile.observations[0].value += 1; },
    (copy) => { copy.members[0].extra = true; },
    (copy) => { copy.extra = true; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(predecessor);
    mutate(copy);
    assert.throws(() => validateFitV4SyntheticScenarioSet(copy, siteOptions), /scenario|member|hash|key|order|duplicate/i);
  }

  const successor = buildFitV4SyntheticScenarioSet(input([site(590), site(611)]), siteOptions);
  assert.notEqual(successor.scenarioSetId, predecessor.scenarioSetId);
  assert.notEqual(successor.scenarioSetSha256, predecessor.scenarioSetSha256);
  assert.throws(
    () => selectFitV4SyntheticScenario(predecessor, successor.members[0].scenarioMemberId, siteOptions),
    /member.*not found|foreign/i,
  );
});

test('one member is valid, foreign members fail, and consented_offline is rejected before authority hashing', async () => {
  const {
    buildFitV4SyntheticScenarioSet,
    selectFitV4SyntheticScenario,
  } = await import('../../src/domain/fit-v4-scenario-binding.mjs');
  const one = buildFitV4SyntheticScenarioSet(input(), siteOptions);
  const foreign = buildFitV4SyntheticScenarioSet(input([site(590)]), siteOptions);
  assert.equal(one.members.length, 1);
  assert.throws(
    () => selectFitV4SyntheticScenario(one, foreign.members[0].scenarioMemberId, siteOptions),
    /member.*not found|foreign/i,
  );

  const consented = structuredClone(site(610));
  consented.sourceKind = 'consented_offline';
  consented.profileId = 'consented-profile';
  consented.consent = {
    approvalId: 'approval-1',
    purpose: 'offline-fit',
    approvedAt: '2026-08-07T00:00:00.000Z',
    expiresAt: '2026-08-09T00:00:00.000Z',
    evidenceSha256: 'a'.repeat(64),
  };
  assert.throws(() => buildFitV4SyntheticScenarioSet(input([consented]), siteOptions), {
    code: 'CONSENTED_OFFLINE_NOT_SUPPORTED',
  });
  assert.throws(
    () => validateSiteProfileV4(consented, siteOptions),
    (error) => !/source kind invalid/i.test(error.message),
  );
});

test('schema-2 manifest, observation clock, result and audit preserve one exact set/member binding', () => {
  const scenario = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    scenarioObservationSets: [
      [observation('cavity.width', 610)],
      [observation('cavity.width', 590)],
    ],
    selectedScenarioIndex: 0,
  });
  assert.equal(scenario.runManifest.schemaVersion, 2);
  assert.equal(Object.hasOwn(scenario.runManifest.semantic, 'scenarioSetSha256'), false);
  assert.equal(Object.hasOwn(scenario, 'siteProfile'), false);
  assert.equal(Object.hasOwn(scenario, 'siteScenarioSha256'), false);
  assert.equal(
    scenario.runManifest.semantic.clockBindings.siteObservation.bundleSha256,
    scenario.runManifest.semantic.scenarioBinding.scenarioMemberSha256,
  );

  const result = evaluateFitV4Shadow(scenario);
  assert.equal(result.schemaVersion, 2);
  assert.deepEqual(result.scenarioBinding, scenario.runManifest.semantic.scenarioBinding);
  assert.equal(Object.hasOwn(result.hashes, 'siteScenario'), false);
  assert.equal(auditFitV4ShadowResult(result, {
    manifest: scenario.runManifest,
    siteOptions: scenario.scenarioSiteOptions,
  }).passed, true);
  const extra = structuredClone(result);
  extra.extra = true;
  const exactAudit = auditFitV4ShadowResult(extra, {
    manifest: scenario.runManifest,
    siteOptions: scenario.scenarioSiteOptions,
  });
  assert.ok(exactAudit.violations.some((row) => row.code === 'INVALID_SHADOW_RESULT_KEYS'));
});

test('schema-2 run manifest is a self-contained immutable scenario predecessor', () => {
  const scenario = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    scenarioObservationSets: [
      [observation('cavity.width', 610)],
      [observation('cavity.width', 590)],
    ],
    selectedScenarioIndex: 0,
  });
  const embeddedScenarioSet = scenario.runManifest.scenarioSetManifest;
  const embeddedMemberId = scenario.runManifest.selectedScenarioMemberId;
  assert.equal(embeddedScenarioSet.members.length, 2);
  assert.ok(embeddedScenarioSet.members.some((member) => member.scenarioMemberId === embeddedMemberId));
  assert.equal(
    scenario.runManifest.scenarioSetManifest.scenarioSetSha256,
    scenario.runManifest.semantic.scenarioBinding.scenarioSetSha256,
  );

  const duplicateAuthority = {
    ...scenario,
    scenarioSetManifest: embeddedScenarioSet,
    selectedScenarioMemberId: embeddedMemberId,
  };
  assert.throws(
    () => evaluateFitV4Shadow(duplicateAuthority),
    /scenario.*authority|duplicate.*scenario|key set/i,
  );
});

test('two members of one set share set authority but produce distinct runs and replayable results', () => {
  const options = {
    fields: [['envelope.closed.width', 600]],
    scenarioObservationSets: [
      [observation('cavity.width', 610)],
      [observation('cavity.width', 590)],
    ],
  };
  const left = buildTrustedFitV4Input({ ...options, selectedScenarioIndex: 0 });
  const right = buildTrustedFitV4Input({ ...options, selectedScenarioIndex: 1 });
  assert.equal(
    left.runManifest.semantic.scenarioBinding.scenarioSetSha256,
    right.runManifest.semantic.scenarioBinding.scenarioSetSha256,
  );
  assert.notEqual(
    left.runManifest.semantic.scenarioBinding.scenarioMemberSha256,
    right.runManifest.semantic.scenarioBinding.scenarioMemberSha256,
  );
  assert.notEqual(left.runId, right.runId);
  assert.notDeepEqual(evaluateFitV4Shadow(left), evaluateFitV4Shadow(right));
});

test('schema-2 evaluator rejects the raw-profile and scalar scenario fallback shapes', () => {
  const scenario = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    scenarioObservationSets: [[observation('cavity.width', 610)]],
  });
  const raw = { ...scenario, siteProfile: site(610) };
  assert.throws(
    () => evaluateFitV4Shadow(raw),
    /raw.*profile|duplicate.*scenario|scenario.*selection|key set|fallback/i,
  );

  const scalar = structuredClone(scenario);
  scalar.runManifest.semantic.scenarioSetSha256 = scalar.runManifest.semantic.scenarioBinding.scenarioSetSha256;
  assert.throws(() => evaluateFitV4Shadow(scalar), /manifest|scenario|key set|schema/i);
});

test('schema-2 checkpoints bind the full manifest and exact pointer CAS reads the persisted copy', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'runs');
  const shadowRoot = join(directory, 'shadow');
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  await writeFitV4RunManifest({ runsRoot, manifest: scenario.runManifest });
  const checkpoint = buildFitV4Checkpoint({
    manifest: scenario.runManifest,
    stage: 'evaluation',
    inputHashes: { scenario: scenario.runManifest.semantic.scenarioBinding.scenarioMemberSha256 },
    outputSha256: 'a'.repeat(64),
  });
  assert.equal(checkpoint.schemaVersion, 2);
  assert.equal(checkpoint.manifestSha256, scenario.runManifest.manifestSha256);
  await writeFitV4PassingShadowActivationProof({ runsRoot, manifest: scenario.runManifest });

  let callbackCalled = false;
  await assert.rejects(() => compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot,
    expectedPointer: null,
    nextManifest: scenario.runManifest,
    verify() { callbackCalled = true; },
  }), /callback|key set|unsupported/i);
  assert.equal(callbackCalled, false);

  const pointer = await compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot,
    expectedPointer: null,
    nextManifest: scenario.runManifest,
  });
  assert.deepEqual(Object.keys(pointer).sort(), [
    'manifestId', 'manifestSha256', 'pointerType', 'runId', 'schemaVersion',
  ]);
  assert.equal(pointer.manifestSha256, scenario.runManifest.manifestSha256);
  assert.deepEqual(JSON.parse(await readFile(join(shadowRoot, 'active-shadow.json'), 'utf8')), pointer);

  await writeFile(join(shadowRoot, 'active-shadow.json'), '{"schemaVersion":2,"runId":"fabricated"}\n');
  await assert.rejects(() => compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot,
    expectedPointer: pointer,
    nextManifest: scenario.runManifest,
  }), /pointer.*invalid|key set|schema/i);
});

test('schema-1 manifests, checkpoints and pointers are inspection-only and cannot enter current persistence', async (t) => {
  const history = await import('../../src/domain/fit-v4-run-manifest.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  const legacy = structuredClone(scenario.runManifest);
  legacy.schemaVersion = 1;
  legacy.semantic.schemaVersion = 1;
  legacy.semantic.scenarioSetSha256 = legacy.semantic.scenarioBinding.scenarioSetSha256;
  delete legacy.semantic.scenarioBinding;
  delete legacy.scenarioSetManifest;
  delete legacy.selectedScenarioMemberId;
  legacy.semanticSha256 = hash(JSON.stringify(canonical(legacy.semantic)));
  legacy.manifestId = `fit_v4_manifest_${legacy.semanticSha256.slice(0, 24)}`;
  legacy.runId = `fit_v4_run_${legacy.semanticSha256.slice(0, 24)}`;
  const { manifestSha256: ignored, ...payload } = legacy;
  legacy.manifestSha256 = hash(JSON.stringify(canonical(payload)));
  const legacyPointer = {
    schemaVersion: 1,
    pointerType: 'FIT_V4_ACTIVE_SHADOW',
    runId: legacy.runId,
  };
  const legacyCheckpointSemantic = canonical({
    schemaVersion: 1,
    manifestId: legacy.manifestId,
    runId: legacy.runId,
    stage: 'historical-inspection',
    inputHashes: { source: 'a'.repeat(64) },
    outputSha256: 'b'.repeat(64),
  });
  const legacyCheckpointSha256 = hash(JSON.stringify(legacyCheckpointSemantic));
  const legacyCheckpoint = {
    ...legacyCheckpointSemantic,
    checkpointId: `fit_v4_checkpoint_${legacyCheckpointSha256.slice(0, 24)}`,
    checkpointSha256: legacyCheckpointSha256,
  };
  assert.deepEqual(history.readHistoricalFitV4RunManifestV1(legacy), legacy);
  assert.deepEqual(history.readHistoricalFitV4CheckpointV1(legacyCheckpoint, legacy), legacyCheckpoint);
  assert.deepEqual(history.readHistoricalFitV4ShadowPointerV1(legacyPointer), legacyPointer);

  const runsRoot = join(directory, 'not-created-runs');
  await assert.rejects(
    () => writeFitV4RunManifest({ runsRoot, manifest: legacy }),
    /schema|current.*manifest|manifest invalid|key set/i,
  );
  await assert.rejects(
    () => resumeFitV4Run({ runsRoot, manifest: legacy, expectedInputs: {} }),
    /schema|current.*manifest|manifest invalid|key set|ENOENT/i,
  );
  await assert.rejects(() => access(runsRoot));

  const forgedHistorical = structuredClone(legacy);
  forgedHistorical.semantic.unexpected = true;
  forgedHistorical.semanticSha256 = hash(JSON.stringify(canonical(forgedHistorical.semantic)));
  forgedHistorical.manifestId = `fit_v4_manifest_${forgedHistorical.semanticSha256.slice(0, 24)}`;
  forgedHistorical.runId = `fit_v4_run_${forgedHistorical.semanticSha256.slice(0, 24)}`;
  forgedHistorical.clocks = {
    ...forgedHistorical.clocks,
  };
  const { manifestSha256: forgedIgnored, ...forgedPayload } = forgedHistorical;
  forgedHistorical.manifestSha256 = hash(JSON.stringify(canonical(forgedPayload)));
  assert.throws(
    () => history.readHistoricalFitV4RunManifestV1(forgedHistorical),
    /historical.*semantic|key set/i,
  );
});

test('schema-2 manifest rejects self-rehashed scenario binding IDs that do not derive from full hashes', () => {
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  const forged = structuredClone(scenario.runManifest);
  forged.semantic.scenarioBinding.scenarioSetId = 'attacker-controlled-set';
  forged.semanticSha256 = hash(JSON.stringify(canonical(forged.semantic)));
  forged.manifestId = `fit_v4_manifest_${forged.semanticSha256.slice(0, 24)}`;
  forged.runId = `fit_v4_run_${forged.semanticSha256.slice(0, 24)}`;
  const { manifestSha256: ignored, ...payload } = forged;
  forged.manifestSha256 = hash(JSON.stringify(canonical(payload)));
  assert.throws(
    () => validateFitV4RunManifest(forged),
    /scenario.*ID|scenario.*binding|scenario.*set/i,
  );
});

test('shadow pointer refuses a persisted run without a completed bound shadow audit', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-unaudited-pointer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'runs');
  const shadowRoot = join(directory, 'shadow');
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  await writeFitV4RunManifest({ runsRoot, manifest: scenario.runManifest });

  await assert.rejects(
    () => compareAndSwapFitV4ShadowPointer({
      runsRoot,
      shadowRoot,
      expectedPointer: null,
      nextManifest: scenario.runManifest,
    }),
    /shadow.*audit|activation.*proof|checkpoint/i,
  );
  await assert.rejects(() => access(shadowRoot));
});

test('shadow pointer binds checkpoint audit input to the exact activation artifact', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-audit-input-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'runs');
  const shadowRoot = join(directory, 'shadow');
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  await writeFitV4RunManifest({ runsRoot, manifest: scenario.runManifest });
  const { artifact } = await writeFitV4PassingShadowActivationProof({
    runsRoot,
    manifest: scenario.runManifest,
  });
  const auditBytes = await readFile(join(runsRoot, scenario.runId, 'shadow-audit.json'));
  const mismatched = buildFitV4Checkpoint({
    manifest: scenario.runManifest,
    stage: 'shadow-audit',
    inputHashes: {
      auditInput: 'b'.repeat(64),
      manifest: scenario.runManifest.manifestSha256,
    },
    outputSha256: hash(auditBytes),
  });
  assert.notEqual(mismatched.inputHashes.auditInput, artifact.inputSemanticSha256);
  await writeFile(
    join(runsRoot, scenario.runId, 'checkpoints', 'shadow-audit.json'),
    `${JSON.stringify(mismatched, null, 2)}\n`,
  );
  await assert.rejects(
    () => compareAndSwapFitV4ShadowPointer({
      runsRoot,
      shadowRoot,
      expectedPointer: null,
      nextManifest: scenario.runManifest,
    }),
    /audit.*input|activation.*binding/i,
  );
  await assert.rejects(() => access(shadowRoot));
});

test('shadow pointer rejects self-rehashed audit shapes the production auditor cannot emit', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-audit-shape-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'runs');
  const shadowRoot = join(directory, 'shadow');
  const scenario = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] });
  await writeFitV4RunManifest({ runsRoot, manifest: scenario.runManifest });
  const { artifact: validArtifact } = await writeFitV4PassingShadowActivationProof({
    runsRoot,
    manifest: scenario.runManifest,
  });
  const {
    semanticSha256: ignoredSemantic,
    auditId: ignoredAuditId,
    ...forgedSemantic
  } = structuredClone(validArtifact);
  forgedSemantic.evaluationSummary = {};
  const semanticSha256 = hash(JSON.stringify(canonical(forgedSemantic)));
  const forgedArtifact = {
    ...forgedSemantic,
    semanticSha256,
    auditId: `fit_v4_shadow_audit_${semanticSha256.slice(0, 24)}`,
  };
  const auditBytes = Buffer.from(`${JSON.stringify(forgedArtifact, null, 2)}\n`);
  await writeFile(join(runsRoot, scenario.runId, 'shadow-audit.json'), auditBytes);
  const checkpoint = buildFitV4Checkpoint({
    manifest: scenario.runManifest,
    stage: 'shadow-audit',
    inputHashes: {
      auditInput: forgedArtifact.inputSemanticSha256,
      manifest: scenario.runManifest.manifestSha256,
    },
    outputSha256: hash(auditBytes),
  });
  await writeFile(
    join(runsRoot, scenario.runId, 'checkpoints', 'shadow-audit.json'),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
  );
  await assert.rejects(
    () => compareAndSwapFitV4ShadowPointer({
      runsRoot,
      shadowRoot,
      expectedPointer: null,
      nextManifest: scenario.runManifest,
    }),
    /audit.*summary|activation artifact/i,
  );
  await assert.rejects(() => access(shadowRoot));
});

test('live evaluation accepts only original capability identity and returns an opaque safe result', async () => {
  const live = await import('../../src/domain/fit-v4-shadow.mjs');
  const profile = liveSite();
  const capability = live.createFitV4LiveScenarioCapability(profile, siteOptions);
  const evaluationInput = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 590)],
  });
  const result = live.evaluateFitV4LiveShadow({ capability, evaluationInput });

  assert.deepEqual(Object.keys(capability), []);
  assert.deepEqual(Object.keys(result), []);
  assert.equal(result.outcome, 'INSUFFICIENT_DATA');
  assert.match(result.reasonCode, /^[A-Z][A-Z0-9_]+$/);
  assert.equal(Object.hasOwn(result, 'checks'), false);
  assert.throws(() => JSON.stringify(capability), { code: 'LIVE_EPHEMERAL_SERIALIZATION_PROHIBITED' });
  assert.throws(() => JSON.stringify(result), { code: 'LIVE_EPHEMERAL_SERIALIZATION_PROHIBITED' });
  assert.equal(live.auditFitV4LiveShadowResult({ capability, result }).passed, true);

  for (const lookalike of [
    { ...capability },
    Object.assign({}, capability),
    structuredClone(capability),
    {},
  ]) {
    assert.throws(
      () => live.evaluateFitV4LiveShadow({ capability: lookalike, evaluationInput }),
      { code: 'LIVE_EPHEMERAL_CAPABILITY_INVALID' },
    );
  }
  assert.throws(
    () => live.auditFitV4LiveShadowResult({ capability, result: structuredClone(result) }),
    { code: 'LIVE_EPHEMERAL_RESULT_INVALID' },
  );
});

test('live validation failures and consented_offline rejection are fixed-code and detail-free', async () => {
  const live = await import('../../src/domain/fit-v4-shadow.mjs');
  const invalid = liveSite(610);
  invalid.observations[0].value = -123456;
  assert.throws(
    () => live.createFitV4LiveScenarioCapability(invalid, siteOptions),
    (error) => error.code === 'LIVE_EPHEMERAL_PROFILE_INVALID'
      && error.message === error.code
      && error.cause === undefined
      && !error.message.includes('123456'),
  );

  const consented = liveSite(610);
  consented.sourceKind = 'consented_offline';
  assert.throws(
    () => live.createFitV4LiveScenarioCapability(consented, siteOptions),
    { code: 'CONSENTED_OFFLINE_NOT_SUPPORTED' },
  );
  assert.throws(
    () => live.evaluateFitV4LiveShadow({ capability: liveSite(), evaluationInput: {} }),
    { code: 'LIVE_EPHEMERAL_CAPABILITY_INVALID' },
  );
});

test('persistent APIs reject live capability before creating filesystem roots', async (t) => {
  const live = await import('../../src/domain/fit-v4-shadow.mjs');
  const shadowAudit = await import('../../scripts/architecture-v2/audit-fit-v4-shadow.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-wp3-live-persist-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'absent-runs');
  const shadowRoot = join(directory, 'absent-shadow');
  const capability = live.createFitV4LiveScenarioCapability(liveSite(), siteOptions);
  const evaluationInput = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 590)],
  });
  const liveResult = live.evaluateFitV4LiveShadow({ capability, evaluationInput });
  assert.equal(liveResult.scenarioBindingKind, 'LIVE_EPHEMERAL');

  await assert.rejects(
    () => createFitV4RunManifest(capability, {
      root: join(directory, 'absent-active-release-root'),
      descriptorPath: join(directory, 'absent-active-release.json'),
    }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => writeFitV4RunManifest({ runsRoot, manifest: capability }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => resumeFitV4Run({ runsRoot, manifest: capability, expectedInputs: {} }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => acquireFitV4RunWriter({ runsRoot, manifest: capability, writerId: 'live' }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => shadowAudit.runFitV4ShadowAudit({ runsRoot, shadowRoot, manifest: capability }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => shadowAudit.rollbackFitV4ShadowAudit({ runsRoot, shadowRoot, manifest: capability }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  assert.throws(
    () => buildFitV4Checkpoint({ manifest: capability, stage: 'live', inputHashes: { live: 'a'.repeat(64) }, outputSha256: 'b'.repeat(64) }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  await assert.rejects(
    () => compareAndSwapFitV4ShadowPointer({ runsRoot, shadowRoot, expectedPointer: null, nextManifest: capability }),
    { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
  );
  for (const ephemeral of [liveResult, live.auditFitV4LiveShadowResult({ capability, result: liveResult })]) {
    await assert.rejects(
      () => writeFitV4RunManifest({ runsRoot, manifest: ephemeral }),
      { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
    );
    assert.throws(
      () => buildFitV4Checkpoint({
        manifest: ephemeral,
        stage: 'live',
        inputHashes: { live: 'a'.repeat(64) },
        outputSha256: 'b'.repeat(64),
      }),
      { code: 'LIVE_EPHEMERAL_NOT_PERSISTABLE' },
    );
  }
  await assert.rejects(() => access(runsRoot));
  await assert.rejects(() => access(shadowRoot));
});
