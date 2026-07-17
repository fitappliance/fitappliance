#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildEvidenceProcessorEpochs,
  EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS,
} from '../../src/domain/evidence-processor-epoch.mjs';
import { historicalResolverContractSha256 } from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';
import { buildHistoricalExecutableRecoveryQueue } from '../../src/domain/historical-executable-recovery-queue.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { recoveryResolverContractForTarget } from './run-historical-evidence-recovery.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(key) {
  return JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
}

async function readOptionalJson(key, fallback) {
  try {
    return await readJson(key);
  } catch (error) {
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

export async function runCli() {
  const [acquisitionQueue, historicalReference, legacyRecoveryQueue, priorAcceptanceBundle,
    priorAttemptLedger, recoveryPolicy] = await Promise.all([
    readJson('historicalModelPdfAcquisitionQueue'),
    readJson('historicalApplianceReference'),
    readJson('historicalEvidenceRecoveryQueue'),
    readJson('historicalEvidenceRecoveryAcceptanceBundle'),
    readOptionalJson('historicalEvidenceRecoveryAttemptLedger', { schemaVersion: 1, entries: [] }),
    readJson('historicalEvidenceRecoveryPolicy'),
  ]);
  const processorPaths = [...new Set(Object.values(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS).flat())];
  const processorFiles = new Map(await Promise.all(processorPaths.map(async (path) => [
    path,
    await readFile(resolve(root, path)),
  ])));
  const evidenceProcessorEpochs = buildEvidenceProcessorEpochs(processorFiles);
  const queue = buildHistoricalExecutableRecoveryQueue({
    acquisitionQueue,
    historicalReference,
    legacyRecoveryQueue,
    priorAcceptanceBundle,
    priorAttemptLedger,
    recoveryPolicySha256: canonicalJsonSha256(recoveryPolicy),
    evidenceProcessorEpochs,
    resolverContractSha256ForTarget: (target) => historicalResolverContractSha256(
      recoveryResolverContractForTarget(target),
    ),
  });
  const output = resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue');
  await atomicJson(output, queue);
  process.stdout.write(`${JSON.stringify({ output, ...queue.summary }, null, 2)}\n`);
  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
