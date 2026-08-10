import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalOwnerJson, ownerSemanticId } from '../src/domain/owner-attestation-request-contract.mjs';
import {
  OwnerAttestationAcceptanceError,
  acceptOwnerAttestation,
  buildOwnerAttestationAcceptanceReceipt,
  validateOwnerAttestationAcceptanceReceipt,
} from '../scripts/deployment/accept-owner-attestation.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const owner = generateKeyPairSync('ed25519');
  const payload = {
    schemaVersion: 3, environment: 'PRODUCTION', action: 'PUBLIC_STATIC_DISTRIBUTION',
    dependencyId: 'FIRST_PARTY', ownerId: 'FITAPPLIANCE_OWNER', inventoryId: sha256('a'),
    scopeHash: sha256('b'), sourceObjectHash: sha256('c'), candidateId: sha256('d'),
    candidateSha256: sha256('e'), authoritySetId: sha256('f'), authoritySetSha256: sha256('g'),
    ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    ownerPublicKeyFingerprintSha256: sha256(owner.publicKey.export({ type: 'spki', format: 'der' })),
    ownerTrustAnchorSha256: sha256('i'), toolchainContractSha256: sha256('j'),
    candidateGeneratorSha256: sha256('k'), routeConfigSha256: sha256('l'),
    publicEvidenceManifestSha256: sha256('m'), withdrawalGenesisSha256: sha256('n'),
    offlineSignerContractId: sha256('o'), offlineSignerContractSha256: sha256('p'),
    issuedAt: '2026-08-11T08:00:00.000Z', expiresAt: '2026-08-11T09:00:00.000Z',
  };
  const envelope = {
    payload,
    signature: sign(null, Buffer.from(canonicalOwnerJson(payload)), owner.privateKey).toString('base64'),
  };
  const trustRoot = {
    source: 'INJECTED_READ_ONLY',
    publicKey: owner.publicKey.export({ type: 'spki', format: 'pem' }),
  };
  const requestPayload = {
    schemaVersion: 3, state: 'UNSIGNED', algorithm: 'Ed25519', encoding: 'base64',
    candidateId: payload.candidateId, candidateSha256: payload.candidateSha256,
    ownerRootId: payload.ownerRootId,
    ownerPublicKeyFingerprintSha256: payload.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: payload.ownerTrustAnchorSha256,
    ownerTrustRootSha256: sha256(Buffer.from(canonicalOwnerJson(trustRoot))),
    authoritySetId: payload.authoritySetId, authoritySetSha256: payload.authoritySetSha256,
    offlineSignerContractId: payload.offlineSignerContractId,
    offlineSignerContractSha256: payload.offlineSignerContractSha256,
    payload,
  };
  const request = {
    ...requestPayload,
    requestId: ownerSemanticId('fitappliance.owner-attestation-request', 3, requestPayload),
  };
  return {
    owner,
    payload,
    envelope,
    bytes: Buffer.from(canonicalOwnerJson(envelope)),
    request,
    requestBytes: Buffer.from(canonicalOwnerJson(request)),
    trustRoot,
    trustRootBytes: Buffer.from(canonicalOwnerJson(trustRoot)),
  };
}

test('consumes a valid attestation once before expiry into a bound immutable receipt', () => {
  const f = fixture();
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    requestBytes: f.requestBytes,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  });
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.state, 'OWNER_ATTESTATION_ACCEPTED');
  assert.equal(receipt.attestationSha256, sha256(f.bytes));
  assert.equal(receipt.candidateId, f.payload.candidateId);
  assert.equal(receipt.acceptedAt, '2026-08-11T08:30:00.000Z');
  assert.match(receipt.acceptanceId, /^[0-9a-f]{64}$/);
  assert.deepEqual(validateOwnerAttestationAcceptanceReceipt(Buffer.from(canonicalOwnerJson(receipt))), receipt);
});

