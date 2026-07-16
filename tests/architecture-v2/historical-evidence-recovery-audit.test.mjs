import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  auditHistoricalAcceptanceReceipts,
  auditHistoricalEvidenceRecovery,
  auditHistoricalEvidenceRecoveryBundle,
  filterHistoricalAcceptanceBundleByReceiptReplayAudit,
  promoteHistoricalEvidenceRecovery,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { buildMineruDerivedArtifact, parseMineruContentListV2 } from '../../src/domain/mineru-document.mjs';
import { verifyAndAttestResolutionArtifact } from '../../src/domain/evidence-artifact-verifier.mjs';
import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';
import { computeCandidateInventorySha256 } from '../../src/domain/evidence-candidate-inventory.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { recoveryOutcomeSemanticSha256 } from '../../src/domain/receipt-bound-evidence-batch-runner.mjs';
import { createVerificationReceipt } from '../../src/domain/evidence-source-verifier.mjs';
import { selectRecoveryQueueSnapshot } from '../../scripts/architecture-v2/audit-historical-evidence-recovery.mjs';
import { runPromotionCli } from '../../scripts/architecture-v2/promote-historical-evidence-recovery.mjs';

const QUEUE_SHA = 'a'.repeat(64);
const POLICY_SHA = 'b'.repeat(64);
const MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
const FIELDS = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
const EMPTY_RECONCILIATION = {
  conflictingFields: [], conflictHints: [], missingFields: [], supersessionViolations: [],
  axisPermutationResolution: null, lowerAuthorityResolution: null, conflictReason: null,
};

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
    selection: { jobIds: [], targetIds: [], routes: [], priorities: [], brands: [], limit: null },
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
    reconciliation: structuredClone(EMPTY_RECONCILIATION),
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
    selection: { jobIds: [], targetIds: [], routes: [], priorities: [], brands: [], limit: null },
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

function runAudit(fixture, priorBundle = null, replayPriorObjects = false, policy = null) {
  return auditHistoricalEvidenceRecovery({
    mode: 'online',
    batch: fixture.batch,
    results: fixture.results,
    state: fixture.state,
    priorBundle,
    policy,
    generatedAt: '2026-07-13T00:04:00.000Z',
    replayPriorObjects,
    readObject: async (path) => {
      if (!fixture.objects.has(path)) throw new Error(`missing object ${path}`);
      return fixture.objects.get(path);
    },
  });
}

async function legacyMisparsedBundle(fixture, options = {}) {
  const initialAudit = await runAudit(fixture);
  const bundle = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit: initialAudit,
    priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const oldSource = structuredClone(bundle.entries[0].sources[0]);
  delete oldSource.verificationReceipt;
  if (options.sourceUrl) {
    oldSource.sourceUrl = options.sourceUrl;
    oldSource.finalUrl = options.sourceUrl;
  }
  oldSource.claims.find((claim) => claim.field === 'closedEnvelope.depthMm').value.mm += 1;
  oldSource.verificationReceipt = createVerificationReceipt(oldSource, fixture.identity, {
    verifiedAt: fixture.source.verificationReceipt.verifiedAt,
    claimSemanticsVersion: 2,
  });
  bundle.entries[0].sources = [oldSource];
  bundle.entries[0].geometryProjection = structuredClone(projectEvidenceGeometry({
    ...fixture.identity,
    formFactor: null,
    sources: [oldSource],
  }));
  assert.equal(auditHistoricalEvidenceRecoveryBundle(bundle).status, 'passed');

  fixture.batch.batchId = `${fixture.batch.batchId}-repair`;
  fixture.results.batchId = fixture.batch.batchId;
  fixture.results.runId = `${fixture.results.runId}-repair`;
  fixture.results.batchSha256 = canonicalJsonSha256(fixture.batch);
  fixture.state.batchId = fixture.batch.batchId;
  fixture.state.runId = fixture.results.runId;
  fixture.state.input.batchSha256 = fixture.results.batchSha256;
  return bundle;
}

test('audit queue discovery selects the snapshot bound by the batch SHA', () => {
  const legacyQueue = { schemaVersion: 2, jobs: [{ id: 'legacy' }] };
  const executableQueue = { schemaVersion: 2, jobs: [{ id: 'executable' }] };
  const batch = { queue: { sha256: canonicalJsonSha256(executableQueue) } };
  assert.deepEqual(selectRecoveryQueueSnapshot(batch, [
    { path: '/legacy.json', value: legacyQueue },
    { path: '/executable.json', value: executableQueue },
  ]), executableQueue);
  assert.throws(() => selectRecoveryQueueSnapshot(batch, [
    { path: '/legacy.json', value: legacyQueue },
  ]), /matching queue snapshot/i);
});

