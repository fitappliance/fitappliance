#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSourceDocument } from '../../src/domain/source-document.mjs';
import { applyEvidencePilotReview } from '../../src/domain/evidence-review.mjs';
import { classifyTransportHost } from '../../src/domain/source-provenance.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const manual = JSON.parse(await readFile(resolve(root, 'data/manual-evidence.json'), 'utf8'));
const canonical = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-registry.json'), 'utf8'));
const reviewBundles = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-review-bundles.json'), 'utf8'));
const reviewManifest = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-pilot-review-manifest.json'), 'utf8'));
const spaceReviewManifest = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/space-evidence-pilot-review-manifest.json'), 'utf8'));
const canonicalByLegacy = new Map(canonical.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
let documents = [];
for (const [legacyId, product] of Object.entries(manual.products ?? {})) {
  for (const [index, evidence] of (product.evidence ?? []).entries()) {
    if (!evidence.source_url) continue;
    const extracted = evidence.extracted ?? {};
    const sourceType = String(evidence.source_type ?? 'legacy_unknown');
    const manufacturer = /official|manufacturer/i.test(sourceType) && !/retailer/i.test(sourceType);
    const identityOutcome = String(extracted.sku ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
      === String(product.model ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase() ? 'exact' : 'ambiguous';
    const fields = [];
    const dimensions = extracted.dimensions ?? {};
    for (const [field, key] of [['closedEnvelope.widthMm', 'width_mm'], ['closedEnvelope.heightMm', 'height_mm'], ['closedEnvelope.depthMm', 'depth_mm']]) {
      if (Number.isFinite(dimensions[key])) fields.push({ field, value: dimensions[key], unit: 'mm', page: null, quote: null });
    }
    const seed = `${legacyId}\0${evidence.source_url}\0${index}`;
    documents.push(createSourceDocument({
      id: `doc_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
      sourceUrl: evidence.source_url, finalUrl: evidence.source_url,
      authorType: manufacturer ? 'manufacturer' : 'unknown',
      transportHostType: classifyTransportHost(evidence.source_url),
      contentType: 'application/pdf', retrievedAt: evidence.verified_at ? `${String(evidence.verified_at).slice(0, 10)}T00:00:00.000Z` : null,
      sha256: evidence.sha256 ?? null, pageCount: null, parserVersion: 'legacy-manual-evidence-v1',
      identityOutcome, fields, state: 'quarantined', history: [],
      productLinks: [{ legacyRuntimeId: legacyId, canonicalProductId: canonicalByLegacy.get(legacyId.toLowerCase()) ?? null }],
      rejectionReason: 'legacy_evidence_missing_page_level_v2_provenance',
    }));
  }
}
const reviewResults = applyEvidencePilotReview({ bundles: reviewBundles.bundles, manifest: reviewManifest });
const manifestByLegacy = new Map(reviewManifest.reviews.map((row) => [row.legacyRuntimeId, row]));
const bundleByDocument = new Map(reviewBundles.bundles.map((row) => [row.sourceDocument.id, row]));
const resultsByDocument = Map.groupBy(reviewResults, (row) => row.sourceDocumentId);
const spaceResultsByDocument = Map.groupBy(spaceReviewManifest.results, (row) => row.sourceDocumentId);
documents = documents.map((document) => {
  const results = resultsByDocument.get(document.id);
  if (!results) return document;
  const bundle = bundleByDocument.get(document.id);
  const review = manifestByLegacy.get(bundle.product.legacyRuntimeId);
  const approved = results.filter((row) => row.status === 'approved');
  const approvedNames = new Set(approved.map((row) => row.field));
  const completeDimensions = [
    'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
  ].every((field) => approvedNames.has(field));
  const state = completeDimensions ? 'approved' : approved.length ? 'reviewed' : 'quarantined';
  const spaceResults = spaceResultsByDocument.get(document.id) ?? [];
  return createSourceDocument({
    ...document,
    ...review.document,
    fields: [...results, ...spaceResults].map((row) => ({
      field: row.field, value: row.value, unit: row.unit, page: row.page,
      quote: row.quote, status: row.status, reason: row.reason,
      reviewer: row.reviewer, reviewedAt: row.reviewedAt,
      ...(row.semanticBasis ? { semanticBasis: row.semanticBasis } : {}),
    })),
    state,
    history: [{ from: 'legacy_quarantined', to: 'reviewed', reviewedAt: reviewManifest.reviewedAt }],
    rejectionReason: state === 'quarantined' ? results[0].reason : null,
  });
});
documents.sort((a, b) => a.id.localeCompare(b.id));
const report = {
  schemaVersion: 1, documents,
  summary: {
    total: documents.length,
    exactIdentity: documents.filter((row) => row.identityOutcome === 'exact').length,
    manufacturerTransport: documents.filter((row) => row.transportHostType === 'manufacturer').length,
    approved: documents.filter((row) => row.state === 'approved').length,
    reviewed: documents.filter((row) => row.state === 'reviewed').length,
    quarantined: documents.filter((row) => row.state === 'quarantined').length,
  },
};
await writeFile(resolve(root, 'data/architecture-v2/source-documents.json'), `${JSON.stringify(report)}\n`);
console.log(JSON.stringify(report.summary));
