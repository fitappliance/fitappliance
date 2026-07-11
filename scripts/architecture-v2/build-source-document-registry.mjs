#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSourceDocument } from '../../src/domain/source-document.mjs';
import { applyEvidencePilotReview } from '../../src/domain/evidence-review.mjs';
import { buildLegacySourceDocuments } from '../../src/domain/source-document-seed.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildPhase10SourceDocuments } from '../../src/domain/phase10-evidence-review.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const manual = JSON.parse(await readFile(resolve(root, 'data/manual-evidence.json'), 'utf8'));
const canonical = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalRegistry'), 'utf8'));
const reviewBundles = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceReviewBundles'), 'utf8'));
const reviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'dimensionReviewManifest'), 'utf8'));
const spaceReviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'spaceReviewManifest'), 'utf8'));
const phase10ReviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'phase10ReviewManifest'), 'utf8'));
let documents = buildLegacySourceDocuments({ manual, canonical });
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
const phase10Documents = buildPhase10SourceDocuments(phase10ReviewManifest.outcomes);
const documentsById = new Map(documents.map((document) => [document.id, document]));
for (const document of phase10Documents) documentsById.set(document.id, document);
documents = [...documentsById.values()];
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
await writeFile(resolveArchitectureV2Path(root, 'sourceDocuments'), `${JSON.stringify(report)}\n`);
console.log(JSON.stringify(report.summary));
