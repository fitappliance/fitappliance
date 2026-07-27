import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  persistHistoricalDimensionsRunAudit,
  resolveHistoricalDimensionsRunAuditPath,
} from '../../scripts/architecture-v2/record-historical-dimensions-scale-checkpoint.mjs';

test('dimensions checkpoint audit persistence is immutable and idempotent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-checkpoint-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'run-a', 'audit-full.json');
  const audit = { schemaVersion: 1, auditId: 'audit-a', status: 'passed' };

  assert.equal(await persistHistoricalDimensionsRunAudit(path, audit), true);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), audit);
  assert.equal(await persistHistoricalDimensionsRunAudit(path, structuredClone(audit)), false);
  await assert.rejects(
    () => persistHistoricalDimensionsRunAudit(path, { ...audit, auditId: 'audit-b' }),
    /immutable.*differs/i,
  );
});

test('dimensions checkpoint preserves an earlier failed audit when a named rerun passes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-checkpoint-audit-rerun-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'run-a';
  const originalPath = resolveHistoricalDimensionsRunAuditPath(root, runId);
  const rerunPath = resolveHistoricalDimensionsRunAuditPath(
    root,
    runId,
    join(root, 'runs/historical-evidence-recovery', runId, 'audit-full-v2.json'),
  );
  const failed = { schemaVersion: 1, auditId: 'audit-a', status: 'failed' };
  const passed = { schemaVersion: 1, auditId: 'audit-b', status: 'passed' };

  assert.equal(await persistHistoricalDimensionsRunAudit(originalPath, failed), true);
  assert.equal(await persistHistoricalDimensionsRunAudit(rerunPath, passed), true);
  assert.deepEqual(JSON.parse(await readFile(originalPath, 'utf8')), failed);
  assert.deepEqual(JSON.parse(await readFile(rerunPath, 'utf8')), passed);
});
