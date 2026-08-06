import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildHistoricalEvidenceShadowInputSnapshot,
  createHistoricalEvidenceShadowEpochStore,
  runHistoricalEvidenceShadowEpoch,
} from '../../src/domain/historical-evidence-shadow-epoch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  parseHistoricalEvidenceShadowEpochArgs,
  runHistoricalEvidenceShadowEpochCli,
  scaleControlForShadowManifestResolution,
} from '../../scripts/architecture-v2/run-historical-evidence-shadow-epoch.mjs';

const SHA = (character) => character.repeat(64);

function input(overrides = {}) {
  return {
    runId: 'shadow-test-a',
    resume: false,
    manifest: {
      manifestId: 'historical_batch_c454c0c428c9ee818313ecbd',
      semanticManifestSha256: SHA('a'),
      executionLane: 'BOUNDED_DISCOVERY',
      cohortKey: 'historical_cohort_test',
      targetBindings: [{
        targetId: 'target-1', referenceId: 'ref-1', executionLane: 'BOUNDED_DISCOVERY',
        familyId: null, assignment: 'MULTI_FAMILY_SINGLETON',
      }],
    },
    activeRelease: {
      releaseCandidateId: 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4',
      bindingSha256: SHA('b'),
    },
    inputSha256: SHA('c'),
    capabilityIdentity: {
      resolverSha256: SHA('d'), transportSha256: SHA('e'),
      parserSha256: SHA('f'), identitySha256: SHA('1'),
    },
    targets: [{
      targetId: 'target-1', referenceId: 'ref-1', brand: 'Alpha', model: 'ABC123',
      category: 'fridge', lifecycleState: 'CURRENT_RETAIL',
      requestedFields: ['closedEnvelope.widthMm'],
    }],
    publicSearchCandidates: [],
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    now: () => '2026-08-05T01:00:00.000Z',
    discoverTarget: async () => ({ candidates: [], outputSha256: SHA('2') }),
    acquireArtifact: async () => assert.fail('acquisition must not run'),
    preflightArtifact: async () => ({ identity: { outcome: 'exact' } }),
    attestArtifact: async () => assert.fail('attestation must not run'),
    observeArtifact: async () => assert.fail('observation must not run'),
    ...overrides,
  };
}

function snapshotInput(overrides = {}) {
  const base = input({ runId: 'snapshot-run' });
  const { manifestId: ignoredId, semanticManifestSha256: ignoredSha, ...manifestSemantic } = base.manifest;
  const semanticManifestSha256 = canonicalJsonSha256(manifestSemantic);
  base.manifest = {
    ...manifestSemantic,
    manifestId: `historical_batch_${semanticManifestSha256.slice(0, 24)}`,
    semanticManifestSha256,
  };
  return {
    ...base,
    acquisitionQueue: {
      schemaVersion: 1,
      generatedAt: '2026-08-05T00:00:00.000Z',
      semanticQueueSha256: SHA('6'),
      records: [{
        schemaVersion: 1,
        acquisitionId: 'acquisition-ref-1',
        referenceId: 'ref-1',
        brand: 'Alpha',
        model: 'ABC123',
        category: 'fridge',
        candidateSourceIds: ['source-ref-1'],
        resolverIds: ['alpha-official'],
      }, {
        schemaVersion: 1,
        acquisitionId: 'acquisition-unselected',
        referenceId: 'unselected',
        brand: 'Beta',
        model: 'OTHER',
        category: 'fridge',
        candidateSourceIds: ['source-unselected'],
        resolverIds: ['beta-official'],
      }],
      sources: [{
        sourceId: 'source-ref-1',
        sourceUrl: 'https://alpha.example/ABC123.pdf',
        referenceIds: ['ref-1'],
      }, {
        sourceId: 'source-unselected',
        sourceUrl: 'https://beta.example/OTHER.pdf',
        referenceIds: ['unselected'],
      }],
      summary: { queuedModels: 2 },
    },
    policy: {
      schemaVersion: 1,
      limits: { timeoutMs: 1000, maximumBytes: 1024, maximumRedirects: 2 },
      retry: { fetchAttempts: 1, baseDelayMs: 0 },
    },
    ...overrides,
  };
}

