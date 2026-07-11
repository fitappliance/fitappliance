#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finalCatalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const disposition = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/phase1-quarantine-disposition.json'), 'utf8'));
const publicationQuarantine = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-publication-quarantine.json'), 'utf8'));
const identityDecisions = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-identity-decisions.json'), 'utf8'));
const quarantineLegacyIds = [
  ...disposition.products.map((row) => row.legacyId),
  ...publicationQuarantine.products.map((row) => row.legacyRuntimeId),
];
const result = buildCanonicalRegistry(finalCatalog, {
  quarantineLegacyIds,
  identityDecisions: identityDecisions.decisions,
});
const output = resolve(root, 'data/architecture-v2/canonical-registry.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: finalCatalog.last_updated ?? null, ...result })}\n`);
console.log(JSON.stringify({ products: result.products.length, mappings: result.identifierMappings.length, quarantine: result.quarantine.length }));
