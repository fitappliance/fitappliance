import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FIT_RANK_POLICY_V4,
  compareFitV4Ranks,
  deriveFitV4Rank,
} from '../../src/domain/fit-rank-v4.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import { evaluateFitV4Shadow } from '../../src/domain/fit-v4-shadow.mjs';
import {
  buildTrustedFitV4Input,
  observation,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';
import {
  buildFitV4CalibrationReport,
  expectedCalibrationSplit,
  inventoryLegacyFitConsumers,
  validateFitV4CalibrationManifest,
} from '../../scripts/architecture-v2/build-fit-v4-calibration-report.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/architecture-v2/fit-v4-labelled-cases.json');
const labelRegistryPath = path.join(repoRoot, 'tests/fixtures/architecture-v2/fit-v4-label-registry.json');
const EMPTY_LABEL_REGISTRY = JSON.parse(await readFile(labelRegistryPath, 'utf8'));
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function rehashRank(value) {
  const { semanticSha256: _discarded, ...core } = value.fitV4Rank;
  value.fitV4Rank.semanticSha256 = createHash('sha256').update(JSON.stringify(canonical(core))).digest('hex');
  return value;
}

function trustedEvaluation({ availableWidth = 610 } = {}) {
  const replayInput = buildTrustedFitV4Input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', availableWidth)],
  });
  return { replayInput, result: evaluateFitV4Shadow(replayInput) };
}

