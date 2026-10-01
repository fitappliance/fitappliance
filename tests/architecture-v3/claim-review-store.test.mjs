import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import * as storeApi from '../../src/domain/architecture-v3/claim-review-store.mjs';
import { createEvidenceClaimV3 } from '../../src/domain/architecture-v3/evidence-claim-v3.mjs';
import { createArtifactRecord, createFragment } from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';

const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse),
]);
const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
const hash = (value) => createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');

function claimFixture(productDigit = '1') {
  const canonicalProductId = `fa_prod_${productDigit.repeat(24)}`;
  const sourceArtifactSha256 = 'a'.repeat(64);
  const content = { kind: 'fixture', text: 'DW60UT4I2 Overall width: 600 mm' };
  const locator = { kind: 'json_pointer', pointer: '/claims/0' };
  const fragmentSha256 = hash({
    schemaVersion: 1, canonicalizationVersion: 'fit-evidence-json-v3-1',
    fragmentIdentityDomain: 'fitappliance.fragment.v1', content, parentArtifactSha256: sourceArtifactSha256, locator,
  });
  const fragment = createFragment({ fragmentSha256, content, parentArtifactSha256: sourceArtifactSha256, locator });
  const validationInputs = {
    semantics,
    witnessedConditions: [{
      canonicalProductId, market: 'AU', configurationKey: 'underbench_worktop_removed',
      conditions: [
        { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
        { parameter: 'worktop', operator: 'eq', value: 'removed' },
      ],
      applicability: 'conditional', membership: 'exact_product_market',
    }],
    artifactRecords: [createArtifactRecord({ sha256: sourceArtifactSha256, parentSha256: null,
      mediaType: 'application/pdf', toolRevision: null, optionsSha256: null })],
    fragments: [fragment],
  };
  const claim = createEvidenceClaimV3({
    subject: { canonicalProductId, market: 'AU' }, field: 'closedEnvelope.widthMm',
    value: { kind: 'fixed', value: 600, unit: 'mm' },
    semantics: { axis: 'width', measurementScope: 'product_closed_external',
      inclusions: { door: 'unknown', handle: 'unknown' }, applicability: 'required' },
    context: { configurationKey: 'underbench_worktop_removed',
      conditions: validationInputs.witnessedConditions[0].conditions,
      referenceDatum: 'envelope_extent', operatingState: { kind: 'closed', angleDegrees: null } },
    sourceRepresentation: { kind: 'named_scalar', label: 'Overall width', labelAnchorId: 'label',
      value: 600, valueAnchorId: 'value', sourceUnit: 'mm', unitAnchorId: 'unit' },
    evidence: { sourceArtifactSha256, anchors: [
      { anchorId: 'value', role: 'value', fragmentSha256 },
      { anchorId: 'unit', role: 'unit', fragmentSha256 },
      { anchorId: 'label', role: 'legend', fragmentSha256 },
      { anchorId: 'subject', role: 'subject', fragmentSha256 },
    ], relations: [] },
    applicabilityProof: { kind: 'EXACT_MODEL', namedModels: [{ canonicalProductId, model: 'DW60UT4I2' }],
      relationshipAssertionIds: [] },
    semanticPolicySha256: semantics.semanticPolicySha256,
    extractionProfileSha256: 'b'.repeat(64), derivedFromClaimId: null, validationInputs,
  });
  return { claim, validationInputs };
}

const primary = claimFixture();
function decisionInput(overrides = {}, resolved = primary) {
  return { ...resolved, state: 'admitted', reason: { code: 'evidence_reviewed', scope: 'closedEnvelope.widthMm' },
    policyId: 'review-policy-v1', policySha256: 'c'.repeat(64), actor: 'fixture-reviewer',
    decidedAt: '2026-09-30T12:00:00.000Z', idempotencyKey: 'review-width-1',
    supersedesDecisionIds: [], forkResolution: false, ...overrides };
}
const NOW = '2026-09-30T12:00:00.000Z';
const POLICY = { policyId: 'review-policy-v1', policySha256: 'c'.repeat(64) };
async function localStore(t, options = {}) {
  const storeRoot = await fs.mkdtemp(join(tmpdir(), 'g5a-store-'));
  t.after(() => fs.rm(storeRoot, { recursive: true, force: true }));
  return storeApi.createClaimReviewStore({ storeRoot, clock: () => NOW, ...options });
}
function batchObject(value, namespace = 'legacy-upgrades') {
  return { namespace, sha256: hash(value), value };
}
function manifest(objects, reviewDecisionIds = []) {
  return { schemaVersion: 1, manifestDomain: 'fit-immutable-evidence-batch-v1',
    objectRefs: objects.map(({ namespace, sha256 }) => ({ namespace, sha256 })), reviewDecisionIds };
}
function commit(store, key, value, expectedHeadSha256 = store.genesisHeadSha256) {
  const objects = [batchObject(value)];
  return storeApi.commitImmutableEvidenceBatch({ store, namespace: 'legacy-upgrades', objects,
    manifest: manifest(objects), expectedHeadSha256, idempotencyKey: key });
}
async function diskHead(store) {
  const pointer = JSON.parse(await fs.readFile(join(store.storeRoot, 'head.json'), 'utf8'));
  return JSON.parse(await fs.readFile(join(store.storeRoot, 'heads', `${pointer.headSha256}.json`), 'utf8'));
}
function faultIo(when) {
  return { ...fs,
    async open(file, flags, ...rest) {
      const handle = await fs.open(file, flags, ...rest);
      return new Proxy(handle, { get(target, key) {
        const member = Reflect.get(target, key, target);
        if (typeof member !== 'function') return member;
        return async (...args) => {
          await when({ operation: key, file: String(file), flags, phase: 'before' });
          const result = await member.apply(target, args);
          await when({ operation: key, file: String(file), flags, phase: 'after' });
          return result;
        };
      } });
    },
    async rename(from, to) {
      await when({ operation: 'rename', file: String(to), from: String(from), phase: 'before' });
      const result = await fs.rename(from, to);
      await when({ operation: 'rename', file: String(to), from: String(from), phase: 'after' });
      return result;
    },
  };
}
const rejectsCode = (operation, code) => assert.rejects(operation, (error) => error.code === code);

// Missing cumulative merging would discard A when the next namespace commits B.
test('one committed head merges stable A and B across both namespaces', async (t) => {
  const store = await localStore(t);
  const a = await commit(store, 'audit-a', { kind: 'audit', origin: 'a' });
  const prepared = await storeApi.prepareClaimReviewDecisions({ store, decisions: [decisionInput()], expectedHeadSha256: a.headSha256 });
  const b = await storeApi.commitImmutableEvidenceBatch({ store, namespace: 'reviews', objects: prepared.objects,
    manifest: prepared.manifest, expectedHeadSha256: a.headSha256, idempotencyKey: 'reviews-b' });
  const head = await diskHead(store);
  assert.equal(head.objectRefs.length, 3);
  assert.ok(head.objectRefs.some((ref) => ref.namespace === 'legacy-upgrades'));
  const replay = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: NOW, policy: POLICY });
  assert.equal(replay.reviewHeads[0].state, 'admitted');
  assert.equal(replay.headSha256, b.headSha256);
  assert.equal(Object.hasOwn(replay, 'accepted'), false);
  assert.equal(Object.hasOwn(replay, 'public'), false);
});

