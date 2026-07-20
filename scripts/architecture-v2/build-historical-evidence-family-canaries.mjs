#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildEvidenceProcessorEpochs,
  CLAIM_PARSER_IMPLEMENTATION_PATHS,
  claimParserImplementationIdentity,
} from '../../src/domain/evidence-processor-epoch.mjs';
import {
  buildHistoricalEvidenceFamilyCanaries,
  HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION,
} from '../../src/domain/historical-evidence-family-canary.mjs';

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
  const supported = new Set(['--output', '--generated-at']);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const flag = raw.split('=', 1)[0];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${raw}`);
    if (!raw.includes('=')) index += 1;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function latestTimestamp(values) {
  const valid = values.filter(Boolean).map((value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) throw new TypeError(`canary input timestamp invalid: ${value}`);
    return parsed;
  });
  if (!valid.length) throw new TypeError('canary generatedAt source required');
  return new Date(Math.max(...valid.map((value) => value.valueOf()))).toISOString();
}

export function deriveHistoricalEvidenceFamilyCanariesGeneratedAt({
  documentGraph,
  executableQueue,
  attemptLedger,
  previousCanaries,
} = {}) {
  return latestTimestamp([
    documentGraph?.generatedAt,
    executableQueue?.generatedAt,
    attemptLedger?.generatedAt,
    previousCanaries?.generatedAt,
  ]);
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function claimParserFiles() {
  return new Map(await Promise.all(CLAIM_PARSER_IMPLEMENTATION_PATHS.map(async (path) => [
    path,
    await readFile(resolve(root, path)),
  ])));
}

export async function runCli(args = process.argv.slice(2)) {
  validateArgs(args);
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalEvidenceFamilyCanaries'));
  const [documentGraph, executableQueue, policy, attemptLedger, previousCanaries, files] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalDocumentFamilyGraph')),
    readJson(resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryPolicy')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAttemptLedger')),
    readOptionalJson(output),
    claimParserFiles(),
  ]);
  const generatedAt = option(args, '--generated-at')
    ?? deriveHistoricalEvidenceFamilyCanariesGeneratedAt({
      documentGraph,
      executableQueue,
      attemptLedger,
      previousCanaries,
    });
  if (previousCanaries && ![1, HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION]
    .includes(previousCanaries.schemaVersion)) {
    throw new TypeError(`unsupported prior family canary schema: ${previousCanaries.schemaVersion}`);
  }
  const canaries = buildHistoricalEvidenceFamilyCanaries({
    generatedAt,
    documentGraph,
    executableQueue,
    policy,
    attemptLedger,
    parserContractSha256: claimParserImplementationIdentity(files),
    processorEpochs: buildEvidenceProcessorEpochs(files),
    previousCanaries: previousCanaries?.schemaVersion
      === HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION
      ? previousCanaries
      : null,
  });
  await atomicJson(output, canaries);
  process.stdout.write(`${JSON.stringify({
    output,
    semanticCanarySha256: canaries.semanticCanarySha256,
    summary: canaries.summary,
  }, null, 2)}\n`);
  return canaries;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