async function treeHash(root) {
  const rows = [];
  async function walk(current) {
    for (const name of (await readdir(current)).sort()) {
      const absolute = path.join(current, name);
      const relative = path.relative(root, absolute);
      const info = await stat(absolute);
      if (info.isDirectory()) await walk(absolute);
      else rows.push(`${relative}\0${createHash('sha256').update(await readFile(absolute)).digest('hex')}`);
    }
  }
  await walk(root);
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

test('rank replays a trusted V4 evaluation and emits only the fitV4Rank namespace', () => {
  const { result, replayInput } = trustedEvaluation();
  const ranked = deriveFitV4Rank(result, replayInput);
  assert.deepEqual(Object.keys(ranked), ['fitV4Rank']);
  assert.equal(ranked.fitV4Rank.schemaVersion, 1);
  assert.equal(ranked.fitV4Rank.total, null);
  assert.equal(ranked.fitV4Rank.totalEnabled, false);
  assert.equal(ranked.fitV4Rank.categoryPolicyVersion, FIT_RANK_POLICY_V4.categories.refrigerator.version);
  assert.match(ranked.fitV4Rank.hashes.sourceResult, /^[a-f0-9]{64}$/);
  assert.match(ranked.fitV4Rank.semanticSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(ranked).match(/fitScore|fitScoreNumeric|"score"|"verified"/), null);
  assert.throws(() => deriveFitV4Rank(result), /replay|input|shadow/i);
});

test('rank rejects an audit-shaped or rehashed forged outcome', () => {
  const { result, replayInput } = trustedEvaluation();
  const forged = structuredClone(result);
  forged.installationOutcome = {
    status: 'VERIFIED_FIT',
    reasonCode: 'ALL_APPLICABLE_HARD_CONDITIONS_PROVEN',
    checkIds: forged.checks.filter((row) => row.scope === 'installation').map((row) => row.id),
    gapCount: 0,
  };
  forged.gaps = [];
  assert.throws(() => deriveFitV4Rank(forged, replayInput), /replayed|source result|binding|mismatch/i);
});

test('rank hashing and replay comparison are deterministic', () => {
  const firstEvaluation = trustedEvaluation();
  const secondEvaluation = trustedEvaluation();
  const first = deriveFitV4Rank(firstEvaluation.result, firstEvaluation.replayInput);
  const replay = deriveFitV4Rank(secondEvaluation.result, secondEvaluation.replayInput);
  assert.deepEqual(first, replay);
  assert.equal(compareFitV4Ranks(first, replay, {
    leftReplayInput: firstEvaluation.replayInput,
    rightReplayInput: secondEvaluation.replayInput,
  }), 0);
});

test('rank comparison rejects rehashed ordinal and generic-key substitution', () => {
  const evaluation = trustedEvaluation();
  const accepted = deriveFitV4Rank(evaluation.result, evaluation.replayInput);
  const ordinal = structuredClone(accepted);
  ordinal.fitV4Rank.outcomeBand.ordinal = 99;
  rehashRank(ordinal);
  assert.throws(() => compareFitV4Ranks(ordinal, accepted, {
    leftReplayInput: evaluation.replayInput,
    rightReplayInput: evaluation.replayInput,
  }), /outcome band|ordinal|schema/i);

  const generic = structuredClone(accepted);
  generic.fitV4Rank.score = 100;
  rehashRank(generic);
  assert.throws(() => compareFitV4Ranks(generic, accepted, {
    leftReplayInput: evaluation.replayInput,
    rightReplayInput: evaluation.replayInput,
  }), /schema|key|generic/i);

  const forgedReserve = structuredClone(accepted);
  forgedReserve.fitV4Rank.vector.criticalReserve.value = 999;
  rehashRank(forgedReserve);
  assert.throws(() => compareFitV4Ranks(forgedReserve, accepted, {
    leftReplayInput: evaluation.replayInput,
    rightReplayInput: evaluation.replayInput,
  }), /source result|derived|semantic|mismatch/i);
});

test('categorical outcome bands precede numeric reserves', () => {
  const insufficient = trustedEvaluation({ availableWidth: 610 });
  const noFit = trustedEvaluation({ availableWidth: 590 });
  const insufficientRank = deriveFitV4Rank(insufficient.result, insufficient.replayInput);
  const noFitRank = deriveFitV4Rank(noFit.result, noFit.replayInput);
  assert.equal(insufficientRank.fitV4Rank.outcomeBand.name, 'INSUFFICIENT_DATA');
  assert.equal(noFitRank.fitV4Rank.outcomeBand.name, 'NO_FIT');
  assert.ok(compareFitV4Ranks(insufficientRank, noFitRank, {
    leftReplayInput: insufficient.replayInput,
    rightReplayInput: noFit.replayInput,
  }) < 0);
});

test('incomplete evidence disables all numeric rank components and the total', () => {
  const evaluation = trustedEvaluation({ availableWidth: 610 });
  const ranked = deriveFitV4Rank(evaluation.result, evaluation.replayInput);
  assert.equal(ranked.fitV4Rank.evidenceBand.name, 'INCOMPLETE');
  assert.equal(ranked.fitV4Rank.vector.criticalReserve.value, null);
  assert.equal(ranked.fitV4Rank.vector.operationReserve.value, null);
  assert.equal(ranked.fitV4Rank.vector.inverseInstallationComplexity.value, null);
  assert.equal(ranked.fitV4Rank.totalEnabled, false);
  assert.equal(ranked.fitV4Rank.total, null);
  assert.deepEqual(ranked.fitV4Rank.hypothesisWeights, {
    criticalReserve: 40, operationReserve: 25, inverseInstallationComplexity: 20, evidence: 15,
  });
});

test('the frozen calibration fixture is honest about zero labels and four blocked categories', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const validated = validateFitV4CalibrationManifest(fixture, { labelRegistry: EMPTY_LABEL_REGISTRY });
  assert.deepEqual(validated.categories.map((row) => row.category), [
    'dishwasher', 'dryer', 'refrigerator', 'washing_machine',
  ]);
  assert.ok(validated.categories.every((row) => row.sourceBackedCaseCount === 0
    && row.eligible === false && row.cases.length === 0));
  assert.ok(validated.categories.every((row) => row.policyBinding
    && /^[a-f0-9]{64}$/.test(row.policyBinding.coverageSha256)
    && row.policyBinding.supportedCoverageCaseCount > 0));
  const invalid = structuredClone(fixture);
  invalid.categories[0].eligible = true;
  assert.throws(() => validateFitV4CalibrationManifest(invalid, { labelRegistry: EMPTY_LABEL_REGISTRY }), /minimum|50/i);
});

function labelledCase(id, category, manifest) {
  const firstSupportedCase = FIT_POLICY_PACKS_V4[category].coverageManifest.cases
    .find((row) => row.disposition === 'EVALUATED').id;
  const row = {
    caseId: id,
    category,
    canonicalProductId: `product-${id}`,
    sourceLabelOrigin: 'SOURCE_BACKED_INDEPENDENT_REVIEW',
    sourceRefs: [`source-${id}`],
    installationOutcome: 'VERIFIED_FIT',
    preferenceBand: 'PREFERRED_WITHIN_OUTCOME_AND_EVIDENCE_BAND',
    labelRegistryEntryId: `label-${id}`,
    policyBranchIds: [firstSupportedCase],
    coverageTags: id.endsWith('00') ? ['boundary', 'adversarial'] : [],
  };
  return { ...row, split: expectedCalibrationSplit(row, manifest.holdout) };
}

