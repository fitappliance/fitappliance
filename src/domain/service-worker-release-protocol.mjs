import { createHash } from 'node:crypto';
import path from 'node:path';

const HASH = /^[0-9a-f]{64}$/;
const CACHE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCHEMA_VERSION = 1;
const WORKER_PATH = 'public/service-worker.js';
const CACHE_PREFIXES = [
  'fitappliance-app-shell-',
  'fitappliance-data-',
  'fitappliance-static-',
];

export class ServiceWorkerReleaseProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ServiceWorkerReleaseProtocolError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ServiceWorkerReleaseProtocolError(code, message);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) {
    fail('SCHEMA_KEYS_INVALID', `${label} must contain exactly: ${keys.join(', ')}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value) fail('IDENTITY_INVALID', `${label} is required`);
  if (value !== value.normalize('NFC')) fail('STRING_NOT_NFC', `${label} must be NFC-normalized`);
  return value;
}

function hash(value, label) {
  text(value, label);
  if (!HASH.test(value)) fail('HASH_INVALID', `${label} must be a lowercase SHA-256 hash`);
  return value;
}

function cacheVersion(value, label) {
  text(value, label);
  if (!CACHE_VERSION.test(value)) {
    fail('CACHE_VERSION_INVALID', `${label} must be a safe cache version token`);
  }
  return value;
}

function relativePath(value, label) {
  text(value, label);
  if (value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('PATH_INVALID', `${label} must be a canonical relative path`);
  }
  return value;
}

function canonical(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return text(value, 'canonical string');
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('CANONICAL_VALUE_INVALID', 'Canonical numbers must be safe integers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('CANONICAL_VALUE_INVALID', 'Only strict JSON values can be hashed');
  }
  return Object.fromEntries(Object.keys(value).sort(byteSort).map((key) => [
    text(key, 'canonical key'), canonical(value[key]),
  ]));
}

function semanticHash(domain, value) {
  return createHash('sha256')
    .update(`${domain}\0v1\0`)
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalRows(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) fail('SCHEMA_KEYS_INVALID', `${label} must be a non-empty array`);
  const seen = new Set();
  const normalized = rows.map((row, index) => {
    exactKeys(row, ['path', 'sha256'], `${label}[${index}]`);
    const rowPath = relativePath(row.path, `${label}[${index}].path`);
    const collisionKey = rowPath.normalize('NFKC').toLowerCase();
    if (seen.has(collisionKey)) fail('APPLICATION_SOURCE_PATH_COLLISION', `${label} contains duplicate or colliding paths`);
    seen.add(collisionKey);
    return { path: rowPath, sha256: hash(row.sha256, `${label}[${index}].sha256`) };
  });
  return normalized.sort((left, right) => byteSort(`${left.path}\0${left.sha256}`, `${right.path}\0${right.sha256}`));
}

function canonicalArtifactIds(values) {
  if (!Array.isArray(values) || values.length === 0) fail('IDENTITY_INVALID', 'fitArtifactIds must be non-empty');
  const sorted = values.map((value, index) => hash(value, `fitArtifactIds[${index}]`)).sort(byteSort);
  if (new Set(sorted).size !== sorted.length) fail('FIT_ARTIFACT_DUPLICATE', 'fitArtifactIds must be unique');
  return sorted;
}

export function createApplicationSourceManifest(input) {
  exactKeys(input, ['sources'], 'application source input');
  const sources = canonicalRows(input.sources, 'sources');
  if (sources.some((row) => row.path === WORKER_PATH)) {
    fail('APPLICATION_SOURCE_WORKER_FORBIDDEN', `${WORKER_PATH} is a tracked witness, not a B1 source`);
  }
  const payload = { schemaVersion: SCHEMA_VERSION, sources };
  return immutable({
    ...payload,
    applicationSourceId: semanticHash('fitappliance.application-source', payload),
  });
}

const GENERATION_KEYS = [
  'applicationSourceId',
  'staticPublicationAuthorizationId',
  'activeRetailReleaseId',
  'fitArtifactIds',
  'cacheProtocolVersion',
  'predecessorCaptureId',
  'predecessorCacheVersion',
];

function generationPayload(input) {
  exactKeys(input, GENERATION_KEYS, 'application generation input');
  return {
    schemaVersion: SCHEMA_VERSION,
    applicationSourceId: hash(input.applicationSourceId, 'applicationSourceId'),
    staticPublicationAuthorizationId: hash(input.staticPublicationAuthorizationId, 'staticPublicationAuthorizationId'),
    activeRetailReleaseId: hash(input.activeRetailReleaseId, 'activeRetailReleaseId'),
    fitArtifactIds: canonicalArtifactIds(input.fitArtifactIds),
    cacheProtocolVersion: text(input.cacheProtocolVersion, 'cacheProtocolVersion'),
    predecessorCaptureId: hash(input.predecessorCaptureId, 'predecessorCaptureId'),
    predecessorCacheVersion: cacheVersion(input.predecessorCacheVersion, 'predecessorCacheVersion'),
  };
}

export function createApplicationGenerationManifest(input) {
  const payload = generationPayload(input);
  return immutable({
    ...payload,
    applicationGenerationId: semanticHash('fitappliance.application-generation', payload),
  });
}

const RECEIPT_KEYS = [
  'staticPublicationAuthorizationId',
  'toolchainContractSha256',
  'applicationSourceId',
  'applicationGenerationId',
  'activeRetailReleaseId',
  'worker',
  'producer',
  'tools',
  'inputs',
  'cacheProtocolVersion',
  'predecessorCaptureId',
  'predecessorCacheVersion',
  'cacheCoverageManifestId',
];

function bindingRow(value, label) {
  exactKeys(value, ['path', 'sha256'], label);
  return {
    path: relativePath(value.path, `${label}.path`),
    sha256: hash(value.sha256, `${label}.sha256`),
  };
}

function bindingRows(values, label) {
  if (!Array.isArray(values) || values.length === 0) fail('SCHEMA_KEYS_INVALID', `${label} must be a non-empty array`);
  const rows = values.map((value, index) => bindingRow(value, `${label}[${index}]`))
    .sort((left, right) => byteSort(`${left.path}\0${left.sha256}`, `${right.path}\0${right.sha256}`));
  if (new Set(rows.map((row) => row.path.normalize('NFKC').toLowerCase())).size !== rows.length) {
    fail('BINDING_PATH_COLLISION', `${label} must not contain duplicate or colliding paths`);
  }
  return rows;
}

function receiptPayload(input) {
  exactKeys(input, RECEIPT_KEYS, 'worker receipt bindings');
  const worker = bindingRow(input.worker, 'worker');
  if (worker.path !== WORKER_PATH) fail('WORKER_PATH_INVALID', `worker path must be ${WORKER_PATH}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    staticPublicationAuthorizationId: hash(input.staticPublicationAuthorizationId, 'staticPublicationAuthorizationId'),
    toolchainContractSha256: hash(input.toolchainContractSha256, 'toolchainContractSha256'),
    applicationSourceId: hash(input.applicationSourceId, 'applicationSourceId'),
    applicationGenerationId: hash(input.applicationGenerationId, 'applicationGenerationId'),
    activeRetailReleaseId: hash(input.activeRetailReleaseId, 'activeRetailReleaseId'),
    worker,
    producer: bindingRow(input.producer, 'producer'),
    tools: bindingRows(input.tools, 'tools'),
    inputs: bindingRows(input.inputs, 'inputs'),
    cacheProtocolVersion: text(input.cacheProtocolVersion, 'cacheProtocolVersion'),
    predecessorCaptureId: hash(input.predecessorCaptureId, 'predecessorCaptureId'),
    predecessorCacheVersion: cacheVersion(input.predecessorCacheVersion, 'predecessorCacheVersion'),
    cacheCoverageManifestId: hash(input.cacheCoverageManifestId, 'cacheCoverageManifestId'),
  };
}

