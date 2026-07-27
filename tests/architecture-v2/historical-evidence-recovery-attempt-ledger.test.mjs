import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeHistoricalAttemptSuppressions,
  activeHistoricalResolverSuppressions,
  activeHistoricalSourceAcceptances,
  activeHistoricalTargetConflicts,
  buildHistoricalEvidenceRecoveryAttemptLedger,
  historicalResolverContractSha256,
  migrateHistoricalAttemptLedgerProcessorEpochs,
} from '../../src/domain/historical-evidence-recovery-attempt-ledger.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from '../../src/domain/beko-product-page-dimensions.mjs';
import { ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY } from '../../src/domain/mineru-document.mjs';
import {
  MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY,
} from '../../src/domain/official-product-material-discovery-evidence.mjs';

const SHA = (value) => value.repeat(64);

function fixture() {
  const target = {
    targetId: 'target-fp', referenceId: 'reference-fp', legacyRuntimeId: 'legacy-fp',
    canonicalProductId: 'product-fp', brand: 'Fisher & Paykel', model: 'RF610ADUQSX4',
    category: 'fridge', lifecycleState: 'CURRENT_RETAIL',
  };
  const sourceUrl = 'https://www.fisherpaykel.com/QRG-AU-26493.pdf';
  const batch = {
    schemaVersion: 1, batchId: 'batch-fp', queue: { sha256: SHA('a') },
    policy: { sha256: SHA('b') }, targets: [target],
  };
  const candidateInventory = {
    candidates: [{
      sourceUrl, authorityMode: 'official', requiredAttempt: true, batchJobIds: ['job-fp'],
      outcome: {
        status: 'identity_rejected', failureCode: 'identity',
        reason: 'document identifies RF610ADUB5, not RF610ADUQSX4', source: null,
        artifactBinding: {
          sourceUrl, finalUrl: sourceUrl, contentSha256: SHA('c'),
          objectPath: `evidence/web/sha256/cc/cc/${SHA('c')}.pdf`,
          contentType: 'application/pdf', byteSize: 123,
        },
      },
    }],
  };
  const results = {
    schemaVersion: 1, runId: 'run-fp', batchId: batch.batchId,
    batchSha256: canonicalJsonSha256(batch), queueSha256: batch.queue.sha256,
    policySha256: batch.policy.sha256, completedAt: '2026-07-16T01:00:00.000Z',
    outcomes: [{
      targetId: target.targetId, status: 'identity_rejected', failureCode: 'identity',
      candidateInventorySha256: SHA('d'), candidateInventory,
      semanticOutcomeSha256: SHA('e'),
    }],
  };
  const audit = {
    mode: 'online', status: 'passed', batchId: batch.batchId,
    batchSha256: results.batchSha256, resultsSha256: canonicalJsonSha256(results),
    semanticAuditSha256: SHA('f'),
  };
  return { batch, results, audit, sourceUrl };
}

test('audited terminal candidate is appended once with immutable source and run bindings', () => {
  const input = fixture();
  const first = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.equal(first.entries.length, 1);
  assert.equal(first.entries[0].referenceId, 'reference-fp');
  assert.equal(first.entries[0].sourceUrl, input.sourceUrl);
  assert.equal(first.entries[0].contentSha256, SHA('c'));
  assert.equal(first.entries[0].disposition, 'SEEK_ALTERNATIVE_OFFICIAL_SOURCE');
  assert.equal(first.entries[0].suppressesSamePolicySource, true);

  const second = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input,
    audit: { ...input.audit, semanticAuditSha256: SHA('9') },
    priorLedger: first,
    generatedAt: '2026-07-16T01:02:00.000Z',
  });
  assert.deepEqual(second.entries, first.entries);
  assert.equal(second.summary.entries, 1);
});

