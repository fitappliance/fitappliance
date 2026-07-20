import { classifyGeometryPublication } from './geometry-publication.mjs';

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

function receiptBound(row) {
  return Boolean(
    row
    && /^[a-f0-9]{64}$/i.test(String(row.contentSha256 ?? ''))
    && /^[a-f0-9]{64}$/i.test(String(row.receiptBindingSha256 ?? ''))
    && /^https:\/\//i.test(String(row.sourceUrl ?? ''))
  );
}

function deriveDoorSwing(product, publicationLevel) {
  if (publicationLevel !== 'none') {
    const hingeSideSpace = product?.geometry_v2?.operation?.hingeSideSpaceMm;
    const evidence = product?.geometry_v2_provenance
      ?.fieldEvidence?.['operation.hingeSideSpaceMm'];
    if (!receiptBound(evidence)) return null;
    if (hingeSideSpace === 0) return 0;
    const explicitHingeSideSpace = integerInRange(hingeSideSpace, 5, 1200);
    return explicitHingeSideSpace !== null
      && (explicitHingeSideSpace <= 100 || explicitHingeSideSpace >= 400)
      ? explicitHingeSideSpace
      : null;
  }
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
  const publicationLevel = classifyGeometryPublication(product);
  const sourceEvidence = product?.evidence && typeof product.evidence === 'object'
    ? product.evidence
    : null;
  let evidence = sourceEvidence ? { ...sourceEvidence } : null;
  if (evidence || publicationLevel !== 'none') {
    evidence ??= {};
    const legacyVerified = evidence.trust_level === 'verified_fit' || evidence.clearance_verified === true;
    if (publicationLevel === 'verified') {
      evidence.trust_level = 'verified_fit';
      evidence.clearance_verified = true;
      evidence.verified_fields = ['dimensions', 'installation'];
    } else if (publicationLevel === 'dimensions') {
      evidence.trust_level = 'dimensions_verified';
      evidence.clearance_verified = false;
      evidence.verified_fields = ['dimensions'];
    } else if (legacyVerified || ['dimensions_verified', 'verified_fit'].includes(evidence.trust_level)) {
      evidence.trust_level = 'evidence_pending';
      evidence.clearance_verified = false;
      evidence.verified_fields = [];
    } else if (evidence.has_pdf_evidence === true && !evidence.trust_level) {
      evidence.trust_level = 'evidence_pending';
      evidence.clearance_verified = false;
      evidence.verified_fields = [];
    }
    if (legacyVerified && publicationLevel !== 'verified') evidence.legacy_trust_downgraded = true;
  }
  const sourceProvenance = product?.geometry_v2_provenance;
  const geometryProvenance = sourceProvenance
    ? {
      ...sourceProvenance,
      evidenceLevel: publicationLevel,
      ...(sourceProvenance.evidenceLevel !== publicationLevel ? { publicationDowngraded: true } : {}),
    }
    : null;
  const publicSource = publicationLevel === 'none'
    ? product
    : Object.fromEntries(Object.entries(product ?? {}).filter(([key]) => key !== 'inferred_door_swing'));
  const publicFlags = publicationLevel === 'none'
    ? product?.flags
    : (product?.flags && typeof product.flags === 'object'
      ? { ...product.flags, reversible_door: null }
      : product?.flags);
  return Object.freeze({
    ...publicSource,
    ...(publicFlags ? { flags: publicFlags } : {}),
    ...(evidence ? { evidence } : {}),
    ...(geometryProvenance ? { geometry_v2_provenance: geometryProvenance } : {}),
    emoji: typeof product?.emoji === 'string' && product.emoji.trim()
      ? product.emoji.trim()
      : (CATEGORY_MARKERS[product?.cat] ?? 'AP'),
    kwh_year: integerInRange(product?.kwh_year, 50, 2000),
    stars: integerInRange(product?.stars, 1, 6),
    price: integerInRange(product?.price, 1, 100000),
    door_swing_mm: deriveDoorSwing(product, publicationLevel),
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
