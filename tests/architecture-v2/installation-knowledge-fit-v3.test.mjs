import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
