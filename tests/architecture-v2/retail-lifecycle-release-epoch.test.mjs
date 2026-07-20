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

test('shadow epoch advances to the latest ledger event without authorizing cutover', () => {
  const result = advanceRetailLifecycleShadowEpoch({ releasePolicy: policy, retailerLedger: ledger });
  assert.equal(result.changed, true);
  assert.equal(result.policy.asOf, '2026-07-20T19:43:11.969Z');
  assert.equal(result.policy.mode, 'SHADOW_ONLY');
  assert.deepEqual(result.policy.cutoverRequirements, policy.cutoverRequirements);
  assert.match(result.policy.releaseEpoch, /^retail-lifecycle-shadow-2026-07-20-ledger-[a-f0-9]{12}$/);
});

test('shadow epoch advancement is idempotent and never moves time backwards', () => {
  const first = advanceRetailLifecycleShadowEpoch({ releasePolicy: policy, retailerLedger: ledger });
  const repeated = advanceRetailLifecycleShadowEpoch({
    releasePolicy: first.policy,
    retailerLedger: ledger,
  });
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.policy, first.policy);

  const older = structuredClone(ledger);
  older.observations[0].observedAt = '2026-07-19T00:00:00.000Z';
  older.collectionAttempts[0].observedAt = '2026-07-19T00:00:00.000Z';
  assert.throws(() => advanceRetailLifecycleShadowEpoch({
    releasePolicy: policy,
    retailerLedger: older,
  }), /precedes current release asOf/i);
});

test('shadow epoch rejects malformed ledgers and non-shadow release policy', () => {
  assert.throws(() => advanceRetailLifecycleShadowEpoch({
    releasePolicy: { ...policy, mode: 'CUTOVER' }, retailerLedger: ledger,
  }), /SHADOW_ONLY/i);
  assert.throws(() => advanceRetailLifecycleShadowEpoch({
    releasePolicy: policy, retailerLedger: { ...ledger, collectionAttempts: [] },
  }), /ledger events required/i);
});