export function createWorkerGenerationReceipt(input) {
  const payload = receiptPayload(input);
  return immutable({
    ...payload,
    workerGenerationReceiptId: semanticHash('fitappliance.worker-generation-receipt', payload),
  });
}

function receiptBindings(receipt) {
  exactKeys(receipt, ['schemaVersion', ...RECEIPT_KEYS, 'workerGenerationReceiptId'], 'worker generation receipt');
  if (receipt.schemaVersion !== SCHEMA_VERSION) {
    fail('SCHEMA_VERSION_INVALID', `worker generation receipt schemaVersion must be ${SCHEMA_VERSION}`);
  }
  return Object.fromEntries(RECEIPT_KEYS.map((key) => [key, receipt[key]]));
}

export function validateWorkerGenerationReceipt(receipt, expectedBindings) {
  const actualPayload = receiptPayload(receiptBindings(receipt));
  const expectedPayload = receiptPayload(expectedBindings);
  const expectedId = semanticHash('fitappliance.worker-generation-receipt', actualPayload);
  if (!HASH.test(receipt.workerGenerationReceiptId ?? '') || receipt.workerGenerationReceiptId !== expectedId) {
    fail('WORKER_RECEIPT_ID_INVALID', 'workerGenerationReceiptId does not bind the receipt payload');
  }
  if (JSON.stringify(canonical(actualPayload)) !== JSON.stringify(canonical(expectedPayload))) {
    fail('WORKER_RECEIPT_BINDING_MISMATCH', 'worker receipt is stale or belongs to another build');
  }
  return true;
}

