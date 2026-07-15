import { createHash } from 'node:crypto';
import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';

const CATEGORIES = Object.freeze(['fridge', 'dishwasher', 'dryer', 'washing_machine']);
const AXES = Object.freeze(['width', 'height', 'depth']);

export const LIFECYCLE_STATES = Object.freeze([
  'CURRENT_RETAIL',
  'CATALOG_ARCHIVED',
  'REGISTRY_ONLY',
  'UNKNOWN_RETAIL',
]);

export const DIMENSION_EVIDENCE_STATES = Object.freeze([
  'CATALOG_RECEIPT',
  'MODEL_RECEIPT',
  'REGISTRY_CONSISTENT',
  'IDENTITY_ONLY',
  'INTERNAL_CONFLICT',
  'AXIS_SUSPECT',
  'INVALID_DIMENSIONS',
]);

export const LOOKUP_ACTIONS = Object.freeze([
  'AUTO_FILL',
  'CONFIRM_REQUIRED',
  'MEASURE_REQUIRED',
  'QUARANTINED',
]);

const ACTION_BY_EVIDENCE = Object.freeze({
  CATALOG_RECEIPT: 'AUTO_FILL',
  MODEL_RECEIPT: 'AUTO_FILL',
  REGISTRY_CONSISTENT: 'CONFIRM_REQUIRED',
  IDENTITY_ONLY: 'MEASURE_REQUIRED',
  INTERNAL_CONFLICT: 'QUARANTINED',
  AXIS_SUSPECT: 'QUARANTINED',
  INVALID_DIMENSIONS: 'QUARANTINED',
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function requireString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function normalizeDimensions(value, required) {
  if (value === null || value === undefined) {
    if (required) throw new TypeError('complete dimensions are required for this evidence state');
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('dimensionsMm must be an object or null');
  }
  const dimensions = Object.fromEntries(['width', 'height', 'depth'].map((axis) => {
    const number = Number(value[axis]);
    if (!Number.isInteger(number) || number <= 0) {
      throw new TypeError(`dimensionsMm.${axis} must be a positive integer`);
    }
    return [axis, number];
  }));
  return dimensions;
}

function hasAcceptedAdjustableHeightGeometry(value) {
  const closed = value?.geometry?.closedEnvelope;
  const height = closed?.heightMm;
  return Number.isInteger(closed?.widthMm)
    && closed.widthMm > 0
    && Number.isInteger(closed?.depthMm)
    && closed.depthMm > 0
    && Number.isInteger(height?.minimumMm)
    && height.minimumMm > 0
    && Number.isInteger(height?.maximumMm)
    && height.maximumMm > height.minimumMm;
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? '').trim().toLowerCase());
}

function dimensionsKey(value) {
  return value && AXES.every((axis) => Number.isInteger(value[axis]) && value[axis] > 0)
    ? AXES.map((axis) => value[axis]).join('x')
    : null;
}

function normalizeObservedDimensions(value) {
  if (!value || typeof value !== 'object') return null;
  const normalized = Object.fromEntries(AXES.map((axis) => {
    const number = Number(value[axis]);
    return [axis, Number.isInteger(number) && number > 0 ? number : null];
  }));
  return AXES.every((axis) => normalized[axis] !== null) ? normalized : null;
}

export function isRetailerProductPageUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '').toLowerCase();
  if (url.protocol !== 'https:' || !host || !pathname || pathname === '/') return false;
  if (host === 'prf.hn') return false;
  if (['q', 'query', 'searchterm', 'text', 'keyword'].some((key) => url.searchParams.has(key))) return false;
  if (/\/(?:search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(?:\/|$)/i.test(pathname)) {
    return false;
  }
  if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
  if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
  if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);
  return false;
}

export function isCurrentRetailProduct(product) {
  return product?.unavailable === false
    && Array.isArray(product?.retailers)
    && product.retailers.some((retailer) => isRetailerProductPageUrl(
      retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link,
    ));
}