test('online audit replays objects, inventory, receipt, semantics and geometry', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  assert.equal(audit.status, 'passed', audit.violations.join('\n'));
  assert.equal(audit.checkedTargets, 1);
  assert.equal(audit.checkedObjects, 2);
  assert.deepEqual(audit.violations, []);
});

test('acceptance receipt replay emits structured pass and parser-drift outcomes', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  const bundle = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch, results: fixture.results, audit, priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const readObject = async (path) => fixture.objects.get(path);
  const passing = await auditHistoricalAcceptanceReceipts({
    bundle, generatedAt: '2026-07-13T00:06:00.000Z', readObject,
  });
  assert.deepEqual(passing.summary, { entries: 1, sources: 1, passed: 1, failed: 0 });
  assert.equal(passing.outcomes[0].status, 'passed');
  assert.equal(filterHistoricalAcceptanceBundleByReceiptReplayAudit(bundle, passing).bundle.entries.length, 1);

  const drifted = await legacyMisparsedBundle(fixture);
  const failing = await auditHistoricalAcceptanceReceipts({
    bundle: drifted, generatedAt: '2026-07-13T00:07:00.000Z', readObject,
  });
  assert.deepEqual(failing.summary, { entries: 1, sources: 1, passed: 0, failed: 1 });
  assert.equal(failing.outcomes[0].status, 'failed');
  assert.equal(failing.outcomes[0].failureCode, 'claim_replay_mismatch');
  const filtered = filterHistoricalAcceptanceBundleByReceiptReplayAudit(drifted, failing);
  assert.equal(filtered.bundle.entries.length, 0);
  assert.deepEqual(filtered.excludedTargetIds, [fixture.target.targetId]);
});

test('claim, source, inventory, authority and batch mutations fail closed', async () => {
  const mutations = [
    (fixture) => { fixture.results.batchSha256 = 'f'.repeat(64); },
    (fixture) => { fixture.results.outcomes[0].sources[0].claims[0].value.mm += 1; },
    (fixture) => { fixture.results.outcomes[0].sources[0].authority = 'retailer'; },
    (fixture) => { fixture.results.outcomes[0].candidateInventory.completionStatus = 'discovery_incomplete'; },
    (fixture) => { fixture.results.outcomes[0].geometryProjection.verifiedFitEligible = true; },
    (fixture) => { fixture.results.outcomes[0].reconciliation.lowerAuthorityResolution = 'independent_official_dimension_corroboration'; },
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

test('online audit replays registry permutation tolerance from the hash-bound policy', async () => {
  const fixture = acceptedFixture();
  const policy = JSON.parse(await readFile(
    'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
    'utf8',
  ));
  fixture.target.reconciliationContext.registryHints = [{
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'c'.repeat(64),
    dimensionsMm: { width: 1795, height: 914, depth: 727 },
  }];
  fixture.results.outcomes[0].reconciliation = {
    ...structuredClone(EMPTY_RECONCILIATION),
    conflictHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating:fridge',
      kind: 'axis_permutation_within_tolerance',
      fields: ['depthMm', 'heightMm', 'widthMm'],
      dimensionsMm: { widthMm: 1795, heightMm: 914, depthMm: 727 },
      maximumDeltaMm: 5,
    }],
    axisPermutationResolution: 'exact_official_axis_proof_with_registry_tolerance',
  };
  fixture.results.outcomes[0].semanticOutcomeSha256 = recoveryOutcomeSemanticSha256(
    fixture.results.outcomes[0],
  );
  fixture.results.semanticOutcomeSha256 = canonicalJsonSha256([{
    targetId: fixture.results.outcomes[0].targetId,
    semanticOutcomeSha256: fixture.results.outcomes[0].semanticOutcomeSha256,
  }]);
  fixture.batch.policy = {
    version: policy.policyVersion,
    sha256: canonicalJsonSha256(policy),
  };
  fixture.results.policySha256 = fixture.batch.policy.sha256;
  fixture.results.batchSha256 = canonicalJsonSha256(fixture.batch);
  fixture.state.input.policySha256 = fixture.batch.policy.sha256;
  fixture.state.input.batchSha256 = fixture.results.batchSha256;
  fixture.state.semanticOutcomeSha256 = fixture.results.semanticOutcomeSha256;

  const withoutPolicy = await runAudit(fixture);
  assert.equal(withoutPolicy.status, 'failed');
  assert.match(withoutPolicy.violations.join('\n'), /reconciliation replay/i);

  const withPolicy = await runAudit(fixture, null, false, policy);
  assert.equal(withPolicy.status, 'passed');
  assert.deepEqual(withPolicy.violations, []);
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
  assert.deepEqual(bundle.entries[0].reconciliation, EMPTY_RECONCILIATION);

  assert.throws(() => promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit: { ...audit, mode: 'offline' },
    priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  }), /passing online audit/i);
});

