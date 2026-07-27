import { createHash } from 'node:crypto';

import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from './beko-product-page-dimensions.mjs';
import { BEKO_AU_PRODUCT_IDENTITY_CAPABILITY } from './beko-product-page-identity.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import {
  ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
  ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
  OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
} from './mineru-document.mjs';
import {
  MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY,
} from './official-product-material-discovery-evidence.mjs';
import { SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY } from './smeg-pdf-dimensions.mjs';

export const SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY = 'samsung_au_rf71a_support_family';

export const EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS = Object.freeze({
  [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/beko-product-page-dimensions.mjs',
  ]),
  [BEKO_AU_PRODUCT_IDENTITY_CAPABILITY]: Object.freeze([
    'src/domain/beko-product-page-identity.mjs',
  ]),
  [ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/mineru-document.mjs',
  ]),
  [ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/mineru-document.mjs',
  ]),
  [OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/mineru-document.mjs',
  ]),
  [SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY]: Object.freeze([
    'src/domain/smeg-pdf-dimensions.mjs',
    'src/domain/mineru-document.mjs',
  ]),
  [MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY]: Object.freeze([
    'src/domain/evidence-artifact-pipeline.mjs',
    'src/domain/evidence-artifact-verifier.mjs',
    'src/domain/evidence-source-adapter-contract.mjs',
    'src/domain/evidence-source-verifier.mjs',
    'src/domain/mineru-document.mjs',
    'src/domain/official-model-variant-policy.mjs',
    'src/domain/official-product-material-discovery-evidence.mjs',
  ]),
  [SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY]: Object.freeze([
    'src/domain/evidence-artifact-pipeline.mjs',
    'src/domain/evidence-artifact-verifier.mjs',
    'src/domain/evidence-source-verifier.mjs',
    'src/domain/mineru-document.mjs',
    'src/domain/official-model-variant-policy.mjs',
    'src/domain/official-product-page-discovery-evidence.mjs',
  ]),
});

export const CLAIM_PARSER_IMPLEMENTATION_PATHS = Object.freeze([
  'src/domain/beko-product-page-dimensions.mjs',
  'src/domain/beko-product-page-identity.mjs',
  'src/domain/category-geometry.mjs',
  'src/domain/dimension-evidence-claim.mjs',
  'src/domain/evidence-artifact-pipeline.mjs',
  'src/domain/evidence-artifact-verifier.mjs',
  'src/domain/evidence-claim-reconciliation.mjs',
  'src/domain/evidence-claim-semantics.mjs',
  'src/domain/evidence-geometry-projector.mjs',
  'src/domain/evidence-source-companion-policy.mjs',
  'src/domain/evidence-source-verifier.mjs',
  'src/domain/mineru-document.mjs',
  'src/domain/official-market-api-discovery-evidence.mjs',
  'src/domain/official-model-variant-policy.mjs',
  'src/domain/official-product-material-discovery-evidence.mjs',
  'src/domain/official-product-page-discovery-evidence.mjs',
  'src/domain/official-support-api-discovery-evidence.mjs',
  'src/domain/smeg-pdf-dimensions.mjs',
]);

export const EVIDENCE_TOOLCHAIN_IMPLEMENTATION_PATHS = Object.freeze([
  ...new Set([
    ...CLAIM_PARSER_IMPLEMENTATION_PATHS,
    ...Object.values(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS).flat(),
  ]),
].sort());

function requiredSha256(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function normalizedBrand(value) {
  return String(value ?? '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
}

function implementationManifest(files, paths) {
  if (!(files instanceof Map) || files.size === 0) {
    throw new TypeError('claim parser implementation files required');
  }
  const manifest = paths.map((path) => {
    if (!files.has(path)) throw new TypeError(`claim parser implementation missing: ${path}`);
    return {
      path,
      sha256: createHash('sha256').update(Buffer.from(files.get(path))).digest('hex'),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(manifest.map(({ path }) => path)).size !== manifest.length) {
    throw new TypeError('claim parser implementation paths must be unique');
  }
  return manifest;
}

export function claimParserImplementationIdentity(files) {
  return canonicalJsonSha256(implementationManifest(files, [...files.keys()]));
}

export function historicalAttemptProcessorCapability({ brand, model, category, sourceUrl, failureCode }) {
  let url;
  try { url = new URL(sourceUrl); } catch { return null; }
  const normalized = normalizedBrand(brand);
  if (normalized === 'beko' && ['claim_semantics', 'identity'].includes(failureCode)
    && (url.hostname === 'beko.com' || url.hostname.endsWith('.beko.com'))
    && url.pathname.startsWith('/au-en/home-appliances/')) {
    return failureCode === 'identity'
      ? BEKO_AU_PRODUCT_IDENTITY_CAPABILITY
      : BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY;
  }
  if (normalized === 'smeg' && failureCode === 'mineru'
    && url.hostname === 'sys.smeg.com.au'
    && /^\/Product\/Techspecs\/[^/]+\.pdf$/i.test(url.pathname)) {
    return SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY;
  }
  const host = url.hostname.toLowerCase();
  let samsungManualPath = '';
  try { samsungManualPath = decodeURIComponent(url.searchParams.get('VPath') ?? ''); } catch {}
  if (normalized === 'samsung' && ['claim_semantics', 'identity', 'mineru'].includes(failureCode)
    && normalizedBrand(category) === 'fridge'
    && url.protocol === 'https:' && !url.username && !url.password
    && host === 'org.downloadcenter.samsung.com'
    && url.pathname.toLowerCase() === '/downloadfile/contentsfile.aspx'
    && normalizedBrand(url.searchParams.get('CDSite')) === 'uniau'
    && normalizedBrand(url.searchParams.get('CDCttType')) === 'um'
    && normalizedBrand(url.searchParams.get('ModelName')) === normalizedBrand(model)
    && /^\d+$/.test(url.searchParams.get('CttFileID') ?? '')
    && /(?:^|\/)DA68-04024C-\d+_MANUAL_USERS_F-Hub_EN\.pdf$/i.test(samsungManualPath)) {
    return SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY;
  }
  if (normalized === 'miele' && ['claim_semantics', 'identity', 'mineru'].includes(failureCode)
    && url.protocol === 'https:' && !url.username && !url.password && !url.search
    && host === 'www.miele.com.au'
    && /^\/media\/ex\/au\/specsheets\/\d{6,14}\.pdf$/i.test(url.pathname)) {
    return MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY;
  }
  if (normalized === 'esatto' && failureCode === 'mineru') {
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return null; }
    if (url.protocol === 'https:' && !url.username && !url.password
      && host === 'esatto.house'
      && !url.search && !url.hash) {
      const match = path.match(
        /^\/s\/Esatto_ProductCard([_-])([A-Z0-9][A-Z0-9.-]*)\.pdf$/i,
      );
      if (match) {
        return match[1] === '_' && /^EDW[A-Z0-9.-]*$/i.test(match[2])
          ? ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY
          : ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY;
      }
    }
  }
  if (normalized === 'omega' && failureCode === 'mineru') {
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return null; }
    if (url.protocol === 'https:' && !url.username && !url.password
      && host === 'omegaappliances.com.au'
      && /^\/s\/[A-Z0-9.-]+_Specsheet[^/]*\.pdf$/i.test(path)) {
      return OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY;
    }
  }
  return null;
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
