#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  applyRetailerIdentityMigrationToLedger,
  buildRetailerIdentityMigration,
  rollForwardRetailerIdentityMigration,
  validateRetailerIdentityMigration,
} from '../../src/domain/retailer-identity-migration.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

function existingMigrationForCurrentEpoch({ existing, resolution, publicProjection, ledger }) {
  validateRetailerIdentityMigration(existing);
  if (existing.sourceBindings.publicProjectionSemanticSha256 !== canonicalSha256(publicProjection)) {
    throw new Error('retailer identity migration public projection epoch drift');
  }
  const existingResolutionSemantics = existing.schemaVersion >= 4
    ? existing.sourceBindings.resolutionEpochs.map((epoch) => epoch.semanticSha256)
    : [existing.sourceBindings.resolutionSemanticSha256];
  if (existingResolutionSemantics.includes(resolution.semanticSha256)) {
    if (ledger.semanticSha256 === existing.sourceBindings.retailerLedgerSemanticSha256) return existing;
    const replayed = applyRetailerIdentityMigrationToLedger({ ledger, migration: existing });
    if (replayed.semanticSha256 !== ledger.semanticSha256) {
      throw new Error('retailer identity migration ledger is neither the frozen baseline nor a complete replay');
    }
    return existing;
  }
  return rollForwardRetailerIdentityMigration({
    existingMigration: existing,
    resolution,
    publicProjection,
    ledger,
  });
}

export async function buildRetailerIdentityMigrationFromRepository({
  root = defaultRoot,
  output = resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
  resolutionInput = resolveArchitectureV2Path(root, 'retailerIdentityResolutions'),
  publicProjectionInput = resolveArchitectureV2Path(root, 'publicProjection'),
  ledgerInput = resolveArchitectureV2Path(root, 'retailerObservations'),
} = {}) {
  const [resolution, publicProjection, ledger, existing] = await Promise.all([
    readJson(resolutionInput),
    readJson(publicProjectionInput),
    readJson(ledgerInput),
    readOptionalJson(output),
  ]);
  const migration = existing
    ? existingMigrationForCurrentEpoch({ existing, resolution, publicProjection, ledger })
    : buildRetailerIdentityMigration({ resolution, publicProjection, ledger });
  if (!existing || existing.semanticSha256 !== migration.semanticSha256) {
    await atomicJson(output, migration);
  }
  return migration;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  const supported = new Set(['--root', '--output', '--resolution', '--projection', '--ledger']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'retailerIdentityMigration'));
  const migration = await buildRetailerIdentityMigrationFromRepository({
    root,
    output,
    resolutionInput: resolve(option(args, '--resolution')
      ?? resolveArchitectureV2Path(root, 'retailerIdentityResolutions')),
    publicProjectionInput: resolve(option(args, '--projection')
      ?? resolveArchitectureV2Path(root, 'publicProjection')),
    ledgerInput: resolve(option(args, '--ledger')
      ?? resolveArchitectureV2Path(root, 'retailerObservations')),
  });
  process.stdout.write(`${JSON.stringify({
    output,
    migrationId: migration.migrationId,
    summary: migration.summary,
  }, null, 2)}\n`);
  return migration;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
