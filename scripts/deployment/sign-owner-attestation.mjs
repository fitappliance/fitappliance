import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalOwnerJson,
  validateOwnerAttestationRequest,
} from '../../src/domain/owner-attestation-request-contract.mjs';
import {
  OfflineSecureIoError,
  assertPrivateOutputAbsent,
  readPrivateStableFile,
  readStableFile,
  writeAtomicPrivateNoClobber,
} from './offline-owner-secure-io.mjs';
import {
  OFFLINE_SIGNER_BOUND_FILES,
  validateOfflineSignerContract,
} from '../../src/domain/offline-owner-signer-contract.mjs';

export class OfflineOwnerSignerError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineOwnerSignerError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineOwnerSignerError(code, message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function currentMs(now) {
  const value = now();
  const ms = value instanceof Date ? value.getTime() : NaN;
  if (!Number.isFinite(ms)) fail('SYSTEM_CLOCK_INVALID', 'System clock is invalid');
  return ms;
}

function withinWindow(request, now) {
  const ms = currentMs(now);
  if (ms < Date.parse(request.payload.issuedAt) || ms >= Date.parse(request.payload.expiresAt)) {
    fail('REQUEST_OUTSIDE_VALIDITY', 'Request is not currently valid');
  }
}

function translateIo(error) {
  if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
  throw error;
}

export function signOwnerAttestation({
  requestBytes,
  expectedRequestId,
  expectedCandidateId,
  confirmation,
  now = () => new Date(),
  outputPath,
  publicKeyPem,
  privateKeyPath,
  signerContract,
  trustedBindings,
  readPrivateKey = readPrivateStableFile,
  signBytes = (bytes, key) => sign(null, bytes, key),
}) {
  const request = validateOwnerAttestationRequest(requestBytes);
  if (confirmation !== 'SIGN_EXACT_OWNER_ATTESTATION') fail('CONFIRMATION_REQUIRED', 'Exact signing confirmation is required');
  if (expectedRequestId !== request.requestId) fail('REQUEST_CONFIRMATION_MISMATCH', 'Expected request ID does not match');
  if (expectedCandidateId !== request.candidateId) fail('CANDIDATE_CONFIRMATION_MISMATCH', 'Expected candidate ID does not match');
  if (signerContract?.id !== request.offlineSignerContractId
    || signerContract?.sha256 !== request.offlineSignerContractSha256) {
    fail('SIGNER_CONTRACT_MISMATCH', 'Offline signer contract does not match the request');
  }
  if (!trustedBindings
    || trustedBindings.ownerRootId !== request.ownerRootId
    || trustedBindings.ownerPublicKeyFingerprintSha256 !== request.ownerPublicKeyFingerprintSha256
    || trustedBindings.ownerTrustAnchorSha256 !== request.ownerTrustAnchorSha256
    || trustedBindings.ownerTrustRootSha256 !== request.ownerTrustRootSha256) {
    fail('TRUST_BINDING_MISMATCH', 'Request trust bindings do not match the independently pinned inputs');
  }
  let publicKey;
  try { publicKey = createPublicKey(publicKeyPem); } catch { fail('OWNER_PUBLIC_KEY_INVALID', 'Owner public key is invalid'); }
  if (publicKey.asymmetricKeyType !== 'ed25519'
    || publicKey.export({ type: 'spki', format: 'pem' }).toString() !== Buffer.from(publicKeyPem).toString()
    || sha256(publicKey.export({ type: 'spki', format: 'der' })) !== trustedBindings.ownerPublicKeyFingerprintSha256) {
    fail('OWNER_PUBLIC_KEY_INVALID', 'Owner public key must be canonical Ed25519 PEM');
  }
  withinWindow(request, now);
  try { assertPrivateOutputAbsent(outputPath); } catch (error) { translateIo(error); }
  withinWindow(request, now);

  let privateBytes;
  try {
    try { privateBytes = readPrivateKey(privateKeyPath); } catch (error) {
      if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
      fail('PRIVATE_KEY_FILE_INVALID', 'Private key cannot be read safely');
    }
    const privateText = Buffer.from(privateBytes).toString('utf8');
    const pemMatch = privateText.match(/^-----BEGIN PRIVATE KEY-----\n((?:[A-Za-z0-9+/]{64}\n)*(?:[A-Za-z0-9+/]{4,64}={0,2}\n))-----END PRIVATE KEY-----\n$/);
    if (/ENCRYPTED PRIVATE KEY/.test(privateText) || !pemMatch
      || Buffer.from(pemMatch?.[1].replaceAll('\n', '') ?? '', 'base64').toString('base64')
        !== (pemMatch?.[1].replaceAll('\n', '') ?? '')) {
      fail('OWNER_PRIVATE_KEY_INVALID', 'Owner private key must be unencrypted canonical PKCS8');
    }
    let privateKey;
    try { privateKey = createPrivateKey(privateText); } catch { fail('OWNER_PRIVATE_KEY_INVALID', 'Owner private key is invalid'); }
    if (privateKey.asymmetricKeyType !== 'ed25519') fail('OWNER_PRIVATE_KEY_INVALID', 'Owner private key must be Ed25519');
    const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
    if (derived !== publicKey.export({ type: 'spki', format: 'pem' }).toString()) {
      fail('OWNER_KEY_MISMATCH', 'Owner private key does not match the pinned public key');
    }
    withinWindow(request, now);
    let signature;
    try { signature = signBytes(Buffer.from(canonicalOwnerJson(request.payload)), privateKey).toString('base64'); }
    catch { fail('OWNER_SIGNATURE_FAILED', 'Owner attestation could not be signed'); }
    const envelopeBytes = Buffer.from(canonicalOwnerJson({ payload: request.payload, signature }));
    try {
      writeAtomicPrivateNoClobber(outputPath, envelopeBytes, { beforeCommit: () => withinWindow(request, now) });
    } catch (error) { translateIo(error); }
    return { status: 'SIGNED', requestId: request.requestId, candidateId: request.candidateId };
  } finally {
    if (Buffer.isBuffer(privateBytes) || privateBytes instanceof Uint8Array) privateBytes.fill(0);
  }
}

const CLI_NAMES = new Set([
  '--request', '--trust-anchor', '--signer-contract', '--owner-metadata', '--owner-public-key',
  '--owner-private-key', '--output', '--expected-request-id', '--expected-candidate-id', '--confirm',
  '--authorized-bootstrap-sha256', '--authorized-wrapper-sha256', '--authorized-contract-sha256',
  '--authorized-node-sha256', '--authorized-request-sha256', '--authorized-signer-contract-id',
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
  if ([...CLI_NAMES].some((name) => !values.has(name))) fail('CLI_ARGUMENT_MISSING', 'All signer arguments are required');
  return values;
}

function rejectUnsafeRuntime() {
  const unsafe = /(?:^|\s)(?:--require|--import|--inspect|--inspect-brk|--experimental-loader|--loader|--openssl-config)(?:=|\s|$)/;
  if (unsafe.test(process.env.NODE_OPTIONS ?? '') || process.execArgv.some((value) => unsafe.test(value))
    || process.env.NODE_PATH || process.env.DYLD_INSERT_LIBRARIES || process.env.DYLD_LIBRARY_PATH) {
    fail('UNSAFE_NODE_RUNTIME', 'Preload, inspector, loader and external OpenSSL configuration are forbidden');
  }
  if (!process.permission?.has) fail('NODE_PERMISSION_REQUIRED', 'Node permission mode is required');
  if (process.permission.has('child') || process.permission.has('worker')) {
    fail('NODE_PERMISSION_UNSAFE', 'Child-process and worker permissions must remain denied');
  }
}

function validatePinnedPublicInputs({ anchorBytes, metadataBytes, publicKeyPem }) {
  let anchor;
  let metadata;
  try {
    anchor = JSON.parse(anchorBytes.toString('utf8'));
    metadata = JSON.parse(metadataBytes.toString('utf8'));
  } catch { fail('OWNER_PUBLIC_INPUT_INVALID', 'Owner public inputs must contain JSON'); }
  if (canonicalOwnerJson(anchor) !== anchorBytes.toString('utf8')
    || canonicalOwnerJson(metadata) !== metadataBytes.toString('utf8')) fail('OWNER_PUBLIC_INPUT_INVALID', 'Owner public inputs must be canonical');
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail('OWNER_PUBLIC_KEY_INVALID', 'Owner public key is invalid'); }
  const pem = key.export({ type: 'spki', format: 'pem' }).toString();
  const fingerprint = sha256(key.export({ type: 'spki', format: 'der' }));
  if (key.asymmetricKeyType !== 'ed25519' || pem !== publicKeyPem
    || anchor.schemaVersion !== 1 || anchor.environment !== 'PRODUCTION' || anchor.algorithm !== 'Ed25519'
    || anchor.ownerRootId !== 'FITAPPLIANCE_OWNER_ROOT_2026_01'
    || anchor.ownerPublicKeyPemSha256 !== sha256(Buffer.from(publicKeyPem))
    || anchor.ownerPublicKeyFingerprintSha256 !== fingerprint
    || anchor.ownerRootMetadataSha256 !== sha256(metadataBytes)
    || metadata.rootId !== anchor.ownerRootId || metadata.publicKeyFingerprintSha256 !== fingerprint) {
    fail('OWNER_PUBLIC_INPUT_INVALID', 'Owner public inputs do not match the tracked trust anchor');
  }
  return Object.freeze({
    ownerRootId: anchor.ownerRootId,
    ownerPublicKeyFingerprintSha256: fingerprint,
    ownerTrustAnchorSha256: sha256(anchorBytes),
    ownerTrustRootSha256: anchor.trustRootSha256,
  });
}

export function runOfflineOwnerSignerCli({ argv, repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') }) {
  rejectUnsafeRuntime();
  const args = parseCli(argv);
  const requestBytes = readStableFile(args.get('--request'), { allowedModes: [0o400, 0o600] });
  const anchorBytes = readStableFile(args.get('--trust-anchor'));
  const contractBytes = readStableFile(args.get('--signer-contract'));
  const metadataBytes = readStableFile(args.get('--owner-metadata'), { allowedModes: [0o400, 0o444, 0o600] });
  const publicKeyPem = readStableFile(args.get('--owner-public-key'), { allowedModes: [0o400, 0o444, 0o600] }).toString('utf8');
  const fileBytes = new Map(OFFLINE_SIGNER_BOUND_FILES.map((relativePath) => [
    relativePath,
    readStableFile(path.join(repoRoot, relativePath)),
  ]));
  const contract = validateOfflineSignerContract(contractBytes, {
    nodeVersion: process.versions.node,
    trustAnchorBytes: anchorBytes,
    fileBytes,
  });
  if (args.get('--authorized-signer-contract-id') !== contract.contractId) {
    fail('BOOTSTRAP_CONTRACT_ID_MISMATCH', 'Authorized owner signer-contract ID differs from the validated contract');
  }
  if (contract.trustAnchor.path !== path.relative(repoRoot, path.resolve(args.get('--trust-anchor')))) {
    fail('SIGNER_TRUST_ANCHOR_DRIFT', 'Signer trust anchor path is not the tracked path');
  }
  const trustedBindings = validatePinnedPublicInputs({ anchorBytes, metadataBytes, publicKeyPem });
  const result = signOwnerAttestation({
    requestBytes,
    expectedRequestId: args.get('--expected-request-id'),
    expectedCandidateId: args.get('--expected-candidate-id'),
    confirmation: args.get('--confirm'),
    outputPath: args.get('--output'),
    publicKeyPem,
    privateKeyPath: args.get('--owner-private-key'),
    signerContract: { id: contract.contractId, sha256: sha256(contractBytes) },
    trustedBindings,
  });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runOfflineOwnerSignerCli({ argv: process.argv.slice(2) });
    process.stdout.write(canonicalOwnerJson(result));
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'OFFLINE_OWNER_SIGNER_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
