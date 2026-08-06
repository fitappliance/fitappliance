#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { createEvidenceObjectStore } from '../../src/domain/evidence-recovery-state-store.mjs';
import { auditHistoricalAcceptanceReceipts } from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

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

export function preserveEquivalentAuditGeneratedAt(report, priorReport) {
  if (!Array.isArray(priorReport?.outcomes)
    || priorReport.semanticAuditSha256 !== canonicalJsonSha256({
      sourceBundleSha256: priorReport.sourceBundleSha256,
      outcomes: priorReport.outcomes,
    })) return report;
  if (priorReport?.semanticAuditSha256 !== report.semanticAuditSha256) return report;
  const priorGeneratedAt = String(priorReport.generatedAt ?? '').trim();
  if (!Number.isFinite(Date.parse(priorGeneratedAt))) return report;
  return Object.freeze({ ...report, generatedAt: priorGeneratedAt });
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
  const explicitGeneratedAt = option(args, '--generated-at');
  const generatedAt = explicitGeneratedAt ?? new Date().toISOString();
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const objectStore = createEvidenceObjectStore(storageRoot);
  let report = await auditHistoricalAcceptanceReceipts({
    bundle,
    generatedAt,
    readObject: objectStore.readObject,
  });
  if (!explicitGeneratedAt) {
    try {
      const priorReport = JSON.parse(await readFile(outputPath, 'utf8'));
      report = preserveEquivalentAuditGeneratedAt(report, priorReport);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  await atomicJson(outputPath, report);
  process.stdout.write(`${JSON.stringify({ output: outputPath, ...report.summary }, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
