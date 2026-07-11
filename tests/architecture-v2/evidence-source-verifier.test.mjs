import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createVerificationReceipt,
  validateTrustedSourceMetadata,
  verifyVerificationReceipt,
} from '../../src/domain/evidence-source-verifier.mjs';

const HASH = 'a'.repeat(64);
const caseIdentity = Object.freeze({
  brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge',
});

function source(overrides = {}) {
  return {
    authority: 'manufacturer',
    sourceUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z',
    contentSha256: HASH,
    objectPath: `evidence/web/sha256/aa/aa/${HASH}.html`,
    contentType: 'text/html',
    byteSize: 1234,
    identity: { brand: 'Westinghouse', model: 'WHE6874BA', outcome: 'exact' },
    identitySignals: [
      { type: 'canonical_url', value: 'https://www.westinghouse.com.au/fridges/whe6874ba/' },
      { type: 'product_model', value: 'WHE6874BA' },
    ],
    claims: [
      { field: 'closedEnvelope.widthMm', value: 913, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 913 mm' },
    ],
    ...overrides,
  };
}

test('brand policy rejects self-declared manufacturers and cross-brand redirects', () => {
  assert.throws(() => validateTrustedSourceMetadata(source({
    sourceUrl: 'https://evil.example/fake', finalUrl: 'https://evil.example/fake',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /official host/i);

  assert.throws(() => validateTrustedSourceMetadata(source({
    redirectChain: ['https://evil.example/redirect'],
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /redirect/i);

  assert.throws(() => validateTrustedSourceMetadata(source(), {
    ...caseIdentity, brand: 'Samsung',
  }, { asOf: '2026-07-11T15:00:00.000Z' }), /official host/i);
});

test('retrieval time must be real, non-future, and inside freshness policy', () => {
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2026-99-99T99:99:99Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /retrieval time/i);
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2026-07-12T15:00:00.000Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /future/i);
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2024-01-01T00:00:00.000Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /stale/i);
});

test('verification receipt binds case identity, source metadata, artifact, and claims', () => {
  const input = source();
  input.verificationReceipt = createVerificationReceipt(input, caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });

  assert.equal(verifyVerificationReceipt(input, caseIdentity, {
    asOf: '2026-07-11T15:00:00.000Z',
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...input,
    claims: [{ ...input.claims[0], value: 1 }],
  }, caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt digest/i);
  assert.throws(() => verifyVerificationReceipt(input, {
    ...caseIdentity, model: 'WHE6874SA',
  }, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt digest|identity/i);
});

test('receipt rejects malformed artifact metadata and verification timestamps', () => {
  assert.throws(() => createVerificationReceipt(source({ byteSize: 0 }), caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /byte size/i);
  assert.throws(() => createVerificationReceipt(source(), caseIdentity, {
    verifiedAt: 'not-a-date',
  }), /verification time/i);
});
