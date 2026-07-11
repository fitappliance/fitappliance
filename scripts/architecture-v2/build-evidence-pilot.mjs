#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectEvidencePilot } from '../../src/domain/evidence-pilot.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/public-catalog-projection.json'), 'utf8'));
const sourceRegistry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/source-documents.json'), 'utf8'));
const categoryTargets = { fridge: 5, dishwasher: 5, dryer: 5, washing_machine: 5 };
const outputPath = resolve(root, 'data/architecture-v2/evidence-pilot.json');
let existing = null;
try { existing = JSON.parse(await readFile(outputPath, 'utf8')); } catch {}
if (existing?.frozen === true) {
  const productIds = new Set(catalog.products.map((row) => row.canonicalProductId));
  const documentIds = new Set(sourceRegistry.documents.map((row) => row.id));
  if (existing.products.length !== 20 || new Set(existing.products.map((row) => row.canonicalProductId)).size !== 20) {
    throw new TypeError('frozen evidence pilot must contain 20 unique products');
  }
  for (const row of existing.products) {
    if (!productIds.has(row.canonicalProductId)) throw new TypeError(`frozen pilot product missing: ${row.canonicalProductId}`);
    if (!documentIds.has(row.sourceDocumentId)) throw new TypeError(`frozen pilot document missing: ${row.sourceDocumentId}`);
  }
  console.log(JSON.stringify({ products: existing.products.length, frozen: true }));
  process.exit(0);
}
const products = selectEvidencePilot({
  products: catalog.products,
  sourceDocuments: sourceRegistry.documents,
  limit: 20,
  brandLimit: 3,
  categoryTargets,
});
const output = {
  schemaVersion: 1,
  frozen: false,
  generatedAt: catalog.last_updated ?? null,
  selectionPolicy: {
    limit: 20,
    brandLimit: 3,
    categoryTargets,
    requiredIdentityOutcome: 'exact',
    requiredRetailerLinks: 1,
    ranking: ['manufacturer_transport', 'retailer_count', 'priority_score', 'brand_model_id'],
  },
  products,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ products: products.length, categories: Object.groupBy(products, (row) => row.category) }, (_, value) => Array.isArray(value) ? value.length : value));
