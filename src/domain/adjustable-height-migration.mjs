function text(value) {
  return String(value ?? '').trim();
}

function rangeFromQuote(quote) {
  const match = /\bheight\s+(\d+)\s*[-–]\s*(\d+)\s*mm\b/i.exec(text(quote));
  if (!match) throw new Error(`explicit adjustable height range required: ${text(quote)}`);
  const minimumMm = Number(match[1]);
  const maximumMm = Number(match[2]);
  if (!Number.isSafeInteger(minimumMm) || !Number.isSafeInteger(maximumMm) || minimumMm >= maximumMm) {
    throw new Error('invalid adjustable height range');
  }
  return { minimumMm, maximumMm };
}

function receiptBoundHeight(product, expectedRange) {
  const height = product?.geometry_v2?.closedEnvelope?.heightMm;
  const evidence = product?.geometry_v2_provenance?.fieldEvidence?.['closedEnvelope.heightMm'];
  return Boolean(height
    && height.minimumMm === expectedRange.minimumMm
    && height.maximumMm === expectedRange.maximumMm
    && /^https:\/\//i.test(String(evidence?.sourceUrl ?? ''))
    && /^[a-f0-9]{64}$/i.test(String(evidence?.contentSha256 ?? ''))
    && /^[a-f0-9]{64}$/i.test(String(evidence?.receiptBindingSha256 ?? '')));
}

export function buildAdjustableHeightMigrationAudit(input) {
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const selectedByLegacy = new Map((input?.phase8Selection?.products ?? [])
    .map((product) => [text(product.legacyRuntimeId).toLowerCase(), product]));
  const publicByLegacy = new Map((input?.publicProjection?.products ?? [])
    .map((product) => [text(product.id).toLowerCase(), product]));
  const mineruByHash = new Map((input?.mineruAudit?.entries ?? [])
    .map((entry) => [text(entry.sourcePdfSha256), entry]));
  const cases = [];
  for (const review of input?.phase8ReviewInput?.reviews ?? []) {
    if (review.fieldReason !== 'adjustable_height_range_not_representable_as_fixed_height') continue;
    const legacyRuntimeId = text(review.id).toLowerCase();
    const product = selectedByLegacy.get(legacyRuntimeId);
    if (!product) throw new Error(`adjustable-height product missing: ${legacyRuntimeId}`);
    const expectedRange = rangeFromQuote(review.quote);
    const publicProduct = publicByLegacy.get(legacyRuntimeId);
    const published = receiptBoundHeight(publicProduct, expectedRange);
    const mineruStatus = mineruByHash.get(review.hash)?.status ?? 'missing';
    const status = published
      ? 'published_receipt_bound_range'
      : mineruStatus === 'indexed'
        ? 'indexed_pending_receipt_bound_source'
        : 'mineru_backfill_pending';
    cases.push({
      legacyRuntimeId,
      brand: text(product.brand),
      model: text(product.model),
      category: text(product.category),
      sourcePdfSha256: text(review.hash),
      sourcePage: review.page,
      sourceQuote: text(review.quote),
      expectedRange,
      scalarCoercionAllowed: false,
      placementHeightMm: expectedRange.maximumMm,
      mineruStatus,
      status,
      publication: {
        release: published,
        evidenceLevel: published ? publicProduct.geometry_v2_provenance.evidenceLevel : 'none',
        blocker: published ? null : 'current_receipt_bound_exact_model_source_required',
      },
    });
  }
  cases.sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
  return {
    schemaVersion: 1,
    generatedAt,
    summary: {
      cases: cases.length,
      publishedReceiptBoundRange: cases.filter((entry) => entry.status === 'published_receipt_bound_range').length,
      indexedPendingReceiptBoundSource: cases.filter((entry) => entry.status === 'indexed_pending_receipt_bound_source').length,
      mineruBackfillPending: cases.filter((entry) => entry.status === 'mineru_backfill_pending').length,
      scalarCoercions: 0,
    },
    cases,
  };
}
