import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  auditHistoricalEvidenceRecovery,
  auditHistoricalEvidenceRecoveryBundle,
  promoteHistoricalEvidenceRecovery,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { buildMineruDerivedArtifact, parseMineruContentListV2 } from '../../src/domain/mineru-document.mjs';
import { verifyAndAttestResolutionArtifact } from '../../src/domain/evidence-artifact-verifier.mjs';
import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';
import { computeCandidateInventorySha256 } from '../../src/domain/evidence-candidate-inventory.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { recoveryOutcomeSemanticSha256 } from '../../src/domain/receipt-bound-evidence-batch-runner.mjs';

const QUEUE_SHA = 'a'.repeat(64);
const POLICY_SHA = 'b'.repeat(64);
const MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
const FIELDS = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];

function acceptedFixture() {
  const identity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const pdfBytes = Buffer.from('%PDF-1.7\nauditable immutable artifact');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'HRCD640TBW Specifications' }] },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Model Number</td><td>HRCD640TBW</td></tr><tr><td>Dimensions (W x H x D)</td><td>914 x 1790 x 730 mm</td></tr></table>',
      },
      bbox: [80, 200, 800, 900],
    },
  ]]));
  const parsed = parseMineruContentListV2(jsonBytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: MODEL_REVISION,
    caseIdentity: identity,
    fields: FIELDS,
    claimSemanticsVersion: 2,
  });
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION, pageCount: 1,
  });
  const sourceUrl = 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf';
  const source = verifyAndAttestResolutionArtifact({
    source: {
      authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
      sourceUrl, finalUrl: sourceUrl, redirectChain: [],
      retrievedAt: '2026-07-13T00:00:10.000Z', contentSha256: pdfSha256,
      objectPath: `evidence/web/sha256/${pdfSha256.slice(0, 2)}/${pdfSha256.slice(2, 4)}/${pdfSha256}.pdf`,
      contentType: 'application/pdf', byteSize: pdfBytes.length,
      supersedesContentSha256: [],
      identity: { brand: identity.brand, model: identity.model, outcome: 'exact' },
      claims: parsed.claims, derivedArtifact,
    },
    caseIdentity: identity,
    bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes,
    verifiedAt: '2026-07-13T00:00:11.000Z',
    claimSemanticsVersion: 2,
  });
  const target = {
    targetId: 'target-hisense', referenceId: 'reference-hisense', legacyRuntimeId: 'legacy-hisense',
    canonicalProductId: 'product-hisense', ...identity,
    lifecycleState: 'CURRENT_RETAIL', requestedFields: FIELDS,
    primaryJobId: 'job-hisense', candidateJobIds: ['job-hisense'], publicationEligible: false,
    reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
  };
  const artifactJob = {
    jobId: 'job-hisense', sourceUrl, authorityBrand: identity.brand, authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD', priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds: [target.targetId],
  };
  const batch = {
    schemaVersion: 1, batchId: 'audit-batch-hisense', generatedAt: '2026-07-13T00:00:00.000Z',
    queue: { schemaVersion: 2, sha256: QUEUE_SHA },
    policy: { version: '2026-07-13.1', sha256: POLICY_SHA },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: [artifactJob], targets: [target],
    summary: { artifactJobs: 1, targets: 1, candidateEdges: 1 },
  };
  const inventory = {
    schemaVersion: 1,
    targetId: target.targetId,
    identity,
    completionStatus: 'complete',
    incompleteResolvers: [],
    missingBatchCandidateJobIds: [],
    resolvers: [{
      resolverId: 'batch-candidates', version: '1', scope: 'recovery_batch_graph',
      required: true, completion: 'complete', candidateCount: 1,
    }],
    activeReceiptSources: [],
    candidates: [{
      candidateId: 'candidate-hisense', sourceUrl, authorityMode: 'official',
      sourceRole: 'manufacturer_document', requiredAttempt: true,
      batchJobIds: ['job-hisense'],
      resolverRefs: [{
        resolverId: 'batch-candidates', version: '1', scope: 'recovery_batch_graph',
        discoveryMethod: 'recovery_batch', sourceRole: 'manufacturer_document', order: 0,
      }],
      outcome: { status: 'accepted', failureCode: null, source },
    }],
    candidateInventorySha256: null,
  };
  inventory.candidateInventorySha256 = computeCandidateInventorySha256(inventory);
  const geometryProjection = structuredClone(projectEvidenceGeometry({
    ...identity, formFactor: null, sources: [source],
  }));
  const outcome = {
    targetId: target.targetId,
    status: 'accepted',
    failureCode: null,
    candidateInventorySha256: inventory.candidateInventorySha256,
    candidateInventory: inventory,
    sources: [source],
    geometryProjection,
  };
  outcome.semanticOutcomeSha256 = recoveryOutcomeSemanticSha256(outcome);
  const batchSha256 = canonicalJsonSha256(batch);
  const results = {
    schemaVersion: 1,
    runId: 'audit-run-hisense',
    batchId: batch.batchId,
    batchSha256,
    queueSha256: QUEUE_SHA,
    policySha256: POLICY_SHA,
    startedAt: '2026-07-13T00:00:00.000Z',
    completedAt: '2026-07-13T00:01:00.000Z',
    semanticOutcomeSha256: canonicalJsonSha256([{
      targetId: outcome.targetId, semanticOutcomeSha256: outcome.semanticOutcomeSha256,
    }]),
    outcomes: [outcome],
    summary: { targets: 1, accepted: 1, nonScalar: 0, retryable: 0, terminal: 0 },
  };
  const state = {
    schemaVersion: 1, runId: results.runId, batchId: batch.batchId, status: 'completed',
    semanticOutcomeSha256: results.semanticOutcomeSha256,
    input: { batchSha256, queueSha256: QUEUE_SHA, policySha256: POLICY_SHA },
    artifacts: {
      [artifactJob.jobId]: {
        state: 'available', contentSha256: source.contentSha256,
        artifactRecord: {
          contentSha256: source.contentSha256,
          objectPath: source.objectPath,
          derivedArtifact: source.derivedArtifact,
        },
      },
    },
    targets: { [target.targetId]: { state: 'completed', outcome } },
  };
  const objects = new Map([
    [source.objectPath, pdfBytes],
    [source.derivedArtifact.objectPath, jsonBytes],
  ]);
  return { identity, source, target, batch, results, state, objects };
}

