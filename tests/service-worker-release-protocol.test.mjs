import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  createApplicationGenerationManifest,
  createApplicationSourceManifest,
  createWorkerGenerationReceipt,
  evaluateGenerationHandshake,
  planCacheRetention,
  validateB3WorkerComposition,
  validateWorkerGenerationReceipt,
} from '../src/domain/service-worker-release-protocol.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const HASHES = Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => [letter, hash(letter)]));

function assertCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

function sourceInput(overrides = {}) {
  return {
    sources: [
      { path: 'index.html', sha256: HASHES.a },
      { path: 'public/scripts/fit-engine.js', sha256: HASHES.b },
    ],
    ...overrides,
  };
}

function generationInput(applicationSourceId, overrides = {}) {
  return {
    applicationSourceId,
    staticPublicationAuthorizationId: HASHES.c,
    activeRetailReleaseId: HASHES.d,
    fitArtifactIds: [HASHES.f, HASHES.e],
    cacheProtocolVersion: 'fit-cache/v2',
    predecessorCaptureId: HASHES.g,
    predecessorCacheVersion: 'generation-predecessor',
    ...overrides,
  };
}

function receiptInput(applicationSourceId, applicationGenerationId, overrides = {}) {
  return {
    staticPublicationAuthorizationId: HASHES.c,
    toolchainContractSha256: HASHES.h,
    applicationSourceId,
    applicationGenerationId,
    activeRetailReleaseId: HASHES.d,
    worker: { path: 'public/service-worker.js', sha256: HASHES.i },
    producer: { path: 'scripts/deployment/generate-release-worker.mjs', sha256: HASHES.j },
    tools: [{ path: 'src/domain/service-worker-release-protocol.mjs', sha256: HASHES.k }],
    inputs: [{ path: 'fixtures/service-worker-template.js', sha256: HASHES.l }],
    cacheProtocolVersion: 'fit-cache/v2',
    predecessorCaptureId: HASHES.g,
    predecessorCacheVersion: 'generation-predecessor',
    cacheCoverageManifestId: HASHES.m,
    ...overrides,
  };
}

function fixture() {
  const source = createApplicationSourceManifest(sourceInput());
  const generation = createApplicationGenerationManifest(generationInput(source.applicationSourceId));
  const receiptBindings = receiptInput(source.applicationSourceId, generation.applicationGenerationId);
  const receipt = createWorkerGenerationReceipt(receiptBindings);
  return { source, generation, receiptBindings, receipt };
}

test('applicationSourceId binds the canonical exact pre-stamp path/hash rows', () => {
  const forward = createApplicationSourceManifest(sourceInput());
  const reverse = createApplicationSourceManifest({ sources: [...sourceInput().sources].reverse() });

  assert.equal(forward.schemaVersion, 1);
  assert.equal(forward.applicationSourceId, reverse.applicationSourceId);
  assert.deepEqual(forward.sources.map((row) => row.path), ['index.html', 'public/scripts/fit-engine.js']);
  assert.notEqual(
    createApplicationSourceManifest(sourceInput({ sources: [{ path: 'index.html', sha256: HASHES.n }, sourceInput().sources[1]] })).applicationSourceId,
    forward.applicationSourceId,
  );
});

test('application source rejects the tracked worker, collisions, malformed hashes and supplied IDs', () => {
  assert.throws(() => createApplicationSourceManifest(sourceInput({
    sources: [...sourceInput().sources, { path: 'public/service-worker.js', sha256: HASHES.o }],
  })), assertCode('APPLICATION_SOURCE_WORKER_FORBIDDEN'));
  assert.throws(() => createApplicationSourceManifest({
    sources: [
      { path: 'public/\uff21.js', sha256: HASHES.a },
      { path: 'public/a.js', sha256: HASHES.b },
    ],
  }), assertCode('APPLICATION_SOURCE_PATH_COLLISION'));
  assert.throws(() => createApplicationSourceManifest(sourceInput({
    sources: [{ path: 'index.html', sha256: 'ABC123' }],
  })), assertCode('HASH_INVALID'));
  assert.throws(() => createApplicationSourceManifest({
    ...sourceInput(), applicationSourceId: HASHES.p,
  }), assertCode('SCHEMA_KEYS_INVALID'));
});

test('application source rejects unsafe paths and non-NFC strings', () => {
  assert.throws(() => createApplicationSourceManifest({ sources: [{ path: '../index.html', sha256: HASHES.a }] }), assertCode('PATH_INVALID'));
  assert.throws(() => createApplicationSourceManifest({ sources: [{ path: 'public/Cafe\u0301.js', sha256: HASHES.a }] }), assertCode('STRING_NOT_NFC'));
});