test('preparing a review validates its explicit basis and writes no files', async (t) => {
  const store = await localStore(t);
  const before = await fs.readdir(store.storeRoot);
  const prepared = await storeApi.prepareClaimReviewDecisions({ store, decisions: [decisionInput()], expectedHeadSha256: store.genesisHeadSha256 });
  assert.deepEqual(await fs.readdir(store.storeRoot), before);
  assert.equal(prepared.basisHeadSha256, store.genesisHeadSha256);
  assert.equal(prepared.events[0].claimId, primary.claim.claimId);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.events[0].reason), true);
});

test('a stale writer fails CAS without advancing the common head', async (t) => {
  const store = await localStore(t);
  const a = await commit(store, 'a', { value: 'a' });
  const stale = await commit(store, 'b', { value: 'b' });
  assert.equal(stale.status, 'STALE_HEAD');
  assert.equal(stale.actualHeadSha256, a.headSha256);
  assert.equal(hash(await diskHead(store)), a.headSha256);
});

test('committed retry returns the original event and head even with a stale expected basis and later clock', async (t) => {
  const store = await localStore(t);
  const input = decisionInput();
  delete input.decidedAt;
  const first = await storeApi.appendClaimReviewDecision({ store, decision: input, expectedHeadSha256: store.genesisHeadSha256 });
  const other = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-10-01T12:00:00.000Z' });
  const retry = await storeApi.appendClaimReviewDecision({ store: other, decision: input, expectedHeadSha256: 'd'.repeat(64) });
  assert.deepEqual(retry, first);
  assert.equal(retry.event.decidedAt, NOW);
  await rejectsCode(() => storeApi.appendClaimReviewDecision({ store: other, decision: { ...input, state: 'rejected' },
    expectedHeadSha256: first.headSha256 }), 'IDEMPOTENCY_CONFLICT');
});

