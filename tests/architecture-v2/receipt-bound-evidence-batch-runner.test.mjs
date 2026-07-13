import test from 'node:test';
import assert from 'node:assert/strict';

import { collectEvidenceCandidates } from '../../src/domain/evidence-candidate-inventory.mjs';
import { reconcileEvidenceClaims } from '../../src/domain/evidence-claim-reconciliation.mjs';
import {
  createBoundedSemaphore,
  createNetworkSemaphore,
  runReceiptBoundEvidenceBatch,
} from '../../src/domain/receipt-bound-evidence-batch-runner.mjs';

const SHA = 'a'.repeat(64);
const FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function job(jobId, sourceUrl, targetIds) {
  return {
    jobId,
    sourceUrl,
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds,
  };
}

function target(targetId, model, candidateJobIds) {
  return {
    targetId,
    referenceId: `reference-${model}`,
    legacyRuntimeId: `legacy-${model}`,
    canonicalProductId: `product-${model}`,
    brand: 'Example',
    model,
    category: 'dishwasher',
    lifecycleState: 'CURRENT_RETAIL',
    requestedFields: FIELDS,
    primaryJobId: candidateJobIds[0],
    candidateJobIds,
    publicationEligible: false,
    reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
  };
}

function batch({ jobs, targets }) {
  return {
    schemaVersion: 1,
    batchId: 'historical-recovery-test',
    generatedAt: '2026-07-13T00:00:00.000Z',
    queue: { schemaVersion: 2, sha256: SHA },
    policy: { version: '2026-07-13.1', sha256: 'b'.repeat(64) },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: jobs,
    targets,
    summary: {
      artifactJobs: jobs.length,
      targets: targets.length,
      candidateEdges: jobs.reduce((count, entry) => count + entry.targetIds.length, 0),
    },
  };
}

function dimensionClaim(field, mm) {
  const axis = field.endsWith('widthMm') ? 'width' : field.endsWith('heightMm') ? 'height' : 'depth';
  return {
    field,
    value: { kind: 'fixed', mm },
    sourceLabel: `${axis} ${mm} mm`,
    sourceAxisOrder: [axis],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: null,
    fragmentSha256: null,
    bbox: null,
  };
}

function attestedSource(targetRecord, artifact, hash = artifact.contentSha256) {
  return {
    authority: 'manufacturer',
    sourceType: 'official_exact_model_pdf',
    sourceUrl: artifact.sourceUrl,
    finalUrl: artifact.sourceUrl,
    contentType: 'application/pdf',
    contentSha256: hash,
    supersedesContentSha256: [],
    identity: {
      brand: targetRecord.brand,
      model: targetRecord.model,
      category: targetRecord.category,
      outcome: 'exact',
    },
    claims: [
      dimensionClaim(FIELDS[0], 598),
      dimensionClaim(FIELDS[1], 845),
      dimensionClaim(FIELDS[2], 600),
    ],
    verificationReceipt: { bindingSha256: hash },
  };
}

function dependencies(overrides = {}) {
  return {
    acquireArtifact: async (artifactJob, context) => {
      await context.withMineru(async () => {});
      return {
        jobId: artifactJob.jobId,
        sourceUrl: artifactJob.sourceUrl,
        contentSha256: artifactJob.jobId.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a'),
      };
    },
    attestTarget: async (targetRecord, artifact) => ({ source: attestedSource(targetRecord, artifact) }),
    collectCandidates: collectEvidenceCandidates,
    reconcileClaims: (identity, inventory, options) => reconcileEvidenceClaims(identity, inventory, {
      ...options,
      verifyReceipt: () => true,
    }),
    projectGeometry: ({ sources }) => ({ evidenceLevel: 'dimensions', sourceCount: sources.length }),
    ...overrides,
  };
}

test('one shared artifact is acquired once and independently attested for every linked target', async () => {
  const sharedJob = job('a'.repeat(32), 'https://official.example.com/shared.pdf', ['target-a', 'target-b']);
  const input = batch({
    jobs: [sharedJob],
    targets: [target('target-a', 'EX100', [sharedJob.jobId]), target('target-b', 'EX200', [sharedJob.jobId])],
  });
  let acquisitions = 0;
  const attestations = [];
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    acquireArtifact: async (artifactJob, context) => {
      acquisitions += 1;
      await context.withMineru(async () => {});
      return { jobId: artifactJob.jobId, sourceUrl: artifactJob.sourceUrl, contentSha256: 'c'.repeat(64) };
    },
    attestTarget: async (targetRecord, artifact) => {
      attestations.push(targetRecord.targetId);
      if (targetRecord.targetId === 'target-b') {
        throw Object.assign(new Error('exact model not found in shared manual'), { code: 'identity' });
      }
      return { source: attestedSource(targetRecord, artifact) };
    },
  }));

  assert.equal(acquisitions, 1);
  assert.deepEqual(attestations.sort(), ['target-a', 'target-b']);
  assert.deepEqual(result.outcomes.map((entry) => [entry.targetId, entry.status]), [
    ['target-a', 'accepted'],
    ['target-b', 'identity_rejected'],
  ]);
  assert.equal(result.summary.targets, 2);
  assert.equal(result.summary.accounted, 2);
});

