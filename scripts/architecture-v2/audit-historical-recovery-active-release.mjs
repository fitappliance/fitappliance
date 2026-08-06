#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  assertHistoricalRecoveryActiveRelease,
  loadHistoricalRecoveryActiveRelease,
} from '../../src/domain/historical-recovery-active-release.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runHistoricalRecoveryActiveReleaseAudit({
  root = defaultRoot,
  write = true,
  beforeBounded = false,
} = {}) {
  const [view, generatedReference, classification, acceptanceBundle, acquisitionQueue, executableQueue,
    targetState, boundedBatches, scaleControl] = await Promise.all([
    loadHistoricalRecoveryActiveRelease({ root }),
    readJson(resolveArchitectureV2Path(root, 'historicalApplianceReference')),
    readJson(resolveArchitectureV2Path(root, 'historicalModelEvidenceClassification')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    readJson(resolveArchitectureV2Path(root, 'historicalModelPdfAcquisitionQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceTargetState')),
    beforeBounded
      ? Promise.resolve({ manifests: [] })
      : readJson(resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches')),
    beforeBounded
      ? Promise.resolve({ decision: { status: 'COMPLETE', allowedManifestId: null } })
      : readJson(resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
  ]);
  const audit = assertHistoricalRecoveryActiveRelease({
    view,
    generatedReference,
    classification,
    acceptanceBundle,
    acquisitionQueue,
    executableQueue,
    targetState,
    boundedBatches,
    scaleControl,
  });
  if (write) {
    await atomicJson(resolveArchitectureV2Path(root, 'historicalRecoveryActiveReleaseAudit'), audit);
  }
  return audit;
}

export async function runCli(args = process.argv.slice(2)) {
  if (args.some((argument) => argument !== '--before-bounded')) {
    throw new TypeError(`unknown argument: ${args.find((argument) => argument !== '--before-bounded')}`);
  }
  const audit = await runHistoricalRecoveryActiveReleaseAudit({
    beforeBounded: args.includes('--before-bounded'),
  });
  process.stdout.write(`${JSON.stringify({
    releaseCandidateId: audit.releaseCandidateId,
    ...audit.summary,
  }, null, 2)}\n`);
  return audit;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
