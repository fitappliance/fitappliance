import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  StaticRightsSigningCandidateError,
  buildStaticRightsSigningCandidate,
  replayPublicEvidenceManifest,
  writeCanonicalCandidateFile,
} from '../scripts/deployment/prepare-static-rights-signing-candidate.mjs';
import {
  canonicalJson,
  semanticId,
} from '../src/domain/static-publication-rights.mjs';
import { buildOwnerAttestationAcceptanceReceipt } from '../scripts/deployment/accept-owner-attestation.mjs';
import {
  canonicalOwnerJson,
  ownerSemanticId,
} from '../src/domain/owner-attestation-request-contract.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const HASHES = Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => [letter, sha256(letter)]));

function assertCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

function evidenceFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fit-rights-evidence-'));
  const records = [
    ['google-search-console-html-verification', 'google.html', 'google', 'https://support.google.com/webmasters/answer/9008080?hl=en', 'text/html'],
    ['web-vitals-v4.2.4-license', 'web-vitals.txt', 'apache', 'https://raw.githubusercontent.com/GoogleChrome/web-vitals/v4.2.4/LICENSE', 'text/plain'],
    ['outfit-ofl-1.1', 'outfit.txt', 'ofl', 'https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt', 'text/plain'],
    ['energy-rating-dataset-metadata', 'energy.json', 'energy', 'https://data.gov.au/data/api/3/action/package_show?id=559708e5-480e-4f94-8429-c49571e82761', 'application/json'],
    ['cc-by-3.0-au-legalcode', 'cc-by.html', 'cc-by', 'https://creativecommons.org/licenses/by/3.0/au/legalcode', 'text/html'],
  ].map(([id, relativePath, bytes, requestedUrl, mediaType]) => {
    writeFileSync(path.join(root, relativePath), bytes);
    return {
      id,
      path: relativePath,
      requestedUrl,
      mediaType,
      byteLength: Buffer.byteLength(bytes),
      sha256: sha256(bytes),
      retrievedAt: '2026-08-10T12:00:00.000Z',
    };
  });
  const manifest = {
    schemaVersion: 1,
    evidenceClass: 'PUBLIC_RIGHTS_SOURCES',
    records,
    captureFailures: [],
    checks: {
      googleVerificationInstructions: true,
      webVitalsApache2: true,
      outfitOfl11: true,
      energyApiSuccess: true,
      energyDatasetId: '559708e5-480e-4f94-8429-c49571e82761',
      energyLicenseTitle: 'Creative Commons Attribution 3.0 Australia',
      energyTargetResources: [
        { id: 'f734c56b-a255-4c4e-a3c1-e835c38b8774', format: 'CSV', hash: 'b3cce9d2c4c2c8ed6ca0a29630dba2bc' },
        { id: 'b8c66121-6683-4a01-957b-71205439f932', format: 'DOCX', hash: '' },
        { id: 'cbe7057d-e132-4297-b8be-eecf8322d4e6', format: 'CSV', hash: '6f999b9d4b317b47f81c0cef55c85eb7' },
        { id: '4e0a2dc4-4d2f-49df-aedb-a389b03913db', format: 'DOCX', hash: '' },
        { id: 'eb3b9d8e-f39d-47b7-9db0-309856176951', format: 'CSV', hash: '681dd55ffee2d8c9efbabe87a3c29bbb' },
        { id: 'd748cc21-c4a1-49e0-ac3f-c6ee691a2737', format: 'DOCX', hash: '' },
        { id: '0eabca18-49bb-4a9e-8019-28d5d56501c4', format: 'CSV', hash: 'f06f87bbaace6c801599d415cd4c13a0' },
        { id: 'eb7c7298-6d17-4208-a041-ca1c94db744b', format: 'DOCX', hash: '' },
      ],
      ccBy3Au: true,
    },
  };
  const manifestPath = path.join(root, 'evidence-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifestPath };
}

