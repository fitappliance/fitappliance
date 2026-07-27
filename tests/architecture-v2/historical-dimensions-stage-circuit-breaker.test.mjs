import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHistoricalDimensionsDiscoveryStageMetrics,
  buildHistoricalDimensionsRecoveryFunnel,
  buildHistoricalDimensionsRecoveryStageMetrics,
  evaluateHistoricalDimensionsStageCircuitBreakers,
  oneSidedWilsonUpperBound,
  selectHistoricalDimensionsScaleDecision,
} from '../../src/domain/historical-dimensions-scale-control.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const HASH = 'a'.repeat(64);
const EPOCHS = Object.freeze([
  'fit-policy', 'lifecycle-policy', 'mineru-toolchain', 'parser',
  'receipt-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy',
].map((id, index) => ({ id, semanticSha256: String(index + 1).repeat(64).slice(0, 64) })));

function policy() {
  return {
    schemaVersion: 2,
    confidence: {
      method: 'ONE_SIDED_WILSON', confidenceBasisPoints: 9_500,
      z: 1.6448536269514722,
    },
    minimumConclusiveUnits: 10,
    minimumCompletedManifests: 2,
    maximumConsecutiveRetryableOnlyManifests: 2,
    stages: {
      DISCOVERY: { floorBasisPoints: 2_000, diagnosticOnly: false },
      ACQUISITION: { floorBasisPoints: 8_000, diagnosticOnly: false },
      MINERU: { floorBasisPoints: 9_000, diagnosticOnly: false },
      IDENTITY: { floorBasisPoints: 5_000, diagnosticOnly: false },
      DIMENSIONS_RECEIPT: { floorBasisPoints: 5_000, diagnosticOnly: false },
      INSTALLATION_FIT: { floorBasisPoints: null, diagnosticOnly: true },
    },
  };
}

function epochSha(stage, epochs = EPOCHS) {
  const byId = new Map(epochs.map((row) => [row.id, row.semanticSha256]));
  const ids = {
    DISCOVERY: ['lifecycle-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy'],
    ACQUISITION: ['lifecycle-policy', 'resolver-contract', 'scale-metrics', 'source-authority-policy'],
    MINERU: ['mineru-toolchain', 'scale-metrics'],
    IDENTITY: ['parser', 'scale-metrics', 'source-authority-policy'],
    DIMENSIONS_RECEIPT: ['parser', 'receipt-policy', 'scale-metrics'],
    INSTALLATION_FIT: ['fit-policy', 'parser', 'receipt-policy', 'scale-metrics'],
  }[stage];
  return canonicalJsonSha256(ids.map((id) => ({ id, semanticSha256: byId.get(id) })));
}

function metric({
  stage = 'DIMENSIONS_RECEIPT', numerator = 0, denominator = 5,
  retryableUnits = 0, diagnosticOnly = false, epochs = EPOCHS,
} = {}) {
  return {
    stage,
    metricId: stage.toLowerCase(),
    numerator,
    denominator,
    conclusiveNumerator: numerator,
    conclusiveDenominator: denominator - retryableUnits,
    retryableUnits,
    structuralTerminalUnits: denominator - retryableUnits - numerator,
    diagnosticOnly,
    epochSha256: epochSha(stage, epochs),
  };
}

function checkpoint({
  id, manifestId, cohortKey = 'historical_cohort_low', metrics,
}) {
  return {
    checkpointId: id,
    manifestId,
    cohortKey,
    stageMetrics: metrics,
  };
}

