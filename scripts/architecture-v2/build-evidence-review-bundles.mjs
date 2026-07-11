#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReviewBundle } from '../../src/domain/evidence-review.mjs';
import { buildLegacySourceDocuments } from '../../src/domain/source-document-seed.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (relativePath) => JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const pilot = await readJson(resolveArchitectureV2Path(root, 'phase08Selection'));
const catalog = await readJson('data/catalog-final.json');
const manual = await readJson('data/manual-evidence.json');
const canonical = await readJson(resolveArchitectureV2Path(root, 'canonicalRegistry'));
const reviewInput = await readJson(resolveArchitectureV2Path(root, 'phase08DimensionInput'));
const reviewByLegacy = new Map(reviewInput.reviews.map((review) => [review.id, review]));
const canonicalByLegacy = new Map(canonical.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
const products = new Map(catalog.products.map((row) => {
  const legacyRuntimeId = String(row.id).toLowerCase();
  return [canonicalByLegacy.get(legacyRuntimeId), {
    ...row,
    brand: brandCanon.canonicalizeBrand(row.brand),
    canonicalProductId: canonicalByLegacy.get(legacyRuntimeId),
  }];
}));
const documents = new Map(buildLegacySourceDocuments({ manual, canonical }).map((row) => [row.id, row]));

const bundles = [];
for (const selection of pilot.products) {
  const product = products.get(selection.canonicalProductId);
  const sourceDocument = documents.get(selection.sourceDocumentId);
  if (!product || !sourceDocument) throw new TypeError(`pilot join failed for ${selection.canonicalProductId}`);
  const rawExtractionPath = product.evidence?.raw_json_path ?? null;
  let rawExtraction = null;
  if (rawExtractionPath) {
    try { rawExtraction = await readJson(rawExtractionPath); } catch {}
  }
  const bundle = createReviewBundle({ product, sourceDocument, rawExtraction, rawExtractionPath });
  const review = reviewByLegacy.get(selection.legacyRuntimeId);
  if (!review) throw new TypeError(`pilot review input missing for ${selection.legacyRuntimeId}`);
  const approvedFields = review.approve === 'all' ? new Set(bundle.fields.map((row) => row.field)) : new Set(review.approve ?? []);
  bundles.push({
    ...bundle,
    sourceDocument: {
      ...bundle.sourceDocument,
      authorType: 'manufacturer',
      sha256: review.hash,
      pageCount: review.pages,
      parserVersion: reviewInput.parserVersion,
      identityOutcome: approvedFields.size > 0 ? 'exact' : 'ambiguous',
    },
    fields: bundle.fields.map((field) => ({
      ...field,
      page: review.page,
      quote: review.quote ?? `No exact identity approval: ${review.reason}`,
    })),
  });
}

const output = { schemaVersion: 1, generatedAt: pilot.generatedAt, bundles };
await writeFile(resolveArchitectureV2Path(root, 'evidenceReviewBundles'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ bundles: bundles.length, fields: bundles.reduce((sum, row) => sum + row.fields.length, 0), rawExtractions: bundles.filter((row) => row.rawExtraction.available).length }));