test('applicationGenerationId binds the closed release manifest and sorts Fit artifact IDs', () => {
  const source = createApplicationSourceManifest(sourceInput());
  const first = createApplicationGenerationManifest(generationInput(source.applicationSourceId));
  const second = createApplicationGenerationManifest(generationInput(source.applicationSourceId, {
    fitArtifactIds: [...generationInput(source.applicationSourceId).fitArtifactIds].reverse(),
  }));

  assert.equal(first.applicationGenerationId, second.applicationGenerationId);
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.fitArtifactIds, [HASHES.e, HASHES.f].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
  for (const key of [
    'applicationSourceId', 'staticPublicationAuthorizationId', 'activeRetailReleaseId',
    'cacheProtocolVersion', 'predecessorCaptureId', 'predecessorCacheVersion',
  ]) {
    const changed = key.endsWith('Id') ? HASHES.q : `${first[key]}-changed`;
    assert.notEqual(
      createApplicationGenerationManifest(generationInput(source.applicationSourceId, { [key]: changed })).applicationGenerationId,
      first.applicationGenerationId,
      key,
    );
  }
  assert.notEqual(
    createApplicationGenerationManifest(generationInput(source.applicationSourceId, { fitArtifactIds: [HASHES.e, HASHES.r] })).applicationGenerationId,
    first.applicationGenerationId,
  );
});

test('application generation rejects missing predecessor, duplicate artifacts and marker-stamped output bytes', () => {
  const { applicationSourceId } = createApplicationSourceManifest(sourceInput());
  assert.throws(() => createApplicationGenerationManifest({
    ...generationInput(applicationSourceId), predecessorCaptureId: '',
  }), assertCode('IDENTITY_INVALID'));
  assert.throws(() => createApplicationGenerationManifest(generationInput(applicationSourceId, {
    fitArtifactIds: [HASHES.e, HASHES.e],
  })), assertCode('FIT_ARTIFACT_DUPLICATE'));
  assert.throws(() => createApplicationGenerationManifest({
    ...generationInput(applicationSourceId), markerStampedOutputSha256: HASHES.s,
  }), assertCode('SCHEMA_KEYS_INVALID'));
  assert.throws(() => createApplicationGenerationManifest({
    ...generationInput(applicationSourceId), applicationGenerationId: HASHES.t,
  }), assertCode('SCHEMA_KEYS_INVALID'));
});

test('workerGenerationReceiptId binds every release and generation input', () => {
  const { receiptBindings, receipt } = fixture();
  assert.equal(receipt.schemaVersion, 1);
  const mutations = {
    staticPublicationAuthorizationId: HASHES.n,
    toolchainContractSha256: HASHES.o,
    applicationSourceId: HASHES.p,
    applicationGenerationId: HASHES.q,
    activeRetailReleaseId: HASHES.r,
    worker: { ...receiptBindings.worker, sha256: HASHES.s },
    producer: { ...receiptBindings.producer, sha256: HASHES.t },
    tools: [{ ...receiptBindings.tools[0], sha256: HASHES.u }],
    inputs: [{ ...receiptBindings.inputs[0], sha256: HASHES.v }],
    cacheProtocolVersion: 'fit-cache/v3',
    predecessorCaptureId: HASHES.w,
    predecessorCacheVersion: 'different-predecessor',
    cacheCoverageManifestId: HASHES.x,
  };

  for (const [key, value] of Object.entries(mutations)) {
    assert.notEqual(createWorkerGenerationReceipt({ ...receiptBindings, [key]: value }).workerGenerationReceiptId, receipt.workerGenerationReceiptId, key);
  }
});

test('worker receipt validation rejects stale and cross-build pairings', () => {
  const { receiptBindings, receipt } = fixture();
  assert.equal(validateWorkerGenerationReceipt(receipt, receiptBindings), true);
  assert.throws(
    () => validateWorkerGenerationReceipt(receipt, { ...receiptBindings, staticPublicationAuthorizationId: HASHES.y }),
    assertCode('WORKER_RECEIPT_BINDING_MISMATCH'),
  );
  assert.throws(
    () => validateWorkerGenerationReceipt({ ...receipt, workerGenerationReceiptId: HASHES.z }, receiptBindings),
    assertCode('WORKER_RECEIPT_ID_INVALID'),
  );
  assert.throws(
    () => validateWorkerGenerationReceipt({ ...receipt, schemaVersion: 2 }, receiptBindings),
    assertCode('SCHEMA_VERSION_INVALID'),
  );
  assert.throws(
    () => createWorkerGenerationReceipt({
      ...receiptBindings,
      tools: [receiptBindings.tools[0], { ...receiptBindings.tools[0], sha256: HASHES.y }],
    }),
    assertCode('BINDING_PATH_COLLISION'),
  );
});