test('one target with alternate jobs receives one inventory and exactly one terminal outcome', async () => {
  const jobs = [
    job('a'.repeat(32), 'https://official.example.com/primary.pdf', ['target-a']),
    job('b'.repeat(32), 'https://official.example.com/alternate.pdf', ['target-a']),
  ];
  const input = batch({ jobs, targets: [target('target-a', 'EX100', jobs.map((entry) => entry.jobId))] });
  let collections = 0;
  const seenCandidates = [];
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    collectCandidates: async (caseRecord, options) => {
      collections += 1;
      const batchResolver = options.resolvers.find((resolver) => resolver.resolverId === 'batch-candidates');
      seenCandidates.push(...(await batchResolver.resolve(caseRecord)).candidates.map((entry) => entry.batchJobId));
      return collectEvidenceCandidates(caseRecord, options);
    },
  }));

  assert.equal(collections, 1);
  assert.deepEqual(seenCandidates.sort(), jobs.map((entry) => entry.jobId).sort());
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].status, 'accepted');
  assert.equal(result.outcomes[0].sources.length, 2);
});

test('reversed graph input produces the same deterministic outcomes and semantic digests', async () => {
  const jobs = [
    job('a'.repeat(32), 'https://one.example.com/a.pdf', ['target-a']),
    job('b'.repeat(32), 'https://two.example.com/b.pdf', ['target-b']),
  ];
  const targets = [target('target-a', 'EX100', [jobs[0].jobId]), target('target-b', 'EX200', [jobs[1].jobId])];
  const first = await runReceiptBoundEvidenceBatch(batch({ jobs, targets }), dependencies());
  const second = await runReceiptBoundEvidenceBatch(batch({ jobs: [...jobs].reverse(), targets: [...targets].reverse() }), dependencies());

  assert.deepEqual(first, second);
});

test('network, per-host and MinerU concurrency limits are enforced', async () => {
  const jobs = [
    job('a'.repeat(32), 'https://one.example.com/a.pdf', ['target-0']),
    job('b'.repeat(32), 'https://one.example.com/b.pdf', ['target-1']),
    job('c'.repeat(32), 'https://two.example.com/c.pdf', ['target-2']),
    job('d'.repeat(32), 'https://three.example.com/d.pdf', ['target-3']),
  ];
  const targets = jobs.map((entry, index) => target(`target-${index}`, `EX${index}`, [entry.jobId]));
  const active = { network: 0, mineru: 0 };
  const hostActive = new Map();
  const maximum = { network: 0, mineru: 0, host: 0 };
  const result = await runReceiptBoundEvidenceBatch(batch({ jobs, targets }), dependencies({
    networkSemaphore: createNetworkSemaphore(2, 1),
    mineruSemaphore: createBoundedSemaphore(1),
    acquireArtifact: async (artifactJob, context) => {
      const host = new URL(artifactJob.sourceUrl).host;
      active.network += 1;
      hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
      maximum.network = Math.max(maximum.network, active.network);
      maximum.host = Math.max(maximum.host, hostActive.get(host));
      await new Promise((resolve) => setTimeout(resolve, 4));
      await context.withMineru(async () => {
        active.mineru += 1;
        maximum.mineru = Math.max(maximum.mineru, active.mineru);
        await new Promise((resolve) => setTimeout(resolve, 4));
        active.mineru -= 1;
      });
      hostActive.set(host, hostActive.get(host) - 1);
      active.network -= 1;
      return { jobId: artifactJob.jobId, sourceUrl: artifactJob.sourceUrl, contentSha256: artifactJob.jobId.padEnd(64, 'a') };
    },
  }));

  assert.equal(result.summary.accounted, 4);
  assert.ok(maximum.network <= 2);
  assert.equal(maximum.host, 1);
  assert.equal(maximum.mineru, 1);
  assert.equal(maximum.network, 2);
});

test('progress callbacks receive immutable transition deltas rather than growing outcome arrays', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/a.pdf', ['target-a']);
  const transitions = [];
  await runReceiptBoundEvidenceBatch(
    batch({ jobs: [artifactJob], targets: [target('target-a', 'EX100', [artifactJob.jobId])] }),
    dependencies({ onTransition: async (delta) => transitions.push(delta) }),
  );

  assert.ok(transitions.length >= 4);
  assert.ok(transitions.every((delta) => !Array.isArray(delta) && !Object.hasOwn(delta, 'outcomes')));
  assert.ok(transitions.some((delta) => delta.entity === 'artifact' && delta.state === 'available'));
  assert.ok(transitions.some((delta) => delta.entity === 'target' && delta.state === 'completed'));
});
