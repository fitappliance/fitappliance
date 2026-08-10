import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalReviewerJson,
  deriveExpectedReviewerArtifact,
  validateReviewerArtifactRequest,
} from '../../src/domain/reviewer-artifact-request-contract.mjs';
import {
  OFFLINE_REVIEWER_SIGNER_BOUND_FILES,
  validateOfflineReviewerSignerContract,
} from '../../src/domain/offline-reviewer-signer-contract.mjs';
import {
  OfflineSecureIoError,
  assertPrivateOutputAbsent,
  readPrivateStableFile,
  readStableFile,
  writeAtomicPrivateNoClobber,
} from './offline-owner-secure-io.mjs';

export class OfflineReviewerSignerError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineReviewerSignerError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineReviewerSignerError(code, message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const CLI_NAMES = new Set([
  '--request', '--candidate', '--owner-receipt', '--owner-trust-root', '--trust-anchor', '--authority-set',
  '--reviewer-metadata', '--reviewer-public-key', '--reviewer-private-key', '--signer-contract',
  '--current-withdrawal-log', '--output', '--expected-request-id', '--expected-artifact-id', '--confirm',
  '--authorized-bootstrap-sha256', '--authorized-wrapper-sha256', '--authorized-contract-sha256',
  '--authorized-node-sha256', '--authorized-request-sha256', '--authorized-signer-contract-id',
]);

function parseCli(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? '' : argument.slice(separator + 1);
    if (!CLI_NAMES.has(name) || !value || values.has(name)) fail('CLI_ARGUMENT_INVALID', 'Exact non-duplicate reviewer signer arguments are required');
    values.set(name, value);
  }
  if ([...CLI_NAMES].some((name) => !values.has(name))) fail('CLI_ARGUMENT_MISSING', 'All reviewer signer arguments are required');
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

export function runOfflineReviewerSignerCli({
  argv,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
}) {
  rejectUnsafeRuntime();
  const args = parseCli(argv);
  const requestBytes = readStableFile(args.get('--request'), { allowedModes: [0o400, 0o600] });
  const request = validateReviewerArtifactRequest(requestBytes);
  const candidateBytes = readStableFile(args.get('--candidate'), { allowedModes: [0o400, 0o600] });
  const ownerReceiptBytes = readStableFile(args.get('--owner-receipt'), { allowedModes: [0o400, 0o600] });
  const ownerTrustRootBytes = readStableFile(args.get('--owner-trust-root'), { allowedModes: [0o400, 0o444, 0o600] });
  const authoritySetBytes = readStableFile(args.get('--authority-set'), { allowedModes: [0o400, 0o444, 0o600, 0o644] });
  const reviewerMetadataBytes = readStableFile(args.get('--reviewer-metadata'), { allowedModes: [0o400, 0o444, 0o600] });
  const reviewerPublicKeyPem = readStableFile(args.get('--reviewer-public-key'), { allowedModes: [0o400, 0o444, 0o600] }).toString('utf8');
  const trustAnchorBytes = readStableFile(args.get('--trust-anchor'));
  const contractBytes = readStableFile(args.get('--signer-contract'));
  const fileBytes = new Map(OFFLINE_REVIEWER_SIGNER_BOUND_FILES.map((relativePath) => [
    relativePath, readStableFile(path.join(repoRoot, relativePath)),
  ]));
  const contract = validateOfflineReviewerSignerContract(contractBytes, {
    nodeVersion: process.versions.node,
    trustAnchorBytes,
    fileBytes,
  });
  if (args.get('--authorized-signer-contract-id') !== contract.contractId) {
    fail('BOOTSTRAP_CONTRACT_ID_MISMATCH', 'Authorized reviewer signer-contract ID differs from the validated contract');
  }
  if (sha256(contractBytes) !== request.reviewerSignerContractSha256
    || contract.trustAnchor.path !== path.relative(repoRoot, path.resolve(args.get('--trust-anchor')))) {
    fail('SIGNER_CONTRACT_MISMATCH', 'Reviewer signer contract bytes or tracked trust-anchor path differ from the request');
  }
  const currentWithdrawalLogBytes = args.get('--current-withdrawal-log') === 'NONE'
    ? null
    : readStableFile(args.get('--current-withdrawal-log'), { allowedModes: [0o400, 0o600] });
  return signReviewerArtifact({
    requestBytes,
    derivationInputs: {
      artifactType: request.artifactType,
      candidateBytes,
      ownerReceiptBytes,
      ownerTrustRootBytes,
      ownerTrustAnchorBytes: trustAnchorBytes,
      authoritySetBytes,
      reviewerMetadataBytes,
      reviewerPublicKeyPem,
      reviewerSignerContractId: contract.contractId,
      reviewerSignerContractSha256: request.reviewerSignerContractSha256,
      currentWithdrawalLogBytes,
      dependencyId: request.payload.dependencyId,
      decisionAsOf: request.payload.decisionAsOf,
      validFrom: request.payload.validFrom,
      validThrough: request.payload.validThrough,
      reviewBy: request.payload.reviewBy,
    },
    expectedRequestId: args.get('--expected-request-id'),
    expectedArtifactId: args.get('--expected-artifact-id'),
    confirmation: args.get('--confirm'),
    outputPath: args.get('--output'),
    publicKeyPem: reviewerPublicKeyPem,
    privateKeyPath: args.get('--reviewer-private-key'),
    signerContract: { id: contract.contractId, sha256: sha256(contractBytes) },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(canonicalReviewerJson(runOfflineReviewerSignerCli({ argv: process.argv.slice(2) }))); }
  catch (error) {
    process.stderr.write(`${error?.code ?? 'OFFLINE_REVIEWER_SIGNER_FAILED'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function currentMs(now) {
  const value = now();
  const ms = value instanceof Date ? value.getTime() : NaN;
  if (!Number.isFinite(ms)) fail('SYSTEM_CLOCK_INVALID', 'System clock is invalid');
  return ms;
}

function withinWindow(request, now) {
  const ms = currentMs(now);
  if (ms < Date.parse(request.issuedAt) || ms >= Date.parse(request.expiresAt)) {
    fail('REQUEST_OUTSIDE_VALIDITY', 'Reviewer request is outside its exclusive validity window');
  }
}

function translateIo(error) {
  if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
  throw error;
}

function requestMatchesDerivation(request, derived) {
  for (const [key, value] of Object.entries(derived)) {
    if (canonicalReviewerJson(request[key]) !== canonicalReviewerJson(value)) {
      fail('REQUEST_DERIVATION_MISMATCH', `Reviewer request differs from independent derivation: ${key}`);
    }
  }
}

export function signReviewerArtifact({
  requestBytes,
  derivationInputs,
  expectedRequestId,
  expectedArtifactId,
  confirmation,
  now = () => new Date(),
  outputPath,
  publicKeyPem,
  privateKeyPath,
  signerContract,
  readPrivateKey = readPrivateStableFile,
  signBytes = (bytes, key) => sign(null, bytes, key),
}) {
  let request;
  let derived;
  try {
    request = validateReviewerArtifactRequest(requestBytes);
    derived = deriveExpectedReviewerArtifact(derivationInputs);
  } catch (error) {
    fail(error.code ?? 'REVIEWER_REQUEST_INVALID', error.message);
  }
  if (confirmation !== 'SIGN_EXACT_STATIC_RIGHTS_REVIEWER_ARTIFACT') fail('CONFIRMATION_REQUIRED', 'Exact reviewer signing confirmation is required');
  if (request.requestId !== expectedRequestId) fail('REQUEST_CONFIRMATION_MISMATCH', 'Expected reviewer request ID differs');
  if (request.artifactId !== expectedArtifactId) fail('ARTIFACT_CONFIRMATION_MISMATCH', 'Expected reviewer artifact ID differs');
  if (signerContract?.id !== request.reviewerSignerContractId
    || signerContract?.sha256 !== request.reviewerSignerContractSha256) {
    fail('SIGNER_CONTRACT_MISMATCH', 'Reviewer signer contract differs from the request');
  }
  requestMatchesDerivation(request, derived);
  let publicKey;
  try { publicKey = createPublicKey(publicKeyPem); } catch { fail('REVIEWER_PUBLIC_KEY_INVALID', 'Reviewer public key is invalid'); }
  if (publicKey.asymmetricKeyType !== 'ed25519'
    || publicKey.export({ type: 'spki', format: 'pem' }).toString() !== publicKeyPem) {
    fail('REVIEWER_PUBLIC_KEY_INVALID', 'Reviewer public key must be canonical Ed25519 PEM');
  }
  withinWindow(request, now);
  try { assertPrivateOutputAbsent(outputPath); } catch (error) { translateIo(error); }
  withinWindow(request, now);

  let privateBytes;
  try {
    try { privateBytes = readPrivateKey(privateKeyPath); }
    catch (error) {
      if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
      fail('PRIVATE_KEY_FILE_INVALID', 'Reviewer private key cannot be read safely');
    }
    const privateText = Buffer.from(privateBytes).toString('utf8');
    const pemMatch = privateText.match(/^-----BEGIN PRIVATE KEY-----\n((?:[A-Za-z0-9+/]{64}\n)*(?:[A-Za-z0-9+/]{4,64}={0,2}\n))-----END PRIVATE KEY-----\n$/);
    if (/ENCRYPTED PRIVATE KEY/.test(privateText) || !pemMatch
      || Buffer.from(pemMatch[1].replaceAll('\n', ''), 'base64').toString('base64') !== pemMatch[1].replaceAll('\n', '')) {
      fail('REVIEWER_PRIVATE_KEY_INVALID', 'Reviewer private key must be canonical unencrypted PKCS8');
    }
    let privateKey;
    try { privateKey = createPrivateKey(privateText); } catch { fail('REVIEWER_PRIVATE_KEY_INVALID', 'Reviewer private key is invalid'); }
    if (privateKey.asymmetricKeyType !== 'ed25519'
      || createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString() !== publicKeyPem) {
      fail('REVIEWER_KEY_MISMATCH', 'Reviewer private key differs from the pinned public key');
    }
    withinWindow(request, now);
    let signature;
    try { signature = signBytes(Buffer.from(canonicalReviewerJson(request.payload)), privateKey).toString('base64'); }
    catch { fail('REVIEWER_SIGNATURE_FAILED', 'Reviewer artifact could not be signed'); }
    const envelope = request.artifactType === 'WITHDRAWAL_GENESIS_HEAD'
      ? { withdrawalHeadHash: request.artifactId, payload: request.payload, signature }
      : { decisionId: request.artifactId, payload: request.payload, signature };
    try {
      writeAtomicPrivateNoClobber(outputPath, Buffer.from(canonicalReviewerJson(envelope)), {
        beforeCommit: () => withinWindow(request, now),
      });
    } catch (error) { translateIo(error); }
    return { status: 'SIGNED', requestId: request.requestId, artifactId: request.artifactId };
  } finally {
    if (Buffer.isBuffer(privateBytes) || privateBytes instanceof Uint8Array) privateBytes.fill(0);
  }
}