function signingFixture() {
  const paths = {
    first: 'index.html',
    google: 'google32758d7798f4a670.html',
    webVitals: 'public/scripts/vendor/web-vitals.js',
    outfit: 'public/og-images/example.png',
    energy: 'public/data/replacement-reference/fridges.json',
    webLicense: 'public/licenses/web-vitals-4.2.4-apache-2.0.txt',
    outfitLicense: 'public/licenses/outfit-ofl-1.1.txt',
    credits: 'pages/third-party-licenses.html',
  };
  const dependencyByPath = new Map([
    [paths.first, ['FIRST_PARTY']],
    [paths.google, ['GOOGLE_VERIFICATION']],
    [paths.webVitals, ['WEB_VITALS_APACHE_2']],
    [paths.outfit, ['OUTFIT_FONT']],
    [paths.energy, ['ENERGY_RATING_CC_BY', 'FIRST_PARTY']],
    [paths.webLicense, ['FIRST_PARTY']],
    [paths.outfitLicense, ['FIRST_PARTY']],
    [paths.credits, ['FIRST_PARTY']],
  ]);
  const rows = [...dependencyByPath.keys()].map((filePath, index) => ({
    path: filePath,
    mode: '100644',
    size: index + 1,
    sha256: Object.values(HASHES)[index],
    blobOid: `${index + 1}`.repeat(40).slice(0, 40),
  })).sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const inventory = { schemaVersion: 1, rows, staticSourceInventoryId: HASHES.z };
  const classification = {
    schemaVersion: 1,
    classifierId: 'fitappliance.static-rights-classifier/v1',
    rows: rows.map((row) => ({
      path: row.path,
      sourceClass: 'FIRST_PARTY',
      dependencyIds: dependencyByPath.get(row.path),
      provenanceIds: [],
      blockers: [],
    })),
  };
  const headPayload = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER',
    keyId: 'FITAPPLIANCE_RIGHTS_KEY',
    role: 'RIGHTS_REVIEWER',
    action: 'PUBLIC_STATIC_DISTRIBUTION',
    sequence: 0,
    previousHeadHash: null,
    eventIds: [],
    issuedAt: '2026-08-10T13:05:00.000Z',
  };
  const withdrawalGenesisDraft = {
    draftStatus: 'AWAITING_EXPLICIT_SIGNING_APPROVAL',
    candidateLog: {
      schemaVersion: 1,
      environment: 'PRODUCTION',
      events: [],
      heads: [{
        withdrawalHeadHash: semanticId('fitappliance.static-rights-withdrawal-head', 1, headPayload),
        payload: headPayload,
        signature: null,
      }],
    },
  };
  const attributionSpecs = [
    { dependencyId: 'WEB_VITALS_APACHE_2', obligationId: 'WEB_VITALS_APACHE_2_LICENSE_COPY', path: paths.webLicense, sha256: rows.find((row) => row.path === paths.webLicense).sha256, route: '/licenses/web-vitals-4.2.4-apache-2.0.txt' },
    { dependencyId: 'OUTFIT_FONT', obligationId: 'OUTFIT_OFL_1_1_LICENSE_COPY', path: paths.outfitLicense, sha256: rows.find((row) => row.path === paths.outfitLicense).sha256, route: '/licenses/outfit-ofl-1.1.txt' },
    { dependencyId: 'ENERGY_RATING_CC_BY', obligationId: 'ENERGY_RATING_CC_BY_ATTRIBUTION', path: paths.credits, sha256: rows.find((row) => row.path === paths.credits).sha256, route: '/third-party-licenses' },
  ];
  const owner = generateKeyPairSync('ed25519');
  const reviewer = generateKeyPairSync('ed25519');
  const ownerPublicKeyPem = owner.publicKey.export({ type: 'spki', format: 'pem' });
  const authorities = [{
    issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER',
    keyId: 'FITAPPLIANCE_RIGHTS_KEY',
    publicKey: reviewer.publicKey.export({ type: 'spki', format: 'pem' }),
    roles: ['RIGHTS_REVIEWER'],
    actions: ['PUBLIC_STATIC_DISTRIBUTION'],
  }];
  const authorityEnrollmentPayload = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    authorities,
  };
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
      signature: sign(
        null,
        Buffer.from(canonicalJson({ authoritySetHash })),
        owner.privateKey,
      ).toString('base64'),
    },
  };
  const authoritySetBytes = Buffer.from(canonicalJson(authoritySet, { sortedArrays: ['authorities'] }));
  const ownerTrustRoot = {
    source: 'INJECTED_READ_ONLY',
    publicKey: ownerPublicKeyPem,
  };
  const ownerRootMetadata = {
    algorithm: 'Ed25519',
    authoritySetHash,
    createdAt: '2026-08-10T14:00:00.000Z',
    environment: 'PRODUCTION',
    publicKeyFingerprintSha256: sha256(createPublicKey(ownerPublicKeyPem).export({ type: 'spki', format: 'der' })),
    rootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    schemaVersion: 1,
  };
  const ownerTrustAnchor = {
    algorithm: 'Ed25519',
    authoritySetEnrollmentHash: authoritySetHash,
    environment: 'PRODUCTION',
    ownerPublicKeyFingerprintSha256: ownerRootMetadata.publicKeyFingerprintSha256,
    ownerPublicKeyPemSha256: sha256(Buffer.from(ownerPublicKeyPem)),
    ownerRootId: ownerRootMetadata.rootId,
    ownerRootMetadataSha256: sha256(Buffer.from(canonicalJson(ownerRootMetadata))),
    schemaVersion: 1,
    trustRootSha256: sha256(Buffer.from(canonicalJson(ownerTrustRoot))),
  };
  return {
    inventory,
    classification,
    withdrawalGenesisDraft,
    authoritySet,
    authoritySetSha256: sha256(authoritySetBytes),
    ownerTrustAnchor,
    ownerTrustAnchorSha256: sha256(Buffer.from(canonicalJson(ownerTrustAnchor))),
    ownerTrustRoot,
    ownerRootMetadata,
    ownerPrivateKey: owner.privateKey,
    routeConfigSha256: HASHES.y,
    toolchainContractSha256: HASHES.w,
    candidateGeneratorSha256: HASHES.v,
    offlineSignerContractId: HASHES.u,
    offlineSignerContractSha256: HASHES.t,
    attributionSpecs,
    attributionRouteResolutions: attributionSpecs.map((spec) => ({
      route: spec.route,
      terminal: 'STATIC_2XX',
      target: spec.path,
    })),
  };
}

