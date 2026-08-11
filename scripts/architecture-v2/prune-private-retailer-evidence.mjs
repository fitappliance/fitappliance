#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as defaultFs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  sanitizeTrackedCatalog,
  sanitizeTrackedManualRetailers,
  sanitizeTrackedRetailerLedger,
} from '../../src/domain/private-retailer-evidence.mjs';
import { verifyPrivateRecoveryArtifacts } from './build-active-retail-privacy-successor.mjs';

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
  const verified = await verifyPrivateRecoveryArtifacts(path);
  const manifest = JSON.parse(verified.manifestBytes);
  if (manifest.schemaVersion !== 1 || manifest.state !== 'PRIVATE_RECOVERY_ONLY'
    || !Array.isArray(manifest.paths)
    || !Object.values(TARGETS).every((target) => manifest.paths.includes(target))) {
    throw new Error('private recovery manifest does not cover all tracked source targets');
  }
  return {
    manifestPath: verified.manifestPath,
    archivePath: verified.archivePath,
    archiveSha256: verified.archiveSha256,
  };
}

function documentBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

async function readRegularFileNoFollow(fs, path, { label = 'file', optional = false } = {}) {
  let handle;
  try {
    handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) {
      throw new TypeError(`${label} must be a regular non-symlink file`);
    }
    return await handle.readFile();
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    if (/regular non-symlink/i.test(error.message)) throw error;
    if (error.code === 'ELOOP' || error.code === 'EMLINK') {
      throw new TypeError(`${label} must be a regular non-symlink file`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function backupPathFor(journalPath, index, oldSha256) {
  return `${journalPath}.backup-${index}-${oldSha256}`;
}

function validateJournal(journal, intendedEntries, journalPath) {
  if (journal?.schemaVersion !== 2
    || journal.policyVersion !== 'private-retailer-evidence-transaction-v2'
    || !Array.isArray(journal.entries)
    || journal.entries.length !== intendedEntries.length) {
    throw new Error('private retailer evidence transaction journal invalid');
  }
  const seen = new Set();
  for (const [index, entry] of journal.entries.entries()) {
    const intended = intendedEntries[index];
    const expectedTempPath = `${intended.targetPath}.private-retailer-${intended.newSha256}.tmp`;
    const expectedBackupPath = backupPathFor(journalPath, index, entry.oldSha256);
    if (typeof entry?.targetPath !== 'string'
      || typeof entry.tempPath !== 'string'
      || typeof entry.backupPath !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.oldSha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(entry.newSha256 ?? '')
      || entry.targetPath !== intended.targetPath
      || entry.tempPath !== expectedTempPath
      || entry.backupPath !== expectedBackupPath
      || entry.newSha256 !== intended.newSha256
      || seen.has(entry.targetPath)) {
      throw new Error('private retailer evidence transaction journal binding mismatch');
    }
    seen.add(entry.targetPath);
  }
  return journal;
}

async function ensureBoundFile(fs, path, bytes, expectedSha256, label) {
  let existing = await readRegularFileNoFollow(fs, path, { label, optional: true });
  if (!existing) {
    await fs.writeFile(path, bytes, { flag: 'wx' });
    existing = await readRegularFileNoFollow(fs, path, { label });
  }
  if (sha256(existing) !== expectedSha256) throw new Error(`${label} drift: ${path}`);
}

async function targetState(fs, entry) {
  const bytes = await readRegularFileNoFollow(fs, entry.targetPath, {
    label: 'sanitized document target',
  });
  const hash = sha256(bytes);
  if (entry.oldSha256 === entry.newSha256 && hash === entry.oldSha256) return 'stable';
  if (hash === entry.oldSha256) return 'old';
  if (hash === entry.newSha256) return 'new';
  throw new Error(`sanitized document target drift: ${entry.targetPath}`);
}

async function restoreOldTarget(fs, entry) {
  if (['old', 'stable'].includes(await targetState(fs, entry))) return;
  const backupBytes = await readRegularFileNoFollow(fs, entry.backupPath, {
    label: 'sanitized document backup',
  });
  if (sha256(backupBytes) !== entry.oldSha256) {
    throw new Error(`sanitized document backup drift: ${entry.backupPath}`);
  }
  const rollbackPath = `${entry.targetPath}.private-retailer-rollback-${entry.oldSha256}.tmp`;
  await ensureBoundFile(
    fs,
    rollbackPath,
    backupBytes,
    entry.oldSha256,
    'sanitized document rollback temp',
  );
  await fs.rename(rollbackPath, entry.targetPath);
  if (await targetState(fs, entry) !== 'old') {
    throw new Error(`sanitized document rollback mismatch: ${entry.targetPath}`);
  }
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

  await fs.mkdir(dirname(resolvedJournalPath), { recursive: true });
  const existingJournalBytes = await readRegularFileNoFollow(fs, resolvedJournalPath, {
    label: 'private retailer evidence transaction journal',
    optional: true,
  });
  let journal;
  if (existingJournalBytes) {
    try {
      journal = validateJournal(JSON.parse(existingJournalBytes), intendedEntries, resolvedJournalPath);
    } catch (error) {
      if (/transaction journal/.test(error.message)) throw error;
      throw new Error('private retailer evidence transaction journal invalid');
    }
  } else {
    const createdTemps = [];
    const createdBackups = [];
    try {
      const journalEntries = [];
      for (const [index, entry] of intendedEntries.entries()) {
        await fs.mkdir(dirname(entry.targetPath), { recursive: true });
        const oldBytes = await readRegularFileNoFollow(fs, entry.targetPath, {
          label: 'sanitized document target',
        });
        const oldSha256 = sha256(oldBytes);
        const tempPath = `${entry.targetPath}.private-retailer-${entry.newSha256}.tmp`;
        const backupPath = backupPathFor(resolvedJournalPath, index, oldSha256);
        const existingTempBytes = await readRegularFileNoFollow(fs, tempPath, {
          label: 'sanitized document temp',
          optional: true,
        });
        if (!existingTempBytes) {
          await fs.writeFile(tempPath, entry.bytes, { flag: 'wx' });
          createdTemps.push(tempPath);
        }
        await ensureBoundFile(fs, tempPath, entry.bytes, entry.newSha256, 'sanitized document temp');
        const existingBackupBytes = await readRegularFileNoFollow(fs, backupPath, {
          label: 'sanitized document backup',
          optional: true,
        });
        if (!existingBackupBytes) {
          await fs.writeFile(backupPath, oldBytes, { flag: 'wx' });
          createdBackups.push(backupPath);
        }
        await ensureBoundFile(fs, backupPath, oldBytes, oldSha256, 'sanitized document backup');
        journalEntries.push({
          targetPath: entry.targetPath,
          tempPath,
          backupPath,
          oldSha256,
          newSha256: entry.newSha256,
        });
      }
      journal = {
        schemaVersion: 2,
        policyVersion: 'private-retailer-evidence-transaction-v2',
        entries: journalEntries,
      };
      await fs.writeFile(resolvedJournalPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' });
      await readRegularFileNoFollow(fs, resolvedJournalPath, {
        label: 'private retailer evidence transaction journal',
      });
    } catch (error) {
      await Promise.all([...createdTemps, ...createdBackups].map((path) => fs.rm(path, { force: true })));
      throw error;
    }
  }

  const states = await Promise.all(journal.entries.map((entry) => targetState(fs, entry)));
  if (states.every((state) => state === 'new' || state === 'stable')) {
    await Promise.all(journal.entries.flatMap((entry) => [entry.tempPath, entry.backupPath])
      .map((path) => fs.rm(path, { force: true })));
    await fs.rm(resolvedJournalPath);
    return;
  }
  if (states.some((state) => state === 'new')) {
    for (const entry of journal.entries) await restoreOldTarget(fs, entry);
  }
  for (const [index, entry] of journal.entries.entries()) {
    const intended = intendedEntries[index];
    const backupBytes = await readRegularFileNoFollow(fs, entry.backupPath, {
      label: 'sanitized document backup',
    });
    if (sha256(backupBytes) !== entry.oldSha256) {
      throw new Error(`sanitized document backup drift: ${entry.backupPath}`);
    }
    await ensureBoundFile(
      fs,
      entry.tempPath,
      intended.bytes,
      entry.newSha256,
      'sanitized document temp',
    );
  }

  try {
    for (const entry of journal.entries) {
      const state = await targetState(fs, entry);
      if (state === 'stable') continue;
      if (state !== 'old') {
        throw new Error(`sanitized document target drift: ${entry.targetPath}`);
      }
      const tempBytes = await readRegularFileNoFollow(fs, entry.tempPath, {
        label: 'sanitized document temp',
      });
      if (sha256(tempBytes) !== entry.newSha256) {
        throw new Error(`sanitized document temp drift: ${entry.tempPath}`);
      }
      await fs.rename(entry.tempPath, entry.targetPath);
      if (await targetState(fs, entry) !== 'new') {
        throw new Error(`sanitized document commit mismatch: ${entry.targetPath}`);
      }
    }
  } catch (error) {
    try {
      for (const entry of journal.entries) await restoreOldTarget(fs, entry);
      for (const [index, entry] of journal.entries.entries()) {
        await ensureBoundFile(
          fs,
          entry.tempPath,
          intendedEntries[index].bytes,
          entry.newSha256,
          'sanitized document temp',
        );
      }
    } catch (rollbackError) {
      throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`);
    }
    throw error;
  }

  for (const entry of journal.entries) {
    if (!['new', 'stable'].includes(await targetState(fs, entry))) {
      throw new Error(`sanitized document final verification failed: ${entry.targetPath}`);
    }
  }
  await Promise.all(journal.entries.flatMap((entry) => [entry.tempPath, entry.backupPath])
    .map((path) => fs.rm(path, { force: true })));
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
