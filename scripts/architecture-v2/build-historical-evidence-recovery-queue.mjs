#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalEvidenceRecoveryQueue } from '../../src/domain/historical-evidence-recovery.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const [sourceDocumentRegistry, historicalReference] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'sourceDocuments')),
    readJson(resolveArchitectureV2Path(root, 'historicalApplianceReference')),
  ]);
  const queue = buildHistoricalEvidenceRecoveryQueue({
    sourceDocuments: sourceDocumentRegistry.documents,
    historicalReference,
  });
  const outputPath = resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryQueue');
  await atomicJson(outputPath, queue);
  process.stdout.write(`${JSON.stringify({ output: outputPath, ...queue.summary }, null, 2)}\n`);
  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
