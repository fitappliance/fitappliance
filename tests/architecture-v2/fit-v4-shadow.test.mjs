import assert from 'node:assert/strict';
import test from 'node:test';

import { auditFitV4ShadowResult } from '../../src/domain/fit-v4-audit.mjs';
import {
  FIT_V4_SHADOW_SCHEMA_VERSION,
  evaluateFitV4Shadow,
  evaluateTypedFitCheckV4,
} from '../../src/domain/fit-v4-shadow.mjs';
import {
  buildTrustedFitV4Input as input,
  FIELD_MAP,
  normalized,
  observation,
  PACK,
  policyClaim,
  semanticHash,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';

const scalar = (value, overrides = {}) => ({
  kind: 'DETERMINISTIC', value, unit: 'mm', coordinateSystem: 'installed_appliance',
  datum: 'projection', axis: 'x', geometryId: 'constraint', ...overrides,
});
const categorical = (valueType, value) => ({
  kind: 'DETERMINISTIC', valueType, value, unit: null, coordinateSystem: 'non_geometric',
  datum: 'projection', axis: 'none', geometryId: 'constraint',
});
const geometry = (kind, value, coordinateSystem = 'installed_appliance') => ({
  kind, value, unit: 'mm', coordinateSystem, datum: 'projection',
});

test('typed checks delegate all eleven relations, including REQUIRED_CONTAINS, to the trusted evaluator', () => {
  const outerBox = geometry('box3', { min: [0, 0, 0], max: [10, 10, 10] }, 'service_route');
  const innerBox = geometry('box3', { min: [2, 2, 2], max: [4, 4, 4] }, 'service_route');
  const route = geometry('route3', [[1, 1, 1], [9, 9, 9]], 'service_route');
  const cases = [
    ['MIN_REQUIRED', scalar(1), scalar(2), 'PASS'],
    ['MAX_ALLOWED', scalar(2), scalar(1), 'PASS'],
    ['WITHIN_RANGE', { ...scalar(0), kind: 'COVERAGE_INTERVAL', minimum: 0, maximum: 10, minimumEndpoint: 'closed', maximumEndpoint: 'closed', value: undefined }, scalar(5), 'PASS'],
    ['CONTAINS', innerBox, outerBox, 'PASS'],
    ['REQUIRED_CONTAINS', outerBox, route, 'PASS'],
    ['PROHIBITED_ZONE', outerBox, innerBox, 'FAIL'],
    ['NO_INTERSECTION', outerBox, geometry('box3', { min: [20, 20, 20], max: [30, 30, 30] }, 'service_route'), 'PASS'],
    ['EXACT_MATCH', categorical('enum', 'heat_pump'), categorical('enum', 'heat_pump'), 'PASS'],
    ['REQUIRES_TRUE', categorical('boolean', true), categorical('boolean', true), 'PASS'],
    ['NOT_MEMBER_OF', categorical('enum_set', ['outdoor']), categorical('enum', 'indoor'), 'PASS'],
    ['SET_CONTAINS', categorical('enum_set', ['door', 'handle']), categorical('enum_set', ['door']), 'PASS'],
  ];
  for (const [relation, required, available, status] of cases) {
    const cleanRequired = Object.fromEntries(Object.entries(required).filter(([, value]) => value !== undefined));
    const check = evaluateTypedFitCheckV4({
      id: `check-${relation}`, relation, required: cleanRequired, available,
      fitClass: 'hard_service', fieldId: `field-${relation}`,
      comparison: { projection: 'DIRECT_VALUE' },
      branch: { id: 'branch-001', selectors: {}, configurationQuantifier: 'FIXED_SELECTED' },
      receiptRefs: [],
    });
    assert.equal(check.status, status, relation);
    assert.equal(check.relation, relation);
    assert.equal(Object.isFrozen(check), true);
  }
});

test('shadow output is immutable, hash-bound, versioned, auditable, and contains no publication eligibility', () => {
  const scenario = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  const result = evaluateFitV4Shadow(scenario);
  assert.equal(result.schemaVersion, FIT_V4_SHADOW_SCHEMA_VERSION);
  assert.equal(result.runId, scenario.runManifest.runId);
  assert.equal(result.versions.policy, PACK.packVersion);
  assert.equal(result.versions.fieldMap, FIELD_MAP.version);
  assert.match(result.hashes.product, /^[a-f0-9]{64}$/);
  assert.match(result.hashes.receipts, /^[a-f0-9]{64}$/);
  assert.match(result.scenarioBinding.scenarioSetSha256, /^[a-f0-9]{64}$/);
  assert.match(result.scenarioBinding.scenarioMemberSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result.hashes, 'siteScenario'), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes('publicationEligibility'), false);
  assert.equal(auditFitV4ShadowResult(result, {
    manifest: scenario.runManifest,
    siteOptions: scenario.scenarioSiteOptions,
  }).passed, true);
});