test('promotion CLI receipt-audits the prospective cumulative bundle before publishing it', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-promotion-'));
  const runDirectory = join(storageRoot, 'runs/historical-evidence-recovery', fixture.results.runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(runDirectory, 'batch.json'), `${JSON.stringify(fixture.batch)}\n`);
  for (const [relativePath, bytes] of fixture.objects) {
    const absolutePath = join(storageRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
  }
  const resultsPath = join(storageRoot, 'results.json');
  const auditPath = join(storageRoot, 'audit.json');
  const bundlePath = join(storageRoot, 'bundle.json');
  const receiptAuditPath = join(storageRoot, 'receipt-audit.json');
  const attemptLedgerPath = join(storageRoot, 'attempt-ledger.json');
  await writeFile(resultsPath, `${JSON.stringify(fixture.results)}\n`);
  await writeFile(auditPath, `${JSON.stringify(audit)}\n`);

  const bundle = await runPromotionCli({
    results: resultsPath,
    audit: auditPath,
    bundle: bundlePath,
    receiptAudit: receiptAuditPath,
    attemptLedger: attemptLedgerPath,
    storageRoot,
  });
  const persistedBundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const receiptAudit = JSON.parse(await readFile(receiptAuditPath, 'utf8'));
  const attemptLedger = JSON.parse(await readFile(attemptLedgerPath, 'utf8'));
  assert.equal(bundle.entries.length, 1);
  assert.deepEqual(persistedBundle, bundle);
  assert.deepEqual(receiptAudit.summary, { entries: 1, sources: 1, passed: 1, failed: 0 });
  assert.equal(receiptAudit.sourceBundleSha256, canonicalJsonSha256(bundle));
  assert.deepEqual(attemptLedger.summary, {
    entries: 0,
    targetAttempts: 0,
    resolutions: 0,
    sourceAcceptances: 1,
    suppressions: 0,
    resolverOnlySuppressions: 0,
    resolvedSuppressions: 0,
    retryable: 0,
    byStatus: {},
    byDisposition: {},
  });
});