function boundedManifest(seed, cohortKey) {
  return {
    manifestId: `manifest-${seed}`,
    cohortKey,
    workstreamId: 'CURRENT_DIMENSIONS',
    constraints: { priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS' },
  };
}

function batches(manifests, { eligible = manifests.length, windowed = manifests.length } = {}) {
  return {
    schemaVersion: 2,
    plannerVersion: '2',
    workstreams: [{
      workstreamId: 'CURRENT_DIMENSIONS', eligibleTargets: eligible,
      eligibleCohortsByPriority: { P0_CURRENT_MISSING_DIMENSIONS: eligible },
      windowedCohortsByPriority: { P0_CURRENT_MISSING_DIMENSIONS: windowed },
      manifestIds: manifests.map((row) => row.manifestId),
    }, {
      workstreamId: 'HISTORICAL_DIMENSIONS', eligibleTargets: 1,
      eligibleCohortsByPriority: { P1_HISTORICAL_MISSING_DIMENSIONS: 1 },
      windowedCohortsByPriority: { P1_HISTORICAL_MISSING_DIMENSIONS: 1 },
      manifestIds: [],
    }],
    manifests,
  };
}

test('stage metrics preserve native denominators and keep Fit diagnostic-only', () => {
  const discovery = buildHistoricalDimensionsDiscoveryStageMetrics({
    selectedTargets: 3,
    targetsWithOfficialCandidates: 1,
    fetchedTargets: 0,
    mineruValidTargets: 0,
    identityProvenTargets: 0,
    dimensionsReceipted: 0,
    terminalTargets: 1,
    retryableTargets: 1,
  }, EPOCHS);
  assert.deepEqual({
    numerator: discovery[0].numerator,
    denominator: discovery[0].denominator,
    conclusiveDenominator: discovery[0].conclusiveDenominator,
    retryableUnits: discovery[0].retryableUnits,
  }, { numerator: 1, denominator: 3, conclusiveDenominator: 2, retryableUnits: 1 });

  const source = {
    authority: 'manufacturer', contentType: 'application/pdf', contentSha256: HASH,
    objectPath: `evidence/web/${HASH}.pdf`, identity: { outcome: 'exact' },
    derivedArtifact: { parserName: 'MinerU', format: 'content_list_v2' },
  };
  const recovery = buildHistoricalDimensionsRecoveryStageMetrics({
    schemaVersion: 1,
    outcomes: [{
      status: 'accepted',
      candidateInventory: { candidates: [{
        authorityMode: 'official', requiredAttempt: true,
        outcome: { status: 'accepted', source },
      }] },
      sources: [source],
    }, {
      status: 'retryable_failure',
      candidateInventory: { candidates: [{
        authorityMode: 'official', requiredAttempt: true,
        outcome: { status: 'transport_failure', source: null },
      }] },
      sources: [],
    }],
  }, EPOCHS);
  assert.deepEqual(recovery.map((row) => [
    row.stage, row.numerator, row.denominator, row.conclusiveDenominator, row.diagnosticOnly,
  ]), [
    ['ACQUISITION', 1, 2, 1, false],
    ['MINERU', 1, 1, 1, false],
    ['IDENTITY', 1, 1, 1, false],
    ['DIMENSIONS_RECEIPT', 1, 1, 1, false],
    ['INSTALLATION_FIT', 0, 0, 0, true],
  ]);
});

test('receipt-bound official marketing aliases count as proven dimensions identities', () => {
  const source = {
    authority: 'manufacturer',
    sourceType: 'official_model_variant_pdf',
    contentType: 'application/pdf',
    contentSha256: HASH,
    objectPath: `evidence/web/${HASH}.pdf`,
    identity: {
      outcome: 'official_marketing_alias',
      model: 'G7130SCCLST',
      sourceModel: 'G 7130 SC',
    },
    derivedArtifact: { parserName: 'MinerU', format: 'content_list_v2' },
    verificationReceipt: { bindingSha256: 'b'.repeat(64) },
  };
  const results = {
    schemaVersion: 1,
    outcomes: [{
      status: 'accepted',
      candidateInventory: {
        candidates: [{
          authorityMode: 'official',
          requiredAttempt: true,
          outcome: { status: 'accepted', source },
        }],
      },
      sources: [source],
    }],
  };

  assert.equal(buildHistoricalDimensionsRecoveryFunnel(results).identityProvenTargets, 1);
  const metrics = buildHistoricalDimensionsRecoveryStageMetrics(results, EPOCHS);
  assert.deepEqual(metrics.slice(2, 4).map((row) => [
    row.stage, row.metricId, row.numerator, row.denominator,
  ]), [[
    'IDENTITY', 'receipt_eligible_identity_proof_per_valid_parsed_document', 1, 1,
  ], [
    'DIMENSIONS_RECEIPT',
    'accepted_whd_receipt_per_receipt_eligible_identity_target',
    1,
    1,
  ]]);
});

test('a persisted PDF and MinerU binding count as fetched and parsed after attestation fails', () => {
  const derivedArtifact = {
    parserName: 'MinerU',
    format: 'content_list_v2',
    sourcePdfSha256: HASH,
    contentSha256: 'b'.repeat(64),
    objectPath: `evidence/derived/mineru-json/sha256/bb/bb/${'b'.repeat(64)}.json`,
    byteSize: 2048,
    pageCount: 2,
  };
  const results = {
    schemaVersion: 1,
    outcomes: [{
      status: 'identity_rejected',
      candidateInventory: { candidates: [{
        authorityMode: 'official',
        requiredAttempt: true,
        outcome: {
          status: 'transport_failure',
          source: null,
          artifactBinding: {
            sourceUrl: 'https://www.miele.com.au/media/ex/au/specsheets/12531640.pdf',
            finalUrl: 'https://www.miele.com.au/media/ex/au/specsheets/12531640.pdf',
            contentSha256: HASH,
            objectPath: `evidence/web/sha256/aa/aa/${HASH}.pdf`,
            contentType: 'application/pdf',
            byteSize: 1024,
            derivedArtifact,
          },
        },
      }] },
      sources: [],
    }],
  };

  assert.deepEqual(buildHistoricalDimensionsRecoveryFunnel(results), {
    selectedTargets: 1,
    targetsWithOfficialCandidates: 1,
    fetchedTargets: 1,
    mineruValidTargets: 1,
    identityProvenTargets: 0,
    dimensionsReceipted: 0,
    terminalTargets: 1,
    retryableTargets: 0,
  });
});

test('five misses cannot halt and retryable units never inflate a conclusive sample', () => {
  assert.ok(oneSidedWilsonUpperBound(0, 5) < 0.5);
  const result = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [checkpoint({
      id: 'five-misses', manifestId: 'manifest-a', metrics: [metric({ denominator: 5 })],
    }), checkpoint({
      id: 'retryable', manifestId: 'manifest-b', metrics: [metric({ denominator: 20, retryableUnits: 20 })],
    })],
    policy: policy(),
    currentEpochs: EPOCHS,
  });
  assert.equal(result.haltedCohorts.length, 0);
  assert.equal(result.stageSummaries[0].conclusiveDenominator, 5);
  assert.equal(result.stageSummaries[0].retryableUnits, 20);
});

