import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveFitV4Rank } from '../../src/domain/fit-rank-v4.mjs';
import { evaluateFitV4Shadow } from '../../src/domain/fit-v4-shadow.mjs';
import { buildFitV4CutoverCandidate } from '../../scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs';
import { buildFitV4Baseline } from '../../scripts/architecture-v2/build-fit-v4-baseline.mjs';
import {
  buildTrustedFitV4Input,
  observation,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'data/architecture-v2/reviews/automated/fit-v4-baseline.json');
const SUCCESSOR_PATH = join(ROOT, 'data/architecture-v2/reviews/automated/fit-v4-wp3-successor-proof.json');
const FROZEN_BASELINE_SHA256 = '4c13f4bdbcdba079e874b880f2c67f979009ed9759ffc0597492e1d8a3154aa3';
const EXPECTED_RISKS = [
  'accepted-unevaluated-front-clearance',
  'accepted-unevaluated-ventilation-capacity',
  'accepted-unevaluated-delivery-weight',
  'missing-clearance-hidden-by-maximum-known',
  'additive-rear-service-space-undercounted',
  'invalid-site-profile-values-accepted',
  'opaque-rules-and-power-required-semantics',
  'unselected-delivery-blocks-fit',
  'v2-advisory-failure-is-no-fit',
  'legacy-score-cross-outcome-comparability',
  'dishwasher-front-loader-form-factor',
  'washtower-without-combination-policy',
];

function byId(baseline, id) {
  return baseline.risks.find((risk) => risk.id === id);
}

async function frozenBaseline() {
  const bytes = await readFile(BASELINE_PATH);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FROZEN_BASELINE_SHA256);
  return JSON.parse(bytes);
}

test('baseline reproduces all twelve audited migration risks', async () => {
  const baseline = await frozenBaseline();

  assert.deepEqual(baseline.risks.map((risk) => risk.id), EXPECTED_RISKS);
  assert.equal(baseline.summary.reproduced, 12);
  assert.equal(baseline.summary.total, 12);
  assert.ok(baseline.risks.every((risk) => risk.reproduced === true));
  assert.ok(baseline.risks.every((risk) => /^[a-f0-9]{64}$/.test(risk.fixtureSha256)));
  assert.ok(baseline.sourceInputs.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.ok(baseline.sourceInputs.some((source) => source.path === 'src/domain/fit-decision.mjs'));
  assert.ok(baseline.protectedFiles.scope.includes('src/domain/fit-decision.mjs'));

  assert.equal(byId(baseline, EXPECTED_RISKS[0]).observation.outcome, 'VERIFIED_FIT');
  assert.equal(byId(baseline, EXPECTED_RISKS[0]).observation.frontClearanceCheckPresent, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[1]).observation.ventilationCapacityCheckPresent, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[2]).observation.deliveryWeightCheckPresent, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[3]).observation.placementWidthStatus, 'PASS');
  assert.equal(byId(baseline, EXPECTED_RISKS[4]).observation.currentRequiredDepthMm, 630);
  assert.equal(byId(baseline, EXPECTED_RISKS[4]).observation.additiveRequiredDepthMm, 650);
  assert.equal(byId(baseline, EXPECTED_RISKS[5]).observation.rejected, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[6]).observation.normativeRuleCheckPresent, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[6]).observation.powerCapacityCheckPresent, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[7]).observation.outcome, 'NO_FIT');
  assert.equal(byId(baseline, EXPECTED_RISKS[8]).observation.outcome, 'NO_FIT');
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.noFitRendersNumericScore, true);
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.noFitRendersScoreRing, true);
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.conditionalFitRendersNumericScore, true);
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.conditionalFitRendersScoreRing, true);
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.insufficientDataRendersNumericScore, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[9]).observation.insufficientDataRendersScoreRing, false);
  assert.equal(byId(baseline, EXPECTED_RISKS[10]).observation.formFactor, 'front_loader');
  assert.ok(byId(baseline, EXPECTED_RISKS[11]).observation.activeRecordCount > 0);
  assert.equal(byId(baseline, EXPECTED_RISKS[11]).observation.dedicatedPolicyPresent, false);
});

