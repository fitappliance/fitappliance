import test from 'node:test';
import assert from 'node:assert/strict';

import { collectEvidenceCandidates } from '../../src/domain/evidence-candidate-inventory.mjs';
import { reconcileEvidenceClaims } from '../../src/domain/evidence-claim-reconciliation.mjs';
import {
  createBoundedSemaphore,
  createNetworkSemaphore,
  reconciliationDecisionSummary,
  recoveryOutcomeSemanticSha256,
  runReceiptBoundEvidenceBatch,
} from '../../src/domain/receipt-bound-evidence-batch-runner.mjs';

test('reconciliation summary preserves an official semantic resolution trace', () => {
  assert.deepEqual(reconciliationDecisionSummary({
    conflictingFields: [], conflictHints: [], missingFields: [], supersessionViolations: [],
    officialSemanticResolution: 'explicit_appliance_depth_with_exact_product_page_corroboration',
  }), {
    conflictingFields: [], conflictHints: [], missingFields: [], supersessionViolations: [],
    axisPermutationResolution: null, lowerAuthorityResolution: null, conflictReason: null,
    officialSemanticResolution: 'explicit_appliance_depth_with_exact_product_page_corroboration',
  });
});

const SHA = 'a'.repeat(64);
const FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function job(jobId, sourceUrl, targetIds, overrides = {}) {
  return {
    jobId,
    sourceUrl,
    authorityBrand: 'Example',
    authorityMode: 'official',
    acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    targetIds,
    ...overrides,
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
    selection: {
      jobIds: [], routes: [], priorities: [], brands: [], targetIds: [], limit: null,
    },
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
    verificationReceipt: {
      schemaVersion: 3,
      bindingSha256: hash,
      policyVersion: '2026-07-13.1',
      verifiedAt: '2026-07-13T00:00:00.000Z',
    },
  };
}