test('rejects future, exact-expiry, expired and rollback clocks', () => {
  const f = fixture();
  for (const time of [
    '2026-08-11T07:59:59.999Z',
    '2026-08-11T09:00:00.000Z',
    '2026-08-11T09:00:00.001Z',
  ]) {
    assert.throws(() => buildOwnerAttestationAcceptanceReceipt({
      attestationBytes: f.bytes,
      ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
      requestBytes: f.requestBytes,
      now: () => new Date(time),
    }), (error) => error instanceof OwnerAttestationAcceptanceError && error.code === 'ATTESTATION_OUTSIDE_VALIDITY');
  }
});

test('receipt semantic identity detects acceptedAt and attestation substitution', () => {
  const f = fixture();
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    requestBytes: f.requestBytes,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  });
  const drift = { ...receipt, acceptedAt: '2026-08-11T08:31:00.000Z' };
  assert.throws(() => validateOwnerAttestationAcceptanceReceipt(Buffer.from(canonicalOwnerJson(drift))),
    (error) => error.code === 'ACCEPTANCE_ID_INVALID');
  assert.notEqual(ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, drift), receipt.acceptanceId);
});

test('receipt validation rejects a recomputed identity with a substituted request ID', () => {
  const f = fixture();
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    requestBytes: f.requestBytes,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  });
  const { acceptanceId: _ignored, ...payload } = {
    ...receipt,
    requestId: sha256('substituted-request'),
  };
  const substituted = {
    ...payload,
    acceptanceId: ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, payload),
  };
  assert.throws(
    () => validateOwnerAttestationAcceptanceReceipt(Buffer.from(canonicalOwnerJson(substituted))),
    (error) => error.code === 'ACCEPTANCE_REQUEST_INVALID',
  );
});

test('acceptance rejects a non-canonical base64 signature', () => {
  const f = fixture();
  const noncanonical = {
    ...f.envelope,
    signature: `${f.envelope.signature}==`,
  };
  assert.throws(() => buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: Buffer.from(canonicalOwnerJson(noncanonical)),
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    requestBytes: f.requestBytes,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  }), (error) => error.code === 'ATTESTATION_SIGNATURE_INVALID');
});

test('receipt validation rejects a recomputed identity outside the attestation validity window', () => {
  const f = fixture();
  const receipt = buildOwnerAttestationAcceptanceReceipt({
    attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    requestBytes: f.requestBytes,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  });
  const { acceptanceId: _ignored, ...expiredPayload } = {
    ...receipt,
    acceptedAt: receipt.expiresAt,
  };
  const expired = {
    ...expiredPayload,
    acceptanceId: ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, expiredPayload),
  };
  assert.throws(
    () => validateOwnerAttestationAcceptanceReceipt(Buffer.from(canonicalOwnerJson(expired))),
    (error) => error instanceof OwnerAttestationAcceptanceError && error.code === 'ACCEPTANCE_TIME_INVALID',
  );
});

test('acceptance operation validates the exact request and atomically no-clobbers one receipt', () => {
  const f = fixture();
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-owner-accept-'));
  chmodSync(root, 0o700);
  const outputPath = path.join(root, `${f.request.requestId}.owner-attestation-acceptance.json`);
  let clockCalls = 0;
  const result = acceptOwnerAttestation({
    requestBytes: f.requestBytes,
    attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    ownerTrustRootBytes: f.trustRootBytes,
    expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId,
    confirmation: 'ACCEPT_EXACT_OWNER_ATTESTATION',
    outputPath,
    now: () => { clockCalls += 1; return new Date('2026-08-11T08:30:00.000Z'); },
  });
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).requestId, f.request.requestId);
  assert.ok(clockCalls >= 2);
  assert.throws(() => acceptOwnerAttestation({
    requestBytes: f.requestBytes, attestationBytes: f.bytes,
    ownerPublicKeyPem: f.owner.publicKey.export({ type: 'spki', format: 'pem' }),
    ownerTrustRootBytes: f.trustRootBytes,
    expectedRequestId: f.request.requestId, expectedCandidateId: f.request.candidateId,
    confirmation: 'ACCEPT_EXACT_OWNER_ATTESTATION', outputPath,
    now: () => new Date('2026-08-11T08:30:00.000Z'),
  }), (error) => error.code === 'OUTPUT_EXISTS');
});
