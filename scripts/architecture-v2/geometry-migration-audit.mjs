#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateGeometry, auditImpossibleGeometry } from '../../src/domain/geometry-migration.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/public-catalog-projection.json'), 'utf8'));
const sourceRegistry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/source-documents.json'), 'utf8'));
const approvedEvidence = sourceRegistry.documents
  .filter((document) => document.state === 'approved')
  .flatMap((document) => document.productLinks.flatMap((link) => document.fields.map((field) => ({
    legacyRuntimeId: link.legacyRuntimeId, field: field.field, value: field.value,
    unit: field.unit, status: 'approved', sourceDocumentId: document.id,
  }))));
const evidenceByLegacy = new Map();
for (const evidence of approvedEvidence) {
  if (!evidenceByLegacy.has(evidence.legacyRuntimeId)) evidenceByLegacy.set(evidence.legacyRuntimeId, []);
  evidenceByLegacy.get(evidence.legacyRuntimeId).push(evidence);
}
const issues = [];
let installationEvidenceProducts = 0;
for (const product of catalog.products) {
  const migration = migrateGeometry({ legacyProduct: product, fieldEvidence: evidenceByLegacy.get(product.id) ?? [], estimates: {} });
  if (migration.provenance.installation === 'approved_field_evidence') installationEvidenceProducts += 1;
  for (const issue of auditImpossibleGeometry(migration.geometry)) issues.push({ legacyId: product.id, issue });
}
const report = {
  generatedAt: catalog.last_updated ?? null, products: catalog.products.length,
  approvedSourceDocuments: sourceRegistry.summary.approved,
  installationEvidenceProducts, unknownInstallationProducts: catalog.products.length - installationEvidenceProducts,
  impossibleValueIssues: issues.length, issueSamples: issues.slice(0, 100),
};
await writeFile(resolve(root, 'reports/architecture-v2/geometry-migration.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