function dependencies(overrides = {}) {
  return {
    acquireArtifact: async (artifactJob, context) => {
      await context.withMineru(async () => {});
      const contentSha256 = artifactJob.jobId.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a');
      return {
        jobId: artifactJob.jobId,
        sourceUrl: artifactJob.sourceUrl,
        finalUrl: artifactJob.sourceUrl,
        contentSha256,
        objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.pdf`,
        contentType: 'application/pdf',
        byteSize: 1024,
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
  assert.deepEqual(result.outcomes[0].reconciliation, {
    conflictingFields: [],
    conflictHints: [],
    missingFields: [],
    supersessionViolations: [],
    axisPermutationResolution: null,
    lowerAuthorityResolution: null,
    conflictReason: null,
  });
});

test('an optional batch product page stays lazy when the required document succeeds', async () => {
  const requiredJob = job(
    'a'.repeat(32),
    'https://official.example.com/primary.pdf',
    ['target-a'],
    {
      sourceRole: 'manufacturer_document',
      requiredTargetIds: ['target-a'],
    },
  );
  const optionalJob = job(
    'b'.repeat(32),
    'https://official.example.com/product/',
    ['target-a'],
    {
      sourceRole: 'manufacturer_product_page',
      requiredTargetIds: [],
    },
  );
  const input = batch({
    jobs: [requiredJob, optionalJob],
    targets: [target('target-a', 'EX100', [requiredJob.jobId, optionalJob.jobId])],
  });
  const acquisitions = [];
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    acquireArtifact: async (artifactJob, context) => {
      acquisitions.push(artifactJob.jobId);
      await context.withMineru(async () => {});
      return {
        jobId: artifactJob.jobId,
        sourceUrl: artifactJob.sourceUrl,
        finalUrl: artifactJob.sourceUrl,
        contentSha256: 'c'.repeat(64),
      };
    },
  }));

  assert.deepEqual(acquisitions, [requiredJob.jobId]);
  const optionalCandidate = result.outcomes[0].candidateInventory.candidates
    .find((candidate) => candidate.sourceUrl === optionalJob.sourceUrl);
  assert.equal(optionalCandidate.sourceRole, 'manufacturer_product_page');
  assert.equal(optionalCandidate.requiredAttempt, false);
  assert.equal(optionalCandidate.outcome.status, 'not_attempted_optional');
  assert.equal(result.outcomes[0].status, 'accepted');
});

test('complete inline active receipts replay without a loader and reconcile with a fresh candidate', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/current.pdf', ['target-a']);
  const targetRecord = target('target-a', 'EX100', [artifactJob.jobId]);
  const priorHash = 'c'.repeat(64);
  targetRecord.reconciliationContext.activeReceiptSources = [attestedSource(targetRecord, {
    sourceUrl: 'https://official.example.com/prior.pdf',
    contentSha256: priorHash,
  }, priorHash)];

  const result = await runReceiptBoundEvidenceBatch(
    batch({ jobs: [artifactJob], targets: [targetRecord] }),
    dependencies({
      loadActiveReceiptSource: async () => {
        throw new Error('inline source must not require an external loader');
      },
    }),
  );

  assert.equal(result.outcomes[0].status, 'accepted');
  assert.equal(result.outcomes[0].sources.length, 2);
  assert.deepEqual(
    result.outcomes[0].sources.map((source) => source.contentSha256).sort(),
    [priorHash, `${'a'.repeat(32)}${'0'.repeat(32)}`].sort(),
  );
  assert.equal(result.outcomes[0].candidateInventory.activeReceiptSources.length, 1);
});

test('runner passes policy reconciliation options without allowing boundary options to be overridden', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/primary.pdf', ['target-a']);
  const input = batch({
    jobs: [artifactJob],
    targets: [target('target-a', 'EX100', [artifactJob.jobId])],
  });
  let seenOptions = null;
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    reconciliationOptions: {
      registryAxisPermutationToleranceMm: 10,
      requestedFields: ['unsafe.override'],
      verifyInventoryHash: false,
    },
    reconcileClaims: (_identity, inventory, options) => {
      seenOptions = structuredClone(options);
      return {
        status: 'accepted',
        failureCode: null,
        candidateInventorySha256: inventory.candidateInventorySha256,
        sources: [inventory.candidates[0].outcome.source],
        conflictingFields: [],
        conflictHints: [],
        supersessionViolations: [],
      };
    },
  }));

  assert.equal(result.outcomes[0].status, 'accepted');
  assert.equal(seenOptions.registryAxisPermutationToleranceMm, 10);
  assert.deepEqual(seenOptions.requestedFields, FIELDS);
  assert.equal(seenOptions.verifyInventoryHash, true);
});

test('outcomes persist the automatic reconciliation reason and bind it into the semantic digest', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/primary.pdf', ['target-a']);
  const input = batch({
    jobs: [artifactJob],
    targets: [target('target-a', 'EX100', [artifactJob.jobId])],
  });
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    reconcileClaims: (_identity, inventory) => ({
      status: 'accepted',
      failureCode: null,
      candidateInventorySha256: inventory.candidateInventorySha256,
      sources: [inventory.candidates[0].outcome.source],
      conflictingFields: [],
      conflictHints: [{
        sourceRole: 'registry_hint',
        sourceId: 'energy-rating:dryer',
        kind: 'lower_authority_disagreement',
        fields: ['depthMm'],
        dimensionsMm: { widthMm: 600, heightMm: 850, depthMm: 670 },
      }],
      supersessionViolations: [],
      lowerAuthorityResolution: 'independent_official_dimension_corroboration',
    }),
  }));

  const outcome = result.outcomes[0];
  assert.equal(outcome.reconciliation.lowerAuthorityResolution, 'independent_official_dimension_corroboration');
  assert.equal(outcome.reconciliation.conflictHints[0].sourceId, 'energy-rating:dryer');
  assert.notEqual(
    recoveryOutcomeSemanticSha256({
      ...outcome,
      reconciliation: { ...outcome.reconciliation, lowerAuthorityResolution: null },
    }),
    outcome.semanticOutcomeSha256,
  );
});

test('resolver case records retain reconciliation hints for conflict-driven discovery', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/primary.pdf', ['target-a']);
  const targetRecord = target('target-a', 'EX100', [artifactJob.jobId]);
  targetRecord.reconciliationContext = {
    activeReceiptSources: [],
    registryHints: [{
      sourceId: 'registry', snapshotSha256: 'c'.repeat(64),
      dimensionsMm: { width: 600, height: 850, depth: 670 },
    }],
    legacyHints: [{ sourceDocumentId: 'legacy', dimensionsMm: { width: 600, height: 850, depth: 655 } }],
  };
  let resolverCase = null;
  await runReceiptBoundEvidenceBatch(batch({ jobs: [artifactJob], targets: [targetRecord] }), dependencies({
    candidateResolversForTarget: () => [{
      resolverId: 'conflict-aware-resolver',
      version: '1',
      scope: 'exact_model_conflict_closure',
      required: true,
      async resolve(caseRecord) {
        resolverCase = caseRecord;
        return {
          resolverId: 'conflict-aware-resolver', version: '1',
          scope: 'exact_model_conflict_closure', required: true,
          completion: 'complete', candidates: [],
        };
      },
    }],
  }));

  assert.deepEqual(resolverCase.reconciliationContext, targetRecord.reconciliationContext);
});

test('dynamically discovered artifact jobs preserve target model and category', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/primary.pdf', ['target-a']);
  artifactJob.authorityBrand = 'ASKO';
  const targetRecord = target('target-a', 'W4104C.W', [artifactJob.jobId]);
  targetRecord.brand = 'ASKO';
  targetRecord.category = 'washing_machine';
  let discoveredJob = null;
  await runReceiptBoundEvidenceBatch(batch({ jobs: [artifactJob], targets: [targetRecord] }), dependencies({
    acquireArtifact: async (input) => {
      if (input.sourceUrl.includes('variant.pdf')) discoveredJob = structuredClone(input);
      return {
        jobId: input.jobId,
        sourceUrl: input.sourceUrl,
        finalUrl: input.sourceUrl,
        contentSha256: 'a'.repeat(64),
        objectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.pdf`,
        contentType: 'application/pdf',
        byteSize: 1024,
      };
    },
    candidateResolversForTarget: () => [{
      resolverId: 'asko-variant', version: '1', scope: 'variant', required: true,
      async resolve() {
        return {
          resolverId: 'asko-variant', version: '1', scope: 'variant', required: true,
          completion: 'complete',
          candidates: [{
            sourceUrl: 'https://official.example.com/variant.pdf',
            authorityMode: 'official', sourceRole: 'manufacturer_document', requiredAttempt: true,
            discoveryMethod: 'official_market_api',
            discoveryProvenance: { method: 'official_market_api', requestedModel: 'W4104C.W' },
          }],
        };
      },
    }],
  }));

  assert.equal(discoveredJob.targetModel, 'W4104C.W');
  assert.equal(discoveredJob.targetCategory, 'washing_machine');
});

