#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as defaultFs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  applyRetailLifecycleRefreshRun,
  validateRetailLifecycleRefreshRun,
} from '../../src/domain/retail-lifecycle-refresh-execution.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';

const execFile = promisify(execFileCallback);
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function safeRunId(value) {
  const result = required(value, 'retailer refresh run ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) throw new TypeError('retailer refresh run ID is unsafe');
  return result;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJsonWithHash(fs, path) {
  const bytes = await fs.readFile(path);
  return { document: JSON.parse(bytes), sha256: hash(bytes) };
}

async function durableAtomicJson(fs, path, document) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, path);
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the retailer refresh storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report the retailer refresh volume UUID');
  return value;
}

export async function applyRetailLifecycleRefreshRunFromRepository(options, dependencies = {}) {
  const fs = dependencies.fs ?? defaultFs;
  const root = resolve(options.root ?? defaultRoot);
  const storageRoot = resolve(required(options.storageRoot, 'retailer refresh storage root'));
  const runId = safeRunId(options.runId);
  const storageIdentity = dependencies.storageIdentity ?? await verifyEvidenceStorageRoot(storageRoot, {
    fs,
    getVolumeUuid: dependencies.getVolumeUuid ?? mountedVolumeUuid,
  });
  const runPath = resolve(
    options.runPath ?? join(storageIdentity.root, 'runs', 'retail-lifecycle-refresh', runId, 'run.json'),
  );
  const output = resolve(options.output ?? resolveArchitectureV2Path(root, 'retailerObservations'));
  const [runSource, existingLedger, projection, inventory, policy] = await Promise.all([
    readJsonWithHash(fs, runPath),
    readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailerObservations')),
    readJsonWithHash(fs, resolveArchitectureV2Path(root, 'publicProjection')),
    readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory')),
    readJsonWithHash(fs, resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
  ]);
  const run = validateRetailLifecycleRefreshRun(runSource.document);
  if (run.runId !== runId) throw new Error('retailer refresh run ID does not match requested run');
  const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root, { fs });
  const ledger = await applyRetailLifecycleRefreshRun({
    run,
    existingLedger: existingLedger.document,
    publicProjection: projection.document,
    publicProjectionSha256: projection.sha256,
    inventorySha256: inventory.sha256,
    inventorySemanticSha256: inventory.document.semanticSha256,
    sourcePolicy: policy.document,
    sourcePolicySha256: policy.sha256,
    readObject: objectStore.readObject,
  });
  await durableAtomicJson(fs, output, ledger);
  return { ledger, output, runSha256: runSource.sha256 };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export function parseArgs(args) {
  const supported = new Set(['--root', '--storage-root', '--run-id', '--run', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  return {
    root: option(args, '--root') ?? defaultRoot,
    storageRoot: option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT,
    runId: option(args, '--run-id'),
    runPath: option(args, '--run'),
    output: option(args, '--output'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyRetailLifecycleRefreshRunFromRepository(parseArgs(process.argv.slice(2)))
    .then(({ ledger, output, runSha256 }) => {
      process.stdout.write(`${JSON.stringify({ output, runSha256, summary: ledger.summary }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
