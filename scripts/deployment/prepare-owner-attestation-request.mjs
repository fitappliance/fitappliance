import { createHash, createPublicKey } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STATIC_RIGHTS_ACTION,
  canonicalJson,
  semanticId,
  validateAuthoritySet,
} from '../../src/domain/static-publication-rights.mjs';
import {
  replayCurrentUnsignedStaticRightsCandidate,
  writeCanonicalCandidateFile,
} from './prepare-static-rights-signing-candidate.mjs';

const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_REQUEST_AGE_MS = 24 * 60 * 60 * 1000;
const EXPECTED_DEPENDENCIES = [
  'ENERGY_RATING_CC_BY',
  'FIRST_PARTY',
  'GOOGLE_VERIFICATION',
  'OUTFIT_FONT',
  'WEB_VITALS_APACHE_2',
];
const EXPECTED_BLOCKERS = [
  'EXPLICIT_SIGNING_APPROVAL_REQUIRED',
  'OWNER_ATTESTATION_REQUIRED',
];
const CANDIDATE_SORTED_ARRAYS = [
  'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
  'dependencies', 'evidenceHashes', 'forbiddenDependencies',
];
const CANDIDATE_KEYS = [
  'attributionFulfillments', 'authoritySetId', 'authoritySetSha256', 'blockers',
  'candidateGeneratorSha256', 'candidateId', 'classifierId', 'constraints', 'dependencies',
  'inventoryId', 'ownerTrustAnchorSha256', 'ownerTrustRootSha256',
  'publicEvidenceManifestSha256', 'routeConfigSha256', 'schemaVersion', 'status',
  'toolchainContractSha256', 'withdrawalGenesis',
];
const DEPENDENCY_KEYS = [
  'attributionObligationIds', 'dependencyId', 'evidenceHashes', 'pathCount',
  'scopeHash', 'sourceObjectHash', 'status',
];
const METADATA_KEYS = [
  'algorithm', 'authoritySetHash', 'createdAt', 'environment',
  'publicKeyFingerprintSha256', 'rootId', 'schemaVersion',
];
const TRUST_ANCHOR_KEYS = [
  'algorithm', 'authoritySetEnrollmentHash', 'environment',
  'ownerPublicKeyFingerprintSha256', 'ownerPublicKeyPemSha256', 'ownerRootId',
  'ownerRootMetadataSha256', 'schemaVersion', 'trustRootSha256',
];
const TRUST_ROOT_KEYS = ['publicKey', 'source'];
const CLI_NAMES = new Set([
  '--authority-set', '--candidate', '--expires-at', '--issued-at', '--output', '--owner-metadata',
  '--owner-public-key', '--owner-trust-root', '--trust-anchor',
]);
const PRIVATE_MARKER = /partnerize|performancehorizon|the[-_ ]?good[-_ ]?guys|1101l4116|private[-_ ]?feed/i;

export class OwnerAttestationRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OwnerAttestationRequestError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new OwnerAttestationRequestError(code, message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(code, `${label} keys are invalid`);
  }
}

function exactArray(value, expected, code, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(code, `${label} must contain the exact canonical values`);
  }
}

function exactIso(value, code, label) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    fail(code, `${label} must be an explicit canonical ISO timestamp`);
  }
  let normalized;
  try {
    normalized = new Date(value).toISOString();
  } catch {
    normalized = null;
  }
  if (normalized !== value) fail(code, `${label} must be an explicit canonical ISO timestamp`);
  return value;
}

function parseCanonicalJson(bytes, code, label, options = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail(code, `${label} bytes are required`);
  }
  const text = Buffer.from(bytes).toString('utf8');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(code, `${label} must contain JSON`);
  }
  if (canonicalJson(value, options) !== text) fail(code, `${label} must be canonical JSON`);
  return value;
}

