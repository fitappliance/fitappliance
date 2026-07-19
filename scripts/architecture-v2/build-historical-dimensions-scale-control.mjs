#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalDimensionsScaleControl,
  canonicalHistoricalDimensionsScaleCounters,
} from '../../src/domain/historical-dimensions-scale-control.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const matches = [];
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (raw === name) matches.push(args[index + 1]);
    else if (raw.startsWith(`${name}=`)) matches.push(raw.slice(name.length + 1));
  }
  if (matches.length > 1) throw new TypeError(`${name} may be provided only once`);
  if (!matches.length) return null;
  const value = String(matches[0] ?? '').trim();
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function parseArgs(args) {
  const supported = new Set(['--output', '--ledger', '--generated-at', '--initialize-ledger']);
  let initializeLedger = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index].split('=', 1)[0];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${args[index]}`);
    if (flag === '--initialize-ledger') initializeLedger = true;
    else if (!args[index].includes('=')) index += 1;
  }
  return {
    initializeLedger,
    output: resolve(option(args, '--output')
      ?? resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
    ledger: resolve(option(args, '--ledger')
      ?? resolveArchitectureV2Path(root, 'historicalDimensionsScaleLedger')),
    generatedAt: option(args, '--generated-at'),
  };
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
  const options = parseArgs(args);
  const [nextBatches, programStatus, receiptAudit, replacementAudit, fitPublicationAudit] = await Promise.all([
    readJson('historicalEvidenceNextBatches'),
    readJson('historicalEvidenceProgramStatus'),
    readJson('historicalAcceptanceReceiptReplayAudit'),
    readJson('historicalReplacementAudit'),
    readJson('fitPublicationAudit'),
  ]);
  const shared = {
    nextBatches, programStatus, receiptAudit, replacementAudit, fitPublicationAudit,
  };
  let ledger;
  if (options.initializeLedger) {
    try {
      await readFile(options.ledger, 'utf8');
      throw new Error('dimensions scale ledger already exists');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const activatedAt = options.generatedAt ?? programStatus.generatedAt ?? nextBatches.generatedAt;
    ledger = {
      schemaVersion: 1,
      ledgerId: 'historical-dimensions-scale-v1',
      activatedAt,
      policy: { minimumYieldBasisPoints: 5_000, consecutiveLowYieldBatches: 2 },
      baseline: { counters: canonicalHistoricalDimensionsScaleCounters(shared) },
      entries: [],
    };
    await atomicJson(options.ledger, ledger);
  } else {
    ledger = JSON.parse(await readFile(options.ledger, 'utf8'));
  }
  const control = buildHistoricalDimensionsScaleControl({
    ...shared,
    ledger,
    generatedAt: options.generatedAt ?? programStatus.generatedAt ?? nextBatches.generatedAt,
  });
  await atomicJson(options.output, control);
  process.stdout.write(`${JSON.stringify({
    output: options.output,
    ledger: options.ledger,
    controlId: control.controlId,
    counters: control.counters,
    decision: control.decision,
    projection: control.projection,
  }, null, 2)}\n`);
  return control;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
