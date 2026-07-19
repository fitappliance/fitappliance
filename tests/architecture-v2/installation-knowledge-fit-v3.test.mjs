import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX,
  INSTALLATION_KNOWLEDGE_SCHEMA_VERSION,
  auditInstallationKnowledge,
  createInstallationKnowledge,
  createModelRequirement,
} from '../../src/domain/installation-knowledge-v3.mjs';
import { evaluateFitV3 } from '../../src/domain/fit-v3.mjs';

const MODEL = 'DW60UT4I2';
const HASH = 'a'.repeat(64);
const RECEIPT_HASH = 'b'.repeat(64);
const FRAGMENT_HASH = 'c'.repeat(64);

function receipt(field, value, options = {}) {
  return createModelRequirement({
    field,
    value,
    unit: options.unit ?? (typeof value === 'number' ? 'mm' : null),
    applicability: options.applicability ?? 'required',
    evidence: {
      sourceUrl: 'https://www.fisherpaykel.com/example.pdf',
      artifactSha256: HASH,
      receiptBindingSha256: RECEIPT_HASH,
      fragmentSha256: FRAGMENT_HASH,
      locator: { page: 2 },
      quote: `${field}: ${String(value)}`,
      applicableModels: options.applicableModels ?? [MODEL],
      identityOutcome: 'exact',
      sourceStatus: options.sourceStatus ?? 'current',
      observedAt: '2026-07-12T00:00:00.000Z',
    },
    targetModel: MODEL,
  });
}

function completeDishwasherKnowledge(overrides = {}) {
  const requirements = {
    'closedEnvelope.widthMm': receipt('closedEnvelope.widthMm', 597),
    'closedEnvelope.heightMm': receipt('closedEnvelope.heightMm', { minimumMm: 857, maximumMm: 917 }, { unit: 'mm' }),
    'closedEnvelope.depthMm': receipt('closedEnvelope.depthMm', 554),
    'installationClearance.leftMm': receipt('installationClearance.leftMm', 2),
    'installationClearance.rightMm': receipt('installationClearance.rightMm', 2),
    'installationClearance.topMm': receipt('installationClearance.topMm', 3),
    'installationClearance.rearMm': receipt('installationClearance.rearMm', 20),
    'operationEnvelope.doorOpenDepthMm': receipt('operationEnvelope.doorOpenDepthMm', 1150),
    'ventilation.rearMm': receipt('ventilation.rearMm', 0),
    'waterConnection.required': receipt('waterConnection.required', true, { unit: null }),
    'waterConnection.hoseReachMm': receipt('waterConnection.hoseReachMm', 1500),
    'waterConnection.minimumPressureKpa': receipt('waterConnection.minimumPressureKpa', 30, { unit: 'kPa' }),
    'waterConnection.maximumPressureKpa': receipt('waterConnection.maximumPressureKpa', 1000, { unit: 'kPa' }),
    'powerConnection.required': receipt('powerConnection.required', true, { unit: null }),
    'powerConnection.leadReachMm': receipt('powerConnection.leadReachMm', 1600),
    'powerConnection.voltageV': receipt('powerConnection.voltageV', 230, { unit: 'V' }),
    'powerConnection.currentA': receipt('powerConnection.currentA', 10, { unit: 'A' }),
    'drainConnection.required': receipt('drainConnection.required', true, { unit: null }),
    'drainConnection.hoseReachMm': receipt('drainConnection.hoseReachMm', 1800),
    'drainConnection.minimumHeightMm': receipt('drainConnection.minimumHeightMm', 500),
    'drainConnection.maximumHeightMm': receipt('drainConnection.maximumHeightMm', 1000),
    'drainConnection.highLoopRequired': receipt('drainConnection.highLoopRequired', true, { unit: null }),
    'deliveryEnvelope.widthMm': receipt('deliveryEnvelope.widthMm', 650),
    'deliveryEnvelope.heightMm': receipt('deliveryEnvelope.heightMm', 950),
    'deliveryEnvelope.depthMm': receipt('deliveryEnvelope.depthMm', 650),
    'professionalInstallation.required': receipt('professionalInstallation.required', false, { unit: null }),
    ...overrides,
  };
  return createInstallationKnowledge({
    canonicalProductId: 'fa_prod_dw60ut4i2',
    category: 'dishwasher',
    brand: 'Fisher & Paykel',
    model: MODEL,
    formFactor: 'built_in',
    formFactorEvidence: receipt('closedEnvelope.widthMm', 597).evidence,
    requirements,
    normativeRules: [],
  });
}

