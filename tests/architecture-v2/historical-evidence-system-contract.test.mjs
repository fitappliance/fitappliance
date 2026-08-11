import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  buildHistoricalEvidenceSystemContract,
  validateHistoricalEvidenceSystemContract,
} from '../../src/domain/historical-evidence-system-contract.mjs';
import {
  buildHistoricalEvidenceSystemContractFromRepository,
} from '../../scripts/architecture-v2/build-historical-evidence-system-contract.mjs';

const RELEASE_ID = 'historical-evidence-release-test';
const GENERATED_AT = '2026-07-19T20:00:00.000Z';
const execFileAsync = promisify(execFile);

function sourceStage(overrides = {}) {
  const semanticPayload = { records: [{ referenceId: 'historical_a' }] };
  return {
    id: 'released-source-projection',
    artifactKey: 'historicalApplianceReference',
    artifactPath: 'data/architecture-v2/generated/historical-appliance-reference.json',
    owner: 'scripts/architecture-v2/build-historical-appliance-reference.mjs',
    producerInputs: [{
      path: 'src/domain/historical-appliance-reference.mjs',
      content: 'source-producer-v1',
    }],
    consumers: ['tracked-next-queue'],
    schemaVersion: 1,
    payload: {
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      ...semanticPayload,
    },
    semanticPayload,
    declaredSemanticSha256: canonicalJsonSha256(semanticPayload),
    sourceBindings: [],
    releaseEpoch: 1,
    releaseState: 'RELEASED',
    lifecycleVisibility: ['HISTORICAL_INPUT'],
    nextTransitions: ['tracked-next-queue'],
    ...overrides,
  };
}

function queueStage(source, overrides = {}) {
  const semanticPayload = { targets: [{ referenceId: 'historical_a' }] };
  return {
    id: 'tracked-next-queue',
    artifactKey: 'historicalExecutableEvidenceRecoveryQueue',
    artifactPath: 'data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json',
    owner: 'scripts/architecture-v2/build-historical-executable-recovery-queue.mjs',
    producerInputs: [{
      path: 'src/domain/historical-executable-recovery-queue.mjs',
      content: 'queue-producer-v1',
    }],
    consumers: [],
    schemaVersion: 2,
    payload: {
      schemaVersion: 2,
      generatedAt: GENERATED_AT,
      ...semanticPayload,
    },
    semanticPayload,
    declaredSemanticSha256: canonicalJsonSha256(semanticPayload),
    sourceBindings: [{
      sourceStageId: source.id,
      digestKind: 'semantic',
      declaredSha256: canonicalJsonSha256(source.semanticPayload),
    }],
    releaseDependencies: [source.id],
    releaseEpoch: 1,
    releaseState: 'RELEASED',
    lifecycleVisibility: ['CONTROL_ONLY'],
    nextTransitions: [],
    ...overrides,
  };
}

function contractInput(overrides = {}) {
  const source = sourceStage();
  return {
    generatedAt: GENERATED_AT,
    releaseId: RELEASE_ID,
    producerInputs: [
      { path: 'src/domain/historical-evidence-system-contract.mjs', content: 'contract-v1' },
      { path: 'scripts/architecture-v2/build-historical-evidence-system-contract.mjs', content: 'builder-v1' },
    ],
    stages: [source, queueStage(source)],
    epochs: [
      {
        id: 'identity-registry',
        owner: 'src/domain/canonical-product.mjs',
        inputs: [{ path: 'src/domain/canonical-product.mjs', content: 'identity-v1' }],
      },
      {
        id: 'receipt-policy',
        owner: 'src/domain/historical-evidence-recovery-contract.mjs',
        inputs: [{ path: 'data/architecture-v2/policies/historical-evidence-recovery-policy.json', content: '{"version":1}' }],
      },
    ],
    baseline: {
      historicalReferences: 8089,
      currentProducts: 3515,
      receiptBoundVerifiedFit: 0,
    },
    controllerDecision: {
      decision: 'STOP_LOW_YIELD',
      scope: 'dishwasher / Esatto / BOUNDED_DISCOVERY',
    },
    ...overrides,
  };
}

