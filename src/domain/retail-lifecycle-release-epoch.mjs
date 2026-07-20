import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function timestamp(value, label) {
  const parsed = new Date(required(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function validatePolicy(value) {
  if (!value || value.schemaVersion !== 1
    || value.policyVersion !== 'retail-lifecycle-release-v1') {
    throw new TypeError('retail lifecycle release policy schema v1 required');
  }
  if (value.mode !== 'SHADOW_ONLY') {
    throw new Error('retail lifecycle epoch advancement requires SHADOW_ONLY mode');
  }
  const requirements = value.cutoverRequirements;
  if (!requirements || !Number.isInteger(requirements.expectedLegacyCurrentProducts)
    || requirements.maximumUnresolvedLegacyCurrentProducts !== 0
    || requirements.maximumUnsafeRemovedLegacyCurrentProducts !== 0
    || requirements.atomicDownstreamRebuildRequired !== true) {
    throw new TypeError('retail lifecycle cutover requirements invalid');
  }
  timestamp(value.asOf, 'retail lifecycle release asOf');
  required(value.releaseEpoch, 'retail lifecycle release epoch');
  required(value.retailLifecyclePolicyVersion, 'retail lifecycle policy version');
  return value;
}

export function advanceRetailLifecycleShadowEpoch({ releasePolicy, retailerLedger }) {
  const policy = validatePolicy(releasePolicy);
  if (!retailerLedger || retailerLedger.schemaVersion !== 2
    || !Array.isArray(retailerLedger.observations)
    || !Array.isArray(retailerLedger.collectionAttempts)
    || retailerLedger.collectionAttempts.length === 0
    || !SHA256.test(String(retailerLedger.semanticSha256 ?? ''))) {
    throw new TypeError('retailer ledger events required for shadow epoch advancement');
  }
  const eventTimes = [...retailerLedger.observations, ...retailerLedger.collectionAttempts]
    .map((event) => timestamp(event.observedAt, 'retailer ledger event observedAt'));
  const latest = eventTimes.sort().at(-1);
  const current = timestamp(policy.asOf, 'retail lifecycle release asOf');
  if (new Date(latest) < new Date(current)) {
    throw new Error('latest retailer ledger event precedes current release asOf');
  }
  if (latest === current) return Object.freeze({ changed: false, policy: structuredClone(policy) });
  const suffix = createHash('sha256')
    .update(`${retailerLedger.semanticSha256}\0${latest}`)
    .digest('hex')
    .slice(0, 12);
  return Object.freeze({
    changed: true,
    policy: {
      ...structuredClone(policy),
      releaseEpoch: `retail-lifecycle-shadow-${latest.slice(0, 10)}-ledger-${suffix}`,
      asOf: latest,
    },
  });
}
