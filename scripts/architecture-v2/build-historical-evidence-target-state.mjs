#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalEvidenceTargetState } from '../../src/domain/historical-evidence-target-state.mjs';

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

function latestGeneratedAt(artifacts) {
  const values = artifacts
    .map((artifact) => new Date(artifact?.generatedAt).valueOf())
    .filter(Number.isFinite);
  if (!values.length) throw new TypeError('at least one target-state input generatedAt required');
  return new Date(Math.max(...values)).toISOString();
}

export async function runCli() {
  const [classification, acquisitionQueue, executableQueue, acceptanceBundle, attemptLedger] = await Promise.all([
    readJson('historicalModelEvidenceClassification'),
    readJson('historicalModelPdfAcquisitionQueue'),
    readJson('historicalExecutableEvidenceRecoveryQueue'),
    readJson('historicalEvidenceRecoveryAcceptanceBundle'),
    readJson('historicalEvidenceRecoveryAttemptLedger'),
  ]);
  const artifacts = [classification, acquisitionQueue, executableQueue, acceptanceBundle, attemptLedger];
  const state = buildHistoricalEvidenceTargetState({
    generatedAt: latestGeneratedAt(artifacts),
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