function validateCandidate(candidateBytes, replayedCandidateBytes) {
  const candidate = parseCanonicalJson(
    candidateBytes,
    'CANDIDATE_NONCANONICAL',
    'Signing candidate',
    { sortedArrays: CANDIDATE_SORTED_ARRAYS },
  );
  parseCanonicalJson(
    replayedCandidateBytes,
    'CANDIDATE_REPLAY_INVALID',
    'Replayed signing candidate',
    { sortedArrays: CANDIDATE_SORTED_ARRAYS },
  );
  if (!Buffer.from(candidateBytes).equals(Buffer.from(replayedCandidateBytes))) {
    fail('CANDIDATE_REPLAY_MISMATCH', 'Signing candidate does not exactly match the current repository replay');
  }
  exactKeys(candidate, CANDIDATE_KEYS, 'CANDIDATE_SCHEMA_INVALID', 'Signing candidate');
  if (candidate.schemaVersion !== 2 || candidate.status !== 'BLOCKED_OWNER_ATTESTATION'
    || candidate.ownerTrustRootSha256 !== null
    || candidate.classifierId !== 'fitappliance.static-rights-classifier/v1'
    || !HEX_64.test(candidate.inventoryId ?? '') || !HEX_64.test(candidate.authoritySetId ?? '')
    || !HEX_64.test(candidate.authoritySetSha256 ?? '') || !HEX_64.test(candidate.candidateId ?? '')
    || !HEX_64.test(candidate.candidateGeneratorSha256 ?? '')
    || !HEX_64.test(candidate.ownerTrustAnchorSha256 ?? '')
    || !HEX_64.test(candidate.publicEvidenceManifestSha256 ?? '')
    || !HEX_64.test(candidate.routeConfigSha256 ?? '')
    || !HEX_64.test(candidate.toolchainContractSha256 ?? '')) {
    fail('CANDIDATE_SCHEMA_INVALID', 'Signing candidate is not the exact unsigned B1 owner-attestation state');
  }
  exactArray(candidate.blockers, EXPECTED_BLOCKERS, 'CANDIDATE_SCHEMA_INVALID', 'Candidate blockers');
  exactKeys(
    candidate.constraints,
    ['allowedDependencies', 'environment', 'forbiddenDependencies', 'privateEvidenceAccess', 'signatureState'],
    'CANDIDATE_SCHEMA_INVALID',
    'Candidate constraints',
  );
  if (candidate.constraints.environment !== 'PRODUCTION'
    || candidate.constraints.signatureState !== 'UNSIGNED'
    || candidate.constraints.privateEvidenceAccess !== 'PROHIBITED') {
    fail('CANDIDATE_SCHEMA_INVALID', 'Candidate constraints are not production unsigned and private-evidence prohibited');
  }
  exactArray(candidate.constraints.allowedDependencies, EXPECTED_DEPENDENCIES, 'CANDIDATE_DEPENDENCIES_INVALID', 'Allowed dependencies');
  exactArray(candidate.constraints.forbiddenDependencies, ['RETAILER_FEED'], 'CANDIDATE_DEPENDENCIES_INVALID', 'Forbidden dependencies');

  if (!Array.isArray(candidate.dependencies) || candidate.dependencies.length !== EXPECTED_DEPENDENCIES.length) {
    fail('CANDIDATE_DEPENDENCIES_INVALID', 'Candidate must have exactly one row for each allowed dependency');
  }
  const byId = new Map();
  for (const row of candidate.dependencies) {
    exactKeys(row, DEPENDENCY_KEYS, 'CANDIDATE_DEPENDENCIES_INVALID', 'Candidate dependency');
    if (!EXPECTED_DEPENDENCIES.includes(row.dependencyId) || byId.has(row.dependencyId)
      || !Number.isSafeInteger(row.pathCount) || row.pathCount < 1
      || !HEX_64.test(row.scopeHash ?? '') || !HEX_64.test(row.sourceObjectHash ?? '')
      || !Array.isArray(row.evidenceHashes) || !row.evidenceHashes.every((value) => HEX_64.test(value))
      || !Array.isArray(row.attributionObligationIds)
      || !row.attributionObligationIds.every((value) => typeof value === 'string' && value)) {
      fail('CANDIDATE_DEPENDENCIES_INVALID', 'Candidate dependency row is invalid');
    }
    const expectedStatus = row.dependencyId === 'FIRST_PARTY' ? 'OWNER_ATTESTATION_REQUIRED' : 'EVIDENCE_REPLAYED';
    if (row.status !== expectedStatus) fail('CANDIDATE_DEPENDENCIES_INVALID', 'Candidate dependency status is invalid');
    byId.set(row.dependencyId, row);
  }
  if (EXPECTED_DEPENDENCIES.some((dependencyId) => !byId.has(dependencyId))) {
    fail('CANDIDATE_DEPENDENCIES_INVALID', 'Candidate dependency identities are incomplete');
  }
  const firstParty = byId.get('FIRST_PARTY');
  if (firstParty.evidenceHashes.length !== 0) {
    fail('CANDIDATE_DEPENDENCIES_INVALID', 'Unsigned FIRST_PARTY row cannot already contain owner evidence');
  }

  const markerProbe = structuredClone(candidate);
  markerProbe.constraints.forbiddenDependencies = [];
  if (PRIVATE_MARKER.test(JSON.stringify(markerProbe))) {
    fail('PRIVATE_MARKER_FORBIDDEN', 'Candidate contains a private provider or retailer-feed marker');
  }
  const { candidateId, ...candidatePayload } = candidate;
  const expectedCandidateId = semanticId(
    'fitappliance.static-rights-signing-candidate',
    2,
    candidatePayload,
    { sortedArrays: CANDIDATE_SORTED_ARRAYS },
  );
  if (candidateId !== expectedCandidateId) fail('CANDIDATE_ID_INVALID', 'Candidate semantic ID does not match its payload');
  return { candidate, firstParty };
}

