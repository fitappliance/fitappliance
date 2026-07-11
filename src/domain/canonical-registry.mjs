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

export function extractGemsRegistrationFromLegacyId(value) {
  const match = String(value ?? '').toLowerCase().match(/^(?:fridge|dishwasher|washing_machine|dryer)-((?:arf|adw|acw|acd)\d+)$/);
  return match ? match[1].toUpperCase() : null;
}

function normalizeIdentityDecisions(decisions) {
  const result = new Map();
  for (const decision of decisions ?? []) {
    const legacyRuntimeId = text(decision?.legacyRuntimeId, 'identity decision legacy ID').toLowerCase();
    if (decision.status !== 'approved'
      || !/^fa_prod_[a-f0-9]{24}$/.test(String(decision.canonicalProductId ?? ''))
      || !String(decision.reviewer ?? '').trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(decision.reviewedAt ?? ''))
      || !String(decision.rationale ?? '').trim()) {
      throw new TypeError(`identity decision invalid for ${legacyRuntimeId}`);
    }
    if (result.has(legacyRuntimeId)) throw new TypeError(`duplicate identity decision ${legacyRuntimeId}`);
    result.set(legacyRuntimeId, decision.canonicalProductId);
  }
  return result;
}

export function buildCanonicalRegistry(catalog, {
  quarantineLegacyIds = [],
  releasedLegacyIds = [],
  identityDecisions = [],
} = {}) {
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('catalog products must be an array');
  const forced = new Set(quarantineLegacyIds.map((value) => text(value, 'quarantine legacy ID').toLowerCase()));
  const released = new Set(releasedLegacyIds.map((value) => text(value, 'released legacy ID').toLowerCase()));
  const decisions = normalizeIdentityDecisions(identityDecisions);
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
      if (forced.has(row.legacyId) && !released.has(row.legacyId)) reasons.push('phase1_dimension_quarantine');
      if (reasons.length) {
        quarantine.push({ legacyRuntimeId: row.legacyId, brand: row.product.brand, model: row.product.model, reasons });
        continue;
      }
      const gemsRegistration = extractGemsRegistrationFromLegacyId(row.legacyId);
      const identifiers = [
        { scheme: 'legacy_runtime_id', value: row.legacyId, authority: 'fitappliance_legacy_catalog' },
        { scheme: 'manufacturer_model', value: row.product.model, authority: row.product.brand },
      ];
      if (gemsRegistration) identifiers.push({ scheme: 'gems_registration', value: gemsRegistration, authority: 'australian_energy_rating' });
      const product = createCanonicalProduct({
        id: decisions.get(row.legacyId) ?? canonicalId(key),
        category: row.product.cat,
        brand: row.product.brand,
        model: row.product.model,
        identifiers,
      });
      products.push(product);
      identifierMappings.push({ legacyRuntimeId: row.legacyId, canonicalProductId: product.id });
    }
  }
  const canonicalIds = new Set();
  for (const product of products) {
    if (canonicalIds.has(product.id)) throw new TypeError(`duplicate canonical product ID ${product.id}`);
    canonicalIds.add(product.id);
  }
  return Object.freeze({
    schemaVersion: 1,
    products: Object.freeze(products),
    identifierMappings: Object.freeze(identifierMappings),
    quarantine: Object.freeze(quarantine),
  });
}