test('frozen baseline binds its predecessor while the privacy successor stays separately blocked', async () => {
  const baseline = await frozenBaseline();
  assert.ok(
    baseline.databaseRuntimeSnapshot,
    'corrected database/runtime snapshot must be present',
  );

  const snapshot = baseline.databaseRuntimeSnapshot;
  assert.equal(snapshot.activeRelease.releaseCandidateId, 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4');
  assert.equal(snapshot.activeRelease.catalog.bytesSha256, snapshot.activeRelease.catalog.declaredSha256);
  assert.equal(
    snapshot.activeRelease.historicalReference.bytesSha256,
    snapshot.activeRelease.historicalReference.declaredSha256,
  );
  assert.match(snapshot.activeRelease.catalog.semanticSha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.activeRelease.historicalReference.semanticSha256, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.catalog.rowCount, 3513);
  assert.deepEqual(snapshot.catalog.lifecycleVisibility, {
    CURRENT_OUTPUT: 349,
    HISTORICAL_INPUT_ONLY: 3087,
    MARKET_REFERENCE_ONLY: 77,
  });
  assert.equal(snapshot.historicalReference.rowCount, 8087);
  assert.equal(snapshot.currentCatalog.rowCount, 349);
  assert.equal(snapshot.currentCatalog.geometryV2Count, 103);
  assert.equal(snapshot.currentCatalog.formFactorCount, 100);
  assert.equal(snapshot.currentCatalog.withoutFormFactorCount, 249);
  assert.deepEqual(snapshot.currentCatalog.byCategory, {
    dishwasher: { rowCount: 117, geometryV2Count: 43, formFactorCount: 43, withoutFormFactorCount: 74 },
    dryer: { rowCount: 24, geometryV2Count: 19, formFactorCount: 17, withoutFormFactorCount: 7 },
    fridge: { rowCount: 158, geometryV2Count: 25, formFactorCount: 25, withoutFormFactorCount: 133 },
    washing_machine: { rowCount: 48, geometryV2Count: 16, formFactorCount: 15, withoutFormFactorCount: 33 },
    washtower_combo: { rowCount: 2, geometryV2Count: 0, formFactorCount: 0, withoutFormFactorCount: 2 },
  });
  assert.equal(snapshot.fitV4Rights.totalFieldMappings, 85);
  assert.equal(snapshot.fitV4Rights.publicDisplayRequiredCount, 0);
  assert.equal(snapshot.cutoverCandidate.status, 'BLOCKED');
  assert.equal(snapshot.cutoverCandidate.blockerCount, 11);
  assert.ok(snapshot.cutoverCandidate.byteLength > 0);
  assert.match(snapshot.cutoverCandidate.bytesSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.deploymentSurface.explicitFiles.map((row) => row.path), [
    '.vercelignore',
    'vercel.json',
    'package.json',
    'package-lock.json',
    'index.html',
    'google32758d7798f4a670.html',
    'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html',
  ]);
  assert.deepEqual(snapshot.deploymentSurface.trees.map((row) => row.path), [
    'public', 'pages', 'api', 'data/pdf-evidence',
  ]);
  assert.match(snapshot.deploymentSurface.treeSha256, /^[a-f0-9]{64}$/);

  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  assert.equal(candidate.bindings.activeRelease.releaseCandidateId,
    'retail_lifecycle_release_30f746d33cd37b95496a9036');
  assert.notEqual(snapshot.activeRelease.releaseCandidateId,
    candidate.bindings.activeRelease.releaseCandidateId);
  assert.notEqual(snapshot.deploymentSurface.treeSha256,
    candidate.bindings.deploymentSurface.treeSha256);
  assert.equal(candidate.decision.status, 'BLOCKED');

  const rankWitness = baseline.characterizationWitnesses.find((row) => row.id === 'rank-v1-cross-outcome-comparison');
  assert.equal(rankWitness.observation.rankSchemaVersion, 1);
  assert.equal(rankWitness.observation.leftOutcome, 'INSUFFICIENT_DATA');
  assert.equal(rankWitness.observation.rightOutcome, 'NO_FIT');
  assert.ok(rankWitness.observation.comparison < 0);
  assert.equal(rankWitness.reproduced, true);

  const scenarioWitness = baseline.characterizationWitnesses.find((row) => row.id === 'scenario-set-member-conflation');
  assert.equal(scenarioWitness.observation.scenarioSetHashChangesWithMember, true);
  assert.equal(scenarioWitness.observation.scenarioMemberBindingPresent, false);
  assert.equal(scenarioWitness.observation.scenarioSetEqualsSiteScenario, true);
  assert.equal(scenarioWitness.reproduced, true);
});

test('private WP3 successor proof binds the frozen predecessor and corrected schema-2 behavior', async () => {
  await frozenBaseline();
  const proof = JSON.parse(await readFile(SUCCESSOR_PATH, 'utf8'));
  const { semanticSha256, ...semantic } = proof;
  const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;
  assert.equal(semanticSha256, createHash('sha256').update(JSON.stringify(canonical(semantic))).digest('hex'));
  assert.equal(proof.predecessor.bytesSha256, FROZEN_BASELINE_SHA256);
  assert.equal(proof.predecessor.path, 'data/architecture-v2/reviews/automated/fit-v4-baseline.json');

  const options = {
    fields: [['envelope.closed.width', 600]],
    scenarioObservationSets: [
      [observation('cavity.width', 610)],
      [observation('cavity.width', 590)],
    ],
  };
  const left = buildTrustedFitV4Input({ ...options, selectedScenarioIndex: 0 });
  const right = buildTrustedFitV4Input({ ...options, selectedScenarioIndex: 1 });
  const leftResult = evaluateFitV4Shadow(left);
  const rightResult = evaluateFitV4Shadow(right);
  assert.equal(leftResult.scenarioBinding.scenarioSetSha256, rightResult.scenarioBinding.scenarioSetSha256);
  assert.notEqual(leftResult.scenarioBinding.scenarioMemberSha256, rightResult.scenarioBinding.scenarioMemberSha256);
  assert.notEqual(left.runId, right.runId);
  assert.throws(() => deriveFitV4Rank(leftResult, left), { code: 'RANK_SCHEMA_V2_REQUIRED' });
  assert.deepEqual(proof.proofs, {
    frozenPredecessorReadOnly: true,
    rankSchema2Stop: 'RANK_SCHEMA_V2_REQUIRED',
    scenarioMemberBindingPresent: true,
    scenarioSetMemberSeparated: true,
  });
});

test('the frozen predecessor baseline cannot be regenerated through schema-2 runtime code', async () => {
  await assert.rejects(
    () => buildFitV4Baseline({ root: ROOT, generatedAt: '2026-08-09T00:00:00.000Z' }),
    { code: 'FIT_V4_BASELINE_FROZEN_USE_SUCCESSOR_PROOF' },
  );
});
