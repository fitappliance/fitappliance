#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalEvidenceTargetState } from '../../src/domain/historical-evidence-target-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readArtifact(key) {
  const bytes = await readFile(resolveArchitectureV2Path(root, key));
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

function latestGeneratedAt(artifacts) {
  const values = artifacts
    .map((artifact) => new Date(artifact?.generatedAt).valueOf())
    .filter(Number.isFinite);
  if (!values.length) throw new TypeError('at least one target-state input generatedAt required');
  return new Date(Math.max(...values)).toISOString();
}

export async function runCli() {
  const [classificationSource, acquisitionSource, executableSource, acceptanceSource, ledgerSource] = await Promise.all([
    readArtifact('historicalModelEvidenceClassification'),
    readArtifact('historicalModelPdfAcquisitionQueue'),
    readArtifact('historicalExecutableEvidenceRecoveryQueue'),
    readArtifact('historicalEvidenceRecoveryAcceptanceBundle'),
    readArtifact('historicalEvidenceRecoveryAttemptLedger'),
  ]);
  const classification = classificationSource.document;
  const acquisitionQueue = acquisitionSource.document;
  const executableQueue = executableSource.document;
  const acceptanceBundle = acceptanceSource.document;
  const attemptLedger = ledgerSource.document;
  const artifacts = [classification, acquisitionQueue, executableQueue, acceptanceBundle, attemptLedger];
  const state = buildHistoricalEvidenceTargetState({
    generatedAt: latestGeneratedAt(artifacts),
    sourceBindings: {
      classificationSha256: classificationSource.sha256,
      acquisitionQueueSha256: acquisitionSource.sha256,
      executableQueueSha256: executableSource.sha256,
      acceptanceBundleSha256: acceptanceSource.sha256,
      attemptLedgerSha256: ledgerSource.sha256,
    },
    classification,
    acquisitionQueue,
    executableQueue,
    acceptanceBundle,
    attemptLedger,
  });
  const output = resolveArchitectureV2Path(root, 'historicalEvidenceTargetState');
  await atomicJson(output, state);
  process.stdout.write(`${JSON.stringify({ output, ...state.summary }, null, 2)}\n`);
  return state;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
