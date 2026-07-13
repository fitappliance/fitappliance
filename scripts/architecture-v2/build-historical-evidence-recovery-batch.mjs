#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalEvidenceRecoveryBatch,
  parseHistoricalEvidenceRecoveryBatchArgs,
} from '../../src/domain/historical-evidence-recovery-batch.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(argv = process.argv.slice(2)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const selection = parseHistoricalEvidenceRecoveryBatchArgs(argv);
  const [queue, policy, pdfBatch, pdfResults, rangeBatch, rangeResults] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryPolicy')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceResults')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceResults')),
  ]);
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy,
    existingAcceptanceBundles: [
      { batch: pdfBatch, results: pdfResults },
      { batch: rangeBatch, results: rangeResults },
    ],
    selection,
  });
  const outputPath = resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryBatch');
  await atomicJson(outputPath, batch);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    sha256: canonicalJsonSha256(batch),
    ...batch.summary,
  }, null, 2)}\n`);
  return batch;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