function validateTrustChain({
  authoritySetBytes,
  candidate,
  ownerRootMetadataBytes,
  ownerPublicKeyPem,
  ownerTrustRootBytes,
  trustAnchorBytes,
}) {
  const anchor = parseCanonicalJson(trustAnchorBytes, 'TRUST_ANCHOR_INVALID', 'Owner trust anchor');
  exactKeys(anchor, TRUST_ANCHOR_KEYS, 'TRUST_ANCHOR_INVALID', 'Owner trust anchor');
  if (anchor.schemaVersion !== 1 || anchor.environment !== 'PRODUCTION'
    || anchor.algorithm !== 'Ed25519' || anchor.ownerRootId !== 'FITAPPLIANCE_OWNER_ROOT_2026_01'
    || Object.entries(anchor).some(([key, value]) => key.endsWith('Sha256') && !HEX_64.test(value ?? ''))
    || !HEX_64.test(anchor.authoritySetEnrollmentHash ?? '')
    || sha256(trustAnchorBytes) !== candidate.ownerTrustAnchorSha256) {
    fail('TRUST_ANCHOR_INVALID', 'Owner trust anchor is not the candidate-pinned production anchor');
  }

  const metadata = parseCanonicalJson(ownerRootMetadataBytes, 'OWNER_METADATA_NONCANONICAL', 'Owner root metadata');
  exactKeys(metadata, METADATA_KEYS, 'OWNER_METADATA_INVALID', 'Owner root metadata');
  if (metadata.schemaVersion !== 1 || metadata.environment !== 'PRODUCTION'
    || metadata.algorithm !== 'Ed25519' || metadata.rootId !== anchor.ownerRootId
    || metadata.authoritySetHash !== anchor.authoritySetEnrollmentHash
    || !HEX_64.test(metadata.publicKeyFingerprintSha256 ?? '')
    || exactIso(metadata.createdAt, 'OWNER_METADATA_INVALID', 'Owner root creation time') !== metadata.createdAt
    || sha256(ownerRootMetadataBytes) !== anchor.ownerRootMetadataSha256) {
    fail('OWNER_METADATA_INVALID', 'Owner root metadata does not match the pinned production anchor');
  }

  const pem = Buffer.isBuffer(ownerPublicKeyPem) ? ownerPublicKeyPem.toString('utf8') : ownerPublicKeyPem;
  let publicKey;
  try {
    publicKey = createPublicKey(pem);
  } catch {
    fail('OWNER_PUBLIC_KEY_INVALID', 'Owner public PEM is invalid');
  }
  if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519'
    || publicKey.export({ type: 'spki', format: 'pem' }).toString() !== pem
    || sha256(Buffer.from(pem)) !== anchor.ownerPublicKeyPemSha256) {
    fail('OWNER_PUBLIC_KEY_INVALID', 'Owner key must be the pinned canonical public Ed25519 PEM');
  }
  const fingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' }));
  if (fingerprint !== metadata.publicKeyFingerprintSha256
    || fingerprint !== anchor.ownerPublicKeyFingerprintSha256) {
    fail('OWNER_KEY_FINGERPRINT_MISMATCH', 'Owner public key fingerprint does not match the pinned root');
  }

  const trustRoot = parseCanonicalJson(ownerTrustRootBytes, 'OWNER_TRUST_ROOT_INVALID', 'Owner trust root');
  exactKeys(trustRoot, TRUST_ROOT_KEYS, 'OWNER_TRUST_ROOT_INVALID', 'Owner trust root');
  if (trustRoot.source !== 'INJECTED_READ_ONLY' || trustRoot.publicKey !== pem
    || sha256(ownerTrustRootBytes) !== anchor.trustRootSha256) {
    fail('OWNER_TRUST_ROOT_INVALID', 'Owner trust root does not match the pinned production root');
  }

  const authoritySet = parseCanonicalJson(
    authoritySetBytes,
    'AUTHORITY_SET_INVALID',
    'Authority set',
    { sortedArrays: ['authorities'] },
  );
  try {
    validateAuthoritySet({ authoritySet, trustRoot });
  } catch (error) {
    fail('AUTHORITY_SET_INVALID', `Authority set enrollment is invalid: ${error.message}`);
  }
  const authoritySetId = semanticId(
    'fitappliance.static-publication-authority-set',
    1,
    authoritySet,
    { sortedArrays: ['authorities'] },
  );
  const authoritySetSha256 = sha256(authoritySetBytes);
  if (candidate.authoritySetId !== authoritySetId
    || candidate.authoritySetSha256 !== authoritySetSha256
    || authoritySet.trustRootEnrollment?.authoritySetHash !== anchor.authoritySetEnrollmentHash) {
    fail('AUTHORITY_SET_INVALID', 'Authority set does not match the candidate and pinned owner root');
  }
  return { anchor, authoritySetId, authoritySetSha256, fingerprint };
}