test('shared batch idempotency is global and conflicting payloads cannot reuse a key', async (t) => {
  const store = await localStore(t);
  const first = await commit(store, 'same-key', { value: 1 });
  const later = await commit(store, 'later', { value: 2 }, first.headSha256);
  assert.deepEqual(await commit(store, 'same-key', { value: 1 }, 'd'.repeat(64)), first);
  assert.equal(hash(await diskHead(store)), later.headSha256);
  await rejectsCode(() => commit(store, 'same-key', { value: 3 }, later.headSha256), 'IDEMPOTENCY_CONFLICT');
});

test('shared batch rejects unknown namespaces, mismatched hashes and dangling manifest references', async (t) => {
  const store = await localStore(t);
  const value = batchObject({ value: 1 });
  const base = { store, namespace: 'legacy-upgrades', objects: [value], manifest: manifest([value]),
    expectedHeadSha256: store.genesisHeadSha256, idempotencyKey: 'invalid' };
  await rejectsCode(() => storeApi.commitImmutableEvidenceBatch({ ...base, namespace: 'unknown' }), 'UNKNOWN_NAMESPACE');
  await rejectsCode(() => storeApi.commitImmutableEvidenceBatch({ ...base, objects: [{ ...value, sha256: 'd'.repeat(64) }] }), 'OBJECT_HASH_MISMATCH');
  await rejectsCode(() => storeApi.commitImmutableEvidenceBatch({ ...base, manifest: manifest([{ ...value, sha256: 'd'.repeat(64) }]) }), 'DANGLING_OBJECT_REFERENCE');
  await assert.rejects(fs.readFile(join(store.storeRoot, 'head.json')), { code: 'ENOENT' });
});

test('migration metadata cannot be cast into review decisions or introduce cross-Claim parents', async (t) => {
  const store = await localStore(t);
  const fake = batchObject({ recordType: 'decision', decision: { ...decisionInput(), kind: 'upgrade-audit' } }, 'reviews');
  await assert.rejects(storeApi.commitImmutableEvidenceBatch({ store, namespace: 'legacy-upgrades', objects: [fake],
    manifest: manifest([fake]), expectedHeadSha256: store.genesisHeadSha256, idempotencyKey: 'fake' }));
  const first = await storeApi.appendClaimReviewDecision({ store, decision: decisionInput(), expectedHeadSha256: store.genesisHeadSha256 });
  const other = claimFixture('2');
  await assert.rejects(storeApi.appendClaimReviewDecision({ store,
    decision: decisionInput({ idempotencyKey: 'cross-claim-operation', supersedesDecisionIds: [first.event.decisionId] }, other), expectedHeadSha256: first.headSha256 }),
    /cross.claim|same.claim/u);
});

for (const fault of ['before-object-flush', 'after-object-flush', 'after-object-rename', 'before-head-rename', 'after-head-rename', 'head-directory-flush']) {
  test(`crash recovery preserves the original operation across ${fault}`, async (t) => {
    let fired = false;
    const root = await fs.mkdtemp(join(tmpdir(), 'g5a-store-fault-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const io = faultIo(async ({ operation, file, phase }) => {
      const isObject = file.includes('/objects/') && file.includes('.tmp-');
      const isHead = file === join(root, 'head.json');
      const matches = fault === 'before-object-flush' ? operation === 'sync' && isObject && phase === 'before'
        : fault === 'after-object-flush' ? operation === 'sync' && isObject && phase === 'after'
          : fault === 'after-object-rename' ? operation === 'rename' && file.includes('/objects/') && phase === 'after'
            : fault === 'before-head-rename' ? operation === 'rename' && isHead && phase === 'before'
              : fault === 'after-head-rename' ? operation === 'rename' && isHead && phase === 'after'
                : operation === 'sync' && file === root && phase === 'before' && await fs.stat(join(root, 'head.json')).then(() => true, () => false);
      if (!fired && matches) { fired = true; throw Object.assign(new Error(fault), { code: 'INJECTED_FAULT' }); }
    });
    const store = storeApi.createClaimReviewStore({ storeRoot: root, io, clock: () => NOW });
    const input = decisionInput();
    delete input.decidedAt;
    await rejectsCode(() => storeApi.appendClaimReviewDecision({ store, decision: input, expectedHeadSha256: store.genesisHeadSha256 }), 'INJECTED_FAULT');
    assert.equal(fired, true);
    const recovered = storeApi.createClaimReviewStore({ storeRoot: root, clock: () => '2026-10-01T12:00:00.000Z' });
    const result = await storeApi.appendClaimReviewDecision({ store: recovered, decision: input, expectedHeadSha256: store.genesisHeadSha256 });
    assert.equal(result.event.decidedAt, NOW);
    const retry = await storeApi.appendClaimReviewDecision({ store: recovered, decision: input, expectedHeadSha256: result.headSha256 });
    assert.deepEqual(retry, result);
    const graph = await storeApi.replayClaimReviewHistory({ store: recovered, claimId: primary.claim.claimId,
      asOf: '2026-10-02T12:00:00.000Z', policy: POLICY });
    assert.equal(graph.decisions.length, 1);
  });
}

