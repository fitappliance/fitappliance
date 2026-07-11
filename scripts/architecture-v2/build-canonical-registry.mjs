#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finalCatalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const disposition = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'phase1QuarantineDisposition'), 'utf8'));
const publicationQuarantine = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalPublicationQuarantine'), 'utf8'));
const identityDecisions = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalIdentityDecisions'), 'utf8'));
const resolutionManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceResolutionManifest'), 'utf8'));
const quarantineLegacyIds = [
  ...disposition.products.map((row) => row.legacyId),
  ...publicationQuarantine.products.map((row) => row.legacyRuntimeId),
];
const result = buildCanonicalRegistry(finalCatalog, {
  quarantineLegacyIds,
  releasedLegacyIds: resolutionManifest.releasedLegacyIds,
  identityDecisions: identityDecisions.decisions,
});
const output = resolveArchitectureV2Path(root, 'canonicalRegistry');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: finalCatalog.last_updated ?? null, ...result })}\n`);
console.log(JSON.stringify({ products: result.products.length, mappings: result.identifierMappings.length, quarantine: result.quarantine.length }));