const SITE = Object.freeze({
  measuredAt: '2026-07-12T00:00:00.000Z',
  measurementUncertaintyMm: 1,
  cavity: { widthMm: 605, heightMm: 925, depthMm: 580 },
  operation: { frontWorkingDepthMm: 1200 },
  water: { pointDistanceMm: 1200, isolationAccessible: true, pressureKpa: 300 },
  power: { socketDistanceMm: 1200, socketAccessible: true, voltageV: 230, availableCurrentA: 16 },
  drain: { pointDistanceMm: 1300, routeAvailable: true, connectionHeightMm: 700, highLoopPresent: true },
  delivery: { minimumDoorwayWidthMm: 800, minimumDoorwayHeightMm: 2000, minimumPathDepthMm: 700 },
});

test('model requirement rejects sibling suffix and unknown-to-zero coercion', () => {
  assert.throws(
    () => receipt('closedEnvelope.widthMm', 597, { applicableModels: ['DW60UT4I2B'] }),
    /exact model|applicable/i,
  );
  assert.throws(
    () => createModelRequirement({
      field: 'installationClearance.rearMm',
      value: 0,
      unit: 'mm',
      applicability: 'unknown',
      evidence: null,
      targetModel: MODEL,
    }),
    /unknown|evidence/i,
  );
  assert.throws(
    () => receipt('closedEnvelope.widthMm', 597, { sourceStatus: 'superseded' }),
    /current|superseded/i,
  );
  assert.throws(
    () => createModelRequirement({
      field: 'closedEnvelope.widthMm',
      value: 597,
      unit: 'mm',
      applicability: 'required',
      targetModel: MODEL,
      evidence: {
        sourceUrl: 'https://www.fisherpaykel.com/example.pdf',
        artifactSha256: HASH,
        locator: { page: 2 },
        quote: 'width 597 mm',
        applicableModels: [MODEL],
        identityOutcome: 'exact',
        sourceStatus: 'current',
        observedAt: '2026-07-12T00:00:00.000Z',
      },
    }),
    /receipt|fragment/i,
  );
});

test('knowledge audit distinguishes missing required evidence from non-applicable', () => {
  const knowledge = completeDishwasherKnowledge({ 'drainConnection.hoseReachMm': undefined });
  const audit = auditInstallationKnowledge(knowledge);
  assert.ok(audit.missingRequired.includes('drainConnection.hoseReachMm'));
  assert.equal(audit.eligibleForVerifiedFit, false);

  const contradictory = completeDishwasherKnowledge({
    'waterConnection.minimumPressureKpa': receipt('waterConnection.minimumPressureKpa', 1000, { unit: 'kPa' }),
    'waterConnection.maximumPressureKpa': receipt('waterConnection.maximumPressureKpa', 30, { unit: 'kPa' }),
  });
  assert.ok(auditInstallationKnowledge(contradictory).evidenceViolations.includes('waterConnection.pressureRange'));
  assert.equal(auditInstallationKnowledge(contradictory).eligibleForVerifiedFit, false);

  const nonApplicableWidth = completeDishwasherKnowledge({
    'closedEnvelope.widthMm': receipt('closedEnvelope.widthMm', null, {
      applicability: 'not_applicable',
      unit: null,
    }),
  });
  assert.ok(auditInstallationKnowledge(nonApplicableWidth).missingRequired.includes('closedEnvelope.widthMm'));

  const optionalHeight = completeDishwasherKnowledge({
    'closedEnvelope.heightMm': receipt('closedEnvelope.heightMm', 857, {
      applicability: 'optional',
    }),
  });
  assert.ok(auditInstallationKnowledge(optionalHeight).missingRequired.includes('closedEnvelope.heightMm'));
});