test('shadow evaluation requires an independently bound manifest and trusted registries', () => {
  const missingManifest = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  delete missingManifest.runManifest;
  assert.throws(() => evaluateFitV4Shadow(missingManifest), /run manifest/i);

  const driftedPolicy = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  driftedPolicy.trustedPolicyBundle = structuredClone(driftedPolicy.trustedPolicyBundle);
  driftedPolicy.trustedPolicyBundle.bundleId = 'self-minted-policy-bundle';
  const { bundleSha256: ignored, ...payload } = driftedPolicy.trustedPolicyBundle;
  driftedPolicy.trustedPolicyBundle.bundleSha256 = semanticHash(payload);
  assert.throws(() => evaluateFitV4Shadow(driftedPolicy), /trusted.*policy|registry.*binding|manifest/i);
});

test('shadow evaluation replays every referenced receipt from original evidence bytes', () => {
  const scenario = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  const [receiptId] = scenario.knowledge.receiptRefs;
  delete scenario.receiptReplayContexts[receiptId].sourceBytes;
  assert.throws(() => evaluateFitV4Shadow(scenario), /source bytes|replay/i);
});

test('installation precedence returns NO_FIT for an applicable hard failure', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 590)],
  }));
  assert.equal(result.installationOutcome.status, 'NO_FIT');
  assert.equal(result.installationOutcome.reasonCode, 'APPLICABLE_HARD_FAILURE');
});

test('installation precedence returns INSUFFICIENT_DATA for missing or overlapping placement evidence', () => {
  const missing = evaluateFitV4Shadow(input({ fields: [['envelope.closed.width', 600]], observations: [] }));
  assert.equal(missing.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(missing.gaps.some((gap) => gap.fieldId === 'envelope.closed.width' && gap.type === 'MISSING_OPERAND'));

  const overlap = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', { minimum: 590, maximum: 610 }, { boundKind: 'COVERAGE_INTERVAL' })],
  }));
  assert.equal(overlap.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(overlap.checks.some((check) => check.reasonCode === 'INTERVAL_OVERLAP'));
});

test('repeated scalar readings preserve every reference and cannot cherry-pick a passing value', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [
      observation('cavity.width', 590, { id: 'width-590' }),
      observation('cavity.width', 605, { id: 'width-605' }),
    ],
  }));
  const check = result.checks.find((row) => row.fieldId === 'envelope.closed.width');
  assert.equal(check.status, 'FAIL');
  assert.deepEqual(check.available.observationRefs, ['width-590', 'width-605']);
  assert.notEqual(result.installationOutcome.status, 'VERIFIED_FIT');
});

test('unresolved service or professional requirements remain visible and block verification', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [], observations: [],
  }));
  assert.equal(result.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(result.gaps.some((gap) => ['hard_service', 'hard_professional'].includes(gap.fitClass)));
});

test('partial exact or coverage evidence cannot claim a complete verified fit', () => {
  const likely = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', { minimum: 610, maximum: 620 }, { boundKind: 'COVERAGE_INTERVAL' })],
  }));
  assert.equal(likely.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(likely.checks.some((check) => check.evidenceClass === 'ESTIMATE_OR_COVERAGE'));

  const estimate = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 615, { boundKind: 'ESTIMATE' })],
  }));
  assert.equal(estimate.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(estimate.checks.some((check) => check.reasonCode === 'ESTIMATE_NOT_DECISIVE'));

  const verified = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  }));
  assert.equal(verified.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.deepEqual(verified.checks[0].receiptRefs.length, 1);
});