test('unsupported directory fsync cannot acknowledge a successful batch', async (t) => {
  const io = faultIo(async ({ operation, flags }) => {
    if (operation === 'sync' && flags === 'r') throw Object.assign(new Error('unsupported directory flush'), { code: 'EINVAL' });
  });
  const store = await localStore(t, { io });
  await rejectsCode(() => commit(store, 'no-flush', { value: 1 }), 'EINVAL');
  await assert.rejects(fs.readFile(join(store.storeRoot, 'head.json')), { code: 'ENOENT' });
});

test('corrupted immutable bytes cannot be reused or acknowledged on retry', async (t) => {
  const store = await localStore(t);
  const value = { value: 1 };
  const first = await commit(store, 'original', value);
  await fs.writeFile(join(store.storeRoot, 'objects', 'legacy-upgrades', `${hash(value)}.json`), '{"value":2}');
  await rejectsCode(() => commit(store, 'original', value, first.headSha256), 'OBJECT_HASH_MISMATCH');
});

test('native lock coordinates separate store handles and is never stolen by a later clock', { timeout: 30000 }, async (t) => {
  let release;
  let entered;
  const barrier = new Promise((resolve) => { entered = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  t.signal.addEventListener('abort', () => release(), { once: true });
  let paused = false;
  const io = faultIo(async ({ operation, file, phase }) => {
    if (!paused && operation === 'rename' && file.endsWith('/head.json') && phase === 'before') {
      paused = true; entered(); await held;
    }
  });
  const store = await localStore(t, { io });
  const first = commit(store, 'a', { value: 1 });
  await barrier;
  const other = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2099-01-01T00:00:00.000Z' });
  try { await rejectsCode(() => commit(other, 'b', { value: 2 }), 'WRITER_LOCKED'); }
  finally { release(); }
  assert.equal((await first).status, 'committed');
});

test('replay uses explicit historical time and policy while preserving cumulative review history', async (t) => {
  const store = await localStore(t);
  const first = await storeApi.appendClaimReviewDecision({ store, decision: decisionInput(), expectedHeadSha256: store.genesisHeadSha256 });
  const later = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-09-30T13:00:00.000Z' });
  const second = await storeApi.appendClaimReviewDecision({ store: later, decision: decisionInput({ state: 'rejected',
    idempotencyKey: 'second', decidedAt: '2026-09-30T13:00:00.000Z', supersedesDecisionIds: [first.event.decisionId] }),
    expectedHeadSha256: first.headSha256 });
  const before = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId,
    asOf: '2026-09-30T12:30:00.000Z', policy: POLICY });
  const after = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId,
    asOf: '2026-09-30T13:30:00.000Z', policy: POLICY });
  assert.equal(before.reviewHeads[0].state, 'admitted');
  assert.equal(after.reviewHeads[0].state, 'rejected');
  assert.equal(after.decisions.length, 2);
  assert.equal(hash(await diskHead(store)), second.headSha256);
});

