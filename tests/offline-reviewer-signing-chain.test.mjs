import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STATIC_RIGHTS_ACTION,
  PRODUCTION_STATIC_RIGHTS_DEPENDENCIES,
  buildDependencyScopeHash,
  canonicalJson,
  semanticId,
  validateDecisionRegistry,
} from '../src/domain/static-publication-rights.mjs';
import {
  canonicalOwnerJson,
  ownerSemanticId,
} from '../src/domain/owner-attestation-request-contract.mjs';
import { buildOwnerAttestationAcceptanceReceipt } from '../scripts/deployment/accept-owner-attestation.mjs';
import {
  buildReviewerArtifactRequest,
  canonicalReviewerJson,
  deriveExpectedReviewerArtifact,
  reviewerSemanticId,
  validateReviewerArtifactRequest,
} from '../src/domain/reviewer-artifact-request-contract.mjs';
import {
  buildOfflineReviewerSignerContract,
  validateOfflineReviewerSignerContract,
} from '../src/domain/offline-reviewer-signer-contract.mjs';
import {
  buildOfflineSignerBootstrapAuthorization,
  validateOfflineSignerBootstrapAuthorization,
} from '../src/domain/offline-signer-bootstrap-contract.mjs';
import { signReviewerArtifact } from '../scripts/deployment/sign-static-rights-reviewer-artifact.mjs';
import { prepareReviewerArtifactRequest } from '../scripts/deployment/prepare-reviewer-artifact-request.mjs';
import {
  acceptWithdrawalGenesis,
  finalizeStaticRightsGeneration,
} from '../scripts/deployment/finalize-static-rights-generation.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const H = (label) => sha256(label);
const DECISION_AS_OF = '2026-08-11T08:00:00.000Z';
const ACCEPTANCE_NOW = '2026-08-11T08:30:00.000Z';
const REQUEST_ISSUED = '2026-08-11T08:15:00.000Z';
const REQUEST_EXPIRES = '2026-08-11T09:15:00.000Z';

function ownerReceipt({
  owner, trustRootBytes, candidateId, candidateSha256, inventoryId, authoritySetId, authoritySetSha256,
  withdrawalGenesisSha256, scopeHash, sourceObjectHash, ownerTrustAnchorSha256,
}) {
  const payload = {
    schemaVersion: 3,
    environment: 'PRODUCTION',
    action: STATIC_RIGHTS_ACTION,
    dependencyId: 'FIRST_PARTY',
    ownerId: 'FITAPPLIANCE_OWNER',
    inventoryId,
    scopeHash,
    sourceObjectHash,
    candidateId,
    candidateSha256,
    authoritySetId,
    authoritySetSha256,
    ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    ownerPublicKeyFingerprintSha256: sha256(owner.publicKey.export({ type: 'spki', format: 'der' })),
    ownerTrustAnchorSha256,
    toolchainContractSha256: H('toolchain'),
    candidateGeneratorSha256: H('candidate-generator'),
    routeConfigSha256: H('routes'),
    publicEvidenceManifestSha256: H('evidence-manifest'),
    withdrawalGenesisSha256,
    offlineSignerContractId: H('owner-contract-id'),
    offlineSignerContractSha256: H('owner-contract-bytes'),
    issuedAt: '2026-08-11T07:00:00.000Z',
    expiresAt: '2026-08-11T10:00:00.000Z',
  };
  const unsigned = {
    schemaVersion: 3,
    state: 'UNSIGNED',
    algorithm: 'Ed25519',
    encoding: 'base64',
    candidateId,
    candidateSha256,
    ownerRootId: payload.ownerRootId,
    ownerPublicKeyFingerprintSha256: payload.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: payload.ownerTrustAnchorSha256,
    ownerTrustRootSha256: sha256(trustRootBytes),
    authoritySetId: payload.authoritySetId,
    authoritySetSha256: payload.authoritySetSha256,
    offlineSignerContractId: payload.offlineSignerContractId,
    offlineSignerContractSha256: payload.offlineSignerContractSha256,
    payload,
  };
  const request = {
    ...unsigned,
    requestId: ownerSemanticId('fitappliance.owner-attestation-request', 3, unsigned),
  };
  const requestBytes = Buffer.from(canonicalOwnerJson(request));
  const attestationBytes = Buffer.from(canonicalOwnerJson({
    payload,
    signature: sign(null, Buffer.from(canonicalOwnerJson(payload)), owner.privateKey).toString('base64'),
  }));
  return buildOwnerAttestationAcceptanceReceipt({
    requestBytes,
    attestationBytes,
    ownerPublicKeyPem: owner.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    now: () => new Date('2026-08-11T07:30:00.000Z'),
  });
}