test('system contract is deterministic and validates recomputed artifact and epoch digests', () => {
  const first = buildHistoricalEvidenceSystemContract(contractInput());
  const second = buildHistoricalEvidenceSystemContract(contractInput());

  assert.deepEqual(second, first);
  assert.equal(validateHistoricalEvidenceSystemContract(first), first);
  assert.match(first.semanticContractSha256, /^[a-f0-9]{64}$/);
  assert.match(first.producerSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.stages[0].declaredSemanticSha256, first.stages[0].semanticSha256);
  assert.equal(first.stages[1].sourceBindings[0].declaredSha256, first.stages[1].sourceBindings[0].resolvedSha256);
  assert.equal(first.epochs.length, 2);
  assert.ok(first.epochs.every((epoch) => /^[a-f0-9]{64}$/.test(epoch.semanticSha256)));
});

test('system contract rejects a mixed-epoch source binding', () => {
  const input = contractInput();
  input.stages[1].sourceBindings[0].declaredSha256 = 'a'.repeat(64);

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /mixed epoch.*tracked-next-queue.*released-source-projection/i,
  );
});

test('system contract rejects a missing source hash', () => {
  const input = contractInput();
  delete input.stages[1].sourceBindings[0].declaredSha256;

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /source hash required.*tracked-next-queue/i,
  );
});

test('system contract rejects duplicate artifact ownership', () => {
  const input = contractInput();
  input.stages[1].artifactKey = input.stages[0].artifactKey;

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /duplicate artifact owner.*historicalApplianceReference/i,
  );
});

test('system contract rejects an unknown consumer', () => {
  const input = contractInput();
  input.stages[0].consumers.push('missing-consumer');

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /unknown consumer.*missing-consumer/i,
  );
});

test('system contract rejects a cyclic release dependency', () => {
  const input = contractInput();
  input.stages[0].releaseDependencies = ['tracked-next-queue'];

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /cyclic release dependency/i,
  );
});

test('system contract rejects a released queue newer than its source projection', () => {
  const input = contractInput();
  input.stages[1].releaseEpoch = 2;

  assert.throws(
    () => buildHistoricalEvidenceSystemContract(input),
    /released queue epoch 2.*source projection epoch 1/i,
  );
});

test('system contract permits a separately marked next-epoch pending queue', () => {
  const input = contractInput();
  input.stages[1].releaseEpoch = 2;
  input.stages[1].releaseState = 'PENDING_NEXT';

  const contract = buildHistoricalEvidenceSystemContract(input);
  assert.equal(contract.stages[1].releaseState, 'PENDING_NEXT');
});

test('system contract validator rejects contract tampering', () => {
  const contract = buildHistoricalEvidenceSystemContract(contractInput());
  contract.baseline.currentProducts += 1;

  assert.throws(
    () => validateHistoricalEvidenceSystemContract(contract),
    /semantic contract SHA-256 mismatch/i,
  );
});

test('system contract validator rejects a tampered source binding even after re-signing', () => {
  const contract = buildHistoricalEvidenceSystemContract(contractInput());
  contract.stages[1].sourceBindings[0].resolvedSha256 = 'b'.repeat(64);
  const { contractId, semanticContractSha256, ...semantic } = contract;
  void contractId;
  void semanticContractSha256;
  const resignedSha256 = canonicalJsonSha256(semantic);
  contract.semanticContractSha256 = resignedSha256;
  contract.contractId = `historical_evidence_system_${resignedSha256.slice(0, 24)}`;

  assert.throws(
    () => validateHistoricalEvidenceSystemContract(contract),
    /contract source binding mismatch/i,
  );
});