function cliArgs({ runId, resume = true, manifestId, activeReleaseId } = {}) {
  const value = input();
  return [
    '--manifest-id', manifestId ?? value.manifest.manifestId,
    '--active-release-id', activeReleaseId ?? value.activeRelease.releaseCandidateId,
    '--run-id', runId,
    '--storage-root', '/unused-by-injected-storage',
    ...(resume ? ['--resume'] : []),
  ];
}

function unavailableControl() {
  return new Proxy({}, {
    get() { assert.fail('completed or snapshotted resume must not read current control inputs'); },
  });
}

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'fit-shadow-epoch-'));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('no resolver or imported validated candidate stops with PUBLIC_SEARCH_REQUIRED', async () => {
  await withRoot(async (storageRoot) => {
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    const result = await runHistoricalEvidenceShadowEpoch(input(), {
      store, ...dependencies(),
    });

    assert.equal(result.targets[0].terminalResult, 'PUBLIC_SEARCH_REQUIRED');
    assert.deepEqual(result.summary.yield, { explicitReceipts: 0, observations: 0 });
    assert.equal(result.policy.publicSearchInvoked, false);
    const persisted = JSON.parse(await readFile(store.paths.results, 'utf8'));
    assert.equal(persisted.semanticReportSha256, result.semanticReportSha256);
  });
});

test('completed shadow resume rejects a report whose semantic fields were tampered', async () => {
  await withRoot(async (storageRoot) => {
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'tampered-completed', now: () => '2026-08-05T01:00:00.000Z',
    });
    await runHistoricalEvidenceShadowEpoch(input({ runId: 'tampered-completed' }), {
      store, ...dependencies(),
    });
    const report = JSON.parse(await readFile(store.paths.results, 'utf8'));
    report.summary.attempted += 1;
    await writeFile(store.paths.results, `${JSON.stringify(report, null, 2)}\n`);

    await assert.rejects(() => runHistoricalEvidenceShadowEpoch(input({
      runId: 'tampered-completed', resume: true,
    }), { store, ...dependencies() }), /completed shadow result.*hash|semantic.*drift/i);
  });
});

test('completed legacy CLI resume verifies persisted state and result before current manifest resolution', async () => {
  await withRoot(async (storageRoot) => {
    const runId = 'completed-legacy-cli';
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId, now: () => '2026-08-05T01:00:00.000Z',
    });
    const completed = await runHistoricalEvidenceShadowEpoch(input({ runId }), {
      store, ...dependencies(),
    });
    const resumed = await runHistoricalEvidenceShadowEpochCli(cliArgs({ runId }), {
      control: unavailableControl(),
      verifyStorageRoot: async () => ({ root: storageRoot, markerSha256: SHA('9') }),
      loadActiveRelease: async () => assert.fail('completed resume must not load current release'),
      store,
      writeOutput: () => {},
    });

    assert.equal(resumed.semanticReportSha256, completed.semanticReportSha256);
  });
});

