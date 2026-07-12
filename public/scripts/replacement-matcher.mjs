export const REPLACEMENT_REFERENCE_FILES = Object.freeze({
  fridge: '/data/replacement-reference/fridges.json',
  dishwasher: '/data/replacement-reference/dishwashers.json',
  dryer: '/data/replacement-reference/dryers.json',
  washing_machine: '/data/replacement-reference/washing-machines.json',
});

const referenceCache = new Map();
const ACTION_EVIDENCE = Object.freeze({
  AUTO_FILL: Object.freeze(['CATALOG_RECEIPT']),
  CONFIRM_REQUIRED: Object.freeze(['REGISTRY_CONSISTENT']),
  MEASURE_REQUIRED: Object.freeze(['IDENTITY_ONLY']),
  QUARANTINED: Object.freeze(['INTERNAL_CONFLICT', 'AXIS_SUSPECT', 'INVALID_DIMENSIONS']),
});
const LIFECYCLE_STATES = new Set(['CURRENT_RETAIL', 'CATALOG_ARCHIVED', 'REGISTRY_ONLY', 'UNKNOWN_RETAIL']);
const REGISTRY_MARKET_STATES = new Set(['ACTIVE_AU', 'INACTIVE_AU', 'MIXED_AU', 'NO_REGISTRY']);
const FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  'retailers', 'price', 'affiliate', 'affiliateUrl', 'fitDecision', 'fitScore',
  'requiredCavityMm', 'clearance', 'manufacturerClearance', 'route', 'url',
]);

function normalizeCategory(value) {
  const category = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['washtower', 'wash_tower', 'washtower_combo'].includes(category)) return 'washing_machine';
  return Object.hasOwn(REPLACEMENT_REFERENCE_FILES, category) ? category : '';
}

function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function referenceLabel(record = {}) {
  return [record.brand, record.model].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ');
}

