#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { applyRetailerIdentityMigrationToCatalog } from '../../src/domain/retailer-identity-migration.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finalCatalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const disposition = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'phase1QuarantineDisposition'), 'utf8'));
const publicationQuarantine = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalPublicationQuarantine'), 'utf8'));
const identityDecisions = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalIdentityDecisions'), 'utf8'));
const resolutionManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceResolutionManifest'), 'utf8'));
const identityMigration = JSON.parse(await readFile(
  resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
  'utf8',
));
const quarantineEntries = [
  ...disposition.products.map((row) => ({
    legacyRuntimeId: row.legacyId,
    reason: `phase1_${row.disposition}`,
  })),
  ...publicationQuarantine.products.map((row) => ({
    legacyRuntimeId: row.legacyRuntimeId,
    reason: row.reason,
  })),
  ...resolutionManifest.activeQuarantines,
];
const migratedCatalog = applyRetailerIdentityMigrationToCatalog({
  catalog: finalCatalog,
  migration: identityMigration,
});
const registryOptions = {
  quarantineEntries,
  releaseGrants: resolutionManifest.releaseGrants,
  identityDecisions: identityDecisions.decisions,
};
const released = buildCanonicalRegistry(finalCatalog, registryOptions);
const candidate = buildCanonicalRegistry(migratedCatalog, {
  ...registryOptions,
  identityMigration,
});
const output = resolveArchitectureV2Path(root, 'canonicalRegistry');
const candidateOutput = resolveArchitectureV2Path(root, 'canonicalRegistryMigrationCandidate');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: finalCatalog.last_updated ?? null, ...released })}\n`);
await writeFile(candidateOutput, `${JSON.stringify({
  generatedAt: finalCatalog.last_updated ?? null,
  ...candidate,
})}\n`);
console.log(JSON.stringify({
  released: {
    products: released.products.length,
    mappings: released.identifierMappings.length,
    quarantine: released.quarantine.length,
  },
  migrationCandidate: {
    products: candidate.products.length,
    mappings: candidate.identifierMappings.length,
    quarantine: candidate.quarantine.length,
  },
}));