export function catalogReceiptDimensions(product) {
  const closed = product?.geometry_v2?.closedEnvelope;
  const height = closed?.heightMm;
  const scalarHeight = Number.isInteger(height)
    ? height
    : (Number.isInteger(height?.minimumMm) && height.minimumMm === height.maximumMm ? height.minimumMm : null);
  const dimensions = {
    width: Number(closed?.widthMm),
    height: Number(scalarHeight),
    depth: Number(closed?.depthMm),
  };
  if (!dimensionsKey(dimensions)) return null;
  const fieldEvidence = product?.geometry_v2_provenance?.fieldEvidence ?? {};
  const fields = {
    width: fieldEvidence['closedEnvelope.widthMm'],
    height: fieldEvidence['closedEnvelope.heightMm'],
    depth: fieldEvidence['closedEnvelope.depthMm'],
  };
  const receiptBound = AXES.every((axis) => {
    const evidence = fields[axis];
    return validSha256(evidence?.contentSha256)
      && validSha256(evidence?.receiptBindingSha256)
      && validSha256(evidence?.fragmentSha256);
  });
  return receiptBound ? dimensions : null;
}

function exactKey(category, brand, model) {
  return `${category}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function groupByExactKey(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function detectAxisPermutation(left, right) {
  if (!dimensionsKey(left) || !dimensionsKey(right)) return false;
  const values = AXES.map((axis) => right[axis]);
  const permutations = [
    [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  return permutations.some((indexes) => AXES.every((axis, index) => left[axis] === values[indexes[index]]));
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) counts[row[field]] = (counts[row[field]] ?? 0) + 1;
  return counts;
}

function sourceReceipts(observations, catalogProducts, catalogSnapshotSha256, historicalEvidence = []) {
  const byKey = new Map();
  for (const row of observations) {
    const key = `${row.sourceId}\0${row.snapshotSha256}`;
    if (!byKey.has(key)) byKey.set(key, {
      sourceId: row.sourceId,
      snapshotSha256: row.snapshotSha256,
      sourceLines: [],
    });
    byKey.get(key).sourceLines.push(Number(row.sourceLine));
  }
  if (catalogProducts.length > 0) {
    byKey.set(`fitappliance:catalog\0${catalogSnapshotSha256}`, {
      sourceId: 'fitappliance:catalog',
      snapshotSha256: catalogSnapshotSha256,
      sourceLines: [],
    });
  }
  for (const record of historicalEvidence) {
    for (const receipt of record.modelReceipts) {
      byKey.set(`historical-recovery:${receipt.targetId}\0${receipt.contentSha256}`, {
        sourceId: `historical-recovery:${receipt.targetId}`,
        snapshotSha256: receipt.contentSha256,
        sourceLines: Object.values(receipt.fields)
          .map((field) => field.page)
          .filter((page) => Number.isInteger(page) && page > 0),
      });
    }
  }
  return [...byKey.values()]
    .map((source) => ({ ...source, sourceLines: [...new Set(source.sourceLines)].sort((a, b) => a - b) }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function referenceIdFor(key) {
  return `fa_ref_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function historicalReferenceIdFor(category, brand, model) {
  return referenceIdFor(exactKey(category, brand, model));
}

function normalizeModelReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new TypeError('model receipt must be an object');
  }
  const sourceUrl = requireString(receipt.sourceUrl, 'model receipt sourceUrl');
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { parsedUrl = null; }
  if (parsedUrl?.protocol !== 'https:') throw new TypeError('model receipt sourceUrl must use HTTPS');
  const contentSha256 = String(receipt.contentSha256 ?? '').toLowerCase();
  const receiptBindingSha256 = String(receipt.receiptBindingSha256 ?? '').toLowerCase();
  if (!validSha256(contentSha256) || !validSha256(receiptBindingSha256)) {
    throw new TypeError('model receipt hashes must be SHA-256 values');
  }
  const verifiedAt = requireString(receipt.verifiedAt, 'model receipt verifiedAt');
  if (Number.isNaN(Date.parse(verifiedAt))) throw new TypeError('model receipt verifiedAt must be an ISO timestamp');
  const explicitContentType = String(receipt.contentType ?? '').trim().toLowerCase();
  const contentType = explicitContentType || null;
  if (contentType !== null && !['application/pdf', 'text/html'].includes(contentType)) {
    throw new TypeError(`unsupported model receipt content type: ${contentType}`);
  }
  const objectPath = receipt.objectPath === undefined
    ? null
    : requireString(receipt.objectPath, 'model receipt objectPath');
  if (objectPath !== null) {
    const expectedPrefix = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}`;
    if (!objectPath.startsWith(expectedPrefix) || objectPath.includes('..')) {
      throw new TypeError('model receipt objectPath must be content-addressed');
    }
  }
  const fields = {};
  for (const [axis, locator] of Object.entries(receipt.fields ?? {})) {
    if (!AXES.includes(axis)) throw new TypeError(`unsupported model receipt axis: ${axis}`);
    const locatorKind = String(locator?.locatorKind ?? (
      validSha256(locator?.fragmentSha256) ? 'PDF_FRAGMENT' : ''
    ));
    if (locatorKind === 'PDF_FRAGMENT') {
      if (contentType === 'text/html') throw new TypeError('HTML model receipt cannot use PDF fragment locator');
      if (!validSha256(locator?.fragmentSha256)) throw new TypeError('PDF model receipt fragment hash required');
      const page = Number(locator.page);
      if (!Number.isInteger(page) || page < 1) {
        throw new TypeError('PDF model receipt page must be a positive integer');
      }
      fields[axis] = {
        locatorKind,
        page,
        fragmentSha256: String(locator.fragmentSha256).toLowerCase(),
      };
      continue;
    }
    if (locatorKind === 'HTML_ARTIFACT') {
      if (contentType !== 'text/html') throw new TypeError('HTML artifact locator requires text/html content type');
      if (objectPath === null) throw new TypeError('HTML model receipt objectPath required');
      if (String(locator?.artifactSha256 ?? '').toLowerCase() !== contentSha256) {
        throw new TypeError('HTML model receipt artifact hash must match source content');
      }
      fields[axis] = { locatorKind, artifactSha256: contentSha256 };
      continue;
    }
    throw new TypeError(`unsupported model receipt locator kind: ${locatorKind || 'missing'}`);
  }
  if (Object.keys(fields).length === 0) throw new TypeError('model receipt must bind at least one axis');
  const normalized = {
    targetId: requireString(receipt.targetId, 'model receipt targetId'),
    sourceUrl,
    contentSha256,
    receiptBindingSha256,
    verifiedAt: new Date(verifiedAt).toISOString(),
    fields,
  };
  if (contentType !== null) normalized.contentType = contentType;
  if (objectPath !== null) normalized.objectPath = objectPath;
  return normalized;
}

function normalizeHistoricalEvidenceProjection(projection) {
  if (projection === null || projection === undefined) {
    return { bundleId: null, bundleSha256: null, records: [] };
  }
  if (projection?.schemaVersion !== 1 || !Array.isArray(projection.records)) {
    throw new TypeError('historical evidence projection schema v1 records required');
  }
  if (!validSha256(projection.bundleSha256)) throw new TypeError('historical evidence bundle hash required');
  const seenReferences = new Set();
  const seenIdentities = new Set();
  const records = projection.records.map((record) => {
    const category = requireString(record.category, 'historical evidence category');
    const brand = requireString(record.brand, 'historical evidence brand');
    const model = requireString(record.model, 'historical evidence model');
    const lifecycleState = requireString(record.lifecycleState, 'historical evidence lifecycle');
    if (!['CURRENT_RETAIL', 'CATALOG_ARCHIVED', 'REGISTRY_ONLY'].includes(lifecycleState)) {
      throw new TypeError(`unsupported historical evidence lifecycle: ${lifecycleState}`);
    }
    const referenceId = requireString(record.referenceId, 'historical evidence referenceId');
    if (referenceId !== historicalReferenceIdFor(category, brand, model)) {
      throw new Error(`historical evidence reference identity mismatch: ${referenceId}`);
    }
    const key = exactKey(category, brand, model);
    if (seenReferences.has(referenceId) || seenIdentities.has(key)) {
      throw new Error(`duplicate historical evidence identity: ${referenceId}`);
    }
    seenReferences.add(referenceId);
    seenIdentities.add(key);
    const dimensionsMm = record.dimensionsMm === null
      ? null
      : normalizeDimensions(record.dimensionsMm, true);
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(record.acceptanceStatus)) {
      throw new TypeError(`unsupported historical evidence acceptance status: ${record.acceptanceStatus}`);
    }
    if (dimensionsMm !== null && record.acceptanceStatus !== 'accepted') {
      throw new TypeError('historical evidence scalar acceptance status mismatch');
    }
    if (record.acceptanceStatus === 'accepted'
      && dimensionsMm === null
      && !hasAcceptedAdjustableHeightGeometry(record.geometryProjection)) {
      throw new TypeError('accepted non-scalar historical evidence requires adjustable-height geometry');
    }
    const modelReceipts = (record.modelReceipts ?? []).map(normalizeModelReceipt);
    if (modelReceipts.length === 0) throw new TypeError('historical evidence model receipt required');
    return {
      ...record,
      category,
      brand,
      model,
      lifecycleState,
      referenceId,
      dimensionsMm,
      modelReceipts,
    };
  });
  return {
    bundleId: requireString(projection.bundleId, 'historical evidence bundleId'),
    bundleSha256: String(projection.bundleSha256).toLowerCase(),
    records,
  };
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('historical reference source must be an object');
  }
  const snapshotSha256 = String(source.snapshotSha256 ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256)) {
    throw new TypeError('historical reference source snapshotSha256 must be a SHA-256 hash');
  }
  const sourceLines = Array.isArray(source.sourceLines)
    ? [...new Set(source.sourceLines.map(Number))].sort((left, right) => left - right)
    : [];
  if (sourceLines.some((line) => !Number.isInteger(line) || line < 1)) {
    throw new TypeError('historical reference sourceLines must contain positive integers');
  }
  return {
    sourceId: requireString(source.sourceId, 'sourceId'),
    snapshotSha256,
    sourceLines,
  };
}

export function createHistoricalReferenceRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('historical reference record must be an object');
  }
  const category = requireString(input.category, 'category');
  if (!CATEGORIES.includes(category)) throw new TypeError(`unsupported historical reference category: ${category}`);
  const lifecycleState = requireString(input.lifecycleState, 'lifecycleState');
  if (!LIFECYCLE_STATES.includes(lifecycleState)) throw new TypeError(`unsupported lifecycle state: ${lifecycleState}`);
  const evidenceState = requireString(input.evidenceState, 'evidenceState');
  if (!DIMENSION_EVIDENCE_STATES.includes(evidenceState)) throw new TypeError(`unsupported evidence state: ${evidenceState}`);
  const lookupAction = requireString(input.lookupAction, 'lookupAction');
  const expectedAction = ACTION_BY_EVIDENCE[evidenceState];
  if (lookupAction !== expectedAction) {
    throw new TypeError(`${evidenceState} requires lookup action ${expectedAction}`);
  }
  const dimensionsRequired = ['CATALOG_RECEIPT', 'MODEL_RECEIPT', 'REGISTRY_CONSISTENT'].includes(evidenceState);
  const dimensionsMm = normalizeDimensions(input.dimensionsMm, dimensionsRequired);
  if (!dimensionsRequired && dimensionsMm !== null) {
    throw new TypeError(`${evidenceState} cannot expose accepted dimensions`);
  }
  const rawIdentityVariants = Array.isArray(input.rawIdentityVariants)
    ? input.rawIdentityVariants.map((variant) => ({
      brand: requireString(variant?.brand, 'raw identity brand'),
      model: requireString(variant?.model, 'raw identity model'),
    }))
    : [];
  if (rawIdentityVariants.length === 0) throw new TypeError('rawIdentityVariants must not be empty');
  const sources = Array.isArray(input.sources) ? input.sources.map(normalizeSource) : [];
  if (sources.length === 0) throw new TypeError('historical reference sources must not be empty');

  const record = {
    schemaVersion: 1,
    referenceId: requireString(input.referenceId, 'referenceId'),
    category,
    brand: requireString(input.brand, 'brand'),
    model: requireString(input.model, 'model'),
    brandKey: requireString(input.brandKey, 'brandKey'),
    modelKey: requireString(input.modelKey, 'modelKey'),
    rawIdentityVariants,
    lifecycleState,
    evidenceState,
    lookupAction,
    dimensionsMm,
    sources,
  };
  if (input.catalogProductIds) record.catalogProductIds = [...input.catalogProductIds].map(String).sort();
  if (input.registryObservationCount !== undefined) record.registryObservationCount = Number(input.registryObservationCount);
  if (input.registryMarketState) record.registryMarketState = String(input.registryMarketState);
  if (input.registryDimensionState) record.registryDimensionState = String(input.registryDimensionState);
  if (input.reasonCodes) record.reasonCodes = [...new Set(input.reasonCodes.map(String))].sort();
  if (input.modelReceipts?.length) record.modelReceipts = input.modelReceipts.map(normalizeModelReceipt);
  return freezeDeep(record);
}

export function buildHistoricalApplianceReference({
  observations,
  catalogProducts,
  historicalEvidenceProjection = null,
  catalogSnapshotSha256,
  generatedAt,
}) {
  if (!Array.isArray(observations) || !Array.isArray(catalogProducts)) {
    throw new TypeError('observations and catalogProducts must be arrays');
  }
  if (!validSha256(catalogSnapshotSha256)) throw new TypeError('catalogSnapshotSha256 must be a SHA-256 hash');
  if (Number.isNaN(Date.parse(generatedAt))) throw new TypeError('generatedAt must be an ISO timestamp');
  const historicalEvidence = normalizeHistoricalEvidenceProjection(historicalEvidenceProjection);

  const referenceObservations = observations.filter((row) => (
    row?.marketedInAustralia === true
    || (row?.marketedInAustralia === undefined && row?.activeInAustralia === true)
  ));
  const observationGroups = groupByExactKey(referenceObservations, (row) => {
    if (!CATEGORIES.includes(row?.category) || !row?.identity?.brandKey || !row?.identity?.modelKey) return null;
    return `${row.category}\0${row.identity.brandKey}\0${row.identity.modelKey}`;
  });
  const catalogGroups = groupByExactKey(catalogProducts, (product) => {
    if (!CATEGORIES.includes(product?.cat) || !product?.brand || !product?.model) return null;
    return exactKey(product.cat, product.brand, product.model);
  });
  const historicalEvidenceGroups = groupByExactKey(historicalEvidence.records, (record) => (
    exactKey(record.category, record.brand, record.model)
  ));
  const keys = [...new Set([
    ...observationGroups.keys(),
    ...catalogGroups.keys(),
    ...historicalEvidenceGroups.keys(),
  ])].sort();
  const records = [];

  for (const key of keys) {
    const sourceRows = [...(observationGroups.get(key) ?? [])].sort((left, right) => left.sourceLine - right.sourceLine);
    const catalogRows = [...(catalogGroups.get(key) ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const recoveryRows = [...(historicalEvidenceGroups.get(key) ?? [])];
    if (recoveryRows.length > 1) throw new Error(`multiple historical evidence rows for ${key}`);
    const recoveryRow = recoveryRows[0] ?? null;
    const firstObservation = sourceRows[0];
    const firstCatalog = catalogRows[0];
    const category = firstCatalog?.cat ?? recoveryRow?.category ?? firstObservation?.category;
    const brand = firstCatalog?.brand ?? recoveryRow?.brand
      ?? firstObservation?.identity?.brandCanonical ?? firstObservation?.identity?.brandRaw;
    const model = firstCatalog?.model ?? recoveryRow?.model ?? firstObservation?.identity?.modelRaw;
    const [, brandKey, modelKey] = key.split('\0');
    const catalogLifecycleState = catalogRows.some(isCurrentRetailProduct)
      ? 'CURRENT_RETAIL'
      : catalogRows.length > 0
        ? 'CATALOG_ARCHIVED'
        : null;
    if (catalogLifecycleState && recoveryRow && recoveryRow.lifecycleState !== catalogLifecycleState) {
      throw new Error(`historical evidence lifecycle drift for ${recoveryRow.referenceId}`);
    }
    const lifecycleState = catalogLifecycleState
      ?? recoveryRow?.lifecycleState
      ?? (sourceRows.length > 0 ? 'REGISTRY_ONLY' : 'UNKNOWN_RETAIL');
    const registryMarketState = sourceRows.length === 0
      ? 'NO_REGISTRY'
      : sourceRows.some((row) => row.activeInAustralia === true)
        ? sourceRows.some((row) => row.activeInAustralia !== true) ? 'MIXED_AU' : 'ACTIVE_AU'
        : 'INACTIVE_AU';

    const rawIdentityVariants = [...new Map([
      ...sourceRows.map((row) => [
        `${row.identity.brandRaw}\0${row.identity.modelRaw}`,
        { brand: row.identity.brandRaw, model: row.identity.modelRaw },
      ]),
      ...catalogRows.map((row) => [
        `${row.brand}\0${row.model}`,
        { brand: row.brand, model: row.model },
      ]),
      ...recoveryRows.map((row) => [
        `${row.brand}\0${row.model}`,
        { brand: row.brand, model: row.model },
      ]),
    ]).values()].sort((left, right) => (
      left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
      || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    ));

    const catalogReceiptDimensionRows = catalogRows.map(catalogReceiptDimensions).filter(Boolean);
    const modelReceiptDimensionRows = recoveryRows.map((row) => row.dimensionsMm).filter(Boolean);
    const receiptDimensions = [...catalogReceiptDimensionRows, ...modelReceiptDimensionRows];
    const receiptByKey = new Map(receiptDimensions.map((dimensions) => [dimensionsKey(dimensions), dimensions]));
    const completeRegistry = sourceRows.map((row) => normalizeObservedDimensions(row.dimensionsMm)).filter(Boolean);
    const registryByKey = new Map(completeRegistry.map((dimensions) => [dimensionsKey(dimensions), dimensions]));
    const hasInvalidRegistry = sourceRows.some((row) => (
      row.qualityFlags?.includes('IMPLAUSIBLE_DIMENSION')
      || (normalizeObservedDimensions(row.dimensionsMm) === null
        && !row.qualityFlags?.includes('MISSING_DIMENSIONS'))
    ));
    const reasons = [];
    let evidenceState;
    let lookupAction;
    let dimensionsMm = null;
    let registryDimensionState = sourceRows.length === 0 ? 'NO_REGISTRY' : 'NOT_COMPARABLE';
    if (recoveryRow && recoveryRow.dimensionsMm === null) reasons.push('MODEL_RECEIPT_NON_SCALAR');

    if (receiptByKey.size > 1) {
      evidenceState = 'INTERNAL_CONFLICT';
      lookupAction = 'QUARANTINED';
      reasons.push(modelReceiptDimensionRows.length > 0
        ? 'MULTIPLE_MODEL_RECEIPTS_CONFLICT'
        : 'MULTIPLE_CATALOG_RECEIPTS_CONFLICT');
    } else if (receiptByKey.size === 1) {
      evidenceState = modelReceiptDimensionRows.length > 0 ? 'MODEL_RECEIPT' : 'CATALOG_RECEIPT';
      lookupAction = 'AUTO_FILL';
      dimensionsMm = [...receiptByKey.values()][0];
      if (registryByKey.size > 1) {
        registryDimensionState = 'INTERNAL_CONFLICT';
        reasons.push('REGISTRY_INTERNAL_DIMENSION_CONFLICT');
      } else if (registryByKey.size === 1) {
        const registryDimensions = [...registryByKey.values()][0];
        if (dimensionsKey(registryDimensions) === dimensionsKey(dimensionsMm)) {
          registryDimensionState = 'AGREES';
        } else if (detectAxisPermutation(dimensionsMm, registryDimensions)) {
          registryDimensionState = 'AXIS_SUSPECT';
          reasons.push('REGISTRY_AXIS_PERMUTATION_CONFLICT');
        } else {
          registryDimensionState = 'CONFLICTS_RECEIPT';
          reasons.push('REGISTRY_DIMENSIONS_CONFLICT_WITH_RECEIPT');
        }
      }
    } else if (registryByKey.size > 1) {
      evidenceState = 'INTERNAL_CONFLICT';
      lookupAction = 'QUARANTINED';
      registryDimensionState = 'INTERNAL_CONFLICT';
      reasons.push('REGISTRY_INTERNAL_DIMENSION_CONFLICT');
    } else if (hasInvalidRegistry) {
      evidenceState = 'INVALID_DIMENSIONS';
      lookupAction = 'QUARANTINED';
      registryDimensionState = 'INVALID';
      reasons.push('REGISTRY_DIMENSIONS_INVALID');
    } else if (registryByKey.size === 1) {
      evidenceState = 'REGISTRY_CONSISTENT';
      lookupAction = 'CONFIRM_REQUIRED';
      dimensionsMm = [...registryByKey.values()][0];
      registryDimensionState = 'CONSISTENT';
    } else {
      evidenceState = 'IDENTITY_ONLY';
      lookupAction = 'MEASURE_REQUIRED';
      registryDimensionState = sourceRows.length > 0 ? 'MISSING_DIMENSIONS' : 'NO_REGISTRY';
      reasons.push(sourceRows.length > 0 ? 'REGISTRY_DIMENSIONS_MISSING' : 'CATALOG_IDENTITY_WITHOUT_RECEIPT');
    }

    records.push(createHistoricalReferenceRecord({
      referenceId: referenceIdFor(key),
      category,
      brand,
      model,
      brandKey,
      modelKey,
      rawIdentityVariants,
      lifecycleState,
      evidenceState,
      lookupAction,
      dimensionsMm,
      sources: sourceReceipts(sourceRows, catalogRows, catalogSnapshotSha256, recoveryRows),
      catalogProductIds: catalogRows.map((row) => row.id),
      registryObservationCount: sourceRows.length,
      registryMarketState,
      registryDimensionState,
      reasonCodes: reasons,
      modelReceipts: recoveryRows.flatMap((row) => row.modelReceipts),
    }));
  }

  return freezeDeep({
    schemaVersion: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    sourceSnapshotHashes: Object.fromEntries([
      ...new Map(referenceObservations.map((row) => [row.sourceId, row.snapshotSha256])),
      ['fitappliance:catalog', catalogSnapshotSha256],
      ...(historicalEvidence.bundleId
        ? [[`historical-recovery:${historicalEvidence.bundleId}`, historicalEvidence.bundleSha256]]
        : []),
    ].sort(([left], [right]) => left.localeCompare(right))),
    records,
    summary: {
      records: records.length,
      byLifecycle: countBy(records, 'lifecycleState'),
      byEvidence: countBy(records, 'evidenceState'),
      byLookupAction: countBy(records, 'lookupAction'),
    },
  });
}
