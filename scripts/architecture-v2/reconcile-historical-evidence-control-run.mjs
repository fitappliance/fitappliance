#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalControlReconciliationReceipt,
  historicalControlReconciliationPath,
} from '../../src/domain/historical-evidence-control-reconciliation.mjs';
import { validateHistoricalEvidenceBoundedBatches } from '../../src/domain/historical-evidence-bounded-batch.mjs';
import { assertHistoricalDimensionsScaleCheckpointSource } from '../../src/domain/historical-dimensions-scale-control.mjs';
import { verifyEvidenceStorageRoot } from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
  validateHistoricalEvidenceRecoveryAudit,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryResults,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACCEPTED_STATUSES = new Set(['accepted', 'receipt_accepted_non_scalar']);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function safeId(value, label) {
  const normalized = requiredText(value, label);
  if (!SAFE_ID.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function option(args, name) {
  const matches = [];
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (raw === name) matches.push(args[index + 1]);
    else if (raw.startsWith(`${name}=`)) matches.push(raw.slice(name.length + 1));
  }
  if (matches.length > 1) throw new TypeError(`${name} may be provided only once`);
  if (!matches.length) return null;
  return requiredText(matches[0], name);
}

export function parseHistoricalControlReconciliationArgs(args) {
  const valueFlags = new Set([
    '--prior-run-id', '--manifest-id', '--storage-root', '--audit', '--control', '--ledger',
    '--next-batches', '--bundle', '--created-at',
  ]);
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const flag = raw.split('=', 1)[0];
    if (flag === '--write') {
      if (raw !== '--write' || write) throw new TypeError('--write may be provided only once');
      write = true;
      continue;
    }
    if (!valueFlags.has(flag)) throw new TypeError(`unknown argument: ${raw}`);
    if (!raw.includes('=')) index += 1;
  }
  return {
    priorRunId: safeId(option(args, '--prior-run-id'), '--prior-run-id'),
    manifestId: safeId(option(args, '--manifest-id'), '--manifest-id'),
    storageRoot: resolve(requiredText(
      option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT,
      '--storage-root or FITAPPLIANCE_STORAGE_ROOT',
    )),
    audit: resolve(option(args, '--audit')
      ?? resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAudit')),
    control: resolve(option(args, '--control')
      ?? resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
    ledger: resolve(option(args, '--ledger')
      ?? resolveArchitectureV2Path(root, 'historicalDimensionsScaleLedger')),
    nextBatches: resolve(option(args, '--next-batches')
      ?? resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches')),
    bundle: resolve(option(args, '--bundle')
      ?? resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    createdAt: option(args, '--created-at') ?? new Date().toISOString(),
    write,
  };
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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function semanticAuditView(audit) {
  return {
    mode: audit.mode,
    batchId: audit.batchId,
    batchSha256: audit.batchSha256,
    queueSha256: audit.queueSha256,
    policySha256: audit.policySha256,
    resultsSha256: audit.resultsSha256,
    priorBundleSha256: audit.priorBundleSha256,
    priorObjectsReplayed: audit.priorObjectsReplayed,
    checkedTargets: audit.checkedTargets,
    checkedObjects: audit.checkedObjects,
    repairs: audit.repairs ?? [],
    violations: audit.violations,
  };
}

function validateManifestHash(manifest, label) {
  const { manifestId, semanticManifestSha256, ...semantic } = manifest ?? {};
  const expected = canonicalJsonSha256(semantic);
  if (manifestId !== `historical_batch_${expected.slice(0, 24)}`
    || semanticManifestSha256 !== expected) throw new Error(`${label} manifest hash drift`);
  return manifest;
}

function targetBindings(manifest) {
  return (manifest.targetBindings ?? []).map((row) => ({
    targetId: row.targetId,
    referenceId: row.referenceId,
  })).sort((left, right) => left.targetId.localeCompare(right.targetId));
}

function validatePriorAcceptance({ state, batch, results, audit, manifest }) {
  validateHistoricalEvidenceRecoveryBatch(batch);
  validateHistoricalEvidenceRecoveryResults(results);
  validateHistoricalEvidenceRecoveryAudit(audit);
  validateManifestHash(manifest, 'prior bounded');
  if (state?.schemaVersion !== 1 || state.runId !== results.runId || state.status !== 'completed') {
    throw new Error('prior run state is not a completed run');
  }
  if (state.input?.batchSha256 !== canonicalJsonSha256(batch)
    || results.batchSha256 !== canonicalJsonSha256(batch)
    || results.batchId !== batch.batchId) throw new Error('prior run batch binding drift');
  if (audit.mode !== 'online' || audit.status !== 'passed' || audit.priorObjectsReplayed !== true
    || audit.violations.length !== 0 || audit.checkedTargets !== results.outcomes.length
    || audit.batchSha256 !== canonicalJsonSha256(batch)
    || audit.resultsSha256 !== canonicalJsonSha256(results)) {
    throw new Error('prior acceptance requires a passing full online audit');
  }
  const semanticAuditSha256 = canonicalJsonSha256(semanticAuditView(audit));
  if (audit.semanticAuditSha256 !== semanticAuditSha256
    || audit.auditId !== `historical-recovery-audit-${semanticAuditSha256.slice(0, 24)}`) {
    throw new Error('prior full audit semantic binding drift');
  }
  if (!results.outcomes.length
    || results.outcomes.some((outcome) => !ACCEPTED_STATUSES.has(outcome.status))) {
    throw new Error('prior run must contain only accepted outcomes');
  }
  const selected = results.outcomes.map((row) => row.targetId).sort();
  const stateSelected = Object.entries(state.targets ?? {})
    .filter(([, row]) => row?.state === 'completed' && ACCEPTED_STATUSES.has(row?.outcome?.status))
    .map(([targetId]) => targetId).sort();
  const manifestSelected = manifest.targetBindings.map((row) => row.targetId).sort();
  if (JSON.stringify(selected) !== JSON.stringify(stateSelected)
    || JSON.stringify(selected) !== JSON.stringify(manifestSelected)) {
    throw new Error('prior accepted target binding drift');
  }
  return selected;
}

function selectEpochRebaseline({ ledger, control, completedAt }) {
  if (control.sourceBindings?.ledgerSha256 !== canonicalJsonSha256(ledger)) {
    throw new Error('scale control ledger binding drift');
  }
  if ((ledger.entries ?? []).some((row) => row.runId)) {
    // The exact prior run check is performed by the caller; this keeps malformed entries visible.
    for (const row of ledger.entries) safeId(row.runId, 'scale checkpoint run ID');
  }
  const candidates = (ledger.rebaselines ?? []).filter((row) => (
    Date.parse(row.activatedAt) > Date.parse(completedAt)
    && row.reason === 'RELEASE_DAG_RECONCILIATION'
    && row.changedArtifactBindings?.includes('epochsSha256')
    && row.nextArtifactBindings?.epochsSha256 === control.sourceBindings?.epochsSha256
  ));
  const selected = candidates.at(-1);
  if (!selected || control.latestRebaseline?.rebaselineId !== selected.rebaselineId) {
    throw new Error('no current epoch rebaseline follows the uncheckpointed acceptance');
  }
  const { semanticRebaselineSha256, ...semantic } = selected;
  if (canonicalJsonSha256(semantic) !== semanticRebaselineSha256) {
    throw new Error('scale rebaseline semantic binding drift');
  }
  return selected;
}

async function exclusiveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const existing = await readJson(path);
    if (canonicalJsonSha256(existing) !== canonicalJsonSha256(value)) {
      throw new Error(`immutable reconciliation artifact already differs: ${path}`);
    }
    return false;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return true;
}

export async function runHistoricalControlReconciliation(options) {
  const storageIdentity = await verifyEvidenceStorageRoot(options.storageRoot, {
    getVolumeUuid: mountedVolumeUuid,
  });
  const runRoot = join(
    storageIdentity.root,
    'runs/historical-evidence-recovery',
    safeId(options.priorRunId, 'prior run ID'),
  );
  const [state, batch, results, audit, priorManifest, control, ledger, nextBatches, bundle] = await Promise.all([
    readJson(join(runRoot, 'state.json')),
    readJson(join(runRoot, 'batch.json')),
    readJson(join(runRoot, 'results.json')),
    readJson(options.audit),
    readJson(join(runRoot, 'bounded-manifest.json')),
    readJson(options.control),
    readJson(options.ledger),
    readJson(options.nextBatches),
    readJson(options.bundle),
  ]);
  const selectedTargetIds = validatePriorAcceptance({ state, batch, results, audit, manifest: priorManifest });
  validateHistoricalEvidenceBoundedBatches(nextBatches);
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  if (control.sourceBindings?.nextBatchesSha256 !== canonicalJsonSha256(nextBatches)) {
    throw new Error('scale control bounded-batch binding drift');
  }
  const currentManifest = nextBatches.manifests.find((row) => row.manifestId === options.manifestId);
  if (!currentManifest) throw new Error(`current authorised manifest missing: ${options.manifestId}`);
  assertHistoricalDimensionsScaleCheckpointSource({
    control,
    manifest: currentManifest,
    stage: 'DIMENSIONS',
  });
  if (priorManifest.manifestId === currentManifest.manifestId
    || priorManifest.executionLane !== 'ACQUISITION'
    || currentManifest.executionLane !== 'ACQUISITION'
    || priorManifest.workstreamId !== currentManifest.workstreamId
    || priorManifest.cohortKey !== currentManifest.cohortKey
    || JSON.stringify(targetBindings(priorManifest)) !== JSON.stringify(targetBindings(currentManifest))) {
    throw new Error('control reconciliation requires an equivalent target cohort under a new manifest');
  }
  if (bundle.entries.some((entry) => selectedTargetIds.includes(entry.targetId))
    || bundle.lineage.some((row) => row.batchId === batch.batchId
      || row.resultsSha256 === canonicalJsonSha256(results))) {
    throw new Error('prior acceptance is already present in the cumulative bundle');
  }
  if ((ledger.entries ?? []).some((row) => row.runId === results.runId)) {
    throw new Error('prior acceptance is already checkpointed');
  }
  const rebaseline = selectEpochRebaseline({ ledger, control, completedAt: results.completedAt });
  if (Date.parse(options.createdAt) < Date.parse(rebaseline.activatedAt)) {
    throw new Error('control reconciliation timestamp precedes the qualifying rebaseline');
  }
  const receipt = buildHistoricalControlReconciliationReceipt({
    createdAt: options.createdAt,
    priorRunId: results.runId,
    priorState: state,
    priorBatch: batch,
    priorResults: results,
    priorAudit: audit,
    priorManifest,
    currentControl: control,
    currentManifest,
    rebaseline,
    targetIds: selectedTargetIds,
  });
  const receiptPath = historicalControlReconciliationPath(
    runRoot,
    currentManifest.manifestId,
    control.controlId,
  );
  const auditPath = join(runRoot, 'audit-full.json');
  if (options.write) {
    await exclusiveJson(auditPath, audit);
    await exclusiveJson(receiptPath, receipt);
  }
  return { receipt, receiptPath, auditPath, written: options.write, storageIdentity };
}

export async function runCli(args = process.argv.slice(2)) {
  const result = await runHistoricalControlReconciliation(
    parseHistoricalControlReconciliationArgs(args),
  );
  process.stdout.write(`${JSON.stringify({
    reconciliationId: result.receipt.reconciliationId,
    priorRunId: result.receipt.priorRunId,
    currentManifestId: result.receipt.currentManifestId,
    rebaselineId: result.receipt.rebaselineId,
    targetIds: result.receipt.targetIds,
    receiptPath: result.receiptPath,
    auditPath: result.auditPath,
    written: result.written,
  }, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