test('batch manifest preserves dependent event order independently of object storage order', async (t) => {
  const { createClaimReviewDecision } = await import('../../src/domain/architecture-v3/claim-review-decision.mjs');
  const store = await localStore(t);
  const firstInput = decisionInput();
  const first = createClaimReviewDecision(firstInput);
  const secondInput = decisionInput({ idempotencyKey: 'batch-second', supersedesDecisionIds: [first.decisionId] });
  const second = createClaimReviewDecision(secondInput);
  const objects = [batchObject({ recordType: 'decision', decision: second }, 'reviews'),
    batchObject({ recordType: 'decision', decision: first }, 'reviews'),
    batchObject({ recordType: 'claim', ...primary }, 'reviews')];
  const result = await storeApi.commitImmutableEvidenceBatch({ store, namespace: 'reviews', objects,
    manifest: manifest(objects, [first.decisionId, second.decisionId]), expectedHeadSha256: store.genesisHeadSha256,
    idempotencyKey: 'ordered-batch' });
  const graph = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: NOW, policy: POLICY });
  assert.equal(graph.reviewHeads[0].headDecisionIds[0], second.decisionId);
  assert.equal(graph.headSha256, result.headSha256);
});

test('pending unreferenced objects remain preserved when another batch makes their original basis stale', async (t) => {
  const store = await localStore(t);
  const first = await commit(store, 'a', { value: 'a' });
  let fired = false;
  const io = faultIo(async ({ operation, file, phase }) => {
    if (!fired && operation === 'rename' && file.includes('/objects/') && phase === 'after') {
      fired = true; throw Object.assign(new Error('orphan'), { code: 'INJECTED_FAULT' });
    }
  });
  const interrupted = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, io, clock: () => NOW });
  await rejectsCode(() => commit(interrupted, 'b', { value: 'b' }, first.headSha256), 'INJECTED_FAULT');
  const later = await commit(store, 'c', { value: 'c' }, first.headSha256);
  const resumed = await commit(store, 'b', { value: 'b' }, later.headSha256);
  assert.equal(resumed.status, 'STALE_HEAD');
  assert.equal(hash(await diskHead(store)), later.headSha256);
  assert.equal((await diskHead(store)).objectRefs.some((ref) => ref.sha256 === hash({ value: 'b' })), false);
  assert.equal(JSON.parse(await fs.readFile(join(store.storeRoot, 'objects/legacy-upgrades', `${hash({ value: 'b' })}.json`))).value, 'b');
});

test('a corrupt nonempty head cannot be reset into an empty successful store', async (t) => {
  const store = await localStore(t);
  await commit(store, 'a', { value: 'a' });
  await fs.writeFile(join(store.storeRoot, 'head.json'), '{broken');
  await rejectsCode(() => commit(store, 'b', { value: 'b' }), 'CORRUPT_RECORD');
});

