import { classifyTransportHost } from './source-provenance.mjs';
import { createSourceDocument } from './source-document.mjs';
import { currentMineruEvidenceProfile } from './evidence-source-verifier.mjs';

const DIMENSION_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

const SPACE_FIELDS = new Set([
  'installation.leftMm', 'installation.rightMm', 'installation.topMm',
  'installation.rearMm', 'installation.frontMm',
  'operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm', 'operation.lidOpenHeightMm',
  'service.plumbingRearMm', 'service.rearServicesMm', 'service.rearVentilationMm',
]);

const ALL_FIELDS = new Set([...DIMENSION_FIELDS, ...SPACE_FIELDS]);
const DIMENSION_BASES = new Set(['explicit_axis_label', 'labelled_dimension_diagram']);
const SPACE_BASES = new Set([
  'explicit_axis_label', 'explicit_sides_label', 'explicit_each_side_label',
  'labelled_clearance_diagram', 'labelled_door_open_diagram',
]);

const FIT_REQUIRED_FIELDS = Object.freeze({
  fridge: ['operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm'],
  dishwasher: ['operation.doorOpenDepthMm', 'service.rearServicesMm'],
  washing_machine: ['service.rearServicesMm'],
  dryer: ['operation.doorOpenDepthMm', 'service.rearVentilationMm'],
});

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

function validateCoverage(selection, reviews) {
  const selected = (selection?.products ?? []).map((row) => text(row.legacyRuntimeId));
  const reviewed = reviews.map((row) => text(row.legacyRuntimeId));
  if (!selected.length || new Set(reviewed).size !== reviewed.length) {
    throw new TypeError('unique Phase 10 review outcomes required');
  }
  if (selected.length !== reviewed.length || selected.some((id) => !reviewed.includes(id))) {
    throw new TypeError('Phase 10 review must cover every selected product');
  }
}

function validateField(field, acquisition) {
  if (!ALL_FIELDS.has(field?.field)) throw new TypeError(`unsupported Phase 10 field: ${field?.field}`);
  const heightRange = field.field === 'closedEnvelope.heightMm'
    && field.value && typeof field.value === 'object'
    && Number.isFinite(field.value.minimumMm) && field.value.minimumMm > 0
    && Number.isFinite(field.value.maximumMm) && field.value.maximumMm >= field.value.minimumMm;
  const scalar = Number.isFinite(field.value) && field.value > 0;
  if ((!scalar && !heightRange) || !Number.isInteger(field.page)
    || field.page < 1 || field.page > acquisition.pageCount || !text(field.quote)) {
    throw new TypeError(`invalid page-level evidence: ${field.field}`);
  }
  const allowedBases = DIMENSION_FIELDS.has(field.field) ? DIMENSION_BASES : SPACE_BASES;
  if (!allowedBases.has(field.semanticBasis)) throw new TypeError(`unsupported semantic basis: ${field.field}`);
  if (field.semanticBasis === 'labelled_door_open_diagram' && field.field !== 'operation.doorOpenDepthMm') {
    throw new TypeError('door-open diagram is limited to door-open depth');
  }
  if (field.semanticBasis === 'explicit_sides_label'
    && (!['installation.leftMm', 'installation.rightMm'].includes(field.field) || !/sides?/i.test(field.quote))) {
    throw new TypeError('Sides evidence is limited to left and right installation fields');
  }
  return freezeDeep({
    field: field.field,
    value: field.value,
    unit: 'mm',
    page: field.page,
    quote: text(field.quote),
    semanticBasis: field.semanticBasis,
    status: 'approved',
  });
}

function hasCurrentMineruProvenance(acquired) {
  const artifact = acquired?.derivedArtifact;
  try {
    const profile = currentMineruEvidenceProfile(artifact);
    return acquired?.parserVersion === `MinerU-${profile.parserVersion}`
      && artifact.sourcePdfSha256 === acquired.sha256
      && /^[a-f0-9]{64}$/.test(text(artifact.contentSha256))
      && Number.isInteger(artifact.pageCount)
      && artifact.pageCount === acquired.pageCount
      && Number.isInteger(artifact.byteSize)
      && artifact.byteSize > 1;
  } catch {
    return false;
  }
}

