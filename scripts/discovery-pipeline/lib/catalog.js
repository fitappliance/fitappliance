const fs = require('node:fs');
const path = require('node:path');

function normalizeModelKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractProducts(catalogDocument) {
  if (Array.isArray(catalogDocument)) return catalogDocument;
  if (Array.isArray(catalogDocument?.products)) return catalogDocument.products;
  return [];
}

function buildExistingModelSet(catalogDocument) {
  const products = extractProducts(catalogDocument);
  const keys = new Set();

  for (const product of products) {
    for (const value of [product?.model, product?.product_id, product?.id, product?.sku]) {
      const normalized = normalizeModelKey(value);
      if (normalized) keys.add(normalized);
    }
  }

  return keys;
}

function loadExistingModelSet(catalogPath) {
  return buildExistingModelSet(readJson(catalogPath));
}

function diffDiscoveries(discoveries, existingModelSet) {
  const seen = new Set();
  const delta = [];

  for (const discovery of discoveries) {
    const key = normalizeModelKey(discovery?.model);
    if (!key || existingModelSet.has(key) || seen.has(key)) continue;
    seen.add(key);
    delta.push({ ...discovery, normalized_model: key });
  }

  return delta.sort((a, b) => (
    a.category.localeCompare(b.category)
    || a.brand.localeCompare(b.brand)
    || a.model.localeCompare(b.model)
  ));
}

function groupDiscoveries(discoveries) {
  return discoveries.reduce((groups, item) => {
    const category = item.category || 'unknown';
    const brand = item.brand || 'Unknown';
    return {
      ...groups,
      [category]: {
        ...(groups[category] || {}),
        [brand]: [
          ...((groups[category] || {})[brand] || []),
          {
            model: item.model,
            url: item.url,
            retailer: item.retailer,
            retailer_key: item.retailer_key,
            source: item.source,
          },
        ],
      },
    };
  }, {});
}

function buildDiscoveryReport({
  discoveries,
  generatedAt = new Date().toISOString(),
  retailer,
  sourceUrls = [],
}) {
  const categories = discoveries.reduce((counts, item) => ({
    ...counts,
    [item.category]: (counts[item.category] || 0) + 1,
  }), {});

  return {
    schema_version: 1,
    generated_at: generatedAt,
    retailer,
    source_urls: sourceUrls,
    summary: {
      new_discovery_count: discoveries.length,
      categories,
    },
    new_discoveries: groupDiscoveries(discoveries),
  };
}

function writeDiscoveryReport(report, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
  buildDiscoveryReport,
  buildExistingModelSet,
  diffDiscoveries,
  extractProducts,
  loadExistingModelSet,
  normalizeModelKey,
  readJson,
  writeDiscoveryReport,
};
