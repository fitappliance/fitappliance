import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  OwnerAttestationRequestError,
  buildOwnerAttestationRequest,
  runOwnerAttestationRequestCli,
} from '../scripts/deployment/prepare-owner-attestation-request.mjs';
import { canonicalJson, semanticId } from '../src/domain/static-publication-rights.mjs';
import {
  OFFLINE_SIGNER_BOUND_FILES,
  buildOfflineSignerContract,
} from '../src/domain/offline-owner-signer-contract.mjs';

const ISSUED_AT = '2026-08-10T16:00:00.000Z';
const EXPIRES_AT = '2026-08-10T17:00:00.000Z';
const HEX = Object.fromEntries('abcdefghijklm'.split('').map((letter) => [
  letter,
  createHash('sha256').update(letter).digest('hex'),
]));
const DEPENDENCY_IDS = [
  'ENERGY_RATING_CC_BY',
  'FIRST_PARTY',
  'GOOGLE_VERIFICATION',
  'OUTFIT_FONT',
  'WEB_VITALS_APACHE_2',
];
const CANDIDATE_SORTED_ARRAYS = [
  'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
  'dependencies', 'evidenceHashes', 'forbiddenDependencies',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fingerprint(publicKeyPem) {
  return sha256(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }));
}

function exactCandidate({ authoritySetId, authoritySetSha256, ownerTrustAnchorSha256, ...overrides }) {
  const dependencies = DEPENDENCY_IDS.map((dependencyId, index) => ({
    attributionObligationIds: dependencyId === 'ENERGY_RATING_CC_BY'
      ? ['ENERGY_RATING_CC_BY_ATTRIBUTION']
      : [],
    dependencyId,
    evidenceHashes: dependencyId === 'FIRST_PARTY' ? [] : [Object.values(HEX)[index]],
    pathCount: index + 1,
    scopeHash: dependencyId === 'FIRST_PARTY' ? HEX.h : Object.values(HEX)[index + 1],
    sourceObjectHash: dependencyId === 'FIRST_PARTY' ? HEX.i : Object.values(HEX)[index + 2],
    status: dependencyId === 'FIRST_PARTY' ? 'OWNER_ATTESTATION_REQUIRED' : 'EVIDENCE_REPLAYED',
  }));
  const payload = {
    attributionFulfillments: [],
    authoritySetId,
    authoritySetSha256,
    blockers: ['EXPLICIT_SIGNING_APPROVAL_REQUIRED', 'OWNER_ATTESTATION_REQUIRED'],
    candidateGeneratorSha256: HEX.c,
    classifierId: 'fitappliance.static-rights-classifier/v1',
    constraints: {
      allowedDependencies: DEPENDENCY_IDS,
      environment: 'PRODUCTION',
      forbiddenDependencies: ['RETAILER_FEED'],
      privateEvidenceAccess: 'PROHIBITED',
      signatureState: 'UNSIGNED',
    },
    dependencies,
    inventoryId: HEX.g,
    ownerTrustAnchorSha256,
    ownerTrustRootSha256: null,
    publicEvidenceManifestSha256: HEX.d,
    routeConfigSha256: HEX.e,
    schemaVersion: 3,
    status: 'BLOCKED_OWNER_ATTESTATION',
    toolchainContractSha256: HEX.f,
    offlineSignerContractId: HEX.j,
    offlineSignerContractSha256: HEX.k,
    ownerAcceptance: null,
    withdrawalGenesis: {
      schemaVersion: 1,
      environment: 'PRODUCTION',
      events: [],
      heads: [],
    },
    ...overrides,
  };
  return {
    ...payload,
    candidateId: semanticId('fitappliance.static-rights-signing-candidate', 3, payload, {
      sortedArrays: CANDIDATE_SORTED_ARRAYS,
    }),
  };
}