function acceptedOwnerAttestation(root, fixture, publicEvidence, overrides = {}) {
  const unsignedCandidate = buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence,
    ownerAcceptance: null,
  });
  const unsignedCandidateBytes = Buffer.from(canonicalJson(unsignedCandidate, {
    sortedArrays: [
      'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
      'dependencies', 'evidenceHashes', 'forbiddenDependencies',
    ],
  }));
  const firstParty = unsignedCandidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY');
  const payload = {
    schemaVersion: 3,
    environment: 'PRODUCTION',
    action: 'PUBLIC_STATIC_DISTRIBUTION',
    dependencyId: 'FIRST_PARTY',
    ownerId: 'FITAPPLIANCE_OWNER',
    inventoryId: unsignedCandidate.inventoryId,
    scopeHash: firstParty.scopeHash,
    sourceObjectHash: firstParty.sourceObjectHash,
    candidateId: unsignedCandidate.candidateId,
    candidateSha256: sha256(unsignedCandidateBytes),
    authoritySetId: unsignedCandidate.authoritySetId,
    authoritySetSha256: unsignedCandidate.authoritySetSha256,
    ownerRootId: fixture.ownerTrustAnchor.ownerRootId,
    ownerPublicKeyFingerprintSha256: fixture.ownerTrustAnchor.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: unsignedCandidate.ownerTrustAnchorSha256,
    toolchainContractSha256: unsignedCandidate.toolchainContractSha256,
    candidateGeneratorSha256: unsignedCandidate.candidateGeneratorSha256,
    routeConfigSha256: unsignedCandidate.routeConfigSha256,
    publicEvidenceManifestSha256: unsignedCandidate.publicEvidenceManifestSha256,
    withdrawalGenesisSha256: sha256(Buffer.from(canonicalJson(unsignedCandidate.withdrawalGenesis))),
    offlineSignerContractId: fixture.offlineSignerContractId,
    offlineSignerContractSha256: fixture.offlineSignerContractSha256,
    issuedAt: '2026-08-10T15:00:00.000Z',
    expiresAt: '2026-08-10T16:00:00.000Z',
    ...overrides,
  };
  const envelope = {
    payload,
    signature: sign(null, Buffer.from(canonicalJson(payload)), fixture.ownerPrivateKey).toString('base64'),
  };
  const attestationPath = path.join(root, 'owner-attestation.json');
  writeFileSync(attestationPath, canonicalJson(envelope), { mode: 0o600 });
  const ownerTrustRoot = { source: 'INJECTED_READ_ONLY', ...fixture.ownerTrustRoot };
  const requestPayload = {
    schemaVersion: 3,
    state: 'UNSIGNED',
    algorithm: 'Ed25519',
    encoding: 'base64',
    candidateId: payload.candidateId,
    candidateSha256: payload.candidateSha256,
    ownerRootId: payload.ownerRootId,
    ownerPublicKeyFingerprintSha256: payload.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: payload.ownerTrustAnchorSha256,
    ownerTrustRootSha256: sha256(Buffer.from(canonicalJson(ownerTrustRoot))),
    authoritySetId: payload.authoritySetId,
    authoritySetSha256: payload.authoritySetSha256,
    offlineSignerContractId: payload.offlineSignerContractId,
    offlineSignerContractSha256: payload.offlineSignerContractSha256,
    payload,
  };
  const request = {
    ...requestPayload,
    requestId: ownerSemanticId('fitappliance.owner-attestation-request', 3, requestPayload),
  };
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: readFileSync(attestationPath),
    ownerPublicKeyPem: ownerTrustRoot.publicKey,
    requestBytes: Buffer.from(canonicalOwnerJson(request)),
    now: () => new Date('2026-08-10T15:30:00.000Z'),
  });
  const receiptPath = path.join(root, 'owner-acceptance.json');
  writeFileSync(receiptPath, canonicalJson(receipt), { mode: 0o600 });
  return {
    ownerAcceptance: { path: receiptPath, sha256: sha256(readFileSync(receiptPath)) },
    ownerTrustRoot,
  };
}

