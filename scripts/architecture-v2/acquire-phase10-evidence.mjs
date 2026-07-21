#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceAcquisitionPlan } from '../../src/domain/evidence-acquisition-plan.mjs';
import { inspectDocumentPayload } from '../../src/domain/document-source-adapter.mjs';
import { classifyTransportHost } from '../../src/domain/source-provenance.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { runMineruPdfWithImageFallback } from '../../src/domain/mineru-runner.mjs';
import { inspectMineruContentListV2 } from '../../src/domain/mineru-document.mjs';

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

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function writeImmutable(path, bytes) {
  const incomingHash = createHash('sha256').update(bytes).digest('hex');
  try {
    const existing = await readFile(path);
    if (createHash('sha256').update(existing).digest('hex') !== incomingHash) {
      throw new Error('content-addressed MinerU object collision');
    }
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await atomicWrite(path, bytes);
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
  const jsonRelativePath = `${workspaceBase}.content_list_v2.json`;
  const textRelativePath = `${workspaceBase}.mineru.txt`;
  const pdfPath = resolveWithin(storageRoot, pdfRelativePath);
  const jsonPath = resolveWithin(storageRoot, jsonRelativePath);
  const textPath = resolveWithin(storageRoot, textRelativePath);
  try {
    const { response, bytes } = await fetchWithRetry(entry.sourceUrl);
    const finalUrl = response.url;
    if (classifyTransportHost(finalUrl) !== 'manufacturer') throw new Error('redirected_outside_manufacturer_host');
    const contentType = response.headers.get('content-type') ?? '';
    const payloadInspection = inspectDocumentPayload({ contentType, bytes });
    if (!payloadInspection.accepted) throw new Error(payloadInspection.reason);
    const processed = await runMineruPdfWithImageFallback(bytes, { storageRoot });
    const mineruInspection = inspectMineruContentListV2(processed.jsonBytes);
    const compatibilityText = Buffer.from(mineruInspection.pages.map((page) => page.fragments
      .map((fragment) => fragment.rawText)
      .filter(Boolean)
      .join('\n')).join('\f'));
    const pdfSha256 = createHash('sha256').update(bytes).digest('hex');
    if (processed.derivedArtifact.sourcePdfSha256 !== pdfSha256) throw new Error('MinerU source PDF binding mismatch');
    await atomicWrite(pdfPath, bytes);
    await atomicWrite(jsonPath, processed.jsonBytes);
    await atomicWrite(textPath, compatibilityText);
    await writeImmutable(resolveWithin(storageRoot, processed.derivedArtifact.objectPath), processed.jsonBytes);
    return {
      ...entry,
      outcome: 'acquired',
      finalUrl,
      contentType: contentType.split(';')[0].toLowerCase(),
      retrievedAt,
      sha256: pdfSha256,
      byteSize: bytes.length,
      pageCount: processed.derivedArtifact.pageCount,
      jsonByteSize: processed.jsonBytes.length,
      textByteSize: compatibilityText.length,
      parserVersion: `MinerU-${processed.derivedArtifact.parserVersion}`,
      derivedArtifact: processed.derivedArtifact,
      identityOutcome: 'pending_machine_review',
      workspace: { pdf: pdfRelativePath, json: jsonRelativePath, text: textRelativePath },
    };
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
  const entries = await mapLimit(plan.entries, 1, (entry) => acquireEntry(entry, storageRoot, retrievedAt));
  const summary = {
    entries: entries.length,
    acquired: entries.filter((row) => row.outcome === 'acquired').length,
    noSource: entries.filter((row) => row.outcome === 'no_source').length,
    failed: entries.filter((row) => row.outcome === 'failed').length,
  };
  const output = { schemaVersion: 2, extractionFormat: 'mineru_content_list_v2', acquiredAt: input.reviewedAt, entries, summary };
  await writeFile(resolveArchitectureV2Path(repoRoot, 'phase10Acquisition'), `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed > 0) process.exitCode = 1;
}

await main(process.argv.slice(2));
