import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  historicalRunTargetSuppression,
  scanHistoricalEvidenceRunHistory,
} from '../../src/domain/historical-evidence-run-history.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const POLICY = 'a'.repeat(64);
const TOOLCHAIN = 'b'.repeat(64);
const CONTRACT = [
  { resolverId: 'batch-candidates', version: '1', scope: 'batch', required: true },
  { resolverId: 'brand-resolver', version: '3', scope: 'exact-model', required: true },
];

function state({ status = 'claims_incomplete', failureCode = 'source_authority', candidates = [],
  policy = POLICY, toolchain = TOOLCHAIN, contract = CONTRACT } = {}) {
  return {
    schemaVersion: 1,
    runId: 'prior-run',
    input: { policySha256: policy, toolchainSha256: toolchain },
    targets: {
      'target-1': {
        state: 'completed',
        outcome: {
          status,
          failureCode,
          candidateInventory: {
            completionStatus: 'complete',
            incompleteResolvers: [],
            missingBatchCandidateJobIds: [],
            resolvers: contract.map((resolver) => ({ ...resolver, completion: 'complete', candidateCount: candidates.length })),
            candidates,
          },
        },
      },
    },
  };
}

function suppression(priorState, overrides = {}) {
  return historicalRunTargetSuppression({
    priorState,
    targetId: 'target-1',
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    currentResolverContract: CONTRACT,
    ...overrides,
  });
}

test('completed zero-candidate discovery suppresses a same-epoch rerun before promotion', () => {
  assert.equal(suppression(state()).reason, 'completed_exhausted_source_discovery');
});

test('a newly materialized explicit candidate reopens exhausted resolver-only discovery', () => {
  assert.equal(suppression(state(), { currentHasExplicitCandidateJobs: true }), null);
});

test('completed acceptance suppresses a same-policy rerun before promotion', () => {
  assert.equal(suppression(state({ status: 'accepted', failureCode: null }))?.reason,
    'completed_unpromoted_acceptance');
});

test('a verified parser-repair reopen bypasses only an unpromotable prior acceptance', () => {
  assert.equal(suppression(state({ status: 'accepted', failureCode: null }), {
    verifiedRepairReopen: true,
  }), null);
  assert.equal(suppression(state(), { verifiedRepairReopen: true })?.reason,
    'completed_exhausted_source_discovery');
});

test('retryable work reopens but resolver and policy revisions do not repeat zero-candidate discovery', () => {
  assert.equal(suppression(state({ status: 'retryable_failure', failureCode: 'transport' })), null);
  assert.equal(suppression(state({ contract: [CONTRACT[0], { ...CONTRACT[1], version: '2' }] }))?.reason,
    'completed_exhausted_source_discovery');
  assert.equal(suppression(state({ policy: 'c'.repeat(64) }))?.reason,
    'completed_exhausted_source_discovery');
});

test('parser terminal work requires the same toolchain epoch to suppress', () => {
  assert.equal(suppression(state({ failureCode: 'mineru', candidates: [{ outcome: { status: 'mineru_failure' } }] }))?.reason,
    'completed_terminal_same_epoch');
  assert.equal(suppression(state({ failureCode: 'mineru', toolchain: 'c'.repeat(64),
    candidates: [{ outcome: { status: 'mineru_failure' } }] })), null);
});

test('history scan reports the prior run and exact selected identity', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-run-history-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  const runRoot = join(root, 'runs', 'historical-evidence-recovery', 'prior-run');
  await mkdir(runRoot, { recursive: true });
  await writeFile(join(runRoot, 'state.json'), JSON.stringify(state()));
  const conflicts = await scanHistoricalEvidenceRunHistory({
    storageRoot: root,
    selectedBatch: { targets: [{ targetId: 'target-1', brand: 'Beko', model: 'MODEL1' }] },
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    resolverContractForTarget: () => CONTRACT,
  });
  assert.deepEqual(conflicts, [{
    targetId: 'target-1', priorRunId: 'prior-run', priorStatus: 'claims_incomplete',
    priorFailureCode: 'source_authority', reason: 'completed_exhausted_source_discovery',
    brand: 'Beko', model: 'MODEL1',
  }]);
});

test('history scan allows a new explicit candidate after zero-candidate discovery', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-run-history-source-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  const runRoot = join(root, 'runs', 'historical-evidence-recovery', 'prior-run');
  await mkdir(runRoot, { recursive: true });
  await writeFile(join(runRoot, 'state.json'), JSON.stringify(state()));
  const conflicts = await scanHistoricalEvidenceRunHistory({
    storageRoot: root,
    selectedBatch: {
      artifactJobs: [{ jobId: 'new-official-job', authorityMode: 'official' }],
      targets: [{
        targetId: 'target-1', brand: 'Beko', model: 'MODEL1',
        candidateJobIds: ['new-official-job'],
      }],
    },
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    resolverContractForTarget: () => CONTRACT,
  });
  assert.deepEqual(conflicts, []);
});

