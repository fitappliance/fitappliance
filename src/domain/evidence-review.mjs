const DECISION_STATES = new Set(['approved', 'rejected', 'quarantined']);

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

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

export function createReviewBundle({ product, sourceDocument, rawExtraction, rawExtractionPath = null }) {
  if (!product?.id || !product?.canonicalProductId) throw new TypeError('canonical product identity required');
  if (!sourceDocument?.id || !sourceDocument?.sourceUrl) throw new TypeError('source document required');
  const linked = (sourceDocument.productLinks ?? []).some((link) =>
    text(link.legacyRuntimeId).toLowerCase() === text(product.id).toLowerCase()
    && text(link.canonicalProductId) === text(product.canonicalProductId)
  );
  if (!linked) throw new TypeError('source document is not linked to product identity');
  return freezeDeep({
    schemaVersion: 1,
    status: 'pending',
    product: {
      legacyRuntimeId: text(product.id), canonicalProductId: text(product.canonicalProductId),
      category: text(product.cat), brand: text(product.brand), model: text(product.model),
      dimensions: { widthMm: product.w ?? null, heightMm: product.h ?? null, depthMm: product.d ?? null },
    },
    sourceDocument: {
      id: text(sourceDocument.id), sourceUrl: text(sourceDocument.sourceUrl), finalUrl: text(sourceDocument.finalUrl),
      authorType: text(sourceDocument.authorType) || 'unknown', transportHostType: text(sourceDocument.transportHostType) || 'unknown',
      contentType: text(sourceDocument.contentType), retrievedAt: sourceDocument.retrievedAt ?? null,
      sha256: sourceDocument.sha256 ?? null, pageCount: sourceDocument.pageCount ?? null,
      parserVersion: sourceDocument.parserVersion ?? null, identityOutcome: text(sourceDocument.identityOutcome),
    },
    rawExtraction: {
      path: rawExtractionPath,
      available: Boolean(rawExtraction),
      metadataModel: rawExtraction?.metadata?.model ?? rawExtraction?.model ?? null,
    },
    fields: (sourceDocument.fields ?? []).map((field) => ({
      field: text(field.field), value: field.value ?? null, unit: text(field.unit),
      page: field.page ?? null, quote: field.quote ?? null, status: 'candidate',
    })),
    decisions: [],
  });
}

export function reviewField(bundle, decision) {
  if (!bundle || bundle.status !== 'pending') throw new TypeError('pending review bundle required');
  if (!DECISION_STATES.has(decision?.status)) throw new TypeError('valid review status required');
  if (!text(decision.reviewer) || !isIsoDate(decision.reviewedAt)) throw new TypeError('reviewer and ISO review date required');
  const candidate = bundle.fields.find((field) => field.field === decision.field);
  if (!candidate) throw new TypeError(`candidate field not found: ${decision.field}`);

  if (decision.status === 'approved') {
    const document = bundle.sourceDocument;
    const complete = document.authorType === 'manufacturer'
      && document.identityOutcome === 'exact'
      && /^[a-f0-9]{64}$/i.test(text(document.sha256))
      && Number.isInteger(document.pageCount) && document.pageCount > 0
      && text(document.parserVersion)
      && Number.isInteger(candidate.page) && candidate.page > 0
      && text(candidate.quote)
      && decision.renderedPageVerified === true;
    if (!complete) throw new TypeError(`cannot approve ${candidate.field}: incomplete reproducibility gate`);
  } else if (!text(decision.reason)) {
    throw new TypeError('rejected or quarantined decision reason required');
  }

  return freezeDeep({
    field: candidate.field,
    value: candidate.value,
    unit: candidate.unit,
    page: candidate.page,
    quote: candidate.quote,
    status: decision.status,
    reason: decision.reason ?? null,
    reviewer: text(decision.reviewer),
    reviewedAt: decision.reviewedAt,
    renderedPageVerified: decision.renderedPageVerified === true,
    sourceDocumentId: bundle.sourceDocument.id,
    documentSha256: bundle.sourceDocument.sha256,
    parserVersion: bundle.sourceDocument.parserVersion,
    canonicalProductId: bundle.product.canonicalProductId,
    legacyRuntimeId: bundle.product.legacyRuntimeId,
  });
}

export function applyEvidencePilotReview({ bundles, manifest }) {
  if (!Array.isArray(bundles) || !Array.isArray(manifest?.reviews)) throw new TypeError('bundles and review manifest required');
  const bundleMap = new Map(bundles.map((bundle) => [bundle.product.legacyRuntimeId, bundle]));
  const results = [];
  for (const review of manifest.reviews) {
    const original = bundleMap.get(review.legacyRuntimeId);
    if (!original) throw new TypeError(`review bundle missing for ${review.legacyRuntimeId}`);
    const bundle = freezeDeep({
      ...original,
      sourceDocument: { ...original.sourceDocument, ...review.document },
      fields: original.fields.map((field) => ({
        ...field,
        page: review.fields.find((row) => row.field === field.field)?.page ?? field.page,
        quote: review.fields.find((row) => row.field === field.field)?.quote ?? field.quote,
      })),
    });
    for (const decision of review.fields) results.push(reviewField(bundle, decision));
  }
  if (results.length !== bundles.reduce((sum, row) => sum + row.fields.length, 0)) {
    throw new TypeError('review manifest does not cover every candidate field');
  }
  return freezeDeep(results);
}

export function buildPilotEvidenceProjection(results) {
  if (!Array.isArray(results)) throw new TypeError('review results required');
  const groups = new Map();
  for (const result of results) {
    const rows = groups.get(result.canonicalProductId) ?? [];
    rows.push(result);
    groups.set(result.canonicalProductId, rows);
  }
  const requiredDimensions = new Set([
    'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
  ]);
  const projection = new Map();
  for (const [canonicalProductId, rows] of groups) {
    const approvedFields = rows.filter((row) => row.status === 'approved').map((row) => row.field).sort();
    const complete = [...requiredDimensions].every((field) => approvedFields.includes(field));
    const reviewStatus = complete ? 'dimensions_approved' : approvedFields.length ? 'partial' : 'quarantined';
    projection.set(canonicalProductId, freezeDeep({
      canonicalProductId,
      trustLevel: complete ? 'dimensions_verified' : 'retailer_spec',
      reviewStatus,
      approvedFields,
      clearanceVerified: false,
      reviewedAt: rows[0]?.reviewedAt ?? null,
      sourceDocumentId: rows[0]?.sourceDocumentId ?? null,
      documentSha256: rows[0]?.documentSha256 ?? null,
      limitations: rows.filter((row) => row.status !== 'approved').map((row) => row.reason).filter(Boolean),
    }));
  }
  return projection;
}
