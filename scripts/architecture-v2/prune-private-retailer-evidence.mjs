#!/usr/bin/env node

import { createHash } from 'node:crypto';
import * as defaultFs from 'node:fs/promises';
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
  const manifest = JSON.parse(await defaultFs.readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.state !== 'PRIVATE_RECOVERY_ONLY'
    || !Array.isArray(manifest.paths)
    || !Object.values(TARGETS).every((target) => manifest.paths.includes(target))) {
    throw new Error('private recovery manifest does not cover all tracked source targets');
  }
  const archivePath = join(dirname(manifestPath), 'tracked-partnerize-data.tar');
  if (sha256(await defaultFs.readFile(archivePath)) !== manifest.archiveSha256) {
    throw new Error('private recovery archive hash mismatch');
  }
  return { manifestPath, archivePath, archiveSha256: manifest.archiveSha256 };
}

function documentBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

async function readOptional(fs, path) {
  try {
    return await fs.readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateJournal(journal, intendedEntries) {
  if (journal?.schemaVersion !== 1
    || journal.policyVersion !== 'private-retailer-evidence-transaction-v1'
    || !Array.isArray(journal.entries)
    || journal.entries.length !== intendedEntries.length) {
    throw new Error('private retailer evidence transaction journal invalid');
  }
  const seen = new Set();
  for (const [index, entry] of journal.entries.entries()) {
    const intended = intendedEntries[index];
    const expectedTempPath = `${intended.targetPath}.private-retailer-${intended.newSha256}.tmp`;
    if (typeof entry?.targetPath !== 'string'
      || typeof entry.tempPath !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.oldSha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(entry.newSha256 ?? '')
      || entry.targetPath !== intended.targetPath
      || entry.tempPath !== expectedTempPath
      || entry.newSha256 !== intended.newSha256
      || seen.has(entry.targetPath)) {
      throw new Error('private retailer evidence transaction journal binding mismatch');
    }
    seen.add(entry.targetPath);
  }
  return journal;
}

export async function commitSanitizedDocuments(entries, { fs = defaultFs, journalPath } = {}) {
  if (!journalPath) throw new TypeError('journalPath required');
  const resolvedJournalPath = resolve(journalPath);
  const intendedEntries = entries.map(([path, document]) => {
    const targetPath = resolve(path);
    const bytes = documentBytes(document);
    return { targetPath, bytes, newSha256: sha256(bytes) };
  });
  if (new Set(intendedEntries.map(({ targetPath }) => targetPath)).size !== intendedEntries.length) {
    throw new TypeError('sanitized document target paths must be unique');
  }

  const existingJournalBytes = await readOptional(fs, resolvedJournalPath);
  let journal;
  if (existingJournalBytes) {
    try {
      journal = validateJournal(JSON.parse(existingJournalBytes), intendedEntries);
    } catch (error) {
      if (/transaction journal/.test(error.message)) throw error;
      throw new Error('private retailer evidence transaction journal invalid');
    }
  } else {
    const createdTemps = [];
    try {
      const journalEntries = [];
      for (const entry of intendedEntries) {
        await fs.mkdir(dirname(entry.targetPath), { recursive: true });
        const oldBytes = await fs.readFile(entry.targetPath);
        const tempPath = `${entry.targetPath}.private-retailer-${entry.newSha256}.tmp`;
        const existingTempBytes = await readOptional(fs, tempPath);
        if (existingTempBytes) {
          if (sha256(existingTempBytes) !== entry.newSha256) {
            throw new Error(`sanitized document temp drift: ${tempPath}`);
          }
        } else {
          await fs.writeFile(tempPath, entry.bytes, { flag: 'wx' });
          createdTemps.push(tempPath);
        }
        journalEntries.push({
          targetPath: entry.targetPath,
          tempPath,
          oldSha256: sha256(oldBytes),
          newSha256: entry.newSha256,
        });
      }
      journal = {
        schemaVersion: 1,
        policyVersion: 'private-retailer-evidence-transaction-v1',
        entries: journalEntries,
      };
      await fs.mkdir(dirname(resolvedJournalPath), { recursive: true });
      await fs.writeFile(resolvedJournalPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' });
    } catch (error) {
      await Promise.all(createdTemps.map((path) => fs.rm(path, { force: true })));
      throw error;
    }
  }

  for (const entry of journal.entries) {
    const targetHash = sha256(await fs.readFile(entry.targetPath));
    const tempBytes = await readOptional(fs, entry.tempPath);
    if (targetHash === entry.newSha256) {
      if (tempBytes && sha256(tempBytes) !== entry.newSha256) {
        throw new Error(`sanitized document temp drift: ${entry.tempPath}`);
      }
      if (tempBytes) await fs.rm(entry.tempPath, { force: true });
      continue;
    }
    if (targetHash !== entry.oldSha256) {
      throw new Error(`sanitized document target drift: ${entry.targetPath}`);
    }
    if (!tempBytes || sha256(tempBytes) !== entry.newSha256) {
      throw new Error(`sanitized document temp drift: ${entry.tempPath}`);
    }
    await fs.rename(entry.tempPath, entry.targetPath);
    if (sha256(await fs.readFile(entry.targetPath)) !== entry.newSha256) {
      throw new Error(`sanitized document commit mismatch: ${entry.targetPath}`);
    }
  }

  for (const entry of journal.entries) {
    if (sha256(await fs.readFile(entry.targetPath)) !== entry.newSha256) {
      throw new Error(`sanitized document final verification failed: ${entry.targetPath}`);
    }
  }
  await fs.rm(resolvedJournalPath);
}

export async function prunePrivateRetailerEvidence({
  root = defaultRoot,
  write = false,
  recoveryManifest = null,
} = {}) {
  const paths = Object.fromEntries(Object.entries(TARGETS).map(([key, path]) => [key, resolve(root, path)]));
  const [catalog, manual, ledger] = await Promise.all([
    defaultFs.readFile(paths.catalog, 'utf8').then(JSON.parse),
    defaultFs.readFile(paths.manual, 'utf8').then(JSON.parse),
    defaultFs.readFile(paths.ledger, 'utf8').then(JSON.parse),
  ]);
  let documents = {
    catalog: sanitizeTrackedCatalog(catalog),
    manual: sanitizeTrackedManualRetailers(manual),
    ledger: sanitizeTrackedRetailerLedger(ledger),
  };
  let recovery = null;
  if (write) {
    recovery = await verifyRecoveryManifest(recoveryManifest);
    await commitSanitizedDocuments(
      Object.entries(documents).map(([key, document]) => [paths[key], document]),
      {
        fs: defaultFs,
        journalPath: join(dirname(recovery.manifestPath), 'private-retailer-evidence-transaction.json'),
      },
    );
    const [finalCatalog, finalManual, finalLedger] = await Promise.all([
      defaultFs.readFile(paths.catalog, 'utf8').then(JSON.parse),
      defaultFs.readFile(paths.manual, 'utf8').then(JSON.parse),
      defaultFs.readFile(paths.ledger, 'utf8').then(JSON.parse),
    ]);
    documents = { catalog: finalCatalog, manual: finalManual, ledger: finalLedger };
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
