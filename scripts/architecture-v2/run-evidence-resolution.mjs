#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { extractClaimsFromPdfText } from '../../src/domain/evidence-artifact-verifier.mjs';
import { runEvidenceResearchCycle } from '../../src/domain/evidence-research-runner.mjs';
import { adjudicateResolutionCase } from '../../src/domain/evidence-resolution-loop.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new TypeError('absolute evidence path rejected');
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new TypeError('evidence path escapes storage root');
  return candidate;
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function createObjectWriter(storageRoot, dryRun) {
  return async (relativePath, bytes) => {
    if (dryRun) return;
    const path = resolveWithin(storageRoot, relativePath);
    try {
      const existing = await readFile(path);
      const existingHash = createHash('sha256').update(existing).digest('hex');
      const incomingHash = createHash('sha256').update(bytes).digest('hex');
      if (existingHash !== incomingHash) throw new Error('content-addressed object collision');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await atomicWrite(path, bytes);
  };
}

async function extractPdfText(bytes) {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-evidence-'));
  const pdf = join(directory, 'source.pdf');
  const text = join(directory, 'source.txt');
  try {
    await writeFile(pdf, bytes);
    await execFile('pdftotext', ['-layout', pdf, text]);
    return await readFile(text, 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(args) {
  const dryRun = args.includes('--dry-run');
  const refresh = args.includes('--refresh');
  const retryTerminal = args.includes('--retry-terminal');
  const storageRoot = argument(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRoot) throw new TypeError('storage root required');
  const inputPath = resolve(argument(args, '--input') ?? resolveArchitectureV2Path(repoRoot, 'evidenceResolutionInput'));
  const document = JSON.parse(await readFile(inputPath, 'utf8'));
  if (document.schemaVersion !== 1 || !Array.isArray(document.cases)) throw new TypeError('resolution case document required');
  const writeObject = await createObjectWriter(storageRoot, dryRun);
  const now = new Date().toISOString();
  const cases = [];
  const outcomes = [];
  for (const current of document.cases) {
    const decision = adjudicateResolutionCase(current);
    if ((decision.status === 'resolved' && !refresh)
      || (decision.status === 'quarantined' && !retryTerminal)) {
      cases.push(current);
      outcomes.push({ caseId: current.id, outcome: 'skipped', status: decision.status });
      continue;
    }
    const result = await runEvidenceResearchCycle(current, {
      fetchImpl: fetch,
      now,
      writeObject,
      refresh: decision.status === 'resolved',
      sitemapUrls: current.discoverySitemapUrls ?? [],
      maximumSitemapDocuments: 12,
      fetchAttempts: 3,
      retryDelayMs: 750,
      extractPdfText,
      extractPdfClaims: (text, { caseRecord, fields }) => extractClaimsFromPdfText(text, {
        caseIdentity: { brand: caseRecord.brand, model: caseRecord.model, category: caseRecord.category },
        fields,
      }),
    });
    cases.push(result.caseRecord);
    outcomes.push({
      caseId: current.id,
      outcome: result.unchanged ? 'unchanged' : result.caseRecord.automationState,
      failures: result.failures.length,
    });
  }
  const output = { ...document, cases };
  if (!dryRun) await atomicWrite(inputPath, `${JSON.stringify(output, null, 2)}\n`);
  const summary = {
    cases: cases.length,
    dryRun,
    refreshed: outcomes.filter((row) => row.outcome === 'unchanged').length,
    advanced: outcomes.filter((row) => !['unchanged', 'skipped'].includes(row.outcome)).length,
    skipped: outcomes.filter((row) => row.outcome === 'skipped').length,
    outcomes,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main(process.argv.slice(2));