test('new Beko HTML attempts bind the processor epoch from the immutable completed run state', () => {
  const input = fixture();
  const target = input.batch.targets[0];
  target.brand = 'Beko';
  target.model = 'BBM450X';
  const candidate = input.results.outcomes[0].candidateInventory.candidates[0];
  candidate.sourceUrl = 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x';
  candidate.outcome.status = 'claims_incomplete';
  candidate.outcome.failureCode = 'claim_semantics';
  candidate.outcome.artifactBinding.sourceUrl = candidate.sourceUrl;
  candidate.outcome.artifactBinding.finalUrl = candidate.sourceUrl;
  input.results.outcomes[0].status = 'claims_incomplete';
  input.results.outcomes[0].failureCode = 'claim_semantics';
  input.results.batchSha256 = canonicalJsonSha256(input.batch);
  input.audit.batchSha256 = input.results.batchSha256;
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);
  const toolchain = {
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('7') },
  };
  const state = {
    schemaVersion: 1, runId: input.results.runId, batchId: input.batch.batchId, status: 'completed',
    input: {
      batchSha256: input.results.batchSha256,
      policySha256: input.results.policySha256,
      toolchainSha256: canonicalJsonSha256(toolchain),
      toolchain,
    },
  };

  const ledger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, state, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.equal(ledger.entries[0].processorCapability, BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY);
  assert.equal(ledger.entries[0].evidenceProcessorSha256, SHA('7'));
});

test('the same candidate failure in a later run appends a distinct immutable attempt', () => {
  const input = fixture();
  const first = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  const replayed = structuredClone(input);
  replayed.results.runId = 'run-fp-replayed';
  replayed.results.completedAt = '2026-07-16T02:00:00.000Z';
  replayed.audit.resultsSha256 = canonicalJsonSha256(replayed.results);
  replayed.audit.semanticAuditSha256 = SHA('9');

  const second = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...replayed, priorLedger: first, generatedAt: '2026-07-16T02:01:00.000Z',
  });

  assert.equal(second.entries.length, 2);
  assert.equal(new Set(second.entries.map((entry) => entry.attemptId)).size, 2);
  assert.deepEqual(
    new Set(second.entries.map((entry) => entry.runId)),
    new Set(['run-fp', 'run-fp-replayed']),
  );
});

test('transient transport failures remain retryable and suppressed candidates are not re-recorded', () => {
  const input = fixture();
  input.results.outcomes[0].candidateInventory.candidates.push({
    sourceUrl: 'https://www.fisherpaykel.com/transient.pdf',
    authorityMode: 'official', requiredAttempt: true, batchJobIds: [],
    outcome: { status: 'transport_failure', failureCode: 'transport', reason: 'timeout', source: null },
  }, {
    sourceUrl: 'https://www.fisherpaykel.com/already-known.pdf',
    authorityMode: 'official', requiredAttempt: true, batchJobIds: [],
    outcome: {
      status: 'previous_terminal_suppressed', failureCode: 'identity',
      reason: 'prior_terminal_evidence_unchanged', source: null,
    },
  });
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);
  const ledger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });

  assert.equal(ledger.entries.length, 2);
  const transport = ledger.entries.find((entry) => entry.failureCode === 'transport');
  assert.equal(transport.suppressesSamePolicySource, false);
  assert.equal(transport.disposition, 'RETRY_TRANSIENT');
  assert.deepEqual(ledger.targetAttempts, []);
});