function emptyRunFixture() {
  const batch = {
    schemaVersion: 1, batchId: 'audit-batch-empty', generatedAt: '2026-07-13T00:02:00.000Z',
    queue: { schemaVersion: 2, sha256: QUEUE_SHA },
    policy: { version: '2026-07-13.1', sha256: POLICY_SHA },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs: [], targets: [], summary: { artifactJobs: 0, targets: 0, candidateEdges: 0 },
  };
  const results = {
    schemaVersion: 1, runId: 'audit-run-empty', batchId: batch.batchId,
    batchSha256: canonicalJsonSha256(batch), queueSha256: QUEUE_SHA, policySha256: POLICY_SHA,
    startedAt: '2026-07-13T00:02:00.000Z', completedAt: '2026-07-13T00:03:00.000Z',
    semanticOutcomeSha256: canonicalJsonSha256([]), outcomes: [],
    summary: { targets: 0, accepted: 0, nonScalar: 0, retryable: 0, terminal: 0 },
  };
  const state = {
    schemaVersion: 1, runId: results.runId, batchId: batch.batchId, status: 'completed',
    semanticOutcomeSha256: results.semanticOutcomeSha256,
    input: { batchSha256: results.batchSha256, queueSha256: QUEUE_SHA, policySha256: POLICY_SHA },
    artifacts: {}, targets: {},
  };
  return { batch, results, state, objects: new Map() };
}

function runAudit(fixture, priorBundle = null) {
  return auditHistoricalEvidenceRecovery({
    mode: 'online',
    batch: fixture.batch,
    results: fixture.results,
    state: fixture.state,
    priorBundle,
    generatedAt: '2026-07-13T00:04:00.000Z',
    readObject: async (path) => {
      if (!fixture.objects.has(path)) throw new Error(`missing object ${path}`);
      return fixture.objects.get(path);
    },
  });
}