function identityVariants(record = {}) {
  const variants = [{ brand: record.brand, model: record.model }, ...(record.aliases ?? [])];
  const seen = new Set();
  return variants
    .map((variant) => ({
      brand: String(variant?.brand ?? '').trim(),
      model: String(variant?.model ?? '').trim(),
    }))
    .filter((variant) => variant.brand && variant.model)
    .filter((variant) => {
      const key = `${variant.brand}\0${variant.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function completeDimensions(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ['width', 'height', 'depth'].every((axis) => Number.isInteger(value[axis]) && value[axis] > 0);
}

function validAliases(value) {
  return value === undefined || (Array.isArray(value) && value.every((alias) => (
    alias && typeof alias === 'object' && !Array.isArray(alias)
    && typeof alias.brand === 'string' && alias.brand.trim()
    && typeof alias.model === 'string' && alias.model.trim()
  )));
}

function validReferenceRecord(record) {
  const action = String(record?.action ?? '');
  const allowedEvidence = ACTION_EVIDENCE[action];
  const exposesDimensions = Object.hasOwn(record ?? {}, 'dimensionsMm');
  const actionUsesDimensions = ['AUTO_FILL', 'CONFIRM_REQUIRED'].includes(action);
  return /^fa_ref_[a-f0-9]{24}$/.test(String(record?.id ?? ''))
    && typeof record?.brand === 'string' && Boolean(record.brand.trim())
    && typeof record?.model === 'string' && Boolean(record.model.trim())
    && Array.isArray(allowedEvidence) && allowedEvidence.includes(String(record?.evidence ?? ''))
    && LIFECYCLE_STATES.has(String(record?.lifecycle ?? ''))
    && REGISTRY_MARKET_STATES.has(String(record?.registryMarket ?? ''))
    && (actionUsesDimensions ? completeDimensions(record.dimensionsMm) : !exposesDimensions)
    && validAliases(record?.aliases)
    && FORBIDDEN_PUBLIC_FIELDS.every((field) => !Object.hasOwn(record, field));
}

function validateReferenceDocument(document, category) {
  if (!document || document.schemaVersion !== 1 || document.category !== category || !Array.isArray(document.records)) {
    throw new TypeError(`invalid replacement reference document for ${category}`);
  }
  for (const record of document.records) {
    if (!validReferenceRecord(record)) {
      throw new TypeError(`invalid replacement reference record for ${category}`);
    }
  }
  return document;
}

export function clearReplacementReferenceCache() {
  referenceCache.clear();
}

export async function loadReplacementReference(category, { fetchImpl = globalThis.fetch } = {}) {
  const normalized = normalizeCategory(category);
  if (!normalized) throw new TypeError(`unsupported replacement reference category: ${category}`);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required to load replacement references');
  if (!referenceCache.has(normalized)) {
    const request = Promise.resolve(fetchImpl(REPLACEMENT_REFERENCE_FILES[normalized], {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })).then(async (response) => {
      if (!response?.ok) throw new Error(`replacement reference request failed: ${response?.status ?? 'network'}`);
      return validateReferenceDocument(await response.json(), normalized);
    }).catch((error) => {
      referenceCache.delete(normalized);
      throw error;
    });
    referenceCache.set(normalized, request);
  }
  return referenceCache.get(normalized);
}

function uniqueCandidates(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function exactMatches(query, records, mode) {
  const queryKey = normalizeToken(query);
  return uniqueCandidates(records.filter((record) => identityVariants(record).some((variant) => {
    const candidate = mode === 'brand_model'
      ? normalizeToken(`${variant.brand} ${variant.model}`)
      : normalizeToken(variant.model);
    return candidate === queryKey;
  })));
}

function suggestionScore(query, record) {
  const queryText = normalizeText(query);
  const queryToken = normalizeToken(query);
  if (queryToken.length < 2) return 0;
  let best = 0;
  for (const variant of identityVariants(record)) {
    const brand = normalizeToken(variant.brand);
    const model = normalizeToken(variant.model);
    const brandModel = `${brand}${model}`;
    if (model.startsWith(queryToken) || brandModel.startsWith(queryToken)) best = Math.max(best, 95);
    else if (model.includes(queryToken) || brandModel.includes(queryToken)) best = Math.max(best, 85);
    const terms = queryText.split(' ').map(normalizeToken).filter(Boolean);
    if (terms.length > 0 && terms.every((term) => brand.startsWith(term) || model.startsWith(term) || brandModel.includes(term))) {
      best = Math.max(best, 75 + Math.min(10, terms.length * 2));
    }
  }
  return best;
}

export function getReplacementReferenceSuggestions(query, records, { limit = 12 } = {}) {
  const boundedLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 12;
  return (Array.isArray(records) ? records : [])
    .map((record) => ({ record, label: referenceLabel(record), score: suggestionScore(query, record) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || left.label.localeCompare(right.label, 'en-AU', { sensitivity: 'base' })
      || String(left.record.id).localeCompare(String(right.record.id))
    ))
    .slice(0, boundedLimit);
}

function candidatesResult(status, candidates) {
  return {
    status,
    candidates: candidates.map((record) => ({
      record,
      label: referenceLabel(record),
      score: 100,
    })),
  };
}

export function resolveReplacementReference(query, records, { suggestionLimit = 12 } = {}) {
  const rows = Array.isArray(records) ? records : [];
  if (!normalizeToken(query)) return { status: 'EMPTY', candidates: [] };
  const brandModelMatches = exactMatches(query, rows, 'brand_model');
  if (brandModelMatches.length === 1) return { status: 'RESOLVED', record: brandModelMatches[0] };
  if (brandModelMatches.length > 1) return candidatesResult('AMBIGUOUS', brandModelMatches);
  const modelMatches = exactMatches(query, rows, 'model');
  if (modelMatches.length === 1) return { status: 'RESOLVED', record: modelMatches[0] };
  if (modelMatches.length > 1) return candidatesResult('AMBIGUOUS', modelMatches);
  const candidates = getReplacementReferenceSuggestions(query, rows, { limit: suggestionLimit });
  return candidates.length > 0 ? { status: 'SUGGESTIONS', candidates } : { status: 'NOT_FOUND', candidates: [] };
}

function dimensionsFor(record) {
  const source = record?.dimensionsMm ?? { width: record?.w, height: record?.h, depth: record?.d };
  const values = {
    w: Number(source?.width),
    h: Number(source?.height),
    d: Number(source?.depth),
  };
  return Object.values(values).every((value) => Number.isFinite(value) && value > 0) ? values : null;
}

export function buildReplacementDimensionState(record = {}) {
  const label = referenceLabel(record) || String(record.displayName ?? '').trim() || 'Old appliance';
  const action = String(record.action ?? (dimensionsFor(record) ? 'AUTO_FILL' : 'MEASURE_REQUIRED'));
  const dimensions = dimensionsFor(record);
  const canUseDimensions = ['AUTO_FILL', 'CONFIRM_REQUIRED'].includes(action) && dimensions !== null;
  if (!canUseDimensions) {
    return {
      action,
      canUseDimensions: false,
      requiresConfirmation: false,
      productDimensions: null,
      dimensions: { w: null, h: null, d: null },
      label,
      note: action === 'QUARANTINED'
        ? `Official records conflict for ${label}. Measure the old appliance width, height and depth before matching a replacement.`
        : `No complete accepted dimensions are available for ${label}. Measure the old appliance width, height and depth.`,
    };
  }
  const requiresConfirmation = action === 'CONFIRM_REQUIRED';
  return {
    action,
    canUseDimensions: true,
    requiresConfirmation,
    productDimensions: { ...dimensions },
    dimensions: { ...dimensions },
    label,
    note: requiresConfirmation
      ? `Official registry dimensions for ${label} are ${dimensions.w}×${dimensions.h}×${dimensions.d}mm. Confirm them against the appliance label, manual or your own measurement.`
      : `Using ${label} outside dimensions: ${dimensions.w}×${dimensions.h}×${dimensions.d}mm. Re-measure the old appliance before ordering.`,
  };
}