test('two consecutive retryable-only manifests halt a cohort without claiming source exhaustion', () => {
  const retryableOnly = (id, manifestId) => checkpoint({
    id,
    manifestId,
    cohortKey: 'smeg_fab32rwh5au',
    metrics: [metric({ stage: 'DISCOVERY', denominator: 1, retryableUnits: 1 })],
  });
  const first = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [retryableOnly('retry-a', 'manifest-a')],
    policy: policy(),
    currentEpochs: EPOCHS,
  });
  assert.equal(first.haltedCohorts.length, 0);
  assert.equal(first.stageSummaries[0].retryableOnlyStreak, 1);

  const second = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [
      retryableOnly('retry-a', 'manifest-a'),
      retryableOnly('retry-b', 'manifest-b'),
    ],
    policy: policy(),
    currentEpochs: EPOCHS,
  });
  assert.deepEqual(second.haltedCohorts.map((row) => ({
    cohortKey: row.cohortKey,
    stage: row.stage,
    reason: row.reason,
    retryableOnlyStreak: row.retryableOnlyStreak,
  })), [{
    cohortKey: 'smeg_fab32rwh5au',
    stage: 'DISCOVERY',
    reason: 'CONSECUTIVE_RETRYABLE_ONLY_MANIFEST_LIMIT',
    retryableOnlyStreak: 2,
  }]);

  const legacyPolicy = policy();
  delete legacyPolicy.maximumConsecutiveRetryableOnlyManifests;
  assert.equal(evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [
      retryableOnly('legacy-a', 'legacy-manifest-a'),
      retryableOnly('legacy-b', 'legacy-manifest-b'),
    ],
    policy: legacyPolicy,
    currentEpochs: EPOCHS,
  }).haltedCohorts[0].reason, 'CONSECUTIVE_RETRYABLE_ONLY_MANIFEST_LIMIT');
});

test('a conclusive manifest resets the retryable-only streak and relevant epoch drift reopens it', () => {
  const cohortKey = 'smeg_fab32rwh5au';
  const retryable = (id, manifestId, epochs = EPOCHS) => checkpoint({
    id,
    manifestId,
    cohortKey,
    metrics: [metric({ stage: 'DISCOVERY', denominator: 1, retryableUnits: 1, epochs })],
  });
  const conclusive = checkpoint({
    id: 'complete-a',
    manifestId: 'manifest-complete',
    cohortKey,
    metrics: [metric({ stage: 'DISCOVERY', numerator: 1, denominator: 1 })],
  });
  const reset = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [
      retryable('retry-a', 'manifest-a'),
      conclusive,
      retryable('retry-b', 'manifest-b'),
    ],
    policy: policy(),
    currentEpochs: EPOCHS,
  });
  assert.equal(reset.haltedCohorts.length, 0);
  assert.equal(reset.stageSummaries[0].retryableOnlyStreak, 1);

  const prior = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [retryable('retry-a', 'manifest-a'), retryable('retry-b', 'manifest-b')],
    policy: policy(),
    currentEpochs: EPOCHS,
  });
  assert.equal(prior.haltedCohorts.length, 1);
  const changed = structuredClone(EPOCHS);
  changed.find((row) => row.id === 'resolver-contract').semanticSha256 = 'f'.repeat(64);
  const reopened = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints: [retryable('retry-a', 'manifest-a'), retryable('retry-b', 'manifest-b')],
    policy: policy(),
    currentEpochs: changed,
  });
  assert.equal(reopened.haltedCohorts.length, 0);
  assert.ok(reopened.reopenedCohorts.some((row) => (
    row.cohortKey === cohortKey
      && row.stage === 'DISCOVERY'
      && row.reason === 'RELEVANT_EPOCH_CHANGED'
  )));
});

