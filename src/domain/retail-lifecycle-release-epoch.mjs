import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
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

export function advanceRetailLifecycleShadowEpoch({
  releasePolicy,
  retailerLedger,
  officialIdentityEvidence = null,
  sourcePolicySha256,
  baselinePublicProjectionSha256,
  expectedLegacyCurrentProducts,
}) {
  const policy = validatePolicy(releasePolicy);
  const normalizedSourcePolicySha256 = sha256(sourcePolicySha256, 'source policy SHA-256');
  const normalizedBaselineSha256 = sha256(
    baselinePublicProjectionSha256,
    'baseline public projection SHA-256',
  );
  if (!Number.isInteger(expectedLegacyCurrentProducts) || expectedLegacyCurrentProducts < 0) {
    throw new TypeError('legacy-current population must be a non-negative integer');
  }
  if (!retailerLedger || retailerLedger.schemaVersion !== 2
    || !Array.isArray(retailerLedger.observations)
    || !Array.isArray(retailerLedger.collectionAttempts)
    || retailerLedger.collectionAttempts.length === 0
    || !SHA256.test(String(retailerLedger.semanticSha256 ?? ''))) {
    throw new TypeError('retailer ledger events required for shadow epoch advancement');
  }
  const eventTimes = [...retailerLedger.observations, ...retailerLedger.collectionAttempts]
    .map((event) => timestamp(event.observedAt, 'retailer ledger event observedAt'));
  let officialSemanticSha256 = null;
  if (officialIdentityEvidence != null) {
    if (![1, 2].includes(officialIdentityEvidence.schemaVersion)
      || !SHA256.test(String(officialIdentityEvidence.semanticSha256 ?? ''))) {
      throw new TypeError('valid official identity evidence required for shadow epoch advancement');
    }
    officialSemanticSha256 = officialIdentityEvidence.semanticSha256;
    eventTimes.push(timestamp(
      officialIdentityEvidence.acquiredAt,
      'official identity evidence acquiredAt',
    ));
  }
  const latest = eventTimes.sort().at(-1);
  const current = timestamp(policy.asOf, 'retail lifecycle release asOf');
  if (new Date(latest) < new Date(current)) {
    throw new Error('latest lifecycle input event precedes current release asOf');
  }
  const suffix = createHash('sha256')
    .update([
      retailerLedger.semanticSha256,
      ...(officialSemanticSha256 ? [officialSemanticSha256] : []),
      normalizedSourcePolicySha256,
      normalizedBaselineSha256,
      latest,
    ].join('\0'))
    .digest('hex')
    .slice(0, 12);
  const sourceLabel = officialSemanticSha256 ? 'inputs' : 'ledger';
  const releaseEpoch = `retail-lifecycle-shadow-${latest.slice(0, 10)}-${sourceLabel}-${suffix}`;
  if (latest === current
    && policy.releaseEpoch === releaseEpoch
    && policy.cutoverRequirements.expectedLegacyCurrentProducts
      === expectedLegacyCurrentProducts) {
    return Object.freeze({ changed: false, policy: structuredClone(policy) });
  }
  return Object.freeze({
    changed: true,
    policy: {
      ...structuredClone(policy),
      releaseEpoch,
      asOf: latest,
      cutoverRequirements: {
        ...structuredClone(policy.cutoverRequirements),
        expectedLegacyCurrentProducts,
      },
    },
  });
}