test('a complete zero-candidate resolver pass creates one source-bound target suppression', () => {
  const input = fixture();
  const result = input.results.outcomes[0];
  result.status = 'claims_incomplete';
  result.failureCode = 'source_authority';
  result.candidateInventory.candidates = [];
  result.candidateInventory.completionStatus = 'complete';
  result.candidateInventory.incompleteResolvers = [];
  result.candidateInventory.missingBatchCandidateJobIds = [];
  result.candidateInventory.resolvers = [{
    resolverId: 'asko-official-manuals-api', version: '1', required: true,
    scope: 'asko_legacy_discovery_only', completion: 'complete', candidateCount: 0,
  }];
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);

  const first = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.equal(first.targetAttempts.length, 1);
  assert.equal(first.targetAttempts[0].suppressesSamePolicyResolverOnly, true);
  assert.equal(first.targetAttempts[0].disposition, 'AWAIT_RESOLVER_OR_POLICY_CHANGE');
  assert.equal(first.summary.resolverOnlySuppressions, 1);
  assert.equal(activeHistoricalResolverSuppressions({
    ledger: first,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('b'),
    resolverContractSha256: historicalResolverContractSha256(result.candidateInventory.resolvers),
  }).length, 1);

  const second = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input,
    audit: { ...input.audit, semanticAuditSha256: SHA('9') },
    priorLedger: first,
    generatedAt: '2026-07-16T01:02:00.000Z',
  });
  assert.deepEqual(second.targetAttempts, first.targetAttempts);
  assert.deepEqual(activeHistoricalResolverSuppressions({
    ledger: second,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('9'),
    resolverContractSha256: historicalResolverContractSha256(result.candidateInventory.resolvers),
  }).map((entry) => entry.targetAttemptId), [first.targetAttempts[0].targetAttemptId]);
  assert.deepEqual(activeHistoricalResolverSuppressions({
    ledger: second,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('b'),
    resolverContractSha256: historicalResolverContractSha256([{
      ...result.candidateInventory.resolvers[0], version: '2',
    }]),
  }).map((entry) => entry.targetAttemptId), [first.targetAttempts[0].targetAttemptId]);
});

test('a complete exhausted inventory of reference and terminal candidates suppresses resolver-only reruns', () => {
  const input = fixture();
  const result = input.results.outcomes[0];
  result.status = 'claims_incomplete';
  result.failureCode = 'source_authority';
  result.candidateInventory.candidates.push({
    sourceUrl: 'https://www.fisherpaykel.com/nz/support/products/reference-only',
    authorityMode: 'reference', requiredAttempt: false, batchJobIds: [],
    outcome: {
      status: 'reference_only', failureCode: 'source_authority',
      reason: 'outside Australian publication policy', source: null,
    },
  });
  result.candidateInventory.completionStatus = 'complete';
  result.candidateInventory.incompleteResolvers = [];
  result.candidateInventory.missingBatchCandidateJobIds = [];
  result.candidateInventory.resolvers = [{
    resolverId: 'fisher-paykel-official-support', version: '6', required: true,
    scope: 'exact_model_product_page_and_support_documents', completion: 'complete', candidateCount: 2,
  }];
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);

  const ledger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });

  assert.equal(ledger.targetAttempts.length, 1);
  assert.equal(ledger.targetAttempts[0].reason, 'complete_exhausted_candidate_inventory');
  assert.equal(ledger.targetAttempts[0].suppressesSamePolicyResolverOnly, true);
  assert.equal(ledger.summary.resolverOnlySuppressions, 1);
  assert.deepEqual(activeHistoricalResolverSuppressions({
    ledger,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('9'),
    resolverContractSha256: historicalResolverContractSha256(result.candidateInventory.resolvers),
  }), []);
});

