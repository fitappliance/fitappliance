import { projectEvidenceGeometry } from './evidence-geometry-projector.mjs';
import { isStandaloneOfficialHtmlMarketingAlias } from './evidence-claim-reconciliation.mjs';
import { isStrictOfficialModelVariantSource } from './official-model-variant-policy.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function modelKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function sourceUrlKey(value) {
  const url = new URL(text(value));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('receipt-bound acceptance source URL must be trusted HTTPS');
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

function artifactClass(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('html')) return 'html';
  if (normalized.includes('json') || normalized.includes('api') || normalized.includes('structured')) return 'json';
  if (normalized === 'mixed') return 'mixed';
  return normalized;
}

function publicationSemantics(acceptance) {
  const provenance = acceptance?.geometry_v2_provenance ?? {};
  return {
    identityOutcome: acceptance?.identityOutcome,
    sourceModel: modelKey(acceptance?.sourceModel),
    artifactType: artifactClass(acceptance?.artifactType),
    sourceType: acceptance?.sourceType,
    sourceUrl: sourceUrlKey(acceptance?.sourceUrl),
    geometry_v2: acceptance?.geometry_v2,
    provenance: {
      evidenceLevel: provenance.evidenceLevel,
      missingForVerifiedFit: [...(provenance.missingForVerifiedFit ?? [])].sort(),
      verifiedFitEligible: provenance.verifiedFitEligible,
      successfulFitOutcome: provenance.successfulFitOutcome,
    },
  };
}

function replaceEquivalentReceiptRefresh(legacyRuntimeId, previous, next) {
  if (!same(publicationSemantics(previous), publicationSemantics(next))) {
    throw new Error(`duplicate receipt-bound acceptance product semantic conflict: ${legacyRuntimeId}`);
  }
  const previousAt = Date.parse(previous?.verifiedAt);
  const nextAt = Date.parse(next?.verifiedAt);
  if (!Number.isFinite(previousAt) || !Number.isFinite(nextAt) || nextAt <= previousAt) {
    throw new Error(`duplicate receipt-bound acceptance product requires a strictly newer receipt timestamp: ${legacyRuntimeId}`);
  }
  if (previous.contentSha256 === next.contentSha256
    && previous.receiptBindingSha256 === next.receiptBindingSha256) {
    throw new Error(`duplicate receipt-bound acceptance product requires a new receipt binding: ${legacyRuntimeId}`);
  }
  return next;
}

function uniqueMap(rows, key, label) {
  const result = new Map();
  for (const row of rows ?? []) {
    const value = text(row?.[key]);
    if (!value) throw new TypeError(`${label} ${key} required`);
    if (result.has(value)) throw new TypeError(`duplicate ${label} ${value}`);
    result.set(value, row);
  }
  return result;
}

function assertIdentity(left, right, message) {
  if (text(left.brand) !== text(right.brand)
    || text(left.model) !== text(right.model)
    || text(left.category ?? left.cat) !== text(right.category ?? right.cat)) {
    throw new Error(`${message}: ${text(left.brand)} ${text(left.model)} ${text(left.category ?? left.cat)}`);
  }
}

function completeClosedEnvelope(geometry) {
  return geometry?.closedEnvelope?.widthMm !== null
    && geometry?.closedEnvelope?.heightMm !== null
    && geometry?.closedEnvelope?.depthMm !== null;
}