test('lower-authority disagreement triggers a second pass over optional official corroboration', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/model.pdf', ['target-a']);
  const targetRecord = target('target-a', 'EX100', [artifactJob.jobId]);
  targetRecord.reconciliationContext.registryHints = [{
    sourceId: 'registry',
    snapshotSha256: 'c'.repeat(64),
    dimensionsMm: { width: 598, height: 845, depth: 670 },
  }];
  const result = await runReceiptBoundEvidenceBatch(
    batch({ jobs: [artifactJob], targets: [targetRecord] }),
    dependencies({
      candidateResolversForTarget: () => [{
        resolverId: 'official-product-page',
        version: '1',
        scope: 'exact_model_product_page',
        required: true,
        async resolve() {
          return {
            resolverId: 'official-product-page', version: '1',
            scope: 'exact_model_product_page', required: true,
            completion: 'complete',
            candidates: [{
              sourceUrl: 'https://official.example.com/model.html',
              authorityMode: 'official',
              sourceRole: 'manufacturer_product_page',
              discoveryMethod: 'official_product_page',
              requiredAttempt: false,
            }],
          };
        },
      }],
      attestTarget: async (record, artifact) => {
        const source = attestedSource(record, artifact);
        if (artifact.sourceUrl.endsWith('.html')) {
          source.sourceType = 'official_exact_model_html';
          source.contentType = 'text/html';
        }
        return { source };
      },
    }),
  );

  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'accepted');
  assert.equal(outcome.sources.length, 2);
  assert.equal(outcome.reconciliation.lowerAuthorityResolution, 'independent_official_dimension_corroboration');
  assert.equal(
    outcome.candidateInventory.candidates.find((candidate) => candidate.sourceUrl.endsWith('.html')).outcome.status,
    'accepted',
  );
});