function fixture() {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-reviewer-chain-'));
  chmodSync(root, 0o700);
  const owner = generateKeyPairSync('ed25519');
  const reviewer = generateKeyPairSync('ed25519');
  const ownerPublicKeyPem = owner.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const reviewerPublicKeyPem = reviewer.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const ownerTrustRoot = { source: 'INJECTED_READ_ONLY', publicKey: ownerPublicKeyPem };
  const ownerTrustRootBytes = Buffer.from(canonicalOwnerJson(ownerTrustRoot));
  const authorityPayload = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    authorities: [{
      actions: [STATIC_RIGHTS_ACTION],
      issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER_2026_01',
      keyId: 'FITAPPLIANCE_RIGHTS_REVIEWER_KEY_2026_01',
      publicKey: reviewerPublicKeyPem,
      roles: ['RIGHTS_REVIEWER'],
    }],
  };
  const authoritySetHash = semanticId(
    'fitappliance.static-publication-authority-set', 1, authorityPayload, { sortedArrays: ['authorities'] },
  );
  const authoritySet = {
    ...authorityPayload,
    trustRootEnrollment: {
      authoritySetHash,
      signature: sign(null, Buffer.from(canonicalJson({ authoritySetHash })), owner.privateKey).toString('base64'),
    },
  };
  const authoritySetBytes = Buffer.from(canonicalJson(authoritySet, { sortedArrays: ['authorities'] }));
  const ownerTrustAnchor = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    algorithm: 'Ed25519',
    ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    ownerPublicKeyFingerprintSha256: sha256(owner.publicKey.export({ type: 'spki', format: 'der' })),
    ownerPublicKeyPemSha256: sha256(Buffer.from(ownerPublicKeyPem)),
    ownerRootMetadataSha256: H('owner-root-metadata'),
    trustRootSha256: sha256(ownerTrustRootBytes),
    authoritySetEnrollmentHash: authoritySetHash,
  };
  const ownerTrustAnchorBytes = Buffer.from(canonicalReviewerJson(ownerTrustAnchor));
  const reviewerMetadata = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    issuerId: authorityPayload.authorities[0].issuerId,
    keyId: authorityPayload.authorities[0].keyId,
    role: 'RIGHTS_REVIEWER',
    action: STATIC_RIGHTS_ACTION,
    algorithm: 'Ed25519',
    publicKeyFingerprintSha256: sha256(reviewer.publicKey.export({ type: 'spki', format: 'der' })),
  };
  const reviewerMetadataBytes = Buffer.from(canonicalReviewerJson(reviewerMetadata));
  const inventory = {
    schemaVersion: 1,
    rows: PRODUCTION_STATIC_RIGHTS_DEPENDENCIES.map((dependencyId, index) => ({
      path: `public/fixture-${index}.txt`,
      sha256: H(`source-${dependencyId}`),
      size: 1,
      mode: '100644',
      blobOid: H(`blob-${dependencyId}`),
    })),
  };
  inventory.staticSourceInventoryId = semanticId('fitappliance.static-source-inventory', 1, {
    schemaVersion: 1,
    rows: inventory.rows,
  }, { sortedArrays: ['rows'] });
  const authoritySetId = semanticId(
    'fitappliance.static-publication-authority-set', 1, authoritySet, { sortedArrays: ['authorities'] },
  );
  const classifiedRows = PRODUCTION_STATIC_RIGHTS_DEPENDENCIES.map((dependencyId, index) => ({
    path: inventory.rows[index].path,
    sourceClass: dependencyId === 'GOOGLE_VERIFICATION' ? 'GOOGLE_VERIFICATION_TOKEN' : 'FIRST_PARTY',
    dependencyIds: [dependencyId],
    provenanceIds: [],
    blockers: [],
  }));
  const dependencies = PRODUCTION_STATIC_RIGHTS_DEPENDENCIES.map((dependencyId, index) => {
    const paths = [inventory.rows[index].path];
    const scopeHash = buildDependencyScopeHash({
      action: STATIC_RIGHTS_ACTION,
      dependencyId,
      inventoryId: inventory.staticSourceInventoryId,
      paths,
    });
    const sourceObjectHash = semanticId('fitappliance.static-rights-source-object-set', 1, {
      schemaVersion: 1,
      dependencyId,
      inventoryId: inventory.staticSourceInventoryId,
      scopeHash,
      objects: [{ path: paths[0], sha256: inventory.rows[index].sha256 }],
    }, { sortedArrays: ['objects'] });
    const evidenceHashes = [H(`evidence-${dependencyId}`)];
    return {
      dependencyId,
      status: 'EVIDENCE_REPLAYED',
      pathCount: 1,
      scopeHash,
      sourceObjectHash,
      evidenceHashes: evidenceHashes.sort(),
      attributionObligationIds: [],
    };
  });
  const genesisPayload = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    issuerId: reviewerMetadata.issuerId,
    keyId: reviewerMetadata.keyId,
    role: reviewerMetadata.role,
    action: STATIC_RIGHTS_ACTION,
    sequence: 0,
    previousHeadHash: null,
    eventIds: [],
    issuedAt: DECISION_AS_OF,
  };
  const withdrawalHeadHash = semanticId('fitappliance.static-rights-withdrawal-head', 1, genesisPayload);
  const withdrawalGenesis = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    events: [],
    heads: [{ withdrawalHeadHash, payload: genesisPayload, signature: null }],
  };
  const receipt = ownerReceipt({
    owner,
    trustRootBytes: ownerTrustRootBytes,
    candidateId: H('unsigned-candidate-id'),
    candidateSha256: H('unsigned-candidate-bytes'),
    inventoryId: inventory.staticSourceInventoryId,
    authoritySetId,
    authoritySetSha256: sha256(authoritySetBytes),
    withdrawalGenesisSha256: sha256(Buffer.from(canonicalReviewerJson(withdrawalGenesis))),
    scopeHash: dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').scopeHash,
    sourceObjectHash: dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').sourceObjectHash,
    ownerTrustAnchorSha256: sha256(ownerTrustAnchorBytes),
  });
  const ownerReceiptBytes = Buffer.from(canonicalOwnerJson(receipt));
  dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').evidenceHashes
    .push(sha256(ownerReceiptBytes));
  dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').evidenceHashes.sort();
  const candidatePayload = {
    schemaVersion: 3,
    status: 'READY_FOR_EXPLICIT_SIGNING_APPROVAL',
    inventoryId: inventory.staticSourceInventoryId,
    classifierId: 'fitappliance.static-rights-classifier/v1',
    authoritySetId,
    authoritySetSha256: sha256(authoritySetBytes),
    ownerTrustAnchorSha256: sha256(ownerTrustAnchorBytes),
    publicEvidenceManifestSha256: H('evidence-manifest'),
    routeConfigSha256: H('routes'),
    toolchainContractSha256: H('toolchain'),
    candidateGeneratorSha256: H('candidate-generator'),
    offlineSignerContractId: H('owner-contract-id'),
    offlineSignerContractSha256: H('owner-contract-bytes'),
    ownerAcceptance: {
      acceptanceId: receipt.acceptanceId,
      acceptanceSha256: sha256(ownerReceiptBytes),
      requestId: receipt.requestId,
      attestationSha256: receipt.attestationSha256,
      acceptedAt: receipt.acceptedAt,
      expiresAt: receipt.expiresAt,
    },
    ownerTrustRootSha256: sha256(ownerTrustRootBytes),
    withdrawalGenesis,
    constraints: {
      environment: 'PRODUCTION',
      allowedDependencies: [...PRODUCTION_STATIC_RIGHTS_DEPENDENCIES],
      forbiddenDependencies: ['RETAILER_FEED'],
      signatureState: 'UNSIGNED',
      privateEvidenceAccess: 'PROHIBITED',
    },
    dependencies,
    attributionFulfillments: [],
    blockers: ['EXPLICIT_SIGNING_APPROVAL_REQUIRED'],
  };
  const candidate = {
    ...candidatePayload,
    candidateId: semanticId('fitappliance.static-rights-signing-candidate', 3, candidatePayload, {
      sortedArrays: [
        'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
        'dependencies', 'evidenceHashes', 'forbiddenDependencies',
      ],
    }),
  };
  const candidateBytes = Buffer.from(canonicalJson(candidate, {
    sortedArrays: [
      'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
      'dependencies', 'evidenceHashes', 'forbiddenDependencies',
    ],
  }));
  const base = {
    candidateBytes,
    ownerReceiptBytes,
    ownerTrustRootBytes,
    ownerTrustAnchorBytes,
    authoritySetBytes,
    reviewerMetadataBytes,
    reviewerPublicKeyPem,
    reviewerSignerContractId: H('reviewer-contract-id'),
    reviewerSignerContractSha256: H('reviewer-contract-bytes'),
  };
  return {
    root, owner, reviewer, reviewerPublicKeyPem, reviewerMetadata, authoritySet, authoritySetBytes,
    ownerTrustRoot, ownerTrustRootBytes, ownerTrustAnchorBytes, ownerReceiptBytes, inventory, classifiedRows, candidate,
    candidateBytes, dependencies, withdrawalHeadHash, base,
  };
}

