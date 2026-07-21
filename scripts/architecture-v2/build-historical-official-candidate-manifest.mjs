#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalOfficialCandidateManifest } from '../../src/domain/historical-official-candidate-manifest.mjs';
import { historicalOfficialResolverContracts } from './run-historical-official-candidate-discovery.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readOptionalJson(path, fallback) {
  try { return await readJson(path); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export function deriveHistoricalOfficialCandidateManifestGeneratedAt({
  acquisitionQueue,
  priorManifest,
} = {}) {
  const values = [
    acquisitionQueue?.generatedAt,
    ...(priorManifest?.targets ?? []).map((target) => target.lastDiscoveryAt),
    ...(priorManifest?.candidates ?? []).flatMap((candidate) => (
      candidate.discoveries ?? []
    ).map((discovery) => discovery.retrievedAt)),
  ];
  const timestamps = values.map((value) => new Date(value ?? '').valueOf()).filter(Number.isFinite);
  if (!timestamps.length) throw new TypeError('candidate manifest input timestamp required');
  return new Date(Math.max(...timestamps)).toISOString();
}

export async function runCli() {
  const acquisitionPath = resolveArchitectureV2Path(root, 'historicalModelPdfAcquisitionQueue');
  const output = resolveArchitectureV2Path(root, 'historicalOfficialCandidateManifest');
  const acquisitionQueue = await readJson(acquisitionPath);
  const priorManifest = await readOptionalJson(output, null);
  const manifest = buildHistoricalOfficialCandidateManifest({
    generatedAt: deriveHistoricalOfficialCandidateManifestGeneratedAt({
      acquisitionQueue,
      priorManifest,
    }),
    acquisitionQueue,
    priorManifest,
    discoveryRuns: [],
    resolverContractsByReference: historicalOfficialResolverContracts(acquisitionQueue),
  });
  await atomicJson(output, manifest);
  process.stdout.write(`${JSON.stringify({ output, ...manifest.summary }, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