test('public evidence replay binds every retained byte and rejects tampering', () => {
  const { root, manifestPath } = evidenceFixture();
  const replay = replayPublicEvidenceManifest({ manifestPath });
  assert.equal(replay.records.length, 5);
  assert.equal(replay.manifestSha256, sha256(readFileSync(manifestPath)));

  writeFileSync(path.join(root, 'outfit.txt'), 'tampered');
  assert.throws(() => replayPublicEvidenceManifest({ manifestPath }), assertCode('EVIDENCE_HASH_MISMATCH'));
});

test('public evidence replay rejects symlink traversal and failed capture checks', () => {
  const linkedFixture = evidenceFixture();
  const linkedManifest = JSON.parse(readFileSync(linkedFixture.manifestPath, 'utf8'));
  const outside = mkdtempSync(path.join(os.tmpdir(), 'fit-rights-outside-'));
  writeFileSync(path.join(outside, 'web-vitals.txt'), 'apache');
  symlinkSync(outside, path.join(linkedFixture.root, 'linked'), 'dir');
  linkedManifest.records.find((row) => row.id === 'web-vitals-v4.2.4-license').path = 'linked/web-vitals.txt';
  writeFileSync(linkedFixture.manifestPath, `${JSON.stringify(linkedManifest, null, 2)}\n`);
  assert.throws(
    () => replayPublicEvidenceManifest({ manifestPath: linkedFixture.manifestPath }),
    assertCode('EVIDENCE_PATH_INVALID'),
  );

  const failedChecks = evidenceFixture();
  const failedManifest = JSON.parse(readFileSync(failedChecks.manifestPath, 'utf8'));
  failedManifest.checks.googleVerificationInstructions = false;
  writeFileSync(failedChecks.manifestPath, `${JSON.stringify(failedManifest, null, 2)}\n`);
  assert.throws(
    () => replayPublicEvidenceManifest({ manifestPath: failedChecks.manifestPath }),
    assertCode('EVIDENCE_MANIFEST_INVALID'),
  );

  const unknownFailure = evidenceFixture();
  const failureManifest = JSON.parse(readFileSync(unknownFailure.manifestPath, 'utf8'));
  failureManifest.captureFailures = [{ id: 'unknown', status: 'UNAVAILABLE' }];
  writeFileSync(unknownFailure.manifestPath, `${JSON.stringify(failureManifest, null, 2)}\n`);
  assert.throws(
    () => replayPublicEvidenceManifest({ manifestPath: unknownFailure.manifestPath }),
    assertCode('EVIDENCE_MANIFEST_INVALID'),
  );
});