test('promotion CLI keeps a failed prospective receipt replay out of the bundle and attempt ledger', async () => {
  const fixture = acceptedFixture();
  const audit = await runAudit(fixture);
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-promotion-failure-'));
  const runDirectory = join(storageRoot, 'runs/historical-evidence-recovery', fixture.results.runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(runDirectory, 'batch.json'), `${JSON.stringify(fixture.batch)}\n`);
  for (const [relativePath, bytes] of fixture.objects) {
    if (relativePath === fixture.source.derivedArtifact.objectPath) continue;
    const absolutePath = join(storageRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
  }
  const resultsPath = join(storageRoot, 'results.json');
  const auditPath = join(storageRoot, 'audit.json');
  const bundlePath = join(storageRoot, 'bundle.json');
  const receiptAuditPath = join(storageRoot, 'receipt-audit.json');
  const attemptLedgerPath = join(storageRoot, 'attempt-ledger.json');
  await writeFile(resultsPath, `${JSON.stringify(fixture.results)}\n`);
  await writeFile(auditPath, `${JSON.stringify(audit)}\n`);

  await assert.rejects(() => runPromotionCli({
    results: resultsPath,
    audit: auditPath,
    bundle: bundlePath,
    receiptAudit: receiptAuditPath,
    attemptLedger: attemptLedgerPath,
    storageRoot,
  }), /prospective receipt replay failed/i);

  const receiptAudit = JSON.parse(await readFile(receiptAuditPath, 'utf8'));
  assert.deepEqual(receiptAudit.summary, { entries: 1, sources: 1, passed: 0, failed: 1 });
  await assert.rejects(readFile(bundlePath, 'utf8'), { code: 'ENOENT' });
  await assert.rejects(readFile(attemptLedgerPath, 'utf8'), { code: 'ENOENT' });
});

test('full audit repairs a legacy misparse only from the identical immutable artifact', async () => {
  const fixture = acceptedFixture();
  const priorBundle = await legacyMisparsedBundle(fixture);
  const audit = await runAudit(fixture, priorBundle, true);

  assert.equal(audit.status, 'passed');
  assert.deepEqual(audit.violations, []);
  assert.equal(audit.repairs.length, 1);
  assert.equal(audit.repairs[0].targetId, fixture.target.targetId);
  assert.equal(audit.repairs[0].priorEntrySha256, canonicalJsonSha256(priorBundle.entries[0]));
  assert.equal(audit.repairs[0].replacementOutcomeSha256, fixture.results.outcomes[0].semanticOutcomeSha256);

  const repaired = promoteHistoricalEvidenceRecovery({
    batch: fixture.batch,
    results: fixture.results,
    audit,
    priorBundle,
    generatedAt: '2026-07-13T00:06:00.000Z',
  });
  assert.deepEqual(repaired.entries[0].geometryProjection, fixture.results.outcomes[0].geometryProjection);
  assert.equal(repaired.entries[0].sourceBatchId, fixture.batch.batchId);
});

test('legacy repair allows a rederived MinerU artifact only when the raw artifact binding is unchanged', async () => {
  const fixture = acceptedFixture();
  const priorBundle = await legacyMisparsedBundle(fixture);
  const oldSource = priorBundle.entries[0].sources[0];
  delete oldSource.verificationReceipt;
  oldSource.derivedArtifact = {
    ...oldSource.derivedArtifact,
    profileId: 'pipeline-auto-v1',
  };
  oldSource.verificationReceipt = createVerificationReceipt(oldSource, fixture.identity, {
    verifiedAt: fixture.source.verificationReceipt.verifiedAt,
    claimSemanticsVersion: 2,
  });
  priorBundle.entries[0].geometryProjection = structuredClone(projectEvidenceGeometry({
    ...fixture.identity,
    formFactor: null,
    sources: [oldSource],
  }));

  const audit = await runAudit(fixture, priorBundle, true);
  assert.equal(audit.status, 'passed', audit.violations.join('\n'));
  assert.equal(audit.repairs.length, 1);
  assert.equal(
    audit.repairs[0].reason,
    'receipt_rederived_from_identical_raw_artifact_with_verified_corroboration',
  );
});

test('legacy repair rejects a different source binding even when raw content is identical', async () => {
  const fixture = acceptedFixture();
  const priorBundle = await legacyMisparsedBundle(fixture, {
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf?legacy=1',
  });
  const audit = await runAudit(fixture, priorBundle, true);

  assert.equal(audit.status, 'failed');
  assert.deepEqual(audit.repairs ?? [], []);
  assert.match(audit.violations.join('\n'), /prior object/i);
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

test('policy migration requires a passing audit that replays every prior object', async () => {
  const first = acceptedFixture();
  const firstAudit = await runAudit(first);
  const priorBundle = promoteHistoricalEvidenceRecovery({
    batch: first.batch, results: first.results, audit: firstAudit, priorBundle: null,
    generatedAt: '2026-07-13T00:05:00.000Z',
  });
  const second = emptyRunFixture();
  const nextPolicySha = 'c'.repeat(64);
  second.batch.policy = { version: '2026-07-14.1', sha256: nextPolicySha };
  second.results.batchSha256 = canonicalJsonSha256(second.batch);
  second.results.policySha256 = nextPolicySha;
  second.state.input.batchSha256 = second.results.batchSha256;
  second.state.input.policySha256 = nextPolicySha;
  second.objects = first.objects;

  const shallowAudit = await runAudit(second, priorBundle, false);
  assert.throws(() => promoteHistoricalEvidenceRecovery({
    batch: second.batch, results: second.results, audit: shallowAudit, priorBundle,
    generatedAt: '2026-07-13T00:06:00.000Z',
  }), /policy drift/i);

  const fullAudit = await runAudit(second, priorBundle, true);
  const migrated = promoteHistoricalEvidenceRecovery({
    batch: second.batch, results: second.results, audit: fullAudit, priorBundle,
    generatedAt: '2026-07-13T00:06:00.000Z',
  });
  assert.equal(migrated.policySha256, nextPolicySha);
  assert.deepEqual(migrated.entries, priorBundle.entries);
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
