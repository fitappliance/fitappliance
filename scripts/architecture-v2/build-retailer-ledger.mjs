#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildRetailerObservationLedger } from '../../src/domain/retailer-observation-ledger.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function validateArgs(args) {
  const supported = new Set(['--root', '--output', '--existing']);
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

async function readExisting(output, trackedInput) {
  try {
    return (await readJsonWithHash(output)).document;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return (await readJsonWithHash(trackedInput)).document;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function buildRetailerObservationLedgerFromRepository({
  root = defaultRoot,
  output = resolveArchitectureV2Path(root, 'retailerObservations'),
  existingInput = resolveArchitectureV2Path(root, 'retailerObservations'),
  typedSnapshots = [],
} = {}) {
  const existingLedger = await readExisting(output, existingInput);
  const [publicProjection, sourcePolicy] = await Promise.all([
    existingLedger.schemaVersion === 2
      ? Promise.resolve({ document: null, sha256: null })
      : readJsonWithHash(resolveArchitectureV2Path(root, 'publicProjection')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
  ]);
  const ledger = buildRetailerObservationLedger({
    existingLedger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots,
  });
  await atomicJson(output, ledger);
  return ledger;
}

export async function runCli(args = process.argv.slice(2)) {
  validateArgs(args);
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'retailerObservations'));
  const existingInput = resolve(option(args, '--existing') ?? resolveArchitectureV2Path(root, 'retailerObservations'));
  const ledger = await buildRetailerObservationLedgerFromRepository({ root, output, existingInput });
  process.stdout.write(`${JSON.stringify({ output, summary: ledger.summary }, null, 2)}\n`);
  return ledger;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
