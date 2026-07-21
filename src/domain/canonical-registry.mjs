import { createHash } from 'node:crypto';
import { createCanonicalProduct } from './identity.mjs';
import { isReleasableQuarantineReason } from './evidence-source-verifier.mjs';
import { validateRetailerIdentityMigration } from './retailer-identity-migration.mjs';

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

const NON_RELEASABLE_REASON_PATTERNS = Object.freeze([
  /manufacturer_identity_collision/,
  /marketing_text_in_model_identity/,
  /not_a_complete_appliance/,
  /invalid_axis_assignment/,
  /rejected_alias/,
  /identity_quarantine/,
]);

const MARKETING_MODEL_SUFFIX_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{3,}\s+.+\s+[—–]\s*\d+(?:\.\d+)?\s*(?:KG|L)\s*$/i;

function hasMarketingTextInModelIdentity(value) {
  return MARKETING_MODEL_SUFFIX_PATTERN.test(text(value, 'model'));
}

function quarantineReason(value) {
  return text(value, 'quarantine reason').toLowerCase();
}

function nonReleasableReason(reason) {
  return NON_RELEASABLE_REASON_PATTERNS.some((pattern) => pattern.test(reason));
}

function normalizeQuarantineEntries(quarantineLegacyIds, quarantineEntries) {
  const byLegacyId = new Map();
  const add = (legacyRuntimeId, reason) => {
    const legacyId = text(legacyRuntimeId, 'quarantine legacy ID').toLowerCase();
    if (!byLegacyId.has(legacyId)) byLegacyId.set(legacyId, new Set());
    byLegacyId.get(legacyId).add(quarantineReason(reason));
  };
  for (const legacyRuntimeId of quarantineLegacyIds ?? []) add(legacyRuntimeId, 'legacy_quarantine');
  for (const entry of quarantineEntries ?? []) add(entry?.legacyRuntimeId, entry?.reason);
  return byLegacyId;
}