async function writerProcess(store) {
  const moduleUrl = new URL('../../src/domain/architecture-v3/claim-review-store.mjs', import.meta.url).href;
  const value = { kind: 'child-write' };
  const objects = [batchObject(value)];
  const source = `import * as fs from 'node:fs/promises';
    import { createClaimReviewStore, commitImmutableEvidenceBatch } from ${JSON.stringify(moduleUrl)};
    const root = ${JSON.stringify(store.storeRoot)};
    let pointers = 0;
    const io = { ...fs, async rename(from,to) {
      if (to === root + '/head.json' && ++pointers === 2) {
        process.stdout.write('READY\\n');
        await new Promise(resolve => process.stdin.once('data', resolve));
      }
      return fs.rename(from,to);
    }};
    const store = createClaimReviewStore({storeRoot:root,io,clock:()=>${JSON.stringify(NOW)}});
    const result = await commitImmutableEvidenceBatch({store,namespace:'legacy-upgrades',objects:${JSON.stringify(objects)},
      manifest:${JSON.stringify(manifest(objects))},expectedHeadSha256:store.genesisHeadSha256,idempotencyKey:'child-key'});
    process.stdout.write(JSON.stringify(result)+'\\n'); process.stdin.destroy();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['pipe', 'pipe', 'pipe'] });
  await new Promise((resolvePromise, reject) => {
    let output = '', diagnostics = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('child did not reach held-FD boundary: ' + diagnostics)); }, 10000);
    child.stdout.on('data', (data) => { output += data; if (output.includes('READY\n')) { clearTimeout(timer); resolvePromise(); } });
    child.stderr.on('data', (data) => { diagnostics += data; });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { if (!output.includes('READY\n')) { clearTimeout(timer); reject(new Error('writer exited ' + code + ': ' + diagnostics)); } });
  });
  return { child, value };
}

test('writer-owned FD remains locked after native acquisition helper exits in another process', { timeout: 30000 }, async (t) => {
  const store = await localStore(t);
  const { child } = await writerProcess(store);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  t.signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  try { await rejectsCode(() => commit(store, 'racer', { value: 'race' }), 'WRITER_LOCKED'); }
  finally { child.stdin.write('release'); }
  await new Promise((resolvePromise, reject) => { child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error('child exit ' + code))); });
  assert.equal((await diskHead(store)).sequence, 1);
});

test('killing the writer releases its kernel FD lock and preserves a recoverable staged operation', { timeout: 30000 }, async (t) => {
  const store = await localStore(t);
  const { child, value } = await writerProcess(store);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  t.signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  child.kill('SIGKILL');
  await new Promise((resolvePromise) => child.once('exit', resolvePromise));
  const recovered = await commit(store, 'child-key', value);
  assert.equal(recovered.status, 'committed');
  const later = await commit(store, 'later', { value: 2 }, recovered.headSha256);
  assert.deepEqual(await commit(store, 'child-key', value, later.headSha256), recovered);
});

for (const requestType of ['append', 'batch']) {
  test('pending ' + requestType + ' objects must remain derived from their original semantic payload', async (t) => {
    let fired = false;
    const io = faultIo(async ({ operation, file, phase }) => {
      if (!fired && operation === 'rename' && file.includes('/objects/') && phase === 'after') {
        fired = true; throw Object.assign(new Error('stage interruption'), { code: 'INJECTED_FAULT' });
      }
    });
    const store = await localStore(t, { io });
    const key = requestType === 'append' ? 'stage-append' : 'stage-batch';
    const input = decisionInput({ idempotencyKey: key }); delete input.decidedAt;
    const original = () => requestType === 'append'
      ? storeApi.appendClaimReviewDecision({ store, decision: input, expectedHeadSha256: store.genesisHeadSha256 })
      : commit(store, key, { marker: 'ORIGINAL' });
    await rejectsCode(original, 'INJECTED_FAULT');
    const requestFile = join(store.storeRoot, 'requests', hash({ idempotencyKey: key }) + '.json');
    const request = JSON.parse(await fs.readFile(requestFile, 'utf8'));
    if (requestType === 'batch') {
      request.objects = [batchObject({ marker: 'SUBSTITUTE' })]; request.manifest = manifest(request.objects);
    } else {
      const { createClaimReviewDecision } = await import('../../src/domain/architecture-v3/claim-review-decision.mjs');
      const event = createClaimReviewDecision({ ...input, state: 'rejected', decidedAt: request.committedAt });
      request.objects = [batchObject({ recordType: 'claim', ...primary }, 'reviews'), batchObject({ recordType: 'decision', decision: event }, 'reviews')];
      request.manifest = manifest(request.objects, [event.decisionId]);
    }
    await fs.writeFile(requestFile, canonicalEvidenceJson(request));
    await rejectsCode(original, 'STAGED_PAYLOAD_MISMATCH');
    assert.equal((await diskHead(store)).sequence, 0);
  });
}

test('a crash flushing only the initial genesis temporary file remains recoverable', async (t) => {
  let fired = false;
  const io = faultIo(async ({ operation, file, phase }) => {
    if (!fired && operation === 'sync' && file.includes('/heads/') && file.includes('.json.tmp-') && phase === 'after') {
      fired = true; throw Object.assign(new Error('genesis temporary flush'), { code: 'INJECTED_FAULT' });
    }
  });
  const store = await localStore(t, { io });
  await rejectsCode(() => commit(store, 'genesis-recovery', { value: 1 }), 'INJECTED_FAULT');
  assert.equal(fired, true);
  const recovered = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => NOW });
  assert.equal((await commit(recovered, 'genesis-recovery', { value: 1 })).status, 'committed');
});

test('bounded JSON-object batches reject top-level primitives before writing while preserving nested null and zero', async (t) => {
  const store = await localStore(t);
  for (const value of [null, 0, false, 'text', []]) await rejectsCode(() => commit(store, 'invalid-value', value), 'INVALID_RECORD');
  await assert.rejects(fs.readFile(join(store.storeRoot, 'head.json')), { code: 'ENOENT' });
  const value = { nullable: null, zero: 0 };
  const first = await commit(store, 'nested-null', value);
  assert.equal(first.status, 'committed');
  assert.deepEqual(await commit(store, 'nested-null', value, 'd'.repeat(64)), first);
});

test('future-dated review events cannot enter a committed historical basis', async (t) => {
  const store = await localStore(t);
  await rejectsCode(() => storeApi.appendClaimReviewDecision({ store, decision: decisionInput({ decidedAt: '2027-01-01T00:00:00.000Z' }), expectedHeadSha256: store.genesisHeadSha256 }), 'FUTURE_REVIEW_DECISION');
  await assert.rejects(fs.readFile(join(store.storeRoot, 'head.json')), { code: 'ENOENT' });
});

test('a backwards commit clock cannot reorder the causal committed prefix', async (t) => {
  const store = await localStore(t);
  const first = await commit(store, 'first-clock', { value: 1 });
  const earlier = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-09-29T00:00:00.000Z' });
  await rejectsCode(() => commit(earlier, 'backwards-clock', { value: 2 }, first.headSha256), 'NONMONOTONIC_COMMIT_TIME');
  assert.equal(hash(await diskHead(store)), first.headSha256);
});

test('out-of-order decidedAt metadata retains parent ancestry at the causal committed basis', async (t) => {
  const store = await localStore(t);
  const first = await storeApi.appendClaimReviewDecision({ store, decision: decisionInput(), expectedHeadSha256: store.genesisHeadSha256 });
  const later = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-09-30T13:00:00.000Z' });
  const second = await storeApi.appendClaimReviewDecision({ store: later, decision: decisionInput({ idempotencyKey: 'backdated-child', decidedAt: '2026-09-01T00:00:00.000Z', supersedesDecisionIds: [first.event.decisionId] }), expectedHeadSha256: first.headSha256 });
  const before = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: '2026-09-30T12:30:00.000Z', policy: POLICY });
  const after = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: '2026-09-30T13:30:00.000Z', policy: POLICY });
  assert.equal(before.decisions.length, 1); assert.equal(before.headSha256, first.headSha256);
  assert.equal(after.decisions.length, 2); assert.equal(after.headSha256, second.headSha256);
});

test('historical policy transitions check terminal heads while preserving older-policy ancestors', async (t) => {
  const store = await localStore(t);
  const first = await storeApi.appendClaimReviewDecision({ store, decision: decisionInput(), expectedHeadSha256: store.genesisHeadSha256 });
  const newPolicy = { policyId: 'review-policy-v2', policySha256: 'd'.repeat(64) };
  const later = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-09-30T13:00:00.000Z' });
  const second = await storeApi.appendClaimReviewDecision({ store: later, decision: decisionInput({ ...newPolicy, idempotencyKey: 'v2-review', decidedAt: '2026-09-30T13:00:00.000Z', supersedesDecisionIds: [first.event.decisionId] }), expectedHeadSha256: first.headSha256 });
  const before = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: '2026-09-30T12:30:00.000Z', policy: POLICY });
  const after = await storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: '2026-09-30T13:30:00.000Z', policy: newPolicy });
  assert.equal(before.decisions[0].policyId, POLICY.policyId);
  assert.equal(after.decisions.length, 2); assert.equal(after.headSha256, second.headSha256);
  await rejectsCode(() => storeApi.replayClaimReviewHistory({ store, claimId: primary.claim.claimId, asOf: '2026-09-30T13:30:00.000Z', policy: POLICY }), 'REPLAY_POLICY_MISMATCH');
});

for (const fault of ['before-final-head-rename', 'after-final-head-rename', 'final-head-directory-flush']) {
  test('the actual non-genesis commit handles ' + fault + ' without an unsafe acknowledgement', async (t) => {
    const store = await localStore(t);
    const initialized = await commit(store, 'initial', { marker: 'initial' });
    let fired = false, published = false;
    const io = faultIo(async ({ operation, file, phase }) => {
      if (operation === 'rename' && file === join(store.storeRoot, 'head.json') && phase === 'after') published = true;
      const match = fault === 'before-final-head-rename' ? operation === 'rename' && file.endsWith('/head.json') && phase === 'before'
        : fault === 'after-final-head-rename' ? operation === 'rename' && file.endsWith('/head.json') && phase === 'after'
          : published && operation === 'sync' && file === store.storeRoot && phase === 'before';
      if (!fired && match) { fired = true; throw Object.assign(new Error(fault), { code: 'INJECTED_FAULT' }); }
    });
    const interrupted = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, io, clock: () => NOW });
    const input = decisionInput({ idempotencyKey: fault }); delete input.decidedAt;
    await rejectsCode(() => storeApi.appendClaimReviewDecision({ store: interrupted, decision: input, expectedHeadSha256: initialized.headSha256 }), 'INJECTED_FAULT');
    assert.equal(fired, true);
    assert.equal((await diskHead(store)).sequence, published ? 2 : 1);
    const recovered = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, clock: () => '2026-10-01T12:00:00.000Z' });
    const original = await storeApi.appendClaimReviewDecision({ store: recovered, decision: input, expectedHeadSha256: initialized.headSha256 });
    assert.equal(original.event.decidedAt, NOW);
    assert.equal((await diskHead(store)).sequence, 2);
    const failingFlush = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, io: faultIo(async ({ operation, file, flags }) => {
      if (operation === 'sync' && flags === 'r' && file.includes('/objects/')) throw Object.assign(new Error('retry object flush unavailable'), { code: 'EINVAL' });
    }), clock: () => '2026-10-02T00:00:00.000Z' });
    await rejectsCode(() => storeApi.appendClaimReviewDecision({ store: failingFlush, decision: input, expectedHeadSha256: initialized.headSha256 }), 'EINVAL');
    assert.deepEqual(await storeApi.appendClaimReviewDecision({ store: recovered, decision: input, expectedHeadSha256: initialized.headSha256 }), original);
  });
}

test('missing the pointer of a nonempty committed store never resets its history', async (t) => {
  const store = await localStore(t); await commit(store, 'nonempty', { value: 1 });
  await fs.unlink(join(store.storeRoot, 'head.json'));
  await rejectsCode(() => commit(store, 'new', { value: 2 }), 'STORE_HEAD_MISSING');
});

test('a parsed null pending request is corruption rather than absence or permission to remint', async (t) => {
  let fired = false;
  const io = faultIo(async ({ operation, file, phase }) => {
    if (!fired && operation === 'rename' && file.includes('/objects/') && phase === 'after') { fired = true; throw Object.assign(new Error('pending'), { code: 'INJECTED_FAULT' }); }
  });
  const store = await localStore(t, { io });
  await rejectsCode(() => commit(store, 'null-request', { value: 1 }), 'INJECTED_FAULT');
  const requestFile = join(store.storeRoot, 'requests', hash({ idempotencyKey: 'null-request' }) + '.json');
  await fs.writeFile(requestFile, 'null');
  await rejectsCode(() => commit(store, 'null-request', { value: 1 }), 'INVALID_RECORD');
  assert.equal(await fs.readFile(requestFile, 'utf8'), 'null');
  assert.equal((await diskHead(store)).sequence, 0);
});

test('a parsed null head pointer is corruption rather than an empty reset', async (t) => {
  const store = await localStore(t); await commit(store, 'nonnull', { value: 1 });
  await fs.writeFile(join(store.storeRoot, 'head.json'), 'null');
  await rejectsCode(() => commit(store, 'next', { value: 2 }), 'INVALID_RECORD');
  assert.equal(await fs.readFile(join(store.storeRoot, 'head.json'), 'utf8'), 'null');
});

test('a pending batch key cannot differ from its caller and fixed request filename before publication', async (t) => {
  const store = await localStore(t); const old = await commit(store, 'old-readable', { value: 'old' });
  let fired = false;
  const io = faultIo(async ({ operation, file, phase }) => {
    if (!fired && operation === 'rename' && file.includes('/objects/') && phase === 'after') { fired = true; throw Object.assign(new Error('pending key'), { code: 'INJECTED_FAULT' }); }
  });
  const interrupted = storeApi.createClaimReviewStore({ storeRoot: store.storeRoot, io, clock: () => NOW });
  await rejectsCode(() => commit(interrupted, 'caller-key', { value: 'new' }, old.headSha256), 'INJECTED_FAULT');
  const requestFile = join(store.storeRoot, 'requests', hash({ idempotencyKey: 'caller-key' }) + '.json');
  const request = JSON.parse(await fs.readFile(requestFile, 'utf8')); request.idempotencyKey = 'substituted-key';
  await fs.writeFile(requestFile, canonicalEvidenceJson(request));
  await rejectsCode(() => commit(store, 'caller-key', { value: 'new' }, old.headSha256), 'STAGED_REQUEST_BINDING');
  assert.equal(hash(await diskHead(store)), old.headSha256);
  assert.deepEqual(await commit(store, 'old-readable', { value: 'old' }, old.headSha256), old);
});