test('a complete target-level reconciliation conflict persists until a later accepted result resolves it', () => {
  const input = fixture();
  const result = input.results.outcomes[0];
  result.status = 'conflict_quarantined';
  result.failureCode = 'conflict';
  result.reconciliation = {
    conflictingFields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm'],
  };
  result.candidateInventory.completionStatus = 'complete';
  result.candidateInventory.incompleteResolvers = [];
  result.candidateInventory.missingBatchCandidateJobIds = [];
  result.candidateInventory.resolvers = [{
    resolverId: 'official-material-pair', version: '1', required: true,
    scope: 'official_product_page_and_pdf', completion: 'complete', candidateCount: 2,
  }];
  result.candidateInventory.candidates = [
    {
      sourceUrl: 'https://manufacturer.example/product/model-a',
      authorityMode: 'official', requiredAttempt: true, batchJobIds: [],
      outcome: { status: 'accepted', failureCode: null, source: { contentSha256: SHA('1') } },
    },
    {
      sourceUrl: 'https://manufacturer.example/specs/model-a.pdf',
      authorityMode: 'official', requiredAttempt: true, batchJobIds: [],
      outcome: { status: 'accepted', failureCode: null, source: { contentSha256: SHA('2') } },
    },
  ];
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);

  const conflicted = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.equal(conflicted.targetAttempts.length, 1);
  assert.equal(conflicted.targetAttempts[0].reason, 'complete_conflicting_candidate_inventory');
  assert.equal(conflicted.targetAttempts[0].disposition, 'RUN_CONFLICT_CLOSURE');
  assert.deepEqual(conflicted.targetAttempts[0].conflictingFields, [
    'closedEnvelope.heightMm', 'closedEnvelope.widthMm',
  ]);
  assert.deepEqual(
    activeHistoricalTargetConflicts({ ledger: conflicted }).map((entry) => entry.referenceId),
    ['reference-fp'],
  );

  const resolvedInput = structuredClone(input);
  resolvedInput.results.runId = 'run-fp-conflict-resolved';
  resolvedInput.results.completedAt = '2026-07-16T02:00:00.000Z';
  resolvedInput.results.outcomes[0].status = 'accepted';
  resolvedInput.results.outcomes[0].failureCode = null;
  resolvedInput.results.outcomes[0].reconciliation = { conflictingFields: [] };
  resolvedInput.audit.resultsSha256 = canonicalJsonSha256(resolvedInput.results);
  resolvedInput.audit.semanticAuditSha256 = SHA('9');
  const resolved = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...resolvedInput,
    priorLedger: conflicted,
    generatedAt: '2026-07-16T02:01:00.000Z',
  });
  assert.equal(resolved.targetAttemptResolutions.length, 1);
  assert.equal(
    resolved.targetAttemptResolutions[0].targetAttemptId,
    conflicted.targetAttempts[0].targetAttemptId,
  );
  assert.deepEqual(activeHistoricalTargetConflicts({ ledger: resolved }), []);
});

test('an incomplete zero-candidate resolver pass remains retryable', () => {
  const input = fixture();
  const result = input.results.outcomes[0];
  result.status = 'retryable_failure';
  result.failureCode = 'discovery_incomplete';
  result.candidateInventory.candidates = [];
  result.candidateInventory.completionStatus = 'incomplete';
  result.candidateInventory.incompleteResolvers = ['asko-official-manuals-api'];
  result.candidateInventory.resolvers = [{
    resolverId: 'asko-official-manuals-api', version: '1', required: true,
    scope: 'asko_legacy_discovery_only', completion: 'incomplete', candidateCount: 0,
  }];
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);

  const ledger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.deepEqual(ledger.targetAttempts, []);
  assert.equal(ledger.summary.resolverOnlySuppressions, 0);
});

test('a claim parser revision change invalidates same-policy terminal suppression', () => {
  const input = fixture();
  const firstPolicySha = canonicalJsonSha256({
    parser: { claimParserRevision: '2026-07-16.1' },
  });
  input.batch.policy.sha256 = firstPolicySha;
  input.results.policySha256 = firstPolicySha;
  input.results.batchSha256 = canonicalJsonSha256(input.batch);
  input.audit.batchSha256 = input.results.batchSha256;
  input.audit.resultsSha256 = canonicalJsonSha256(input.results);

  const ledger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  assert.equal(activeHistoricalAttemptSuppressions({
    ledger,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: firstPolicySha,
  }).length, 1);

  const nextPolicySha = canonicalJsonSha256({
    parser: { claimParserRevision: '2026-07-16.2' },
  });
  assert.notEqual(nextPolicySha, firstPolicySha);
  assert.deepEqual(activeHistoricalAttemptSuppressions({
    ledger,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: nextPolicySha,
  }), []);
});

