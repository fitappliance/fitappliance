#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalMineruAudit,
  deduplicateHistoricalPdfs,
  selectHistoricalMineruBackfill,
} from '../../src/domain/historical-mineru-backfill.mjs';
import { inspectMineruPdfCache, runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const EVIDENCE_ROOTS = Object.freeze([
  'evidence/objects/sha256',
  'evidence/web/sha256',
]);

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

function portableRelativePath(storageRoot, path) {
  const value = relative(storageRoot, path).split(sep).join('/');
  if (!value || value === '..' || value.startsWith('../')) throw new Error('historical PDF escaped storage root');
  return value;
}

async function listPdfFiles(directory) {
  try {
    await access(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const paths = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`historical evidence symlink rejected: ${join(current, entry.name)}`);
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') paths.push(path);
    }
  }
  await walk(directory);
  return paths.sort();
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

  const physicalPaths = (await Promise.all(EVIDENCE_ROOTS.map((path) => listPdfFiles(resolve(storageRoot, path)))))
    .flat()
    .sort();
  const validRecords = [];
  const invalidFiles = [];
  for (const path of physicalPaths) {
    const relativePath = portableRelativePath(storageRoot, path);
    const pdfBytes = await readFile(path);
    try {
      deduplicateHistoricalPdfs([{ relativePath, pdfBytes }]);
      validRecords.push({ relativePath, pdfBytes });
    } catch (error) {
      invalidFiles.push({ relativePath, error: error.message });
    }
  }
  const documents = deduplicateHistoricalPdfs(validRecords);
  const pathByHash = new Map(documents.map((document) => [
    document.sourcePdfSha256,
    resolve(storageRoot, ...document.paths[0].split('/')),
  ]));
  const priorAttempts = await readPriorAttempts(auditPath);
  const attemptsByHash = new Map(priorAttempts.map((entry) => [entry.sourcePdfSha256, entry]));
  const cacheStatesByHash = new Map();
  for (const document of documents) {
    try {
      const state = await inspectMineruPdfCache(await readFile(pathByHash.get(document.sourcePdfSha256)), { storageRoot });
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
        const pdfBytes = await readFile(pathByHash.get(entry.sourcePdfSha256));
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
