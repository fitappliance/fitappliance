function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function isoDate(value, label) {
  const normalized = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new TypeError(`${label} must be an ISO date`);
  }
  return normalized;
}

function sortedObject(counts) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function buildActiveEvidenceBatch({
  selectedAt,
  selectedLegacyIds,
  products,
  sourceDocuments,
  excludedLegacyIds,
  categoryTargets,
  categoryBrandLimit,
  globalBrandLimit,
  maximumObservationAgeDays,
}) {
  const selectionDate = isoDate(selectedAt, 'selection date');
  if (!Array.isArray(selectedLegacyIds) || !Array.isArray(products) || !Array.isArray(sourceDocuments)) {
    throw new TypeError('selection, products and source documents required');
  }
  if (!(excludedLegacyIds instanceof Set)) throw new TypeError('excluded legacy IDs set required');
  positiveInteger(categoryBrandLimit, 'category brand limit');
  positiveInteger(globalBrandLimit, 'global brand limit');
  positiveInteger(maximumObservationAgeDays, 'maximum observation age');
  const selectedIds = selectedLegacyIds.map((value) => text(value, 'selected legacy ID'));
  if (new Set(selectedIds).size !== selectedIds.length) throw new TypeError('duplicate selected legacy ID');

  const expectedTotal = Object.values(categoryTargets ?? {}).reduce((sum, count) => sum + positiveInteger(count, 'category target'), 0);
  if (selectedIds.length !== expectedTotal) throw new TypeError('selection does not match category targets');
  const productByLegacy = new Map(products.map((product) => [String(product?.id ?? '').toLowerCase(), product]));
  const documentsByCanonical = new Map();
  for (const document of sourceDocuments) {
    for (const link of document?.productLinks ?? []) {
      const canonicalProductId = String(link?.canonicalProductId ?? '');
      if (!canonicalProductId) continue;
      const rows = documentsByCanonical.get(canonicalProductId) ?? [];
      rows.push(document);
      documentsByCanonical.set(canonicalProductId, rows);
    }
  }

  const categoryCounts = new Map();
  const brandCounts = new Map();
  const categoryBrandCounts = new Map();
  const batchProducts = selectedIds.map((legacyRuntimeId, index) => {
    if (excludedLegacyIds.has(legacyRuntimeId)) throw new TypeError(`excluded product selected: ${legacyRuntimeId}`);
    const product = productByLegacy.get(legacyRuntimeId.toLowerCase());
    if (!product) throw new TypeError(`selected product missing: ${legacyRuntimeId}`);
    const category = text(product.cat, 'category');
    const brand = text(product.brand, 'brand');
    const canonicalProductId = text(product.canonicalProductId, 'canonical product ID');
    const observations = (product.retailers ?? [])
      .filter((row) => row?.source === 'partnerize-feed' && row?.url && row?.verified_at)
      .sort((left, right) => String(right.verified_at).localeCompare(String(left.verified_at)));
    const activeObservation = observations[0];
    if (!activeObservation) throw new TypeError(`active affiliate-feed observation missing for ${legacyRuntimeId}`);
    const observedAt = isoDate(activeObservation.verified_at, 'observation date');
    const ageDays = (Date.parse(`${selectionDate}T00:00:00Z`) - Date.parse(`${observedAt}T00:00:00Z`)) / 86400000;
    if (ageDays < 0 || ageDays > maximumObservationAgeDays) {
      throw new TypeError(`active affiliate-feed observation is stale for ${legacyRuntimeId}`);
    }

    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
    const categoryBrandKey = `${category}\0${brand}`;
    categoryBrandCounts.set(categoryBrandKey, (categoryBrandCounts.get(categoryBrandKey) ?? 0) + 1);
    if (brandCounts.get(brand) > globalBrandLimit) throw new TypeError(`global brand concentration exceeded for ${brand}`);
    if (categoryBrandCounts.get(categoryBrandKey) > categoryBrandLimit) throw new TypeError(`category brand concentration exceeded for ${brand}`);

    const sourceCandidates = [...(documentsByCanonical.get(canonicalProductId) ?? [])]
      .sort((left, right) => {
        const manufacturerDelta = Number(right.transportHostType === 'manufacturer') - Number(left.transportHostType === 'manufacturer');
        const identityDelta = Number(right.identityOutcome === 'exact') - Number(left.identityOutcome === 'exact');
        return manufacturerDelta || identityDelta || String(left.id).localeCompare(String(right.id));
      })
      .map((document) => ({
        sourceDocumentId: document.id,
        sourceUrl: document.sourceUrl,
        transportHostType: document.transportHostType,
        identityOutcome: document.identityOutcome,
      }));
    const manufacturerCandidate = sourceCandidates.find((row) => row.transportHostType === 'manufacturer' && row.identityOutcome === 'exact');
    return {
      batchRank: index + 1,
      legacyRuntimeId,
      canonicalProductId,
      category,
      brand,
      model: text(product.model, 'model'),
      activeObservation: {
        retailer: text(activeObservation.n, 'retailer'),
        url: text(activeObservation.url, 'retailer URL'),
        source: 'partnerize-feed',
        observedAt,
      },
      sourceStatus: manufacturerCandidate ? 'manufacturer_candidate' : 'discovery_required',
      sourceCandidates,
    };
  });

  for (const [category, target] of Object.entries(categoryTargets)) {
    if ((categoryCounts.get(category) ?? 0) !== target) throw new TypeError(`unbalanced category selection for ${category}`);
  }
  if ([...categoryCounts.keys()].some((category) => !(category in categoryTargets))) {
    throw new TypeError('selection contains an untargeted category');
  }
  const categoryBrandMaximums = new Map();
  for (const [key, count] of categoryBrandCounts) {
    const category = key.split('\0')[0];
    categoryBrandMaximums.set(category, Math.max(categoryBrandMaximums.get(category) ?? 0, count));
  }
  const sourceStatuses = new Map();
  for (const row of batchProducts) sourceStatuses.set(row.sourceStatus, (sourceStatuses.get(row.sourceStatus) ?? 0) + 1);
  return freezeDeep({
    schemaVersion: 1,
    selectedAt: selectionDate,
    policy: { categoryTargets, categoryBrandLimit, globalBrandLimit, maximumObservationAgeDays },
    products: batchProducts,
    summary: {
      products: batchProducts.length,
      categories: sortedObject(categoryCounts),
      brands: sortedObject(brandCounts),
      categoryBrandMaximums: sortedObject(categoryBrandMaximums),
      sourceStatuses: sortedObject(sourceStatuses),
    },
  });
}