test('only a changed bounded Beko HTML processor epoch reopens its claim-semantics source', () => {
  const policySha256 = SHA('b');
  const sourceUrl = 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x';
  const ledger = {
    schemaVersion: 1,
    entries: [{
      attemptId: 'attempt-beko-html', targetId: 'target-beko', referenceId: 'reference-beko',
      brand: 'Beko', sourceUrl, contentSha256: SHA('c'),
      status: 'claims_incomplete', failureCode: 'claim_semantics', policySha256,
      suppressesSamePolicySource: true,
      processorCapability: BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY,
      evidenceProcessorSha256: SHA('1'),
    }, {
      attemptId: 'attempt-beko-pdf', targetId: 'target-beko', referenceId: 'reference-beko',
      brand: 'Beko', sourceUrl: 'https://www.beko.com/content/manual.pdf', contentSha256: SHA('d'),
      status: 'identity_rejected', failureCode: 'identity', policySha256,
      suppressesSamePolicySource: true,
    }],
  };
  assert.equal(activeHistoricalAttemptSuppressions({
    ledger, targetId: 'target-beko', referenceId: 'reference-beko', policySha256,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('1') },
  }).length, 2);

  const changed = activeHistoricalAttemptSuppressions({
    ledger, targetId: 'target-beko', referenceId: 'reference-beko', policySha256,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('2') },
  });
  assert.deepEqual(changed.map((entry) => entry.sourceUrl), ['https://www.beko.com/content/manual.pdf']);
});

test('only a changed Miele material-bound identity epoch reopens its official specs PDF', () => {
  const policySha256 = SHA('b');
  const sourceUrl = 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf';
  const ledger = {
    schemaVersion: 1,
    entries: [{
      attemptId: 'attempt-miele-specs', targetId: 'target-miele', referenceId: 'reference-miele',
      brand: 'Miele', sourceUrl, contentSha256: SHA('c'),
      status: 'identity_rejected', failureCode: 'identity', policySha256,
      suppressesSamePolicySource: true,
      processorCapability: MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY,
      evidenceProcessorSha256: SHA('1'),
    }],
  };
  assert.equal(activeHistoricalAttemptSuppressions({
    ledger, targetId: 'target-miele', referenceId: 'reference-miele', policySha256,
    evidenceProcessorEpochs: { [MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY]: SHA('1') },
  }).length, 1);
  assert.deepEqual(activeHistoricalAttemptSuppressions({
    ledger, targetId: 'target-miele', referenceId: 'reference-miele', policySha256,
    evidenceProcessorEpochs: { [MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY]: SHA('2') },
  }), []);
});

test('a changed bounded source processor reopens a complete-exhausted resolver target but not complete-zero discovery', () => {
  const policySha256 = SHA('b');
  const resolver = [{
    resolverId: 'beko-product-page', version: '1', scope: 'exact-model', required: true,
  }];
  const targetAttempt = {
    targetAttemptId: 'target-attempt-beko', targetId: 'target-beko', referenceId: 'reference-beko',
    reason: 'complete_exhausted_candidate_inventory', policySha256,
    suppressesSamePolicyResolverOnly: true, resolvers: resolver,
  };
  const sourceAttempt = {
    attemptId: 'attempt-beko-html', targetId: 'target-beko', referenceId: 'reference-beko',
    brand: 'Beko',
    sourceUrl: 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x',
    contentSha256: SHA('c'), status: 'claims_incomplete', failureCode: 'claim_semantics',
    policySha256, suppressesSamePolicySource: true,
    processorCapability: BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY,
    evidenceProcessorSha256: SHA('1'),
  };
  const ledger = { schemaVersion: 1, entries: [sourceAttempt], targetAttempts: [targetAttempt] };
  const input = {
    ledger, targetId: 'target-beko', referenceId: 'reference-beko', policySha256,
    resolverContractSha256: historicalResolverContractSha256(resolver),
  };
  assert.equal(activeHistoricalResolverSuppressions({
    ...input,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('1') },
  }).length, 1);
  assert.deepEqual(activeHistoricalResolverSuppressions({
    ...input,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('2') },
  }), []);

  ledger.targetAttempts[0].reason = 'complete_zero_candidate_inventory';
  assert.equal(activeHistoricalResolverSuppressions({
    ...input,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('2') },
  }).length, 1);
});