test('online audit replays objects, inventory, receipt, semantics and geometry', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  assert.equal(audit.status, 'passed');
  assert.equal(audit.checkedTargets, 1);
  assert.equal(audit.checkedObjects, 2);
  assert.deepEqual(audit.violations, []);
});

test('claim, source, inventory, authority and batch mutations fail closed', async () => {
  const mutations = [
    (fixture) => { fixture.results.batchSha256 = 'f'.repeat(64); },
    (fixture) => { fixture.results.outcomes[0].sources[0].claims[0].value.mm += 1; },
    (fixture) => { fixture.results.outcomes[0].sources[0].authority = 'retailer'; },
    (fixture) => { fixture.results.outcomes[0].candidateInventory.completionStatus = 'discovery_incomplete'; },
    (fixture) => { fixture.results.outcomes[0].geometryProjection.verifiedFitEligible = true; },
  ];
  for (const mutate of mutations) {
    const fixture = acceptedFixture();
    mutate(fixture);
    const audit = await runAudit(fixture);
    assert.equal(audit.status, 'failed');
    assert.ok(audit.violations.length > 0);
  }
});

test('online audit replays reconciliation instead of trusting a hash-consistent accepted outcome', async () => {
  const fixture = acceptedFixture();
  fixture.target.reconciliationContext.registryHints = [{
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'c'.repeat(64),
    dimensionsMm: { width: 1790, height: 914, depth: 730 },
  }];
  const batchSha256 = canonicalJsonSha256(fixture.batch);
  fixture.results.batchSha256 = batchSha256;
  fixture.state.input.batchSha256 = batchSha256;

  const audit = await runAudit(fixture);
  assert.equal(audit.status, 'failed');
  assert.match(audit.violations.join('\n'), /reconciliation replay/i);
});

test('promotion requires a passing online audit and preserves all source receipts', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  const bundle = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit,
    priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  assert.equal(bundle.entries.length, 1);
  assert.equal(bundle.entries[0].sources.length, 1);
  assert.equal(bundle.entries[0].sources[0].verificationReceipt.schemaVersion, 3);

  assert.throws(() => promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit: { ...audit, mode: 'offline' },
    priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  }), /passing online audit/i);
});

test('later empty work batch cannot erase a prior accepted canary', async () => {
  const first = acceptedFixture();
  const firstAudit = await runAudit(first);
  const priorBundle = promoteHistoricalEvidenceRecovery({
    batch: first.batch, results: first.results, audit: firstAudit, priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const second = emptyRunFixture();
  const secondAudit = await runAudit(second, priorBundle);
  const cumulative = promoteHistoricalEvidenceRecovery({
    batch: second.batch, results: second.results, audit: secondAudit, priorBundle,
    generatedAt: '2026-07-13T00:06:00.000Z',
  });
  assert.equal(cumulative.entries.length, 1);
  assert.deepEqual(cumulative.entries[0], priorBundle.entries[0]);
  assert.equal(cumulative.lineage.length, 2);
});

test('re-promoting an already committed batch is byte-stable and idempotent', async () => {
  const fixture = acceptedFixture();
  const firstAudit = await runAudit(fixture);
  const priorBundle = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit: firstAudit,
    priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const replayAudit = await runAudit(fixture, priorBundle);
  const replayed = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit: replayAudit,
    priorBundle,
    generatedAt: '2026-07-13T00:06:00.000Z',
  });

  assert.deepEqual(replayed, priorBundle);
});

test('offline bundle audit replays receipt and projection structure without object access', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  const bundle = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch, results: fixture.results, audit, priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const offline = auditHistoricalEvidenceRecoveryBundle(bundle);
  assert.equal(offline.status, 'passed');
  assert.equal(offline.checkedEntries, 1);
  assert.equal(offline.externalObjectsOpened, 0);
});
