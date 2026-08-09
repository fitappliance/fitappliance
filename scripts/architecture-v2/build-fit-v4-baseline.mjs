import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX,
  createInstallationKnowledge,
  createModelRequirement,
} from '../../src/domain/installation-knowledge-v3.mjs';
import { evaluateFitV3 } from '../../src/domain/fit-v3.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_OUTPUT = 'data/architecture-v2/reviews/automated/fit-v4-baseline.json';
const require = createRequire(import.meta.url);
const { evaluateFit: evaluateFitV2 } = require('../../src/shared/fit-engine.js');

const MODEL = 'TASK0-DW';
const ARTIFACT_HASH = 'a'.repeat(64);
const RECEIPT_HASH = 'b'.repeat(64);
const FRAGMENT_HASH = 'c'.repeat(64);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function requirement(field, value, options = {}) {
  return createModelRequirement({
    field,
    value,
    unit: options.unit ?? (typeof value === 'number' ? 'mm' : null),
    applicability: options.applicability ?? 'required',
    evidence: {
      sourceUrl: 'https://example.invalid/task-0-fixture.pdf',
      artifactSha256: ARTIFACT_HASH,
      receiptBindingSha256: RECEIPT_HASH,
      fragmentSha256: FRAGMENT_HASH,
      locator: { page: 1 },
      quote: `${field}: ${String(value)}`,
      applicableModels: [MODEL],
      identityOutcome: 'exact',
      sourceStatus: 'current',
      observedAt: '2026-08-08T00:00:00.000Z',
    },
    targetModel: MODEL,
  });
}

function dishwasherKnowledge(overrides = {}, options = {}) {
  const requirements = {
    'closedEnvelope.widthMm': requirement('closedEnvelope.widthMm', 600),
    'closedEnvelope.heightMm': requirement('closedEnvelope.heightMm', 850),
    'closedEnvelope.depthMm': requirement('closedEnvelope.depthMm', 600),
    'installationClearance.leftMm': requirement('installationClearance.leftMm', 10),
    'installationClearance.rightMm': requirement('installationClearance.rightMm', 10),
    'installationClearance.topMm': requirement('installationClearance.topMm', 10),
    'installationClearance.rearMm': requirement('installationClearance.rearMm', 20),
    'operationEnvelope.doorOpenDepthMm': requirement('operationEnvelope.doorOpenDepthMm', 1100),
    'ventilation.rearMm': requirement('ventilation.rearMm', 0),
    'waterConnection.required': requirement('waterConnection.required', true),
    'waterConnection.hoseReachMm': requirement('waterConnection.hoseReachMm', 1500),
    'waterConnection.minimumPressureKpa': requirement('waterConnection.minimumPressureKpa', 30, { unit: 'kPa' }),
    'waterConnection.maximumPressureKpa': requirement('waterConnection.maximumPressureKpa', 1000, { unit: 'kPa' }),
    'powerConnection.required': requirement('powerConnection.required', true),
    'powerConnection.leadReachMm': requirement('powerConnection.leadReachMm', 1600),
    'powerConnection.voltageV': requirement('powerConnection.voltageV', 230, { unit: 'V' }),
    'powerConnection.currentA': requirement('powerConnection.currentA', 10, { unit: 'A' }),
    'drainConnection.required': requirement('drainConnection.required', true),
    'drainConnection.hoseReachMm': requirement('drainConnection.hoseReachMm', 1800),
    'drainConnection.minimumHeightMm': requirement('drainConnection.minimumHeightMm', 500),
    'drainConnection.maximumHeightMm': requirement('drainConnection.maximumHeightMm', 1000),
    'drainConnection.highLoopRequired': requirement('drainConnection.highLoopRequired', true),
    'deliveryEnvelope.widthMm': requirement('deliveryEnvelope.widthMm', 650),
    'deliveryEnvelope.heightMm': requirement('deliveryEnvelope.heightMm', 950),
    'deliveryEnvelope.depthMm': requirement('deliveryEnvelope.depthMm', 650),
    'professionalInstallation.required': requirement('professionalInstallation.required', false),
    ...overrides,
  };
  return createInstallationKnowledge({
    canonicalProductId: 'task0-dishwasher',
    category: 'dishwasher',
    brand: 'Task 0',
    model: MODEL,
    formFactor: 'built_in',
    formFactorEvidence: requirement('closedEnvelope.widthMm', 600).evidence,
    requirements,
    normativeRules: options.normativeRules ?? [],
  });
}