test('required PDF identity failure falls back to an exact official product page', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/model.pdf', ['target-a']);
  const input = batch({
    jobs: [artifactJob],
    targets: [target('target-a', 'EX100', [artifactJob.jobId])],
  });
  const attempted = [];
  const derivedArtifact = {
    parserName: 'MinerU',
    format: 'content_list_v2',
    sourcePdfSha256: 'a'.repeat(64),
    contentSha256: 'b'.repeat(64),
    objectPath: `evidence/derived/mineru-json/sha256/bb/bb/${'b'.repeat(64)}.json`,
    byteSize: 2048,
    pageCount: 2,
  };
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    acquireArtifact: async (jobRecord, context) => {
      await context.withMineru(async () => {});
      return {
        jobId: jobRecord.jobId,
        sourceUrl: jobRecord.sourceUrl,
        finalUrl: jobRecord.sourceUrl,
        contentSha256: 'a'.repeat(64),
        objectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.pdf`,
        contentType: 'application/pdf',
        byteSize: 1024,
        derivedArtifact,
      };
    },
    candidateResolversForTarget: () => [{
      resolverId: 'official-product-page',
      version: '1',
      scope: 'exact_model_product_page',
      required: true,
      async resolve() {
        return {
          resolverId: 'official-product-page', version: '1',
          scope: 'exact_model_product_page', required: true,
          completion: 'complete',
          candidates: [{
            sourceUrl: 'https://official.example.com/model.html',
            authorityMode: 'official',
            sourceRole: 'manufacturer_product_page',
            discoveryMethod: 'official_product_page',
            requiredAttempt: false,
          }, {
            sourceUrl: 'https://official.example.com/optional-family.pdf',
            authorityMode: 'official',
            sourceRole: 'manufacturer_document',
            discoveryMethod: 'optional_family_manual',
            requiredAttempt: false,
          }],
        };
      },
    }],
    attestTarget: async (record, artifact) => {
      attempted.push(artifact.sourceUrl);
      if (artifact.sourceUrl.endsWith('.pdf')) {
        throw Object.assign(new Error('structured exact-model identity signal required'), { code: 'identity' });
      }
      const source = attestedSource(record, artifact);
      source.sourceType = 'official_exact_model_html';
      source.contentType = 'text/html';
      return { source };
    },
  }));

  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(attempted.sort(), [
    'https://official.example.com/model.html',
    'https://official.example.com/model.pdf',
  ]);
  assert.equal(
    outcome.candidateInventory.candidates.find((candidate) => candidate.sourceUrl.endsWith('.html')).outcome.status,
    'accepted',
  );
  assert.equal(
    outcome.candidateInventory.candidates
      .find((candidate) => candidate.sourceUrl.endsWith('optional-family.pdf')).outcome.status,
    'not_attempted_optional',
  );
  assert.equal(outcome.sources[0].sourceType, 'official_exact_model_html');
  assert.equal(
    outcome.candidateInventory.candidates.find((candidate) => candidate.sourceUrl.endsWith('.pdf'))
      .outcome.artifactBinding.contentSha256,
    'a'.repeat(64),
  );
  assert.deepEqual(
    outcome.candidateInventory.candidates.find((candidate) => candidate.sourceUrl.endsWith('.pdf'))
      .outcome.artifactBinding.derivedArtifact,
    derivedArtifact,
  );
});

test('required product-page claim failure falls back to an exact official document', async () => {
  const targetRecord = target('target-a', 'EX100', []);
  targetRecord.primaryJobId = null;
  const attempted = [];
  const result = await runReceiptBoundEvidenceBatch(
    batch({ jobs: [], targets: [targetRecord] }),
    dependencies({
      candidateResolversForTarget: () => [{
        resolverId: 'official-model-resources',
        version: '1',
        scope: 'exact_model_product_page_and_documents',
        required: true,
        async resolve() {
          return {
            resolverId: 'official-model-resources', version: '1',
            scope: 'exact_model_product_page_and_documents', required: true,
            completion: 'complete',
            candidates: [{
              sourceUrl: 'https://official.example.com/model.html',
              authorityMode: 'official',
              sourceRole: 'manufacturer_product_page',
              discoveryMethod: 'official_product_page',
              requiredAttempt: true,
            }, {
              sourceUrl: 'https://official.example.com/model-manual.pdf',
              authorityMode: 'official',
              sourceRole: 'manufacturer_document',
              discoveryMethod: 'official_product_document',
              requiredAttempt: false,
              discoveryProvenance: {
                market: 'AU',
                requestedModel: 'EX100',
                matchedModel: 'EX100',
                artifactUrl: 'https://official.example.com/model-manual.pdf',
              },
            }],
          };
        },
      }],
      attestTarget: async (record, artifact) => {
        attempted.push(artifact.sourceUrl);
        if (artifact.sourceUrl.endsWith('.html')) {
          throw Object.assign(new Error('no supported evidence claims extracted'), {
            code: 'claim_semantics',
          });
        }
        return { source: attestedSource(record, artifact) };
      },
    }),
  );

  const outcome = result.outcomes[0];
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(attempted.sort(), [
    'https://official.example.com/model-manual.pdf',
    'https://official.example.com/model.html',
  ].sort());
  assert.equal(
    outcome.candidateInventory.candidates
      .find((candidate) => candidate.sourceUrl.endsWith('model-manual.pdf')).outcome.status,
    'accepted',
  );
});

test('optional official documents without exact AU artifact provenance remain unattempted', async () => {
  const targetRecord = target('target-a', 'EX100', []);
  targetRecord.primaryJobId = null;
  const attempted = [];
  const optionalDocument = (suffix, discoveryProvenance) => ({
    sourceUrl: `https://official.example.com/${suffix}.pdf`,
    authorityMode: 'official',
    sourceRole: 'manufacturer_document',
    discoveryMethod: 'official_product_document',
    requiredAttempt: false,
    discoveryProvenance,
  });
  const result = await runReceiptBoundEvidenceBatch(
    batch({ jobs: [], targets: [targetRecord] }),
    dependencies({
      candidateResolversForTarget: () => [{
        resolverId: 'official-model-resources',
        version: '1',
        scope: 'exact_model_product_page_and_documents',
        required: true,
        async resolve() {
          return {
            resolverId: 'official-model-resources', version: '1',
            scope: 'exact_model_product_page_and_documents', required: true,
            completion: 'complete',
            candidates: [{
              sourceUrl: 'https://official.example.com/model.html',
              authorityMode: 'official',
              sourceRole: 'manufacturer_product_page',
              discoveryMethod: 'official_product_page',
              requiredAttempt: true,
            },
            optionalDocument('wrong-market', {
              market: 'NZ', requestedModel: 'EX100', matchedModel: 'EX100',
              artifactUrl: 'https://official.example.com/wrong-market.pdf',
            }),
            optionalDocument('wrong-model', {
              market: 'AU', requestedModel: 'EX100', matchedModel: 'EX101',
              artifactUrl: 'https://official.example.com/wrong-model.pdf',
            }),
            optionalDocument('wrong-target', {
              market: 'AU', requestedModel: 'EX200', matchedModel: 'EX200',
              artifactUrl: 'https://official.example.com/wrong-target.pdf',
            }),
            optionalDocument('wrong-url', {
              market: 'AU', requestedModel: 'EX100', matchedModel: 'EX100',
              artifactUrl: 'https://official.example.com/other.pdf',
            })],
          };
        },
      }],
      attestTarget: async (record, artifact) => {
        attempted.push(artifact.sourceUrl);
        throw Object.assign(new Error('no supported evidence claims extracted'), {
          code: 'claim_semantics',
        });
      },
    }),
  );

  assert.equal(result.outcomes[0].status, 'claims_incomplete');
  assert.deepEqual(attempted, ['https://official.example.com/model.html']);
  assert.ok(result.outcomes[0].candidateInventory.candidates
    .filter((candidate) => candidate.sourceRole === 'manufacturer_document')
    .every((candidate) => candidate.outcome.status === 'not_attempted_optional'));
});

