#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceAcquisitionPlan } from '../../src/domain/evidence-acquisition-plan.mjs';
import { inspectDocumentPayload } from '../../src/domain/document-source-adapter.mjs';
import { classifyTransportHost } from '../../src/domain/source-provenance.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new Error(`absolute workspace path rejected: ${relativePath}`);
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new Error(`workspace path escapes storage root: ${relativePath}`);
  return candidate;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function pdfPageCount(path) {
  const { stdout } = await execFile('pdfinfo', [path]);
  const match = /^Pages:\s+(\d+)$/m.exec(stdout);
  if (!match) throw new Error('pdfinfo_page_count_missing');
  return Number(match[1]);
}

async function fetchWithRetry(sourceUrl, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(90000),
        headers: { 'user-agent': 'FitApplianceEvidenceBot/1.0 (+https://www.fitappliance.com.au/about/editorial-standards)' },
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 750));
    }
  }
  throw lastError;
}

async function acquireEntry(entry, storageRoot, retrievedAt) {
  if (entry.status === 'no_source') return { ...entry, outcome: 'no_source' };
  const workspaceBase = `review-workspaces/phase-10/source/${entry.legacyRuntimeId}`;
  const pdfRelativePath = `${workspaceBase}.pdf`;
  const textRelativePath = `${workspaceBase}.txt`;
  const pdfPath = resolveWithin(storageRoot, pdfRelativePath);
  const textPath = resolveWithin(storageRoot, textRelativePath);
  try {
    const { response, bytes } = await fetchWithRetry(entry.sourceUrl);
    const finalUrl = response.url;
    if (classifyTransportHost(finalUrl) !== 'manufacturer') throw new Error('redirected_outside_manufacturer_host');
    const contentType = response.headers.get('content-type') ?? '';
    const inspection = inspectDocumentPayload({ contentType, bytes });
    if (!inspection.accepted) throw new Error(inspection.reason);
    await mkdir(dirname(pdfPath), { recursive: true });
    const temporaryPdf = `${pdfPath}.tmp-${process.pid}`;
    const temporaryText = `${textPath}.tmp-${process.pid}`;
    try {
      await writeFile(temporaryPdf, bytes);
      const pageCount = await pdfPageCount(temporaryPdf);
      await execFile('pdftotext', ['-layout', temporaryPdf, temporaryText]);
      await rename(temporaryPdf, pdfPath);
      await rename(temporaryText, textPath);
      return {
        ...entry,
        outcome: 'acquired',
        finalUrl,
        contentType: contentType.split(';')[0].toLowerCase(),
        retrievedAt,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteSize: bytes.length,
        pageCount,
        textByteSize: (await stat(textPath)).size,
        parserVersion: 'pdftotext-26.06.0',
        identityOutcome: 'pending_visual_review',
        workspace: { pdf: pdfRelativePath, text: textRelativePath },
      };
    } finally {
      await rm(temporaryPdf, { force: true });
      await rm(temporaryText, { force: true });
    }
  } catch (error) {
    return { ...entry, outcome: 'failed', failureReason: String(error?.message ?? error) };
  }
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

async function main(args) {
  const rootIndex = args.indexOf('--storage-root');
  const storageRoot = rootIndex >= 0 ? args[rootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRoot) throw new TypeError('storage root required');
  const [batch, input] = await Promise.all([
    readJson(resolveArchitectureV2Path(repoRoot, 'phase10EvidenceBatch')),
    readJson(resolveArchitectureV2Path(repoRoot, 'phase10AcquisitionInput')),
  ]);
  const plan = buildEvidenceAcquisitionPlan(batch, input);
  const retrievedAt = `${input.reviewedAt}T00:00:00.000Z`;
  const entries = await mapLimit(plan.entries, 4, (entry) => acquireEntry(entry, storageRoot, retrievedAt));
  const summary = {
    entries: entries.length,
    acquired: entries.filter((row) => row.outcome === 'acquired').length,
    noSource: entries.filter((row) => row.outcome === 'no_source').length,
    failed: entries.filter((row) => row.outcome === 'failed').length,
  };
  const output = { schemaVersion: 1, acquiredAt: input.reviewedAt, entries, summary };
  await writeFile(resolveArchitectureV2Path(repoRoot, 'phase10Acquisition'), `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed > 0) process.exitCode = 1;
}

await main(process.argv.slice(2));
