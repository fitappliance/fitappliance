#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalEvidenceRecoveryBatch } from '../../src/domain/historical-evidence-recovery-batch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

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
  const [
    queue, policy, priorAcceptanceBundle,
    pdfBatch, pdfResults, identityBatch, identityResults,
  ] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalPdfOfflineReplayQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryPolicy')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceResults')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceResults')),
  ]);
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy,
    existingAcceptanceBundles: [
      priorAcceptanceBundle,
      { batch: pdfBatch, results: pdfResults },
      { batch: identityBatch, results: identityResults },
    ],
    selection: {},
  });
  const output = resolveArchitectureV2Path(root, 'historicalPdfOfflineReplayBatch');
  await atomicJson(output, batch);
  process.stdout.write(`${JSON.stringify({
    output,
    sha256: canonicalJsonSha256(batch),
    ...batch.summary,
  }, null, 2)}\n`);
  return batch;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
