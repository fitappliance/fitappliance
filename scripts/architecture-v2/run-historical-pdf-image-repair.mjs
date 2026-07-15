#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { selectHistoricalPdfImageRepairs } from '../../src/domain/historical-pdf-image-repair.mjs';
import { runMineruPdfWithImageFallback } from '../../src/domain/mineru-runner.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function values(args, name) {
  const results = [];
  args.forEach((value, index) => {
    if (value === name && args[index + 1]) results.push(args[index + 1]);
  });
  return results;
}

function within(rootPath, portablePath) {
  if (!portablePath || isAbsolute(portablePath) || portablePath.split('/').includes('..')) {
    throw new Error(`unsafe PDF inventory path: ${portablePath ?? 'missing'}`);
  }
  const candidate = resolve(rootPath, portablePath);
  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${sep}`)) {
    throw new Error(`PDF inventory path escaped storage root: ${portablePath}`);
  }
  return candidate;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedError(error) {
  const message = String(error?.stack ?? error?.message ?? error);
  if (message.length <= 4096) return message;
  return `${message.slice(0, 2040)}\n...[truncated]...\n${message.slice(-2040)}`;
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
  const queue = JSON.parse(await readFile(
    resolveArchitectureV2Path(root, 'historicalPdfImageRepairQueue'),
    'utf8',
  ));
  const runId = option(args, '--run-id')
    ?? `historical-pdf-image-repair-${new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'z')}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) throw new TypeError('safe run ID required');
  const repairClasses = values(args, '--repair-class');
  const pdfHashes = values(args, '--sha256');
  const selected = selectHistoricalPdfImageRepairs(queue, {
    ...(repairClasses.length ? { repairClasses } : {}),
    priority: option(args, '--priority'),
    ...(pdfHashes.length ? { sha256s: pdfHashes } : {}),
    limit: Number(option(args, '--limit') ?? 10),
  });
  const outcomes = [];
  for (const document of selected) {
    const startedAt = new Date().toISOString();
    try {
      let pdfBytes = null;
      let sourcePath = null;
      for (const portablePath of document.paths) {
        try {
          const candidate = within(storageRoot, portablePath);
          const bytes = await readFile(candidate);
          if (sha256(bytes) !== document.sourcePdfSha256) continue;
          pdfBytes = bytes;
          sourcePath = portablePath;
          break;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      if (!pdfBytes) throw new Error(`no hash-valid PDF object for ${document.sourcePdfSha256}`);
      const result = await runMineruPdfWithImageFallback(pdfBytes, { storageRoot });
      if (!result.usedImageFallback || result.derivedArtifact.profileId !== 'hybrid-image-high-v1') {
        throw new Error('image repair target did not produce the required hybrid profile');
      }
      if (JSON.stringify(result.derivedArtifact.processedPages)
        !== JSON.stringify(document.primaryScan.imageOnlyDimensionPages)) {
        throw new Error('hybrid processed pages drifted from the frozen repair queue');
      }
      outcomes.push({
        sourcePdfSha256: document.sourcePdfSha256,
        status: 'completed',
        startedAt,
        completedAt: new Date().toISOString(),
        sourcePath,
        referenceIds: [...document.referenceIds],
        processedPages: [...result.derivedArtifact.processedPages],
        primaryContentSha256: result.primaryDerivedArtifact.contentSha256,
        hybridContentSha256: result.derivedArtifact.contentSha256,
        hybridObjectPath: result.derivedArtifact.objectPath,
      });
    } catch (error) {
      outcomes.push({
        sourcePdfSha256: document.sourcePdfSha256,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        referenceIds: [...document.referenceIds],
        error: boundedError(error),
      });
    }
  }
  const report = {
    schemaVersion: 1,
    runId,
    sourceQueueSha256: queue.semanticQueueSha256,
    generatedAt: new Date().toISOString(),
    policy: {
      publicationEligible: false,
      exactModelOnlyByDefault: true,
      requiresSubsequentReceiptReplayAndCorroboration: true,
    },
    summary: {
      selected: selected.length,
      completed: outcomes.filter((outcome) => outcome.status === 'completed').length,
      failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
      processedPages: outcomes.reduce((sum, outcome) => sum + (outcome.processedPages?.length ?? 0), 0),
    },
    outcomes,
  };
  const outputPath = resolve(option(args, '--output')
    ?? resolve(storageRoot, `runs/historical-pdf-image-repair/${runId}.json`));
  await atomicWrite(outputPath, report);
  process.stdout.write(`${JSON.stringify({
    output: relative(storageRoot, outputPath).split(sep).join('/'),
    ...report.summary,
  }, null, 2)}\n`);
  if (report.summary.failed) process.exitCode = 1;
}

await main(process.argv.slice(2));
