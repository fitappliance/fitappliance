const CATEGORY_MARKERS = Object.freeze({
  fridge: 'FR',
  washing_machine: 'WM',
  dishwasher: 'DW',
  dryer: 'DR',
  washtower_combo: 'WT',
});

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function deriveDoorSwing(product) {
  if (product?.door_swing_mm === 0) return 0;
  const explicit = integerInRange(product?.door_swing_mm, 5, 1200);
  if (explicit !== null && (explicit <= 100 || explicit >= 400)) return explicit;

  const openDepth = product?.dimensions?.door_open_90_depth_mm;
  const cabinetDepth = product?.dimensions?.depth_mm;
  if (!Number.isInteger(openDepth) || !Number.isInteger(cabinetDepth)) return null;
  const derived = integerInRange(openDepth - cabinetDepth, 5, 1200);
  return derived !== null && (derived <= 100 || derived >= 400) ? derived : null;
}

export function normalizePublicProduct(product) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers.map((row) => ({ ...row })) : [];
  return Object.freeze({
    ...product,
    emoji: typeof product?.emoji === 'string' && product.emoji.trim()
      ? product.emoji.trim()
      : (CATEGORY_MARKERS[product?.cat] ?? 'AP'),
    kwh_year: integerInRange(product?.kwh_year, 50, 2000),
    stars: integerInRange(product?.stars, 1, 6),
    price: integerInRange(product?.price, 1, 100000),
    door_swing_mm: deriveDoorSwing(product),
    features: Array.isArray(product?.features)
      ? product.features.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
      : [],
    retailers,
    sponsored: product?.sponsored === true,
    unavailable: product?.unavailable === false && retailers.length > 0 ? false : true,
  });
}

export function buildPublicProjection(registry, catalog) {
  if (!registry || !Array.isArray(registry.identifierMappings)) throw new TypeError('canonical mappings required');
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('canonical source catalog required');
  const mapping = new Map();
  for (const row of registry.identifierMappings) {
    const key = String(row.legacyRuntimeId ?? '').toLowerCase();
    if (!key) throw new TypeError('mapping legacy ID required');
    if (mapping.has(key)) throw new TypeError(`duplicate mapping ${key}`);
    mapping.set(key, row.canonicalProductId);
  }
  const products = catalog.products.map((product) => {
    const canonicalProductId = mapping.get(String(product.id ?? '').toLowerCase());
    if (!canonicalProductId) throw new TypeError(`canonical mapping missing for ${product.id}`);
    return Object.freeze({ ...normalizePublicProduct(product), canonicalProductId });
  });
  return Object.freeze({
    schema_version: 3,
    last_updated: catalog.last_updated ?? catalog.latest_verified_at ?? null,
    products: Object.freeze(products),
  });
}
