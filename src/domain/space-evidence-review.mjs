const SPACE_FIELDS = new Set([
  'installation.leftMm', 'installation.rightMm', 'installation.topMm',
  'installation.rearMm', 'installation.frontMm',
  'operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm', 'operation.lidOpenHeightMm',
  'service.plumbingRearMm', 'service.rearServicesMm', 'service.rearVentilationMm',
]);
const INSTALLATION_FIELDS = new Set([...SPACE_FIELDS].filter((field) => field.startsWith('installation.')));
const REQUIRED_CLEARANCE_FIELDS = new Set([
  'installation.leftMm', 'installation.rightMm', 'installation.topMm',
  'installation.rearMm', 'installation.frontMm',
]);

function text(value) {
  return String(value ?? '').trim();
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function reproducible(input) {
  const document = input.document ?? {};
  return document.authorType === 'manufacturer'
    && document.transportHostType === 'manufacturer'
    && document.identityOutcome === 'exact'
    && /^[a-f0-9]{64}$/i.test(text(document.sha256))
    && Number.isInteger(document.pageCount) && document.pageCount > 0
    && text(document.parserVersion)
    && Number.isInteger(input.page) && input.page > 0 && input.page <= document.pageCount
    && text(input.quote)
    && text(input.reviewer)
    && /^\d{4}-\d{2}-\d{2}$/.test(text(input.reviewedAt))
    && input.renderedPageVerified === true;
}

export function reviewSpaceField(input) {
  if (!SPACE_FIELDS.has(input?.field)) throw new TypeError(`unsupported space field: ${input?.field}`);
  if (input?.status !== 'approved') throw new TypeError('space pilot accepts approved fields only');
  if (input?.unit !== 'mm' || !Number.isFinite(input?.value) || input.value <= 0) {
    throw new TypeError('space evidence requires a positive explicit value in mm');
  }
  if (!reproducible(input)) throw new TypeError(`cannot approve ${input.field}: incomplete reproducibility gate`);
  if (input.field === 'operation.doorOpenDepthMm' && input.semanticBasis !== 'labelled_door_open_diagram') {
    throw new TypeError('door-open depth requires a rendered door-open diagram');
  }
  if (input.semanticBasis === 'labelled_door_open_diagram' && input.field !== 'operation.doorOpenDepthMm') {
    throw new TypeError('door-open diagram basis is limited to door-open depth');
  }
  if (input.semanticBasis === 'explicit_sides_label') {
    if (!['installation.leftMm', 'installation.rightMm'].includes(input.field) || !/\bsides?\b/i.test(input.quote)) {
      throw new TypeError('left/right sharing requires an explicit Sides label');
    }
  }
  if (input.semanticBasis === 'explicit_each_side_label') {
    if (!['installation.leftMm', 'installation.rightMm'].includes(input.field) || !/each side/i.test(input.quote)) {
      throw new TypeError('left/right sharing requires an explicit each-side label');
    }
  }
  if (!['explicit_axis_label', 'explicit_sides_label', 'explicit_each_side_label', 'labelled_door_open_diagram'].includes(input.semanticBasis)) {
    throw new TypeError('unsupported semantic basis');
  }
  return freezeDeep({
    legacyRuntimeId: text(input.legacyRuntimeId),
    canonicalProductId: text(input.canonicalProductId),
    sourceDocumentId: text(input.document.id),
    field: input.field, value: input.value, unit: input.unit,
    page: input.page, quote: text(input.quote), semanticBasis: input.semanticBasis,
    status: 'approved', reviewer: text(input.reviewer), reviewedAt: input.reviewedAt,
    renderedPageVerified: true, documentSha256: input.document.sha256,
    parserVersion: input.document.parserVersion,
  });
}

export function applySpaceEvidenceReview(input, { bundles, dimensionManifest }) {
  if (!Array.isArray(input?.reviews) || !Array.isArray(bundles) || !Array.isArray(dimensionManifest?.reviews)) {
    throw new TypeError('space input, bundles and dimension manifest required');
  }
  const bundleByLegacy = new Map(bundles.map((row) => [row.product.legacyRuntimeId, row]));
  const dimensionByLegacy = new Map(dimensionManifest.reviews.map((row) => [row.legacyRuntimeId, row]));
  const results = [];
  for (const review of input.reviews) {
    const bundle = bundleByLegacy.get(review.legacyRuntimeId);
    const dimension = dimensionByLegacy.get(review.legacyRuntimeId);
    if (!bundle || !dimension) throw new TypeError(`Phase 8 approved document missing: ${review.legacyRuntimeId}`);
    if (!review.fields?.length && !text(review.noCandidateReason)) {
      throw new TypeError(`no-candidate reason required: ${review.legacyRuntimeId}`);
    }
    if (review.documentSha256 !== dimension.document.sha256 || review.pageCount !== dimension.document.pageCount) {
      throw new TypeError(`document provenance drift: ${review.legacyRuntimeId}`);
    }
    for (const field of review.fields ?? []) {
      results.push(reviewSpaceField({
        ...field,
        legacyRuntimeId: review.legacyRuntimeId,
        canonicalProductId: bundle.product.canonicalProductId,
        unit: 'mm', status: 'approved', reviewer: input.reviewer, reviewedAt: input.reviewedAt,
        renderedPageVerified: true,
        document: {
          ...dimension.document,
          id: bundle.sourceDocument.id,
          transportHostType: classifyTransportHost(bundle.sourceDocument.sourceUrl),
        },
      }));
    }
  }
  return freezeDeep(results);
}

export function buildSpaceEvidenceProjection(results) {
  const groups = new Map();
  for (const row of results ?? []) {
    const fields = groups.get(row.canonicalProductId) ?? [];
    fields.push(row);
    groups.set(row.canonicalProductId, fields);
  }
  const projection = new Map();
  for (const [canonicalProductId, rows] of groups) {
    const approvedFields = [...new Set(rows.map((row) => row.field))].sort();
    const clearanceVerified = [...REQUIRED_CLEARANCE_FIELDS].every((field) => approvedFields.includes(field));
    projection.set(canonicalProductId, freezeDeep({
      canonicalProductId,
      trustLevel: clearanceVerified ? 'verified_fit' : 'dimensions_verified',
      clearanceVerified,
      approvedFields,
      values: Object.fromEntries(rows.map((row) => [row.field, row.value])),
      sourceDocumentId: rows[0].sourceDocumentId,
      reviewedAt: rows[0].reviewedAt,
    }));
  }
  return projection;
}

export { INSTALLATION_FIELDS, SPACE_FIELDS };
import { classifyTransportHost } from './source-provenance.mjs';