function labelRegistryFor(manifest) {
  const byId = new Map();
  for (const row of manifest.categories.flatMap((category) => category.cases)) {
    byId.set(row.labelRegistryEntryId, {
      labelId: row.labelRegistryEntryId,
      caseId: row.caseId,
      category: row.category,
      canonicalProductId: row.canonicalProductId,
      installationOutcome: row.installationOutcome,
      preferenceBand: row.preferenceBand,
      sourceRefs: row.sourceRefs,
      sourceEvidenceSha256: row.sourceRefs.map((ref) => semanticHash({ ref })),
      reviewerId: 'independent-fixture-reviewer',
      reviewerIndependent: true,
      reviewedAt: manifest.frozenAt,
      reviewRecordSha256: semanticHash({ caseId: row.caseId, reviewer: 'independent-fixture-reviewer' }),
    });
  }
  const payload = {
    schemaVersion: 1,
    registryId: 'fit-v4-test-label-registry',
    frozenAt: manifest.frozenAt,
    labels: [...byId.values()].sort((left, right) => left.labelId.localeCompare(right.labelId)),
  };
  const registry = { ...payload, registrySha256: semanticHash(payload) };
  manifest.labelRegistrySha256 = registry.registrySha256;
  return registry;
}

test('calibration validation fails closed on duplicate, evaluator-derived, branch, and holdout defects', async () => {
  const base = JSON.parse(await readFile(fixturePath, 'utf8'));
  const duplicate = structuredClone(base);
  const row = labelledCase('case-00', 'dishwasher', duplicate);
  duplicate.categories[0].cases = [row, row];
  duplicate.categories[0].sourceBackedCaseCount = 2;
  assert.throws(() => validateFitV4CalibrationManifest(duplicate, { labelRegistry: labelRegistryFor(duplicate) }), /duplicate/i);

  const derived = structuredClone(base);
  const derivedRow = labelledCase('case-00', 'dishwasher', derived);
  derivedRow.sourceLabelOrigin = 'FIT_V4_EVALUATOR';
  derived.categories[0].cases = [derivedRow];
  derived.categories[0].sourceBackedCaseCount = 1;
  assert.throws(() => validateFitV4CalibrationManifest(derived, { labelRegistry: labelRegistryFor(derived) }), /evaluator-derived|source-backed/i);

  const selfReviewed = structuredClone(base);
  const selfReviewedRow = labelledCase('case-self-reviewed', 'dishwasher', selfReviewed);
  selfReviewed.categories[0].cases = [selfReviewedRow];
  selfReviewed.categories[0].sourceBackedCaseCount = 1;
  const selfReviewedRegistry = labelRegistryFor(selfReviewed);
  selfReviewedRegistry.labels[0].reviewerIndependent = false;
  const selfReviewedPayload = {
    schemaVersion: selfReviewedRegistry.schemaVersion,
    registryId: selfReviewedRegistry.registryId,
    frozenAt: selfReviewedRegistry.frozenAt,
    labels: selfReviewedRegistry.labels,
  };
  selfReviewedRegistry.registrySha256 = semanticHash(selfReviewedPayload);
  selfReviewed.labelRegistrySha256 = selfReviewedRegistry.registrySha256;
  assert.throws(
    () => validateFitV4CalibrationManifest(selfReviewed, { labelRegistry: selfReviewedRegistry }),
    /independent reviewer/i,
  );

  const hiddenDerived = structuredClone(base);
  const hiddenDerivedRow = labelledCase('case-hidden', 'dishwasher', hiddenDerived);
  hiddenDerivedRow.labelGeneratedBy = 'FIT_V4_EVALUATOR';
  hiddenDerived.categories[0].cases = [hiddenDerivedRow];
  hiddenDerived.categories[0].sourceBackedCaseCount = 1;
  assert.throws(() => validateFitV4CalibrationManifest(hiddenDerived, { labelRegistry: labelRegistryFor(hiddenDerived) }), /schema|key|evaluator/i);

  const policyDrift = structuredClone(base);
  policyDrift.categories[0].policyBinding.coverageSha256 = 'b'.repeat(64);
  assert.throws(() => validateFitV4CalibrationManifest(policyDrift, { labelRegistry: EMPTY_LABEL_REGISTRY }), /policy|coverage|binding|hash/i);

  const eligible = structuredClone(base);
  const category = eligible.categories[0];
  category.cases = Array.from({ length: 50 }, (_, index) => (
    labelledCase(`case-${String(index).padStart(2, '0')}`, category.category, eligible)
  ));
  category.sourceBackedCaseCount = category.cases.length;
  category.eligible = true;
  category.blockingReasons = [];
  assert.throws(() => validateFitV4CalibrationManifest(eligible, { labelRegistry: labelRegistryFor(eligible) }), /branch coverage/i);

  category.cases[0].policyBranchIds = FIT_POLICY_PACKS_V4.dishwasher.coverageManifest.cases
    .filter((row) => row.disposition === 'EVALUATED')
    .map((row) => row.id);
  category.cases[0].split = category.cases[0].split === 'holdout' ? 'calibration' : 'holdout';
  assert.throws(() => validateFitV4CalibrationManifest(eligible, { labelRegistry: labelRegistryFor(eligible) }), /holdout|split/i);

  const emptyBranches = structuredClone(base);
  emptyBranches.categories[0].cases = Array.from({ length: 50 }, (_, index) => (
    labelledCase(`empty-${String(index).padStart(2, '0')}`, 'dishwasher', emptyBranches)
  ));
  emptyBranches.categories[0].sourceBackedCaseCount = 50;
  emptyBranches.categories[0].eligible = true;
  emptyBranches.categories[0].blockingReasons = [];
  assert.throws(() => validateFitV4CalibrationManifest(emptyBranches, { labelRegistry: labelRegistryFor(emptyBranches) }), /branch coverage/i);
});

