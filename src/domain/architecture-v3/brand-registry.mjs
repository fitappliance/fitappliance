import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';

export const BRAND_REGISTRY_SCHEMA_VERSION = 1;
export const BRAND_REGISTRY_VERSION = 'fitappliance-brand-registry-v1';
export const BRAND_ID_DOMAIN = 'fitappliance.brand-registry.id.v1';
export const BRAND_ALIAS_NORMALIZATION_VERSION = 'trim-collapse-whitespace-lowercase-v1';
export const MANUFACTURER_SOURCE_POLICY_PATH = 'data/architecture-v2/policies/manufacturer-source-policy.json';

const MARKET_PATTERN = /^[A-Z]{2,3}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class BrandRegistryValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'BrandRegistryValidationError';
    this.code = 'INVALID_BRAND_REGISTRY';
  }
}

function invalid(message) {
  throw new BrandRegistryValidationError(message);
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalInput(value, label) {
  try {
    canonicalEvidenceJson(value);
  } catch (error) {
    invalid(`${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactObject(value, label, allowedKeys, requiredKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) invalid(`${label} has unknown key: ${key}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing key: ${key}`);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) invalid(`${label} must be a non-empty string`);
  return value;
}

function stableKey(value, label) {
  const text = requiredText(value, label);
  if (text !== text.trim()) invalid(`${label} must not have leading or trailing whitespace`);
  return text;
}

function marketCode(value, label) {
  const market = requiredText(value, label);
  if (!MARKET_PATTERN.test(market)) invalid(`${label} must be a 2-3 letter uppercase market code`);
  return market;
}

function normalizeAlias(value, label) {
  const text = requiredText(value, label);
  const normalized = text.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!normalized) invalid(`${label} must not normalize to empty`);
  return normalized;
}

function sortedUniqueStrings(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  if (!allowEmpty && value.length === 0) invalid(`${label} must not be empty`);
  const seen = new Set();
  const result = [];
  for (const [index, item] of value.entries()) {
    const text = requiredText(item, `${label}[${index}]`);
    if (seen.has(text)) invalid(`${label} has duplicate spelling: ${text}`);
    seen.add(text);
    result.push(text);
  }
  return result.sort(stableCompare);
}

function assertSortedUnique(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (stableCompare(values[index - 1], values[index]) >= 0) {
      invalid(`${label} must be sorted with no duplicates`);
    }
  }
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function brandIdFor({ market, stableBrandKey }) {
  return `fa_brand_${sha256(canonicalEvidenceJson({
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    schemaVersion: BRAND_REGISTRY_SCHEMA_VERSION,
    brandIdDomain: BRAND_ID_DOMAIN,
    market,
    stableBrandKey,
  }))}`;
}

function addBrandAlias(aliasIndex, normalizedAlias, brandId) {
  let brandIds = aliasIndex.get(normalizedAlias);
  if (!brandIds) {
    brandIds = new Set();
    aliasIndex.set(normalizedAlias, brandIds);
  }
  brandIds.add(brandId);
}

function collisionSummary(aliasIndex) {
  return [...aliasIndex.entries()]
    .filter(([, brandIds]) => brandIds.size > 1)
    .map(([alias, brandIds]) => ({ alias, brandIds: [...brandIds].sort(stableCompare) }))
    .sort((left, right) => stableCompare(left.alias, right.alias));
}

function indexBrandAliases(brands) {
  const aliasIndex = new Map();
  for (const brand of brands) {
    for (const spelling of [brand.displayName, ...brand.observedSpellings, ...brand.aliases]) {
      addBrandAlias(aliasIndex, normalizeAlias(spelling, `brand ${brand.stableBrandKey} spelling`), brand.brandId);
    }
  }
  return aliasIndex;
}

function normalizeBrandFields({ value, label, allowMissingParentGroup, requireSortedSetLikeInputs }) {
  const stableBrandKey = stableKey(value.stableBrandKey, `${label} stableBrandKey`);
  const displayName = requiredText(value.displayName, `${label} ${stableBrandKey} displayName`);
  const observedSpellings = sortedUniqueStrings(
    value.observedSpellings,
    `${label} ${stableBrandKey} observedSpellings`,
    { allowEmpty: false },
  );
  const aliases = sortedUniqueStrings(value.aliases, `${label} ${stableBrandKey} aliases`);
  const researchAliases = sortedUniqueStrings(value.researchAliases, `${label} ${stableBrandKey} researchAliases`);
  let parentGroup;
  if (value.parentGroup === undefined) {
    if (!allowMissingParentGroup) invalid(`${label} ${stableBrandKey} parentGroup is required`);
    parentGroup = null;
  } else if (value.parentGroup === null) {
    parentGroup = null;
  } else {
    parentGroup = requiredText(value.parentGroup, `${label} ${stableBrandKey} parentGroup`);
  }

  if (requireSortedSetLikeInputs) {
    assertSortedUnique(observedSpellings, `${label} ${stableBrandKey} observedSpellings`);
    assertSortedUnique(aliases, `${label} ${stableBrandKey} aliases`);
    assertSortedUnique(researchAliases, `${label} ${stableBrandKey} researchAliases`);
    if (canonicalEvidenceJson(observedSpellings) !== canonicalEvidenceJson(value.observedSpellings)
      || canonicalEvidenceJson(aliases) !== canonicalEvidenceJson(value.aliases)
      || canonicalEvidenceJson(researchAliases) !== canonicalEvidenceJson(value.researchAliases)) {
      invalid(`${label} ${stableBrandKey} set-like arrays must be sorted`);
    }
  }

  const resolverKeys = new Set(
    [displayName, ...observedSpellings, ...aliases]
      .map((spelling) => normalizeAlias(spelling, `${label} ${stableBrandKey} resolver spelling`)),
  );
  for (const researchAlias of researchAliases) {
    if (resolverKeys.has(normalizeAlias(researchAlias, `${label} ${stableBrandKey} research alias`))) {
      invalid(`${label} ${stableBrandKey} research alias duplicates a resolver spelling`);
    }
  }

  return {
    stableBrandKey,
    displayName,
    observedSpellings,
    aliases,
    researchAliases,
    parentGroup,
  };
}

function buildBrand({ value, market }) {
  exactObject(value, 'brand', [
    'aliases', 'displayName', 'observedSpellings', 'parentGroup', 'researchAliases', 'stableBrandKey',
  ], ['aliases', 'displayName', 'observedSpellings', 'researchAliases', 'stableBrandKey']);

  const brand = normalizeBrandFields({
    value,
    label: 'brand',
    allowMissingParentGroup: true,
    requireSortedSetLikeInputs: false,
  });
  return {
    brandId: brandIdFor({ market, stableBrandKey: brand.stableBrandKey }),
    ...brand,
  };
}

function policyBrandPointer(value, label) {
  const brandPointer = requiredText(value, label);
  const brandKey = brandPointer.slice('/brands/'.length);
  if (!brandPointer.startsWith('/brands/') || brandKey.length === 0 || brandKey.includes('/')) {
    invalid(`${label} must locate one policy brand entry`);
  }
  if (/~(?:[^01]|$)/u.test(brandKey)) {
    invalid(`${label} must use a valid JSON Pointer escape`);
  }
  return brandPointer;
}

function policyReferenceDetails(value, label) {
  if (value.policyPath !== MANUFACTURER_SOURCE_POLICY_PATH) {
    invalid(`${label} policyPath must be ${MANUFACTURER_SOURCE_POLICY_PATH}`);
  }
  if (!Number.isInteger(value.policySchemaVersion) || value.policySchemaVersion < 1) {
    invalid(`${label} policySchemaVersion must be a positive integer`);
  }
  const policyVersion = requiredText(value.policyVersion, `${label} policyVersion`);
  if (typeof value.policySha256 !== 'string' || !SHA256_PATTERN.test(value.policySha256)) {
    invalid(`${label} policySha256 must be a lowercase SHA-256 hex digest`);
  }
  const brandPointer = policyBrandPointer(value.brandPointer, `${label} brandPointer`);

  return {
    policyPath: value.policyPath,
    policySchemaVersion: value.policySchemaVersion,
    policyVersion,
    policySha256: value.policySha256,
    brandPointer,
  };
}

function buildPolicyReference({ value, brandIdByStableKey }) {
  exactObject(value, 'officialHostPolicyRef', [
    'brandPointer', 'brandStableKey', 'policyPath', 'policySchemaVersion', 'policySha256', 'policyVersion',
  ], [
    'brandPointer', 'brandStableKey', 'policyPath', 'policySchemaVersion', 'policySha256', 'policyVersion',
  ]);

  const stableBrandKey = stableKey(value.brandStableKey, 'officialHostPolicyRef brandStableKey');
  const brandId = brandIdByStableKey.get(stableBrandKey);
  if (!brandId) invalid(`officialHostPolicyRef references unknown stableBrandKey: ${stableBrandKey}`);
  return {
    brandId,
    ...policyReferenceDetails(value, 'officialHostPolicyRef'),
  };
}

function referenceKey(reference) {
  return [
    reference.brandId,
    reference.policyPath,
    String(reference.policySchemaVersion),
    reference.policyVersion,
    reference.policySha256,
    reference.brandPointer,
  ].join('\u0000');
}

function sortReferences(references) {
  return references.sort((left, right) => stableCompare(referenceKey(left), referenceKey(right)));
}

function buildRegistry({ brands, officialHostPolicyRefs, market }) {
  if (!Array.isArray(brands) || brands.length === 0) invalid('brands must be a non-empty array');
  if (!Array.isArray(officialHostPolicyRefs)) invalid('officialHostPolicyRefs must be an array');

  const brandRecords = [];
  const brandIdByStableKey = new Map();
  const stableKeys = new Set();
  const brandIds = new Set();
  for (const value of brands) {
    const brand = buildBrand({ value, market });
    if (stableKeys.has(brand.stableBrandKey)) {
      invalid(`brands has duplicate stableBrandKey: ${brand.stableBrandKey}`);
    }
    if (brandIds.has(brand.brandId)) invalid(`brands has duplicate brand ID: ${brand.brandId}`);
    stableKeys.add(brand.stableBrandKey);
    brandIds.add(brand.brandId);
    brandIdByStableKey.set(brand.stableBrandKey, brand.brandId);
    brandRecords.push(brand);
  }

  const aliasIndex = indexBrandAliases(brandRecords);
  const collisions = collisionSummary(aliasIndex);
  if (collisions.length > 0) {
    const first = collisions[0];
    invalid(`alias collision for ${first.alias}: ${first.brandIds.join(', ')}`);
  }

  const references = [];
  const referenceKeys = new Set();
  for (const value of officialHostPolicyRefs) {
    const reference = buildPolicyReference({ value, brandIdByStableKey });
    const key = referenceKey(reference);
    if (referenceKeys.has(key)) invalid(`officialHostPolicyRefs has duplicate reference: ${key}`);
    referenceKeys.add(key);
    references.push(reference);
  }

  return {
    schemaVersion: BRAND_REGISTRY_SCHEMA_VERSION,
    registryVersion: BRAND_REGISTRY_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    brandIdDomain: BRAND_ID_DOMAIN,
    aliasNormalizationVersion: BRAND_ALIAS_NORMALIZATION_VERSION,
    market,
    brands: brandRecords.sort((left, right) => stableCompare(left.brandId, right.brandId)),
    officialHostPolicyRefs: sortReferences(references),
  };
}

function validateRegistryBrand({ value, market, seenStableKeys, seenBrandIds }) {
  exactObject(value, 'registry brand', [
    'aliases', 'brandId', 'displayName', 'observedSpellings', 'parentGroup', 'researchAliases', 'stableBrandKey',
  ], [
    'aliases', 'brandId', 'displayName', 'observedSpellings', 'parentGroup', 'researchAliases', 'stableBrandKey',
  ]);

  const brand = normalizeBrandFields({
    value,
    label: 'registry brand',
    allowMissingParentGroup: false,
    requireSortedSetLikeInputs: true,
  });
  const { stableBrandKey } = brand;
  if (seenStableKeys.has(stableBrandKey)) invalid(`registry brands has duplicate stableBrandKey: ${stableBrandKey}`);
  seenStableKeys.add(stableBrandKey);
  const expectedBrandId = brandIdFor({ market, stableBrandKey });
  if (value.brandId !== expectedBrandId) invalid(`registry brand ID is inconsistent for ${stableBrandKey}`);
  if (seenBrandIds.has(value.brandId)) invalid(`registry brands has duplicate brand ID: ${value.brandId}`);
  seenBrandIds.add(value.brandId);
  return {
    brandId: value.brandId,
    ...brand,
  };
}

function validateRegistry(registry) {
  exactObject(registry, 'registry', [
    'aliasNormalizationVersion', 'brandIdDomain', 'brands', 'canonicalizationVersion', 'market',
    'officialHostPolicyRefs', 'registryVersion', 'schemaVersion',
  ], [
    'aliasNormalizationVersion', 'brandIdDomain', 'brands', 'canonicalizationVersion', 'market',
    'officialHostPolicyRefs', 'registryVersion', 'schemaVersion',
  ]);
  if (registry.schemaVersion !== BRAND_REGISTRY_SCHEMA_VERSION) invalid('registry schemaVersion is unsupported');
  if (registry.registryVersion !== BRAND_REGISTRY_VERSION) invalid('registry registryVersion is unsupported');
  if (registry.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('registry canonicalizationVersion is unsupported');
  }
  if (registry.brandIdDomain !== BRAND_ID_DOMAIN) invalid('registry brandIdDomain is unsupported');
  if (registry.aliasNormalizationVersion !== BRAND_ALIAS_NORMALIZATION_VERSION) {
    invalid('registry aliasNormalizationVersion is unsupported');
  }
  const market = marketCode(registry.market, 'registry market');
  if (!Array.isArray(registry.brands) || registry.brands.length === 0) invalid('registry brands must be a non-empty array');
  if (!Array.isArray(registry.officialHostPolicyRefs)) invalid('registry officialHostPolicyRefs must be an array');

  const seenStableKeys = new Set();
  const seenBrandIds = new Set();
  const brands = registry.brands.map((value) => validateRegistryBrand({
    value,
    market,
    seenStableKeys,
    seenBrandIds,
  }));
  for (let index = 1; index < brands.length; index += 1) {
    if (stableCompare(brands[index - 1].brandId, brands[index].brandId) >= 0) {
      invalid('registry brands must be sorted by brandId with no duplicates');
    }
  }

  const references = [];
  const referenceKeys = new Set();
  for (const value of registry.officialHostPolicyRefs) {
    exactObject(value, 'registry officialHostPolicyRef', [
      'brandId', 'brandPointer', 'policyPath', 'policySchemaVersion', 'policySha256', 'policyVersion',
    ], [
      'brandId', 'brandPointer', 'policyPath', 'policySchemaVersion', 'policySha256', 'policyVersion',
    ]);
    if (!seenBrandIds.has(value.brandId)) invalid(`registry officialHostPolicyRef references unknown brand ID: ${value.brandId}`);
    const reference = {
      brandId: value.brandId,
      ...policyReferenceDetails(value, 'registry officialHostPolicyRef'),
    };
    const key = referenceKey(reference);
    if (referenceKeys.has(key)) invalid(`registry officialHostPolicyRefs has duplicate reference: ${key}`);
    referenceKeys.add(key);
    references.push(reference);
  }
  for (let index = 1; index < references.length; index += 1) {
    if (stableCompare(referenceKey(references[index - 1]), referenceKey(references[index])) >= 0) {
      invalid('registry officialHostPolicyRefs must be sorted with no duplicates');
    }
  }

  const aliasIndex = indexBrandAliases(brands);
  return { market, aliasIndex, hasCollision: collisionSummary(aliasIndex).length > 0 };
}

/**
 * Builds one market-scoped, identity-only brand registry from strict JSON data.
 */
export function buildBrandRegistry(input) {
  canonicalInput(input, 'brand registry build input');
  exactObject(input, 'brand registry build input', ['brands', 'officialHostPolicyRefs', 'market'], [
    'brands', 'officialHostPolicyRefs', 'market',
  ]);
  const market = marketCode(input.market, 'market');
  const registry = buildRegistry({
    brands: input.brands,
    officialHostPolicyRefs: input.officialHostPolicyRefs,
    market,
  });
  return { registry, registrySha256: sha256(canonicalEvidenceJson(registry)) };
}

/**
 * Resolves only a declared alias in the registry's exact market.
 */
export function resolveBrandAlias(input) {
  canonicalInput(input, 'brand alias resolver input');
  exactObject(input, 'brand alias resolver input', ['alias', 'market', 'registry'], ['alias', 'market', 'registry']);
  const market = marketCode(input.market, 'resolver market');
  const alias = normalizeAlias(input.alias, 'resolver alias');
  const validated = validateRegistry(input.registry);
  if (market !== validated.market) return { status: 'unknown' };

  const brandIds = validated.aliasIndex.get(alias);
  if (!brandIds) return { status: 'unknown' };
  const sortedBrandIds = [...brandIds].sort(stableCompare);
  if (sortedBrandIds.length > 1) return { status: 'ambiguous', brandIds: sortedBrandIds };
  if (validated.hasCollision) return { status: 'unknown' };
  return { status: 'resolved', brandId: sortedBrandIds[0] };
}
