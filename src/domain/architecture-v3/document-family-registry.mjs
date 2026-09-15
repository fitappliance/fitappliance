import { createHash } from 'node:crypto';

import { replayInspectedRegion } from './extraction-region-observation.mjs';
import { resolveBrandAlias } from './brand-registry.mjs';
import { canonicalEvidenceJson } from '../../shared/canonical-evidence-json.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BRAND_ID_PATTERN = /^fa_brand_[a-f0-9]{64}$/;
const POLICY_ID = 'fitappliance-document-family-profiles-v1';
const POLICY_REGISTRY_PATH = 'data/architecture-v3/generated/brand-registry.json';
const CANONICALIZATION_VERSION = 'fit-evidence-json-v3-1';
const SELECTION_BINDING_VERSION = 'fitappliance-document-profile-selection-v1';

const REGISTRY_ENVELOPE_KEYS = ['brandRegistry', 'brandRegistrySha256', 'profilePolicy'];
const POLICY_KEYS = [
  'schemaVersion',
  'canonicalizationVersion',
  'policyId',
  'policyVersion',
  'brandRegistryBinding',
  'profiles',
  'policySha256',
];
const BRAND_REGISTRY_BINDING_KEYS = ['market', 'registryPath', 'registrySha256'];
const PROFILE_KEYS = [
  'profileId',
  'profileSha256',
  'version',
  'status',
  'brandIds',
  'categories',
  'documentTypes',
  'contentModes',
  'requiredStructuralSignals',
  'forbiddenStructuralSignals',
  'extractorChain',
  'canaryWitnesses',
];
const CANARY_WITNESS_KEYS = ['positiveSourceSha256s', 'negativeSourceSha256s'];
const ALLOWED_CATEGORIES = new Set(['dishwasher', 'dryer', 'washing_machine']);
const ALLOWED_DOCUMENT_TYPES = new Set(['manufacturer_product_sheet']);
const ALLOWED_CONTENT_MODES = new Set(['image', 'structured_text', 'table']);
const ALLOWED_STRUCTURAL_SIGNALS = new Set([
  'raw_block_identity',
  'title',
  'paragraph',
  'page_header',
  'index',
  'image',
  'table',
  'image_region',
  'table_region',
  'table_with_headers',
  'empty_body_text',
  'dimension_context',
  'numeric_unit_text',
  'unpackaged_context',
  'page_has_split_columns',
  'split_column_region',
  'page_has_image_and_disclaimer',
  'image_or_disclaimer_region',
  'mixed_units',
]);
const ALLOWED_EXTRACTOR_ROUTES = new Set(['native', 'mineru', 'ocr_or_vision', 'unresolved']);
function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function strictJsonClone(value) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch {
    return null;
  }
}

function exactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function without(value, keys) {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function envelope(status, reasons, extra = {}) {
  return {
    status,
    candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
    reasons: sortedUnique(reasons),
    ...extra,
  };
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function validBrandId(value) {
  return typeof value === 'string' && BRAND_ID_PATTERN.test(value);
}

function validStringArray(value, allowedValues, { minimum = 1 } = {}) {
  return Array.isArray(value)
    && value.length >= minimum
    && value.every((entry) => typeof entry === 'string' && allowedValues.has(entry))
    && new Set(value).size === value.length;
}

function validSha256Array(value, { minimum = 1 } = {}) {
  return Array.isArray(value)
    && value.length >= minimum
    && value.every(validSha256)
    && new Set(value).size === value.length;
}

function validateProfile(profile, knownBrandIds) {
  if (!exactKeys(profile, PROFILE_KEYS)) return { ok: false, reason: 'INVALID_PROFILE_SCHEMA' };
  if (profile.version !== 1
    || typeof profile.profileId !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*-v1$/.test(profile.profileId)
    || !['active', 'disabled'].includes(profile.status)) {
    return { ok: false, reason: 'INVALID_PROFILE_VERSION_OR_STATUS' };
  }
  if (!validSha256(profile.profileSha256)) return { ok: false, reason: 'PROFILE_HASH_MISMATCH' };
  if (!Array.isArray(profile.brandIds)
    || profile.brandIds.length === 0
    || !profile.brandIds.every((brandId) => validBrandId(brandId) && knownBrandIds.has(brandId))
    || new Set(profile.brandIds).size !== profile.brandIds.length) {
    return { ok: false, reason: 'UNKNOWN_PROFILE_BRAND_REFERENCE' };
  }
  if (!validStringArray(profile.categories, ALLOWED_CATEGORIES)
    || !validStringArray(profile.documentTypes, ALLOWED_DOCUMENT_TYPES)
    || !validStringArray(profile.contentModes, ALLOWED_CONTENT_MODES)
    || !validStringArray(profile.requiredStructuralSignals, ALLOWED_STRUCTURAL_SIGNALS)
    || !validStringArray(profile.forbiddenStructuralSignals, ALLOWED_STRUCTURAL_SIGNALS)
    || profile.requiredStructuralSignals.some((signal) => profile.forbiddenStructuralSignals.includes(signal))) {
    return { ok: false, reason: 'INVALID_PROFILE_SELECTOR_VOCABULARY' };
  }
  if (!profile.requiredStructuralSignals.includes('raw_block_identity')) {
    return { ok: false, reason: 'INVALID_PROFILE_SELECTOR_VOCABULARY' };
  }
  if (!validStringArray(profile.extractorChain, ALLOWED_EXTRACTOR_ROUTES)
    || profile.extractorChain.at(-1) !== 'unresolved'
    || profile.extractorChain.slice(0, -1).includes('unresolved')
    || profile.extractorChain.length < 2) {
    return { ok: false, reason: 'INVALID_PROFILE_EXTRACTOR_CHAIN' };
  }
  if (!exactKeys(profile.canaryWitnesses, CANARY_WITNESS_KEYS)
    || !validSha256Array(profile.canaryWitnesses.positiveSourceSha256s)
    || !validSha256Array(profile.canaryWitnesses.negativeSourceSha256s)
    || profile.canaryWitnesses.positiveSourceSha256s.some((hash) => (
      profile.canaryWitnesses.negativeSourceSha256s.includes(hash)
    ))) {
    return { ok: false, reason: 'INVALID_PROFILE_CANARY_WITNESSES' };
  }
  if (profile.profileSha256 !== canonicalSha256(without(profile, ['profileSha256']))) {
    return { ok: false, reason: 'PROFILE_HASH_MISMATCH' };
  }
  return { ok: true };
}

function validatePolicy(policy, registrySha256, market, knownBrandIds) {
  if (!exactKeys(policy, POLICY_KEYS)) return { ok: false, reason: 'INVALID_PROFILE_POLICY_SCHEMA' };
  if (policy.schemaVersion !== 1
    || policy.canonicalizationVersion !== CANONICALIZATION_VERSION
    || policy.policyId !== POLICY_ID
    || typeof policy.policyVersion !== 'string'
    || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(policy.policyVersion)) {
    return { ok: false, reason: 'INVALID_PROFILE_POLICY_SCHEMA' };
  }
  if (!exactKeys(policy.brandRegistryBinding, BRAND_REGISTRY_BINDING_KEYS)
    || policy.brandRegistryBinding.market !== market
    || policy.brandRegistryBinding.registryPath !== POLICY_REGISTRY_PATH
    || policy.brandRegistryBinding.registrySha256 !== registrySha256) {
    return { ok: false, reason: 'BRAND_REGISTRY_BINDING_MISMATCH' };
  }
  if (!Array.isArray(policy.profiles) || policy.profiles.length === 0) {
    return { ok: false, reason: 'INVALID_PROFILE_POLICY_SCHEMA' };
  }
  const profileIds = new Set();
  for (const profile of policy.profiles) {
    const profileValidation = validateProfile(profile, knownBrandIds);
    if (!profileValidation.ok) return profileValidation;
    if (profileIds.has(profile.profileId)) return { ok: false, reason: 'DUPLICATE_PROFILE_ID' };
    profileIds.add(profile.profileId);
  }
  if (!validSha256(policy.policySha256)
    || policy.policySha256 !== canonicalSha256(without(policy, ['policySha256']))) {
    return { ok: false, reason: 'POLICY_HASH_MISMATCH' };
  }
  return { ok: true };
}

function validateRegistryEnvelope(untrustedRegistry) {
  const registry = strictJsonClone(untrustedRegistry);
  if (!exactKeys(registry, REGISTRY_ENVELOPE_KEYS)) return { ok: false, reason: 'INVALID_REGISTRY_ENVELOPE' };
  const { brandRegistry, brandRegistrySha256, profilePolicy } = registry;
  if (!isPlainObject(brandRegistry) || !validSha256(brandRegistrySha256)) {
    return { ok: false, reason: 'INVALID_REGISTRY_ENVELOPE' };
  }
  if (canonicalSha256(brandRegistry) !== brandRegistrySha256) {
    return { ok: false, reason: 'BRAND_REGISTRY_HASH_MISMATCH' };
  }
  if (typeof brandRegistry.market !== 'string' || !Array.isArray(brandRegistry.brands)) {
    return { ok: false, reason: 'INVALID_BRAND_REGISTRY' };
  }
  const knownBrandIds = new Set();
  try {
    for (const brand of brandRegistry.brands) {
      if (!isPlainObject(brand) || !validBrandId(brand.brandId) || typeof brand.displayName !== 'string') {
        return { ok: false, reason: 'INVALID_BRAND_REGISTRY' };
      }
      if (knownBrandIds.has(brand.brandId)) return { ok: false, reason: 'INVALID_BRAND_REGISTRY' };
      knownBrandIds.add(brand.brandId);
      const resolved = resolveBrandAlias({
        alias: brand.displayName,
        market: brandRegistry.market,
        registry: brandRegistry,
      });
      if (resolved.status !== 'resolved' || resolved.brandId !== brand.brandId) {
        return { ok: false, reason: 'INVALID_BRAND_REGISTRY' };
      }
    }
  } catch {
    return { ok: false, reason: 'INVALID_BRAND_REGISTRY' };
  }
  const policy = validatePolicy(profilePolicy, brandRegistrySha256, brandRegistry.market, knownBrandIds);
  if (!policy.ok) return policy;
  return { ok: true, registry };
}

function profileMatches(profile, context) {
  return profile.brandIds.includes(context.brandId)
    && profile.categories.includes(context.category)
    && profile.documentTypes.includes(context.documentType)
    && profile.contentModes.includes(context.region.contentMode)
    && profile.requiredStructuralSignals.every((signal) => context.signals.has(signal))
    && profile.forbiddenStructuralSignals.every((signal) => !context.signals.has(signal));
}

/**
 * Selects one policy-coded structural profile. The returned binding carries
 * replayable policy, selector, and raw-region identities; it is not a Claim,
 * receipt, Fit, or publication result.
 */
export function selectDocumentProfile(input = {}) {
  const selectorInput = strictJsonClone(input);
  if (!exactKeys(selectorInput, ['registry', 'brandId', 'category', 'documentType', 'regionObservation'])) {
    return envelope('invalid', ['INVALID_DOCUMENT_SELECTOR']);
  }
  const registryValidation = validateRegistryEnvelope(selectorInput.registry);
  if (!registryValidation.ok) return envelope('invalid', [registryValidation.reason]);
  if (typeof selectorInput.brandId !== 'string'
    || typeof selectorInput.category !== 'string'
    || typeof selectorInput.documentType !== 'string') {
    return envelope('invalid', ['INVALID_DOCUMENT_SELECTOR']);
  }
  const regionValidation = replayInspectedRegion(selectorInput.regionObservation);
  if (!regionValidation.ok) return envelope('invalid', [regionValidation.reason]);
  if (regionValidation.region.status !== 'inspected') return envelope('invalid', ['UNINSPECTED_REGION']);

  const { registry } = registryValidation;
  const { brandRegistry, brandRegistrySha256, profilePolicy } = registry;
  const brand = brandRegistry.brands.find((candidate) => candidate.brandId === selectorInput.brandId);
  if (!brand) return envelope('unsupported', ['UNKNOWN_BRAND_ID']);

  try {
    const resolved = resolveBrandAlias({
      alias: brand.displayName,
      market: brandRegistry.market,
      registry: brandRegistry,
    });
    if (resolved.status !== 'resolved' || resolved.brandId !== selectorInput.brandId) {
      return envelope('unsupported', ['UNKNOWN_BRAND_ID']);
    }
  } catch {
    return envelope('invalid', ['INVALID_BRAND_REGISTRY']);
  }

  const context = {
    brandId: selectorInput.brandId,
    category: selectorInput.category,
    documentType: selectorInput.documentType,
    region: regionValidation.region,
    signals: new Set(regionValidation.region.structuralSignals),
  };
  const matchingProfiles = profilePolicy.profiles.filter((profile) => profileMatches(profile, context));
  const activeProfiles = matchingProfiles.filter((profile) => profile.status === 'active');
  const disabledProfiles = matchingProfiles.filter((profile) => profile.status === 'disabled');

  if (activeProfiles.length === 0) {
    return envelope('unsupported', [
      'NO_ELIGIBLE_PROFILE',
      ...(disabledProfiles.length > 0 ? ['PROFILE_DISABLED'] : []),
    ]);
  }
  if (activeProfiles.length > 1) {
    return envelope('ambiguous', ['MULTIPLE_ELIGIBLE_PROFILES'], {
      profileIds: activeProfiles.map((profile) => profile.profileId).sort((left, right) => left.localeCompare(right)),
    });
  }

  const profile = activeProfiles[0];
  return envelope('selected', ['PROFILE_SELECTED'], {
    profile,
    selectionBinding: {
      schemaVersion: 1,
      bindingVersion: SELECTION_BINDING_VERSION,
      registry,
      selector: {
        brandId: selectorInput.brandId,
        category: selectorInput.category,
        documentType: selectorInput.documentType,
      },
      regionIdentity: {
        regionId: regionValidation.region.regionId,
        sourceJsonPointer: regionValidation.region.sourceJsonPointer,
        fragmentSha256: regionValidation.region.fragmentSha256,
        parentArtifactSha256: regionValidation.region.rawBlockIdentity.parentArtifactSha256,
      },
      profileIdentity: {
        profileId: profile.profileId,
        profileSha256: profile.profileSha256,
      },
      policySha256: profilePolicy.policySha256,
      brandRegistrySha256,
    },
  });
}