export function reviewPhase10Evidence({ selection, acquisition, input }) {
  if (!Array.isArray(selection?.products) || !Array.isArray(acquisition?.entries) || !Array.isArray(input?.reviews)) {
    throw new TypeError('Phase 10 selection, acquisition, and review input required');
  }
  if (!text(input.reviewer) || !/^\d{4}-\d{2}-\d{2}$/.test(text(input.reviewedAt))) {
    throw new TypeError('reviewer and ISO review date required');
  }
  validateCoverage(selection, input.reviews);
  const selectedById = new Map(selection.products.map((row) => [text(row.legacyRuntimeId), row]));
  const acquisitionById = new Map(acquisition.entries.map((row) => [text(row.legacyRuntimeId), row]));

  const outcomes = input.reviews.map((review) => {
    const legacyRuntimeId = text(review.legacyRuntimeId);
    const product = selectedById.get(legacyRuntimeId);
    const acquired = acquisitionById.get(legacyRuntimeId);
    if (!product || !acquired) throw new TypeError(`Phase 10 provenance missing: ${legacyRuntimeId}`);
    const rawFields = review.fields ?? [];

    if (review.identityOutcome === 'no_source') {
      if (acquired.outcome !== 'no_source' || rawFields.length || !text(review.reason)) {
        throw new TypeError(`invalid no_source outcome: ${legacyRuntimeId}`);
      }
      return freezeDeep({
        ...product, legacyRuntimeId, state: 'no_source', identityOutcome: 'no_source',
        reason: text(review.reason), fields: [], reviewedAt: input.reviewedAt, reviewer: text(input.reviewer),
      });
    }

    if (review.identityOutcome !== 'exact') {
      if (rawFields.length) throw new TypeError(`ambiguous identity cannot approve fields: ${legacyRuntimeId}`);
      if (!text(review.reason)) throw new TypeError(`ambiguous identity reason required: ${legacyRuntimeId}`);
      return freezeDeep({
        ...product, legacyRuntimeId, state: 'quarantined', identityOutcome: text(review.identityOutcome),
        reason: text(review.reason), fields: [], reviewedAt: input.reviewedAt, reviewer: text(input.reviewer),
        document: acquired.outcome === 'acquired' ? { ...acquired } : null,
      });
    }

    const legacySnapshot = (acquisition.schemaVersion ?? 1) === 1;
    const reproducible = acquired.outcome === 'acquired'
      && acquired.contentType === 'application/pdf'
      && classifyTransportHost(acquired.finalUrl) === 'manufacturer'
      && /^[a-f0-9]{64}$/i.test(text(acquired.sha256))
      && Number.isInteger(acquired.pageCount) && acquired.pageCount > 0
      && text(acquired.parserVersion)
      && (legacySnapshot || (
        acquisition.schemaVersion === 2
        && acquisition.extractionFormat === 'mineru_content_list_v2'
        && hasCurrentMineruProvenance(acquired)
      ))
      && review.renderedPageVerified === true;
    if (!reproducible) throw new TypeError(`rendered official PDF provenance required: ${legacyRuntimeId}`);
    const fields = rawFields.map((field) => validateField(field, acquired));
    const names = new Set(fields.map((field) => field.field));
    if (names.size !== fields.length) throw new TypeError(`duplicate approved field: ${legacyRuntimeId}`);
    if (![...DIMENSION_FIELDS].every((field) => names.has(field))) {
      throw new TypeError(`all three closed-envelope dimensions required: ${legacyRuntimeId}`);
    }
    return freezeDeep({
      ...product, legacyRuntimeId, state: 'approved', identityOutcome: 'exact', fields,
      reason: null, reviewedAt: input.reviewedAt, reviewer: text(input.reviewer),
      document: { ...acquired },
    });
  });

  return freezeDeep({
    schemaVersion: 1,
    reviewedAt: input.reviewedAt,
    reviewer: text(input.reviewer),
    outcomes,
    summary: {
      selected: outcomes.length,
      approved: outcomes.filter((row) => row.state === 'approved').length,
      quarantined: outcomes.filter((row) => row.state === 'quarantined').length,
      noSource: outcomes.filter((row) => row.state === 'no_source').length,
      approvedFields: outcomes.reduce((sum, row) => sum + row.fields.length, 0),
    },
  });
}

export function buildPhase10EvidenceProjection(outcomes) {
  const projection = new Map();
  for (const outcome of outcomes ?? []) {
    if (outcome.state !== 'approved') continue;
    const approvedFields = outcome.fields.map((row) => row.field).sort();
    const values = Object.fromEntries(outcome.fields.map((row) => [row.field, row.value]));
    const clearanceVerified = [
      'installation.leftMm', 'installation.rightMm', 'installation.topMm',
      'installation.rearMm', 'installation.frontMm',
    ].every((field) => approvedFields.includes(field));
    const fitVerified = clearanceVerified
      && (FIT_REQUIRED_FIELDS[outcome.category] ?? ['category_contract_unknown'])
        .every((field) => approvedFields.includes(field));
    projection.set(outcome.canonicalProductId, freezeDeep({
      canonicalProductId: outcome.canonicalProductId,
      trustLevel: fitVerified ? 'verified_fit' : 'dimensions_verified',
      clearanceVerified,
      fitVerified,
      approvedFields,
      values,
      sourceDocumentId: outcome.sourceCandidates?.[0]?.sourceDocumentId ?? null,
      documentSha256: outcome.document.sha256,
      reviewedAt: outcome.reviewedAt,
      limitations: [],
    }));
  }
  return projection;
}

export function buildPhase10SourceDocuments(outcomes) {
  return freezeDeep((outcomes ?? [])
    .filter((outcome) => outcome.document)
    .map((outcome) => {
      const id = text(outcome.sourceCandidates?.[0]?.sourceDocumentId);
      if (!id) throw new TypeError(`source document id missing: ${outcome.legacyRuntimeId}`);
      const approved = outcome.state === 'approved';
      return createSourceDocument({
        id,
        sourceUrl: outcome.document.sourceUrl,
        finalUrl: outcome.document.finalUrl,
        authorType: 'manufacturer',
        transportHostType: classifyTransportHost(outcome.document.finalUrl),
        contentType: outcome.document.contentType,
        retrievedAt: outcome.document.retrievedAt,
        sha256: outcome.document.sha256,
        pageCount: outcome.document.pageCount,
        parserVersion: outcome.document.parserVersion,
        identityOutcome: outcome.identityOutcome,
        productLinks: [{
          legacyRuntimeId: outcome.legacyRuntimeId,
          canonicalProductId: outcome.canonicalProductId,
        }],
        fields: outcome.fields.map((field) => ({
          ...field,
          reviewer: outcome.reviewer,
          reviewedAt: outcome.reviewedAt,
        })),
        state: approved ? 'approved' : 'quarantined',
        history: [{ from: 'text_extracted', to: approved ? 'approved' : 'quarantined', reviewedAt: outcome.reviewedAt }],
        rejectionReason: approved ? null : outcome.reason,
      });
    }));
}

export { ALL_FIELDS, DIMENSION_FIELDS, SPACE_FIELDS };
