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
  shadowPath = resolveArchitectureV2Path(root, 'retailLifecycleShadow'),
  coveragePath = resolveArchitectureV2Path(root, 'retailerObservationCoverage'),
  identityMigrationPath = resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
  output = resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory'),
} = {}) {
  const [shadow, coverage, identityMigration] = await Promise.all([
    readJsonWithHash(shadowPath),
    readJsonWithHash(coveragePath),
    readJsonWithHash(identityMigrationPath),
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

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const supported = new Set(['--root', '--shadow', '--coverage', '--identity-migration', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown refresh inventory argument: ${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
      throw new TypeError(`${args[index]} requires a value`);
    }
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory'));
  const inventory = await buildRetailLifecycleRefreshInventoryFromRepository({
    root,
    shadowPath: resolve(option(args, '--shadow') ?? resolveArchitectureV2Path(root, 'retailLifecycleShadow')),
    coveragePath: resolve(option(args, '--coverage') ?? resolveArchitectureV2Path(root, 'retailerObservationCoverage')),
    identityMigrationPath: resolve(
      option(args, '--identity-migration') ?? resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
    ),
    output,
  });
  process.stdout.write(`${JSON.stringify({
    output,
    inventoryId: inventory.inventoryId,
    summary: inventory.summary,
  }, null, 2)}\n`);
}