function deriveGenesis(f, overrides = {}) {
  return deriveExpectedReviewerArtifact({
    ...f.base,
    artifactType: 'WITHDRAWAL_GENESIS_HEAD',
    currentWithdrawalLogBytes: null,
    ...overrides,
  });
}

function signedGenesis(f) {
  const derived = deriveGenesis(f);
  const envelope = {
    withdrawalHeadHash: derived.artifactId,
    payload: derived.payload,
    signature: sign(null, Buffer.from(canonicalReviewerJson(derived.payload)), f.reviewer.privateKey).toString('base64'),
  };
  const log = { schemaVersion: 1, environment: 'PRODUCTION', events: [], heads: [envelope] };
  return { derived, envelope, log, bytes: Buffer.from(canonicalReviewerJson(log)) };
}

function deriveDecision(f, dependencyId, logBytes, overrides = {}) {
  return deriveExpectedReviewerArtifact({
    ...f.base,
    artifactType: 'STATIC_RIGHTS_DECISION',
    currentWithdrawalLogBytes: logBytes,
    dependencyId,
    decisionAsOf: DECISION_AS_OF,
    validFrom: '2026-08-11T07:00:00.000Z',
    validThrough: '2026-08-12T07:00:00.000Z',
    reviewBy: '2026-08-12T07:00:00.000Z',
    ...overrides,
  });
}