test('incomplete CLI resume uses a signed selected-input snapshot without current regenerated queues', async () => {
  await withRoot(async (storageRoot) => {
    const snapshot = buildHistoricalEvidenceShadowInputSnapshot(snapshotInput());
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: snapshot.runId, now: () => '2026-08-05T01:00:00.000Z',
    });
    await store.writeInputSnapshot(snapshot);
    await store.open({
      resume: false,
      bindings: {
        ...snapshot.bindings,
        inputSnapshotSha256: snapshot.semanticSnapshotSha256,
      },
      targets: snapshot.targets,
    });

    const resumed = await runHistoricalEvidenceShadowEpochCli(cliArgs({
      runId: snapshot.runId,
      manifestId: snapshot.manifest.manifestId,
      activeReleaseId: snapshot.activeRelease.releaseCandidateId,
    }), {
      control: unavailableControl(),
      verifyStorageRoot: async () => ({ root: storageRoot, markerSha256: SHA('9') }),
      loadActiveRelease: async () => assert.fail('snapshotted resume must not load current release'),
      store,
      discoverTarget: async () => ({ candidates: [], outputSha256: SHA('2') }),
      acquireArtifact: async () => assert.fail('no candidate must mean no acquisition'),
      preflightArtifact: async () => assert.fail('no candidate must mean no preflight'),
      attestArtifact: async () => assert.fail('no candidate must mean no attestation'),
      observeArtifact: async () => assert.fail('no candidate must mean no observation'),
      writeOutput: () => {},
    });

    assert.equal(resumed.targets[0].terminalResult, 'PUBLIC_SEARCH_REQUIRED');
    assert.deepEqual(snapshot.acquisitionQueue.records.map((row) => row.referenceId), ['ref-1']);
    assert.deepEqual(snapshot.acquisitionQueue.sources.map((row) => row.sourceId), ['source-ref-1']);
  });
});

test('incomplete CLI resume fails closed when its run-local input snapshot is missing or tampered', async () => {
  for (const mode of ['missing', 'tampered']) {
    await withRoot(async (storageRoot) => {
      const runId = `snapshot-${mode}`;
      const snapshot = buildHistoricalEvidenceShadowInputSnapshot(snapshotInput({ runId }));
      const store = createHistoricalEvidenceShadowEpochStore({
        storageRoot, runId, now: () => '2026-08-05T01:00:00.000Z',
      });
      await store.open({
        resume: false,
        bindings: {
          ...snapshot.bindings,
          inputSnapshotSha256: snapshot.semanticSnapshotSha256,
        },
        targets: snapshot.targets,
      });
      if (mode === 'tampered') {
        await store.writeInputSnapshot(snapshot);
        const tampered = JSON.parse(await readFile(store.paths.inputSnapshot, 'utf8'));
        tampered.policy.retry.fetchAttempts = 2;
        const { semanticSnapshotSha256: ignored, ...semantic } = tampered;
        tampered.semanticSnapshotSha256 = canonicalJsonSha256(semantic);
        await writeFile(store.paths.inputSnapshot, `${JSON.stringify(tampered, null, 2)}\n`);
      }

      await assert.rejects(
        () => runHistoricalEvidenceShadowEpochCli(cliArgs({
          runId,
          manifestId: snapshot.manifest.manifestId,
          activeReleaseId: snapshot.activeRelease.releaseCandidateId,
        }), {
          control: unavailableControl(),
          verifyStorageRoot: async () => ({ root: storageRoot, markerSha256: SHA('9') }),
          store,
          writeOutput: () => {},
        }),
        mode === 'missing' ? /incomplete.*snapshot.*missing/i : /input snapshot.*drift/i,
      );
    });
  }
});

test('resume rejects manifest, active-release and input binding drift', async () => {
  await withRoot(async (storageRoot) => {
    const firstStore = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    await runHistoricalEvidenceShadowEpoch(input(), { store: firstStore, ...dependencies() });

    for (const [overrides, message] of [
      [{ manifest: { ...input().manifest, semanticManifestSha256: SHA('8') } }, /manifest.*drift/i],
      [{ activeRelease: {
        releaseCandidateId: 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4',
        bindingSha256: SHA('9'),
      } }, /active release.*drift/i],
      [{ inputSha256: SHA('7') }, /input.*drift/i],
    ]) {
      const resumedStore = createHistoricalEvidenceShadowEpochStore({
        storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:01:00.000Z',
      });
      await assert.rejects(() => runHistoricalEvidenceShadowEpoch(input({
        resume: true, ...overrides,
      }), { store: resumedStore, ...dependencies() }), message);
    }
  });
});