export function buildOwnerAttestationRequest({
  authoritySetBytes,
  candidateBytes,
  replayedCandidateBytes,
  ownerRootMetadataBytes,
  ownerPublicKeyPem,
  ownerTrustRootBytes,
  trustAnchorBytes,
  issuedAt,
  expiresAt,
}) {
  exactIso(issuedAt, 'ISSUED_AT_INVALID', 'Owner attestation issue time');
  exactIso(expiresAt, 'EXPIRES_AT_INVALID', 'Owner attestation expiry time');
  const issuedAtMs = Date.parse(issuedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_REQUEST_AGE_MS) {
    fail('EXPIRES_AT_INVALID', 'Owner attestation expiry must be after issue time and no more than 24 hours later');
  }

  const { candidate, firstParty } = validateCandidate(candidateBytes, replayedCandidateBytes);
  const trust = validateTrustChain({
    authoritySetBytes,
    candidate,
    ownerRootMetadataBytes,
    ownerPublicKeyPem,
    ownerTrustRootBytes,
    trustAnchorBytes,
  });
  const candidateSha256 = sha256(candidateBytes);
  const ownerTrustAnchorSha256 = sha256(trustAnchorBytes);
  const ownerTrustRootSha256 = sha256(ownerTrustRootBytes);
  const payload = {
    schemaVersion: 2,
    environment: 'PRODUCTION',
    action: STATIC_RIGHTS_ACTION,
    dependencyId: 'FIRST_PARTY',
    ownerId: 'FITAPPLIANCE_OWNER',
    inventoryId: candidate.inventoryId,
    scopeHash: firstParty.scopeHash,
    sourceObjectHash: firstParty.sourceObjectHash,
    candidateId: candidate.candidateId,
    candidateSha256,
    authoritySetId: trust.authoritySetId,
    authoritySetSha256: trust.authoritySetSha256,
    ownerRootId: trust.anchor.ownerRootId,
    ownerPublicKeyFingerprintSha256: trust.fingerprint,
    ownerTrustAnchorSha256,
    toolchainContractSha256: candidate.toolchainContractSha256,
    candidateGeneratorSha256: candidate.candidateGeneratorSha256,
    routeConfigSha256: candidate.routeConfigSha256,
    publicEvidenceManifestSha256: candidate.publicEvidenceManifestSha256,
    withdrawalGenesisSha256: sha256(Buffer.from(canonicalJson(candidate.withdrawalGenesis))),
    issuedAt,
    expiresAt,
  };
  const requestPayload = {
    schemaVersion: 2,
    state: 'UNSIGNED',
    algorithm: 'Ed25519',
    encoding: 'base64',
    candidateId: candidate.candidateId,
    candidateSha256,
    ownerRootId: trust.anchor.ownerRootId,
    ownerPublicKeyFingerprintSha256: trust.fingerprint,
    ownerTrustAnchorSha256,
    ownerTrustRootSha256,
    authoritySetId: trust.authoritySetId,
    authoritySetSha256: trust.authoritySetSha256,
    payload,
  };
  return Object.freeze({
    ...requestPayload,
    requestId: semanticId('fitappliance.owner-attestation-request', 2, requestPayload),
  });
}