test('non-accepted reconciliation retains diagnostic candidates but exposes no releasable sources', async () => {
  const artifactJob = job('a'.repeat(32), 'https://official.example.com/partial.pdf', ['target-a']);
  const input = batch({
    jobs: [artifactJob],
    targets: [target('target-a', 'EX100', [artifactJob.jobId])],
  });
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    reconcileClaims: (_identity, inventory) => ({
      status: 'claims_incomplete',
      failureCode: 'claim_semantics',
      candidateInventorySha256: inventory.candidateInventorySha256,
      sources: [inventory.candidates[0].outcome.source],
    }),
  }));

  assert.equal(result.outcomes[0].status, 'claims_incomplete');
  assert.deepEqual(result.outcomes[0].sources, []);
  assert.equal(result.outcomes[0].geometryProjection, null);
  assert.ok(result.outcomes[0].candidateInventory.candidates[0].outcome.source);
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

test('queued artifacts do not claim running state before a network slot is acquired', async () => {
  const jobs = [
    job('a'.repeat(32), 'https://one.example.com/a.pdf', ['target-a']),
    job('b'.repeat(32), 'https://two.example.com/b.pdf', ['target-b']),
  ];
  const input = batch({
    jobs,
    targets: [target('target-a', 'EX100', [jobs[0].jobId]), target('target-b', 'EX200', [jobs[1].jobId])],
  });
  const transitions = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  let acquisitions = 0;
  const run = runReceiptBoundEvidenceBatch(input, dependencies({
    networkSemaphore: createNetworkSemaphore(1, 1),
    onTransition: async (delta) => transitions.push(delta),
    acquireArtifact: async (artifactJob) => {
      acquisitions += 1;
      if (acquisitions === 1) await firstBlocked;
      return { jobId: artifactJob.jobId, sourceUrl: artifactJob.sourceUrl, contentSha256: 'c'.repeat(64) };
    },
  }));
  try {
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(transitions.filter((delta) => delta.entity === 'artifact' && delta.state === 'running').length, 1);
  } finally {
    releaseFirst();
  }
  const result = await run;
  assert.equal(result.summary.accounted, 2);
});

test('network-backed resolvers share the same global concurrency budget', async () => {
  const jobs = [
    job('a'.repeat(32), 'https://one.example.com/a.pdf', ['target-a']),
    job('b'.repeat(32), 'https://two.example.com/b.pdf', ['target-b']),
  ];
  const input = batch({
    jobs,
    targets: [target('target-a', 'EX100', [jobs[0].jobId]), target('target-b', 'EX200', [jobs[1].jobId])],
  });
  let active = 0;
  let maximum = 0;
  const result = await runReceiptBoundEvidenceBatch(input, dependencies({
    networkSemaphore: createNetworkSemaphore(1, 1),
    candidateResolversForTarget: (targetRecord) => [{
      resolverId: `network-resolver-${targetRecord.targetId}`,
      version: '1',
      scope: 'network_fixture',
      required: true,
      async resolve() {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          resolverId: `network-resolver-${targetRecord.targetId}`,
          version: '1', scope: 'network_fixture', required: true,
          completion: 'complete', candidates: [], failures: [],
        };
      },
    }],
  }));

  assert.equal(result.summary.accounted, 2);
  assert.equal(maximum, 1);
});