export function buildReceiptBoundAcceptanceProjection(input, options = {}) {
  const batch = input?.batch;
  const results = input?.results;
  const products = input?.products;
  if (!batch || !Array.isArray(batch.entries)) throw new TypeError('acceptance batch entries required');
  if (!results || !Array.isArray(results.outcomes)) throw new TypeError('acceptance outcomes required');
  if (!Array.isArray(products)) throw new TypeError('catalog products required');
  if (text(batch.batchId) !== text(results.batchId)) throw new Error('acceptance batch identity mismatch');

  const outcomeById = uniqueMap(results.outcomes, 'id', 'acceptance outcome');
  const catalogById = uniqueMap(products, 'id', 'catalog product');
  const projectionByLegacyId = new Map();
  const seenBatchIds = new Set();
  for (const entry of batch.entries) {
    const id = text(entry.id);
    const legacyRuntimeId = text(entry.legacyRuntimeId).toLowerCase();
    if (!id || !legacyRuntimeId) throw new TypeError('acceptance entry identity required');
    if (seenBatchIds.has(id)) throw new TypeError(`duplicate acceptance entry ${id}`);
    seenBatchIds.add(id);
    const outcome = outcomeById.get(id);
    if (!outcome) throw new Error(`acceptance outcome missing: ${id}`);
    assertIdentity(entry, outcome, `acceptance identity mismatch for ${id}`);
    if (outcome.outcome !== 'accepted') continue;
    const identityOutcome = text(outcome.identity);
    if (!['exact', 'official_marketing_alias'].includes(identityOutcome)) {
      throw new Error(`exact identity required unless strict official marketing alias: ${id}`);
    }
    const product = catalogById.get(legacyRuntimeId);
    if (!product) throw new Error(`acceptance catalog product missing: ${legacyRuntimeId}`);
    assertIdentity(entry, product, `catalog identity mismatch for ${legacyRuntimeId}`);
    if (projectionByLegacyId.has(legacyRuntimeId)) {
      throw new TypeError(`duplicate acceptance legacy product ${legacyRuntimeId}`);
    }
    if (!outcome.source) throw new TypeError(`accepted evidence source missing: ${id}`);
    if (outcome.source.identity?.outcome !== identityOutcome) {
      throw new Error(`accepted evidence identity outcome drift: ${id}`);
    }
    if (identityOutcome === 'official_marketing_alias') {
      const htmlAlias = text(outcome.source.identity?.sourceModel)
        && isStandaloneOfficialHtmlMarketingAlias(outcome.source);
      const boundVariant = isStrictOfficialModelVariantSource(outcome.source, {
        brand: entry.brand, model: entry.model, category: entry.category,
      });
      if (!htmlAlias && !boundVariant) {
        throw new Error(`HTML marketing alias requires complete binding signals, or model variant requires complete PDF/API binding signals: ${id}`);
      }
    }
    const projected = projectEvidenceGeometry({
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      formFactor: entry.formFactor,
      sources: [outcome.source],
    }, options.verifyReceipt ? { verifyReceipt: options.verifyReceipt } : {});
    if (!same(projected, outcome.geometryProjection)) throw new Error(`acceptance projection drift: ${id}`);
    if (!['dimensions', 'verified'].includes(projected.evidenceLevel) || !completeClosedEnvelope(projected.geometry)) {
      throw new Error(`accepted evidence lacks complete dimensions: ${id}`);
    }
    if (identityOutcome === 'official_marketing_alias' && projected.evidenceLevel !== 'dimensions') {
      throw new Error(`official marketing alias cannot produce verified fit: ${id}`);
    }
    projectionByLegacyId.set(legacyRuntimeId, Object.freeze({
      acceptanceId: id,
      identityOutcome,
      sourceModel: outcome.source.identity?.sourceModel ?? null,
      artifactType: outcome.artifactType,
      sourceType: outcome.source.sourceType,
      sourceUrl: outcome.source.sourceUrl,
      contentSha256: outcome.source.contentSha256,
      receiptBindingSha256: outcome.source.verificationReceipt.bindingSha256,
      verifiedAt: outcome.source.verificationReceipt.verifiedAt,
      geometry_v2: structuredClone(projected.geometry),
      geometry_v2_provenance: {
        schemaVersion: 1,
        evidenceLevel: projected.evidenceLevel,
        fieldEvidence: structuredClone(projected.fieldEvidence),
        activeSourceHashes: [...projected.activeSourceHashes],
        missingForVerifiedFit: [...projected.missingForVerifiedFit],
        verifiedFitEligible: projected.verifiedFitEligible,
        successfulFitOutcome: projected.successfulFitOutcome,
      },
    }));
  }
  return projectionByLegacyId;
}

export function mergeReceiptBoundAcceptanceProjections(...projections) {
  const merged = new Map();
  for (const projection of projections) {
    if (!(projection instanceof Map)) throw new TypeError('receipt-bound acceptance projection map required');
    for (const [legacyRuntimeId, acceptance] of projection) {
      if (merged.has(legacyRuntimeId)) {
        merged.set(legacyRuntimeId, replaceEquivalentReceiptRefresh(
          legacyRuntimeId,
          merged.get(legacyRuntimeId),
          acceptance,
        ));
        continue;
      }
      merged.set(legacyRuntimeId, acceptance);
    }
  }
  return merged;
}