test('candidate derives exact scopes and route receipts but stays blocked without owner attestation', () => {
  const { manifestPath } = evidenceFixture();
  const candidate = buildStaticRightsSigningCandidate({
    ...signingFixture(),
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  });

  assert.equal(candidate.status, 'BLOCKED_OWNER_ATTESTATION');
  assert.deepEqual(candidate.blockers, ['EXPLICIT_SIGNING_APPROVAL_REQUIRED', 'OWNER_ATTESTATION_REQUIRED']);
  assert.deepEqual(candidate.dependencies.map((row) => row.dependencyId), [
    'ENERGY_RATING_CC_BY', 'FIRST_PARTY', 'GOOGLE_VERIFICATION', 'OUTFIT_FONT', 'WEB_VITALS_APACHE_2',
  ]);
  assert.equal(candidate.dependencies.some((row) => row.dependencyId === 'RETAILER_FEED'), false);
  assert.equal(candidate.dependencies.every((row) => /^[0-9a-f]{64}$/.test(row.scopeHash)), true);
  assert.equal(candidate.attributionFulfillments.length, 3);
  assert.equal(candidate.attributionFulfillments.every((row) => row.routeReceipt.payload.configSha256 === HASHES.y), true);
  assert.equal(candidate.toolchainContractSha256, HASHES.w);
  assert.equal(candidate.candidateGeneratorSha256, HASHES.v);
  assert.equal(candidate.schemaVersion, 3);
  assert.equal(candidate.ownerAcceptance, null);
  assert.match(candidate.authoritySetSha256, /^[0-9a-f]{64}$/);
  assert.match(candidate.ownerTrustAnchorSha256, /^[0-9a-f]{64}$/);
  assert.equal('signature' in candidate, false);
  assert.match(candidate.candidateId, /^[0-9a-f]{64}$/);
});

test('candidate becomes signing-review ready only with a replayed owner attestation', () => {
  const { root, manifestPath } = evidenceFixture();
  const fixture = signingFixture();
  const publicEvidence = replayPublicEvidenceManifest({ manifestPath });
  const attestation = acceptedOwnerAttestation(root, fixture, publicEvidence);
  const candidate = buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence,
    ...attestation,
  });
  assert.equal(candidate.status, 'READY_FOR_EXPLICIT_SIGNING_APPROVAL');
  assert.deepEqual(candidate.blockers, ['EXPLICIT_SIGNING_APPROVAL_REQUIRED']);
  assert.equal(candidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY').evidenceHashes.length, 1);
  assert.match(candidate.ownerTrustRootSha256, /^[0-9a-f]{64}$/);

  const arbitraryPath = path.join(root, 'arbitrary.txt');
  writeFileSync(arbitraryPath, 'not an attestation', { mode: 0o600 });
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: { path: arbitraryPath, sha256: sha256(readFileSync(arbitraryPath)) },
    ownerTrustRoot: attestation.ownerTrustRoot,
  }), assertCode('OWNER_ACCEPTANCE_INVALID'));
});

