import { createHash, createPublicKey, verify } from 'node:crypto';

import {
  canonicalOwnerJson,
  ownerSemanticId,
  parseCanonicalOwnerJson,
  validateOwnerAttestationRequest,
  validateOwnerAttestationPayload,
} from '../../src/domain/owner-attestation-request-contract.mjs';
import {
  OfflineSecureIoError,
  readStableFile,
  writeAtomicPrivateNoClobber,
} from './offline-owner-secure-io.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX = /^[0-9a-f]{64}$/;
const KEYS = [
  'acceptanceId', 'acceptedAt', 'attestation', 'attestationSha256', 'candidateId', 'candidateSha256',
  'expiresAt', 'issuedAt', 'offlineSignerContractId', 'offlineSignerContractSha256',
  'ownerTrustRootSha256', 'request', 'requestId', 'requestSha256', 'schemaVersion', 'state',
];

export class OwnerAttestationAcceptanceError extends Error {
  constructor(code, message) { super(message); this.name = 'OwnerAttestationAcceptanceError'; this.code = code; }
}

const fail = (code, message) => { throw new OwnerAttestationAcceptanceError(code, message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function parseCanonicalTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}

function canonicalSignatureBytes(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(['payload', 'signature'])) {
    fail('ATTESTATION_INVALID', 'Attestation envelope keys are invalid');
  }
  try { validateOwnerAttestationPayload(envelope.payload); } catch (error) { fail(error.code, error.message); }
  const signatureBytes = typeof envelope.signature === 'string'
    ? Buffer.from(envelope.signature, 'base64')
    : Buffer.alloc(0);
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64') !== envelope.signature) {
    fail('ATTESTATION_SIGNATURE_INVALID', 'Owner attestation signature is invalid');
  }
  return signatureBytes;
}

function validateEnvelope(bytes, ownerPublicKeyPem) {
  let envelope;
  try { envelope = parseCanonicalOwnerJson(bytes, 'Owner attestation'); } catch (error) { fail(error.code, error.message); }
  const signatureBytes = canonicalSignatureBytes(envelope);
  let key;
  try { key = createPublicKey(ownerPublicKeyPem); } catch { fail('OWNER_PUBLIC_KEY_INVALID', 'Owner public key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519'
    || !verify(null, Buffer.from(canonicalOwnerJson(envelope.payload)), key, signatureBytes)) {
    fail('ATTESTATION_SIGNATURE_INVALID', 'Owner attestation signature is invalid');
  }
  return envelope;
}

export function buildOwnerAttestationAcceptanceReceipt({
  attestationBytes, ownerPublicKeyPem, requestBytes, now = () => new Date(),
}) {
  let request;
  try { request = validateOwnerAttestationRequest(requestBytes); } catch (error) { fail('ACCEPTANCE_REQUEST_INVALID', error.message); }
  const envelope = validateEnvelope(attestationBytes, ownerPublicKeyPem);
  if (canonicalOwnerJson(envelope.payload) !== canonicalOwnerJson(request.payload)) {
    fail('ACCEPTANCE_REQUEST_INVALID', 'Attestation payload does not match the bound request');
  }
  const acceptedAt = now();
  const acceptedMs = acceptedAt instanceof Date ? acceptedAt.getTime() : NaN;
  if (!Number.isFinite(acceptedMs)
    || acceptedMs < Date.parse(envelope.payload.issuedAt)
    || acceptedMs >= Date.parse(envelope.payload.expiresAt)) {
    fail('ATTESTATION_OUTSIDE_VALIDITY', 'Attestation cannot be accepted outside its validity window');
  }
  const payload = {
    schemaVersion: 1,
    state: 'OWNER_ATTESTATION_ACCEPTED',
    request,
    requestId: request.requestId,
    requestSha256: sha256(requestBytes),
    attestation: envelope,
    attestationSha256: sha256(attestationBytes),
    candidateId: envelope.payload.candidateId,
    candidateSha256: envelope.payload.candidateSha256,
    ownerTrustRootSha256: request.ownerTrustRootSha256,
    offlineSignerContractId: envelope.payload.offlineSignerContractId,
    offlineSignerContractSha256: envelope.payload.offlineSignerContractSha256,
    issuedAt: envelope.payload.issuedAt,
    expiresAt: envelope.payload.expiresAt,
    acceptedAt: acceptedAt.toISOString(),
  };
  return Object.freeze({
    ...payload,
    acceptanceId: ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, payload),
  });
}

