import { createHash } from 'node:crypto';

const HEX = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const OUTER_KEYS = [
  'algorithm', 'authoritySetId', 'authoritySetSha256', 'candidateId', 'candidateSha256',
  'encoding', 'offlineSignerContractId', 'offlineSignerContractSha256', 'ownerPublicKeyFingerprintSha256',
  'ownerRootId', 'ownerTrustAnchorSha256', 'ownerTrustRootSha256', 'payload', 'requestId',
  'schemaVersion', 'state',
];
const PAYLOAD_KEYS = [
  'action', 'authoritySetId', 'authoritySetSha256', 'candidateGeneratorSha256', 'candidateId',
  'candidateSha256', 'dependencyId', 'environment', 'expiresAt', 'inventoryId', 'issuedAt',
  'offlineSignerContractId', 'offlineSignerContractSha256', 'ownerId',
  'ownerPublicKeyFingerprintSha256', 'ownerRootId', 'ownerTrustAnchorSha256',
  'publicEvidenceManifestSha256', 'routeConfigSha256', 'schemaVersion', 'scopeHash',
  'sourceObjectHash', 'toolchainContractSha256', 'withdrawalGenesisSha256',
];
const PAYLOAD_HASH_KEYS = [
  'inventoryId', 'scopeHash', 'sourceObjectHash', 'candidateId', 'candidateSha256',
  'authoritySetId', 'authoritySetSha256', 'ownerPublicKeyFingerprintSha256',
  'ownerTrustAnchorSha256', 'toolchainContractSha256', 'candidateGeneratorSha256',
  'routeConfigSha256', 'publicEvidenceManifestSha256', 'withdrawalGenesisSha256',
  'offlineSignerContractId', 'offlineSignerContractSha256',
];

export class OwnerAttestationContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OwnerAttestationContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new OwnerAttestationContractError(code, message);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function normalize(value) {
  if (typeof value === 'string') {
    if (value !== value.normalize('NFC')) fail('CANONICAL_JSON_INVALID', 'Strings must use NFC');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('CANONICAL_JSON_INVALID', 'Numbers must be safe integers');
    return value;
  }
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('CANONICAL_JSON_INVALID', 'Only strict JSON values are supported');
  }
  return Object.fromEntries(Object.keys(value).sort(byteSort).map((key) => [key, normalize(value[key])]));
}

export function canonicalOwnerJson(value) {
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export function ownerSemanticId(domain, schemaVersion, value) {
  return createHash('sha256').update(`${domain}\0${schemaVersion}\0${canonicalOwnerJson(value)}`).digest('hex');
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('REQUEST_SCHEMA_INVALID', `${label} must be an object`);
  if (JSON.stringify(Object.keys(value).sort(byteSort)) !== JSON.stringify([...keys].sort(byteSort))) {
    fail('REQUEST_SCHEMA_INVALID', `${label} keys are invalid`);
  }
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !ISO.test(value)) fail('REQUEST_TIME_INVALID', `${label} is invalid`);
  let canonical;
  try { canonical = new Date(value).toISOString(); } catch { canonical = ''; }
  if (canonical !== value) fail('REQUEST_TIME_INVALID', `${label} is invalid`);
  return Date.parse(value);
}

export function parseCanonicalOwnerJson(bytes, label = 'Owner request') {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail('REQUEST_INVALID', `${label} bytes are required`);
  const text = Buffer.from(bytes).toString('utf8');
  let value;
  try { value = JSON.parse(text); } catch { fail('REQUEST_INVALID', `${label} must contain JSON`); }
  if (canonicalOwnerJson(value) !== text) fail('REQUEST_NONCANONICAL', `${label} must contain canonical JSON`);
  return value;
}

export function validateOwnerAttestationPayload(payload) {
  exactKeys(payload, PAYLOAD_KEYS, 'Owner attestation payload');
  if (payload.schemaVersion !== 3 || payload.environment !== 'PRODUCTION'
    || payload.action !== 'PUBLIC_STATIC_DISTRIBUTION' || payload.dependencyId !== 'FIRST_PARTY'
    || payload.ownerId !== 'FITAPPLIANCE_OWNER' || payload.ownerRootId !== 'FITAPPLIANCE_OWNER_ROOT_2026_01') {
    fail('REQUEST_SCHEMA_INVALID', 'Owner attestation payload constants are invalid');
  }
  for (const key of PAYLOAD_HASH_KEYS) {
    if (!HEX.test(payload[key] ?? '')) fail('REQUEST_SCHEMA_INVALID', `${key} must be SHA-256`);
  }
  const issued = timestamp(payload.issuedAt, 'issuedAt');
  const expires = timestamp(payload.expiresAt, 'expiresAt');
  if (expires <= issued || expires - issued > MAX_AGE_MS) fail('REQUEST_TIME_INVALID', 'Validity window must be positive and at most 24 hours');
  return payload;
}

export function validateOwnerAttestationRequest(bytes) {
  const value = parseCanonicalOwnerJson(bytes);
  if (value?.schemaVersion === 2 || value?.payload?.schemaVersion === 2) {
    fail('UNSUPPORTED_SUPERSEDED_REQUEST', 'Schema-2 owner requests are superseded and cannot be signed');
  }
  exactKeys(value, OUTER_KEYS, 'Owner attestation request');
  validateOwnerAttestationPayload(value.payload);
  if (value.schemaVersion !== 3 || value.state !== 'UNSIGNED' || value.algorithm !== 'Ed25519'
    || value.encoding !== 'base64' || !HEX.test(value.requestId ?? '')) {
    fail('REQUEST_SCHEMA_INVALID', 'Owner attestation request constants are invalid');
  }
  for (const key of [
    'candidateId', 'candidateSha256', 'ownerPublicKeyFingerprintSha256', 'ownerTrustAnchorSha256',
    'ownerTrustRootSha256', 'authoritySetId', 'authoritySetSha256', 'offlineSignerContractId',
    'offlineSignerContractSha256',
  ]) {
    if (!HEX.test(value[key] ?? '')) fail('REQUEST_SCHEMA_INVALID', `${key} must be SHA-256`);
  }
  if (value.ownerRootId !== 'FITAPPLIANCE_OWNER_ROOT_2026_01') fail('REQUEST_SCHEMA_INVALID', 'Owner root is invalid');
  for (const key of [
    'candidateId', 'candidateSha256', 'ownerRootId', 'ownerPublicKeyFingerprintSha256',
    'ownerTrustAnchorSha256', 'authoritySetId', 'authoritySetSha256', 'offlineSignerContractId',
    'offlineSignerContractSha256',
  ]) {
    if (value[key] !== value.payload[key]) fail('REQUEST_BINDING_MISMATCH', `${key} differs between request and payload`);
  }
  const { requestId, ...unsigned } = value;
  if (requestId !== ownerSemanticId('fitappliance.owner-attestation-request', 3, unsigned)) {
    fail('REQUEST_ID_INVALID', 'Owner request semantic identity is invalid');
  }
  return Object.freeze(value);
}
