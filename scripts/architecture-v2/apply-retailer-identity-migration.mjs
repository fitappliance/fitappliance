#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { applyRetailerIdentityMigrationToLedger } from '../../src/domain/retailer-identity-migration.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function applyRetailerIdentityMigrationFromRepository({
  root = defaultRoot,
  migrationInput = resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
  ledgerInput = resolveArchitectureV2Path(root, 'retailerObservations'),
  output = ledgerInput,
} = {}) {
  const [migration, ledger] = await Promise.all([
    readJson(migrationInput),
    readJson(ledgerInput),
  ]);
  const migrated = applyRetailerIdentityMigrationToLedger({ ledger, migration });
  if (migrated.semanticSha256 !== ledger.semanticSha256 || output !== ledgerInput) {
    await atomicJson(output, migrated);
  }
  return migrated;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  const supported = new Set(['--root', '--migration', '--ledger', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const ledgerInput = resolve(option(args, '--ledger')
    ?? resolveArchitectureV2Path(root, 'retailerObservations'));
  const output = resolve(option(args, '--output') ?? ledgerInput);
  const ledger = await applyRetailerIdentityMigrationFromRepository({
    root,
    migrationInput: resolve(option(args, '--migration')
      ?? resolveArchitectureV2Path(root, 'retailerIdentityMigration')),
    ledgerInput,
    output,
  });
  process.stdout.write(`${JSON.stringify({
    output,
    semanticSha256: ledger.semanticSha256,
    summary: ledger.summary,
    identityResolutionEvents: ledger.identityResolutionEvents?.length ?? 0,
  }, null, 2)}\n`);
  return ledger;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
