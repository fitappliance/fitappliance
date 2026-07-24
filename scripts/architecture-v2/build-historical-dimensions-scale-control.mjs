#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  loadActiveRetailRelease,
  loadActiveRetailReleaseAudits,
} from '../../src/domain/active-retail-release.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalDimensionsScaleControl,
  canonicalHistoricalDimensionsScaleCounters,
  HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY,
  recordHistoricalDimensionsScaleRebaseline,
} from '../../src/domain/historical-dimensions-scale-control.mjs';
import {
  HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS,
} from '../../src/domain/historical-evidence-epoch-definitions.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

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
  const supported = new Set([
    '--output', '--ledger', '--generated-at', '--initialize-ledger',
    '--record-rebaseline', '--rebaseline-at',
  ]);
  let initializeLedger = false;
  let recordRebaseline = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index].split('=', 1)[0];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${args[index]}`);
    if (flag === '--initialize-ledger') initializeLedger = true;
    else if (flag === '--record-rebaseline') recordRebaseline = true;
    else if (!args[index].includes('=')) index += 1;
  }
  if (initializeLedger && recordRebaseline) {
    throw new TypeError('--initialize-ledger and --record-rebaseline are mutually exclusive');
  }
  const rebaselineAt = option(args, '--rebaseline-at');
  if (recordRebaseline && !rebaselineAt) throw new TypeError('--rebaseline-at is required');
  if (!recordRebaseline && rebaselineAt) throw new TypeError('--rebaseline-at requires --record-rebaseline');
  return {
    initializeLedger,
    recordRebaseline,
    rebaselineAt,
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

async function currentEpochs() {
  return Promise.all(HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS.map(async ([id, owner, paths]) => {
    const inputs = (await Promise.all(paths.map(async (path) => ({
      path,
      contentSha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
    })))).sort((left, right) => left.path.localeCompare(right.path));
    return { id, owner, inputs, semanticSha256: canonicalJsonSha256({ id, owner, inputs }) };
  }));
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const activeRelease = await loadActiveRetailRelease({ root });
  const activeAudits = await loadActiveRetailReleaseAudits({ activeRelease });
  const [nextBatches, programStatus, receiptAudit, epochs] = await Promise.all([
    readJson('historicalEvidenceNextBatches'),
    readJson('historicalEvidenceProgramStatus'),
    readJson('historicalAcceptanceReceiptReplayAudit'),
    currentEpochs(),
  ]);
  const { replacementAudit, fitPublicationAudit } = activeAudits;
  const shared = {
    nextBatches, programStatus, receiptAudit, replacementAudit, fitPublicationAudit, epochs,
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
      schemaVersion: 2,
      ledgerId: 'historical-dimensions-scale-v2',
      activatedAt,
      policy: structuredClone(HISTORICAL_DIMENSIONS_STAGE_CIRCUIT_POLICY),
      baseline: { counters: canonicalHistoricalDimensionsScaleCounters(shared) },
      entries: [],
    };
    await atomicJson(options.ledger, ledger);
  } else {
    ledger = JSON.parse(await readFile(options.ledger, 'utf8'));
  }
  if (options.recordRebaseline) {
    const priorControl = JSON.parse(await readFile(options.output, 'utf8'));
    const advanced = recordHistoricalDimensionsScaleRebaseline({
      priorControl,
      ledger,
      currentInput: {
        ...shared,
        generatedAt: options.generatedAt ?? programStatus.generatedAt ?? nextBatches.generatedAt,
      },
      activatedAt: options.rebaselineAt,
      reason: 'RELEASE_DAG_RECONCILIATION',
    });
    await atomicJson(options.ledger, advanced.ledger);
    await atomicJson(options.output, advanced.control);
    process.stdout.write(`${JSON.stringify({
      output: options.output,
      ledger: options.ledger,
      rebaselineId: advanced.rebaseline.rebaselineId,
      queueCounterDeltas: advanced.rebaseline.queueCounterDeltas,
      changedArtifactBindings: advanced.rebaseline.changedArtifactBindings,
      decision: advanced.control.decision,
    }, null, 2)}\n`);
    return advanced.control;
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
