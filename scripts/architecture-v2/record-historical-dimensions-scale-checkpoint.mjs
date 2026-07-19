#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  recordHistoricalDimensionsScaleCheckpoint,
} from '../../src/domain/historical-dimensions-scale-control.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HASH = /^[a-f0-9]{64}$/;

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

export function parseHistoricalDimensionsScaleCheckpointArgs(args) {
  const options = {
    stage: null,
    runId: null,
    storageRoot: null,
    audit: null,
    ledger: resolveArchitectureV2Path(root, 'historicalDimensionsScaleLedger'),
    control: resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl'),
    generatedAt: null,
  };
  const keys = new Map([
    ['--stage', 'stage'],
    ['--run-id', 'runId'],
    ['--storage-root', 'storageRoot'],
    ['--audit', 'audit'],
    ['--ledger', 'ledger'],
    ['--control', 'control'],
    ['--generated-at', 'generatedAt'],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const separator = raw.indexOf('=');
    const flag = separator < 0 ? raw : raw.slice(0, separator);
    const key = keys.get(flag);
    if (!key) throw new TypeError(`unknown argument: ${raw}`);
    const value = requiredText(
      separator < 0 ? args[++index] : raw.slice(separator + 1),
      flag,
    );
    options[key] = value;
  }
  options.stage = requiredText(options.stage, '--stage').toUpperCase();
  if (!['DISCOVERY', 'DIMENSIONS'].includes(options.stage)) {
    throw new TypeError('--stage must be discovery or dimensions');
  }
  options.runId = requiredText(options.runId, '--run-id');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.runId)) {
    throw new TypeError('--run-id invalid');
  }
  options.storageRoot = resolve(requiredText(
    options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT,
    '--storage-root or FITAPPLIANCE_STORAGE_ROOT',
  ));
  options.ledger = resolve(options.ledger);
  options.control = resolve(options.control);
  if (options.audit) options.audit = resolve(options.audit);
  if (options.stage === 'DISCOVERY' && options.audit) {
    throw new TypeError('--audit is only valid for dimensions checkpoints');
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the storage device');
  const { stdout } = await execFile('diskutil', ['info', device], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report a mounted volume UUID');
  return value;
}

function discoveryObjectPath(hash) {
  return `evidence/discovery/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
}

async function loadDiscoveryRun(objectStore, storageIdentity, runId) {
  const pointerPath = `evidence/discovery/runs/${runId}.json`;
  const pointer = JSON.parse((await objectStore.readObject(pointerPath)).toString('utf8'));
  if (pointer?.schemaVersion !== 1 || pointer.runId !== runId
    || pointer.markerSha256 !== storageIdentity.markerSha256
    || !HASH.test(String(pointer.contentSha256 ?? ''))
    || !Number.isInteger(pointer.byteSize) || pointer.byteSize < 1
    || pointer.objectPath !== discoveryObjectPath(pointer.contentSha256)) {
    throw new Error(`discovery run pointer invalid: ${runId}`);
  }
  const bytes = Buffer.from(await objectStore.readObject(pointer.objectPath));
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== pointer.byteSize || contentSha256 !== pointer.contentSha256) {
    throw new Error(`discovery run object binding mismatch: ${runId}`);
  }
  const run = JSON.parse(bytes.toString('utf8'));
  if (run?.schemaVersion !== 1 || run.runId !== runId) {
    throw new Error(`discovery run payload invalid: ${runId}`);
  }
  return {
    run,
    manifest: run.boundedManifest,
    audit: null,
    storageContentSha256: pointer.contentSha256,
  };
}

async function loadDimensionsRun(storageRoot, runId, auditPath) {
  const runDirectory = join(storageRoot, 'runs/historical-evidence-recovery', runId);
  const [run, manifest, audit] = await Promise.all([
    readJson(join(runDirectory, 'results.json')),
    readJson(join(runDirectory, 'bounded-manifest.json')),
    readJson(auditPath ?? join(runDirectory, 'audit-full.json')),
  ]);
  if (run?.runId !== runId) throw new Error(`dimensions run ID mismatch: ${runId}`);
  return { run, manifest, audit, storageContentSha256: null };
}

async function loadCurrentInput(generatedAt) {
  const [nextBatches, programStatus, receiptAudit, replacementAudit, fitPublicationAudit] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceProgramStatus')),
    readJson(resolveArchitectureV2Path(root, 'historicalAcceptanceReceiptReplayAudit')),
    readJson(resolveArchitectureV2Path(root, 'historicalReplacementAudit')),
    readJson(resolveArchitectureV2Path(root, 'fitPublicationAudit')),
  ]);
  return {
    generatedAt: generatedAt ?? programStatus.generatedAt ?? nextBatches.generatedAt,
    nextBatches,
    programStatus,
    receiptAudit,
    replacementAudit,
    fitPublicationAudit,
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseHistoricalDimensionsScaleCheckpointArgs(args);
  const lockPath = `${options.ledger}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = await open(lockPath, 'wx').catch((error) => {
    if (error?.code === 'EEXIST') throw new Error('dimensions scale checkpoint writer already active');
    throw error;
  });
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, runId: options.runId })}\n`);
    await lock.sync();
    const storageIdentity = await verifyEvidenceStorageRoot(options.storageRoot, {
      getVolumeUuid: mountedVolumeUuid,
    });
    const objectStore = createEvidenceObjectStore(storageIdentity.root);
    const evidence = options.stage === 'DISCOVERY'
      ? await loadDiscoveryRun(objectStore, storageIdentity, options.runId)
      : await loadDimensionsRun(storageIdentity.root, options.runId, options.audit);
    const [control, ledger, currentInput, candidateManifest] = await Promise.all([
      readJson(options.control),
      readJson(options.ledger),
      loadCurrentInput(options.generatedAt),
      options.stage === 'DISCOVERY'
        ? readJson(resolveArchitectureV2Path(root, 'historicalOfficialCandidateManifest'))
        : Promise.resolve(null),
    ]);
    const advanced = recordHistoricalDimensionsScaleCheckpoint({
      control,
      ledger,
      ...evidence,
      currentInput,
      candidateManifest,
    });
    await atomicJson(options.ledger, advanced.ledger);
    await atomicJson(options.control, advanced.control);
    process.stdout.write(`${JSON.stringify({
      checkpointId: advanced.checkpoint.checkpointId,
      runId: options.runId,
      stage: advanced.checkpoint.stage,
      funnel: advanced.checkpoint.funnel,
      decision: advanced.control.decision,
      checkpointCount: advanced.control.checkpointCount,
      reconciled: advanced.reconciled,
    }, null, 2)}\n`);
    return advanced;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
