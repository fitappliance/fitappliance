import { createHash } from 'node:crypto';
import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function first(row, key) {
  const value = row[key];
  return value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim();
}

function stableRowHash(row) {
  const sorted = Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function variantCodes(value) {
  return [...new Set(String(value ?? '').split(/[,;\r\n]+/).map((item) => item.trim()).filter(Boolean))];
}

export function normalizeWelsRows(rows, { sourceId, snapshotSha256, canonicalizeBrand = (value) => value }) {
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256 ?? '')) throw new TypeError('snapshotSha256 is required');
  const observations = [];
  for (const [index, item] of rows.entries()) {
    const row = item?.record ?? item;
    if (!/dishwasher/i.test(first(row, 'Product') ?? '')) continue;
    const brandRaw = first(row, 'Brand');
    const modelName = first(row, 'Model name');
    const modelCode = first(row, 'Model code');
    if (!brandRaw || (!modelName && !modelCode)) continue;
    const brandCanonical = canonicalizeBrand(brandRaw);
    const identities = [];
    const add = (raw, relationship) => {
      if (!raw) return;
      const modelKey = registryModelKey(raw);
      if (!modelKey || identities.some((identity) => identity.modelKey === modelKey)) return;
      identities.push({ modelRaw: raw, modelKey, relationship });
    };
    add(modelCode, 'model_code');
    add(modelName, 'model_name');
    for (const variant of variantCodes(first(row, 'Variant model code'))) add(variant, 'variant_model_code');
    const statusRaw = first(row, 'Model status');
    const status = /^registered$/i.test(statusRaw ?? '') ? 'registered'
      : /^ceasing$/i.test(statusRaw ?? '') ? 'ceasing'
        : /^expired$/i.test(statusRaw ?? '') ? 'expired' : 'unknown';
    observations.push(freezeDeep({
      schemaVersion: 1,
      sourceId,
      snapshotSha256,
      sourceLine: item?.sourceLine ?? index + 2,
      rowFingerprint: stableRowHash(row),
      category: 'dishwasher',
      identity: {
        brandRaw,
        brandCanonical,
        brandKey: registryBrandKey(brandCanonical),
        modelName,
        modelCode,
        variantModelCodes: variantCodes(first(row, 'Variant model code')),
        identities,
        registrationNumber: first(row, 'Registration number'),
        licenceNumber: first(row, 'License number'),
      },
      registration: {
        status,
        statusRaw,
        expiryDateRaw: first(row, 'Expiry date'),
      },
      activeForSale: status === 'registered' || status === 'ceasing',
      allowedRoles: ['exact_model_identity', 'variant_identity', 'registration_status'],
      prohibitedRoles: ['geometry', 'clearance', 'verified_fit'],
    }));
  }
  return freezeDeep(observations.sort((left, right) => left.rowFingerprint.localeCompare(right.rowFingerprint)));
}

const STATUS_PRIORITY = Object.freeze({ registered: 3, ceasing: 2, expired: 1, unknown: 0 });

export function reconcileCatalogWithWels({ products, observations }) {
  const byKey = new Map();
  for (const observation of observations) {
    for (const identity of observation.identity.identities) {
      const key = `${observation.identity.brandKey}\0${identity.modelKey}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ observation, identity });
    }
  }
  return freezeDeep(products.filter((product) => product.cat === 'dishwasher').map((product) => {
    const key = `${registryBrandKey(product.brand)}\0${registryModelKey(product.model)}`;
    const matches = (byKey.get(key) ?? []).sort((left, right) => (
      STATUS_PRIORITY[right.observation.registration.status] - STATUS_PRIORITY[left.observation.registration.status]
      || left.observation.rowFingerprint.localeCompare(right.observation.rowFingerprint)
    ));
    const base = {
      schemaVersion: 1,
      canonicalProductId: product.canonicalProductId ?? null,
      legacyRuntimeId: String(product.id ?? '').toLowerCase(),
      category: 'dishwasher',
      brand: product.brand,
      model: product.model,
      canPromoteDimensions: false,
    };
    if (matches.length === 0) return { ...base, state: 'NO_EXACT_WELS_MATCH', matchRelationship: null, registrationNumber: null };
    const best = matches[0];
    const topStatus = best.observation.registration.status;
    const conflicting = matches.filter((match) => match.observation.registration.status === topStatus)
      .some((match) => match.observation.identity.registrationNumber !== best.observation.identity.registrationNumber);
    if (conflicting) return {
      ...base,
      state: 'WELS_IDENTITY_CONFLICT',
      matchRelationship: best.identity.relationship,
      registrationNumber: null,
      matchingRegistrations: [...new Set(matches.map((match) => match.observation.identity.registrationNumber))].sort(),
    };
    return {
      ...base,
      state: `WELS_EXACT_${topStatus.toUpperCase()}`,
      matchRelationship: best.identity.relationship,
      registrationNumber: best.observation.identity.registrationNumber,
      licenceNumber: best.observation.identity.licenceNumber,
      expiryDateRaw: best.observation.registration.expiryDateRaw,
      sourceRowFingerprint: best.observation.rowFingerprint,
    };
  }).sort((left, right) => left.canonicalProductId?.localeCompare(right.canonicalProductId) ?? 0));
}