function signedDecisions(f, logBytes) {
  return PRODUCTION_STATIC_RIGHTS_DEPENDENCIES.map((dependencyId) => {
    const derived = deriveDecision(f, dependencyId, logBytes);
    return {
      decisionId: derived.artifactId,
      payload: derived.payload,
      signature: sign(null, Buffer.from(canonicalReviewerJson(derived.payload)), f.reviewer.privateKey).toString('base64'),
    };
  });
}

function successorOwnerAcceptanceFixture(f, acceptedAt = '2026-08-11T07:31:00.000Z') {
  const receipt = JSON.parse(f.ownerReceiptBytes.toString('utf8'));
  receipt.acceptedAt = acceptedAt;
  delete receipt.acceptanceId;
  receipt.acceptanceId = ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, receipt);
  const ownerReceiptBytes = Buffer.from(canonicalOwnerJson(receipt));
  const oldReceiptHash = sha256(f.ownerReceiptBytes);
  const newReceiptHash = sha256(ownerReceiptBytes);
  const candidate = structuredClone(f.candidate);
  candidate.ownerAcceptance.acceptanceId = receipt.acceptanceId;
  candidate.ownerAcceptance.acceptanceSha256 = newReceiptHash;
  candidate.ownerAcceptance.acceptedAt = receipt.acceptedAt;
  const firstParty = candidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY');
  firstParty.evidenceHashes = firstParty.evidenceHashes
    .map((hash) => (hash === oldReceiptHash ? newReceiptHash : hash))
    .sort();
  delete candidate.candidateId;
  const candidateArrays = [
    'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
    'dependencies', 'evidenceHashes', 'forbiddenDependencies',
  ];
  candidate.candidateId = semanticId('fitappliance.static-rights-signing-candidate', 3, candidate, {
    sortedArrays: candidateArrays,
  });
  const candidateBytes = Buffer.from(canonicalReviewerJson(candidate, { sortedArrays: candidateArrays }));
  return {
    ...f,
    ownerReceiptBytes,
    candidate,
    candidateBytes,
    dependencies: candidate.dependencies,
    base: { ...f.base, ownerReceiptBytes, candidateBytes },
  };
}

test('pure derivation binds candidate, owner receipt, authority, reviewer identity and withdrawal state', () => {
  const f = fixture();
  const genesis = deriveGenesis(f);
  assert.equal(genesis.artifactType, 'WITHDRAWAL_GENESIS_HEAD');
  assert.equal(genesis.artifactId, f.withdrawalHeadHash);
  const signed = signedGenesis(f);
  const decision = deriveDecision(f, 'FIRST_PARTY', signed.bytes);
  assert.equal(decision.payload.evidenceHashes.includes(sha256(f.ownerReceiptBytes)), true);
  assert.deepEqual(decision.payload.predecessorDecisionId, null);
  assert.deepEqual(decision.payload.supersedesDecisionId, null);
  assert.match(decision.decisionSetId, /^[0-9a-f]{64}$/);
  assert.equal(decision.payload.decisionSetId, decision.decisionSetId);

  const rogueAnchor = JSON.parse(f.ownerTrustAnchorBytes.toString('utf8'));
  rogueAnchor.trustRootSha256 = H('rogue-owner-root');

  for (const [name, drift] of [
    ['candidate', { candidateBytes: Buffer.from(`${f.candidateBytes.toString().trim()} `) }],
    ['owner receipt', { ownerReceiptBytes: Buffer.from(f.ownerReceiptBytes.toString().replace(f.candidate.ownerAcceptance.acceptanceId, H('drift'))) }],
    ['authority', { authoritySetBytes: Buffer.from(f.authoritySetBytes.toString().replace(f.reviewerMetadata.keyId, 'DRIFT_KEY')) }],
    ['reviewer metadata', { reviewerMetadataBytes: Buffer.from(f.base.reviewerMetadataBytes.toString().replace(f.reviewerMetadata.keyId, 'DRIFT_KEY')) }],
    ['owner trust anchor', { ownerTrustAnchorBytes: Buffer.from(canonicalReviewerJson(rogueAnchor)) }],
  ]) {
    assert.throws(() => deriveGenesis(f, drift), undefined, name);
  }
  assert.throws(() => deriveDecision(f, 'FIRST_PARTY', Buffer.from(canonicalReviewerJson({ schemaVersion: 1, environment: 'PRODUCTION', events: [], heads: [] }))));
});

test('owner acceptance binds the exact first-party scope, signer, trust anchor and withdrawal genesis', () => {
  const f = fixture();
  const candidateArrays = [
    'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
    'dependencies', 'evidenceHashes', 'forbiddenDependencies',
  ];
  const bytesAfter = (mutate) => {
    const candidate = structuredClone(f.candidate);
    mutate(candidate);
    delete candidate.candidateId;
    candidate.candidateId = semanticId('fitappliance.static-rights-signing-candidate', 3, candidate, {
      sortedArrays: candidateArrays,
    });
    return Buffer.from(canonicalReviewerJson(candidate, { sortedArrays: candidateArrays }));
  };
  const mutations = [
    (candidate) => { candidate.ownerTrustAnchorSha256 = H('other-owner-anchor'); },
    (candidate) => { candidate.offlineSignerContractId = H('other-owner-contract'); },
    (candidate) => {
      candidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').scopeHash = H('other-owner-scope');
    },
    (candidate) => {
      candidate.withdrawalGenesis.heads[0].payload.issuedAt = '2026-08-11T08:00:01.000Z';
      candidate.withdrawalGenesis.heads[0].withdrawalHeadHash = semanticId(
        'fitappliance.static-rights-withdrawal-head', 1, candidate.withdrawalGenesis.heads[0].payload,
      );
    },
  ];
  for (const mutate of mutations) {
    assert.throws(
      () => deriveGenesis(f, { candidateBytes: bytesAfter(mutate) }),
      (error) => ['OWNER_ACCEPTANCE_INVALID', 'OWNER_TRUST_ANCHOR_INVALID'].includes(error.code),
    );
  }
  const expiredAcceptance = successorOwnerAcceptanceFixture(f, '2026-08-11T10:00:00.000Z');
  assert.throws(
    () => deriveGenesis(expiredAcceptance),
    (error) => error.code === 'OWNER_ACCEPTANCE_INVALID',
  );
});

