import { createHash } from 'node:crypto';

const AXES = Object.freeze(['width', 'height', 'depth']);
const PERMUTATIONS = Object.freeze([
  ['width', 'depth', 'height'],
  ['height', 'width', 'depth'],
  ['height', 'depth', 'width'],
  ['depth', 'width', 'height'],
  ['depth', 'height', 'width'],
]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}

function rowHash(row) {
  return createHash('sha256').update(JSON.stringify(stableObject(row))).digest('hex');
}

function first(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function mm(value) {
  if (value === null || value === undefined || /^\s*(?:-|n\/?a)?\s*$/i.test(String(value))) return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function registryBrandKey(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '');
}

export function registryModelKey(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[\s._-]+/g, '');
}

function marketedInAustralia(row) {
  const market = first(row, ['Sold_in', 'Sold In', 'Market']);
  return /(?:^|[,;\s])Australia(?:$|[,;\s])/i.test(market ?? '');
}

function activeInAustralia(row) {
  const submit = first(row, ['SubmitStatus', 'Submit Status']);
  const availability = first(row, ['Availability Status', 'Availability']);
  return marketedInAustralia(row)
    && (!submit || /^approved$/i.test(submit))
    && (!availability || /^available$/i.test(availability));
}

export function normalizeEnergyRatingRows(rows, { category, sourceId, snapshotSha256, canonicalizeBrand = (value) => value }) {
  if (!['fridge', 'dishwasher', 'dryer', 'washing_machine'].includes(category)) {
    throw new TypeError(`unsupported Energy Rating category: ${category}`);
  }
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256 ?? '')) throw new TypeError('snapshotSha256 is required');
  const observations = [];
  for (const [index, item] of rows.entries()) {
    const row = item?.record ?? item;
    const brandRaw = first(row, ['Brand', 'Brand Name']);
    const modelRaw = first(row, ['Model No', 'Model Name', 'Model']);
    if (!brandRaw || !modelRaw) continue;
    const brand = canonicalizeBrand(brandRaw);
    const dimensionsMm = {
      width: mm(first(row, ['Width', 'Width (mm)'])),
      height: mm(first(row, ['Height', 'Height (mm)'])),
      depth: mm(first(row, ['Depth', 'Depth (mm)'])),
    };
    const qualityFlags = [];
    if (Object.values(dimensionsMm).some((value) => value === null)) qualityFlags.push('MISSING_DIMENSIONS');
    if (Object.values(dimensionsMm).some((value) => value !== null && (value < 100 || value > 3000))) {
      qualityFlags.push('IMPLAUSIBLE_DIMENSION');
    }
    observations.push(freezeDeep({
      schemaVersion: 1,
      sourceId,
      snapshotSha256,
      sourceLine: item?.sourceLine ?? index + 2,
      rowFingerprint: rowHash(row),
      category,
      identity: {
        brandRaw,
        brandCanonical: brand,
        brandKey: registryBrandKey(brand),
        modelRaw,
        modelKey: registryModelKey(modelRaw),
        registrationNumber: first(row, ['Registration Number', 'Submit_ID', 'Record ID']),
        familyName: first(row, ['Family Name']),
      },
      market: {
        soldInRaw: first(row, ['Sold_in', 'Sold In', 'Market']),
        submitStatus: first(row, ['SubmitStatus', 'Submit Status']),
        availabilityStatus: first(row, ['Availability Status', 'Availability']),
      },
      marketedInAustralia: marketedInAustralia(row),
      activeInAustralia: activeInAustralia(row),
      dimensionsMm,
      rawDimensions: {
        width: first(row, ['Width', 'Width (mm)']),
        height: first(row, ['Height', 'Height (mm)']),
        depth: first(row, ['Depth', 'Depth (mm)']),
        unit: 'mm',
      },
      qualityFlags: qualityFlags.sort(),
    }));
  }
  return freezeDeep(observations.sort((left, right) => (
    `${left.category}\0${left.identity.brandKey}\0${left.identity.modelKey}\0${left.rowFingerprint}`
      .localeCompare(`${right.category}\0${right.identity.brandKey}\0${right.identity.modelKey}\0${right.rowFingerprint}`)
  )));
}

function catalogDimensions(product) {
  const geometry = product.geometry_v2?.closedEnvelope;
  const height = geometry?.heightMm && typeof geometry.heightMm === 'object'
    ? geometry.heightMm.maximumMm
    : geometry?.heightMm;
  const values = {
    width: geometry?.widthMm ?? product.w ?? product.dimensions?.width_mm ?? null,
    height: height ?? product.h ?? product.dimensions?.height_mm ?? null,
    depth: geometry?.depthMm ?? product.d ?? product.dimensions?.depth_mm ?? null,
  };
  return Object.fromEntries(Object.entries(values).map(([axis, value]) => [axis, Number.isFinite(value) ? value : null]));
}

function completeDimensions(value) {
  return AXES.every((axis) => Number.isFinite(value?.[axis]));
}