test('an Esatto ProductCard parser epoch reopens only its failed PDF edge and exhausted target', () => {
  const policySha256 = SHA('b');
  const productCardUrl = 'https://esatto.house/s/Esatto_ProductCard_EDW7CS.pdf';
  const manualUrl = 'https://esatto.house/s/EDW7CS_UserManual_V30_0223.pdf';
  const capability = ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY;
  const sourceAttempt = {
    attemptId: 'attempt-esatto-product-card',
    targetId: 'target-esatto',
    referenceId: 'reference-esatto',
    brand: 'Esatto',
    sourceUrl: productCardUrl,
    contentSha256: SHA('c'),
    status: 'mineru_failure',
    failureCode: 'mineru',
    policySha256,
    suppressesSamePolicySource: true,
    processorCapability: capability,
    evidenceProcessorSha256: SHA('1'),
  };
  const ledger = {
    schemaVersion: 1,
    entries: [
      sourceAttempt,
      {
        ...sourceAttempt,
        attemptId: 'attempt-esatto-manual',
        sourceUrl: manualUrl,
        contentSha256: SHA('d'),
        processorCapability: undefined,
        evidenceProcessorSha256: undefined,
      },
    ],
    targetAttempts: [{
      targetAttemptId: 'target-attempt-esatto',
      targetId: 'target-esatto',
      referenceId: 'reference-esatto',
      reason: 'complete_exhausted_candidate_inventory',
      policySha256,
      suppressesSamePolicyResolverOnly: true,
      resolvers: [{
        resolverId: 'esatto-official-discovery',
        version: '2',
        scope: 'exact-model',
        required: true,
      }],
    }],
  };
  const current = {
    ledger,
    targetId: 'target-esatto',
    referenceId: 'reference-esatto',
    policySha256,
    evidenceProcessorEpochs: { [capability]: SHA('2') },
  };

  assert.deepEqual(
    activeHistoricalAttemptSuppressions(current).map((entry) => entry.sourceUrl),
    [manualUrl],
  );
  assert.deepEqual(activeHistoricalResolverSuppressions({
    ...current,
    resolverContractSha256: historicalResolverContractSha256(
      ledger.targetAttempts[0].resolvers,
    ),
  }), []);
});

test('missing historical processor binding fails closed instead of creating a retry loop', () => {
  const policySha256 = SHA('b');
  const sourceUrl = 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x';
  const ledger = {
    schemaVersion: 1,
    entries: [{
      attemptId: 'attempt-unbound', targetId: 'target-beko', referenceId: 'reference-beko',
      brand: 'Beko', sourceUrl, contentSha256: SHA('c'),
      status: 'claims_incomplete', failureCode: 'claim_semantics', policySha256,
      suppressesSamePolicySource: true,
    }],
  };
  assert.equal(activeHistoricalAttemptSuppressions({
    ledger, targetId: 'target-beko', referenceId: 'reference-beko', policySha256,
    evidenceProcessorEpochs: { [BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]: SHA('2') },
  }).length, 1);
});

test('legacy processor migration binds only audited run-state facts and is idempotent', () => {
  const policySha256 = SHA('b');
  const toolchain = { runnerVersion: 'legacy' };
  const toolchainSha256 = canonicalJsonSha256(toolchain);
  const ledger = {
    schemaVersion: 1,
    entries: [{
      attemptId: 'attempt-unbound', targetId: 'target-beko', referenceId: 'reference-beko',
      brand: 'Beko', sourceUrl: 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x',
      contentSha256: SHA('c'), status: 'claims_incomplete', failureCode: 'claim_semantics',
      policySha256, suppressesSamePolicySource: true, runId: 'run-beko',
      batchId: 'batch-beko', batchSha256: SHA('a'),
    }],
    summary: {},
  };
  const state = {
    schemaVersion: 1, runId: 'run-beko', batchId: 'batch-beko', status: 'completed',
    input: {
      batchSha256: SHA('a'), policySha256, toolchainSha256,
      toolchain,
    },
  };
  const first = migrateHistoricalAttemptLedgerProcessorEpochs({
    ledger, runStates: new Map([['run-beko', state]]), migratedAt: '2026-07-17T01:00:00.000Z',
  });
  assert.equal(first.entries[0].processorCapability, BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY);
  assert.match(first.entries[0].evidenceProcessorSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.processorEpochMigration.migratedEntries, 1);
  assert.deepEqual(first.processorEpochMigrations, [first.processorEpochMigration]);

  const second = migrateHistoricalAttemptLedgerProcessorEpochs({
    ledger: first, runStates: new Map(), migratedAt: '2026-07-17T02:00:00.000Z',
  });
  assert.equal(second.entries[0].evidenceProcessorSha256, first.entries[0].evidenceProcessorSha256);
  assert.deepEqual(second, first);
});

