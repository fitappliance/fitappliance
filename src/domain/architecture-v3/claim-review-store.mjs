import { createHash, randomUUID } from 'node:crypto';
import * as defaultIo from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { CANONICAL_EVIDENCE_JSON_VERSION, canonicalEvidenceJson } from '../../shared/canonical-evidence-json.mjs';
import { validateEvidenceClaimV3 } from './evidence-claim-v3.mjs';
import {
  createClaimReviewDecision, validateClaimReviewHistory, validateProposedClaimReviewDecisions,
} from './claim-review-decision.mjs';

const NAMESPACES = new Set(['reviews', 'legacy-upgrades']);
const SHA256 = /^[a-f0-9]{64}$/u;
const contexts = new WeakMap();
const MISSING = Symbol('missing store record');
const genesis = Object.freeze({ schemaVersion: 1, recordDomain: 'fit-review-store-head-v1',
  previousHeadSha256: null, sequence: 0, batchSha256: null, objectRefs: [] });

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function clone(value) {
  try { return JSON.parse(canonicalEvidenceJson(value)); }
  catch (error) { fail('UNSAFE_JSON', `strict JSON required: ${error.message}`); }
}
function hash(value) { return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex'); }
function equal(left, right) { return canonicalEvidenceJson(left) === canonicalEvidenceJson(right); }
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) frozen(child);
  }
  return value;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RECORD', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('INVALID_RECORD', `${label} has unknown key ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('INVALID_RECORD', `${label} missing ${key}`);
}
function text(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || !value) fail('INVALID_RECORD', `${label} must be trimmed nonempty text`);
  return value;
}
function digest(value, label) { if (!SHA256.test(text(value, label))) fail('INVALID_HASH', `${label} must be lowercase SHA-256`); return value; }
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_TIME', 'canonical UTC timestamp required');
  return value;
}
function namespace(value) { if (!NAMESPACES.has(value)) fail('UNKNOWN_NAMESPACE', 'namespace must be reviews or legacy-upgrades'); return value; }
function refKey(ref) { return `${ref.namespace}/${ref.sha256}`; }
function sortedRefs(refs) {
  const byKey = new Map();
  for (const ref of refs) {
    exact(ref, ['namespace', 'sha256'], 'object reference'); namespace(ref.namespace); digest(ref.sha256, 'object reference hash');
    byKey.set(refKey(ref), ref);
  }
  return [...byKey.values()].sort((a, b) => refKey(a) < refKey(b) ? -1 : refKey(a) > refKey(b) ? 1 : 0);
}
function getContext(store) { const ctx = contexts.get(store); if (!ctx) fail('INVALID_STORE', 'store must be a created handle'); return ctx; }
function pathFor(ctx, relative) { return join(ctx.root, relative); }
function objectPath(ref) { return `objects/${ref.namespace}/${ref.sha256}.json`; }
function requestPath(key) { return `requests/${hash({ idempotencyKey: key })}.json`; }