test('owner signature cannot be reused after candidate bindings drift or expiry', () => {
  const { root, manifestPath } = evidenceFixture();
  const fixture = signingFixture();
  const publicEvidence = replayPublicEvidenceManifest({ manifestPath });
  const attestation = acceptedOwnerAttestation(root, fixture, publicEvidence);

  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    toolchainContractSha256: HASHES.x,
    publicEvidence,
    ...attestation,
  }), assertCode('OWNER_ACCEPTANCE_INVALID'));

  const driftedReceipt = JSON.parse(readFileSync(attestation.ownerAcceptance.path, 'utf8'));
  driftedReceipt.acceptedAt = '2026-08-10T15:31:00.000Z';
  writeFileSync(attestation.ownerAcceptance.path, canonicalJson(driftedReceipt), { mode: 0o600 });
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence,
    ...attestation,
    ownerAcceptance: { path: attestation.ownerAcceptance.path, sha256: sha256(readFileSync(attestation.ownerAcceptance.path)) },
  }), assertCode('OWNER_ACCEPTANCE_INVALID'));
});

test('owner attestation rejects a substituted root or unpinned trust anchor', () => {
  const { root, manifestPath } = evidenceFixture();
  const fixture = signingFixture();
  const publicEvidence = replayPublicEvidenceManifest({ manifestPath });
  const attestation = acceptedOwnerAttestation(root, fixture, publicEvidence);
  const substituted = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });

  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence,
    ...attestation,
    ownerTrustRoot: { source: 'INJECTED_READ_ONLY', publicKey: substituted },
  }), assertCode('OWNER_ACCEPTANCE_INVALID'));

  const driftedAnchor = { ...fixture.ownerTrustAnchor, ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_OTHER' };
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence,
    ...attestation,
    ownerTrustAnchor: driftedAnchor,
    ownerTrustAnchorSha256: sha256(Buffer.from(canonicalJson(driftedAnchor))),
  }), assertCode('OWNER_ATTESTATION_INVALID'));

  const enrollmentDrift = signingFixture();
  enrollmentDrift.ownerTrustAnchor.authoritySetEnrollmentHash = HASHES.x;
  enrollmentDrift.ownerTrustAnchorSha256 = sha256(Buffer.from(canonicalJson(enrollmentDrift.ownerTrustAnchor)));
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...enrollmentDrift,
    publicEvidence,
    ownerAcceptance: null,
  }), assertCode('OWNER_ATTESTATION_INVALID'));

  const authorityBytesDrift = signingFixture();
  authorityBytesDrift.authoritySetSha256 = HASHES.x;
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...authorityBytesDrift,
    publicEvidence,
    ownerAcceptance: null,
  }), assertCode('TOOLCHAIN_BINDING_INVALID'));
});

test('candidate rejects private dependencies and stale attribution bytes', () => {
  const { manifestPath } = evidenceFixture();
  const fixture = signingFixture();
  const privateClassification = structuredClone(fixture.classification);
  privateClassification.rows[0].dependencyIds.push('RETAILER_FEED');
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    classification: privateClassification,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  }), assertCode('PRIVATE_DEPENDENCY_FORBIDDEN'));

  const stale = structuredClone(fixture);
  stale.attributionSpecs[0].sha256 = HASHES.x;
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...stale,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  }), assertCode('ATTRIBUTION_SOURCE_DRIFT'));

  const unverifiedRoute = structuredClone(fixture);
  unverifiedRoute.attributionRouteResolutions = unverifiedRoute.attributionRouteResolutions.slice(1);
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...unverifiedRoute,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  }), assertCode('ATTRIBUTION_ROUTE_UNVERIFIED'));

  const duplicateClassification = structuredClone(fixture);
  duplicateClassification.classification.rows[1] = structuredClone(duplicateClassification.classification.rows[0]);
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...duplicateClassification,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  }), assertCode('SOURCE_SET_INVALID'));

  const missingAttribution = structuredClone(fixture);
  missingAttribution.attributionSpecs.pop();
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...missingAttribution,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    ownerAcceptance: null,
  }), assertCode('ATTRIBUTION_SET_INVALID'));

  const rotatedAttribution = structuredClone(fixture);
  const obligationIds = rotatedAttribution.attributionSpecs.map((row) => row.obligationId);
  rotatedAttribution.attributionSpecs.forEach((row, index) => {
    row.obligationId = obligationIds[(index + 1) % obligationIds.length];
  });
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...rotatedAttribution,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), assertCode('ATTRIBUTION_SET_INVALID'));

  const classificationBlocker = structuredClone(fixture);
  classificationBlocker.classification.rows[0].blockers = ['UNREVIEWED_INPUT'];
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...classificationBlocker,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), assertCode('SOURCE_SET_INVALID'));

  const classifierDrift = structuredClone(fixture);
  classifierDrift.classification.classifierId = 'other-classifier';
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...classifierDrift,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), assertCode('SOURCE_SET_INVALID'));
});

