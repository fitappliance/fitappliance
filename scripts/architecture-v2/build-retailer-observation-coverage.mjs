#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildRetailerObservationCoverage } from '../../src/domain/retailer-observation-coverage.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function validateArgs(args) {
  const supported = new Set(['--root', '--output', '--ledger']);
  for (let index = 0; index < args.length; index += 1) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
    index += 1;
  }
}

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
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

export async function buildRetailerObservationCoverageFromRepository({
  root = defaultRoot,
  output = resolveArchitectureV2Path(root, 'retailerObservationCoverage'),
  ledgerInput = resolveArchitectureV2Path(root, 'retailerObservations'),
} = {}) {
  const [publicProjection, ledger, sourcePolicy] = await Promise.all([
    readJsonWithHash(resolveArchitectureV2Path(root, 'publicProjection')),
    readJsonWithHash(ledgerInput),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
  ]);
  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger: ledger.document,
    ledgerSha256: ledger.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });
  await atomicJson(output, coverage);
  return coverage;
}

export async function runCli(args = process.argv.slice(2)) {
  validateArgs(args);
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'retailerObservationCoverage'));
  const ledgerInput = resolve(option(args, '--ledger') ?? resolveArchitectureV2Path(root, 'retailerObservations'));
  const coverage = await buildRetailerObservationCoverageFromRepository({ root, output, ledgerInput });
  process.stdout.write(`${JSON.stringify({ output, coverageId: coverage.coverageId, summary: coverage.summary }, null, 2)}\n`);
  return coverage;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
