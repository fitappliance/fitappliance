#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEvidenceObjectStore } from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  auditHistoricalAcceptanceReceipts,
  filterHistoricalAcceptanceBundleByReceiptReplayAudit,
  promoteHistoricalEvidenceRecovery,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import {
  buildHistoricalEvidenceRecoveryAttemptLedger,
} from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const result = {
    results: null, audit: null, bundle: null, receiptAudit: null, attemptLedger: null, storageRoot: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, null];
    if (!['--results', '--audit', '--bundle', '--receipt-audit', '--attempt-ledger', '--storage-root'].includes(flag)) {
      throw new TypeError(`unknown argument: ${raw}`);
    }
    const value = inline ?? argv[++index];
    if (!value) throw new TypeError(`${flag} requires a value`);
    result[{
      '--results': 'results', '--audit': 'audit', '--bundle': 'bundle',
      '--receipt-audit': 'receiptAudit', '--attempt-ledger': 'attemptLedger',
      '--storage-root': 'storageRoot',
    }[flag]] = value;
  }
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

export async function runPromotionCli(options) {
  const resultsPath = resolve(options.results ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-results.json',
  ));
  const auditPath = resolve(options.audit ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-audit.json',
  ));
  const bundlePath = resolve(options.bundle ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  ));
  const receiptAuditPath = resolve(options.receiptAudit ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-acceptance-receipt-replay-audit.json',
  ));
  const attemptLedgerPath = resolve(options.attemptLedger ?? join(
    repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-attempt-ledger.json',
  ));
  const storageRoot = resolve(options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!storageRoot || storageRoot === resolve('')) throw new Error('FITAPPLIANCE_STORAGE_ROOT required to locate the audited batch');
  const [results, audit, rawPriorBundle, priorReceiptAudit, priorAttemptLedger] = await Promise.all([
    readJson(resultsPath), readJson(auditPath), readOptionalJson(bundlePath),
    readOptionalJson(receiptAuditPath), readOptionalJson(attemptLedgerPath),
  ]);
  const priorBundle = rawPriorBundle
    ? filterHistoricalAcceptanceBundleByReceiptReplayAudit(rawPriorBundle, priorReceiptAudit).bundle
    : null;
  const runDirectory = join(storageRoot, 'runs/historical-evidence-recovery', results.runId);
  const [batch, state] = await Promise.all([
    readJson(join(runDirectory, 'batch.json')),
    readJson(join(runDirectory, 'state.json')),
  ]);
  const generatedAt = new Date().toISOString();
  const bundle = promoteHistoricalEvidenceRecovery({
    batch, results, audit, priorBundle, generatedAt,
  });
  const attemptLedger = buildHistoricalEvidenceRecoveryAttemptLedger({
    batch, results, audit, state, priorLedger: priorAttemptLedger, generatedAt,
  });
  const objectStore = createEvidenceObjectStore(storageRoot);
  const receiptAudit = await auditHistoricalAcceptanceReceipts({
    bundle,
    generatedAt,
    readObject: objectStore.readObject,
  });
  await durableWrite(receiptAuditPath, receiptAudit);
  if (receiptAudit.summary.failed !== 0) {
    throw new Error(`prospective receipt replay failed for ${receiptAudit.summary.failed} source(s); acceptance bundle not published`);
  }
  await durableWrite(attemptLedgerPath, attemptLedger);
  await durableWrite(bundlePath, bundle);
  Object.defineProperty(bundle, 'receiptAuditSummary', {
    value: receiptAudit.summary,
    enumerable: false,
  });
  Object.defineProperty(bundle, 'attemptLedgerSummary', {
    value: attemptLedger.summary,
    enumerable: false,
  });
  return bundle;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const bundle = await runPromotionCli(options).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
    return null;
  });
  if (bundle) process.stdout.write(`${JSON.stringify({
    bundleId: bundle.bundleId,
    entries: bundle.entries.length,
    lineage: bundle.lineage.length,
    receiptReplay: bundle.receiptAuditSummary,
    attempts: bundle.attemptLedgerSummary,
  }, null, 2)}\n`);
}
