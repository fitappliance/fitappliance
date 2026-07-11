#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applySpaceEvidenceReview } from '../../src/domain/space-evidence-review.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const input = await readJson('data/architecture-v2/space-evidence-pilot-input.json');
const bundles = (await readJson('data/architecture-v2/evidence-review-bundles.json')).bundles;
const dimensionManifest = await readJson('data/architecture-v2/evidence-pilot-review-manifest.json');
const results = applySpaceEvidenceReview(input, { bundles, dimensionManifest });
const output = {
  schemaVersion: 1,
  reviewedAt: input.reviewedAt,
  auditedDocuments: input.reviews.map((row) => ({
    legacyRuntimeId: row.legacyRuntimeId,
    fieldCount: row.fields.length,
    noCandidateReason: row.noCandidateReason ?? null,
  })),
  results,
  summary: {
    auditedDocuments: input.reviews.length,
    documentsWithApprovedFields: new Set(results.map((row) => row.sourceDocumentId)).size,
    approvedFields: results.length,
    documentsWithoutCandidates: input.reviews.filter((row) => !row.fields.length).length,
  },
};
await writeFile(resolve(root, 'data/architecture-v2/space-evidence-pilot-review-manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary));