test('candidate rejects malformed timestamps, withdrawal payload drift and unbound tools', () => {
  const malformedEvidence = evidenceFixture();
  const manifest = JSON.parse(readFileSync(malformedEvidence.manifestPath, 'utf8'));
  manifest.records[0].retrievedAt = 'not-a-timestamp';
  writeFileSync(malformedEvidence.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => replayPublicEvidenceManifest({ manifestPath: malformedEvidence.manifestPath }),
    assertCode('EVIDENCE_MANIFEST_INVALID'),
  );

  const { manifestPath } = evidenceFixture();
  const withdrawalDrift = signingFixture();
  withdrawalDrift.withdrawalGenesisDraft.candidateLog.heads[0].payload.unreviewed = true;
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...withdrawalDrift,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), assertCode('WITHDRAWAL_GENESIS_INVALID'));

  const invalidToolBinding = signingFixture();
  invalidToolBinding.candidateGeneratorSha256 = 'not-a-hash';
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...invalidToolBinding,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), assertCode('TOOLCHAIN_BINDING_INVALID'));
});

test('candidate output is exclusive, private and idempotent only for identical canonical bytes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fit-rights-output-'));
  const outputPath = path.join(root, 'candidate.json');
  const candidate = { schemaVersion: 1, status: 'BLOCKED_OWNER_ATTESTATION' };
  const expectedBytes = canonicalJson(candidate);

  assert.equal(writeCanonicalCandidateFile(outputPath, candidate), 'CREATED');
  assert.equal(readFileSync(outputPath, 'utf8'), expectedBytes);
  assert.equal(lstatSync(outputPath).mode & 0o777, 0o600);
  assert.equal(writeCanonicalCandidateFile(outputPath, candidate), 'UNCHANGED');

  writeFileSync(outputPath, 'different', { mode: 0o600 });
  assert.throws(
    () => writeCanonicalCandidateFile(outputPath, candidate),
    assertCode('OUTPUT_COLLISION'),
  );
  assert.equal(readFileSync(outputPath, 'utf8'), 'different');
});

