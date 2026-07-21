#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditHistoricalEvidenceRecovery,
  auditHistoricalEvidenceRecoveryBundle,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { createEvidenceObjectStore } from '../../src/domain/evidence-recovery-state-store.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const result = {
    mode: 'online', results: null, output: null, bundle: null, queue: null, storageRoot: null, full: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--full') { result.full = true; continue; }
    const [flag, inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, null];
    if (!['--mode', '--results', '--output', '--bundle', '--queue', '--storage-root'].includes(flag)) {
      throw new TypeError(`unknown argument: ${raw}`);
    }
    const value = inline ?? argv[++index];
    if (!value) throw new TypeError(`${flag} requires a value`);
    result[{
      '--mode': 'mode', '--results': 'results', '--output': 'output',
      '--bundle': 'bundle', '--queue': 'queue', '--storage-root': 'storageRoot',
    }[flag]] = value;
  }
  if (!['online', 'offline'].includes(result.mode)) throw new TypeError('--mode must be online or offline');
  return result;
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function readOptionalJson(path) {
  try { return await readJson(path); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function selectRecoveryQueueSnapshot(batch, candidates) {
  const expected = String(batch?.queue?.sha256 ?? '');
  const matches = (candidates ?? []).filter((candidate) => (
    candidate?.value && canonicalJsonSha256(candidate.value) === expected
  ));
  if (!matches.length) throw new Error(`no matching queue snapshot for batch SHA ${expected || 'missing'}`);
  const unique = new Map(matches.map((candidate) => [canonicalJsonSha256(candidate.value), candidate.value]));
  if (unique.size !== 1) throw new Error(`ambiguous matching queue snapshots for batch SHA ${expected}`);
  return structuredClone(unique.values().next().value);
}

async function readBoundQueueSnapshot(batch, explicitPath, runDirectory) {
  if (explicitPath) return readJson(resolve(explicitPath));
  const paths = [
    join(runDirectory, 'queue.json'),
    join(repoRoot, 'data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json'),
    join(repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json'),
  ];
  const values = await Promise.all(paths.map(async (path) => ({
    path,
    value: await readOptionalJson(path),
  })));
  return selectRecoveryQueueSnapshot(batch, values);
}

async function readBoundPolicySnapshot(batch, runDirectory) {
  const paths = [
    join(runDirectory, 'policy.json'),
    join(repoRoot, 'data/architecture-v2/policies/historical-evidence-recovery-policy.json'),
  ];
  for (const path of paths) {
    const value = await readOptionalJson(path);
    if (value && canonicalJsonSha256(value) === batch.policy.sha256) return value;
  }
  throw new Error(`no matching policy snapshot for batch SHA ${batch.policy.sha256}`);
}

async function durableWrite(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, path);
}

export async function runAuditCli(options) {
  const bundlePath = resolve(options.bundle ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  ));
  if (options.mode === 'offline') {
    const report = auditHistoricalEvidenceRecoveryBundle(await readJson(bundlePath));
    if (options.output) await durableWrite(resolve(options.output), report);
    return report;
  }

  const resultsPath = resolve(options.results ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-results.json',
  ));
  const outputPath = resolve(options.output ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-audit.json',
  ));
  const storageRoot = resolve(options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!storageRoot || storageRoot === resolve('')) throw new Error('FITAPPLIANCE_STORAGE_ROOT required for online audit');
  const results = await readJson(resultsPath);
  const runDirectory = join(storageRoot, 'runs/historical-evidence-recovery', results.runId);
  const batch = await readJson(join(runDirectory, 'batch.json'));
  const [state, queue, policy, priorBundle] = await Promise.all([
    readJson(join(runDirectory, 'state.json')),
    readBoundQueueSnapshot(batch, options.queue, runDirectory),
    readBoundPolicySnapshot(batch, runDirectory),
    readOptionalJson(bundlePath),
  ]);
  const objectStore = createEvidenceObjectStore(storageRoot);
  const audit = await auditHistoricalEvidenceRecovery({
    mode: 'online', batch, results, state, queue, policy, priorBundle,
    generatedAt: new Date().toISOString(),
    readObject: objectStore.readObject,
    replayPriorObjects: options.full,
  });
  await durableWrite(outputPath, audit);
  return audit;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const report = await runAuditCli(options).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
    return null;
  });
  if (report) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== 'passed') process.exitCode = 1;
  }
}