test('unknown selectors fail closed and branch checks preserve every configuration quantifier', () => {
  const unknown = evaluateFitV4Shadow(input({
    fields: [['installation.clearance.leftMin', 10]],
    observations: [observation('placement.leftGap', 20)],
  }));
  assert.equal(unknown.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(unknown.gaps.some((gap) => gap.reasonCode === 'UNKNOWN_SELECTOR_ASSIGNMENT'));

  const fixed = evaluateFitV4Shadow(input({
    fields: [['installation.clearance.leftMin', 10]],
    observations: [observation('placement.leftGap', 20)],
    configuration: { installationMode: 'freestanding' },
  }));
  assert.ok(fixed.checks.some((check) => check.configurationQuantifier === 'FIXED_SELECTED'));

  const selectable = evaluateFitV4Shadow(input({
    fields: [['envelope.adjusted.heightRange', { minimum: 1700, maximum: 1800 }]],
    observations: [observation('cavity.height', 1750, { axis: 'z' })],
    configuration: { installationMode: 'freestanding', adjustedHeightMm: 1750 },
  }));
  assert.ok(selectable.checks.some((check) => check.configurationQuantifier === 'INSTALLER_SELECTABLE'));
  assert.equal(selectable.gaps.some((gap) => gap.reasonCode === 'INSTALLER_SETTING_REQUIRED'), false);
});

test('unselected installer-configurable settings cannot become verified fit', () => {
  const reversible = evaluateFitV4Shadow(input({
    fields: [['operation.door.openDepth', 500]],
    observations: [observation('operation.door.availableDepth', 600, { axis: 'y' })],
    configuration: { hingeSide: 'reversible_unselected' },
  }));
  assert.equal(reversible.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(reversible.gaps.some((gap) => gap.fieldId === 'operation.door.openDepth'
    && gap.reasonCode === 'INSTALLER_SETTING_REQUIRED'));

  const adjustable = evaluateFitV4Shadow(input({
    fields: [['envelope.adjusted.heightRange', { minimum: 1700, maximum: 1800 }]],
    observations: [observation('cavity.height', 1750, { axis: 'z' })],
    configuration: { installationMode: 'freestanding' },
  }));
  assert.equal(adjustable.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.ok(adjustable.gaps.some((gap) => gap.fieldId === 'envelope.adjusted.heightRange'
    && gap.reasonCode === 'INSTALLER_SETTING_REQUIRED'));
});

test('audit detects an accepted applicable rule removed from both checks and gaps', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]], observations: [observation('cavity.width', 610)],
  }));
  const tampered = structuredClone(result);
  tampered.checks = [];
  const audit = auditFitV4ShadowResult(tampered);
  assert.equal(audit.passed, false);
  assert.ok(audit.violations.some((row) => row.code === 'ACCEPTED_RULE_UNEVALUATED'));
});

