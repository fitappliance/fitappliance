#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  auditHistoricalEvidenceRecoveryBundle,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import {
  rollbackHistoricalEvidenceRecoveryBundleBatch,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const options = { bundle: null, batchId: null, expectedSha256: null };
  const fields = new Map([
    ['--bundle', 'bundle'], ['--batch-id', 'batchId'], ['--expected-sha256', 'expectedSha256'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, null];
    const field = fields.get(flag);
    if (!field) throw new TypeError(`unknown argument: ${raw}`);
    const value = inline ?? argv[++index];
    if (!value) throw new TypeError(`${flag} requires a value`);
    options[field] = value;
  }
  for (const [field, value] of Object.entries(options)) {
    if (!value) throw new TypeError(`${field} required`);
  }
  return options;
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

export async function runRollbackCli(options) {
  const bundlePath = resolve(options.bundle ?? `${repoRoot}/data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json`);
  const current = JSON.parse(await fs.readFile(bundlePath, 'utf8'));
  const before = auditHistoricalEvidenceRecoveryBundle(current);
  if (before.status !== 'passed') throw new Error(`current bundle audit failed: ${before.violations.join('; ')}`);
  const result = rollbackHistoricalEvidenceRecoveryBundleBatch(current, {
    batchId: options.batchId,
    expectedBundleSha256: options.expectedSha256,
  });
  const after = auditHistoricalEvidenceRecoveryBundle(result.bundle);
  if (after.status !== 'passed') throw new Error(`rolled-back bundle audit failed: ${after.violations.join('; ')}`);
  await durableWrite(bundlePath, result.bundle);
  return { ...result, audit: after };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await runRollbackCli(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    removedBatchId: result.removedBatchId,
    removedEntries: result.removedEntries,
    previousBundleSha256: result.previousBundleSha256,
    nextBundleSha256: result.nextBundleSha256,
    remainingEntries: result.bundle.entries.length,
    remainingLineage: result.bundle.lineage.length,
    audit: result.audit.status,
  }, null, 2)}\n`);
}