test('request contract is exact, expires exclusively within 24 hours and rejects artifact confusion', () => {
  const f = fixture();
  const derived = deriveGenesis(f);
  const request = buildReviewerArtifactRequest({
    derived,
    issuedAt: REQUEST_ISSUED,
    expiresAt: REQUEST_EXPIRES,
  });
  const bytes = Buffer.from(canonicalReviewerJson(request));
  assert.deepEqual(validateReviewerArtifactRequest(bytes), request);
  assert.deepEqual(prepareReviewerArtifactRequest({
    ...f.base,
    artifactType: 'WITHDRAWAL_GENESIS_HEAD',
    currentWithdrawalLogBytes: null,
    issuedAt: REQUEST_ISSUED,
    expiresAt: REQUEST_EXPIRES,
  }), request);
  const tooLong = structuredClone(request);
  tooLong.expiresAt = '2026-08-12T08:15:00.001Z';
  assert.throws(() => validateReviewerArtifactRequest(Buffer.from(canonicalReviewerJson(tooLong))));
  const confused = structuredClone(request);
  confused.artifactType = 'STATIC_RIGHTS_DECISION';
  assert.throws(() => validateReviewerArtifactRequest(Buffer.from(canonicalReviewerJson(confused))));

  const genesis = signedGenesis(f);
  const decision = buildReviewerArtifactRequest({
    derived: deriveDecision(f, 'FIRST_PARTY', genesis.bytes),
    issuedAt: REQUEST_ISSUED,
    expiresAt: REQUEST_EXPIRES,
  });
  const staleHead = structuredClone(decision);
  staleHead.currentWithdrawalHeadHash = H('another-current-head');
  delete staleHead.requestId;
  staleHead.requestId = reviewerSemanticId('fitappliance.static-rights-reviewer-request', 1, staleHead);
  assert.throws(
    () => validateReviewerArtifactRequest(Buffer.from(canonicalReviewerJson(staleHead))),
    (error) => error.code === 'ARTIFACT_BINDING_INVALID',
  );
});

test('reviewer signer fails every public drift before secret read and emits only the existing envelope', () => {
  const f = fixture();
  const derived = deriveGenesis(f);
  const request = buildReviewerArtifactRequest({ derived, issuedAt: REQUEST_ISSUED, expiresAt: REQUEST_EXPIRES });
  const requestBytes = Buffer.from(canonicalReviewerJson(request));
  const privatePath = path.join(f.root, 'reviewer-private.pem');
  const outputPath = path.join(f.root, 'genesis-envelope.json');
  writeFileSync(privatePath, f.reviewer.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  for (const override of [
    { expectedRequestId: H('wrong') },
    { expectedArtifactId: H('wrong') },
    { confirmation: 'SIGN_EXACT_OWNER_ATTESTATION' },
    { now: () => new Date(REQUEST_EXPIRES) },
    { derivationInputs: { ...f.base, artifactType: 'WITHDRAWAL_GENESIS_HEAD', currentWithdrawalLogBytes: null, candidateBytes: Buffer.from(`${f.candidateBytes.toString()} `) } },
  ]) {
    let reads = 0;
    assert.throws(() => signReviewerArtifact({
      requestBytes,
      derivationInputs: { ...f.base, artifactType: 'WITHDRAWAL_GENESIS_HEAD', currentWithdrawalLogBytes: null },
      expectedRequestId: request.requestId,
      expectedArtifactId: derived.artifactId,
      confirmation: 'SIGN_EXACT_STATIC_RIGHTS_REVIEWER_ARTIFACT',
      now: () => new Date(ACCEPTANCE_NOW),
      outputPath,
      publicKeyPem: f.reviewerPublicKeyPem,
      privateKeyPath: privatePath,
      signerContract: { id: f.base.reviewerSignerContractId, sha256: f.base.reviewerSignerContractSha256 },
      readPrivateKey: () => { reads += 1; return Buffer.from('forbidden'); },
      ...override,
    }));
    assert.equal(reads, 0);
  }
  const result = signReviewerArtifact({
    requestBytes,
    derivationInputs: { ...f.base, artifactType: 'WITHDRAWAL_GENESIS_HEAD', currentWithdrawalLogBytes: null },
    expectedRequestId: request.requestId,
    expectedArtifactId: derived.artifactId,
    confirmation: 'SIGN_EXACT_STATIC_RIGHTS_REVIEWER_ARTIFACT',
    now: () => new Date(ACCEPTANCE_NOW),
    outputPath,
    publicKeyPem: f.reviewerPublicKeyPem,
    privateKeyPath: privatePath,
    signerContract: { id: f.base.reviewerSignerContractId, sha256: f.base.reviewerSignerContractSha256 },
  });
  assert.equal(result.status, 'SIGNED');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(outputPath, 'utf8'))).sort(), ['payload', 'signature', 'withdrawalHeadHash']);
  assert.doesNotMatch(readFileSync(outputPath, 'utf8').toLowerCase(), /partnerize|private[_ -]?key/);
});

