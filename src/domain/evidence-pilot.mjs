function text(value) {
  return String(value ?? '').trim();
}

function compareText(left, right) {
  return text(left).localeCompare(text(right), 'en-AU', { sensitivity: 'base' });
}

function candidateDocuments(sourceDocuments) {
  const byCanonical = new Map();
  for (const document of sourceDocuments ?? []) {
    if (document?.identityOutcome !== 'exact' || !text(document.sourceUrl)) continue;
    for (const link of document.productLinks ?? []) {
      const canonicalProductId = text(link?.canonicalProductId);
      if (!canonicalProductId) continue;
      const rows = byCanonical.get(canonicalProductId) ?? [];
      rows.push(document);
      byCanonical.set(canonicalProductId, rows);
    }
  }
  for (const rows of byCanonical.values()) {
    rows.sort((left, right) => {
      const hostDelta = Number(right.transportHostType === 'manufacturer') - Number(left.transportHostType === 'manufacturer');
      return hostDelta || compareText(left.id, right.id);
    });
  }
  return byCanonical;
}

function rankCandidates(left, right) {
  const hostDelta = Number(right.document.transportHostType === 'manufacturer') - Number(left.document.transportHostType === 'manufacturer');
  if (hostDelta) return hostDelta;
  const retailerDelta = right.retailerCount - left.retailerCount;
  if (retailerDelta) return retailerDelta;
  const priorityDelta = right.priorityScore - left.priorityScore;
  if (priorityDelta) return priorityDelta;
  const brandDelta = compareText(left.brand, right.brand);
  return brandDelta || compareText(left.model, right.model) || compareText(left.legacyRuntimeId, right.legacyRuntimeId);
}

export function selectEvidencePilot({ products, sourceDocuments, limit = 20, brandLimit = 3, categoryTargets }) {
  if (!Array.isArray(products) || !Array.isArray(sourceDocuments)) throw new TypeError('products and sourceDocuments required');
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('positive pilot limit required');
  if (!Number.isInteger(brandLimit) || brandLimit < 1) throw new TypeError('positive brand limit required');
  const targets = Object.entries(categoryTargets ?? {});
  if (targets.reduce((sum, [, count]) => sum + count, 0) !== limit) throw new TypeError('category targets must equal pilot limit');

  const documents = candidateDocuments(sourceDocuments);
  const candidates = products.flatMap((product) => {
    const canonicalProductId = text(product?.canonicalProductId);
    const document = documents.get(canonicalProductId)?.[0];
    const retailerCount = Array.isArray(product.retailers) ? product.retailers.length : 0;
    if (!canonicalProductId || !document || retailerCount === 0) return [];
    return [{
      legacyRuntimeId: text(product.id),
      canonicalProductId,
      category: text(product.cat),
      brand: text(product.brand),
      model: text(product.model),
      priorityScore: Number.isFinite(product.priorityScore) ? product.priorityScore : 0,
      retailerCount,
      sourceDocumentId: text(document.id),
      sourceUrl: text(document.sourceUrl),
      transportHostType: text(document.transportHostType),
      document,
    }];
  }).sort(rankCandidates);

  const selected = [];
  const brandCounts = new Map();
  for (const [category, target] of targets) {
    const categoryRows = candidates.filter((row) => row.category === category);
    for (const row of categoryRows) {
      if (selected.filter((item) => item.category === category).length >= target) break;
      const brandKey = row.brand.toLowerCase();
      if ((brandCounts.get(brandKey) ?? 0) >= brandLimit) continue;
      selected.push(row);
      brandCounts.set(brandKey, (brandCounts.get(brandKey) ?? 0) + 1);
    }
    if (selected.filter((item) => item.category === category).length !== target) {
      throw new TypeError(`unable to satisfy evidence pilot target for ${category}`);
    }
  }

  return selected.map(({ document, ...row }, index) => Object.freeze({ pilotRank: index + 1, ...row }));
}
