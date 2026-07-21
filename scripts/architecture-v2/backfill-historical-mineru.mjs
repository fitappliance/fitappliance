#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalMineruAudit,
  selectHistoricalMineruBackfill,
  validateHistoricalPdfInventoryDocument,
} from '../../src/domain/historical-mineru-backfill.mjs';
import { inspectMineruPdfCache, runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function integerArgument(args, name, fallback) {
  const raw = argument(args, name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

async function readPriorAttempts(auditPath) {
  try {
    const previous = JSON.parse(await readFile(auditPath, 'utf8'));
    return (previous.entries ?? []).map((entry) => ({
      sourcePdfSha256: entry.sourcePdfSha256,
      status: entry.status,
      attempts: entry.attempts ?? 0,
      lastError: entry.lastError,
      lastAttemptedAt: entry.lastAttemptedAt,
    }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`historical MinerU audit cannot be resumed: ${error.message}`);
  }
}

async function writeAudit(path, audit) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
}

function updateAttempt(attemptsByHash, entry, result, attemptedAt) {
  const previous = attemptsByHash.get(entry.sourcePdfSha256) ?? { attempts: 0 };
  attemptsByHash.set(entry.sourcePdfSha256, {
    sourcePdfSha256: entry.sourcePdfSha256,
    status: result.status,
    attempts: previous.attempts + 1,
    ...(result.error ? { lastError: result.error } : {}),
    lastAttemptedAt: attemptedAt,
  });
}

function reportDigest(audit) {
  return createHash('sha256').update(JSON.stringify(audit.entries)).digest('hex');
}

function resolveStoragePath(storageRoot, relativePath) {
  const path = resolve(storageRoot, ...String(relativePath ?? '').split('/'));
  if (!path.startsWith(`${storageRoot}${sep}`)) throw new Error('historical PDF escaped storage root');
  return path;
}

async function readFrozenDocument(storageRoot, document) {
  const missing = [];
  for (const relativePath of document.paths) {
    try {
      const bytes = await readFile(resolveStoragePath(storageRoot, relativePath));
      return { bytes, document: validateHistoricalPdfInventoryDocument(document, bytes), relativePath };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing.push(relativePath);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`all frozen PDF paths are missing: ${missing.join(', ')}`);
}

async function main(args) {
  const configuredRoot = argument(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!configuredRoot) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT is required');
  const storageRoot = resolve(configuredRoot);
  const rootStats = await stat(storageRoot);
  if (!rootStats.isDirectory()) throw new TypeError('storage root must be a directory');
  const auditPath = resolve(argument(args, '--output') ?? resolveArchitectureV2Path(root, 'historicalMineruBackfillAudit'));
  const auditOnly = args.includes('--audit-only');
  const limit = integerArgument(args, '--limit', Number.MAX_SAFE_INTEGER);
  const maximumAttempts = integerArgument(args, '--maximum-attempts', 3);
  const targetHash = argument(args, '--sha256');
  const policy = evidenceSourcePolicy.resolutionPolicy.pdfEvidence;
  const baselinePath = resolve(argument(args, '--baseline')
    ?? resolveArchitectureV2Path(root, 'historicalModelPdfBaseline'));
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const documents = baseline?.semantic?.pdfDocuments;
  const invalidFiles = baseline?.semantic?.invalidPdfFiles;
  if (!Array.isArray(documents) || !Array.isArray(invalidFiles)) {
    throw new Error('historical model PDF baseline inventory required');
  }
  const priorAttempts = await readPriorAttempts(auditPath);
  const attemptsByHash = new Map(priorAttempts.map((entry) => [entry.sourcePdfSha256, entry]));
  const cacheStatesByHash = new Map();
  for (const document of documents) {
    try {
      const frozen = await readFrozenDocument(storageRoot, document);
      const state = await inspectMineruPdfCache(frozen.bytes, { storageRoot });
      cacheStatesByHash.set(document.sourcePdfSha256, state);
    } catch (error) {
      cacheStatesByHash.set(document.sourcePdfSha256, {
        sourcePdfSha256: document.sourcePdfSha256,
        status: 'failed',
      });
      const previous = attemptsByHash.get(document.sourcePdfSha256) ?? { attempts: 0 };
      attemptsByHash.set(document.sourcePdfSha256, {
        ...previous,
        sourcePdfSha256: document.sourcePdfSha256,
        status: 'failed',
        lastError: `cache inspection: ${error.message}`,
      });
    }
  }

  const buildAudit = () => buildHistoricalMineruAudit({
    documents,
    cacheStates: [...cacheStatesByHash.values()],
    attempts: [...attemptsByHash.values()],
    invalidFiles,
    generatedAt: new Date().toISOString(),
    parserVersion: policy.parserVersion,
    modelRevision: policy.modelRevision,
  });
  let audit = buildAudit();
  await writeAudit(auditPath, audit);
  if (!auditOnly) {
    const selected = selectHistoricalMineruBackfill(audit.entries, {
      limit,
      maximumAttempts,
      ...(targetHash ? { sha256: targetHash } : {}),
    });
    for (const entry of selected) {
      const attemptedAt = new Date().toISOString();
      try {
        const frozen = await readFrozenDocument(storageRoot, entry);
        const pdfBytes = frozen.bytes;
        const result = await runMineruPdfToJson(pdfBytes, { storageRoot });
        const state = await inspectMineruPdfCache(pdfBytes, { storageRoot });
        cacheStatesByHash.set(entry.sourcePdfSha256, state);
        updateAttempt(attemptsByHash, entry, { status: 'indexed' }, attemptedAt);
        process.stdout.write(`${JSON.stringify({ sourcePdfSha256: entry.sourcePdfSha256, status: 'indexed', pages: result.derivedArtifact.pageCount })}\n`);
      } catch (error) {
        cacheStatesByHash.set(entry.sourcePdfSha256, { sourcePdfSha256: entry.sourcePdfSha256, status: 'failed' });
        updateAttempt(attemptsByHash, entry, { status: 'failed', error: error.message }, attemptedAt);
        process.stderr.write(`${JSON.stringify({ sourcePdfSha256: entry.sourcePdfSha256, status: 'failed', error: error.message })}\n`);
      }
      audit = buildAudit();
      await writeAudit(auditPath, audit);
    }
  }

  audit = buildAudit();
  await writeAudit(auditPath, audit);
  process.stdout.write(`${JSON.stringify({
    summary: audit.summary,
    reportSha256: reportDigest(audit),
    auditPath: relative(root, auditPath).split(sep).join('/'),
  }, null, 2)}\n`);
  if (audit.summary.failed > 0 || audit.summary.invalidFiles > 0) process.exitCode = 1;
}

await main(process.argv.slice(2));
