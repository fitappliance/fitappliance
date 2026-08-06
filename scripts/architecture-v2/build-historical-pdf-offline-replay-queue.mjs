#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { buildHistoricalPdfOfflineReplayQueue } from '../../src/domain/historical-pdf-offline-replay.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(root = repoRoot) {
  const [classification, activeRecovery, legacyPdfAudit,
    imageRepairAudit, priorAcceptanceBundle] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalModelEvidenceClassification')),
    loadHistoricalRecoveryActiveRelease({ root }),
    readJson(resolveArchitectureV2Path(root, 'legacyPdfLibraryAudit')),
    readJson(resolveArchitectureV2Path(root, 'historicalPdfImageRepairAudit')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
  ]);
  const queue = buildHistoricalPdfOfflineReplayQueue({
    classification,
    historicalReference: activeRecovery.reference,
    publicProjection: activeRecovery.catalog,
    legacyPdfAudit,
    imageRepairAudit,
    priorAcceptanceBundle,
  });
  const output = resolveArchitectureV2Path(root, 'historicalPdfOfflineReplayQueue');
  await atomicJson(output, queue);
  process.stdout.write(`${JSON.stringify({
    output,
    sha256: canonicalJsonSha256(queue),
    ...queue.summary,
  }, null, 2)}\n`);
  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