export function validateB3WorkerComposition(input) {
  exactKeys(input, ['workerReceipt', 'expectedBindings', 'stagedWorker', 'trackedWitness'], 'B3 worker composition');
  if (!input.workerReceipt) fail('WORKER_RECEIPT_REQUIRED', 'B3 composition requires a worker receipt');
  validateWorkerGenerationReceipt(input.workerReceipt, input.expectedBindings);
  const stagedWorker = bindingRow(input.stagedWorker, 'stagedWorker');
  const trackedWitness = bindingRow(input.trackedWitness, 'trackedWitness');
  if (trackedWitness.path !== WORKER_PATH) fail('WORKER_PATH_INVALID', `tracked witness path must be ${WORKER_PATH}`);
  if (stagedWorker.path !== input.workerReceipt.worker.path || stagedWorker.sha256 !== input.workerReceipt.worker.sha256) {
    fail('B3_WORKER_MISMATCH', 'staged worker does not match the exact receipt');
  }
  if (stagedWorker.sha256 === trackedWitness.sha256) {
    fail('TRACKED_WORKER_WITNESS_REUSED', 'B3 cannot compose tracked witness bytes');
  }
  return true;
}

export function evaluateGenerationHandshake(input) {
  exactKeys(input, ['pageGenerationId', 'workerGenerationId', 'resourceGenerationIds'], 'generation handshake');
  const resources = input.resourceGenerationIds;
  if (!HASH.test(input.pageGenerationId ?? '') || !HASH.test(input.workerGenerationId ?? '')
    || !Array.isArray(resources) || resources.length === 0 || resources.some((value) => !HASH.test(value ?? ''))) {
    return immutable({ fitEnabled: false, reason: 'GENERATION_MARKER_MISSING' });
  }
  if (input.workerGenerationId !== input.pageGenerationId
    || resources.some((value) => value !== input.pageGenerationId)) {
    return immutable({ fitEnabled: false, reason: 'GENERATION_MISMATCH' });
  }
  return immutable({ fitEnabled: true, reason: 'GENERATION_MATCH' });
}

function cacheNameFor(prefix, version) {
  return `${prefix}${version}`;
}

export function planCacheRetention(input) {
  exactKeys(input, [
    'cacheNames', 'currentCacheVersion', 'predecessorCacheVersion', 'installSucceeded', 'activationSucceeded',
  ], 'cache retention input');
  if (!Array.isArray(input.cacheNames) || input.cacheNames.some((value) => typeof value !== 'string' || !value || value !== value.normalize('NFC'))) {
    fail('CACHE_NAMES_INVALID', 'cacheNames must contain NFC strings');
  }
  if (new Set(input.cacheNames).size !== input.cacheNames.length) fail('CACHE_NAMES_INVALID', 'cacheNames must be unique');
  const current = cacheVersion(input.currentCacheVersion, 'currentCacheVersion');
  const predecessor = cacheVersion(input.predecessorCacheVersion, 'predecessorCacheVersion');
  if (current === predecessor) fail('CACHE_VERSION_INVALID', 'current and predecessor cache versions must differ');
  if (typeof input.installSucceeded !== 'boolean' || typeof input.activationSucceeded !== 'boolean') {
    fail('CACHE_STATE_INVALID', 'install and activation states must be boolean');
  }
  if (!input.installSucceeded && input.activationSucceeded) {
    fail('CACHE_STATE_INVALID', 'activation cannot succeed after a failed install');
  }

  const retained = new Set(CACHE_PREFIXES.flatMap((prefix) => [
    cacheNameFor(prefix, current), cacheNameFor(prefix, predecessor),
  ]));
  const retainCacheNames = input.cacheNames.filter((name) => retained.has(name)).sort(byteSort);
  const deleteCacheNames = input.installSucceeded && input.activationSucceeded
    ? input.cacheNames.filter((name) => CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)) && !retained.has(name)).sort(byteSort)
    : [];
  return immutable({ retainCacheNames, deleteCacheNames });
}
