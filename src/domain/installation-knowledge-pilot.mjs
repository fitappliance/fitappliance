const STRATA = Object.freeze({
  clean: new Set(['EXACT_CONSISTENT']),
  conflict: new Set(['AXIS_SUSPECT', 'EXACT_DIMENSION_CONFLICT', 'REGISTRY_INTERNAL_CONFLICT']),
  recovery: new Set(['EXACT_NO_DIMENSIONS', 'NO_EXACT_REGISTRY_MATCH', 'CATALOG_IDENTITY_AMBIGUOUS', 'CATALOG_DIMENSIONS_MISSING']),
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function currentListing(product, asOf, maxRetailerAgeDays) {
  return product.unavailable !== true
    && (product.retailers ?? []).some((row) => {
      if (!/^https:\/\//.test(row.url ?? '') || row.stock === 'No') return false;
      const observedRaw = String(row.verified_at ?? '');
      const observedAt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(observedRaw) ? `${observedRaw}T00:00:00.000Z` : observedRaw);
      if (Number.isNaN(observedAt.getTime())) return false;
      const ageDays = (asOf.getTime() - observedAt.getTime()) / 86_400_000;
      return ageDays >= 0 && ageDays <= maxRetailerAgeDays;
    });
}

function rank(left, right) {
  const priority = Number(right.product.priorityScore ?? 0) - Number(left.product.priorityScore ?? 0);
  if (priority !== 0) return priority;
  const retailers = (right.product.retailers?.length ?? 0) - (left.product.retailers?.length ?? 0);
  if (retailers !== 0) return retailers;
  return `${left.product.brand}\0${left.product.model}\0${left.product.canonicalProductId}`
    .localeCompare(`${right.product.brand}\0${right.product.model}\0${right.product.canonicalProductId}`);
}

function stratumFor(state) {
  return Object.entries(STRATA).find(([, states]) => states.has(state))?.[0] ?? 'recovery';
}

function inferFormFactor(product) {
  if (typeof product.geometry_v2?.formFactor === 'string' && product.geometry_v2.formFactor) return product.geometry_v2.formFactor;
  const text = [product.displayName, product.readableSpec, ...(product.features ?? [])].filter(Boolean).join(' ');
  if (product.cat === 'fridge') {
    if (/\bchest\b/i.test(text)) return 'chest';
    if (/\b(?:upright|french\s+door|side[- ]by[- ]side|bottom\s+mount|top\s+mount|integrated|refrigerator|fridge)\b/i.test(text)) return 'upright';
  }
  return null;
}

function targetsFor(total) {
  const clean = Math.round(total * 0.4);
  const conflict = Math.round(total * 0.3);
  return { clean, conflict, recovery: total - clean - conflict };
}

export function selectInstallationKnowledgePilot({
  products,
  reconciliations,
  snapshotHashes = [],
  asOf,
  categoryTargets = { fridge: 50, dishwasher: 50 },
  perBrandCap = 8,
  maxRetailerAgeDays = 90,
}) {
  const asOfDate = new Date(asOf);
  if (Number.isNaN(asOfDate.getTime())) throw new TypeError('pilot asOf timestamp is required');
  const reconciliationById = new Map(reconciliations.map((row) => [row.canonicalProductId, row]));
  const selected = [];
  const shortfalls = [];
  const categoryBrandCounts = new Map();
  const selectedIds = new Set();

  for (const category of Object.keys(categoryTargets).sort()) {
    const target = categoryTargets[category];
    const candidates = products
      .filter((product) => product.cat === category && currentListing(product, asOfDate, maxRetailerAgeDays) && product.canonicalProductId)
      .map((product) => ({ product, reconciliation: reconciliationById.get(product.canonicalProductId) ?? {
        canonicalProductId: product.canonicalProductId,
        category,
        state: 'NO_EXACT_REGISTRY_MATCH',
        reasonCodes: ['NO_RECONCILIATION_RECORD'],
      } }))
      .map((item) => ({ ...item, stratum: stratumFor(item.reconciliation.state) }))
      .sort(rank);
    const stratumTargets = targetsFor(target);
    const add = (item, requestedStratum) => {
      if (selectedIds.has(item.product.canonicalProductId)) return false;
      const brandKey = `${category}\0${item.product.brand}`;
      if ((categoryBrandCounts.get(brandKey) ?? 0) >= perBrandCap) return false;
      categoryBrandCounts.set(brandKey, (categoryBrandCounts.get(brandKey) ?? 0) + 1);
      selectedIds.add(item.product.canonicalProductId);
      selected.push({
        canonicalProductId: item.product.canonicalProductId,
        legacyRuntimeId: String(item.product.id).toLowerCase(),
        category,
        brand: item.product.brand,
        model: item.product.model,
        formFactor: inferFormFactor(item.product),
        reconciliationState: item.reconciliation.state,
        reasonCodes: [...(item.reconciliation.reasonCodes ?? [])].sort(),
        requestedStratum,
        selectedFromStratum: item.stratum,
      });
      return true;
    };
    for (const stratum of ['clean', 'conflict', 'recovery']) {
      let count = 0;
      for (const item of candidates.filter((candidate) => candidate.stratum === stratum)) {
        if (count >= stratumTargets[stratum]) break;
        if (add(item, stratum)) count += 1;
      }
      if (count < stratumTargets[stratum]) shortfalls.push({ category, stratum, requested: stratumTargets[stratum], selected: count });
    }
    let categoryCount = selected.filter((row) => row.category === category).length;
    for (const item of candidates) {
      if (categoryCount >= target) break;
      if (add(item, 'deficit_fill')) categoryCount += 1;
    }
    if (categoryCount < target) shortfalls.push({ category, stratum: 'category_total', requested: target, selected: categoryCount });
  }

  selected.sort((left, right) => `${left.category}\0${left.brand}\0${left.model}\0${left.canonicalProductId}`
    .localeCompare(`${right.category}\0${right.brand}\0${right.model}\0${right.canonicalProductId}`));
  const byCategory = {};
  const byCategoryBrand = {};
  const byState = {};
  for (const row of selected) {
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    const brandKey = `${row.category}:${row.brand}`;
    byCategoryBrand[brandKey] = (byCategoryBrand[brandKey] ?? 0) + 1;
    byState[row.reconciliationState] = (byState[row.reconciliationState] ?? 0) + 1;
  }
  return freezeDeep({
    schemaVersion: 1,
    frozen: true,
    sourceSnapshotHashes: [...new Set(snapshotHashes)].sort(),
    selectionPolicy: {
      currentListing: `unavailable!=true, stock!=No and retailer URL verified within ${maxRetailerAgeDays} days`,
      asOf: asOfDate.toISOString(),
      maxRetailerAgeDays,
      categoryTargets: Object.fromEntries(Object.entries(categoryTargets).sort()),
      stratumRatios: { clean: 0.4, conflict: 0.3, recovery: 0.3 },
      perBrandCap,
      ranking: ['priorityScore desc', 'retailer count desc', 'brand/model/canonicalProductId asc'],
    },
    selectionShortfalls: shortfalls,
    products: selected,
    summary: {
      total: selected.length,
      byCategory: Object.fromEntries(Object.entries(byCategory).sort()),
      byCategoryBrand: Object.fromEntries(Object.entries(byCategoryBrand).sort()),
      byState: Object.fromEntries(Object.entries(byState).sort()),
    },
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateFrozenInstallationKnowledgePilot({
  pilot,
  products,
  snapshotHashes,
  asOf,
  categoryTargets,
  perBrandCap,
  maxRetailerAgeDays,
}) {
  const fail = (reason) => { throw new Error(`frozen installation pilot ${reason}; rerun with --refresh-pilot`); };
  if (pilot?.frozen !== true) fail('is not frozen');
  const expectedHashes = [...new Set(snapshotHashes)].sort();
  if (!sameJson(pilot.sourceSnapshotHashes, expectedHashes)) fail('snapshot provenance does not match current registry inputs');
  const expectedAsOf = new Date(asOf).toISOString();
  if (pilot.selectionPolicy?.asOf !== expectedAsOf) fail('asOf policy does not match current registry inputs');
  if (!sameJson(pilot.selectionPolicy?.categoryTargets, Object.fromEntries(Object.entries(categoryTargets).sort()))) fail('category targets changed');
  if (pilot.selectionPolicy?.perBrandCap !== perBrandCap) fail('brand cap changed');
  if (pilot.selectionPolicy?.maxRetailerAgeDays !== maxRetailerAgeDays) fail('retailer freshness policy changed');
  const expectedTotal = Object.values(categoryTargets).reduce((sum, value) => sum + value, 0);
  const ids = pilot.products?.map((row) => row.canonicalProductId) ?? [];
  if (ids.length !== expectedTotal || new Set(ids).size !== expectedTotal) fail('does not contain the expected unique product count');
  const currentIds = new Set(products.map((product) => product.canonicalProductId));
  for (const id of ids) if (!currentIds.has(id)) fail(`product is missing from the current catalog: ${id}`);
  for (const [category, target] of Object.entries(categoryTargets)) {
    if (pilot.products.filter((row) => row.category === category).length !== target) fail(`category count changed for ${category}`);
  }
  return true;
}
