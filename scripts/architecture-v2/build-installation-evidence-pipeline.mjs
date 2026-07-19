#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildInstallationEvidenceControlPlane,
  INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION,
} from '../../src/domain/installation-evidence-pipeline.mjs';
import { INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX } from '../../src/domain/installation-knowledge-v3.mjs';
import { isOfficialBrandArtifactUrl } from '../../src/domain/evidence-source-verifier.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const pathFor = (relative) => resolve(root, relative);
const paths = {
  pilot: pathFor('data/architecture-v2/generated/installation-knowledge-pilot.json'),
  acquisition: pathFor('data/architecture-v2/generated/phase10-evidence-acquisition.json'),
  recipes: pathFor('data/architecture-v2/policies/installation-evidence-canary-recipes.json'),
  mineruIndex: pathFor('data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json'),
  bundle: pathFor('data/architecture-v2/reviews/automated/installation-evidence-receipts.json'),
  replayAudit: pathFor('data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json'),
  documentFamilyGraph: pathFor('data/architecture-v2/generated/historical-document-family-graph.json'),
};

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [pilot, acquisition, recipes, mineruIndex, receiptBundle, replayAudit, documentFamilyGraph] = await Promise.all([
  json(paths.pilot),
  json(paths.acquisition),
  json(paths.recipes),
  json(paths.mineruIndex),
  json(paths.bundle),
  json(paths.replayAudit),
  json(paths.documentFamilyGraph),
]);
if (receiptBundle.schemaVersion !== INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION) {
  throw new Error('unsupported installation evidence bundle schema');
}
const recipeByProduct = new Map(recipes.products.map((recipe) => [recipe.canonicalProductId, recipe]));
const indexByPdf = new Map(mineruIndex.entries.map((entry) => [entry.sourcePdfSha256, entry]));
const pilotIds = new Set(pilot.products.map((product) => product.canonicalProductId));
const pilotById = new Map(pilot.products.map((product) => [product.canonicalProductId, product]));
const sourceCandidates = [];
const sourceDiagnostics = [];
const documentFamiliesByPdfSha256 = Object.fromEntries(
  documentFamilyGraph.documents.map((document) => [document.pdfSha256, document.familyIds ?? []]),
);
for (const entry of acquisition.entries ?? []) {
  if (!pilotIds.has(entry.canonicalProductId)
    || entry.outcome !== 'acquired' || !entry.sha256 || !entry.sourceUrl) continue;
  const indexed = indexByPdf.get(entry.sha256);
  const recipe = recipeByProduct.get(entry.canonicalProductId);
  const product = pilotById.get(entry.canonicalProductId);
  if (!isOfficialBrandArtifactUrl(entry.sourceUrl, product.brand, {
    model: product.model,
    category: product.category,
    artifactUrl: entry.sourceUrl,
  })) {
    sourceDiagnostics.push({
      canonicalProductId: entry.canonicalProductId,
      category: product.category,
      brand: product.brand,
      model: product.model,
      sourceUrl: entry.sourceUrl,
      pdfSha256: entry.sha256,
      state: 'OFFICIAL_PROVENANCE_REQUIRED_OR_UNAPPROVED_HOST',
    });
    continue;
  }
  sourceCandidates.push({
    canonicalProductId: entry.canonicalProductId,
    sourceUrl: entry.sourceUrl,
    pdfSha256: entry.sha256,
    identityOutcome: recipe?.pdfSha256 === entry.sha256 ? 'exact' : entry.identityOutcome,
    mineru: indexed?.status === 'indexed' ? {
      format: indexed.derivedArtifact.format,
      contentSha256: indexed.derivedArtifact.contentSha256,
    } : null,
  });
}
for (const recipe of recipes.products) {
  if (sourceCandidates.some((candidate) => candidate.canonicalProductId === recipe.canonicalProductId
    && candidate.pdfSha256 === recipe.pdfSha256)) continue;
  const indexed = indexByPdf.get(recipe.pdfSha256);
  sourceCandidates.push({
    canonicalProductId: recipe.canonicalProductId,
    sourceUrl: recipe.sourceUrl,
    pdfSha256: recipe.pdfSha256,
    identityOutcome: 'exact',
    mineru: indexed?.status === 'indexed' ? {
      format: indexed.derivedArtifact.format,
      contentSha256: indexed.derivedArtifact.contentSha256,
    } : null,
  });
}
const control = buildInstallationEvidenceControlPlane({
  generatedAt: recipes.generatedAt,
  pilot,
  sourceCandidates,
  receiptBundle,
  replayAudit,
  batchSize: 5,
  documentFamiliesByPdfSha256,
});
const common = {
  schemaVersion: 1,
  generatedAt: control.generatedAt,
  receiptBundleSha256: control.receiptBundleSha256,
  replayAuditStatus: control.replayAuditStatus,
};
const outputs = [
  ['data/architecture-v2/generated/installation-evidence-applicability-matrix.json', INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX],
  ['data/architecture-v2/generated/installation-evidence-pipeline.json', control],
  ['data/architecture-v2/generated/installation-evidence-candidates.json', { ...common, records: control.candidates, summary: control.summary }],
  ['data/architecture-v2/generated/installation-evidence-parser-gaps.json', { ...common, records: control.parserGaps, summary: { records: control.parserGaps.length } }],
  ['data/architecture-v2/generated/installation-evidence-batches.json', { ...common, records: control.batches, summary: { batches: control.batches.length, targets: control.batches.reduce((sum, batch) => sum + batch.targets.length, 0) } }],
  ['data/architecture-v2/generated/installation-evidence-source-diagnostics.json', { ...common, records: sourceDiagnostics, summary: { records: sourceDiagnostics.length } }],
];
for (const [relativePath, value] of outputs) {
  await writeFile(pathFor(relativePath), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(JSON.stringify(control.summary));