function rejectSymlinkedAncestors(absolutePath, label) {
  const root = path.parse(absolutePath).root;
  const parts = absolutePath.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      fail('INPUT_PATH_INVALID', `${label} ancestor is unavailable`);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('INPUT_PATH_INVALID', `${label} ancestors must be real directories`);
    }
  }
}

function sameFileState(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function readStableInput(inputPath, label, {
  privateParent = true,
  allowedModes = [0o400, 0o600],
} = {}) {
  const requestedPath = path.resolve(inputPath);
  rejectSymlinkedAncestors(requestedPath, label);
  const requestedParent = path.dirname(requestedPath);
  let parentStat;
  let canonicalParent;
  try {
    parentStat = lstatSync(requestedParent);
    canonicalParent = realpathSync(requestedParent);
  } catch {
    fail('INPUT_PATH_INVALID', `${label} parent directory is unavailable`);
  }
  const ownerId = typeof process.getuid === 'function' ? process.getuid() : parentStat.uid;
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail('INPUT_PATH_INVALID', `${label} parent must be a real directory`);
  }
  if (parentStat.uid !== ownerId
    || (privateParent ? (parentStat.mode & 0o777) !== 0o700 : (parentStat.mode & 0o022) !== 0)) {
    fail('INPUT_PERMISSIONS_INVALID', `${label} parent permissions are unsafe`);
  }
  const absolutePath = path.join(canonicalParent, path.basename(requestedPath));
  let descriptor;
  try {
    const before = lstatSync(absolutePath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
      fail('INPUT_PATH_INVALID', `${label} must be a single-link regular file`);
    }
    if (before.uid !== ownerId || !allowedModes.includes(before.mode & 0o777)) {
      fail('INPUT_PERMISSIONS_INVALID', `${label} permissions are outside the allowed read policy`);
    }
    descriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !sameFileState(before, opened)) {
      fail('INPUT_PATH_INVALID', `${label} changed during open`);
    }
    const bytes = readFileSync(descriptor);
    const openedAfterRead = fstatSync(descriptor);
    const after = lstatSync(absolutePath);
    if (!sameFileState(opened, openedAfterRead) || !sameFileState(opened, after)
      || after.isSymbolicLink() || bytes.length !== opened.size) {
      fail('INPUT_PATH_INVALID', `${label} changed during read`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof OwnerAttestationRequestError) throw error;
    fail('INPUT_PATH_INVALID', `${label} cannot be read safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCli(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf('=');
    const name = separator === -1 ? argument : argument.slice(0, separator);
    if (/private[-_]key/i.test(name)) {
      fail('PRIVATE_KEY_ARGUMENT_FORBIDDEN', 'Private-key arguments are forbidden');
    }
    if (!CLI_NAMES.has(name) || separator === -1 || !argument.slice(separator + 1) || values.has(name)) {
      fail('CLI_ARGUMENT_INVALID', `Unknown, duplicate, or malformed argument: ${argument}`);
    }
    values.set(name, argument.slice(separator + 1));
  }
  const missing = [...CLI_NAMES].filter((name) => !values.has(name));
  if (missing.length) fail('CLI_ARGUMENT_MISSING', `Missing required arguments: ${missing.join(', ')}`);
  return values;
}

export function runOwnerAttestationRequestCli({
  argv,
  repoRoot = process.cwd(),
  replayUnsignedCandidate = replayCurrentUnsignedStaticRightsCandidate,
}) {
  const args = parseCli(argv);
  const authoritySetBytes = readStableInput(args.get('--authority-set'), 'Authority set', {
    privateParent: false,
    allowedModes: [0o400, 0o444, 0o600, 0o644],
  });
  const candidateBytes = readStableInput(args.get('--candidate'), 'Signing candidate');
  const ownerRootMetadataBytes = readStableInput(args.get('--owner-metadata'), 'Owner root metadata', {
    allowedModes: [0o400, 0o444, 0o600],
  });
  const ownerPublicKeyPem = readStableInput(args.get('--owner-public-key'), 'Owner public key', {
    allowedModes: [0o400, 0o444, 0o600],
  }).toString('utf8');
  const ownerTrustRootBytes = readStableInput(args.get('--owner-trust-root'), 'Owner trust root', {
    allowedModes: [0o400, 0o444, 0o600],
  });
  const trustAnchorBytes = readStableInput(args.get('--trust-anchor'), 'Owner trust anchor', {
    privateParent: false,
    allowedModes: [0o400, 0o444, 0o600, 0o644],
  });
  const replayedCandidate = replayUnsignedCandidate({ repoRoot });
  const replayedCandidateBytes = Buffer.from(canonicalJson(replayedCandidate, {
    sortedArrays: CANDIDATE_SORTED_ARRAYS,
  }));
  const request = buildOwnerAttestationRequest({
    authoritySetBytes,
    candidateBytes,
    replayedCandidateBytes,
    ownerRootMetadataBytes,
    ownerPublicKeyPem,
    ownerTrustRootBytes,
    trustAnchorBytes,
    issuedAt: args.get('--issued-at'),
    expiresAt: args.get('--expires-at'),
  });
  const result = writeCanonicalCandidateFile(args.get('--output'), request);
  return { outputPath: path.resolve(args.get('--output')), requestId: request.requestId, result, state: request.state };
}

function main() {
  const result = runOwnerAttestationRequestCli({ argv: process.argv.slice(2) });
  process.stdout.write(canonicalJson(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'OWNER_ATTESTATION_REQUEST_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