const SITE = Object.freeze({
  measuredAt: '2026-08-08T00:00:00.000Z',
  measurementUncertaintyMm: 0,
  cavity: { widthMm: 630, heightMm: 870, depthMm: 630 },
  operation: { frontWorkingDepthMm: 1200 },
  water: { pointDistanceMm: 1200, isolationAccessible: true, pressureKpa: 300 },
  power: { socketDistanceMm: 1200, socketAccessible: true, voltageV: 230, availableCurrentA: 16 },
  drain: { pointDistanceMm: 1300, routeAvailable: true, connectionHeightMm: 700, highLoopPresent: true },
  delivery: { minimumDoorwayWidthMm: 800, minimumDoorwayHeightMm: 2000, minimumPathDepthMm: 800 },
});

function fixtureRisk({ id, riskClass, fixture, sourcePaths, observation, reproduced }) {
  return {
    id,
    riskClass,
    reproduced,
    fixture,
    fixtureSha256: sha256(stableJson(fixture)),
    sourcePaths,
    observation,
  };
}

function dataModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

async function loadPublicFitUi(root) {
  const uiRoot = join(root, 'public/scripts/ui');
  const scoreSource = await readFile(join(uiRoot, 'fit-score.js'), 'utf8');
  const tooltipUrl = dataModuleUrl(await readFile(join(uiRoot, 'tooltips-dictionary.js'), 'utf8'));
  const breakdownSource = (await readFile(join(uiRoot, 'score-breakdown.js'), 'utf8'))
    .replace("'./tooltips-dictionary.js'", JSON.stringify(tooltipUrl));
  const breakdownUrl = dataModuleUrl(breakdownSource);
  const ringSource = (await readFile(join(uiRoot, 'fit-score-ring.js'), 'utf8'))
    .replace("'./score-breakdown.js'", JSON.stringify(breakdownUrl))
    .replace("'./tooltips-dictionary.js'", JSON.stringify(tooltipUrl));
  const [scoreModule, ringModule] = await Promise.all([
    import(dataModuleUrl(scoreSource)),
    import(dataModuleUrl(ringSource)),
  ]);
  return {
    computeFitScore: scoreModule.computeFitScore,
    renderFitScoreCardBlock: ringModule.renderFitScoreCardBlock,
  };
}