test('consumer inventory and report are deterministic, complete, shadow-only, and public-byte-safe', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const before = await treeHash(path.join(repoRoot, 'public'));
  const inventory = inventoryLegacyFitConsumers(repoRoot);
  const paths = new Set(inventory.files.map((row) => row.path));
  for (const required of [
    'public/scripts/fit-engine.js',
    'public/scripts/replacement-matcher.mjs',
    'public/scripts/ui/fit-score.js',
    'public/scripts/ui/product-card.js',
    'public/scripts/ui/compare-table.js',
    'public/scripts/ui/fit-score-ring.js',
    'public/scripts/ui/score-breakdown.js',
    'public/scripts/ui/range-filters.js',
    'scripts/generate-product-pages.js',
    'scripts/architecture-v2/build-public-projection.mjs',
    'scripts/architecture-v2/build-official-registry-fit-v3-pilot.mjs',
    'src/domain/brand-validation-sample.mjs',
    'src/domain/fit-v3-pilot-audit.mjs',
    'src/domain/historical-evidence-program-status.mjs',
    'public/data/appliances.json',
  ]) assert.equal(paths.has(required), true, required);
  assert.ok(inventory.files.every((row) => row.migrated === false));

  const first = buildFitV4CalibrationReport({ manifest: fixture, labelRegistry: EMPTY_LABEL_REGISTRY, repoRoot });
  const replay = buildFitV4CalibrationReport({ manifest: fixture, labelRegistry: EMPTY_LABEL_REGISTRY, repoRoot });
  assert.deepEqual(first, replay);
  assert.equal(first.summary.status, 'TOTAL_DISABLED_INSUFFICIENT_SOURCE_BACKED_LABELS');
  assert.equal(first.summary.totalEnabled, false);
  assert.ok(Object.values(first.metrics).every((value) => value === 'NOT_MEASURABLE'));
  assert.deepEqual(first.calibratedWeights, {
    criticalReserve: 0, operationReserve: 0, inverseInstallationComplexity: 0, evidence: 0,
  });
  assert.match(first.markdown, /None of the legacy consumers are migrated/i);
  assert.match(first.markdown, /Task 12/);
  assert.equal(await treeHash(path.join(repoRoot, 'public')), before);
});