test('validated imported candidate is used only when resolver discovery yields none', async () => {
  await withRoot(async (storageRoot) => {
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    const candidate = {
      candidateId: 'public-1', sourceUrl: 'https://alpha.example/ABC123.html',
      authorityMode: 'official', targetId: 'target-1', referenceId: 'ref-1',
      activeReleaseId: input().activeRelease.releaseCandidateId,
      activeReleaseSha256: input().activeRelease.bindingSha256,
    };
    const acquired = [];
    const result = await runHistoricalEvidenceShadowEpoch(input({
      publicSearchCandidates: [candidate],
    }), {
      store,
      ...dependencies({
        acquireArtifact: async (_target, value) => {
          acquired.push(value.source);
          return { contentSha256: SHA('3'), contentType: 'text/html' };
        },
        attestArtifact: async () => { throw new Error('no explicit dimensions'); },
        observeArtifact: async () => ({ dimensionUnitObservations: [] }),
      }),
    });
    assert.deepEqual(acquired, ['PUBLIC_SEARCH']);
    assert.equal(result.targets[0].terminalResult, 'VERIFIED_OFFICIAL_ARTIFACT_NO_DIMENSION_YIELD');
    assert.equal(result.summary.verifiedOfficialArtifacts, 1);
    assert.deepEqual(result.summary.measuredCoverage, {
      targetsWithVerifiedOfficialArtifacts: 1, targets: 1, ratio: 1,
    });
  });
});

test('acquisition without exact identity is IDENTITY_NOT_VERIFIED and cannot attest or observe', async () => {
  await withRoot(async (storageRoot) => {
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    const candidate = {
      candidateId: 'public-1', sourceUrl: 'https://alpha.example/ABC123.pdf',
      authorityMode: 'official', targetId: 'target-1', referenceId: 'ref-1',
      activeReleaseId: input().activeRelease.releaseCandidateId,
      activeReleaseSha256: input().activeRelease.bindingSha256,
    };
    let acquisitions = 0;
    const result = await runHistoricalEvidenceShadowEpoch(input({
      publicSearchCandidates: [candidate],
    }), {
      store,
      ...dependencies({
        acquireArtifact: async () => {
          acquisitions += 1;
          return {
            contentSha256: SHA('3'), contentType: 'application/pdf',
            finalUrl: 'https://alpha.example/sibling.pdf', transport: 'fetch',
            objectPath: `evidence/web/${SHA('3')}.pdf`,
            derivedArtifact: { contentSha256: SHA('4') },
          };
        },
        preflightArtifact: async () => { throw new Error('exact model identity not proven'); },
        attestArtifact: async () => assert.fail('attestation must wait for identity'),
        observeArtifact: async () => assert.fail('observation must wait for identity'),
      }),
    });
    assert.equal(result.targets[0].terminalResult, 'IDENTITY_NOT_VERIFIED');
    assert.equal(result.targets[0].verifiedOfficialArtifacts, 0);
    assert.equal(result.summary.verifiedOfficialArtifacts, 0);
    assert.equal(result.summary.measuredCoverage.ratio, 0);
    assert.equal(acquisitions, 1);
    assert.deepEqual(result.targets[0].artifacts[0], {
      candidateId: 'public-1',
      sourceUrl: 'https://alpha.example/ABC123.pdf',
      finalUrl: 'https://alpha.example/sibling.pdf',
      transport: 'fetch',
      objectPath: `evidence/web/${SHA('3')}.pdf`,
      contentSha256: SHA('3'),
      contentType: 'application/pdf',
      derivedContentSha256: SHA('4'),
      identityVerified: false,
    });
  });
});