test('owner and reviewer keys must be distinct', () => {
  const f = fixture();
  assert.throws(() => deriveGenesis(f, {
    reviewerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }), (error) => error.code === 'OWNER_REVIEWER_KEY_COLLISION');
});

test('production registry accepts exactly the candidate-derived five and rejects four, six, duplicates, substitution and signed RETAILER_FEED', () => {
  const f = fixture();
  const genesis = signedGenesis(f);
  const decisions = signedDecisions(f, genesis.bytes);
  const registry = {
    schemaVersion: 1,
    decisionAsOf: DECISION_AS_OF,
    withdrawalHeadHash: f.withdrawalHeadHash,
    attributionFulfillments: [],
    decisions,
  };
  const base = {
    registry,
    authoritySet: f.authoritySet,
    inventoryId: f.inventory.staticSourceInventoryId,
    decisionAsOf: DECISION_AS_OF,
    withdrawalHeadHash: f.withdrawalHeadHash,
    attributionFulfillments: [],
    publicationRows: f.inventory.rows,
    trustRoot: f.ownerTrustRoot,
    expectedDependencyDescriptors: f.dependencies,
  };
  assert.equal(validateDecisionRegistry(base).decisions.length, 5);
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { ...registry, decisions: decisions.slice(0, 4) } }));
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { ...registry, decisions: [...decisions, decisions[0]] } }));
  const sixth = structuredClone(decisions[0]);
  sixth.payload.dependencyId = 'SIGNED_EXTRA';
  sixth.decisionId = semanticId('fitappliance.static-rights-decision', 1, sixth.payload);
  sixth.signature = sign(null, Buffer.from(canonicalJson(sixth.payload)), f.reviewer.privateKey).toString('base64');
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { ...registry, decisions: [...decisions, sixth] } }));
  const substituted = structuredClone(decisions);
  substituted[0].payload.dependencyId = 'UNKNOWN_DEPENDENCY';
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { ...registry, decisions: substituted } }));
  const retailer = structuredClone(decisions);
  retailer[0].payload.dependencyId = 'RETAILER_FEED';
  retailer[0].decisionId = semanticId('fitappliance.static-rights-decision', 1, retailer[0].payload);
  retailer[0].signature = sign(null, Buffer.from(canonicalJson(retailer[0].payload)), f.reviewer.privateKey).toString('base64');
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { ...registry, decisions: retailer } }));
});

test('genesis acceptance is create-only and generation finalization is all-or-nothing and preserves actual acceptanceNow', () => {
  const f = fixture();
  const genesis = signedGenesis(f);
  const genesisPath = path.join(f.root, 'accepted-genesis.json');
  assert.equal(acceptWithdrawalGenesis({
    ...f.base,
    envelopeBytes: Buffer.from(canonicalReviewerJson(genesis.envelope)),
    outputPath: genesisPath,
  }).status, 'ACCEPTED');
  assert.throws(() => acceptWithdrawalGenesis({
    ...f.base,
    envelopeBytes: Buffer.from(canonicalReviewerJson(genesis.envelope)),
    outputPath: genesisPath,
  }), (error) => error.code === 'OUTPUT_EXISTS');

  const decisions = signedDecisions(f, genesis.bytes);
  const outputPath = path.join(f.root, 'generation-packet.json');
  const input = {
    ...f.base,
    signedWithdrawalLogBytes: genesis.bytes,
    decisionEnvelopeBytes: decisions.map((row) => Buffer.from(canonicalReviewerJson(row))),
    inventory: f.inventory,
    classifiedRows: f.classifiedRows,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    attributionFulfillments: [],
    routeConfigSha256: H('routes'),
    decisionAsOf: DECISION_AS_OF,
    outputPath,
    now: () => new Date(ACCEPTANCE_NOW),
  };
  assert.throws(() => finalizeStaticRightsGeneration({ ...input, decisionEnvelopeBytes: input.decisionEnvelopeBytes.slice(0, 4) }));
  assert.equal(existsSync(outputPath), false);
  const result = finalizeStaticRightsGeneration(input);
  assert.equal(result.status, 'FINALIZED');
  const packet = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(packet.decisionAsOf, DECISION_AS_OF);
  assert.equal(packet.acceptanceNow, ACCEPTANCE_NOW);
  assert.equal(packet.registry.decisions.length, 5);
  assert.equal(packet.review.status, 'APPROVED');
  assert.equal(packet.manifest.status, 'APPROVED');
  assert.match(packet.authorization.staticPublicationAuthorizationId, /^[0-9a-f]{64}$/);
  assert.throws(() => finalizeStaticRightsGeneration(input), (error) => error.code === 'OUTPUT_EXISTS');
});