test('tracked system contract replays from repository sources without external storage', async () => {
  const tracked = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/historical-evidence-system-contract.json',
    'utf8',
  ));
  const first = await buildHistoricalEvidenceSystemContractFromRepository();
  const second = await buildHistoricalEvidenceSystemContractFromRepository();
  const shadow = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/retail-lifecycle-shadow.json',
    'utf8',
  ));
  const refresh = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory.json',
    'utf8',
  ));
  const targetState = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/historical-evidence-target-state.json',
    'utf8',
  ));
  const acquisitionQueueArtifact = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/historical-model-pdf-acquisition-queue.json',
    'utf8',
  ));
  const targetStateSourceFiles = {
    classificationSha256: 'data/architecture-v2/generated/historical-model-evidence-classification.json',
    acquisitionQueueSha256: 'data/architecture-v2/reviews/automated/historical-model-pdf-acquisition-queue.json',
    executableQueueSha256: 'data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json',
    acceptanceBundleSha256: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
    attemptLedgerSha256: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-attempt-ledger.json',
  };

  assert.deepEqual(first, tracked);
  assert.deepEqual(second, first);
  assert.equal(targetState.schemaVersion, 2);
  for (const [binding, path] of Object.entries(targetStateSourceFiles)) {
    const bytes = await readFile(path);
    assert.equal(targetState.sourceBindings[binding], createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(first.stages.length, 37);
  assert.equal(first.epochs.length, 10);
  assert.ok(first.stages.every((stage) => stage.sourceBindings.every((binding) => (
    binding.declaredSha256 === binding.resolvedSha256
  ))));
  assert.equal(first.baseline.historicalModelReferences, 8087);
  assert.equal(first.baseline.currentProducts, 3513);
  assert.equal(first.baseline.retailerLinksRequiringObservationMigration, 0);
  assert.equal(first.baseline.retailerObservationBaselineLinks, 1442);
  assert.equal(first.baseline.retailerObservationAccountedLinks, 1442);
  assert.equal(first.controllerDecision.status, 'RUN_P0');
  const observationStage = first.stages.find((stage) => stage.id === 'retailer-observations');
  const canonicalIdentity = first.stages.find((stage) => stage.id === 'canonical-identity');
  const canonicalIdentityCandidate = first.stages.find(
    (stage) => stage.id === 'canonical-identity-migration-candidate',
  );
  const currentPublication = first.stages.find((stage) => stage.id === 'current-publication');
  const lifecycleShadow = first.stages.find((stage) => stage.id === 'retail-lifecycle-shadow');
  const lifecycleRefresh = first.stages.find((stage) => stage.id === 'retail-lifecycle-refresh');
  const candidateRelease = first.stages.find((stage) => stage.id === 'candidate-release-gate');
  const acquisitionQueue = first.stages.find((stage) => stage.id === 'candidate-acquisition-queue');
  const sourceDocuments = first.stages.find((stage) => stage.id === 'source-document-registry');
  const recoveryQueue = first.stages.find((stage) => stage.id === 'source-recovery-queue');
  const activeRelease = first.stages.find((stage) => stage.id === 'active-release-recovery');
  const classification = first.stages.find((stage) => stage.id === 'classification');
  const dimensionKnowledge = first.stages.find((stage) => stage.id === 'mineru-knowledge');
  const documentIdentity = first.stages.find((stage) => stage.id === 'document-identity');
  const parserGap = first.stages.find((stage) => stage.id === 'parser-gap-priority');
  const replacementAudit = first.stages.find((stage) => stage.id === 'historical-replacement-publication');
  const fitAudit = first.stages.find((stage) => stage.id === 'fit-publication');
  assert.equal(activeRelease.artifactKey, 'historicalRecoveryActiveReleaseAudit');
  for (const stage of [recoveryQueue, classification, dimensionKnowledge, documentIdentity,
    acquisitionQueue, replacementAudit, fitAudit]) {
    assert.ok(stage.releaseDependencies.includes(activeRelease.id));
    assert.ok(!stage.releaseDependencies.includes('lifecycle-reduction'));
    assert.ok(!stage.releaseDependencies.includes('current-publication'));
  }
  assert.deepEqual(recoveryQueue.releaseDependencies.sort(), [
    activeRelease.id,
    sourceDocuments.id,
  ].sort());
  assert.deepEqual(dimensionKnowledge.releaseDependencies, [activeRelease.id]);
  assert.deepEqual(classification.releaseDependencies.sort(), [
    activeRelease.id,
    dimensionKnowledge.id,
    recoveryQueue.id,
    'receipt-reconciliation',
    'receipt-replay',
  ].sort());
  assert.deepEqual(documentIdentity.releaseDependencies.sort(), [
    activeRelease.id,
    classification.id,
    dimensionKnowledge.id,
  ].sort());
  assert.deepEqual(parserGap.releaseDependencies.sort(), [
    classification.id,
    dimensionKnowledge.id,
    documentIdentity.id,
  ].sort());
  assert.equal(
    acquisitionQueue.declaredSemanticSha256,
    acquisitionQueueArtifact.semanticQueueSha256,
  );
  assert.equal(
    acquisitionQueueArtifact.activeReleaseSourceBinding.releaseCandidateId,
    'retail_lifecycle_release_30f746d33cd37b95496a9036',
  );
  assert.deepEqual(canonicalIdentity.releaseDependencies, []);
  assert.deepEqual(canonicalIdentity.lifecycleVisibility, ['CURRENT_INPUT', 'HISTORICAL_INPUT']);
  assert.deepEqual(canonicalIdentityCandidate.releaseDependencies, [
    'canonical-identity',
    'retailer-identity-migration',
  ]);
  assert.deepEqual(canonicalIdentityCandidate.lifecycleVisibility, ['CONTROL_ONLY']);
  assert.ok(currentPublication.releaseDependencies.includes('canonical-identity'));
  assert.ok(!currentPublication.releaseDependencies.includes('canonical-identity-migration-candidate'));
  assert.deepEqual(observationStage.releaseDependencies, ['retailer-identity-migration']);
  assert.deepEqual(lifecycleShadow.releaseDependencies, [
    'current-publication',
    'official-market-lifecycle',
    'retailer-observations',
  ]);
  assert.deepEqual([...lifecycleRefresh.releaseDependencies].sort(), [
    'retailer-observation-coverage',
    'retail-lifecycle-shadow',
    'retailer-identity-migration',
  ].sort());
  assert.equal(first.baseline.lifecycleShadowStatus, shadow.cutover.status);
  assert.equal(
    first.baseline.lifecycleShadowUnresolvedLegacyCurrentProducts,
    shadow.cutover.unresolvedLegacyCurrentIds.length,
  );
  assert.equal(first.baseline.lifecycleRefreshProducts, refresh.summary.products);
  assert.equal(
    first.baseline.lifecycleRefreshAuthorizedProducts,
    refresh.summary.byExecutionDisposition.RUNNABLE_AUTHORIZED_SOURCE ?? 0,
  );
  assert.equal(
    first.baseline.lifecycleRefreshCanaryProducts,
    refresh.summary.byExecutionDisposition.BOUNDED_CANARY_ONLY ?? 0,
  );
  assert.equal(
    first.baseline.lifecycleRefreshPolicyReviewedProducts,
    refresh.summary.byExecutionDisposition.RUNNABLE_POLICY_REVIEWED_SOURCE ?? 0,
  );
  assert.equal(
    first.baseline.lifecycleRefreshPolicyBlockedProducts,
    refresh.summary.byExecutionDisposition.BLOCKED_BY_SOURCE_POLICY ?? 0,
  );
  assert.equal(
    first.baseline.knownContractGaps.some((gap) => gap.id === 'LIFECYCLE_SHADOW_BLOCKED_FROM_CUTOVER'),
    shadow.cutover.status === 'BLOCKED',
  );
  assert.equal(candidateRelease, undefined);
  assert.equal(first.baseline.candidateMaterializationStatus, 'NOT_MATERIALIZED_BLOCKED');
  assert.equal(first.baseline.candidateReleaseAuthorizationStatus, 'BLOCKED_NOT_MATERIALIZED');
  for (const field of [
    'candidateReleaseId',
    'candidateUnresolvedLegacyCurrentProducts',
    'candidateUnsafeRemovedLegacyCurrentProducts',
    'candidateRefreshProducts',
    'candidateFitPublicationViolations',
    'candidateRollbackStatus',
  ]) assert.equal(first.baseline[field], null);
  assert.equal(
    first.baseline.knownContractGaps.some((gap) => gap.id === 'LIFECYCLE_CANDIDATE_NOT_MATERIALIZED'),
    true,
  );
  assert.equal(
    first.baseline.knownContractGaps.some((gap) => gap.id === 'PARTIAL_REPOSITORY_BUILD_GRAPH'),
    false,
  );
  assert.equal(
    first.baseline.knownContractGaps.some((gap) => gap.id === 'TARGET_STATE_LEGACY_TIME_BINDINGS'),
    false,
  );
  assert.doesNotMatch(JSON.stringify(first), /\/Volumes\/|FITAPPLIANCE_STORAGE_ROOT/);
});