test('B3 composition requires the exact generated worker receipt and bytes', () => {
  const { receiptBindings, receipt } = fixture();
  const composition = {
    workerReceipt: receipt,
    expectedBindings: receiptBindings,
    stagedWorker: { ...receipt.worker },
    trackedWitness: { path: 'public/service-worker.js', sha256: HASHES.z },
  };

  assert.equal(validateB3WorkerComposition(composition), true);
  assert.throws(() => validateB3WorkerComposition({ ...composition, workerReceipt: null }), assertCode('WORKER_RECEIPT_REQUIRED'));
  assert.throws(() => validateB3WorkerComposition({
    ...composition, stagedWorker: { ...composition.stagedWorker, path: 'public/other-worker.js' },
  }), assertCode('B3_WORKER_MISMATCH'));
  assert.throws(() => validateB3WorkerComposition({
    ...composition, stagedWorker: { ...composition.stagedWorker, sha256: HASHES.y },
  }), assertCode('B3_WORKER_MISMATCH'));
  assert.throws(() => validateB3WorkerComposition({
    ...composition, trackedWitness: { ...composition.trackedWitness, sha256: receipt.worker.sha256 },
  }), assertCode('TRACKED_WORKER_WITNESS_REUSED'));
  assert.throws(() => validateB3WorkerComposition({
    ...composition,
    expectedBindings: { ...receiptBindings, cacheCoverageManifestId: HASHES.y },
  }), assertCode('WORKER_RECEIPT_BINDING_MISMATCH'));
});

test('generation handshake enables Fit only for matching page, worker and resource generations', () => {
  const generationId = HASHES.a;
  assert.deepEqual(evaluateGenerationHandshake({
    pageGenerationId: generationId,
    workerGenerationId: generationId,
    resourceGenerationIds: [generationId, generationId],
  }), { fitEnabled: true, reason: 'GENERATION_MATCH' });

  for (const input of [
    { pageGenerationId: '', workerGenerationId: generationId, resourceGenerationIds: [generationId] },
    { pageGenerationId: generationId, workerGenerationId: '', resourceGenerationIds: [generationId] },
    { pageGenerationId: generationId, workerGenerationId: generationId, resourceGenerationIds: [] },
    { pageGenerationId: generationId, workerGenerationId: HASHES.b, resourceGenerationIds: [generationId] },
    { pageGenerationId: generationId, workerGenerationId: generationId, resourceGenerationIds: [HASHES.b] },
  ]) {
    assert.equal(evaluateGenerationHandshake(input).fitEnabled, false);
  }
});

test('cache retention preserves current and predecessor FitAppliance caches only', () => {
  const cacheNames = [
    'fitappliance-app-shell-current', 'fitappliance-static-current', 'fitappliance-data-current',
    'fitappliance-app-shell-predecessor', 'fitappliance-static-predecessor', 'fitappliance-data-predecessor',
    'fitappliance-app-shell-old', 'fitappliance-static-old', 'fitappliance-data-old',
    'third-party-cache', 'app-shell-old', 'static-third-party', 'data-other-app',
  ];
  assert.deepEqual(planCacheRetention({
    cacheNames,
    currentCacheVersion: 'current',
    predecessorCacheVersion: 'predecessor',
    installSucceeded: true,
    activationSucceeded: true,
  }), {
    retainCacheNames: [
      'fitappliance-app-shell-current', 'fitappliance-app-shell-predecessor',
      'fitappliance-data-current', 'fitappliance-data-predecessor',
      'fitappliance-static-current', 'fitappliance-static-predecessor',
    ],
    deleteCacheNames: ['fitappliance-app-shell-old', 'fitappliance-data-old', 'fitappliance-static-old'],
  });
});

test('cache retention returns no deletion plan after failed install or activation', () => {
  const base = {
    cacheNames: [
      'fitappliance-app-shell-current',
      'fitappliance-app-shell-predecessor',
      'fitappliance-app-shell-old',
      'third-party-cache',
    ],
    currentCacheVersion: 'current',
    predecessorCacheVersion: 'predecessor',
  };
  for (const state of [
    { installSucceeded: false, activationSucceeded: false },
    { installSucceeded: true, activationSucceeded: false },
  ]) {
    assert.deepEqual(planCacheRetention({ ...base, ...state }).deleteCacheNames, []);
  }
  assert.throws(
    () => planCacheRetention({ ...base, installSucceeded: false, activationSucceeded: true }),
    assertCode('CACHE_STATE_INVALID'),
  );
  assert.throws(
    () => planCacheRetention({ ...base, currentCacheVersion: 'bad/version', installSucceeded: true, activationSucceeded: true }),
    assertCode('CACHE_VERSION_INVALID'),
  );
});