test('placement coherence rejects numerically or geometrically incoherent site observations', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [
      ['envelope.closed.width', 600],
      ['installation.clearance.leftMin', 5],
      ['installation.clearance.rightMin', 5],
    ],
    observations: [
      observation('cavity.width', 610, { geometryId: 'cavity-a' }),
      observation('placement.leftGap', 10, { geometryId: 'cavity-a' }),
      observation('placement.rightGap', 10, { geometryId: 'cavity-a' }),
    ],
    configuration: { installationMode: 'recessed' },
  }));
  assert.ok(result.checks.filter((check) => !check.constraintId).every((check) => check.status === 'PASS'));
  assert.equal(result.checks.some((check) => check.constraintId === 'refrigerator.placement.width'), false);
  assert.ok(result.gaps.some((gap) => gap.constraintId === 'refrigerator.placement.width'
    && gap.reasonCode === 'PLACEMENT_OBSERVATIONS_INCOHERENT'));
  assert.equal(result.installationOutcome.status, 'INSUFFICIENT_DATA');

  const differentGeometry = input({
    fields: [
      ['envelope.closed.width', 600],
      ['installation.clearance.leftMin', 5],
      ['installation.clearance.rightMin', 5],
    ],
    observations: [
      observation('cavity.width', 610, { geometryId: 'cavity-a' }),
      observation('placement.leftGap', 5, { geometryId: 'cavity-b' }),
      observation('placement.rightGap', 5, { geometryId: 'cavity-a' }),
    ],
    configuration: { installationMode: 'recessed' },
  });
  const geometryResult = evaluateFitV4Shadow(differentGeometry);
  assert.ok(geometryResult.gaps.some((gap) => gap.reasonCode === 'PLACEMENT_PROOF_IDENTITY_MISMATCH'));
  assert.notEqual(geometryResult.installationOutcome.status, 'VERIFIED_FIT');
});

test('unmapped geometry fields stay blocked until an exact rights dictionary entry exists', () => {
  assert.throws(() => input({
    fields: [['water.route.permittedZone', { min: [0, 0, 0], max: [100, 100, 100] }]],
    observations: [],
  }), /exact rights mapping|UNMAPPED_BLOCKED/i);
});

test('delivery outcome remains separate and cannot downgrade a passing installation outcome', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [
      ['envelope.closed.width', 600],
      ['delivery.package.width', 700],
    ],
    observations: [
      observation('cavity.width', 610),
      observation('delivery.path.minimumWidth', 650, { coordinateSystem: 'delivery_path' }),
    ],
    deliverySelected: true,
  }));
  assert.equal(result.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.equal(result.deliveryOutcome.status, 'NO_FIT');
  assert.notEqual(result.installationOutcome.reasonCode, result.deliveryOutcome.reasonCode);
});

test('normative confirmations are auditable without pretending selectors are operands', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [],
    observations: [observation('environment.location', 'indoor')],
  }));
  const check = result.checks.find((row) => row.fieldId === 'environment.location.prohibited');
  assert.equal(check.status, 'PASS');
  assert.equal(check.evidenceClass, 'NORMATIVE_CONFIRMATION');
  assert.equal(check.available.subject, 'environment.location');
  assert.equal(result.installationOutcome.status, 'INSUFFICIENT_DATA');
});

test('unused rules from a shared trusted policy bundle never become product operands', () => {
  const unrelated = {
    ruleId: 'dishwasher-shared-width', fieldId: 'envelope.closed.width',
    applicability: { state: 'required', predicate: null },
    normalized: normalized('envelope.closed.width', 999),
    when: { op: 'eq', path: 'product.category', value: 'dishwasher' },
  };
  const result = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
    normative: [unrelated],
  }));
  assert.equal(result.installationOutcome.status, 'INSUFFICIENT_DATA');
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.checks.find((check) => check.fieldId === 'envelope.closed.width').required.value.value, 600);
});

test('trusted policy definitions cannot stand in for accepted product claims', () => {
  const normative = [{
    ruleId: 'normative-circuit', fieldId: 'power.connection.circuitDedicated',
    applicability: { state: 'required', predicate: null },
    normalized: normalized('power.connection.circuitDedicated', true),
    when: { op: 'eq', path: 'product.category', value: 'refrigerator' },
  }];
  const result = evaluateFitV4Shadow(input({
    fields: [], normative,
    observations: [observation('professional.dedicatedCircuit.confirmed', true, {
      observationType: 'confirmation', unit: null, coordinateSystem: 'non_geometric', axis: 'none',
    })],
    configuration: { powerMode: 'plug' },
  }));
  assert.equal(result.checks.some((row) => row.fieldId === 'power.connection.circuitDedicated'), false);
  assert.ok(result.gaps.some((row) => row.fieldId === 'power.connection.circuitDedicated'
    && row.reasonCode === 'MISSING_KNOWLEDGE_CLAIM'));
  assert.notEqual(result.installationOutcome.status, 'VERIFIED_FIT');
});

