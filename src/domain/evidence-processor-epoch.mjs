import { createHash } from 'node:crypto';

import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from './beko-product-page-dimensions.mjs';
import { BEKO_AU_PRODUCT_IDENTITY_CAPABILITY } from './beko-product-page-identity.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

export const EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS = Object.freeze({
  [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/beko-product-page-dimensions.mjs',
  ]),
  [BEKO_AU_PRODUCT_IDENTITY_CAPABILITY]: Object.freeze([
    'src/domain/beko-product-page-identity.mjs',
  ]),
});

function requiredSha256(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function normalizedBrand(value) {
  return String(value ?? '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
}

export function historicalAttemptProcessorCapability({ brand, sourceUrl, failureCode }) {
  if (!['claim_semantics', 'identity'].includes(failureCode) || normalizedBrand(brand) !== 'beko') return null;
  let url;
  try { url = new URL(sourceUrl); } catch { return null; }
  if ((url.hostname !== 'beko.com' && !url.hostname.endsWith('.beko.com'))
    || !url.pathname.startsWith('/au-en/home-appliances/')) return null;
  return failureCode === 'identity'
    ? BEKO_AU_PRODUCT_IDENTITY_CAPABILITY
    : BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY;
}

export function buildEvidenceProcessorEpochs(files) {
  if (!(files instanceof Map)) throw new TypeError('evidence processor implementation files required');
  return Object.fromEntries(Object.entries(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, paths]) => {
      const implementation = paths.map((path) => {
        if (!files.has(path)) throw new TypeError(`evidence processor implementation missing: ${path}`);
        return {
          path,
          sha256: createHash('sha256').update(Buffer.from(files.get(path))).digest('hex'),
        };
      });
      return [capability, canonicalJsonSha256({ schemaVersion: 1, capability, implementation })];
    }));
}

export function validateEvidenceProcessorEpochs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('evidence processor epochs required');
  }
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, epoch]) => [
      String(capability).trim(),
      requiredSha256(epoch, `evidence processor epoch ${capability}`),
    ]));
}

export function legacyEvidenceProcessorEpoch({ capability, toolchainSha256 }) {
  if (!EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS[capability]) {
    throw new TypeError(`unknown evidence processor capability: ${capability}`);
  }
  return canonicalJsonSha256({
    schemaVersion: 1,
    capability,
    implementationState: 'absent_from_attested_legacy_toolchain',
    toolchainSha256: requiredSha256(toolchainSha256, 'legacy toolchain SHA-256'),
  });
}
