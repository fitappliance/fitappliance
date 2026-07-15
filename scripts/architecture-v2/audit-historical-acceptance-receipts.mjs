#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { createEvidenceObjectStore } from '../../src/domain/evidence-recovery-state-store.mjs';
import { auditHistoricalAcceptanceReceipts } from '../../src/domain/historical-evidence-recovery-audit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  const storageRoot = resolve(option(args, '--storage-root')
    ?? process.env.FITAPPLIANCE_STORAGE_ROOT
    ?? '');
  if (!process.env.FITAPPLIANCE_STORAGE_ROOT && !option(args, '--storage-root')) {
    throw new Error('FITAPPLIANCE_STORAGE_ROOT or --storage-root required');
  }
  const bundlePath = resolve(option(args, '--bundle')
    ?? resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle'));
  const outputPath = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalAcceptanceReceiptReplayAudit'));
  const generatedAt = option(args, '--generated-at') ?? new Date().toISOString();
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const objectStore = createEvidenceObjectStore(storageRoot);
  const report = await auditHistoricalAcceptanceReceipts({
    bundle,
    generatedAt,
    readObject: objectStore.readObject,
  });
  await atomicJson(outputPath, report);
  process.stdout.write(`${JSON.stringify({ output: outputPath, ...report.summary }, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