test('candidate output rejects symlinks, non-files and overly broad existing permissions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fit-rights-output-'));
  const candidate = { schemaVersion: 1 };

  const targetPath = path.join(root, 'target.json');
  const symlinkPath = path.join(root, 'candidate-link.json');
  writeFileSync(targetPath, '{}\n', { mode: 0o600 });
  symlinkSync(targetPath, symlinkPath);
  assert.throws(
    () => writeCanonicalCandidateFile(symlinkPath, candidate),
    assertCode('OUTPUT_PATH_INVALID'),
  );

  const directoryPath = path.join(root, 'candidate-directory');
  mkdirSync(directoryPath);
  assert.throws(
    () => writeCanonicalCandidateFile(directoryPath, candidate),
    assertCode('OUTPUT_PATH_INVALID'),
  );

  const broadPath = path.join(root, 'candidate-broad.json');
  writeFileSync(broadPath, '{"schemaVersion":1}\n', { mode: 0o600 });
  chmodSync(broadPath, 0o644);
  assert.throws(
    () => writeCanonicalCandidateFile(broadPath, candidate),
    assertCode('OUTPUT_PERMISSIONS_INVALID'),
  );

  const hardlinkTarget = path.join(root, 'hardlink-target.json');
  const hardlinkPath = path.join(root, 'hardlink-candidate.json');
  writeFileSync(hardlinkTarget, canonicalJson(candidate), { mode: 0o600 });
  linkSync(hardlinkTarget, hardlinkPath);
  assert.throws(
    () => writeCanonicalCandidateFile(hardlinkPath, candidate),
    assertCode('OUTPUT_PATH_INVALID'),
  );

  const realParent = path.join(root, 'real-parent');
  const linkedParent = path.join(root, 'linked-parent');
  mkdirSync(realParent, { mode: 0o700 });
  symlinkSync(realParent, linkedParent, 'dir');
  assert.throws(
    () => writeCanonicalCandidateFile(path.join(linkedParent, 'candidate.json'), candidate),
    assertCode('OUTPUT_PATH_INVALID'),
  );

  const broadParent = path.join(root, 'broad-parent');
  mkdirSync(broadParent, { mode: 0o755 });
  assert.throws(
    () => writeCanonicalCandidateFile(path.join(broadParent, 'candidate.json'), candidate),
    assertCode('OUTPUT_PERMISSIONS_INVALID'),
  );
});

test('malformed evidence paths and withdrawal arrays fail with typed candidate errors', () => {
  const malformedEvidence = evidenceFixture();
  const manifest = JSON.parse(readFileSync(malformedEvidence.manifestPath, 'utf8'));
  manifest.records[0].path = { not: 'a string' };
  writeFileSync(malformedEvidence.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => replayPublicEvidenceManifest({ manifestPath: malformedEvidence.manifestPath }),
    (error) => error instanceof StaticRightsSigningCandidateError
      && error.code === 'EVIDENCE_MANIFEST_INVALID',
  );

  const { manifestPath } = evidenceFixture();
  for (const [field, malformed] of [
    ['events', {}],
    ['heads', {}],
  ]) {
    const fixture = signingFixture();
    fixture.withdrawalGenesisDraft.candidateLog[field] = malformed;
    assert.throws(() => buildStaticRightsSigningCandidate({
      ...fixture,
      publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
    }), (error) => error instanceof StaticRightsSigningCandidateError
      && error.code === 'WITHDRAWAL_GENESIS_INVALID');
  }

  const fixture = signingFixture();
  fixture.withdrawalGenesisDraft.candidateLog.heads[0].payload.eventIds = {};
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...fixture,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), (error) => error instanceof StaticRightsSigningCandidateError
    && error.code === 'WITHDRAWAL_GENESIS_INVALID');

  const malformedAuthority = signingFixture();
  malformedAuthority.authoritySet.authorities = {};
  malformedAuthority.authoritySetSha256 = sha256(Buffer.from(canonicalJson(
    malformedAuthority.authoritySet,
    { sortedArrays: ['authorities'] },
  )));
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...malformedAuthority,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), (error) => error instanceof StaticRightsSigningCandidateError
    && error.code === 'WITHDRAWAL_GENESIS_INVALID');

  const successorSchema = signingFixture();
  const successorHead = successorSchema.withdrawalGenesisDraft.candidateLog.heads[0];
  successorHead.payload.schemaVersion = 2;
  successorHead.withdrawalHeadHash = semanticId(
    'fitappliance.static-rights-withdrawal-head',
    1,
    successorHead.payload,
  );
  assert.throws(() => buildStaticRightsSigningCandidate({
    ...successorSchema,
    publicEvidence: replayPublicEvidenceManifest({ manifestPath }),
  }), (error) => error instanceof StaticRightsSigningCandidateError
    && error.code === 'WITHDRAWAL_GENESIS_INVALID');
});