test('refrigerator knowledge requires form-factor-specific operation evidence', () => {
  const requirements = {
    'closedEnvelope.widthMm': receipt('closedEnvelope.widthMm', 900),
    'closedEnvelope.heightMm': receipt('closedEnvelope.heightMm', 1800),
    'closedEnvelope.depthMm': receipt('closedEnvelope.depthMm', 700),
    'installationClearance.leftMm': receipt('installationClearance.leftMm', 10),
    'installationClearance.rightMm': receipt('installationClearance.rightMm', 10),
    'installationClearance.topMm': receipt('installationClearance.topMm', 20),
    'installationClearance.rearMm': receipt('installationClearance.rearMm', 30),
    'ventilation.rearMm': receipt('ventilation.rearMm', 30),
    'waterConnection.required': receipt('waterConnection.required', false, { unit: null }),
    'powerConnection.required': receipt('powerConnection.required', false, { unit: null }),
    'professionalInstallation.required': receipt('professionalInstallation.required', false, { unit: null }),
    'deliveryEnvelope.widthMm': receipt('deliveryEnvelope.widthMm', 950),
    'deliveryEnvelope.heightMm': receipt('deliveryEnvelope.heightMm', 1900),
    'deliveryEnvelope.depthMm': receipt('deliveryEnvelope.depthMm', 750),
  };
  const unknownForm = createInstallationKnowledge({ canonicalProductId: 'fridge-1', category: 'fridge', brand: 'Example', model: MODEL, requirements });
  assert.ok(auditInstallationKnowledge(unknownForm).missingRequired.includes('formFactor'));

  const upright = createInstallationKnowledge({ canonicalProductId: 'fridge-1', category: 'fridge', brand: 'Example', model: MODEL, formFactor: 'upright', requirements });
  assert.ok(auditInstallationKnowledge(upright).missingRequired.includes('formFactorEvidence'));
  assert.ok(auditInstallationKnowledge(upright).missingRequired.includes('operationEnvelope.doorOpenDepthMm'));
  assert.ok(auditInstallationKnowledge(upright).missingRequired.includes('operationEnvelope.hingeSideSpaceMm'));
  assert.throws(
    () => createInstallationKnowledge({ canonicalProductId: 'fridge-1', category: 'fridge', brand: 'Example', model: MODEL, formFactor: 'unknown-door-kind', requirements }),
    /form factor/i,
  );
});

test('Fit V3 fails a hard cavity constraint with check-level reasons', () => {
  const result = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, cavity: { ...SITE.cavity, widthMm: 600 } },
  });
  assert.equal(result.outcome, 'NO_FIT');
  assert.equal(result.checks.find((check) => check.id === 'placement.width').status, 'FAIL');
  assert.match(result.summary, /width/i);
});

test('Fit V3 never ignores accepted side or top ventilation requirements', () => {
  const knowledge = completeDishwasherKnowledge({
    'ventilation.leftMm': receipt('ventilation.leftMm', 10),
    'ventilation.rightMm': receipt('ventilation.rightMm', 10),
    'ventilation.topMm': receipt('ventilation.topMm', 20),
  });
  const result = evaluateFitV3({ knowledge, siteProfile: SITE });

  assert.equal(result.outcome, 'NO_FIT');
  assert.equal(result.checks.find((check) => check.id === 'placement.width').status, 'FAIL');
  assert.equal(result.checks.find((check) => check.id === 'placement.height').status, 'FAIL');
});

