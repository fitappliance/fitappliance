#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  sanitizeTrackedCatalog,
  sanitizeTrackedManualRetailers,
  sanitizeTrackedRetailerLedger,
} from '../../src/domain/private-retailer-evidence.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGETS = Object.freeze({
  catalog: 'data/catalog-final.json',
  manual: 'data/manual-retailers.json',
  ledger: 'data/architecture-v2/observations/retailer-observations.json',
});

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function parseArgs(args) {
  const supported = new Set(['--root', '--recovery-manifest', '--write']);
  for (let index = 0; index < args.length; index += 1) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
    if (args[index] !== '--write') index += 1;
  }
  return {
    root: resolve(option(args, '--root') ?? defaultRoot),
    recoveryManifest: option(args, '--recovery-manifest'),
    write: args.includes('--write'),
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function verifyRecoveryManifest(path) {
  if (!path) throw new Error('--write requires --recovery-manifest');
  const manifestPath = resolve(path);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.state !== 'PRIVATE_RECOVERY_ONLY'
    || !Array.isArray(manifest.paths)
    || !Object.values(TARGETS).every((target) => manifest.paths.includes(target))) {
    throw new Error('private recovery manifest does not cover all tracked source targets');
  }
  const archivePath = join(dirname(manifestPath), 'tracked-partnerize-data.tar');
  if (sha256(await readFile(archivePath)) !== manifest.archiveSha256) {
    throw new Error('private recovery archive hash mismatch');
  }
  return { manifestPath, archivePath, archiveSha256: manifest.archiveSha256 };
}

async function stageAndCommit(entries) {
  const staged = [];
  try {
    for (const [path, document] of entries) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
      staged.push([temporary, path]);
    }
    for (const [temporary, path] of staged) await rename(temporary, path);
  } catch (error) {
    await Promise.all(staged.map(([temporary]) => rm(temporary, { force: true })));
    throw error;
  }
}

export async function prunePrivateRetailerEvidence({
  root = defaultRoot,
  write = false,
  recoveryManifest = null,
} = {}) {
  const paths = Object.fromEntries(Object.entries(TARGETS).map(([key, path]) => [key, resolve(root, path)]));
  const [catalog, manual, ledger] = await Promise.all([
    readFile(paths.catalog, 'utf8').then(JSON.parse),
    readFile(paths.manual, 'utf8').then(JSON.parse),
    readFile(paths.ledger, 'utf8').then(JSON.parse),
  ]);
  const documents = {
    catalog: sanitizeTrackedCatalog(catalog),
    manual: sanitizeTrackedManualRetailers(manual),
    ledger: sanitizeTrackedRetailerLedger(ledger),
  };
  let recovery = null;
  if (write) {
    recovery = await verifyRecoveryManifest(recoveryManifest);
    await stageAndCommit(Object.entries(documents).map(([key, document]) => [paths[key], document]));
  }
  return {
    mode: write ? 'WRITTEN' : 'PREVIEW',
    recovery,
    catalog: {
      products: documents.catalog.products.length,
      activeProducts: documents.catalog.summary?.active_products ?? null,
      retailerRows: documents.catalog.products.reduce((sum, product) => sum + (product.retailers?.length ?? 0), 0),
    },
    manual: {
      entries: Object.keys(documents.manual.products).length,
      approvedEntries: documents.manual.approved_count,
      retailerRows: Object.values(documents.manual.products)
        .reduce((sum, entry) => sum + (entry.retailers?.length ?? 0), 0),
    },
    ledger: documents.ledger.summary,
  };
}

export async function runCli(args = process.argv.slice(2)) {
  const result = await prunePrivateRetailerEvidence(parseArgs(args));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
