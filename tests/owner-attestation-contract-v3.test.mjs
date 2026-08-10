import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  OwnerAttestationContractError,
  canonicalOwnerJson,
  ownerSemanticId,
  validateOwnerAttestationRequest,
} from '../src/domain/owner-attestation-request-contract.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const h = Object.fromEntries('abcdefghijklmnop'.split('').map((key) => [key, hash(key)]));

function request() {
  const payload = {
    schemaVersion: 3,
    environment: 'PRODUCTION',
    action: 'PUBLIC_STATIC_DISTRIBUTION',
    dependencyId: 'FIRST_PARTY',
    ownerId: 'FITAPPLIANCE_OWNER',
    inventoryId: h.a,
    scopeHash: h.b,
    sourceObjectHash: h.c,
    candidateId: h.d,
    candidateSha256: h.e,
    authoritySetId: h.f,
    authoritySetSha256: h.g,
    ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    ownerPublicKeyFingerprintSha256: h.h,
    ownerTrustAnchorSha256: h.i,
    toolchainContractSha256: h.j,
    candidateGeneratorSha256: h.k,
    routeConfigSha256: h.l,
    publicEvidenceManifestSha256: h.m,
    withdrawalGenesisSha256: h.n,
    offlineSignerContractId: h.o,
    offlineSignerContractSha256: h.p,
    issuedAt: '2026-08-11T08:00:00.000Z',
    expiresAt: '2026-08-11T09:00:00.000Z',
  };
  const unsigned = {
    schemaVersion: 3,
    state: 'UNSIGNED',
    algorithm: 'Ed25519',
    encoding: 'base64',
    candidateId: payload.candidateId,
    candidateSha256: payload.candidateSha256,
    ownerRootId: payload.ownerRootId,
    ownerPublicKeyFingerprintSha256: payload.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: payload.ownerTrustAnchorSha256,
    ownerTrustRootSha256: h.a,
    authoritySetId: payload.authoritySetId,
    authoritySetSha256: payload.authoritySetSha256,
    offlineSignerContractId: payload.offlineSignerContractId,
    offlineSignerContractSha256: payload.offlineSignerContractSha256,
    payload,
  };
  return {
    ...unsigned,
    requestId: ownerSemanticId('fitappliance.owner-attestation-request', 3, unsigned),
  };
}

test('strict schema-3 request validates exact canonical bytes and semantic identity', () => {
  const value = request();
  const bytes = Buffer.from(canonicalOwnerJson(value));
  assert.deepEqual(validateOwnerAttestationRequest(bytes), value);
  assert.throws(
    () => validateOwnerAttestationRequest(Buffer.from(`${JSON.stringify(value)}\n`)),
    (error) => error instanceof OwnerAttestationContractError && error.code === 'REQUEST_NONCANONICAL',
  );
  const drift = structuredClone(value);
  drift.payload.scopeHash = h.p;
  assert.throws(
    () => validateOwnerAttestationRequest(Buffer.from(canonicalOwnerJson(drift))),
    (error) => error.code === 'REQUEST_ID_INVALID',
  );
});
test('schema-2 requests are explicitly superseded and cannot be upgraded', () => {
  const old = request();
  old.schemaVersion = 2;
  old.payload.schemaVersion = 2;
  assert.throws(
    () => validateOwnerAttestationRequest(Buffer.from(canonicalOwnerJson(old))),
    (error) => error.code === 'UNSUPPORTED_SUPERSEDED_REQUEST',
  );
});

test('request rejects unknown keys, nested binding drift and invalid validity windows', () => {
  for (const mutate of [
    (value) => { value.unexpected = true; },
    (value) => { value.candidateId = h.a; },
    (value) => { value.payload.offlineSignerContractId = h.a; },
    (value) => { value.payload.expiresAt = value.payload.issuedAt; },
  ]) {
    const value = request();
    mutate(value);
    assert.throws(() => validateOwnerAttestationRequest(Buffer.from(canonicalOwnerJson(value))));
  }
});