test('resolver candidates run before imported search and receipt and observation counts stay separate', async () => {
  await withRoot(async (storageRoot) => {
    const acquired = [];
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    const resolverCandidate = {
      candidateId: 'resolver-1', sourceUrl: 'https://alpha.example/ABC123.pdf',
      authorityMode: 'official', discoveryProvenance: null,
    };
    const publicCandidate = {
      candidateId: 'public-1', sourceUrl: 'https://alpha.example/ABC123.html',
      authorityMode: 'official', targetId: 'target-1', referenceId: 'ref-1',
      activeReleaseId: input().activeRelease.releaseCandidateId,
      activeReleaseSha256: input().activeRelease.bindingSha256,
    };
    const result = await runHistoricalEvidenceShadowEpoch(input({
      publicSearchCandidates: [publicCandidate],
    }), {
      store,
      ...dependencies({
        discoverTarget: async () => ({ candidates: [resolverCandidate], outputSha256: SHA('2') }),
        acquireArtifact: async (_target, candidate, hooks) => {
          acquired.push(candidate.candidateId);
          await hooks.onMineruProcessed({ contentSha256: SHA('3'), derivedContentSha256: SHA('4') });
          return { contentSha256: SHA('3'), contentType: 'application/pdf' };
        },
        attestArtifact: async () => ({ source: { verificationReceipt: { receiptId: 'receipt-1' } } }),
        observeArtifact: async () => ({ dimensionUnitObservations: [{ observationId: 'obs-1' }] }),
      }),
    });

    assert.deepEqual(acquired, ['resolver-1']);
    assert.deepEqual(result.summary.yield, { explicitReceipts: 1, observations: 1 });
    assert.equal(result.targets[0].explicitReceiptCount, 1);
    assert.equal(result.targets[0].observationCount, 1);
    assert.equal(result.targets[0].terminalResult, 'EXPLICIT_RECEIPT');
    assert.equal(result.targets[0].verifiedOfficialArtifacts, 1);
    assert.deepEqual(result.targets[0].sourceContentSha256s, [SHA('3')]);
    assert.ok(result.targets[0].funnel.some((entry) => entry.state === 'MINERU_PROCESSED'));
    assert.ok(result.targets[0].funnel.some((entry) => entry.state === 'ARTIFACT_ACQUIRED'));
    assert.ok(result.targets[0].funnel.some((entry) => entry.state === 'EXPLICIT_RECEIPT'));
  });
});

test('resume continues from the discovery checkpoint without rerunning discovery', async () => {
  await withRoot(async (storageRoot) => {
    let discoveries = 0;
    const candidate = {
      candidateId: 'resolver-1', sourceUrl: 'https://alpha.example/ABC123.pdf',
      authorityMode: 'official', discoveryProvenance: null,
    };
    const firstStore = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:00:00.000Z',
    });
    await assert.rejects(() => runHistoricalEvidenceShadowEpoch(input(), {
      store: firstStore,
      ...dependencies({
        discoverTarget: async () => {
          discoveries += 1;
          return { candidates: [candidate], outputSha256: SHA('2') };
        },
        acquireArtifact: async () => {
          throw Object.assign(new Error('simulated interruption'), { code: 'INTERRUPTED' });
        },
      }),
    }), /simulated interruption/);
    const interrupted = JSON.parse(await readFile(firstStore.paths.state, 'utf8'));
    assert.equal(interrupted.targets['target-1'].checkpoint, 'DISCOVERY_COMPLETE');

    const resumedStore = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'shadow-test-a', now: () => '2026-08-05T01:01:00.000Z',
    });
    const result = await runHistoricalEvidenceShadowEpoch(input({ resume: true }), {
      store: resumedStore,
      ...dependencies({
        discoverTarget: async () => assert.fail('discovery must resume from checkpoint'),
        acquireArtifact: async () => ({ contentSha256: SHA('3'), contentType: 'text/html' }),
        attestArtifact: async () => { throw new Error('no explicit dimensions'); },
        observeArtifact: async () => ({ dimensionUnitObservations: [] }),
      }),
    });
    assert.equal(discoveries, 1);
    assert.equal(result.targets[0].terminalResult, 'VERIFIED_OFFICIAL_ARTIFACT_NO_DIMENSION_YIELD');
  });
});

