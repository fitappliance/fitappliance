#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectEvidencePilot } from '../../src/domain/evidence-pilot.mjs';
import { buildLegacySourceDocuments } from '../../src/domain/source-document-seed.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(new URL('../..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const manual = JSON.parse(await readFile(resolve(root, 'data/manual-evidence.json'), 'utf8'));
const canonical = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalRegistry'), 'utf8'));
const canonicalByLegacy = new Map(canonical.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
const candidateProducts = catalog.products.map((row) => ({
  ...row,
  brand: brandCanon.canonicalizeBrand(row.brand),
  canonicalProductId: canonicalByLegacy.get(String(row.id).toLowerCase()),
}));
const sourceDocuments = buildLegacySourceDocuments({ manual, canonical });
const categoryTargets = { fridge: 5, dishwasher: 5, dryer: 5, washing_machine: 5 };
const outputPath = resolveArchitectureV2Path(root, 'phase08Selection');
let existing = null;
try { existing = JSON.parse(await readFile(outputPath, 'utf8')); } catch {}
if (existing?.frozen === true) {
  const productIds = new Set(candidateProducts.map((row) => row.canonicalProductId));
  const documentIds = new Set(sourceDocuments.map((row) => row.id));
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
const selectedProducts = selectEvidencePilot({
  products: candidateProducts,
  sourceDocuments,
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
  products: selectedProducts,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ products: selectedProducts.length, categories: Object.groupBy(selectedProducts, (row) => row.category) }, (_, value) => Array.isArray(value) ? value.length : value));
