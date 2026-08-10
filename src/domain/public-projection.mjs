import { classifyGeometryPublication } from './geometry-publication.mjs';

const CATEGORY_MARKERS = Object.freeze({
  fridge: 'FR',
  washing_machine: 'WM',
  dishwasher: 'DW',
  dryer: 'DR',
  washtower_combo: 'WT',
});

const PRIVATE_RETAILER_FEED_KEYS = new Set([
  'affiliate_campaign',
  'affiliate_network',
  'affiliate_url',
  'camref',
  'commission_cookie_days',
  'commission_eligible',
  'commission_model',
  'commission_rate_percent',
  'commission_terms_observed_at',
  'feed_model',
  'feed_title',
  'pubref',
  'retailer_dimension_hint',
  'retailer_dimension_hint_catalog_delta_mm',
  'retailer_dimension_hint_review_required',
  'retailer_dimension_hint_source_text',
  'tgg_sku',
  'tracking_verified_at',
]);

function isPrivateRetailerFeedMarker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = String(value.source ?? '').trim().toLowerCase();
  return String(value.sourceType ?? '').trim().toLowerCase() === 'affiliate_feed'
    || String(value.adapterId ?? '').trim() === 'the-good-guys-partnerize-feed-v1'
    || String(value.affiliate_network ?? '').trim().toLowerCase() === 'partnerize'
    || ['affiliate_feed', 'affiliate-feed', 'partnerize-feed', 'retailer-observation:affiliate_feed']
      .includes(source);
}

function containsPrivateRetailerFeedMarker(value) {
  if (isPrivateRetailerFeedMarker(value)) return true;
  if (Array.isArray(value)) return value.some(containsPrivateRetailerFeedMarker);
  return Boolean(value && typeof value === 'object'
    && Object.values(value).some(containsPrivateRetailerFeedMarker));
}

function stripPrivateRetailerFeedKeys(value) {
  if (Array.isArray(value)) return value.map(stripPrivateRetailerFeedKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_RETAILER_FEED_KEYS.has(key))
    .map(([key, child]) => [key, stripPrivateRetailerFeedKeys(child)]));
}

export function sanitizePrivateRetailerFeedPublication(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value.products)) {
    return {
      ...stripPrivateRetailerFeedKeys(value),
      products: value.products.map(sanitizePrivateRetailerFeedPublication),
    };
  }

  const privateLifecycle = containsPrivateRetailerFeedMarker(value.retailLifecycle);
  const sourceRetailers = Array.isArray(value.retailers) ? value.retailers : [];
  const retailers = sourceRetailers
    .filter((row) => !containsPrivateRetailerFeedMarker(row))
    .map(stripPrivateRetailerFeedKeys);
  const sanitized = stripPrivateRetailerFeedKeys(value);
  sanitized.retailers = retailers;
  if (privateLifecycle) {
    delete sanitized.retailLifecycle;
    delete sanitized.lifecycleVisibility;
    sanitized.price = null;
    sanitized.unavailable = true;
  } else if (sourceRetailers.length > 0 && retailers.length === 0) {
    sanitized.unavailable = true;
  }
  return sanitized;
}

export function assertNoPrivateRetailerFeedPublication(value) {
  const visit = (current, path = '$') => {
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (isPrivateRetailerFeedMarker(current)) {
      throw new Error(`private retailer feed marker reached public publication at ${path}`);
    }
    for (const [key, child] of Object.entries(current)) {
      if (PRIVATE_RETAILER_FEED_KEYS.has(key)) {
        throw new Error(`private retailer feed field reached public publication at ${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
  return true;
}

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
  product = sanitizePrivateRetailerFeedPublication(product);
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
  const result = {
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
  };
  assertNoPrivateRetailerFeedPublication(result);
  return Object.freeze(result);
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

export function buildLifecycleNeutralSafetyProjection(releasedProjection) {
  if (!releasedProjection || !Array.isArray(releasedProjection.products)) {
    throw new TypeError('released public projection products required');
  }
  const seen = new Set();
  const products = releasedProjection.products.map((product) => {
    const canonicalProductId = String(product?.canonicalProductId ?? '').trim();
    if (!canonicalProductId) throw new TypeError(`released canonical identity missing for ${product?.id}`);
    const legacyRuntimeId = String(product?.id ?? '').trim().toLowerCase();
    if (!legacyRuntimeId || seen.has(legacyRuntimeId)) {
      throw new TypeError(`released legacy identity is missing or duplicated: ${legacyRuntimeId}`);
    }
    seen.add(legacyRuntimeId);
    return Object.freeze({
      ...normalizePublicProduct(product),
      canonicalProductId,
    });
  });
  return Object.freeze({
    schema_version: releasedProjection.schema_version,
    last_updated: releasedProjection.last_updated ?? null,
    products: Object.freeze(products),
  });
}