test('Fit V3 is conditional when an applicable service condition is unknown', () => {
  const knowledge = completeDishwasherKnowledge({ 'drainConnection.hoseReachMm': undefined });
  const result = evaluateFitV3({ knowledge, siteProfile: SITE });
  assert.equal(result.outcome, 'CONDITIONAL_FIT');
  assert.ok(result.productEvidenceGaps.includes('drainConnection.hoseReachMm'));
});

test('Fit V3 requires complete exact receipts and precise site inputs for VERIFIED_FIT', () => {
  const result = evaluateFitV3({ knowledge: completeDishwasherKnowledge(), siteProfile: SITE });
  assert.equal(result.outcome, 'VERIFIED_FIT');
  assert.equal(result.checks.every((check) => check.status === 'PASS' || check.status === 'NOT_APPLICABLE'), true);

  const estimated = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, estimatedFields: ['cavity.depthMm'] },
  });
  assert.equal(estimated.outcome, 'LIKELY_FIT_ESTIMATED');
});

test('Fit V3 enforces drain height, water pressure, electrical capacity and delivery path', () => {
  const badDrain = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, drain: { ...SITE.drain, connectionHeightMm: 1200 } },
  });
  assert.equal(badDrain.outcome, 'NO_FIT');
  assert.equal(badDrain.checks.find((check) => check.id === 'drainConnection.height').status, 'FAIL');

  const badPower = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, power: { ...SITE.power, availableCurrentA: 5 } },
  });
  assert.equal(badPower.outcome, 'NO_FIT');
  assert.equal(badPower.checks.find((check) => check.id === 'powerConnection.current').status, 'FAIL');

  const badDelivery = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, delivery: { ...SITE.delivery, minimumDoorwayWidthMm: 640 } },
  });
  assert.equal(badDelivery.outcome, 'NO_FIT');
  assert.equal(badDelivery.checks.find((check) => check.id === 'delivery.width').status, 'FAIL');
});

test('Fit V3 evaluates exact voltage ranges without flattening them to a nominal value', () => {
  const ranged = completeDishwasherKnowledge({
    'powerConnection.voltageV': undefined,
    'powerConnection.minimumVoltageV': receipt('powerConnection.minimumVoltageV', 220, { unit: 'V' }),
    'powerConnection.maximumVoltageV': receipt('powerConnection.maximumVoltageV', 240, { unit: 'V' }),
  });
  const passing = evaluateFitV3({ knowledge: ranged, siteProfile: SITE });
  assert.equal(passing.outcome, 'VERIFIED_FIT');
  assert.equal(passing.checks.find((check) => check.id === 'powerConnection.voltage').status, 'PASS');

  const failing = evaluateFitV3({
    knowledge: ranged,
    siteProfile: { ...SITE, power: { ...SITE.power, voltageV: 250 } },
  });
  assert.equal(failing.outcome, 'NO_FIT');
  assert.equal(failing.checks.find((check) => check.id === 'powerConnection.voltage').status, 'FAIL');
});

test('Fit V3 does not invent a tolerance for a scalar nominal voltage', () => {
  const result = evaluateFitV3({
    knowledge: completeDishwasherKnowledge(),
    siteProfile: { ...SITE, power: { ...SITE.power, voltageV: 245 } },
  });
  assert.equal(result.outcome, 'CONDITIONAL_FIT');
  assert.equal(result.checks.find((check) => check.id === 'powerConnection.voltage').status, 'UNKNOWN');
});

test('Fit V3 checks lid-open height for a top-loader washing machine', () => {
  const dishwasher = completeDishwasherKnowledge();
  const requirements = {
    ...dishwasher.requirements,
    'operationEnvelope.doorOpenDepthMm': undefined,
    'operationEnvelope.lidOpenHeightMm': receipt('operationEnvelope.lidOpenHeightMm', 1200),
  };
  const knowledge = createInstallationKnowledge({
    canonicalProductId: 'washer-top-loader-1',
    category: 'washing_machine',
    brand: 'Example',
    model: MODEL,
    formFactor: 'top_loader',
    formFactorEvidence: receipt('closedEnvelope.widthMm', 597).evidence,
    requirements,
  });
  const result = evaluateFitV3({
    knowledge,
    siteProfile: {
      ...SITE,
      operation: { overheadClearanceMm: 1100 },
    },
  });
  assert.equal(result.outcome, 'NO_FIT');
  assert.equal(result.checks.find((check) => check.id === 'operation.lidOpenHeight').status, 'FAIL');
  assert.equal(result.checks.some((check) => check.id === 'operation.doorOpenDepth'), false);
});