function fixture() {
  const owner = generateKeyPairSync('ed25519');
  const reviewer = generateKeyPairSync('ed25519');
  const ownerPublicKeyPem = owner.publicKey.export({ type: 'spki', format: 'pem' });
  const authorities = [{
    actions: ['PUBLIC_STATIC_DISTRIBUTION'],
    issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER',
    keyId: 'FITAPPLIANCE_RIGHTS_TEST_KEY',
    publicKey: reviewer.publicKey.export({ type: 'spki', format: 'pem' }),
    roles: ['RIGHTS_REVIEWER'],
  }];
  const authorityEnrollmentPayload = { schemaVersion: 1, environment: 'PRODUCTION', authorities };
  const authoritySetHash = semanticId(
    'fitappliance.static-publication-authority-set',
    1,
    authorityEnrollmentPayload,
    { sortedArrays: ['authorities'] },
  );
  const authoritySet = {
    ...authorityEnrollmentPayload,
    trustRootEnrollment: {
      authoritySetHash,
      signature: sign(null, Buffer.from(canonicalJson({ authoritySetHash })), owner.privateKey).toString('base64'),
    },
  };
  const authoritySetBytes = Buffer.from(canonicalJson(authoritySet, { sortedArrays: ['authorities'] }));
  const ownerRootMetadata = {
    algorithm: 'Ed25519',
    authoritySetHash,
    createdAt: '2026-08-10T14:00:00.000Z',
    environment: 'PRODUCTION',
    publicKeyFingerprintSha256: fingerprint(ownerPublicKeyPem),
    rootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    schemaVersion: 1,
  };
  const ownerRootMetadataBytes = Buffer.from(canonicalJson(ownerRootMetadata));
  const ownerTrustRoot = { source: 'INJECTED_READ_ONLY', publicKey: ownerPublicKeyPem };
  const ownerTrustRootBytes = Buffer.from(canonicalJson(ownerTrustRoot));
  const trustAnchor = {
    algorithm: 'Ed25519',
    authoritySetEnrollmentHash: authoritySetHash,
    environment: 'PRODUCTION',
    ownerPublicKeyFingerprintSha256: ownerRootMetadata.publicKeyFingerprintSha256,
    ownerPublicKeyPemSha256: sha256(Buffer.from(ownerPublicKeyPem)),
    ownerRootId: ownerRootMetadata.rootId,
    ownerRootMetadataSha256: sha256(ownerRootMetadataBytes),
    schemaVersion: 1,
    trustRootSha256: sha256(ownerTrustRootBytes),
  };
  const trustAnchorBytes = Buffer.from(canonicalJson(trustAnchor));
  const offlineSignerContract = buildOfflineSignerContract({
    nodeVersion: process.versions.node,
    trustAnchor: { path: 'deployment/static-owner-trust-anchor.json', sha256: sha256(trustAnchorBytes) },
    boundFiles: OFFLINE_SIGNER_BOUND_FILES.map((filePath) => ({ path: filePath, sha256: sha256(filePath) })),
  });
  const offlineSignerContractBytes = Buffer.from(canonicalJson(offlineSignerContract));
  const candidate = exactCandidate({
    authoritySetId: semanticId(
      'fitappliance.static-publication-authority-set',
      1,
      authoritySet,
      { sortedArrays: ['authorities'] },
    ),
    authoritySetSha256: sha256(authoritySetBytes),
    ownerTrustAnchorSha256: sha256(trustAnchorBytes),
    offlineSignerContractId: offlineSignerContract.contractId,
    offlineSignerContractSha256: sha256(offlineSignerContractBytes),
  });
  const candidateBytes = Buffer.from(canonicalJson(candidate, { sortedArrays: CANDIDATE_SORTED_ARRAYS }));
  return {
    authoritySet,
    authoritySetBytes,
    candidate,
    candidateBytes,
    replayedCandidateBytes: candidateBytes,
    ownerPublicKeyPem,
    ownerRootMetadata,
    ownerRootMetadataBytes,
    ownerTrustRoot,
    ownerTrustRootBytes,
    trustAnchor,
    trustAnchorBytes,
    offlineSignerContract,
    offlineSignerContractBytes,
  };
}

