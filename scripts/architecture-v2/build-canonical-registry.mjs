#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(await readFile(resolve(root, 'public/data/appliances.json'), 'utf8'));
const disposition = JSON.parse(await readFile(resolve(root, 'reports/architecture-v2/phase1-quarantine-disposition.json'), 'utf8'));
const result = buildCanonicalRegistry(catalog, {
  quarantineLegacyIds: disposition.products.map((row) => row.legacyId),
});
const output = resolve(root, 'data/architecture-v2/canonical-registry.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: catalog.last_updated ?? null, ...result })}\n`);
console.log(JSON.stringify({ products: result.products.length, mappings: result.identifierMappings.length, quarantine: result.quarantine.length }));