test('an unmanifested foreign receipt is rejected before it can become a claim', () => {
  const scenario = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  scenario.receiptBundle = structuredClone(scenario.receiptBundle);
  const foreign = structuredClone(scenario.receiptBundle.receipts[0]);
  foreign.identity.canonicalProductId = 'product-r2';
  scenario.receiptBundle.receipts.push(foreign);
  scenario.receiptBundleSha256 = semanticHash({
    schemaVersion: scenario.receiptBundle.schemaVersion,
    receipts: scenario.receiptBundle.receipts,
    conflicts: scenario.receiptBundle.conflicts,
  });
  scenario.receiptBundle.bundleSha256 = scenario.receiptBundleSha256;
  assert.throws(() => evaluateFitV4Shadow(scenario), /receipt bundle manifest binding drift/i);
});

test('shadow identity cannot diverge from the hash-bound Installation Knowledge identity', () => {
  const scenario = input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 610)],
  });
  scenario.knowledge.identity = { ...scenario.knowledge.identity, model: 'R2' };
  scenario.productSha256 = semanticHash(scenario.knowledge);
  assert.throws(() => evaluateFitV4Shadow(scenario), /knowledge.*identity|identity.*knowledge|cross-model.*identity/i);
});

test('mutually exclusive conditional claims are filtered before conflict detection', () => {
  const plug = {
    id: 'left-location-rule', fieldId: 'environment.location.prohibited',
    applicability: {
      state: 'conditional',
      predicate: { op: 'eq', path: 'configuration.hingeSide', value: 'left' },
    },
    normalized: normalized('environment.location.prohibited', ['outdoor']),
    attribution: { kind: 'policy_rule', ruleId: 'left-location-rule' },
  };
  const hardwired = {
    id: 'right-location-rule', fieldId: 'environment.location.prohibited',
    applicability: {
      state: 'conditional',
      predicate: { op: 'eq', path: 'configuration.hingeSide', value: 'right' },
    },
    normalized: normalized('environment.location.prohibited', ['indoor']),
    attribution: { kind: 'policy_rule', ruleId: 'right-location-rule' },
  };
  const scenario = input({
    fields: [],
    normative: [
      {
        ruleId: plug.attribution.ruleId, fieldId: plug.fieldId,
        applicability: plug.applicability, normalized: plug.normalized,
        when: { op: 'eq', path: 'product.category', value: 'refrigerator' },
      },
      {
        ruleId: hardwired.attribution.ruleId, fieldId: hardwired.fieldId,
        applicability: hardwired.applicability, normalized: hardwired.normalized,
        when: { op: 'eq', path: 'product.category', value: 'refrigerator' },
      },
    ],
    observations: [observation('environment.location', 'indoor')],
    configuration: { hingeSide: 'left' },
    claims: [plug, hardwired],
    includeDefaultEnvironmentClaim: false,
  });
  const result = evaluateFitV4Shadow(scenario);
  const check = result.checks.find((row) => row.fieldId === 'environment.location.prohibited');
  assert.equal(check.status, 'PASS');
  assert.deepEqual(check.required.value.value, ['outdoor']);
  assert.equal(result.conflicts.some((row) => row.fieldId === 'environment.location.prohibited'), false);
});

test('audit rejects an outcome that contradicts its checks and unresolved evidence', () => {
  const result = evaluateFitV4Shadow(input({
    fields: [['envelope.closed.width', 600]],
    observations: [observation('cavity.width', 590)],
  }));
  const tampered = structuredClone(result);
  tampered.installationOutcome = {
    status: 'VERIFIED_FIT', reasonCode: 'ALL_APPLICABLE_HARD_CONDITIONS_PROVEN',
    checkIds: tampered.checks.map((row) => row.id), gapCount: 0,
  };
  const audit = auditFitV4ShadowResult(tampered);
  assert.equal(audit.passed, false);
  assert.ok(audit.violations.some((row) => row.code === 'OUTCOME_EVIDENCE_CONTRADICTION'));
});