export function validateOwnerAttestationAcceptanceReceipt(bytes) {
  let value;
  try { value = parseCanonicalOwnerJson(bytes, 'Owner acceptance receipt'); } catch (error) { fail(error.code, error.message); }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...KEYS].sort())) fail('ACCEPTANCE_SCHEMA_INVALID', 'Receipt keys are invalid');
  if (value.schemaVersion !== 1 || value.state !== 'OWNER_ATTESTATION_ACCEPTED'
    || !['requestId', 'requestSha256', 'attestationSha256', 'candidateId', 'candidateSha256', 'ownerTrustRootSha256',
      'offlineSignerContractId', 'offlineSignerContractSha256', 'acceptanceId']
      .every((key) => HEX.test(value[key] ?? ''))) fail('ACCEPTANCE_SCHEMA_INVALID', 'Receipt fields are invalid');
  let request;
  try {
    const requestBytes = Buffer.from(canonicalOwnerJson(value.request));
    request = validateOwnerAttestationRequest(requestBytes);
    if (request.requestId !== value.requestId || sha256(requestBytes) !== value.requestSha256) {
      fail('ACCEPTANCE_REQUEST_INVALID', 'Receipt request identity is invalid');
    }
  } catch (error) {
    if (error instanceof OwnerAttestationAcceptanceError) throw error;
    fail('ACCEPTANCE_REQUEST_INVALID', error.message);
  }
  canonicalSignatureBytes(value.attestation);
  const issuedMs = parseCanonicalTimestamp(value.issuedAt);
  const acceptedMs = parseCanonicalTimestamp(value.acceptedAt);
  const expiresMs = parseCanonicalTimestamp(value.expiresAt);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(acceptedMs) || !Number.isFinite(expiresMs)
    || issuedMs >= expiresMs || acceptedMs < issuedMs || acceptedMs >= expiresMs
    || value.attestation?.payload?.issuedAt !== value.issuedAt
    || value.attestation?.payload?.expiresAt !== value.expiresAt
    || canonicalOwnerJson(value.attestation?.payload) !== canonicalOwnerJson(request.payload)) {
    fail('ACCEPTANCE_TIME_INVALID', 'Receipt acceptance time is outside the bound attestation validity window');
  }
  if (sha256(Buffer.from(canonicalOwnerJson(value.attestation))) !== value.attestationSha256
    || value.attestation?.payload?.candidateId !== value.candidateId
    || value.attestation?.payload?.candidateSha256 !== value.candidateSha256
    || request.ownerTrustRootSha256 !== value.ownerTrustRootSha256
    || value.attestation?.payload?.offlineSignerContractId !== value.offlineSignerContractId
    || value.attestation?.payload?.offlineSignerContractSha256 !== value.offlineSignerContractSha256) {
    fail('ACCEPTANCE_SCHEMA_INVALID', 'Receipt attestation binding is invalid');
  }
  const { acceptanceId, ...payload } = value;
  if (acceptanceId !== ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, payload)) {
    fail('ACCEPTANCE_ID_INVALID', 'Receipt semantic identity is invalid');
  }
  return Object.freeze(value);
}

function validNow(request, now) {
  const value = now();
  const ms = value instanceof Date ? value.getTime() : NaN;
  if (!Number.isFinite(ms) || ms < Date.parse(request.payload.issuedAt) || ms >= Date.parse(request.payload.expiresAt)) {
    fail('ATTESTATION_OUTSIDE_VALIDITY', 'Attestation cannot be accepted outside its validity window');
  }
  return value;
}

