import { createGeometry } from '../domain/geometry.mjs';
import { createShadowProduct } from '../domain/identity.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

function result(status, product, geometry, warnings, errors) {
  return freezeDeep({ status, product, geometry, warnings: [...warnings], errors: [...errors] });
}

function dimensionState(product) {
  const values = [product.w, product.h, product.d];
  const supplied = values.filter((value) => value !== null && value !== undefined);
  if (supplied.some((value) => (
    typeof value !== 'number' || !Number.isFinite(value) || value <= 0
  ))) {
    return 'invalid';
  }
  return supplied.length === values.length ? 'complete' : 'incomplete';
}

function isObviousUprightInversion(product) {
  if (product.cat !== 'fridge') {
    return false;
  }
  const descriptors = [product.readableSpec, ...(Array.isArray(product.features) ? product.features : [])];
  const explicitlyUpright = descriptors.some((value) => /\bupright\b/i.test(String(value ?? '')));
  return explicitlyUpright && product.w >= 1200 && product.h <= 1000 && product.w > product.h;
}

function hasLegacyClearance(product) {
  const clearanceKeys = [
    'clearance',
    'clearance_mm',
    'clearance_left',
    'clearance_right',
    'clearance_top',
    'clearance_rear',
  ];
  return clearanceKeys.some((key) => product[key] !== null && product[key] !== undefined);
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function verifiedEvidenceDimensions(evidence, legacy, warnings) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  const identityMatches = evidence.product_id === legacy.id
    && normalizeIdentity(evidence.brand) === normalizeIdentity(legacy.brand)
    && normalizeIdentity(evidence.model) === normalizeIdentity(legacy.model);
  if (!identityMatches) {
    warnings.push('evidence_identity_mismatch');
    return null;
  }
  const dimensions = evidence.dimensions_mm;
  const values = [dimensions?.width, dimensions?.height, dimensions?.depth];
  const eligible = evidence.status === 'verified'
    && evidence.has_pdf_evidence === true
    && ['dimensions_verified', 'verified_fit'].includes(evidence.trust_level)
    && Array.isArray(evidence.verified_fields)
    && evidence.verified_fields.includes('dimensions')
    && typeof evidence.confidence_score === 'number'
    && evidence.confidence_score >= 0.8
    && values.every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return eligible ? { width: values[0], height: values[1], depth: values[2] } : null;
}

function appendEvidenceWarnings(warnings, evidence, productId, dimensionsApplied = false) {
  if (evidence === null || evidence === undefined) {
    return;
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    warnings.push('invalid_evidence_entry_ignored');
    return;
  }
  if (evidence.product_id && evidence.product_id !== productId && !warnings.includes('evidence_identity_mismatch')) {
    warnings.push('evidence_identity_mismatch');
  }
  if (dimensionsApplied) {
    warnings.push('verified_evidence_dimensions_applied');
    return;
  }
  const retailerOnly = [evidence.trust_level, evidence.source_type]
    .some((value) => /retailer/i.test(String(value ?? '')));
  warnings.push(retailerOnly
    ? 'retailer_evidence_not_promoted'
    : 'slim_evidence_not_field_level');
}

export function adaptLegacyAppliance(input) {
  const warnings = [];
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result('quarantined', null, null, warnings, ['invalid_adapter_input']);
  }
  const legacy = input.product;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
    return result('quarantined', null, null, warnings, ['invalid_legacy_product']);
  }

  let product;
  try {
    product = createShadowProduct({
      legacyRuntimeId: legacy.id,
      category: legacy.cat,
      brand: legacy.brand,
      model: legacy.model,
      identifiers: [
        {
          scheme: 'legacy_runtime_id',
          value: legacy.id,
          authority: 'FitAppliance',
        },
        {
          scheme: 'manufacturer_model',
          value: legacy.model,
          authority: legacy.brand,
        },
      ],
    });
  } catch (error) {
    errors.push(`invalid_identity:${error.message}`);
    return result('quarantined', null, null, warnings, errors);
  }

  const dimensions = dimensionState(legacy);
  const evidenceDimensions = verifiedEvidenceDimensions(input.evidence, legacy, warnings);
  if (dimensions === 'invalid' && !evidenceDimensions) {
    errors.push('invalid_legacy_dimensions');
    return result('quarantined', null, null, warnings, errors);
  }
  if (!evidenceDimensions && dimensions === 'complete' && isObviousUprightInversion(legacy)) {
    errors.push('suspected_upright_width_height_inversion');
    return result('quarantined', null, null, warnings, errors);
  }

  let geometry;
  if (evidenceDimensions) {
    geometry = createGeometry({
      closedEnvelope: {
        widthMm: evidenceDimensions.width,
        heightMm: evidenceDimensions.height,
        depthMm: evidenceDimensions.depth,
      },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
    });
  } else if (dimensions === 'complete') {
    geometry = createGeometry({
      closedEnvelope: { widthMm: legacy.w, heightMm: legacy.h, depthMm: legacy.d },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
    });
    warnings.push('legacy_dimensions_unverified');
  } else {
    geometry = createGeometry({
      closedEnvelope: { widthMm: null, heightMm: null, depthMm: null },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
    });
    warnings.push('legacy_dimensions_incomplete');
  }

  warnings.push('installation_requirements_unknown');
  if (legacy.door_swing_mm !== null && legacy.door_swing_mm !== undefined) {
    warnings.push('door_swing_not_reinterpreted');
  }
  if (hasLegacyClearance(legacy)) {
    warnings.push('legacy_clearance_not_promoted');
  }
  appendEvidenceWarnings(warnings, input.evidence, legacy.id, Boolean(evidenceDimensions));

  return result('adapted', product, geometry, warnings, errors);
}
