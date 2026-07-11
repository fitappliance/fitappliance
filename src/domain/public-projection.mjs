export function buildPublicProjection(registry, legacyCatalog) {
  if (!registry || !Array.isArray(registry.identifierMappings)) throw new TypeError('canonical mappings required');
  if (!legacyCatalog || !Array.isArray(legacyCatalog.products)) throw new TypeError('legacy catalog required');
  const mapping = new Map();
  for (const row of registry.identifierMappings) {
    const key = String(row.legacyRuntimeId ?? '').toLowerCase();
    if (!key) throw new TypeError('mapping legacy ID required');
    if (mapping.has(key)) throw new TypeError(`duplicate mapping ${key}`);
    mapping.set(key, row.canonicalProductId);
  }
  const products = legacyCatalog.products.map((product) => {
    const canonicalProductId = mapping.get(String(product.id ?? '').toLowerCase());
    if (!canonicalProductId) throw new TypeError(`canonical mapping missing for ${product.id}`);
    return Object.freeze({ ...product, canonicalProductId });
  });
  return Object.freeze({ schema_version: 3, last_updated: legacyCatalog.last_updated ?? null, products: Object.freeze(products) });
}