async function optionalJson(ctx, relative, expectedHash) {
  const file = pathFor(ctx, relative);
  let bytes;
  try {
    const stat = await ctx.io.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('UNSAFE_PATH', 'store records must be regular files');
    bytes = await ctx.io.readFile(file);
  } catch (error) { if (error.code === 'ENOENT') return MISSING; throw error; }
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { fail('CORRUPT_RECORD', `invalid stored JSON: ${relative}`); }
  if (canonicalEvidenceJson(value) !== bytes.toString('utf8')) fail('CORRUPT_RECORD', `noncanonical stored bytes: ${relative}`);
  if (expectedHash && hash(value) !== expectedHash) fail('OBJECT_HASH_MISMATCH', `stored hash mismatch: ${relative}`);
  return value;
}
async function requiredJson(ctx, relative, expectedHash) {
  const value = await optionalJson(ctx, relative, expectedHash);
  if (value === MISSING) fail('DANGLING_OBJECT_REFERENCE', `missing immutable record: ${relative}`);
  return value;
}
async function syncFile(ctx, file) {
  const handle = await ctx.io.open(file, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function ensureDirectory(ctx, dir) {
  let stat;
  try { stat = await ctx.io.lstat(dir); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await ensureDirectory(ctx, dirname(dir));
    await ctx.io.mkdir(dir).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    await syncFile(ctx, dirname(dir));
    stat = await ctx.io.lstat(dir);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await ctx.io.realpath(dir) !== dir) fail('UNSAFE_PATH', 'store directories must not be symlinks');
}
async function layout(ctx) {
  await ensureDirectory(ctx, ctx.root);
  for (const relative of ['objects', 'objects/reviews', 'objects/legacy-upgrades', 'requests', 'batches', 'heads']) {
    await ensureDirectory(ctx, pathFor(ctx, relative));
  }
  await syncFile(ctx, ctx.root);
}
async function atomicWrite(ctx, relative, value, immutable = true) {
  const file = pathFor(ctx, relative);
  if (immutable) {
    const existing = await optionalJson(ctx, relative);
    if (existing !== MISSING) {
      if (!equal(existing, value)) fail('OBJECT_HASH_MISMATCH', `immutable record substitution: ${relative}`);
      await syncFile(ctx, file); await syncFile(ctx, dirname(file)); return;
    }
  }
  const temporary = `${file}.tmp-${randomUUID()}`;
  const handle = await ctx.io.open(temporary, 'wx');
  try { await handle.writeFile(canonicalEvidenceJson(value)); await handle.sync(); }
  finally { await handle.close(); }
  await syncFile(ctx, dirname(file));
  await ctx.io.rename(temporary, file);
  await syncFile(ctx, dirname(file));
}

// Native acquisition locks the writer-owned open file description, not a helper's lease.
async function nativeExclusive(ctx, task) {
  const lockFile = pathFor(ctx, 'writer.lock');
  const existing = await ctx.io.lstat(lockFile).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) fail('UNSAFE_PATH', 'writer lock must be a permanent regular inode');
  const descriptor = await ctx.io.open(lockFile, 'a+');
  try {
    if (!Number.isInteger(descriptor.fd)) fail('UNSUPPORTED_LOCK_BACKEND', 'native lock requires a real file descriptor');
    const executable = process.platform === 'darwin' ? '/usr/bin/lockf' : process.platform === 'linux' ? 'flock' : null;
    if (!executable) fail('UNSUPPORTED_LOCK_BACKEND', 'provide an explicit compatible process lock on this platform');
    const args = process.platform === 'darwin' ? ['-s', '-t', '0', '3'] : ['-n', '3'];
    await new Promise((resolvePromise, reject) => {
      const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', descriptor.fd] });
      let diagnostics = '';
      child.stderr.on('data', (data) => { diagnostics += data.toString(); });
      child.once('error', (error) => reject(Object.assign(error, { code: 'UNSUPPORTED_LOCK_BACKEND' })));
      child.once('exit', (code) => {
        if (code === 0) resolvePromise();
        else reject(Object.assign(new Error(diagnostics || 'writer lock is held'),
          { code: code === (process.platform === 'darwin' ? 75 : 1) ? 'WRITER_LOCKED' : 'UNSUPPORTED_LOCK_BACKEND' }));
      });
    });
    await descriptor.sync(); await syncFile(ctx, ctx.root);
    return await task();
  } finally { await descriptor.close(); }
}
async function exclusive(ctx, task) {
  await layout(ctx);
  if (ctx.lock) return ctx.lock.runExclusive({ storeRoot: ctx.root }, task);
  return nativeExclusive(ctx, task);
}

export function createClaimReviewStore({ storeRoot, io = defaultIo, lock, clock = () => new Date().toISOString() }) {
  if (!isAbsolute(text(storeRoot, 'storeRoot'))) fail('INVALID_STORE', 'storeRoot must be absolute');
  for (const method of ['open', 'readFile', 'mkdir', 'rename', 'lstat', 'realpath', 'readdir']) {
    if (typeof io[method] !== 'function') fail('UNSUPPORTED_IO_BACKEND', `io.${method} is required`);
  }
  if (typeof clock !== 'function') fail('INVALID_STORE', 'clock must be a function');
  if (lock && (lock.exclusiveAcrossProcesses !== true || typeof lock.runExclusive !== 'function')) {
    fail('UNSUPPORTED_LOCK_BACKEND', 'injected lock must guarantee process-wide exclusive ownership through task completion');
  }
  const store = Object.freeze({ storeRoot: resolve(storeRoot), genesisHeadSha256: hash(genesis) });
  contexts.set(store, { root: store.storeRoot, io, lock, clock, genesisHeadSha256: store.genesisHeadSha256 });
  return store;
}

function validateObjects(objects) {
  if (!Array.isArray(objects)) fail('INVALID_RECORD', 'objects must be an array');
  const seen = new Set();
  for (const object of objects) {
    exact(object, ['namespace', 'sha256', 'value'], 'object'); namespace(object.namespace); digest(object.sha256, 'object hash');
    if (!object.value || typeof object.value !== 'object' || Array.isArray(object.value)) fail('INVALID_RECORD', 'immutable batches require JSON-object values');
    if (hash(object.value) !== object.sha256) fail('OBJECT_HASH_MISMATCH', 'object hash differs from canonical value');
    if (seen.has(refKey(object))) fail('DUPLICATE_OBJECT', 'duplicate object reference');
    seen.add(refKey(object));
  }
}
function validateManifest(manifest) {
  exact(manifest, ['schemaVersion', 'manifestDomain', 'objectRefs', 'reviewDecisionIds'], 'manifest');
  if (manifest.schemaVersion !== 1 || manifest.manifestDomain !== 'fit-immutable-evidence-batch-v1') fail('INVALID_RECORD', 'unsupported manifest');
  if (!Array.isArray(manifest.objectRefs) || !Array.isArray(manifest.reviewDecisionIds)) fail('INVALID_RECORD', 'manifest references must be arrays');
  const refs = sortedRefs(manifest.objectRefs);
  if (refs.length !== manifest.objectRefs.length) fail('DUPLICATE_OBJECT', 'duplicate manifest references');
  if (new Set(manifest.reviewDecisionIds).size !== manifest.reviewDecisionIds.length
    || manifest.reviewDecisionIds.some((id) => typeof id !== 'string' || !/^fa_claim_review_decision_[a-f0-9]{64}$/u.test(id))) {
    fail('INVALID_RECORD', 'manifest review decision IDs must be canonical and unique');
  }
  return { ...manifest, objectRefs: refs, reviewDecisionIds: [...manifest.reviewDecisionIds] };
}
function reviewRecords(objects) {
  const claims = [], decisions = [];
  for (const object of objects.filter((object) => object.namespace === 'reviews')) {
    if (object.value.recordType === 'claim') {
      exact(object.value, ['recordType', 'claim', 'validationInputs'], 'Claim record');
      claims.push({ claim: validateEvidenceClaimV3({ claim: object.value.claim, validationInputs: object.value.validationInputs }),
        validationInputs: object.value.validationInputs });
    } else if (object.value.recordType === 'decision') {
      exact(object.value, ['recordType', 'decision'], 'decision record'); decisions.push(object.value.decision);
    } else fail('INVALID_RECORD', 'reviews namespace requires a real Claim or review decision record');
  }
  const unique = new Map();
  for (const resolved of claims) {
    const prior = unique.get(resolved.claim.claimId);
    if (prior && !equal(prior, resolved)) fail('CLAIM_INPUT_CONFLICT', 'one Claim ID has different validation records');
    unique.set(resolved.claim.claimId, resolved);
  }
  return { claims: [...unique.values()], decisions };
}
async function currentState(ctx) {
  const pointer = await optionalJson(ctx, 'head.json');
  if (pointer === MISSING) {
    const existingHeads = await ctx.io.readdir(pathFor(ctx, 'heads')).catch((error) => { if (error.code !== 'ENOENT') throw error; return []; });
    for (const name of existingHeads) {
      const finalName = `${ctx.genesisHeadSha256}.json`;
      const temporaryPrefix = finalName + '.tmp-';
      if (name !== finalName && (!name.startsWith(temporaryPrefix)
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(name.slice(temporaryPrefix.length)))) {
        fail('STORE_HEAD_MISSING', 'head pointer missing from a nonempty initialized store; no empty reset');
      }
      const candidate = await requiredJson(ctx, `heads/${name}`, ctx.genesisHeadSha256);
      if (!equal(candidate, genesis)) fail('STORE_HEAD_MISSING', 'only verified uncommitted empty-genesis files are recoverable');
    }
    return { headSha256: ctx.genesisHeadSha256, head: genesis, heads: [], objects: [], claims: [], decisions: [], operations: new Map() };
  }
  exact(pointer, ['schemaVersion', 'pointerDomain', 'headSha256'], 'head pointer');
  if (pointer.schemaVersion !== 1 || pointer.pointerDomain !== 'fit-review-store-pointer-v1') fail('CORRUPT_RECORD', 'invalid head pointer');
  digest(pointer.headSha256, 'head pointer hash');
  const heads = [], visited = new Set();
  let id = pointer.headSha256;
  while (id !== ctx.genesisHeadSha256) {
    if (visited.has(id)) fail('CORRUPT_RECORD', 'cyclic committed head chain'); visited.add(id);
    const head = await requiredJson(ctx, `heads/${id}.json`, id);
    exact(head, Object.keys(genesis), 'head');
    if (head.schemaVersion !== 1 || head.recordDomain !== genesis.recordDomain) fail('CORRUPT_RECORD', 'unsupported head');
    digest(head.previousHeadSha256, 'previous head hash'); digest(head.batchSha256, 'batch hash');
    heads.unshift({ head, headSha256: id }); id = head.previousHeadSha256;
  }
  await requiredJson(ctx, `heads/${ctx.genesisHeadSha256}.json`, ctx.genesisHeadSha256);
  const operations = new Map();
  let refs = [];
  let previousCommittedAt = null;
  for (let index = 0; index < heads.length; index += 1) {
    const entry = heads[index];
    const batch = await requiredJson(ctx, `batches/${entry.head.batchSha256}.json`, entry.head.batchSha256);
    exact(batch, ['schemaVersion', 'recordDomain', 'namespace', 'idempotencyKey', 'requestSha256', 'committedAt', 'manifest'], 'batch');
    if (batch.schemaVersion !== 1 || batch.recordDomain !== 'fit-review-store-batch-v1') fail('CORRUPT_RECORD', 'unsupported batch');
    namespace(batch.namespace); text(batch.idempotencyKey, 'idempotencyKey'); time(batch.committedAt);
    const request = await requiredJson(ctx, requestPath(batch.idempotencyKey), batch.requestSha256);
    validateRequest(request);
    validateTemporal(request, previousCommittedAt); previousCommittedAt = request.committedAt;
    if (request.idempotencyKey !== batch.idempotencyKey || request.basisHeadSha256 !== entry.head.previousHeadSha256
      || request.committedAt !== batch.committedAt || request.namespace !== batch.namespace || !equal(request.manifest, batch.manifest)) {
      fail('CORRUPT_RECORD', 'batch/request/basis identity mismatch');
    }
    const manifest = validateManifest(batch.manifest);
    refs = sortedRefs([...refs, ...manifest.objectRefs]);
    if (entry.head.sequence !== index + 1 || !equal(refs, entry.head.objectRefs) || operations.has(batch.idempotencyKey)) {
      fail('CORRUPT_RECORD', 'committed state must merge cumulative references and unique operations');
    }
    operations.set(batch.idempotencyKey, { request, headSha256: entry.headSha256, batch });
    entry.batch = batch; entry.request = request;
  }
  const objects = [];
  for (const ref of refs) objects.push({ ...ref, value: await requiredJson(ctx, objectPath(ref), ref.sha256) });
  const reviews = reviewRecords(objects);
  validateClaimReviewHistory(reviews);
  return { headSha256: pointer.headSha256, head: heads.at(-1)?.head ?? genesis, heads, objects, ...reviews, operations };
}
function validateRequest(request) {
  exact(request, ['schemaVersion', 'recordDomain', 'requestType', 'namespace', 'idempotencyKey', 'semanticPayload',
    'semanticSha256', 'basisHeadSha256', 'committedAt', 'objects', 'manifest'], 'request');
  if (request.schemaVersion !== 1 || request.recordDomain !== 'fit-review-store-request-v1'
    || !['append', 'batch'].includes(request.requestType)) fail('CORRUPT_RECORD', 'unsupported staged request');
  namespace(request.namespace); text(request.idempotencyKey, 'idempotencyKey'); digest(request.basisHeadSha256, 'request basis'); time(request.committedAt);
  if (request.semanticSha256 !== hash({ requestType: request.requestType, namespace: request.namespace, payload: request.semanticPayload })) {
    fail('CORRUPT_RECORD', 'staged semantic payload digest mismatch');
  }
  validateObjects(request.objects); validateManifest(request.manifest);
  let expected;
  if (request.requestType === 'append') {
    if (request.namespace !== 'reviews' || request.semanticPayload.idempotencyKey !== request.idempotencyKey) fail('CORRUPT_RECORD', 'append request key/namespace mismatch');
    const input = { ...request.semanticPayload, decidedAt: Object.hasOwn(request.semanticPayload, 'decidedAt') ? request.semanticPayload.decidedAt : request.committedAt };
    expected = decisionStage([input]);
  } else {
    exact(request.semanticPayload, ['objects', 'manifest'], 'batch semantic payload');
    validateObjects(request.semanticPayload.objects);
    expected = { objects: request.semanticPayload.objects, manifest: validateManifest(request.semanticPayload.manifest) };
  }
  if (!equal(request.objects, expected.objects) || !equal(request.manifest, expected.manifest)) fail('STAGED_PAYLOAD_MISMATCH', 'staged objects/manifest must reproduce from the persisted semantic request');
}
function validateTemporal(request, previousCommittedAt) {
  if (previousCommittedAt !== null && request.committedAt < previousCommittedAt) fail('NONMONOTONIC_COMMIT_TIME', 'commit clock cannot precede the previous committed batch');
  for (const event of reviewRecords(request.objects).decisions) {
    if (time(event.decidedAt) > request.committedAt) fail('FUTURE_REVIEW_DECISION', 'review decidedAt cannot be later than its causal commit time');
  }
}
function stale(expected, actual) { return frozen({ status: 'STALE_HEAD', expectedHeadSha256: expected, actualHeadSha256: actual }); }
function mergeClaims(oldClaims, newClaims) {
  const byId = new Map(oldClaims.map((resolved) => [resolved.claim.claimId, resolved]));
  for (const resolved of newClaims) {
    const previous = byId.get(resolved.claim.claimId);
    if (previous && !equal(previous, resolved)) fail('CLAIM_INPUT_CONFLICT', 'resolved Claim validation inputs differ');
    byId.set(resolved.claim.claimId, resolved);
  }
  return [...byId.values()];
}
function decisionStage(decisions) {
  const events = decisions.map(createClaimReviewDecision);
  const incomingClaims = decisions.map(({ claim, validationInputs }) => ({ claim, validationInputs }));
  const objects = new Map();
  for (const resolved of incomingClaims) {
    const value = { recordType: 'claim', ...resolved }; const object = { namespace: 'reviews', sha256: hash(value), value };
    objects.set(refKey(object), object);
  }
  for (const decision of events) {
    const value = { recordType: 'decision', decision }; const object = { namespace: 'reviews', sha256: hash(value), value };
    objects.set(refKey(object), object);
  }
  const staged = [...objects.values()].sort((a, b) => refKey(a) < refKey(b) ? -1 : 1);
  return { events, incomingClaims, objects: staged, manifest: { schemaVersion: 1, manifestDomain: 'fit-immutable-evidence-batch-v1',
    objectRefs: sortedRefs(staged.map(({ namespace, sha256 }) => ({ namespace, sha256 }))), reviewDecisionIds: events.map((event) => event.decisionId) } };
}
function preparedAt(state, decisions) {
  const stage = decisionStage(decisions);
  const claims = mergeClaims(state.claims, stage.incomingClaims);
  const graph = validateProposedClaimReviewDecisions({ basis: { decisions: state.decisions, claims }, decisions: stage.events });
  return frozen({ events: graph.events, proposedReviewHeads: graph.proposedReviewHeads, basisHeadSha256: state.headSha256,
    objects: stage.objects, manifest: stage.manifest });
}
export async function prepareClaimReviewDecisions({ store, decisions, expectedHeadSha256 }) {
  const ctx = getContext(store); digest(expectedHeadSha256, 'expectedHeadSha256');
  const state = await currentState(ctx);
  if (state.headSha256 !== expectedHeadSha256) return stale(expectedHeadSha256, state.headSha256);
  const inputs = clone(decisions); if (!Array.isArray(inputs)) fail('INVALID_RECORD', 'decisions must be an array');
  return preparedAt(state, inputs);
}
async function verifyStage(ctx, state, objects, manifest) {
  const byKey = new Map(state.objects.map((object) => [refKey(object), object]));
  for (const object of objects) byKey.set(refKey(object), object);
  const selected = [];
  for (const ref of manifest.objectRefs) {
    const object = byKey.get(refKey(ref));
    if (!object) fail('DANGLING_OBJECT_REFERENCE', 'manifest references an object not staged or committed');
    selected.push(object);
  }
  if (objects.some((object) => !manifest.objectRefs.some((ref) => refKey(ref) === refKey(object)))) {
    fail('DANGLING_OBJECT_REFERENCE', 'every staged object must be referenced by the batch manifest');
  }
  const staged = reviewRecords(selected);
  const events = staged.decisions.filter((decision) => manifest.reviewDecisionIds.includes(decision.decisionId));
  if (events.length !== manifest.reviewDecisionIds.length || staged.decisions.some((decision) => !manifest.reviewDecisionIds.includes(decision.decisionId))) {
    fail('DANGLING_REVIEW_REFERENCE', 'manifest must bind exactly its staged review decisions');
  }
  const claims = mergeClaims(state.claims, staged.claims);
  // Manifest event order is semantic; physical object ordering has no authority.
  const stagedEvents = new Map(objects.filter((object) => object.namespace === 'reviews' && object.value.recordType === 'decision')
    .map((object) => [object.value.decision.decisionId, object.value.decision]));
  const ordered = manifest.reviewDecisionIds.map((id) => stagedEvents.get(id));
  if (ordered.some((event) => !event)) fail('DANGLING_REVIEW_REFERENCE', 'review events must be staged as new objects');
  validateProposedClaimReviewDecisions({ basis: { decisions: state.decisions, claims }, decisions: ordered });
}
function operationResult(operation) {
  if (operation.request.requestType === 'append') {
    const events = operation.request.objects.filter((object) => object.namespace === 'reviews' && object.value.recordType === 'decision');
    if (events.length !== 1) fail('CORRUPT_RECORD', 'append must contain one review event');
    return frozen({ event: events[0].value.decision, headSha256: operation.headSha256 });
  }
  return frozen({ status: 'committed', manifest: operation.batch.manifest, headSha256: operation.headSha256 });
}
async function flushCommitted(ctx, state) {
  // Ambiguous publication retry must revalidate and flush all retained state before ACK.
  for (const object of state.objects) await syncFile(ctx, pathFor(ctx, objectPath(object)));
  for (const entry of state.heads) {
    await syncFile(ctx, pathFor(ctx, requestPath(entry.request.idempotencyKey)));
    await syncFile(ctx, pathFor(ctx, `batches/${entry.head.batchSha256}.json`));
    await syncFile(ctx, pathFor(ctx, `heads/${entry.headSha256}.json`));
  }
  for (const dir of ['objects/reviews', 'objects/legacy-upgrades', 'objects', 'requests', 'batches', 'heads']) await syncFile(ctx, pathFor(ctx, dir));
  await syncFile(ctx, pathFor(ctx, 'head.json')); await syncFile(ctx, ctx.root);
}
async function mutate(store, requestType, selectedNamespace, key, payload, expected) {
  const ctx = getContext(store); namespace(selectedNamespace); text(key, 'idempotencyKey'); digest(expected, 'expectedHeadSha256');
  const semanticPayload = clone(payload);
  const semanticSha256 = hash({ requestType, namespace: selectedNamespace, payload: semanticPayload });
  if (requestType === 'batch') { validateObjects(semanticPayload.objects); validateManifest(semanticPayload.manifest); }
  return exclusive(ctx, async () => {
    const state = await currentState(ctx);
    const committed = state.operations.get(key);
    if (committed) {
      if (committed.request.semanticSha256 !== semanticSha256) fail('IDEMPOTENCY_CONFLICT', 'idempotency key has a different semantic payload');
      await flushCommitted(ctx, state); return operationResult(committed);
    }
    let request = await optionalJson(ctx, requestPath(key));
    if (request !== MISSING) {
      validateRequest(request);
      if (request.idempotencyKey !== key || request.requestType !== requestType || request.namespace !== selectedNamespace) {
        fail('STAGED_REQUEST_BINDING', 'pending request key/type/namespace must bind its caller and fixed filename before publication');
      }
      if (request.semanticSha256 !== semanticSha256) fail('IDEMPOTENCY_CONFLICT', 'pending idempotency key has a different semantic payload');
      if (request.basisHeadSha256 !== state.headSha256 || expected !== state.headSha256) return stale(expected, state.headSha256);
    } else {
      if (expected !== state.headSha256) return stale(expected, state.headSha256);
      const committedAt = time(ctx.clock());
      let objects, manifest;
      if (requestType === 'append') {
        const input = { ...semanticPayload, decidedAt: Object.hasOwn(semanticPayload, 'decidedAt') ? semanticPayload.decidedAt : committedAt };
        const prepared = preparedAt(state, [input]); objects = prepared.objects; manifest = prepared.manifest;
      } else { objects = semanticPayload.objects; manifest = validateManifest(semanticPayload.manifest); }
      await verifyStage(ctx, state, objects, manifest);
      request = { schemaVersion: 1, recordDomain: 'fit-review-store-request-v1', requestType, namespace: selectedNamespace,
        idempotencyKey: key, semanticPayload, semanticSha256, basisHeadSha256: state.headSha256, committedAt, objects, manifest };
      validateTemporal(request, state.heads.at(-1)?.batch.committedAt ?? null);
      await atomicWrite(ctx, requestPath(key), request);
    }
    validateTemporal(request, state.heads.at(-1)?.batch.committedAt ?? null);
    await verifyStage(ctx, state, request.objects, request.manifest);
    if (state.headSha256 === ctx.genesisHeadSha256 && await optionalJson(ctx, 'head.json') === MISSING) {
      await atomicWrite(ctx, `heads/${ctx.genesisHeadSha256}.json`, genesis);
      await atomicWrite(ctx, 'head.json', { schemaVersion: 1, pointerDomain: 'fit-review-store-pointer-v1', headSha256: ctx.genesisHeadSha256 }, false);
    }
    for (const object of request.objects) await atomicWrite(ctx, objectPath(object), object.value);
    const batch = { schemaVersion: 1, recordDomain: 'fit-review-store-batch-v1', namespace: selectedNamespace,
      idempotencyKey: key, requestSha256: hash(request), committedAt: request.committedAt, manifest: request.manifest };
    const batchSha256 = hash(batch); await atomicWrite(ctx, `batches/${batchSha256}.json`, batch);
    const head = { schemaVersion: 1, recordDomain: genesis.recordDomain, previousHeadSha256: state.headSha256,
      sequence: state.head.sequence + 1, batchSha256, objectRefs: sortedRefs([...state.head.objectRefs, ...request.manifest.objectRefs]) };
    const headSha256 = hash(head); await atomicWrite(ctx, `heads/${headSha256}.json`, head);
    await atomicWrite(ctx, 'head.json', { schemaVersion: 1, pointerDomain: 'fit-review-store-pointer-v1', headSha256 }, false);
    const committedState = await currentState(ctx); await flushCommitted(ctx, committedState);
    return operationResult(committedState.operations.get(key));
  });
}
export async function appendClaimReviewDecision({ store, decision, expectedHeadSha256 }) {
  const input = clone(decision);
  text(input.idempotencyKey, 'decision idempotencyKey');
  return mutate(store, 'append', 'reviews', input.idempotencyKey, input, expectedHeadSha256);
}
export async function commitImmutableEvidenceBatch({ store, namespace: selectedNamespace, objects, manifest, expectedHeadSha256, idempotencyKey }) {
  return mutate(store, 'batch', selectedNamespace, idempotencyKey, { objects, manifest }, expectedHeadSha256);
}
export async function replayClaimReviewHistory({ store, claimId, asOf, policy }) {
  const ctx = getContext(store); digest(claimId, 'claimId'); time(asOf);
  const selectedPolicy = clone(policy); exact(selectedPolicy, ['policyId', 'policySha256'], 'historical review policy');
  text(selectedPolicy.policyId, 'policyId'); digest(selectedPolicy.policySha256, 'policySha256');
  const state = await currentState(ctx);
  const selectedHeads = state.heads.filter((entry) => entry.batch.committedAt <= asOf);
  const selectedHead = selectedHeads.at(-1);
  const basisRefs = new Set((selectedHead?.head.objectRefs ?? []).map(refKey));
  const basisReviews = reviewRecords(state.objects.filter((object) => basisRefs.has(refKey(object))));
  const decisions = basisReviews.decisions.filter((decision) => decision.claimId === claimId);
  const graph = validateClaimReviewHistory({ decisions, claims: basisReviews.claims.filter((resolved) => resolved.claim.claimId === claimId) });
  const terminalIds = new Set(graph.reviewHeads.flatMap((entry) => entry.headDecisionIds));
  if (graph.decisions.some((decision) => terminalIds.has(decision.decisionId)
    && (decision.policyId !== selectedPolicy.policyId || decision.policySha256 !== selectedPolicy.policySha256))) {
    fail('REPLAY_POLICY_MISMATCH', 'historical replay requires the exact policy of every relevant terminal review head');
  }
  return frozen({ ...graph, headSha256: selectedHead?.headSha256 ?? ctx.genesisHeadSha256, asOf, policy: selectedPolicy });
}
