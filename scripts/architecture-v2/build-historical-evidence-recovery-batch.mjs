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
import { resolveHistoricalEvidenceBoundedManifest } from '../../src/domain/historical-evidence-bounded-batch.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export function parseHistoricalEvidenceRecoveryBatchCliArgs(argv) {
  let output = null;
  let manifestId = null;
  const selectionArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    if (!['--output', '--manifest-id'].includes(flag)) {
      selectionArgs.push(raw);
      continue;
    }
    const value = separator === -1 ? argv[++index] : raw.slice(separator + 1);
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new TypeError(`${flag} requires a value`);
    if (flag === '--output') {
      if (output !== null) throw new TypeError('--output may be provided only once');
      output = normalized;
    } else {
      if (manifestId !== null) throw new TypeError('--manifest-id may be provided only once');
      manifestId = normalized;
    }
  }
  if (manifestId !== null) {
    if (selectionArgs.length) throw new TypeError('mixed selector modes prohibited with --manifest-id');
    return { output, manifestId, selection: null };
  }
  if (output === null) throw new TypeError('--manifest-id required for tracked output');
  return {
    output,
    selection: parseHistoricalEvidenceRecoveryBatchArgs(selectionArgs),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const parsed = parseHistoricalEvidenceRecoveryBatchCliArgs(argv);
  const [queue, policy, cumulativeBundle, receiptReplayAudit, pdfBatch, pdfResults,
    rangeBatch, rangeResults] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryPolicy')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    readJson(resolveArchitectureV2Path(root, 'historicalAcceptanceReceiptReplayAudit')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceResults')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceBatch')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceResults')),
  ]);
  let selection = parsed.selection;
  let exactTargetIds = null;
  if (parsed.manifestId) {
    const [batches, targetState, familyCanaries, scaleControl] = await Promise.all([
      readJson(resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches')),
      readJson(resolveArchitectureV2Path(root, 'historicalEvidenceTargetState')),
      readJson(resolveArchitectureV2Path(root, 'historicalEvidenceFamilyCanaries')),
      readJson(resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
    ]);
    const requested = batches.manifests.find((row) => row.manifestId === parsed.manifestId);
    const manifest = resolveHistoricalEvidenceBoundedManifest({
      batches,
      manifestId: parsed.manifestId,
      expectedExecutionLane: 'ACQUISITION',
      executableQueue: queue,
      targetState,
      familyCanaries,
      scaleControl,
    });
    exactTargetIds = manifest.targetBindings.map((binding) => binding.targetId);
    selection = { targetIds: exactTargetIds };
  }
  const batch = buildHistoricalEvidenceRecoveryBatch({
    queue,
    policy,
    existingAcceptanceBundles: [
      cumulativeBundle,
      { batch: pdfBatch, results: pdfResults },
      { batch: rangeBatch, results: rangeResults },
    ],
    receiptReplayAudit,
    selection,
  });
  if (exactTargetIds) {
    const materialized = batch.targets.map((target) => target.targetId).sort();
    const expected = [...exactTargetIds].sort();
    if (JSON.stringify(materialized) !== JSON.stringify(expected)) {
      throw new Error('materialized target set differs from authorized manifest');
    }
  }
  const outputPath = parsed.output
    ? resolve(parsed.output)
    : resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryBatch');
  await atomicJson(outputPath, batch);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    sha256: canonicalJsonSha256(batch),
    ...batch.summary,
  }, null, 2)}\n`);
  return batch;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