test('attempt-ledger rebuild preserves append-only processor epoch migration history', () => {
  const input = fixture();
  const migration = {
    migratedAt: '2026-07-17T01:00:00.000Z',
    migratedEntries: 4,
    boundEntries: 16,
    unboundEntries: 0,
    failClosedUnboundEntries: true,
  };
  const priorLedger = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  priorLedger.processorEpochMigration = migration;
  priorLedger.processorEpochMigrations = [migration];

  const rebuilt = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger, generatedAt: '2026-07-16T01:02:00.000Z',
  });

  assert.deepEqual(rebuilt.processorEpochMigration, migration);
  assert.deepEqual(rebuilt.processorEpochMigrations, [migration]);
});

test('a later accepted replay appends a resolution and deactivates the prior suppression', () => {
  const input = fixture();
  const first = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...input, priorLedger: null, generatedAt: '2026-07-16T01:01:00.000Z',
  });
  const accepted = structuredClone(input);
  const candidate = accepted.results.outcomes[0].candidateInventory.candidates[0];
  candidate.outcome = {
    status: 'accepted', failureCode: null, reason: null,
    source: {
      sourceUrl: accepted.sourceUrl, finalUrl: accepted.sourceUrl,
      contentSha256: SHA('c'),
    },
  };
  accepted.results.outcomes[0].status = 'accepted';
  accepted.results.outcomes[0].failureCode = null;
  accepted.results.outcomes[0].semanticOutcomeSha256 = SHA('9');
  accepted.results.completedAt = '2026-07-16T02:00:00.000Z';
  accepted.audit.resultsSha256 = canonicalJsonSha256(accepted.results);
  accepted.audit.semanticAuditSha256 = SHA('8');

  const second = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...accepted, priorLedger: first, generatedAt: '2026-07-16T02:01:00.000Z',
  });
  assert.equal(second.entries.length, 1);
  assert.equal(second.sourceAcceptances.length, 1);
  assert.equal(second.sourceAcceptances[0].sourceUrl, accepted.sourceUrl);
  assert.equal(second.sourceAcceptances[0].contentSha256, SHA('c'));
  assert.equal(second.sourceAcceptances[0].policySha256, SHA('b'));
  assert.equal(second.resolutions.length, 1);
  assert.equal(second.resolutions[0].attemptId, first.entries[0].attemptId);
  assert.equal(second.summary.suppressions, 0);
  assert.equal(second.summary.resolvedSuppressions, 1);
  assert.deepEqual(activeHistoricalAttemptSuppressions({
    ledger: second,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('b'),
  }), []);
  assert.equal(activeHistoricalSourceAcceptances({
    ledger: second,
    targetId: 'target-fp',
    referenceId: 'reference-fp',
    policySha256: SHA('b'),
  }).length, 1);

  const replayed = structuredClone(accepted);
  replayed.results.runId = 'run-fp-replayed';
  replayed.results.completedAt = '2026-07-16T03:00:00.000Z';
  replayed.audit.resultsSha256 = canonicalJsonSha256(replayed.results);
  replayed.audit.semanticAuditSha256 = SHA('7');
  const third = buildHistoricalEvidenceRecoveryAttemptLedger({
    ...replayed, priorLedger: second, generatedAt: '2026-07-16T03:01:00.000Z',
  });
  assert.deepEqual(third.entries, second.entries);
  assert.deepEqual(third.sourceAcceptances, second.sourceAcceptances);
  assert.deepEqual(third.resolutions, second.resolutions);
});
