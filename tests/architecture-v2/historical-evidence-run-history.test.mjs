import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  historicalRunTargetSuppression,
  scanHistoricalEvidenceRunHistory,
} from '../../src/domain/historical-evidence-run-history.mjs';

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