test('all five signatures bind one owner acceptance and reject cross-candidate replay', () => {
  const first = fixture();
  const second = successorOwnerAcceptanceFixture(first);
  const genesis = signedGenesis(first);
  const firstDecisions = signedDecisions(first, genesis.bytes);
  const secondDecisions = signedDecisions(second, genesis.bytes);
  const mixed = firstDecisions.map((row) => (
    row.payload.dependencyId === 'FIRST_PARTY'
      ? secondDecisions.find((candidate) => candidate.payload.dependencyId === 'FIRST_PARTY')
      : row
  ));
  const outputPath = path.join(first.root, 'cross-candidate-replay.json');
  assert.throws(() => finalizeStaticRightsGeneration({
    ...second.base,
    signedWithdrawalLogBytes: genesis.bytes,
    decisionEnvelopeBytes: mixed.map((row) => Buffer.from(canonicalReviewerJson(row))),
    inventory: second.inventory,
    classifiedRows: second.classifiedRows,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    attributionFulfillments: [],
    routeConfigSha256: H('routes'),
    decisionAsOf: DECISION_AS_OF,
    outputPath,
    now: () => new Date(ACCEPTANCE_NOW),
  }));
  assert.equal(existsSync(outputPath), false);
});

test('finalization rejects mixed clocks, non-null initial links, candidate drift and expired actual acceptance', () => {
  const f = fixture();
  const genesis = signedGenesis(f);
  const base = signedDecisions(f, genesis.bytes);
  const cases = [
    (rows) => { rows[0].payload.decisionAsOf = '2026-08-11T08:00:01.000Z'; },
    (rows) => { rows[0].payload.validThrough = '2026-08-12T06:59:59.000Z'; },
    (rows) => { rows[0].payload.predecessorDecisionId = H('prior'); },
    (rows) => { rows[0].payload.supersedesDecisionId = H('prior'); },
  ];
  for (const mutate of cases) {
    const rows = structuredClone(base);
    mutate(rows);
    assert.throws(() => finalizeStaticRightsGeneration({
      ...f.base,
      signedWithdrawalLogBytes: genesis.bytes,
      decisionEnvelopeBytes: rows.map((row) => Buffer.from(canonicalReviewerJson(row))),
      inventory: f.inventory,
      classifiedRows: f.classifiedRows,
      generatedProvenance: { schemaVersion: 1, receipts: [] },
      attributionFulfillments: [],
      routeConfigSha256: H('routes'),
      decisionAsOf: DECISION_AS_OF,
      outputPath: path.join(f.root, `${Math.random()}.json`),
      now: () => new Date(ACCEPTANCE_NOW),
    }));
  }
  assert.throws(() => finalizeStaticRightsGeneration({
    ...f.base,
    signedWithdrawalLogBytes: genesis.bytes,
    decisionEnvelopeBytes: base.map((row) => Buffer.from(canonicalReviewerJson(row))),
    inventory: f.inventory,
    classifiedRows: f.classifiedRows,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    attributionFulfillments: [],
    routeConfigSha256: H('routes'),
    decisionAsOf: DECISION_AS_OF,
    outputPath: path.join(f.root, 'expired.json'),
    now: () => new Date('2026-08-12T07:00:00.001Z'),
  }));

  let clockRead = 0;
  const rollbackOutput = path.join(f.root, 'clock-rollback.json');
  assert.throws(() => finalizeStaticRightsGeneration({
    ...f.base,
    signedWithdrawalLogBytes: genesis.bytes,
    decisionEnvelopeBytes: base.map((row) => Buffer.from(canonicalReviewerJson(row))),
    inventory: f.inventory,
    classifiedRows: f.classifiedRows,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    attributionFulfillments: [],
    routeConfigSha256: H('routes'),
    decisionAsOf: DECISION_AS_OF,
    outputPath: rollbackOutput,
    now: () => new Date(clockRead++ === 0 ? ACCEPTANCE_NOW : '2026-08-11T08:29:59.000Z'),
  }), (error) => error.code === 'SYSTEM_CLOCK_ROLLBACK');
  assert.equal(existsSync(rollbackOutput), false);
});