function normalizeReleaseGrants(releaseGrants) {
  const byLegacyId = new Map();
  const seen = new Set();
  for (const grant of releaseGrants ?? []) {
    const legacyId = text(grant?.legacyRuntimeId, 'release legacy ID').toLowerCase();
    const caseId = text(grant?.caseId, 'release case ID');
    const reasons = Array.isArray(grant?.reasons) ? grant.reasons : [grant?.reason];
    if (!reasons.length) throw new TypeError(`release reasons required for ${legacyId}`);
    for (const value of reasons) {
      const reason = quarantineReason(value);
      if (nonReleasableReason(reason)) throw new TypeError(`non-releasable quarantine reason ${reason}`);
      if (!isReleasableQuarantineReason(reason)) {
        throw new TypeError(`quarantine reason not approved for automated release: ${reason}`);
      }
      const key = `${legacyId}\0${caseId}\0${reason}`;
      if (seen.has(key)) throw new TypeError(`duplicate release grant ${legacyId}`);
      seen.add(key);
      if (!byLegacyId.has(legacyId)) byLegacyId.set(legacyId, new Set());
      byLegacyId.get(legacyId).add(reason);
    }
  }
  return byLegacyId;
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

function normalizeIdentityMigration(identityMigration, catalog, decisions) {
  if (identityMigration == null) return { corrections: new Map(), merges: [], quarantines: [] };
  validateRetailerIdentityMigration(identityMigration);
  const byLegacy = new Map(catalog.products.map((row) => [
    text(row?.id, 'legacy runtime ID').toLowerCase(),
    row,
  ]));
  const corrections = new Map();
  for (const correction of identityMigration.canonicalCorrections) {
    const row = byLegacy.get(correction.legacyRuntimeId);
    if (!row || row.cat !== correction.category
      || brandKey(row.brand) !== brandKey(correction.brand)
      || modelKey(row.model) !== modelKey(correction.toModel)) {
      throw new Error(`identity migration correction was not applied to catalog: ${correction.legacyRuntimeId}`);
    }
    const manualId = decisions.get(correction.legacyRuntimeId);
    if (manualId && manualId !== correction.canonicalProductId) {
      throw new Error(`identity migration conflicts with manual decision: ${correction.legacyRuntimeId}`);
    }
    corrections.set(correction.legacyRuntimeId, correction);
  }
  for (const merge of identityMigration.canonicalMerges) {
    if (byLegacy.has(merge.sourceLegacyRuntimeId)) {
      throw new Error(`identity migration merge source remains in catalog: ${merge.sourceLegacyRuntimeId}`);
    }
    const target = byLegacy.get(merge.targetLegacyRuntimeId);
    if (!target || target.cat !== merge.targetIdentity.category
      || brandKey(target.brand) !== brandKey(merge.targetIdentity.brand)
      || modelKey(target.model) !== modelKey(merge.targetIdentity.model)) {
      throw new Error(`identity migration merge target drift: ${merge.targetLegacyRuntimeId}`);
    }
  }
  for (const quarantine of identityMigration.canonicalQuarantines ?? []) {
    if (byLegacy.has(quarantine.sourceLegacyRuntimeId)) {
      throw new Error(`identity migration quarantine source remains in catalog: ${quarantine.sourceLegacyRuntimeId}`);
    }
    if (decisions.has(quarantine.sourceLegacyRuntimeId)) {
      throw new Error(`identity migration quarantine conflicts with manual decision: ${quarantine.sourceLegacyRuntimeId}`);
    }
    const target = byLegacy.get(quarantine.targetLegacyRuntimeId);
    if (!target || target.cat !== quarantine.targetIdentity.category
      || brandKey(target.brand) !== brandKey(quarantine.targetIdentity.brand)
      || modelKey(target.model) !== modelKey(quarantine.targetIdentity.model)) {
      throw new Error(`identity migration quarantine target drift: ${quarantine.targetLegacyRuntimeId}`);
    }
  }
  return {
    corrections,
    merges: identityMigration.canonicalMerges,
    quarantines: identityMigration.canonicalQuarantines ?? [],
  };
}

export function buildCanonicalRegistry(catalog, {
  quarantineLegacyIds = [],
  quarantineEntries = [],
  releaseGrants = [],
  identityDecisions = [],
  identityMigration = null,
} = {}) {
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('catalog products must be an array');
  const forced = normalizeQuarantineEntries(quarantineLegacyIds, quarantineEntries);
  const released = normalizeReleaseGrants(releaseGrants);
  const decisions = normalizeIdentityDecisions(identityDecisions);
  const machineMigration = normalizeIdentityMigration(identityMigration, catalog, decisions);
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
      if (hasMarketingTextInModelIdentity(row.product.model)) reasons.push('marketing_text_in_model_identity');
      const releasedReasons = released.get(row.legacyId) ?? new Set();
      for (const reason of forced.get(row.legacyId) ?? []) {
        if (!releasedReasons.has(reason)) reasons.push(reason);
      }
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
        id: machineMigration.corrections.get(row.legacyId)?.canonicalProductId
          ?? decisions.get(row.legacyId)
          ?? canonicalId(key),
        category: row.product.cat,
        brand: row.product.brand,
        model: row.product.model,
        identifiers,
      });
      products.push(product);
      identifierMappings.push({ legacyRuntimeId: row.legacyId, canonicalProductId: product.id });
    }
  }
  const mappingByLegacy = new Map(identifierMappings.map((row) => [row.legacyRuntimeId, row]));
  const productIndexById = new Map(products.map((row, index) => [row.id, index]));
  for (const merge of machineMigration.merges) {
    if (mappingByLegacy.has(merge.sourceLegacyRuntimeId)) {
      throw new Error(`identity migration source mapping already exists: ${merge.sourceLegacyRuntimeId}`);
    }
    const targetMapping = mappingByLegacy.get(merge.targetLegacyRuntimeId);
    if (!targetMapping || targetMapping.canonicalProductId !== merge.targetCanonicalProductId) {
      throw new Error(`identity migration target canonical ID drift: ${merge.targetLegacyRuntimeId}`);
    }
    const targetIndex = productIndexById.get(merge.targetCanonicalProductId);
    const target = products[targetIndex];
    if (!target || target.category !== merge.targetIdentity.category
      || brandKey(target.brand) !== brandKey(merge.targetIdentity.brand)
      || modelKey(target.model) !== modelKey(merge.targetIdentity.model)) {
      throw new Error(`identity migration target product drift: ${merge.targetCanonicalProductId}`);
    }
    products[targetIndex] = createCanonicalProduct({
      ...target,
      identifiers: [
        ...target.identifiers,
        {
          scheme: 'legacy_runtime_id',
          value: merge.sourceLegacyRuntimeId,
          authority: 'fitappliance_legacy_catalog',
        },
      ],
    });
    const aliasMapping = {
      legacyRuntimeId: merge.sourceLegacyRuntimeId,
      canonicalProductId: merge.targetCanonicalProductId,
    };
    identifierMappings.push(aliasMapping);
    mappingByLegacy.set(aliasMapping.legacyRuntimeId, aliasMapping);
  }
  if (machineMigration.merges.length > 0) {
    identifierMappings.sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
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