test('second consecutive family no-yield attempt emits a typed stop and unchanged capability blocks later work', async () => {
  await withRoot(async (storageRoot) => {
    for (const [runId, expected] of [
      ['family-attempt-1', 'PUBLIC_SEARCH_REQUIRED'],
      ['family-attempt-2', 'FAMILY_NO_YIELD_STOP'],
    ]) {
      const store = createHistoricalEvidenceShadowEpochStore({
        storageRoot, runId, now: () => '2026-08-05T01:00:00.000Z',
      });
      const result = await runHistoricalEvidenceShadowEpoch(input({ runId }), {
        store, ...dependencies(),
      });
      assert.equal(result.targets[0].terminalResult, expected);
      if (runId === 'family-attempt-1') {
        await store.appendFamilyAttempt({
          runId: 'unrelated-run', targetId: 'other-target', referenceId: 'other-reference',
          familyKey: 'unrelated-family',
          capabilitySha256: canonicalCapabilitySha256(),
          explicitReceiptCount: 0, observationCount: 0,
          terminalResult: 'PUBLIC_SEARCH_REQUIRED', completedAt: '2026-08-05T01:00:00.000Z',
        });
      }
    }

    const blockedStore = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'family-attempt-3', now: () => '2026-08-05T01:00:00.000Z',
    });
    const blocked = await runHistoricalEvidenceShadowEpoch(input({ runId: 'family-attempt-3' }), {
      store: blockedStore,
      ...dependencies({ discoverTarget: async () => assert.fail('family stop must prevent discovery') }),
    });
    assert.equal(blocked.targets[0].terminalResult, 'FAMILY_NO_YIELD_STOP');
    assert.equal(blocked.targets[0].attempted, false);
  });
});

function canonicalCapabilitySha256() {
  return createHash('sha256').update(JSON.stringify({
    identitySha256: SHA('1'), parserSha256: SHA('f'),
    resolverSha256: SHA('d'), transportSha256: SHA('e'),
  })).digest('hex');
}

test('family attempt append is idempotent and rejects re-completion drift', async () => {
  await withRoot(async (storageRoot) => {
    const store = createHistoricalEvidenceShadowEpochStore({
      storageRoot, runId: 'history-test', now: () => '2026-08-05T01:00:00.000Z',
    });
    const attempt = {
      runId: 'history-test', targetId: 'target-1', referenceId: 'ref-1',
      familyKey: 'family-1', capabilitySha256: SHA('a'),
      explicitReceiptCount: 0, observationCount: 0,
      terminalResult: 'PUBLIC_SEARCH_REQUIRED', completedAt: '2026-08-05T01:00:00.000Z',
    };
    await store.appendFamilyAttempt(attempt);
    const replay = await store.appendFamilyAttempt(structuredClone(attempt));
    assert.equal(replay.attempts.length, 1);
    await assert.rejects(
      () => store.appendFamilyAttempt({ ...attempt, observationCount: 1 }),
      /family attempt.*drift|re-completion/i,
    );
  });
});

function successfulCandidateDependencies(counters = {}) {
  const candidate = {
    candidateId: 'resolver-1', sourceUrl: 'https://alpha.example/ABC123.pdf',
    authorityMode: 'official', discoveryProvenance: null,
  };
  return dependencies({
    discoverTarget: async () => {
      counters.discovery = (counters.discovery ?? 0) + 1;
      return { candidates: [candidate], outputSha256: SHA('2') };
    },
    acquireArtifact: async (_target, _candidate, hooks) => {
      counters.acquisition = (counters.acquisition ?? 0) + 1;
      await hooks.onMineruProcessed({ contentSha256: SHA('3'), derivedContentSha256: SHA('4') });
      return {
        contentSha256: SHA('3'), contentType: 'application/pdf',
        finalUrl: 'https://alpha.example/ABC123.pdf', transport: 'fetch',
        objectPath: `evidence/web/${SHA('3')}.pdf`,
        derivedArtifact: { contentSha256: SHA('4') },
      };
    },
    preflightArtifact: async () => ({ identity: { outcome: 'exact' } }),
    attestArtifact: async () => ({ source: { verificationReceipt: { receiptId: 'receipt-1' } } }),
    observeArtifact: async () => ({ dimensionUnitObservations: [] }),
  });
}

