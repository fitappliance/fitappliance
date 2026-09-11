import { evaluateFit } from './fit-decision.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function positiveOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeHeight(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const height = positiveOrNull(value);
    return height === null ? null : { minimumMm: height, maximumMm: height };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const maximumMm = positiveOrNull(value.maximumMm);
  if (maximumMm === null) return null;
  const minimumMm = positiveOrNull(value.minimumMm) ?? maximumMm;
  return { minimumMm, maximumMm };
}

function normalizeCavity(cavity) {
  const source = cavity && typeof cavity === 'object' ? cavity : {};
  return {
    widthMm: positiveOrNull(source.widthMm ?? source.w),
    heightMm: positiveOrNull(source.heightMm ?? source.h),
    depthMm: positiveOrNull(source.depthMm ?? source.d),
  };
}

function productGeometry(product) {
  const source = product?.geometry_v2;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const closed = source.closedEnvelope && typeof source.closedEnvelope === 'object'
      ? source.closedEnvelope
      : {};
    const installation = source.installation && typeof source.installation === 'object'
      ? source.installation
      : {};
    const service = source.service && typeof source.service === 'object' ? source.service : {};
    return {
      category: source.category ?? product?.cat ?? null,
      closedEnvelope: {
        widthMm: positiveOrNull(closed.widthMm),
        heightMm: normalizeHeight(closed.heightMm),
        depthMm: positiveOrNull(closed.depthMm),
      },
      installation: {
        leftMm: nonNegativeOrNull(installation.leftMm),
        rightMm: nonNegativeOrNull(installation.rightMm),
        topMm: nonNegativeOrNull(installation.topMm),
        rearMm: nonNegativeOrNull(installation.rearMm),
        frontMm: nonNegativeOrNull(installation.frontMm),
      },
      service: {
        rearServicesMm: nonNegativeOrNull(service.rearServicesMm),
        rearVentilationMm: nonNegativeOrNull(service.rearVentilationMm),
      },
    };
  }

  const heightMm = positiveOrNull(product?.h);
  return {
    category: product?.cat ?? null,
    closedEnvelope: {
      widthMm: positiveOrNull(product?.w),
      heightMm: heightMm === null ? null : { minimumMm: heightMm, maximumMm: heightMm },
      depthMm: positiveOrNull(product?.d),
    },
    installation: {
      leftMm: null,
      rightMm: null,
      topMm: null,
      rearMm: null,
      frontMm: null,
    },
    service: { rearServicesMm: null, rearVentilationMm: null },
  };
}

function evidenceLevel(product) {
  const provenance = product?.geometry_v2_provenance;
  if (provenance?.evidenceLevel === 'verified' && provenance.verifiedFitEligible === true) {
    return 'verified';
  }
  if (provenance?.evidenceLevel === 'dimensions') return 'dimensions';
  return 'none';
}

function sizeMatch(geometry, cavity) {
  const productDimensions = {
    width: geometry.closedEnvelope.widthMm,
    height: geometry.closedEnvelope.heightMm?.maximumMm ?? null,
    depth: geometry.closedEnvelope.depthMm,
  };
  const cavityDimensions = {
    width: cavity.widthMm,
    height: cavity.heightMm,
    depth: cavity.depthMm,
  };
  const entries = Object.entries(productDimensions).map(([axis, productMm]) => {
    const cavityMm = cavityDimensions[axis];
    if (productMm === null || cavityMm === null) {
      return { axis, status: 'UNKNOWN', productMm, cavityMm, gapMm: null };
    }
    const gapMm = cavityMm - productMm;
    return { axis, status: gapMm >= 0 ? 'PASS' : 'FAIL', productMm, cavityMm, gapMm };
  });
  return {
    statuses: Object.fromEntries(entries.map((entry) => [entry.axis, entry.status])),
    gapsMm: Object.fromEntries(entries.map((entry) => [entry.axis, entry.gapMm])),
    entries,
  };
}

function safeOutcome(decision, level, match) {
  if (match.entries.some((entry) => entry.status === 'FAIL')) return 'NO_FIT';
  if (decision.outcome === 'NO_FIT') return 'NO_FIT';
  if (decision.outcome === 'VERIFIED_FIT' && level === 'verified') return 'VERIFIED_FIT';
  return 'INSUFFICIENT_DATA';
}

export function evaluateFitV4({ product, cavity, advisoryChecks = [] } = {}) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new TypeError('product is required');
  }
  const geometry = productGeometry(product);
  const normalizedCavity = normalizeCavity(cavity);
  const level = evidenceLevel(product);
  const match = sizeMatch(geometry, normalizedCavity);
  const decision = evaluateFit({
    geometry,
    cavity: normalizedCavity,
    evidenceLevel: level,
    advisoryChecks,
  });
  return freezeDeep({
    schemaVersion: 4,
    engine: 'fit-v4-safe-boundary',
    outcome: safeOutcome(decision, level, match),
    evidenceLevel: level,
    sizeMatch: match,
    checks: decision.checks,
    required: decision.required,
    spare: decision.spare,
  });
}