test('repository system-contract builder rejects a stale active-release audit artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-stale-active-audit-'));
  try {
    await execFileAsync('cp', ['-al', resolve('data'), join(root, 'data')]);
    await Promise.all([
      symlink(resolve('src'), join(root, 'src'), 'dir'),
      symlink(resolve('scripts'), join(root, 'scripts'), 'dir'),
      symlink(resolve('tests'), join(root, 'tests'), 'dir'),
    ]);
    const auditPath = join(
      root,
      'data/architecture-v2/reviews/automated/historical-recovery-active-release-audit.json',
    );
    const stale = JSON.parse(await readFile(auditPath, 'utf8'));
    stale.summary.issues += 1;
    const replacement = `${auditPath}.stale`;
    await writeFile(replacement, `${JSON.stringify(stale, null, 2)}\n`);
    await rename(replacement, auditPath);

    await assert.rejects(
      buildHistoricalEvidenceSystemContractFromRepository({ root }),
      /active.release audit.*replay|active.release audit.*stale/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository system-contract builder independently replays the source recovery queue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-stale-source-queue-'));
  try {
    await execFileAsync('cp', ['-al', resolve('data'), join(root, 'data')]);
    await Promise.all([
      symlink(resolve('src'), join(root, 'src'), 'dir'),
      symlink(resolve('scripts'), join(root, 'scripts'), 'dir'),
      symlink(resolve('tests'), join(root, 'tests'), 'dir'),
    ]);
    const queuePath = join(
      root,
      'data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json',
    );
    const stale = JSON.parse(await readFile(queuePath, 'utf8'));
    stale.summary.targets += 1;
    const replacement = `${queuePath}.stale`;
    await writeFile(replacement, `${JSON.stringify(stale, null, 2)}\n`);
    await rename(replacement, queuePath);

    await assert.rejects(
      buildHistoricalEvidenceSystemContractFromRepository({ root }),
      /source recovery queue.*replay/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository system-contract builder rejects a self-rehashed parser-gap queue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-stale-parser-gap-'));
  try {
    await execFileAsync('cp', ['-al', resolve('data'), join(root, 'data')]);
    await Promise.all([
      symlink(resolve('src'), join(root, 'src'), 'dir'),
      symlink(resolve('scripts'), join(root, 'scripts'), 'dir'),
      symlink(resolve('tests'), join(root, 'tests'), 'dir'),
    ]);
    const queuePath = join(
      root,
      'data/architecture-v2/reviews/automated/historical-parser-gap-priority.json',
    );
    const stale = JSON.parse(await readFile(queuePath, 'utf8'));
    stale.summary.rows += 1;
    stale.semanticQueueSha256 = canonicalJsonSha256({
      schemaVersion: stale.schemaVersion,
      policy: stale.policy,
      sourceBindings: stale.sourceBindings,
      summary: stale.summary,
      selectedFamilyId: stale.selectedFamilyId,
      rows: stale.rows,
    });
    const replacement = `${queuePath}.stale`;
    await writeFile(replacement, `${JSON.stringify(stale, null, 2)}\n`);
    await rename(replacement, queuePath);

    await assert.rejects(
      buildHistoricalEvidenceSystemContractFromRepository({ root }),
      /parser gap priority.*replay/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
