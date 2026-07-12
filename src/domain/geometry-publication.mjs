import { createCategoryGeometry, requiredCategoryEvidenceFields } from './category-geometry.mjs';

const CLOSED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
]);
const PLACEMENT_FIELDS = Object.freeze([
  'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm',
]);

function get(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function receiptBound(row) {
  return Boolean(
    row
    && /^[a-f0-9]{64}$/i.test(String(row.contentSha256 ?? ''))
    && /^[a-f0-9]{64}$/i.test(String(row.receiptBindingSha256 ?? ''))
    && /^https:\/\//i.test(String(row.sourceUrl ?? ''))
  );
}

export function classifyGeometryPublication(product) {
  const category = product?.cat;
  const rawGeometry = product?.geometry_v2;
  const provenance = product?.geometry_v2_provenance;
  if (!rawGeometry || rawGeometry.category !== category || !provenance) return 'none';
  if (!['dimensions', 'verified'].includes(provenance.evidenceLevel)) return 'none';
  let geometry;
  try { geometry = createCategoryGeometry(category, rawGeometry); } catch { return 'none'; }
  const fieldEvidence = provenance.fieldEvidence;
  if (!CLOSED_FIELDS.every((field) => get(geometry, field) !== null && receiptBound(fieldEvidence?.[field]))) {
    return 'none';
  }
  if (provenance.evidenceLevel !== 'verified') return 'dimensions';
  const required = [
    ...PLACEMENT_FIELDS,
    ...requiredCategoryEvidenceFields(category, geometry),
  ];
  return required.every((field) => get(geometry, field) !== null && receiptBound(fieldEvidence?.[field]))
    ? 'verified'
    : 'dimensions';
}

export function auditPublicFitProjection(projection) {
  if (!projection || !Array.isArray(projection.products)) throw new TypeError('public projection products required');
  const violations = [];
  let verified = 0;
  let dimensions = 0;
  for (const product of projection.products) {
    const classification = classifyGeometryPublication(product);
    if (classification === 'verified') verified += 1;
    if (classification === 'dimensions') dimensions += 1;
    const reasons = [];
    if (product?.evidence?.clearance_verified === true && classification !== 'verified') {
      reasons.push('clearance_verified_without_receipt_bound_geometry');
    }
    if (product?.evidence?.trust_level === 'verified_fit' && classification !== 'verified') {
      reasons.push('verified_fit_without_receipt_bound_geometry');
    }
    if (product?.geometry_v2_provenance?.evidenceLevel === 'verified' && classification !== 'verified') {
      reasons.push('invalid_verified_geometry_provenance');
    }
    if (reasons.length) violations.push({ id: product.id, reasons: reasons.sort() });
  }
  violations.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    schemaVersion: 1,
    summary: {
      products: projection.products.length,
      receiptBoundVerified: verified,
      receiptBoundDimensions: dimensions,
      violations: violations.length,
    },
    violations,
  };
}
