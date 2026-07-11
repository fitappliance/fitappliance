import { createHash } from 'node:crypto';
import { createCanonicalProduct } from './identity.mjs';

function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} must be a non-empty string`);
  return result;
}

function brandKey(value) {
  return text(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function modelKey(value) {
  return text(value, 'model').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function identityKey(product) {
  return `${text(product.cat, 'category')}\0${brandKey(product.brand)}\0${modelKey(product.model)}`;
}

function canonicalId(key) {
  return `fa_prod_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function buildCanonicalRegistry(catalog, { quarantineLegacyIds = [] } = {}) {
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('catalog products must be an array');
  const forced = new Set(quarantineLegacyIds.map((value) => text(value, 'quarantine legacy ID').toLowerCase()));
  const legacyIds = new Set();
  const groups = new Map();
  for (const product of catalog.products) {
    const legacyId = text(product?.id, 'legacy runtime ID').toLowerCase();
    if (legacyIds.has(legacyId)) throw new TypeError(`duplicate legacy runtime ID ${legacyId}`);
    legacyIds.add(legacyId);
    const key = identityKey(product);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ product, legacyId, key });
  }

  const products = [];
  const identifierMappings = [];
  const quarantine = [];
  for (const key of [...groups.keys()].sort()) {
    const rows = groups.get(key);
    const collision = rows.length > 1;
    for (const row of rows) {
      const reasons = [];
      if (collision) reasons.push('manufacturer_identity_collision');
      if (forced.has(row.legacyId)) reasons.push('phase1_dimension_quarantine');
      if (reasons.length) {
        quarantine.push({ legacyRuntimeId: row.legacyId, brand: row.product.brand, model: row.product.model, reasons });
        continue;
      }
      const product = createCanonicalProduct({
        id: canonicalId(key),
        category: row.product.cat,
        brand: row.product.brand,
        model: row.product.model,
        identifiers: [
          { scheme: 'legacy_runtime_id', value: row.legacyId, authority: 'fitappliance_legacy_catalog' },
          { scheme: 'manufacturer_model', value: row.product.model, authority: row.product.brand },
        ],
      });
      products.push(product);
      identifierMappings.push({ legacyRuntimeId: row.legacyId, canonicalProductId: product.id });
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    products: Object.freeze(products),
    identifierMappings: Object.freeze(identifierMappings),
    quarantine: Object.freeze(quarantine),
  });
}
