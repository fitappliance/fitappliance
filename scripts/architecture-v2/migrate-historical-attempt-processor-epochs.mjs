#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { historicalAttemptProcessorCapability } from '../../src/domain/evidence-processor-epoch.mjs';
import {
  migrateHistoricalAttemptLedgerProcessorEpochs,
} from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const options = { storageRoot: null, ledger: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--write') { options.write = true; continue; }
    const [flag, inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, null];
    if (!['--storage-root', '--ledger'].includes(flag)) throw new TypeError(`unknown argument: ${raw}`);
    const value = inline ?? argv[++index];
    if (!value) throw new TypeError(`${flag} requires a value`);
    options[flag === '--storage-root' ? 'storageRoot' : 'ledger'] = value;
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function durableWrite(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, path);
}

export async function runCli(options) {
  const storageRoot = resolve(options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!storageRoot || storageRoot === resolve('')) throw new Error('FITAPPLIANCE_STORAGE_ROOT required');
  const ledgerPath = resolve(options.ledger
    ?? resolveArchitectureV2Path(repoRoot, 'historicalEvidenceRecoveryAttemptLedger'));
  const ledger = await readJson(ledgerPath);
  const runIds = [...new Set((ledger.entries ?? [])
    .filter((entry) => historicalAttemptProcessorCapability(entry)
      && (!entry.processorCapability || !entry.evidenceProcessorSha256))
    .map((entry) => entry.runId))].sort();
  const runStates = new Map();
  const missingRunStates = [];
  for (const runId of runIds) {
    try {
      runStates.set(runId, await readJson(join(
        storageRoot, 'runs/historical-evidence-recovery', runId, 'state.json',
      )));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missingRunStates.push(runId);
    }
  }
  const migrated = migrateHistoricalAttemptLedgerProcessorEpochs({
    ledger,
    runStates,
    migratedAt: new Date().toISOString(),
  });
  if (options.write) await durableWrite(ledgerPath, migrated);
  return {
    ledgerPath,
    write: options.write,
    runStatesLoaded: runStates.size,
    missingRunStates,
    migration: migrated.processorEpochMigration ?? null,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await runCli(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