export function acceptOwnerAttestation({
  requestBytes,
  attestationBytes,
  ownerPublicKeyPem,
  ownerTrustRootBytes,
  expectedRequestId,
  expectedCandidateId,
  confirmation,
  outputPath,
  now = () => new Date(),
}) {
  let request;
  try { request = validateOwnerAttestationRequest(requestBytes); } catch (error) { fail(error.code, error.message); }
  if (confirmation !== 'ACCEPT_EXACT_OWNER_ATTESTATION') fail('CONFIRMATION_REQUIRED', 'Exact acceptance confirmation is required');
  if (request.requestId !== expectedRequestId) fail('REQUEST_CONFIRMATION_MISMATCH', 'Expected request ID does not match');
  if (request.candidateId !== expectedCandidateId) fail('CANDIDATE_CONFIRMATION_MISMATCH', 'Expected candidate ID does not match');
  if (path.basename(path.resolve(outputPath)) !== `${request.requestId}.owner-attestation-acceptance.json`) {
    fail('ACCEPTANCE_OUTPUT_INVALID', 'Acceptance output must use the deterministic request filename');
  }
  let trustRoot;
  try { trustRoot = parseCanonicalOwnerJson(ownerTrustRootBytes, 'Owner trust root'); } catch (error) { fail(error.code, error.message); }
  if (trustRoot.source !== 'INJECTED_READ_ONLY' || trustRoot.publicKey !== ownerPublicKeyPem
    || sha256(ownerTrustRootBytes) !== request.ownerTrustRootSha256) fail('OWNER_TRUST_ROOT_INVALID', 'Owner trust root does not match request');
  const envelope = validateEnvelope(attestationBytes, ownerPublicKeyPem);
  if (canonicalOwnerJson(envelope.payload) !== canonicalOwnerJson(request.payload)) {
    fail('ATTESTATION_REQUEST_MISMATCH', 'Attestation payload does not exactly match request payload');
  }
  const acceptedAt = validNow(request, now);
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes,
    ownerPublicKeyPem,
    requestBytes,
    now: () => acceptedAt,
  });
  try {
    writeAtomicPrivateNoClobber(outputPath, Buffer.from(canonicalOwnerJson(receipt)), {
      beforeCommit: () => validNow(request, now),
    });
  } catch (error) {
    if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
    throw error;
  }
  return { status: 'ACCEPTED', acceptanceId: receipt.acceptanceId, requestId: request.requestId, candidateId: request.candidateId };
}

const CLI_NAMES = new Set([
  '--request', '--attestation', '--owner-public-key', '--owner-trust-root', '--output',
  '--expected-request-id', '--expected-candidate-id', '--confirm',
]);

function parseCli(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? '' : argument.slice(separator + 1);
    if (!CLI_NAMES.has(name) || !value || values.has(name)) fail('CLI_ARGUMENT_INVALID', 'Exact non-duplicate CLI arguments are required');
    values.set(name, value);
  }
  if ([...CLI_NAMES].some((name) => !values.has(name))) fail('CLI_ARGUMENT_MISSING', 'All acceptance arguments are required');
  return values;
}

export function runOwnerAttestationAcceptanceCli({ argv }) {
  const args = parseCli(argv);
  return acceptOwnerAttestation({
    requestBytes: readStableFile(args.get('--request'), { allowedModes: [0o400, 0o600] }),
    attestationBytes: readStableFile(args.get('--attestation'), { allowedModes: [0o400, 0o600] }),
    ownerPublicKeyPem: readStableFile(args.get('--owner-public-key'), { allowedModes: [0o400, 0o444, 0o600] }).toString('utf8'),
    ownerTrustRootBytes: readStableFile(args.get('--owner-trust-root'), { allowedModes: [0o400, 0o444, 0o600] }),
    outputPath: args.get('--output'),
    expectedRequestId: args.get('--expected-request-id'),
    expectedCandidateId: args.get('--expected-candidate-id'),
    confirmation: args.get('--confirm'),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(canonicalOwnerJson(runOwnerAttestationAcceptanceCli({ argv: process.argv.slice(2) }))); }
  catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'OWNER_ATTESTATION_ACCEPTANCE_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
