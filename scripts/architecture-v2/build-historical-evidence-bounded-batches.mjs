#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalEvidenceBoundedBatches,
  HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_MANIFESTS_PER_WORKSTREAM,
  HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS,
} from '../../src/domain/historical-evidence-bounded-batch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const matches = args.flatMap((raw, index) => {
    if (raw === name) return [{ value: args[index + 1], consumesNext: true }];
    if (raw.startsWith(`${name}=`)) return [{ value: raw.slice(name.length + 1), consumesNext: false }];
    return [];
  });
  if (matches.length > 1) throw new TypeError(`${name} may be provided only once`);
  if (!matches.length) return null;
  const value = String(matches[0].value ?? '').trim();
  if (!value || (matches[0].consumesNext && value.startsWith('--'))) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}

function validateArgs(args) {
  const supported = new Set([
    '--output',
    '--maximum-targets',
    '--maximum-manifests-per-workstream',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const flag = raw.split('=', 1)[0];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${raw}`);
    if (!raw.includes('=')) index += 1;
  }
}

async function readJson(key) {
  return JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  validateArgs(args);
  const maximumTargetsValue = option(args, '--maximum-targets');
  const maximumTargets = maximumTargetsValue === null
    ? HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_TARGETS
    : Number(maximumTargetsValue);
  const maximumManifestsValue = option(args, '--maximum-manifests-per-workstream');
  const maximumManifestsPerWorkstream = maximumManifestsValue === null
    ? HISTORICAL_EVIDENCE_BOUNDED_BATCH_MAXIMUM_MANIFESTS_PER_WORKSTREAM
    : Number(maximumManifestsValue);
  const [executableQueue, targetState, familyCanaries] = await Promise.all([
    readJson('historicalExecutableEvidenceRecoveryQueue'),
    readJson('historicalEvidenceTargetState'),
    readJson('historicalEvidenceFamilyCanaries'),
  ]);
  const batches = buildHistoricalEvidenceBoundedBatches({
    executableQueue,
    targetState,
    familyCanaries,
    maximumTargets,
    maximumManifestsPerWorkstream,
  });
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches'));
  await atomicJson(output, batches);
  process.stdout.write(`${JSON.stringify({
    output,
    semanticBatchesSha256: batches.semanticBatchesSha256,
    manifestWindow: batches.manifestWindow,
    summary: batches.summary,
    workstreams: batches.workstreams,
  }, null, 2)}\n`);
  return batches;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
