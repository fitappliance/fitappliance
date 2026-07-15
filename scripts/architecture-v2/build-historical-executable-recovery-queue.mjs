#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalExecutableRecoveryQueue } from '../../src/domain/historical-executable-recovery-queue.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(key) {
  return JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli() {
  const [acquisitionQueue, historicalReference, legacyRecoveryQueue, priorAcceptanceBundle] = await Promise.all([
    readJson('historicalModelPdfAcquisitionQueue'),
    readJson('historicalApplianceReference'),
    readJson('historicalEvidenceRecoveryQueue'),
    readJson('historicalEvidenceRecoveryAcceptanceBundle'),
  ]);
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue, historicalReference, legacyRecoveryQueue, priorAcceptanceBundle,
  });
  const output = resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue');
  await atomicJson(output, queue);
  process.stdout.write(`${JSON.stringify({ output, ...queue.summary }, null, 2)}\n`);
  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
