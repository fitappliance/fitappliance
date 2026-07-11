#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublicProjection } from '../../src/domain/public-projection.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(new URL('../..', import.meta.url).pathname);
const registry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-registry.json'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const quarantined = new Set(registry.quarantine.map((row) => row.legacyRuntimeId));
const filtered = {
  ...catalog,
  products: catalog.products
    .filter((row) => !quarantined.has(String(row.id).toLowerCase()))
    .map((row) => ({ ...row, brand: brandCanon.canonicalizeBrand(row.brand) })),
};
const projection = buildPublicProjection(registry, filtered);
await writeFile(resolve(root, 'data/architecture-v2/public-catalog-projection.json'), `${JSON.stringify(projection)}\n`);
console.log(JSON.stringify({ products: projection.products.length, quarantined: registry.quarantine.length }));