test('history scan does not reopen exhausted discovery for a reference-only candidate', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-run-history-reference-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  const runRoot = join(root, 'runs', 'historical-evidence-recovery', 'prior-run');
  await mkdir(runRoot, { recursive: true });
  await writeFile(join(runRoot, 'state.json'), JSON.stringify(state()));
  const conflicts = await scanHistoricalEvidenceRunHistory({
    storageRoot: root,
    selectedBatch: {
      artifactJobs: [{ jobId: 'retailer-mirror', authorityMode: 'reference' }],
      targets: [{
        targetId: 'target-1', brand: 'Beko', model: 'MODEL1',
        candidateJobIds: ['retailer-mirror'],
      }],
    },
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    resolverContractForTarget: () => CONTRACT,
  });
  assert.equal(conflicts[0]?.reason, 'completed_exhausted_source_discovery');
});

function receiptSource(content, binding) {
  return {
    contentSha256: content.repeat(64),
    verificationReceipt: { bindingSha256: binding.repeat(64) },
  };
}

function failedRepairAudit({ priorBatch, priorResults, targetId, overrides = {} }) {
  const semantic = {
    mode: 'online',
    batchId: 'prior-batch',
    batchSha256: canonicalJsonSha256(priorBatch),
    queueSha256: 'd'.repeat(64),
    policySha256: POLICY,
    resultsSha256: canonicalJsonSha256(priorResults),
    priorBundleSha256: 'e'.repeat(64),
    priorObjectsReplayed: true,
    checkedTargets: 1,
    checkedObjects: 2,
    repairs: [],
    violations: [`prior object ${targetId}: artifact attestation receipt mismatch`],
    ...overrides,
  };
  const semanticAuditSha256 = canonicalJsonSha256(semantic);
  return {
    schemaVersion: 1,
    auditId: `historical-recovery-audit-${semanticAuditSha256.slice(0, 24)}`,
    generatedAt: '2026-07-19T00:00:00.000Z',
    status: semantic.violations.length ? 'failed' : 'passed',
    ...semantic,
    semanticAuditSha256,
  };
}

async function writeAcceptedRepairHistory(root, { audit = true } = {}) {
  const runRoot = join(root, 'runs', 'historical-evidence-recovery', 'prior-run');
  await mkdir(runRoot, { recursive: true });
  const priorBatch = {
    batchId: 'prior-batch',
    targets: [{
      targetId: 'target-1',
      reconciliationContext: {
        activeReceiptSources: [receiptSource('1', '2'), receiptSource('3', '4')],
      },
    }],
  };
  const priorResults = { runId: 'prior-run', batchId: 'prior-batch' };
  await Promise.all([
    writeFile(join(runRoot, 'state.json'), JSON.stringify(state({ status: 'accepted', failureCode: null }))),
    writeFile(join(runRoot, 'batch.json'), JSON.stringify(priorBatch)),
    writeFile(join(runRoot, 'results.json'), JSON.stringify(priorResults)),
  ]);
  if (audit) {
    await writeFile(join(runRoot, 'audit.json'), JSON.stringify(failedRepairAudit({
      priorBatch, priorResults, targetId: 'target-1',
    })));
  }
}

function repairBatch(activeReceiptSources = [receiptSource('1', '2')]) {
  return {
    targets: [{
      targetId: 'target-1', brand: 'LG', model: 'MODEL1',
      repairExistingReceipt: true,
      candidateJobIds: [],
      reconciliationContext: { activeReceiptSources },
    }],
  };
}

test('history scan reopens a parser repair only after a bound full audit proves the prior acceptance unpromotable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-run-history-repair-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  await writeAcceptedRepairHistory(root);
  const conflicts = await scanHistoricalEvidenceRunHistory({
    storageRoot: root,
    selectedBatch: repairBatch(),
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    resolverContractForTarget: () => CONTRACT,
  });
  assert.deepEqual(conflicts, []);
});

test('parser-repair history remains blocked without the durable audit or without receipt-set drift', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-run-history-repair-closed-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  await writeAcceptedRepairHistory(root, { audit: false });
  const options = {
    storageRoot: root,
    currentPolicySha256: POLICY,
    currentToolchainSha256: TOOLCHAIN,
    resolverContractForTarget: () => CONTRACT,
  };
  assert.equal((await scanHistoricalEvidenceRunHistory({
    ...options, selectedBatch: repairBatch(),
  }))[0]?.reason, 'completed_unpromoted_acceptance');

  await writeAcceptedRepairHistory(root);
  assert.equal((await scanHistoricalEvidenceRunHistory({
    ...options,
    selectedBatch: repairBatch([receiptSource('1', '2'), receiptSource('3', '4')]),
  }))[0]?.reason, 'completed_unpromoted_acceptance');
});