test('installation applicability contract covers all four appliance categories at schema v2', () => {
  assert.equal(INSTALLATION_KNOWLEDGE_SCHEMA_VERSION, 2);
  assert.equal(INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX.schemaVersion, 2);
  assert.deepEqual(
    Object.keys(INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX.categories).sort(),
    ['dishwasher', 'dryer', 'fridge', 'washing_machine'],
  );
  assert.deepEqual(
    INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX.categories.washing_machine.formFactors,
    ['front_loader', 'top_loader', 'washer_dryer_combo'],
  );
  assert.ok(
    INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX.categories.dryer.requiredFields
      .includes('drainConnection.required'),
  );
});

test('washing-machine and dryer requirements are form-factor and connection aware', () => {
  const washer = createInstallationKnowledge({
    canonicalProductId: 'washer-1',
    category: 'washing_machine',
    brand: 'Example',
    model: MODEL,
    formFactor: 'front_loader',
    requirements: {},
  });
  assert.equal(washer.schemaVersion, 2);
  const washerAudit = auditInstallationKnowledge(washer);
  assert.ok(washerAudit.missingRequired.includes('operationEnvelope.doorOpenDepthMm'));
  assert.ok(washerAudit.missingRequired.includes('waterConnection.required'));
  assert.ok(washerAudit.missingRequired.includes('drainConnection.required'));

  const dryer = createInstallationKnowledge({
    canonicalProductId: 'dryer-1',
    category: 'dryer',
    brand: 'Example',
    model: MODEL,
    formFactor: 'front_loader',
    requirements: {},
  });
  const dryerAudit = auditInstallationKnowledge(dryer);
  assert.ok(dryerAudit.missingRequired.includes('operationEnvelope.doorOpenDepthMm'));
  assert.ok(dryerAudit.missingRequired.includes('ventilation.rearMm'));
  assert.ok(dryerAudit.missingRequired.includes('drainConnection.required'));
  assert.throws(
    () => createInstallationKnowledge({
      canonicalProductId: 'washer-2',
      category: 'washing_machine',
      brand: 'Example',
      model: MODEL,
      formFactor: 'upright',
      requirements: {},
    }),
    /form factor/i,
  );
});

test('exact voltage ranges remain ranges and satisfy the voltage evidence alternative', () => {
  const requirements = {
    'powerConnection.required': receipt('powerConnection.required', true, { unit: null }),
    'powerConnection.leadReachMm': receipt('powerConnection.leadReachMm', 1500),
    'powerConnection.minimumVoltageV': receipt('powerConnection.minimumVoltageV', 220, { unit: 'V' }),
    'powerConnection.maximumVoltageV': receipt('powerConnection.maximumVoltageV', 240, { unit: 'V' }),
    'powerConnection.currentA': receipt('powerConnection.currentA', 10, { unit: 'A' }),
  };
  const knowledge = createInstallationKnowledge({
    canonicalProductId: 'dryer-2',
    category: 'dryer',
    brand: 'Example',
    model: MODEL,
    formFactor: 'front_loader',
    requirements,
  });
  const audit = auditInstallationKnowledge(knowledge);
  assert.equal(audit.missingRequired.includes('powerConnection.voltage'), false);
  assert.deepEqual(
    [
      knowledge.requirements['powerConnection.minimumVoltageV'].value,
      knowledge.requirements['powerConnection.maximumVoltageV'].value,
    ],
    [220, 240],
  );
});