export function applyReceiptBoundAcceptance(product, acceptance) {
  if (!product || !acceptance) throw new TypeError('product and receipt-bound acceptance required');
  if (product.geometry_v2 && !same(product.geometry_v2, acceptance.geometry_v2)) {
    throw new Error(`conflicting existing geometry for ${product.id}`);
  }
  if (product.geometry_v2_provenance
    && !same(product.geometry_v2_provenance, acceptance.geometry_v2_provenance)) {
    throw new Error(`conflicting existing geometry provenance for ${product.id}`);
  }
  const verified = acceptance.geometry_v2_provenance.evidenceLevel === 'verified';
  const closed = acceptance.geometry_v2.closedEnvelope;
  const heightMm = closed.heightMm.maximumMm;
  const installation = acceptance.geometry_v2.installation;
  const doorOpenDepthMm = acceptance.geometry_v2.operation.doorOpenDepthMm;
  const acceptanceSources = Array.isArray(acceptance.sources)
    ? acceptance.sources.map((source) => ({
      authority: source.authority,
      source_type: source.sourceType,
      source_url: source.sourceUrl,
      final_url: source.finalUrl,
      content_type: source.contentType,
      content_sha256: source.contentSha256,
      receipt_binding_sha256: source.receiptBindingSha256,
      verified_at: source.verifiedAt,
    }))
    : null;
  const {
    source_url: _legacySourceUrl,
    source_type: _legacySourceType,
    verified_at: _legacyVerifiedAt,
    raw_json_path: _legacyRawJsonPath,
    confidence_score: _legacyConfidence,
    trust_level: _legacyTrustLevel,
    verified_fields: _legacyVerifiedFields,
    clearance_verified: _legacyClearanceVerified,
    ...retainedEvidence
  } = product.evidence ?? {};
  return {
    ...product,
    w: closed.widthMm,
    h: heightMm,
    d: closed.depthMm,
    dimensions: {
      ...(product.dimensions && typeof product.dimensions === 'object' ? product.dimensions : {}),
      width_mm: closed.widthMm,
      height_mm: heightMm,
      depth_mm: closed.depthMm,
      door_open_90_depth_mm: doorOpenDepthMm,
    },
    clearance_requirements: {
      top_mm: installation.topMm,
      left_mm: installation.leftMm,
      right_mm: installation.rightMm,
      rear_mm: installation.rearMm,
    },
    clearance_top: installation.topMm,
    clearance_left: installation.leftMm,
    clearance_right: installation.rightMm,
    clearance_rear: installation.rearMm,
    door_open_90_depth_mm: doorOpenDepthMm,
    door_swing_mm: null,
    requires_plumbing: null,
    flags: {
      ...(product.flags && typeof product.flags === 'object' ? product.flags : {}),
      requires_plumbing: null,
      ventilation_required: null,
    },
    geometry_v2: structuredClone(acceptance.geometry_v2),
    geometry_v2_provenance: structuredClone(acceptance.geometry_v2_provenance),
    data_source: acceptance.artifactType === 'pdf'
      ? 'official_pdf_receipt_bound'
      : acceptance.artifactType === 'html'
        ? 'official_html_receipt_bound'
        : acceptance.artifactType === 'json'
          ? 'official_api_receipt_bound'
          : 'official_mixed_receipt_bound',
    evidence: {
      ...retainedEvidence,
      source_url: acceptance.sourceUrl,
      source_type: acceptance.sourceType,
      verified_at: acceptance.verifiedAt.slice(0, 10),
      has_pdf_evidence: acceptance.artifactType === 'pdf',
      has_official_evidence: true,
      trust_level: verified ? 'verified_fit' : 'dimensions_verified',
      clearance_verified: verified,
      verified_fields: verified ? ['dimensions', 'installation'] : ['dimensions'],
      acceptance: {
        id: acceptance.acceptanceId,
        outcome: 'accepted',
        identity_outcome: acceptance.identityOutcome,
        source_model: acceptance.sourceModel,
        artifact_type: acceptance.artifactType,
        source_type: acceptance.sourceType,
        source_url: acceptance.sourceUrl,
        content_sha256: acceptance.contentSha256,
        receipt_binding_sha256: acceptance.receiptBindingSha256,
        verified_at: acceptance.verifiedAt,
        ...(acceptanceSources ? { sources: acceptanceSources } : {}),
        missing_for_verified_fit: [...acceptance.geometry_v2_provenance.missingForVerifiedFit],
      },
    },
  };
}