test('a Wilson-qualified sample halts only its stage/cohort and selects another P0', () => {
  const checkpoints = [
    checkpoint({ id: 'low-a', manifestId: 'manifest-low-a', metrics: [metric()] }),
    checkpoint({ id: 'low-b', manifestId: 'manifest-low-b', metrics: [metric()] }),
  ];
  const circuit = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints, policy: policy(), currentEpochs: EPOCHS,
  });
  assert.deepEqual(circuit.haltedCohorts.map((row) => [row.cohortKey, row.stage]), [
    ['historical_cohort_low', 'DIMENSIONS_RECEIPT'],
  ]);
  const low = boundedManifest('low', 'historical_cohort_low');
  const next = boundedManifest('next', 'historical_cohort_next');
  const decision = selectHistoricalDimensionsScaleDecision({
    nextBatches: batches([low, next]),
    counters: { p0EligibleTargets: 2, p1EligibleTargets: 1 },
    haltedCohorts: circuit.haltedCohorts,
  });
  assert.equal(decision.status, 'RUN_P0');
  assert.equal(decision.allowedManifestId, next.manifestId);
  assert.equal(decision.p1Blocked, true);
});

test('relevant epoch drift reopens a halt while unrelated epoch drift does not', () => {
  const checkpoints = [
    checkpoint({ id: 'low-a', manifestId: 'manifest-a', metrics: [metric()] }),
    checkpoint({ id: 'low-b', manifestId: 'manifest-b', metrics: [metric()] }),
  ];
  const unrelated = structuredClone(EPOCHS);
  unrelated.find((row) => row.id === 'fit-policy').semanticSha256 = 'f'.repeat(64);
  assert.equal(evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints, policy: policy(), currentEpochs: unrelated,
  }).haltedCohorts.length, 1);

  const relevant = structuredClone(EPOCHS);
  relevant.find((row) => row.id === 'parser').semanticSha256 = 'f'.repeat(64);
  const reopened = evaluateHistoricalDimensionsStageCircuitBreakers({
    checkpoints, policy: policy(), currentEpochs: relevant,
  });
  assert.equal(reopened.haltedCohorts.length, 0);
  assert.deepEqual(reopened.reopenedCohorts.map((row) => row.reason), ['RELEVANT_EPOCH_CHANGED']);
});

test('global stop reasons are explicit and a deferred P0 window never opens P1', () => {
  const p0 = boundedManifest('p0', 'historical_cohort_p0');
  const base = {
    nextBatches: batches([p0], { eligible: 2, windowed: 1 }),
    counters: { p0EligibleTargets: 2, p1EligibleTargets: 1 },
    haltedCohorts: [{ cohortKey: p0.cohortKey, stage: 'DISCOVERY' }],
  };
  assert.equal(selectHistoricalDimensionsScaleDecision(base).status, 'STOP_P0_WINDOW_EXHAUSTED');
  assert.equal(selectHistoricalDimensionsScaleDecision({
    ...base, operationalState: { resourceBudget: 'EXHAUSTED' },
  }).status, 'STOP_RESOURCE_BUDGET');
  assert.equal(selectHistoricalDimensionsScaleDecision({
    ...base, operationalState: { safety: 'FAILED' },
  }).status, 'STOP_SAFETY');
  assert.equal(selectHistoricalDimensionsScaleDecision({
    ...base, operationalState: { onlineExternalState: 'REQUIRED_UNAVAILABLE' },
  }).status, 'STOP_EXTERNAL_STATE');
  assert.throws(() => selectHistoricalDimensionsScaleDecision({
    ...base, operationalState: { safety: 'UNKNOWN' },
  }), /operational state.*invalid/i);
});