async function regularFiles(root, directory) {
  const absolute = join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await regularFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

async function protectedSnapshot(root) {
  const paths = [
    'src/shared/fit-engine.js',
    'src/domain/fit-decision.mjs',
    'src/domain/fit-v3.mjs',
    'src/domain/installation-knowledge-v3.mjs',
    ...await regularFiles(root, 'public'),
  ];
  const files = await Promise.all(paths.map(async (path) => ({ path, sha256: await fileSha256(join(root, path)) })));
  return {
    fileCount: files.length,
    sha256: sha256(stableJson(files)),
  };
}

async function sourceInputs(root, activeProjectionPath) {
  const paths = [
    'scripts/architecture-v2/build-fit-v4-baseline.mjs',
    'tests/architecture-v2/fit-v4-migration-risks.test.mjs',
    'src/shared/fit-engine.js',
    'src/domain/fit-decision.mjs',
    'src/domain/fit-v3.mjs',
    'src/domain/installation-knowledge-v3.mjs',
    'public/scripts/ui/fit-score.js',
    'public/scripts/ui/fit-score-ring.js',
    'public/scripts/ui/score-breakdown.js',
    'public/scripts/ui/tooltips-dictionary.js',
    'public/scripts/search-core.js',
    'data/architecture-v2/decisions/active-retail-release.json',
    activeProjectionPath,
    'data/architecture-v2/generated/installation-knowledge-pilot.json',
    'data/architecture-v2/reviews/automated/fit-v3-shadow-audit.json',
    'data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json',
  ];
  return Promise.all([...new Set(paths)].sort().map(async (path) => ({
    path,
    sha256: await fileSha256(join(root, path)),
  })));
}

export function semanticPayload(baseline) {
  const { generatedAt: _generatedAt, semanticSha256: _semanticSha256, ...payload } = baseline;
  return canonical(payload);
}

export async function buildFitV4Baseline({ root = DEFAULT_ROOT, generatedAt = new Date().toISOString() } = {}) {
  const before = await protectedSnapshot(root);
  const activeReleasePath = join(root, 'data/architecture-v2/decisions/active-retail-release.json');
  const activeRelease = JSON.parse(await readFile(activeReleasePath, 'utf8'));
  const activeProjectionPath = activeRelease.artifacts.publicProjection.path;
  const activeProjection = JSON.parse(await readFile(join(root, activeProjectionPath), 'utf8'));
  const acceptance = JSON.parse(await readFile(join(root, 'data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json'), 'utf8'));
  const { computeFitScore, renderFitScoreCardBlock } = await loadPublicFitUi(root);

  const frontFixture = { field: 'installationClearance.frontMm', requiredMm: 5000, availableFrontMm: 1200 };
  const frontResult = evaluateFitV3({
    knowledge: dishwasherKnowledge({
      'installationClearance.frontMm': requirement('installationClearance.frontMm', frontFixture.requiredMm),
    }),
    siteProfile: SITE,
  });

  const ventilationFixture = { openAreaMm2: 100000, minimumRoomVolumeM3: 80, siteOpenAreaMm2: null, siteRoomVolumeM3: null };
  const ventilationResult = evaluateFitV3({
    knowledge: dishwasherKnowledge({
      'ventilation.openAreaMm2': requirement('ventilation.openAreaMm2', ventilationFixture.openAreaMm2, { unit: 'mm2' }),
      'ventilation.minimumRoomVolumeM3': requirement('ventilation.minimumRoomVolumeM3', ventilationFixture.minimumRoomVolumeM3, { unit: 'm3' }),
    }),
    siteProfile: SITE,
  });

  const weightFixture = { deliveryWeightKg: 500, siteWeightCapacityKg: null };
  const weightResult = evaluateFitV3({
    knowledge: dishwasherKnowledge({
      'deliveryEnvelope.weightKg': requirement('deliveryEnvelope.weightKg', weightFixture.deliveryWeightKg, { unit: 'kg' }),
    }),
    siteProfile: SITE,
  });

  const hiddenFixture = { missingField: 'installationClearance.leftMm', knownVentilationLeftMm: 10 };
  const hiddenResult = evaluateFitV3({
    knowledge: dishwasherKnowledge({
      'installationClearance.leftMm': undefined,
      'ventilation.leftMm': requirement('ventilation.leftMm', hiddenFixture.knownVentilationLeftMm),
    }),
    siteProfile: SITE,
  });

  const rearFixture = {
    geometry: {
      category: 'dishwasher',
      closedEnvelope: { widthMm: 600, heightMm: { maximumMm: 850 }, depthMm: 600 },
      installation: { leftMm: 0, rightMm: 0, topMm: 0, rearMm: 20 },
      service: { rearServicesMm: 30 },
    },
    cavity: { widthMm: 600, heightMm: 850, depthMm: 630 },
    evidenceLevel: 'verified',
    advisoryChecks: [],
  };
  const rearResult = evaluateFitV2(rearFixture);

  const invalidSiteFixture = {
    measuredAt: '1999-01-01T00:00:00.000Z',
    measurementUncertaintyMm: -5,
    cavityWidthMm: -1,
    estimatedFields: ['arbitrary.not-a-schema-field'],
  };
  let invalidSiteResult;
  let invalidSiteRejected = false;
  try {
    invalidSiteResult = evaluateFitV3({
      knowledge: dishwasherKnowledge(),
      siteProfile: {
        ...SITE,
        measuredAt: invalidSiteFixture.measuredAt,
        measurementUncertaintyMm: invalidSiteFixture.measurementUncertaintyMm,
        cavity: { ...SITE.cavity, widthMm: invalidSiteFixture.cavityWidthMm },
        estimatedFields: invalidSiteFixture.estimatedFields,
      },
    });
  } catch {
    invalidSiteRejected = true;
  }

  const ruleFixture = {
    normativeRules: [{ id: 'task0-current-capacity', expression: 'power.availableCurrentA >= 20' }],
    powerRequired: false,
    availableCurrentA: 1,
  };
  const ruleResult = evaluateFitV3({
    knowledge: dishwasherKnowledge({
      'powerConnection.required': requirement('powerConnection.required', false),
    }, { normativeRules: ruleFixture.normativeRules }),
    siteProfile: { ...SITE, power: { ...SITE.power, availableCurrentA: ruleFixture.availableCurrentA } },
  });

  const deliveryFixture = { selected: false, packagedWidthMm: 650, minimumDoorwayWidthMm: 640 };
  const deliveryResult = evaluateFitV3({
    knowledge: dishwasherKnowledge(),
    siteProfile: {
      ...SITE,
      delivery: { ...SITE.delivery, selected: deliveryFixture.selected, minimumDoorwayWidthMm: deliveryFixture.minimumDoorwayWidthMm },
    },
  });

  const advisoryFixture = {
    geometry: rearFixture.geometry,
    cavity: { widthMm: 700, heightMm: 900, depthMm: 700 },
    evidenceLevel: 'verified',
    advisoryChecks: [{ id: 'comfortable_working_space', applicable: true, status: 'FAIL' }],
  };
  const advisoryResult = evaluateFitV2(advisoryFixture);

  const scoreFixture = {
    product: { w: 600, h: 850, d: 600 },
    cavity: { widthMm: 700, heightMm: 950, depthMm: 700 },
    clearance: { side: 20, top: 50, rear: 50 },
    renderedOutcomes: ['NO_FIT', 'CONDITIONAL_FIT', 'INSUFFICIENT_DATA'],
  };
  const score = computeFitScore(
    scoreFixture.product,
    scoreFixture.cavity.widthMm,
    scoreFixture.cavity.heightMm,
    scoreFixture.cavity.depthMm,
    scoreFixture.clearance,
  ).score;
  const renderedScores = Object.fromEntries(scoreFixture.renderedOutcomes.map((outcome) => {
    const html = renderFitScoreCardBlock(score, { fitDecision: { outcome } });
    return [outcome, {
      rendersNumericScore: new RegExp(`class="fit-score-number"[^>]*>\\s*${score}\\s*<`).test(html),
      rendersScoreRing: /class="fit-score-ring(?:\s|--)/.test(html),
      htmlSha256: sha256(html),
    }];
  }));

  const dishwasherFrontLoaders = acceptance.outcomes.filter((row) => (
    row.outcome === 'accepted'
    && row.category === 'dishwasher'
    && row.geometryProjection?.geometry?.formFactor === 'front_loader'
  ));
  const malformedRecord = dishwasherFrontLoaders[0];
  const malformedFixture = {
    artifactPath: 'data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json',
    selection: 'first accepted dishwasher with geometryProjection.geometry.formFactor=front_loader',
  };

  const activeRows = Array.isArray(activeProjection) ? activeProjection : activeProjection.products;
  const washTowerRows = activeRows.filter((row) => row.cat === 'washtower_combo' || row.category === 'washtower_combo');
  const washTowerFixture = { activeProjectionPath, category: 'washtower_combo' };
  const policyCategories = Object.keys(INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX.categories);

  const fitV3Sources = ['src/domain/fit-v3.mjs', 'src/domain/installation-knowledge-v3.mjs'];
  const risks = [
    fixtureRisk({
      id: 'accepted-unevaluated-front-clearance', riskClass: 'UNEVALUATED_ACCEPTED_FIELD', fixture: frontFixture,
      sourcePaths: fitV3Sources,
      observation: { outcome: frontResult.outcome, frontClearanceCheckPresent: frontResult.checks.some((check) => check.fields.includes('installationClearance.frontMm')) },
      reproduced: frontResult.outcome === 'VERIFIED_FIT' && !frontResult.checks.some((check) => check.fields.includes('installationClearance.frontMm')),
    }),
    fixtureRisk({
      id: 'accepted-unevaluated-ventilation-capacity', riskClass: 'UNEVALUATED_ACCEPTED_FIELD', fixture: ventilationFixture,
      sourcePaths: fitV3Sources,
      observation: { outcome: ventilationResult.outcome, ventilationCapacityCheckPresent: ventilationResult.checks.some((check) => check.fields.some((field) => field === 'ventilation.openAreaMm2' || field === 'ventilation.minimumRoomVolumeM3')) },
      reproduced: ventilationResult.outcome === 'VERIFIED_FIT' && !ventilationResult.checks.some((check) => check.fields.some((field) => field === 'ventilation.openAreaMm2' || field === 'ventilation.minimumRoomVolumeM3')),
    }),
    fixtureRisk({
      id: 'accepted-unevaluated-delivery-weight', riskClass: 'UNEVALUATED_ACCEPTED_FIELD', fixture: weightFixture,
      sourcePaths: fitV3Sources,
      observation: { outcome: weightResult.outcome, deliveryWeightCheckPresent: weightResult.checks.some((check) => check.fields.includes('deliveryEnvelope.weightKg')) },
      reproduced: weightResult.outcome === 'VERIFIED_FIT' && !weightResult.checks.some((check) => check.fields.includes('deliveryEnvelope.weightKg')),
    }),
    fixtureRisk({
      id: 'missing-clearance-hidden-by-maximum-known', riskClass: 'UNKNOWN_COLLAPSE', fixture: hiddenFixture,
      sourcePaths: fitV3Sources,
      observation: { outcome: hiddenResult.outcome, placementWidthStatus: hiddenResult.checks.find((check) => check.id === 'placement.width').status, productEvidenceGapPresent: hiddenResult.productEvidenceGaps.includes(hiddenFixture.missingField) },
      reproduced: hiddenResult.checks.find((check) => check.id === 'placement.width').status === 'PASS' && hiddenResult.productEvidenceGaps.includes(hiddenFixture.missingField),
    }),
    fixtureRisk({
      id: 'additive-rear-service-space-undercounted', riskClass: 'INVALID_GEOMETRY_COMPOSITION', fixture: rearFixture,
      sourcePaths: ['src/shared/fit-engine.js'],
      observation: { outcome: rearResult.outcome, currentRequiredDepthMm: rearResult.required.depthMm, additiveRequiredDepthMm: 650, depthStatus: rearResult.checks.find((check) => check.id === 'installation_depth').status },
      reproduced: rearResult.required.depthMm === 630 && rearResult.checks.find((check) => check.id === 'installation_depth').status === 'PASS',
    }),
    fixtureRisk({
      id: 'invalid-site-profile-values-accepted', riskClass: 'SITE_INPUT_VALIDATION_GAP', fixture: invalidSiteFixture,
      sourcePaths: fitV3Sources,
      observation: { rejected: invalidSiteRejected, outcome: invalidSiteResult?.outcome ?? null, arbitraryEstimatedFieldPreserved: invalidSiteResult?.estimatedFields.includes(invalidSiteFixture.estimatedFields[0]) ?? false },
      reproduced: !invalidSiteRejected && invalidSiteResult.estimatedFields.includes(invalidSiteFixture.estimatedFields[0]),
    }),
    fixtureRisk({
      id: 'opaque-rules-and-power-required-semantics', riskClass: 'UNEXECUTED_RULE_AND_APPLICABILITY', fixture: ruleFixture,
      sourcePaths: fitV3Sources,
      observation: { outcome: ruleResult.outcome, normativeRuleCheckPresent: ruleResult.checks.some((check) => check.id === ruleFixture.normativeRules[0].id), powerCapacityCheckPresent: ruleResult.checks.some((check) => check.id === 'powerConnection.current') },
      reproduced: ruleResult.outcome === 'VERIFIED_FIT' && !ruleResult.checks.some((check) => check.id === ruleFixture.normativeRules[0].id || check.id === 'powerConnection.current'),
    }),
    fixtureRisk({
      id: 'unselected-delivery-blocks-fit', riskClass: 'CONTEXT_SELECTION_IGNORED', fixture: deliveryFixture,
      sourcePaths: ['src/domain/fit-v3.mjs'],
      observation: { outcome: deliveryResult.outcome, deliveryWidthStatus: deliveryResult.checks.find((check) => check.id === 'delivery.width').status },
      reproduced: deliveryResult.outcome === 'NO_FIT' && deliveryResult.checks.find((check) => check.id === 'delivery.width').status === 'FAIL',
    }),
    fixtureRisk({
      id: 'v2-advisory-failure-is-no-fit', riskClass: 'ADVISORY_ESCALATED_TO_HARD_FAILURE', fixture: advisoryFixture,
      sourcePaths: ['src/shared/fit-engine.js', 'public/scripts/fit-engine.js'],
      observation: { outcome: advisoryResult.outcome, advisoryStatus: advisoryResult.checks.find((check) => check.id === 'comfortable_working_space').status },
      reproduced: advisoryResult.outcome === 'NO_FIT',
    }),
    fixtureRisk({
      id: 'legacy-score-cross-outcome-comparability', riskClass: 'CROSS_OUTCOME_SCORE_COMPARABILITY', fixture: scoreFixture,
      sourcePaths: ['src/domain/fit-decision.mjs', 'public/scripts/ui/fit-score.js', 'public/scripts/ui/fit-score-ring.js', 'public/scripts/ui/score-breakdown.js', 'public/scripts/ui/tooltips-dictionary.js', 'public/scripts/search-core.js'],
      observation: {
        score,
        noFitRendersNumericScore: renderedScores.NO_FIT.rendersNumericScore,
        noFitRendersScoreRing: renderedScores.NO_FIT.rendersScoreRing,
        conditionalFitRendersNumericScore: renderedScores.CONDITIONAL_FIT.rendersNumericScore,
        conditionalFitRendersScoreRing: renderedScores.CONDITIONAL_FIT.rendersScoreRing,
        insufficientDataRendersNumericScore: renderedScores.INSUFFICIENT_DATA.rendersNumericScore,
        insufficientDataRendersScoreRing: renderedScores.INSUFFICIENT_DATA.rendersScoreRing,
        renderedHtmlSha256: Object.fromEntries(Object.entries(renderedScores).map(([outcome, rendered]) => [outcome, rendered.htmlSha256])),
      },
      reproduced: Number.isFinite(score)
        && renderedScores.NO_FIT.rendersNumericScore
        && renderedScores.NO_FIT.rendersScoreRing
        && renderedScores.CONDITIONAL_FIT.rendersNumericScore
        && renderedScores.CONDITIONAL_FIT.rendersScoreRing
        && !renderedScores.INSUFFICIENT_DATA.rendersNumericScore
        && !renderedScores.INSUFFICIENT_DATA.rendersScoreRing,
    }),
    fixtureRisk({
      id: 'dishwasher-front-loader-form-factor', riskClass: 'CROSS_CATEGORY_FORM_FACTOR', fixture: malformedFixture,
      sourcePaths: [malformedFixture.artifactPath, 'src/domain/installation-knowledge-v3.mjs'],
      observation: { acceptedRecordCount: dishwasherFrontLoaders.length, id: malformedRecord?.id ?? null, model: malformedRecord?.model ?? null, category: malformedRecord?.category ?? null, formFactor: malformedRecord?.geometryProjection?.geometry?.formFactor ?? null },
      reproduced: dishwasherFrontLoaders.length > 0,
    }),
    fixtureRisk({
      id: 'washtower-without-combination-policy', riskClass: 'UNSUPPORTED_ACTIVE_CATEGORY', fixture: washTowerFixture,
      sourcePaths: ['data/architecture-v2/decisions/active-retail-release.json', activeProjectionPath, 'src/domain/installation-knowledge-v3.mjs'],
      observation: { activeRecordCount: washTowerRows.length, sampleIds: washTowerRows.slice(0, 3).map((row) => row.id), policyCategories, dedicatedPolicyPresent: policyCategories.includes('washtower_combo') },
      reproduced: washTowerRows.length > 0 && !policyCategories.includes('washtower_combo'),
    }),
  ];

  const after = await protectedSnapshot(root);
  if (before.sha256 !== after.sha256 || before.fileCount !== after.fileCount) {
    throw new Error('Fit V4 baseline build changed protected V2/V3 or public runtime files');
  }

  const payload = {
    schemaVersion: 1,
    baseline: 'fit-v4-migration-risks',
    generatedAt,
    diagnosticOnly: true,
    sourceInputs: await sourceInputs(root, activeProjectionPath),
    protectedFiles: {
      scope: ['src/shared/fit-engine.js', 'src/domain/fit-decision.mjs', 'src/domain/fit-v3.mjs', 'src/domain/installation-knowledge-v3.mjs', 'public/**'],
      fileCount: before.fileCount,
      beforeSha256: before.sha256,
      afterSha256: after.sha256,
      unchanged: true,
    },
    risks,
    summary: {
      total: risks.length,
      reproduced: risks.filter((risk) => risk.reproduced).length,
      notReproduced: risks.filter((risk) => !risk.reproduced).map((risk) => risk.id),
      publicOrRuntimeMutations: 0,
    },
  };
  return {
    ...payload,
    semanticSha256: sha256(stableJson(semanticPayload(payload))),
  };
}

export async function writeFitV4Baseline({ root = DEFAULT_ROOT, output = DEFAULT_OUTPUT, generatedAt } = {}) {
  const baseline = await buildFitV4Baseline({ root, generatedAt });
  const outputPath = isAbsolute(output) ? output : join(root, output);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(baseline, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
  return baseline;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (!args[index + 1]) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const supported = new Set(['--root', '--output', '--generated-at']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new Error(`unsupported argument: ${args[index]}`);
  }
  const root = resolve(option(args, '--root') ?? DEFAULT_ROOT);
  const output = option(args, '--output') ?? DEFAULT_OUTPUT;
  const baseline = await writeFitV4Baseline({ root, output, generatedAt: option(args, '--generated-at') ?? undefined });
  console.log(JSON.stringify({
    output: relative(root, isAbsolute(output) ? output : join(root, output)),
    semanticSha256: baseline.semanticSha256,
    summary: baseline.summary,
    protectedFilesUnchanged: baseline.protectedFiles.unchanged,
  }));
}