test('resume after MinerU, artifact, family-history, decision and final checkpoints preserves one semantic result', async () => {
  for (const checkpoint of [
    'MINERU_PROCESSED', 'ARTIFACT_ACQUIRED', 'IDENTITY_VERIFIED',
    'DECISION_PREPARED', 'FAMILY_HISTORY_APPENDED', 'DECISION_COMPLETE',
    'FINAL_RESULT_WRITTEN',
  ]) {
    await withRoot(async (baselineRoot) => {
      const baselineStore = createHistoricalEvidenceShadowEpochStore({
        storageRoot: baselineRoot, runId: 'stable-run', now: () => '2026-08-05T01:00:00.000Z',
      });
      const baseline = await runHistoricalEvidenceShadowEpoch(input({ runId: 'stable-run' }), {
        store: baselineStore, ...successfulCandidateDependencies(),
      });

      await withRoot(async (interruptedRoot) => {
        const rawStore = createHistoricalEvidenceShadowEpochStore({
          storageRoot: interruptedRoot, runId: 'stable-run', now: () => '2026-08-05T01:00:00.000Z',
        });
        let interrupted = false;
        const interrupt = () => {
          interrupted = true;
          throw Object.assign(new Error(`interrupted after ${checkpoint}`), { code: 'INTERRUPTED' });
        };
        const wrappedStore = {
          ...rawStore,
          checkpoint: async (state) => {
            const persisted = await rawStore.checkpoint(state);
            if (!interrupted && checkpoint === state.targets['target-1'].checkpoint) interrupt();
            return persisted;
          },
          writeFinal: async (state, report) => {
            const persisted = await rawStore.writeFinal(state, report);
            if (!interrupted && checkpoint === 'FINAL_RESULT_WRITTEN') interrupt();
            return persisted;
          },
          appendFamilyAttempt: async (attempt) => {
            const persisted = await rawStore.appendFamilyAttempt(attempt);
            if (!interrupted && checkpoint === 'FAMILY_HISTORY_APPENDED') interrupt();
            return persisted;
          },
        };
        const counters = {};
        await assert.rejects(() => runHistoricalEvidenceShadowEpoch(input({ runId: 'stable-run' }), {
          store: wrappedStore, ...successfulCandidateDependencies(counters),
        }), new RegExp(checkpoint));
        const resumedStore = createHistoricalEvidenceShadowEpochStore({
          storageRoot: interruptedRoot, runId: 'stable-run', now: () => '2026-08-05T01:00:00.000Z',
        });
        const resumed = await runHistoricalEvidenceShadowEpoch(input({
          runId: 'stable-run', resume: true,
        }), { store: resumedStore, ...successfulCandidateDependencies(counters) });
        assert.equal(resumed.semanticReportSha256, baseline.semanticReportSha256, checkpoint);
        assert.equal(counters.discovery, 1, checkpoint);
        const history = await resumedStore.readFamilyHistory();
        assert.equal(history.attempts.length, 1, checkpoint);
      });
    });
  }
});

test('CLI rejects public, generated, replacement and arbitrary output paths', () => {
  const required = [
    '--manifest-id', 'historical_batch_c454c0c428c9ee818313ecbd',
    '--active-release-id', 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4',
    '--run-id', 'shadow-canary-a', '--storage-root', '/external/evidence',
  ];
  for (const flag of ['--output', '--public-output', '--generated-output', '--replacement-output']) {
    assert.throws(
      () => parseHistoricalEvidenceShadowEpochArgs([...required, flag, '/tmp/out.json']),
      /unknown argument|prohibited/i,
    );
  }
});

test('completed shadow resume skips only the new-execution scale gate', () => {
  const scaleControl = { decision: { allowedManifestId: 'next-manifest' } };
  assert.equal(scaleControlForShadowManifestResolution(false, scaleControl), scaleControl);
  assert.equal(scaleControlForShadowManifestResolution(true, scaleControl), null);
});
