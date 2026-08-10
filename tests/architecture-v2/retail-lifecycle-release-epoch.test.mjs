import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceRetailLifecycleShadowEpoch } from '../../src/domain/retail-lifecycle-release-epoch.mjs';

const policy = {
  schemaVersion: 1,
  policyVersion: 'retail-lifecycle-release-v1',
  releaseEpoch: 'retail-lifecycle-shadow-2026-07-20-old',
  asOf: '2026-07-20T17:37:00.000Z',
  mode: 'SHADOW_ONLY',
  retailLifecyclePolicyVersion: 'retail-lifecycle-v1',
  cutoverRequirements: {
    expectedLegacyCurrentProducts: 1384,
    maximumUnresolvedLegacyCurrentProducts: 0,
    maximumUnsafeRemovedLegacyCurrentProducts: 0,
    atomicDownstreamRebuildRequired: true,
  },
};

const ledger = {
  schemaVersion: 2,
  semanticSha256: 'a'.repeat(64),
  observations: [{ observedAt: '2026-07-20T18:00:00.000Z' }],
  collectionAttempts: [{ observedAt: '2026-07-20T19:43:11.969Z' }],
};

const officialEvidence = {
  schemaVersion: 2,
  semanticSha256: 'b'.repeat(64),
  acquiredAt: '2026-07-20T20:00:00.000Z',
};

const sourcePolicySha256 = 'c'.repeat(64);
const baselinePublicProjectionSha256 = 'd'.repeat(64);

function advance(input = {}) {
  return advanceRetailLifecycleShadowEpoch({
    releasePolicy: policy,
    retailerLedger: ledger,
    sourcePolicySha256,
    baselinePublicProjectionSha256,
    expectedLegacyCurrentProducts: 1384,
    ...input,
  });
}

test('shadow epoch advances to the latest ledger event without authorizing cutover', () => {
  const result = advance();
  assert.equal(result.changed, true);
  assert.equal(result.policy.asOf, '2026-07-20T19:43:11.969Z');
  assert.equal(result.policy.mode, 'SHADOW_ONLY');
  assert.deepEqual(result.policy.cutoverRequirements, policy.cutoverRequirements);
  assert.match(result.policy.releaseEpoch, /^retail-lifecycle-shadow-2026-07-20-ledger-[a-f0-9]{12}$/);
});

test('shadow epoch advancement is idempotent and never moves time backwards', () => {
  const first = advance();
  const repeated = advance({
    releasePolicy: first.policy,
  });
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.policy, first.policy);

  const older = structuredClone(ledger);
  older.observations[0].observedAt = '2026-07-19T00:00:00.000Z';
  older.collectionAttempts[0].observedAt = '2026-07-19T00:00:00.000Z';
  assert.throws(() => advance({
    retailerLedger: older,
  }), /precedes current release asOf/i);
});

test('shadow epoch rejects malformed ledgers and non-shadow release policy', () => {
  assert.throws(() => advance({
    releasePolicy: { ...policy, mode: 'CUTOVER' },
  }), /SHADOW_ONLY/i);
  assert.throws(() => advance({
    retailerLedger: { ...ledger, collectionAttempts: [] },
  }), /ledger events required/i);
});

test('shadow epoch advances across both retailer and official-market evidence', () => {
  const result = advance({
    officialIdentityEvidence: officialEvidence,
  });
  assert.equal(result.changed, true);
  assert.equal(result.policy.asOf, officialEvidence.acquiredAt);
  assert.match(result.policy.releaseEpoch, /^retail-lifecycle-shadow-2026-07-20-inputs-[a-f0-9]{12}$/);

  const changedEvidence = { ...officialEvidence, semanticSha256: 'c'.repeat(64) };
  const rebound = advance({
    officialIdentityEvidence: changedEvidence,
  });
  assert.notEqual(rebound.policy.releaseEpoch, result.policy.releaseEpoch);
});

test('shadow epoch rejects malformed or future-inconsistent official evidence', () => {
  assert.throws(() => advance({
    officialIdentityEvidence: { ...officialEvidence, semanticSha256: 'bad' },
  }), /official identity evidence/i);
  assert.throws(() => advance({
    releasePolicy: { ...policy, asOf: '2026-07-21T00:00:00.000Z' },
    officialIdentityEvidence: officialEvidence,
  }), /precedes current release asOf/i);
});

test('shadow epoch binds source policy and the cleaned baseline population', () => {
  const cleaned = advance({
    expectedLegacyCurrentProducts: 1348,
  });
  assert.equal(
    cleaned.policy.cutoverRequirements.expectedLegacyCurrentProducts,
    1348,
  );

  const changedRights = advance({
    sourcePolicySha256: 'e'.repeat(64),
    expectedLegacyCurrentProducts: 1348,
  });
  assert.notEqual(changedRights.policy.releaseEpoch, cleaned.policy.releaseEpoch);

  const changedBaseline = advance({
    baselinePublicProjectionSha256: 'f'.repeat(64),
    expectedLegacyCurrentProducts: 1348,
  });
  assert.notEqual(changedBaseline.policy.releaseEpoch, cleaned.policy.releaseEpoch);
});

test('shadow epoch fails closed without source-policy and baseline bindings', () => {
  assert.throws(() => advanceRetailLifecycleShadowEpoch({
    releasePolicy: policy,
    retailerLedger: ledger,
    expectedLegacyCurrentProducts: 1384,
  }), /source policy SHA-256/i);
  assert.throws(() => advance({
    expectedLegacyCurrentProducts: -1,
  }), /legacy-current population/i);
});
