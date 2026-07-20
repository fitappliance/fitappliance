#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildRetailLifecycleRefreshInventory } from '../../src/domain/retail-lifecycle-refresh-inventory.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function buildRetailLifecycleRefreshInventoryFromRepository({
  root = defaultRoot,
  output = resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory'),
} = {}) {
  const [shadow, coverage, identityMigration] = await Promise.all([
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailLifecycleShadow')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerObservationCoverage')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerIdentityMigration')),
  ]);
  const inventory = buildRetailLifecycleRefreshInventory({
    shadow: shadow.document,
    shadowSha256: shadow.sha256,
    coverage: coverage.document,
    coverageSha256: coverage.sha256,
    identityMigration: identityMigration.document,
    identityMigrationSha256: identityMigration.sha256,
  });
  await atomicJson(output, inventory);
  return inventory;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(process.argv[2] ?? defaultRoot);
  const inventory = await buildRetailLifecycleRefreshInventoryFromRepository({ root });
  process.stdout.write(`${JSON.stringify({
    output: resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory'),
    inventoryId: inventory.inventoryId,
    summary: inventory.summary,
  }, null, 2)}\n`);
}
