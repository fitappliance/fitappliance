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

function createProductRecord(input, { id, kind } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('product input must be an object');
  }

  const productId = requireNonEmptyString(id ?? input.id, 'product id');
  if (!/^fa_[A-Za-z0-9_-]+$/.test(productId)) {
    throw new TypeError('product id must be opaque and start with fa_');
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
    const authority = requireNonEmptyString(identifier.authority, 'identifier authority');
    const key = `${scheme}\u0000${value}\u0000${authority}`;
    if (seen.has(key)) {
      throw new RangeError(`duplicate identifier: ${scheme}/${value}/${authority}`);
    }
    seen.add(key);

    identifiers.push({
      scheme,
      value,
      authority,
    });
  }

  const record = {
    id: productId,
    category,
    brand: requireNonEmptyString(input.brand, 'brand'),
    model: requireNonEmptyString(input.model, 'model'),
    identifiers,
  };
  if (kind) {
    record.kind = kind;
  }
  return freezeDeep(record);
}

export function createCanonicalProduct(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('canonical product input must be an object');
  }
  const id = requireNonEmptyString(input.id, 'canonical product id');
  if (id.startsWith('fa_shadow_')) {
    throw new TypeError('shadow product IDs cannot cross the canonical product boundary');
  }
  return createProductRecord(input, { id });
}

export function createShadowProduct(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('shadow product input must be an object');
  }

  const legacyRuntimeId = normalizeIdentifier('legacy_runtime_id', input.legacyRuntimeId);
  const product = createProductRecord(input, {
    id: createShadowProductId(legacyRuntimeId),
    kind: 'shadow_candidate',
  });
  const legacyIdentifiers = findIdentifiers(product, 'legacy_runtime_id');
  if (legacyIdentifiers.length !== 1 || legacyIdentifiers[0].value !== legacyRuntimeId) {
    throw new RangeError('shadow product must contain one matching legacy runtime identifier');
  }
  return product;
}

export function findIdentifiers(product, scheme, authority) {
  const normalizedScheme = requireScheme(scheme);
  if (!product || !Array.isArray(product.identifiers)) {
    throw new TypeError('product identifiers must be an array');
  }
  const normalizedAuthority = authority === undefined
    ? undefined
    : requireNonEmptyString(authority, 'identifier authority');
  const matches = product.identifiers
    .filter((identifier) => (
      identifier.scheme === normalizedScheme
      && (normalizedAuthority === undefined || identifier.authority === normalizedAuthority)
    ))
    .map((identifier) => ({ ...identifier }));
  return freezeDeep(matches);
}

export function findIdentifier(product, scheme, authority) {
  const matches = findIdentifiers(product, scheme, authority);
  if (matches.length > 1) {
    throw new RangeError(`ambiguous identifier lookup: ${scheme}`);
  }
  return matches[0] ?? null;
}
