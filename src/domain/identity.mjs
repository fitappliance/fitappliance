import { createHash } from 'node:crypto';

const ALLOWED_CATEGORIES = new Set([
  'fridge',
  'dishwasher',
  'washing_machine',
  'dryer',
]);

const IDENTIFIER_SCHEMES = new Set([
  'legacy_runtime_id',
  'manufacturer_model',
  'gems_model',
]);

function requireString(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
}

function requireNonEmptyString(value, field) {
  const text = requireString(value, field).trim();
  if (!text) {
    throw new TypeError(`${field} must not be empty`);
  }
  return text;
}

function requireScheme(scheme) {
  const normalizedScheme = requireNonEmptyString(scheme, 'identifier scheme');
  if (!IDENTIFIER_SCHEMES.has(normalizedScheme)) {
    throw new RangeError(`unsupported identifier scheme: ${normalizedScheme}`);
  }
  return normalizedScheme;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

export function normalizeIdentifier(scheme, value) {
  const normalizedScheme = requireScheme(scheme);
  const normalizedValue = requireNonEmptyString(value, 'identifier value');

  if (normalizedScheme === 'legacy_runtime_id') {
    return normalizedValue.toLowerCase();
  }
  return normalizedValue.toUpperCase();
}

export function createShadowProductId(legacyRuntimeId) {
  const normalizedId = normalizeIdentifier('legacy_runtime_id', legacyRuntimeId);
  const digest = createHash('sha256').update(normalizedId).digest('hex');
  return `fa_shadow_${digest}`;
}

export function createCanonicalProduct(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('canonical product input must be an object');
  }

  const id = requireNonEmptyString(input.id, 'canonical product id');
  if (!/^fa_[A-Za-z0-9_-]+$/.test(id)) {
    throw new TypeError('canonical product id must be opaque and start with fa_');
  }

  const category = requireNonEmptyString(input.category, 'category');
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new RangeError(`unsupported category: ${category}`);
  }

  if (!Array.isArray(input.identifiers)) {
    throw new TypeError('identifiers must be an array');
  }

  const identifiers = [];
  const seen = new Set();
  for (const identifier of input.identifiers) {
    if (!identifier || typeof identifier !== 'object' || Array.isArray(identifier)) {
      throw new TypeError('each identifier must be an object');
    }

    const scheme = requireScheme(identifier.scheme);
    const value = normalizeIdentifier(scheme, identifier.value);
    const key = `${scheme}\u0000${value}`;
    if (seen.has(key)) {
      throw new RangeError(`duplicate identifier: ${scheme}/${value}`);
    }
    seen.add(key);

    identifiers.push({
      scheme,
      value,
      authority: requireNonEmptyString(identifier.authority, 'identifier authority'),
    });
  }

  return freezeDeep({
    id,
    category,
    brand: requireNonEmptyString(input.brand, 'brand'),
    model: requireNonEmptyString(input.model, 'model'),
    identifiers,
  });
}

export function findIdentifier(product, scheme) {
  const normalizedScheme = requireScheme(scheme);
  if (!product || !Array.isArray(product.identifiers)) {
    throw new TypeError('product identifiers must be an array');
  }
  return product.identifiers.find((identifier) => identifier.scheme === normalizedScheme) ?? null;
}