test('reviewer signer contract and bootstrap authorization bind exact bootstrap, wrapper, contract and Node bytes', () => {
  const boundFiles = [
    { path: 'src/domain/reviewer-artifact-request-contract.mjs', sha256: H('request-contract') },
    { path: 'src/domain/owner-attestation-request-contract.mjs', sha256: H('owner-request-contract') },
    { path: 'src/domain/offline-reviewer-signer-contract.mjs', sha256: H('signer-contract') },
    { path: 'scripts/deployment/offline-owner-secure-io.mjs', sha256: H('io') },
    { path: 'scripts/deployment/sign-static-rights-reviewer-artifact.mjs', sha256: H('signer') },
    { path: 'src/domain/static-publication-rights.mjs', sha256: H('rights') },
    { path: 'scripts/deployment/offline-signer-bootstrap.sh', sha256: H('bootstrap') },
    { path: 'scripts/deployment/run-offline-reviewer-signer.sh', sha256: H('wrapper') },
  ];
  const contract = buildOfflineReviewerSignerContract({
    nodeVersion: '22.23.1',
    trustAnchor: { path: 'deployment/static-owner-trust-anchor.json', sha256: H('anchor') },
    boundFiles,
  });
  const contractBytes = Buffer.from(canonicalReviewerJson(contract));
  assert.deepEqual(validateOfflineReviewerSignerContract(contractBytes, {
    nodeVersion: '22.23.1',
    trustAnchorBytes: Buffer.from('anchor'),
    fileBytes: new Map(boundFiles.map((row) => [row.path, Buffer.from({
      'src/domain/reviewer-artifact-request-contract.mjs': 'request-contract',
      'src/domain/owner-attestation-request-contract.mjs': 'owner-request-contract',
      'src/domain/offline-reviewer-signer-contract.mjs': 'signer-contract',
      'scripts/deployment/offline-owner-secure-io.mjs': 'io',
      'scripts/deployment/sign-static-rights-reviewer-artifact.mjs': 'signer',
      'src/domain/static-publication-rights.mjs': 'rights',
      'scripts/deployment/offline-signer-bootstrap.sh': 'bootstrap',
      'scripts/deployment/run-offline-reviewer-signer.sh': 'wrapper',
    }[row.path])])),
  }), contract);

  const fixtureBytes = {
    bootstrap: Buffer.from('bootstrap'), wrapper: Buffer.from('wrapper'), node: Buffer.from('node'),
    request: Buffer.from('request'), contract: contractBytes,
  };
  const authorization = buildOfflineSignerBootstrapAuthorization({
    signerKind: 'REVIEWER',
    bootstrapSha256: sha256(fixtureBytes.bootstrap),
    wrapperSha256: sha256(fixtureBytes.wrapper),
    signerContractId: contract.contractId,
    signerContractSha256: sha256(contractBytes),
    nodeExecutableSha256: sha256(fixtureBytes.node),
    requestId: H('request-id'),
    requestSha256: sha256(fixtureBytes.request),
    artifactId: H('artifact-id'),
    outputPath: '/private/absent.json',
    confirmation: 'AUTHORIZE_EXACT_OFFLINE_REVIEWER_SIGNER',
  });
  const authBytes = Buffer.from(canonicalReviewerJson(authorization));
  const validation = {
    authorizationBytes: authBytes,
    bootstrapBytes: fixtureBytes.bootstrap,
    wrapperBytes: fixtureBytes.wrapper,
    signerContractBytes: contractBytes,
    nodeExecutableBytes: fixtureBytes.node,
    requestBytes: fixtureBytes.request,
    expectedRequestId: H('request-id'),
    expectedArtifactId: H('artifact-id'),
    outputPath: '/private/absent.json',
    signerContractId: contract.contractId,
  };
  assert.equal(validateOfflineSignerBootstrapAuthorization(validation).signerKind, 'REVIEWER');
  for (const key of ['bootstrapBytes', 'wrapperBytes', 'signerContractBytes', 'nodeExecutableBytes', 'requestBytes']) {
    assert.throws(() => validateOfflineSignerBootstrapAuthorization({ ...validation, [key]: Buffer.from('drift') }), undefined, key);
  }
});

test('owner and reviewer wrappers expose bootstrap hash gates before private-key filesystem permission', () => {
  for (const relativePath of [
    '../scripts/deployment/run-offline-owner-signer.sh',
    '../scripts/deployment/run-offline-reviewer-signer.sh',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const hashGate = source.indexOf('/usr/bin/shasum');
    const privatePermission = source.indexOf('--allow-fs-read=${private_key_path}');
    assert.ok(hashGate >= 0 && privatePermission > hashGate);
    assert.match(source, /bootstrap.*sha256/i);
    assert.match(source, /node.*sha256/i);
    assert.match(source, /wrapper.*sha256/i);
    assert.match(source, /contract.*sha256/i);
    assert.match(source, /\/usr\/bin\/plutil -extract requestId/);
  }
});

test('requests and signed envelopes contain no Partnerize or private markers', () => {
  const f = fixture();
  const genesis = signedGenesis(f);
  for (const dependencyId of PRODUCTION_STATIC_RIGHTS_DEPENDENCIES) {
    const derived = deriveDecision(f, dependencyId, genesis.bytes);
    const request = buildReviewerArtifactRequest({ derived, issuedAt: REQUEST_ISSUED, expiresAt: REQUEST_EXPIRES });
    const envelope = {
      decisionId: derived.artifactId,
      payload: derived.payload,
      signature: sign(null, Buffer.from(canonicalReviewerJson(derived.payload)), f.reviewer.privateKey).toString('base64'),
    };
    for (const bytes of [canonicalReviewerJson(request), canonicalReviewerJson(envelope)]) {
      assert.doesNotMatch(bytes.toLowerCase(), /partnerize|retailer_feed|private[_ -]?(?:key|evidence)/);
    }
  }
});
