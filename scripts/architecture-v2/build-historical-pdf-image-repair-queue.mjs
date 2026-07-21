#!/usr/bin/env node

import { readFile, readdir, rename, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalPdfImageRepairQueue } from '../../src/domain/historical-pdf-image-repair.mjs';
import { findMineruImageOnlyDimensionPages } from '../../src/domain/mineru-document.mjs';
import { currentMineruEvidenceProfile } from '../../src/domain/evidence-source-verifier.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listFiles(directory) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`repair queue rejects symlink: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') files.push(path);
    }
  }
  await walk(directory);
  return files.sort();
}

async function mapLimit(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
}

function samePages(left, right) {
  return JSON.stringify([...(left ?? [])].sort((a, b) => a - b))
    === JSON.stringify([...(right ?? [])].sort((a, b) => a - b));
}

async function scanPrimary(storageRoot, document) {
  const indexPath = resolve(storageRoot, `cache/mineru-index/${document.sourcePdfSha256}.json`);
  let index;
  try {
    index = await readJson(indexPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`invalid primary MinerU index ${document.sourcePdfSha256}: ${error.message}`);
  }
  const artifact = index.derivedArtifact;
  let status = 'current';
  try {
    const profile = currentMineruEvidenceProfile(artifact);
    if (profile.role !== 'primary' || index.sourcePdfSha256 !== document.sourcePdfSha256
      || artifact.sourcePdfSha256 !== document.sourcePdfSha256) status = 'stale';
  } catch {
    status = 'stale';
  }
  const jsonBytes = await readFile(resolve(storageRoot, artifact.objectPath));
  return {
    sourcePdfSha256: document.sourcePdfSha256,
    status,
    pageCount: artifact.pageCount,
    derivedContentSha256: artifact.contentSha256,
    imageOnlyDimensionPages: findMineruImageOnlyDimensionPages(jsonBytes),
  };
}

async function currentHybridIndex(storageRoot, document, primaryScan) {
  if (!primaryScan?.imageOnlyDimensionPages.length) return null;
  const paths = await listFiles(resolve(
    storageRoot,
    `cache/mineru-index-v2/${document.sourcePdfSha256}/hybrid-image-high-v1`,
  ));
  const matching = [];
  for (const path of paths) {
    let index;
    try { index = await readJson(path); } catch { continue; }
    const artifact = index.derivedArtifact;
    try {
      const profile = currentMineruEvidenceProfile(artifact);
      if (profile.role !== 'image_dimension_fallback'
        || index.sourcePdfSha256 !== document.sourcePdfSha256
        || artifact.sourcePdfSha256 !== document.sourcePdfSha256
        || artifact.fallbackTrigger.contentSha256 !== primaryScan.derivedContentSha256
        || !samePages(artifact.processedPages, primaryScan.imageOnlyDimensionPages)
        || !samePages(artifact.fallbackTrigger.pages, primaryScan.imageOnlyDimensionPages)) continue;
      matching.push({
        sourcePdfSha256: document.sourcePdfSha256,
        status: 'current',
        profileId: artifact.profileId,
        processedPages: [...artifact.processedPages],
        derivedContentSha256: artifact.contentSha256,
      });
    } catch {
      // Invalid or stale profile caches remain ignored and are regenerated from the primary trigger.
    }
  }
  const unique = new Map(matching.map((index) => [index.derivedContentSha256, index]));
  if (unique.size > 1) {
    throw new Error(`multiple current hybrid outputs for ${document.sourcePdfSha256}`);
  }
  return [...unique.values()][0] ?? null;
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function main(args) {
  const storageRootValue = option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRootValue) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  const storageRoot = resolve(storageRootValue);
  const outputPath = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalPdfImageRepairQueue'));
  const [classification, historicalReference, baseline] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalModelEvidenceClassification')),
    readJson(resolveArchitectureV2Path(root, 'historicalApplianceReference')),
    readJson(resolveArchitectureV2Path(root, 'historicalModelPdfBaseline')),
  ]);
  const pdfDocuments = baseline.semantic?.pdfDocuments ?? [];
  const primaryValues = await mapLimit(pdfDocuments, 8, (document) => scanPrimary(storageRoot, document));
  const primaryScans = primaryValues.filter(Boolean);
  const hybridValues = await mapLimit(pdfDocuments, 4, (document, index) => (
    currentHybridIndex(storageRoot, document, primaryValues[index])
  ));
  const queue = buildHistoricalPdfImageRepairQueue({
    classification,
    historicalReference,
    pdfDocuments,
    primaryScans,
    hybridIndexes: hybridValues.filter(Boolean),
    generatedAt: option(args, '--generated-at') ?? new Date().toISOString(),
  });
  await atomicWrite(outputPath, queue);
  process.stdout.write(`${JSON.stringify({
    output: relative(root, outputPath).split(sep).join('/'),
    semanticQueueSha256: queue.semanticQueueSha256,
    summary: queue.summary,
  }, null, 2)}\n`);
}

await main(process.argv.slice(2));
