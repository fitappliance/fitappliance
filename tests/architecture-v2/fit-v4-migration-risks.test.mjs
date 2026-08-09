import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFitV4Baseline,
  semanticPayload,
  writeFitV4Baseline,
} from '../../scripts/architecture-v2/build-fit-v4-baseline.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
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

test('baseline reproduces all twelve audited migration risks', async () => {
  const baseline = await buildFitV4Baseline({
    root: ROOT,
    generatedAt: '2026-08-08T00:00:00.000Z',
  });

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

test('semantic identity excludes generatedAt and output generation preserves protected files', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-baseline-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const firstPath = join(directory, 'first.json');
  const secondPath = join(directory, 'second.json');

  const first = await writeFitV4Baseline({
    root: ROOT,
    output: firstPath,
    generatedAt: '2026-08-08T00:00:00.000Z',
  });
  const second = await writeFitV4Baseline({
    root: ROOT,
    output: secondPath,
    generatedAt: '2026-08-08T00:00:01.000Z',
  });

  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.equal(first.semanticSha256, second.semanticSha256);
  assert.deepEqual(semanticPayload(first), semanticPayload(second));
  assert.equal(first.protectedFiles.beforeSha256, first.protectedFiles.afterSha256);
  assert.equal(second.protectedFiles.beforeSha256, second.protectedFiles.afterSha256);
  assert.equal(first.protectedFiles.unchanged, true);
  assert.equal(second.protectedFiles.unchanged, true);
  assert.deepEqual(JSON.parse(await readFile(firstPath, 'utf8')), first);
  assert.deepEqual(JSON.parse(await readFile(secondPath, 'utf8')), second);
});
