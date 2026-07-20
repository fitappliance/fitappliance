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

function scalar(value) {
  return value === undefined ? null : value;
}

function legacyProjectionReasons(product, geometry) {
  const reasons = [];
  const closed = geometry.closedEnvelope;
  const expectedHeight = closed.heightMm.maximumMm;
  const legacyDimensions = [product.w, product.h, product.d];
  const expectedDimensions = [closed.widthMm, expectedHeight, closed.depthMm];
  const nestedDimensions = product.dimensions;
  const nestedDrift = nestedDimensions && [
    nestedDimensions.width_mm,
    nestedDimensions.height_mm,
    nestedDimensions.depth_mm,
  ].some((value, index) => scalar(value) !== expectedDimensions[index]);
  if (legacyDimensions.some((value, index) => scalar(value) !== expectedDimensions[index]) || nestedDrift) {
    reasons.push('legacy_dimension_drift_from_receipt_bound_geometry');
  }

  const expectedDoorOpen = geometry.operation.doorOpenDepthMm;
  if (scalar(product.dimensions?.door_open_90_depth_mm) !== expectedDoorOpen
    || (product.door_open_90_depth_mm !== undefined
      && scalar(product.door_open_90_depth_mm) !== expectedDoorOpen)) {
    reasons.push('legacy_door_open_drift_from_receipt_bound_geometry');
  }

  const hingeSideSpace = geometry.operation.hingeSideSpaceMm;
  const hingeEvidence = product.geometry_v2_provenance
    ?.fieldEvidence?.['operation.hingeSideSpaceMm'];
  if ((product.door_swing_mm !== null && product.door_swing_mm !== undefined)
    && (!receiptBound(hingeEvidence) || product.door_swing_mm !== hingeSideSpace)) {
    reasons.push('legacy_door_swing_without_receipt_bound_evidence');
  }
  if (product.inferred_door_swing === true
    || (product.flags?.reversible_door !== null
      && product.flags?.reversible_door !== undefined)) {
    reasons.push('legacy_door_capability_without_receipt_bound_evidence');
  }

  const clearancePairs = [
    ['top_mm', 'topMm', 'clearance_top'],
    ['left_mm', 'leftMm', 'clearance_left'],
    ['right_mm', 'rightMm', 'clearance_right'],
    ['rear_mm', 'rearMm', 'clearance_rear'],
  ];
  if (clearancePairs.some(([legacyKey, geometryKey, directKey]) => (
    scalar(product.clearance_requirements?.[legacyKey]) !== geometry.installation[geometryKey]
    || (product[directKey] !== undefined
      && scalar(product[directKey]) !== geometry.installation[geometryKey])
  ))) {
    reasons.push('legacy_clearance_drift_from_receipt_bound_geometry');
  }

  const plumbing = product.flags?.requires_plumbing ?? product.requires_plumbing ?? null;
  const ventilation = product.flags?.ventilation_required ?? null;
  const plumbingEvidence = product.evidence?.v2_resolution?.provenance?.['flags.requiresPlumbing'];
  const plumbingReceiptBound = Array.isArray(plumbingEvidence) && plumbingEvidence.some(receiptBound);
  if ((plumbing !== null && !plumbingReceiptBound) || ventilation !== null) {
    reasons.push('legacy_fit_flag_without_receipt_bound_evidence');
  }
  return reasons;
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
    if (product?.geometry_v2_provenance?.verifiedFitEligible === true
      && classification !== 'verified') {
      reasons.push('verified_fit_eligibility_without_receipt_bound_fit');
    }
    if (product?.geometry_v2_provenance?.successfulFitOutcome === 'VERIFIED_FIT'
      && classification !== 'verified') {
      reasons.push('verified_fit_outcome_without_receipt_bound_fit');
    }
    if (classification !== 'none') {
      let geometry;
      try { geometry = createCategoryGeometry(product.cat, product.geometry_v2); } catch {}
      if (geometry) reasons.push(...legacyProjectionReasons(product, geometry));
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