function dimensionsKey(value) {
  return completeDimensions(value) ? AXES.map((axis) => value[axis]).join('x') : null;
}

function within(left, right, toleranceMm) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= toleranceMm;
}

function detectPermutation(catalog, registry, toleranceMm) {
  if (!completeDimensions(catalog) || !completeDimensions(registry)) return null;
  for (const permutation of PERMUTATIONS) {
    const mapping = Object.fromEntries(AXES.map((axis, index) => [axis, permutation[index]]));
    if (AXES.every((axis) => within(catalog[axis], registry[mapping[axis]], toleranceMm))) return mapping;
  }
  return null;
}

export function reconcileCatalogWithEnergy({ products, observations, toleranceMm = 2 }) {
  const activeByKey = new Map();
  for (const observation of observations) {
    if (!observation.activeInAustralia) continue;
    const key = `${observation.category}\0${observation.identity.brandKey}\0${observation.identity.modelKey}`;
    if (!activeByKey.has(key)) activeByKey.set(key, []);
    activeByKey.get(key).push(observation);
  }
  const results = [];
  for (const product of products) {
    const canonicalProductId = product.canonicalProductId ?? null;
    const base = {
      schemaVersion: 1,
      canonicalProductId,
      legacyRuntimeId: String(product.id ?? '').toLowerCase(),
      category: product.cat,
      brand: product.brand,
      model: product.model,
      exactKey: `${product.cat}\0${registryBrandKey(product.brand)}\0${registryModelKey(product.model)}`,
      catalogDimensionsMm: catalogDimensions(product),
      canPromoteDimensions: false,
    };
    if (!canonicalProductId) {
      results.push(freezeDeep({ ...base, state: 'CATALOG_IDENTITY_AMBIGUOUS', reasonCodes: ['MISSING_CANONICAL_PRODUCT_ID'], registryObservations: [] }));
      continue;
    }
    const matches = activeByKey.get(base.exactKey) ?? [];
    if (matches.length === 0) {
      results.push(freezeDeep({ ...base, state: 'NO_EXACT_REGISTRY_MATCH', reasonCodes: ['NO_ACTIVE_AU_EXACT_KEY'], registryObservations: [] }));
      continue;
    }
    const complete = matches.filter((row) => completeDimensions(row.dimensionsMm));
    const distinct = new Map(complete.map((row) => [dimensionsKey(row.dimensionsMm), row.dimensionsMm]));
    if (distinct.size > 1) {
      results.push(freezeDeep({
        ...base,
        state: 'REGISTRY_INTERNAL_CONFLICT',
        reasonCodes: ['MULTIPLE_EXACT_ROWS_WITH_CONFLICTING_DIMENSIONS'],
        registryDimensionsMm: null,
        registryObservations: matches,
      }));
      continue;
    }
    if (complete.length === 0) {
      results.push(freezeDeep({
        ...base,
        state: 'EXACT_NO_DIMENSIONS',
        reasonCodes: ['EXACT_IDENTITY_WITHOUT_COMPLETE_WHD'],
        registryDimensionsMm: null,
        registryObservations: matches,
      }));
      continue;
    }
    const registryDimensionsMm = complete[0].dimensionsMm;
    if (!completeDimensions(base.catalogDimensionsMm)) {
      results.push(freezeDeep({
        ...base,
        state: 'CATALOG_DIMENSIONS_MISSING',
        reasonCodes: ['EXACT_REGISTRY_WHD_WITHOUT_COMPLETE_CATALOG_WHD'],
        registryDimensionsMm,
        registryObservations: matches,
      }));
      continue;
    }
    const deltasMm = Object.fromEntries(AXES.map((axis) => [axis, registryDimensionsMm[axis] - base.catalogDimensionsMm[axis]]));
    const agrees = AXES.every((axis) => within(registryDimensionsMm[axis], base.catalogDimensionsMm[axis], toleranceMm));
    if (agrees) {
      results.push(freezeDeep({
        ...base,
        state: 'EXACT_CONSISTENT',
        reasonCodes: ['EXACT_IDENTITY_AND_WHD_AGREE'],
        registryDimensionsMm,
        deltasMm,
        registryObservations: matches,
      }));
      continue;
    }
    const axisPermutation = detectPermutation(base.catalogDimensionsMm, registryDimensionsMm, toleranceMm);
    results.push(freezeDeep({
      ...base,
      state: axisPermutation ? 'AXIS_SUSPECT' : 'EXACT_DIMENSION_CONFLICT',
      reasonCodes: [axisPermutation ? 'NON_IDENTITY_AXIS_PERMUTATION_MATCHES_CATALOG' : 'ONE_OR_MORE_AXES_DISAGREE'],
      registryDimensionsMm,
      deltasMm,
      ...(axisPermutation ? { axisPermutation } : {}),
      registryObservations: matches,
    }));
  }
  return freezeDeep(results.sort((left, right) => left.canonicalProductId?.localeCompare(right.canonicalProductId) ?? 0));
}
