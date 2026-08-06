#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir, open, readFile, readdir, rename, stat, statfs, writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';
import { buildHistoricalModelPdfBaseline } from '../../src/domain/historical-model-evidence-classification.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const EVIDENCE_ROOTS = Object.freeze(['evidence/objects/sha256', 'evidence/web/sha256']);

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function listFiles(directory, predicate = () => true) {
  const paths = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`baseline inventory rejects symlink: ${join(current, entry.name)}`);
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && predicate(path)) paths.push(path);
    }
  }
  await walk(directory);
  return paths.sort();
}

function portablePath(storageRoot, path) {
  const value = relative(storageRoot, path).split(sep).join('/');
  if (!value || value === '..' || value.startsWith('../')) throw new Error('inventory path escaped storage root');
  return value;
}

async function mapLimit(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return output;
}

async function inspectPdf(path, storageRoot) {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, bytesRead).toString('utf8').trimStart().startsWith('%PDF-')) {
      return { invalid: { relativePath: portablePath(storageRoot, path), error: 'invalid PDF magic bytes' } };
    }
  } finally {
    await handle.close();
  }
  const stats = await stat(path);
  return {
    sourcePdfSha256: await fileSha256(path),
    byteSize: stats.size,
    relativePath: portablePath(storageRoot, path),
  };
}

async function inventoryPdfs(storageRoot) {
  const physicalPaths = (await Promise.all(EVIDENCE_ROOTS.map((path) => (
    listFiles(resolve(storageRoot, path), (file) => extname(file).toLowerCase() === '.pdf')
  )))).flat().sort();
  const inspected = await mapLimit(physicalPaths, 6, (path) => inspectPdf(path, storageRoot));
  const invalidFiles = inspected.filter((entry) => entry.invalid).map((entry) => entry.invalid);
  const byHash = new Map();
  for (const entry of inspected.filter((value) => !value.invalid)) {
    const current = byHash.get(entry.sourcePdfSha256) ?? {
      sourcePdfSha256: entry.sourcePdfSha256,
      byteSize: entry.byteSize,
      paths: [],
    };
    if (current.byteSize !== entry.byteSize) throw new Error(`PDF hash size mismatch: ${entry.sourcePdfSha256}`);
    current.paths.push(entry.relativePath);
    byHash.set(entry.sourcePdfSha256, current);
  }
  return {
    entries: [...byHash.values()].map((entry) => ({ ...entry, paths: entry.paths.sort() }))
      .sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256)),
    invalidFiles: invalidFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  };
}

async function inventoryMineruIndexes(storageRoot, policy) {
  const indexRoot = resolve(storageRoot, 'cache/mineru-index');
  const paths = await listFiles(indexRoot, (path) => extname(path).toLowerCase() === '.json');
  return Promise.all(paths.map(async (path) => {
    const filenameHash = basename(path, '.json').toLowerCase();
    try {
      const value = await readJson(path);
      const sourcePdfSha256 = String(value.sourcePdfSha256 ?? filenameHash).toLowerCase();
      const bound = sourcePdfSha256 === filenameHash
        && value.derivedArtifact?.sourcePdfSha256 === sourcePdfSha256;
      const current = value.parserVersion === policy.parserVersion
        && value.modelRevision === policy.modelRevision;
      return {
        sourcePdfSha256,
        status: bound ? (current ? 'indexed' : 'stale') : 'invalid_binding',
        parserVersion: value.parserVersion ?? null,
        modelRevision: value.modelRevision ?? null,
      };
    } catch {
      return {
        sourcePdfSha256: /^[a-f0-9]{64}$/.test(filenameHash) ? filenameHash : '0'.repeat(64),
        status: 'invalid_index',
        parserVersion: null,
        modelRevision: null,
      };
    }
  }));
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function main(args) {
  const storageRoot = resolve(option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!storageRoot || storageRoot === resolve('')) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  const outputPath = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'historicalModelPdfBaseline'));
  const generatedAt = option(args, '--generated-at') ?? new Date().toISOString();
  const activeRecovery = await loadHistoricalRecoveryActiveRelease({ root });
  const paths = {
    historicalReference: activeRecovery.paths.reference,
    sourceDocuments: resolveArchitectureV2Path(root, 'sourceDocuments'),
    acceptanceBundle: resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle'),
    publicProjection: activeRecovery.paths.catalog,
    historicalManifest: resolve(activeRecovery.paths.reference, '../historical-reference-publication-manifest.json'),
    dimensionExpressions: resolve(root, 'data/architecture-v2/generated/dimension-expression-observations.json'),
  };
  const [historicalReference, sourceDocumentArtifact, acceptanceBundle, publicProjection,
    historicalManifest, pdfInventory, storageMarker, storageStats] = await Promise.all([
    Promise.resolve(activeRecovery.reference),
    readJson(paths.sourceDocuments),
    readJson(paths.acceptanceBundle),
    Promise.resolve(activeRecovery.catalog),
    readJson(paths.historicalManifest),
    inventoryPdfs(storageRoot),
    readJson(resolve(storageRoot, '.fitappliance-storage-root.json')),
    statfs(storageRoot),
  ]);
  const policy = evidenceSourcePolicy.resolutionPolicy.pdfEvidence;
  const mineruIndexes = await inventoryMineruIndexes(storageRoot, policy);
  const legacyPaths = await listFiles(resolve(root, 'data/pdf-evidence-raw'), (path) => extname(path).toLowerCase() === '.json');
  const artifactHashes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await fileSha256(path)])));
  const historicalCount = Object.values(historicalManifest.files ?? {})
    .reduce((sum, entry) => sum + Number(entry.records ?? 0), 0);
  const baseline = buildHistoricalModelPdfBaseline({
    generatedAt,
    historicalReference,
    artifactHashes,
    legacySummaries: legacyPaths.map((path) => ({
      relativePath: relative(root, path).split(sep).join('/'),
      modelKey: basename(path, '.json'),
    })),
    sourceDocuments: sourceDocumentArtifact.documents ?? [],
    pdfInventory,
    mineruIndexes,
    acceptanceBundle,
    projections: {
      currentCount: (publicProjection.products ?? []).length,
      historicalCount,
      historicalFiles: Object.keys(historicalManifest.files ?? {}).length,
    },
    environment: {
      storageMarker: storageMarker.storageRole,
      volumeUuid: storageMarker.volumeUuid,
      freeBytes: Number(storageStats.bavail) * Number(storageStats.bsize),
      parserVersion: policy.parserVersion,
      modelRevision: policy.modelRevision,
    },
  });
  await atomicWrite(outputPath, baseline);
  process.stdout.write(`${JSON.stringify({
    output: relative(root, outputPath).split(sep).join('/'),
    semanticBaselineSha256: baseline.semanticBaselineSha256,
    summary: baseline.summary,
  }, null, 2)}\n`);
}

await main(process.argv.slice(2));
