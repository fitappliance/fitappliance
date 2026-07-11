#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReviewBundle } from '../../src/domain/evidence-review.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (relativePath) => JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const pilot = await readJson('data/architecture-v2/evidence-pilot.json');
const catalog = await readJson('data/architecture-v2/public-catalog-projection.json');
const sourceRegistry = await readJson('data/architecture-v2/source-documents.json');
const products = new Map(catalog.products.map((row) => [row.canonicalProductId, row]));
const documents = new Map(sourceRegistry.documents.map((row) => [row.id, row]));

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
  bundles.push(createReviewBundle({ product, sourceDocument, rawExtraction, rawExtractionPath }));
}

const output = { schemaVersion: 1, generatedAt: pilot.generatedAt, bundles };
await writeFile(resolve(root, 'data/architecture-v2/evidence-review-bundles.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ bundles: bundles.length, fields: bundles.reduce((sum, row) => sum + row.fields.length, 0), rawExtractions: bundles.filter((row) => row.rawExtraction.available).length }));