function build(input = fixture(), overrides = {}) {
  return buildOwnerAttestationRequest({
    authoritySetBytes: input.authoritySetBytes,
    candidateBytes: input.candidateBytes,
    replayedCandidateBytes: input.replayedCandidateBytes,
    ownerRootMetadataBytes: input.ownerRootMetadataBytes,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
    ownerTrustRootBytes: input.ownerTrustRootBytes,
    trustAnchorBytes: input.trustAnchorBytes,
    offlineSignerContractBytes: input.offlineSignerContractBytes,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

function assertCode(code) {
  return (error) => {
    assert.equal(error instanceof OwnerAttestationRequestError, true);
    assert.equal(error.code, code);
    return true;
  };
}

function privateCliFixture() {
  const input = fixture();
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-owner-request-'));
  chmodSync(root, 0o700);
  const paths = {
    authoritySet: path.join(root, 'authority-set.json'),
    candidate: path.join(root, 'candidate.json'),
    metadata: path.join(root, 'owner-root.json'),
    publicKey: path.join(root, 'owner-root.pem'),
    trustRoot: path.join(root, 'trust-root.json'),
    trustAnchor: path.join(root, 'trust-anchor.json'),
    signerContract: path.join(root, 'offline-signer-contract.json'),
    output: path.join(root, 'request.json'),
  };
  writeFileSync(paths.authoritySet, input.authoritySetBytes, { mode: 0o644 });
  writeFileSync(paths.candidate, input.candidateBytes, { mode: 0o600 });
  writeFileSync(paths.metadata, input.ownerRootMetadataBytes, { mode: 0o600 });
  writeFileSync(paths.publicKey, input.ownerPublicKeyPem, { mode: 0o600 });
  writeFileSync(paths.trustRoot, input.ownerTrustRootBytes, { mode: 0o600 });
  writeFileSync(paths.trustAnchor, input.trustAnchorBytes, { mode: 0o644 });
  writeFileSync(paths.signerContract, input.offlineSignerContractBytes, { mode: 0o644 });
  return { input, root, paths };
}

function cliArgs(paths, extra = []) {
  return [
    `--authority-set=${paths.authoritySet}`,
    `--candidate=${paths.candidate}`,
    `--owner-metadata=${paths.metadata}`,
    `--owner-public-key=${paths.publicKey}`,
    `--owner-trust-root=${paths.trustRoot}`,
    `--trust-anchor=${paths.trustAnchor}`,
    `--signer-contract=${paths.signerContract}`,
    `--issued-at=${ISSUED_AT}`,
    `--expires-at=${EXPIRES_AT}`,
    `--output=${paths.output}`,
    ...extra,
  ];
}

function runCli(input) {
  return runOwnerAttestationRequestCli({
    argv: cliArgs(input.paths),
    repoRoot: input.root,
    replayUnsignedCandidate: () => input.input.candidate,
  });
}

test('builds a deterministic unsigned request whose payload binds the full replayed candidate', () => {
  const input = fixture();
  const first = build(input);
  const second = build(input);
  const firstParty = input.candidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY');

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 3);
  assert.equal(first.state, 'UNSIGNED');
  assert.equal(Object.hasOwn(first, 'signature'), false);
  assert.deepEqual(first.payload, {
    schemaVersion: 3,
    environment: 'PRODUCTION',
    action: 'PUBLIC_STATIC_DISTRIBUTION',
    dependencyId: 'FIRST_PARTY',
    ownerId: 'FITAPPLIANCE_OWNER',
    inventoryId: input.candidate.inventoryId,
    scopeHash: firstParty.scopeHash,
    sourceObjectHash: firstParty.sourceObjectHash,
    candidateId: input.candidate.candidateId,
    candidateSha256: sha256(input.candidateBytes),
    authoritySetId: input.candidate.authoritySetId,
    authoritySetSha256: sha256(input.authoritySetBytes),
    ownerRootId: input.ownerRootMetadata.rootId,
    ownerPublicKeyFingerprintSha256: input.ownerRootMetadata.publicKeyFingerprintSha256,
    ownerTrustAnchorSha256: sha256(input.trustAnchorBytes),
    toolchainContractSha256: input.candidate.toolchainContractSha256,
    candidateGeneratorSha256: input.candidate.candidateGeneratorSha256,
    routeConfigSha256: input.candidate.routeConfigSha256,
    publicEvidenceManifestSha256: input.candidate.publicEvidenceManifestSha256,
    withdrawalGenesisSha256: sha256(Buffer.from(canonicalJson(input.candidate.withdrawalGenesis))),
    offlineSignerContractId: input.offlineSignerContract.contractId,
    offlineSignerContractSha256: sha256(input.offlineSignerContractBytes),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.equal(first.requestId, semanticId('fitappliance.owner-attestation-request', 3, {
    schemaVersion: first.schemaVersion,
    state: first.state,
    algorithm: first.algorithm,
    encoding: first.encoding,
    candidateId: first.candidateId,
    candidateSha256: first.candidateSha256,
    ownerRootId: first.ownerRootId,
    ownerPublicKeyFingerprintSha256: first.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: first.ownerTrustAnchorSha256,
    ownerTrustRootSha256: first.ownerTrustRootSha256,
    authoritySetId: first.authoritySetId,
    authoritySetSha256: first.authoritySetSha256,
    offlineSignerContractId: first.offlineSignerContractId,
    offlineSignerContractSha256: first.offlineSignerContractSha256,
    payload: first.payload,
  }));
});

test('rejects an attacker-made self-consistent candidate that differs from current replay', () => {
  const input = fixture();
  const attackerCandidate = exactCandidate({
    authoritySetId: input.candidate.authoritySetId,
    authoritySetSha256: input.candidate.authoritySetSha256,
    ownerTrustAnchorSha256: input.candidate.ownerTrustAnchorSha256,
    inventoryId: HEX.m,
  });
  input.candidateBytes = Buffer.from(canonicalJson(attackerCandidate, { sortedArrays: CANDIDATE_SORTED_ARRAYS }));
  assert.throws(() => build(input), assertCode('CANDIDATE_REPLAY_MISMATCH'));
});

test('rejects semantic tampering, dependency drift, and private markers even after replay', () => {
  const tampered = fixture();
  const tamperedValue = { ...tampered.candidate, inventoryId: HEX.m };
  tampered.candidateBytes = Buffer.from(canonicalJson(tamperedValue, { sortedArrays: CANDIDATE_SORTED_ARRAYS }));
  tampered.replayedCandidateBytes = tampered.candidateBytes;
  assert.throws(() => build(tampered), assertCode('CANDIDATE_ID_INVALID'));

  const dependencyDrift = fixture();
  const drifted = exactCandidate({
    authoritySetId: dependencyDrift.candidate.authoritySetId,
    authoritySetSha256: dependencyDrift.candidate.authoritySetSha256,
    ownerTrustAnchorSha256: dependencyDrift.candidate.ownerTrustAnchorSha256,
    dependencies: dependencyDrift.candidate.dependencies.slice(1),
  });
  dependencyDrift.candidateBytes = Buffer.from(canonicalJson(drifted, { sortedArrays: CANDIDATE_SORTED_ARRAYS }));
  dependencyDrift.replayedCandidateBytes = dependencyDrift.candidateBytes;
  assert.throws(() => build(dependencyDrift), assertCode('CANDIDATE_DEPENDENCIES_INVALID'));

  const privateMarker = fixture();
  const marked = exactCandidate({
    authoritySetId: privateMarker.candidate.authoritySetId,
    authoritySetSha256: privateMarker.candidate.authoritySetSha256,
    ownerTrustAnchorSha256: privateMarker.candidate.ownerTrustAnchorSha256,
    attributionFulfillments: [{ path: 'partnerize/private-feed.csv' }],
  });
  privateMarker.candidateBytes = Buffer.from(canonicalJson(marked, { sortedArrays: CANDIDATE_SORTED_ARRAYS }));
  privateMarker.replayedCandidateBytes = privateMarker.candidateBytes;
  assert.throws(() => build(privateMarker), assertCode('PRIVATE_MARKER_FORBIDDEN'));
});

test('rejects a substituted owner root, trust anchor, or authority enrollment', () => {
  const rootSubstitution = fixture();
  const otherOwner = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  rootSubstitution.ownerPublicKeyPem = otherOwner;
  assert.throws(() => build(rootSubstitution), assertCode('OWNER_PUBLIC_KEY_INVALID'));

  const anchorSubstitution = fixture();
  const otherAnchor = { ...anchorSubstitution.trustAnchor, ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_OTHER' };
  anchorSubstitution.trustAnchorBytes = Buffer.from(canonicalJson(otherAnchor));
  assert.throws(() => build(anchorSubstitution), assertCode('TRUST_ANCHOR_INVALID'));

  const invalidEnrollment = fixture();
  invalidEnrollment.authoritySet.trustRootEnrollment.signature = Buffer.alloc(64).toString('base64');
  invalidEnrollment.authoritySetBytes = Buffer.from(canonicalJson(invalidEnrollment.authoritySet, {
    sortedArrays: ['authorities'],
  }));
  assert.throws(() => build(invalidEnrollment), assertCode('AUTHORITY_SET_INVALID'));
});

test('requires canonical issue and expiry times within a 24 hour window', () => {
  const input = fixture();
  for (const issuedAt of [undefined, '', '2026-08-10T16:00:00Z', 'not-a-date']) {
    assert.throws(() => build(input, { issuedAt }), assertCode('ISSUED_AT_INVALID'));
  }
  for (const expiresAt of [
    '2026-08-10T16:00:00.000Z',
    '2026-08-11T16:00:00.001Z',
    '2026-08-10T17:00:00Z',
    'not-a-date',
  ]) {
    assert.throws(() => build(input, { expiresAt }), assertCode('EXPIRES_AT_INVALID'));
  }
});

test('CLI writes a private canonical request and is byte-idempotent for an exact replay', () => {
  const input = privateCliFixture();
  chmodSync(input.paths.metadata, 0o444);
  chmodSync(input.paths.publicKey, 0o444);
  chmodSync(input.paths.trustRoot, 0o444);

  const first = runCli(input);
  const firstBytes = readFileSync(input.paths.output);
  assert.equal(first.result, 'CREATED');
  assert.equal(firstBytes.toString('utf8'), canonicalJson(JSON.parse(firstBytes)));
  assert.equal(statSync(input.paths.output).mode & 0o777, 0o600);
  assert.equal(runCli(input).result, 'UNCHANGED');
  assert.deepEqual(readFileSync(input.paths.output), firstBytes);
});

test('CLI rejects malformed arguments, private-key arguments, and unsafe input paths', () => {
  const unknown = privateCliFixture();
  assert.throws(() => runOwnerAttestationRequestCli({
    argv: cliArgs(unknown.paths, ['--wat=yes']),
    replayUnsignedCandidate: () => unknown.input.candidate,
  }), assertCode('CLI_ARGUMENT_INVALID'));

  const privateKey = privateCliFixture();
  assert.throws(() => runOwnerAttestationRequestCli({
    argv: cliArgs(privateKey.paths, ['--private-key=/never/read']),
    replayUnsignedCandidate: () => privateKey.input.candidate,
  }), assertCode('PRIVATE_KEY_ARGUMENT_FORBIDDEN'));

  const linkedFile = privateCliFixture();
  const realCandidate = path.join(linkedFile.root, 'real-candidate.json');
  writeFileSync(realCandidate, linkedFile.input.candidateBytes, { mode: 0o600 });
  unlinkSync(linkedFile.paths.candidate);
  symlinkSync(realCandidate, linkedFile.paths.candidate);
  assert.throws(() => runCli(linkedFile), assertCode('INPUT_PATH_INVALID'));

  const linkedAncestor = privateCliFixture();
  const realParent = path.join(linkedAncestor.root, 'real-parent');
  const linkedParent = path.join(linkedAncestor.root, 'linked-parent');
  mkdirSync(realParent, { mode: 0o700 });
  const linkedCandidate = path.join(realParent, 'candidate.json');
  writeFileSync(linkedCandidate, linkedAncestor.input.candidateBytes, { mode: 0o600 });
  symlinkSync(realParent, linkedParent, 'dir');
  linkedAncestor.paths.candidate = path.join(linkedParent, 'candidate.json');
  assert.throws(() => runCli(linkedAncestor), assertCode('INPUT_PATH_INVALID'));

  const broad = privateCliFixture();
  chmodSync(broad.paths.metadata, 0o666);
  assert.throws(() => runCli(broad), assertCode('INPUT_PERMISSIONS_INVALID'));
});

test('CLI rejects output symlinks, hardlinks, broad files, and broad parents', () => {
  const symlinked = privateCliFixture();
  const outside = path.join(symlinked.root, 'outside.json');
  writeFileSync(outside, '{}\n', { mode: 0o600 });
  symlinkSync(outside, symlinked.paths.output);
  assert.throws(() => runCli(symlinked), (error) => error?.code === 'OUTPUT_PATH_INVALID');

  const hardlinked = privateCliFixture();
  const linkedOutput = path.join(hardlinked.root, 'linked.json');
  writeFileSync(linkedOutput, '{}\n', { mode: 0o600 });
  linkSync(linkedOutput, hardlinked.paths.output);
  assert.throws(() => runCli(hardlinked), (error) => error?.code === 'OUTPUT_PATH_INVALID');

  const broadFile = privateCliFixture();
  writeFileSync(broadFile.paths.output, '{}\n', { mode: 0o644 });
  assert.throws(() => runCli(broadFile), (error) => error?.code === 'OUTPUT_PERMISSIONS_INVALID');

  const broadParent = privateCliFixture();
  const outputParent = path.join(broadParent.root, 'broad');
  mkdirSync(outputParent, { mode: 0o755 });
  broadParent.paths.output = path.join(outputParent, 'request.json');
  assert.throws(() => runCli(broadParent), (error) => error?.code === 'OUTPUT_PERMISSIONS_INVALID');
});
