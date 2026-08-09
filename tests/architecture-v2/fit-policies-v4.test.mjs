import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateFitRelationV4, FIT_RELATIONS_V4 } from '../../src/domain/fit-relation-v4.mjs';
import { FIT_V4_FIELD_MAP_VERSION, validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { SITE_PROFILE_V4_SUBJECTS } from '../../src/domain/site-profile-v4.mjs';
import {
  FIT_POLICY_PACKS_V4,
  FIT_POLICY_PACK_SCHEMA_VERSION,
  FIT_POLICY_PACK_VERSION,
  generateFitPolicyCoverageV4,
  selectFitPolicyPackV4,
  validateFitPolicyPackV4,
} from '../../src/domain/fit-policies-v4/index.mjs';

const FIELD_MAP_PATH = new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url);
const CATEGORIES = ['dishwasher', 'dryer', 'refrigerator', 'washing_machine'];
const DISPOSITIONS = new Set(['EVALUATED', 'ADVISORY', 'EXCLUDED']);
const QUANTIFIERS = new Set(['FIXED_SELECTED', 'INSTALLER_SELECTABLE', 'UNKNOWN_FIXED', 'PROHIBITED']);

const fieldMap = validateFitV4FieldMap(JSON.parse(await readFile(FIELD_MAP_PATH, 'utf8')));

function fieldRule(pack, fieldId) {
  return pack.rules.find((rule) => rule.fieldId === fieldId);
}

function coverageRows(pack, fieldId, predicate = () => true) {
  return pack.coverageManifest.cases.filter((row) => row.fieldId === fieldId && predicate(row));
}

function scalarOperand(type, comparison, available = false) {
  const identity = {
    unit: comparison.unit,
    coordinateSystem: comparison.coordinateSystem,
    datum: 'policy_projection',
    axis: comparison.axis,
    geometryId: comparison.geometryId,
  };
  if (type === 'closed_range') {
    return {
      kind: 'COVERAGE_INTERVAL', minimum: 1, maximum: 2,
      minimumEndpoint: 'closed', maximumEndpoint: 'closed', ...identity,
    };
  }
  return { kind: 'DETERMINISTIC', value: available ? 2 : 1, ...identity };
}

function categoricalOperand(type, comparison, relation, available = false) {
  let value = 'compatible';
  if (type === 'boolean') value = true;
  else if (type === 'connector') value = { type: 'threaded', size: 19 };
  else if (type === 'enum_set') value = relation === 'NOT_MEMBER_OF' && !available ? ['prohibited'] : ['compatible'];
  if (available && relation === 'NOT_MEMBER_OF') value = 'compatible';
  return {
    kind: 'DETERMINISTIC', valueType: type, value, unit: comparison.unit,
    coordinateSystem: comparison.coordinateSystem, datum: 'policy_projection',
    axis: comparison.axis, geometryId: comparison.geometryId,
  };
}

function geometryOperand(type, comparison, available = false) {
  const outer = available;
  const values = {
    box3: { min: outer ? [0, 0, 0] : [1, 1, 1], max: outer ? [10, 10, 10] : [2, 2, 2] },
    polygon2: outer ? [[0, 0], [10, 0], [10, 10], [0, 10]] : [[1, 1], [2, 1], [2, 2], [1, 2]],
    route3: [[1, 1, 1], [2, 2, 2]],
    sweep3: { path: [[1, 1, 1], [2, 2, 2]], envelope: { min: [1, 1, 1], max: [2, 2, 2] } },
  };
  return {
    kind: type, value: values[type], unit: comparison.unit,
    coordinateSystem: comparison.coordinateSystem, datum: 'policy_projection',
  };
}

function executableOperands(rule) {
  const categorical = new Set(['boolean', 'string', 'enum', 'enum_set', 'connector']);
  const geometry = new Set(['box3', 'polygon2', 'route3', 'sweep3']);
  const build = (type, available) => geometry.has(type)
    ? geometryOperand(type, rule.comparison, available)
    : categorical.has(type)
      ? categoricalOperand(type, rule.comparison, rule.relation, available)
      : scalarOperand(type, rule.comparison, available);
  return {
    relation: rule.relation,
    required: build(rule.comparison.requiredValueType, false),
    available: build(rule.comparison.availableValueType, true),
    ...(['MIN_REQUIRED', 'MAX_ALLOWED'].includes(rule.relation) ? { equality: 'closed' } : {}),
  };
}

test('four immutable versioned packs bind the corrected field map', () => {
  assert.equal(FIT_POLICY_PACK_SCHEMA_VERSION, 1);
  assert.equal(FIT_POLICY_PACK_VERSION, 'fit-v4-policy-pack-1.1.0');
  assert.deepEqual(Object.keys(FIT_POLICY_PACKS_V4).sort(), CATEGORIES);
  for (const category of CATEGORIES) {
    const pack = FIT_POLICY_PACKS_V4[category];
    assert.equal(pack.schemaVersion, FIT_POLICY_PACK_SCHEMA_VERSION);
    assert.equal(pack.packVersion, FIT_POLICY_PACK_VERSION);
    assert.equal(pack.fieldMapVersion, FIT_V4_FIELD_MAP_VERSION);
    assert.equal(pack.category, category);
    assert.ok(Object.isFrozen(pack));
    assert.deepEqual(validateFitPolicyPackV4(fieldMap, pack), pack);
  }
});

test('policy selection quarantines category identity and excludes tower combinations', () => {
  assert.equal(selectFitPolicyPackV4({ category: 'refrigerator', formFactor: 'upright' }).category, 'refrigerator');
  assert.equal(selectFitPolicyPackV4({ category: 'dishwasher', formFactor: 'drawer' }).category, 'dishwasher');
  assert.equal(selectFitPolicyPackV4({ category: 'washing_machine', formFactor: 'top_loader' }).category, 'washing_machine');
  assert.equal(selectFitPolicyPackV4({ category: 'dryer', formFactor: 'front_loader' }).category, 'dryer');
  assert.throws(() => selectFitPolicyPackV4({ category: 'dishwasher', formFactor: 'front_loader' }), /form factor.*dishwasher/i);
  assert.throws(() => selectFitPolicyPackV4({ category: 'refrigerator', formFactor: 'drawer' }), /form factor.*refrigerator/i);
  assert.throws(() => selectFitPolicyPackV4({ category: 'washtower_combo', formFactor: 'front_loader' }), /dedicated combination policy/i);
  assert.throws(() => selectFitPolicyPackV4({ category: 'dryer', formFactor: 'washtower_combo' }), /washtower_combo/i);
});

test('every rule declares executable relation, endpoints, composition, selectors, quantifier and coverage metadata', () => {
  const relations = new Set(FIT_RELATIONS_V4);
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      const field = fieldMap.fields.find((candidate) => candidate.id === rule.fieldId);
      assert.ok(field, rule.fieldId);
      assert.ok(field.applicability.categories.includes(pack.category), `${pack.category}:${rule.fieldId}`);
      assert.ok(relations.has(rule.relation), rule.id);
      assert.ok(field.permittedRelations.includes(rule.relation), rule.id);
      assert.deepEqual(rule.endpoints.required, { source: 'installation_knowledge_v4', fieldId: rule.fieldId });
      assert.ok(rule.endpoints.available.length > 0, rule.id);
      assert.ok(rule.endpoints.available.every((endpoint) => endpoint.contextPath && endpoint.source), rule.id);
      assert.ok(['SEPARATE', 'MAX', 'SUM'].includes(rule.composition.operator), rule.id);
      assert.deepEqual(rule.composition.fieldIds, [rule.fieldId]);
      assert.ok(QUANTIFIERS.has(rule.configurationQuantifier), rule.id);
      assert.ok(Array.isArray(rule.selectorDomains));
      assert.ok(rule.selectorBranches.length > 0, rule.id);
      assert.ok(rule.requiredFields.includes(rule.fieldId), rule.id);
      assert.equal(rule.coverage.category, pack.category);
      assert.equal(rule.coverage.relation, rule.relation);
      assert.deepEqual(rule.coverage.formFactors, pack.recognizedFormFactors);
      assert.deepEqual(rule.coverage.installationModes, pack.installationModes);
    }
  }
});

test('policies contain no synthetic requirement values or numeric defaults', () => {
  const forbiddenKeys = new Set(['default', 'defaultValue', 'requirementValue', 'minimum', 'maximum']);
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node)) {
          assert.equal(forbiddenKeys.has(key), false, `${rule.id} declares forbidden ${key}`);
          visit(value);
        }
      };
      visit(rule);
    }
  }
});

test('selector branches are generated as exhaustive disjoint truth tables', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      const expected = rule.selectorDomains.reduce((count, selector) => count * selector.values.length, 1);
      assert.equal(rule.selectorBranches.length, expected, rule.id);
      const signatures = rule.selectorBranches.map((branch) => JSON.stringify(branch.selectors));
      assert.equal(new Set(signatures).size, expected, rule.id);
      for (const selector of rule.selectorDomains) {
        assert.deepEqual(selector.values, fieldMap.selectorDomains[selector.name], `${rule.id}:${selector.name}`);
      }
    }
  }
});

test('coverage generation spans every form factor, installation mode, selector branch and relation without orphans', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    const generated = generateFitPolicyCoverageV4(fieldMap, pack);
    assert.deepEqual(generated, pack.coverageManifest);
    const expected = pack.rules.reduce(
      (count, rule) => count + (pack.recognizedFormFactors.length * pack.installationModes.length * rule.selectorBranches.length),
      0,
    );
    assert.equal(generated.cases.length, expected, pack.category);
    assert.equal(new Set(generated.cases.map((row) => row.id)).size, expected, pack.category);
    assert.ok(generated.cases.every((row) => DISPOSITIONS.has(row.disposition)), pack.category);
    for (const rule of pack.rules) {
      const rows = generated.cases.filter((row) => row.ruleId === rule.id);
      assert.ok(rows.length > 0, rule.id);
      assert.deepEqual([...new Set(rows.map((row) => row.relation))], [rule.relation]);
      assert.deepEqual([...new Set(rows.map((row) => row.selectorBranchId))].sort(), rule.selectorBranches.map((branch) => branch.id).sort());
    }
  }
});

test('validation rejects orphaned coverage, duplicate branches and endpoint drift', () => {
  const clone = (value) => structuredClone(value);

  const orphan = clone(FIT_POLICY_PACKS_V4.dishwasher);
  orphan.coverageManifest.cases.pop();
  assert.throws(() => validateFitPolicyPackV4(fieldMap, orphan), /orphan branch, relation or case/i);

  const duplicateBranch = clone(FIT_POLICY_PACKS_V4.dryer);
  duplicateBranch.rules[0].selectorBranches.push(clone(duplicateBranch.rules[0].selectorBranches[0]));
  assert.throws(() => validateFitPolicyPackV4(fieldMap, duplicateBranch), /selector branch coverage incomplete|overlap|gap/i);

  const endpointDrift = clone(FIT_POLICY_PACKS_V4.refrigerator);
  endpointDrift.rules[0].endpoints.available[0].contextPath = 'site.environment';
  assert.throws(() => validateFitPolicyPackV4(fieldMap, endpointDrift), /available endpoint invalid/i);
});

test('every category field has a complete local evaluated, advisory or excluded disposition', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    const expectedFields = fieldMap.fields
      .filter((field) => field.applicability.categories.includes(pack.category))
      .map((field) => field.id)
      .sort();
    assert.deepEqual(Object.keys(pack.fieldDispositions).sort(), expectedFields, pack.category);
    for (const [fieldId, summary] of Object.entries(pack.fieldDispositions)) {
      assert.deepEqual(summary, pack.coverageManifest.dispositions[fieldId]);
      assert.ok(summary.EVALUATED + summary.ADVISORY + summary.EXCLUDED > 0, fieldId);
    }
  }
});

test('refrigerator policy distinguishes proud, flush and unknown installation modes', () => {
  const pack = FIT_POLICY_PACKS_V4.refrigerator;
  const rear = fieldRule(pack, 'installation.clearance.rearMin');
  assert.ok(rear);
  for (const mode of ['proud', 'flush', 'unknown']) {
    assert.ok(pack.installationModes.includes(mode));
    assert.ok(coverageRows(pack, rear.fieldId, (row) => row.installationMode === mode && row.disposition === 'EVALUATED').length > 0, mode);
  }
});

test('integrated dishwasher panel and toe-kick branches use typed site component selections', () => {
  const pack = FIT_POLICY_PACKS_V4.dishwasher;
  for (const fieldId of ['dishwasher.panel.weightRange', 'dishwasher.panel.heightRange']) {
    const rule = fieldRule(pack, fieldId);
    assert.ok(rule, fieldId);
    assert.ok(rule.endpoints.available.some((endpoint) => endpoint.contextPath === 'site.componentSelections'));
    assert.ok(coverageRows(pack, fieldId, (row) => row.selectorValues.panelMode === 'integrated' && row.disposition === 'EVALUATED').length > 0);
    assert.ok(coverageRows(pack, fieldId, (row) => row.selectorValues.panelMode === 'none' && row.disposition === 'EXCLUDED').length > 0);
  }
  const toeKick = fieldRule(pack, 'dishwasher.toeKick.depthRange');
  assert.ok(toeKick.endpoints.available.some((endpoint) => endpoint.contextPath === 'site.operationZones'));
  assert.ok(coverageRows(pack, toeKick.fieldId, (row) => row.selectorValues.panelMode === 'integrated' && row.disposition === 'EVALUATED').length > 0);
  assert.ok(coverageRows(pack, toeKick.fieldId, (row) => row.selectorValues.panelMode === 'none' && row.disposition === 'EXCLUDED').length > 0);
});

test('washing-machine policy covers drain permitted-zone containment and exact stacked identity', () => {
  const pack = FIT_POLICY_PACKS_V4.washing_machine;
  const route = fieldRule(pack, 'drain.route.permittedZone');
  assert.equal(route.relation, 'REQUIRED_CONTAINS');
  assert.ok(route.endpoints.available.some((endpoint) => endpoint.contextPath === 'site.serviceRoutes' && endpoint.subject === 'service.drain.route'));
  for (const fieldId of ['stacking.kit.exactId', 'stacking.companion.exactModel']) {
    const rule = fieldRule(pack, fieldId);
    assert.equal(rule.relation, 'EXACT_MATCH');
    assert.ok(coverageRows(pack, fieldId, (row) => row.installationMode === 'stacked' && row.disposition === 'EVALUATED').length > 0);
    assert.ok(coverageRows(pack, fieldId, (row) => row.installationMode === 'freestanding' && row.disposition === 'EXCLUDED').length > 0);
  }
});

test('dryer policy branches technology, typed duct, condensate drain and exact stacking checks', () => {
  const pack = FIT_POLICY_PACKS_V4.dryer;
  assert.equal(fieldRule(pack, 'dryer.technology').relation, 'EXACT_MATCH');
  for (const fieldId of ['dryer.duct.diameter', 'dryer.duct.maximumLength', 'dryer.duct.maximumElbows', 'dryer.duct.terminationType']) {
    const rule = fieldRule(pack, fieldId);
    assert.ok(rule.endpoints.available.some((endpoint) => endpoint.contextPath === 'site.serviceSpecifications' && endpoint.subject.startsWith('service.dryer.duct.')));
    assert.ok(coverageRows(pack, fieldId, (row) => row.selectorValues.dryerTechnology === 'vented' && row.disposition === 'EVALUATED').length > 0);
    assert.ok(coverageRows(pack, fieldId, (row) => row.selectorValues.dryerTechnology === 'heat_pump' && row.disposition === 'EXCLUDED').length > 0);
  }
  assert.ok(coverageRows(pack, 'dryer.condensate.mode', (row) => row.selectorValues.dryerTechnology === 'heat_pump' && row.selectorValues.drainMode === 'fixed_drain' && row.disposition === 'EVALUATED').length > 0);
  assert.equal(fieldRule(pack, 'stacking.kit.exactId').relation, 'EXACT_MATCH');
});

test('route and door containment bind the corrected typed Site Profile subjects', () => {
  const refrigerator = FIT_POLICY_PACKS_V4.refrigerator;
  assert.ok(fieldRule(refrigerator, 'water.route.permittedZone').endpoints.available.some(
    (endpoint) => endpoint.subject === 'service.water.route',
  ));
  assert.ok(fieldRule(refrigerator, 'operation.door.sweep').endpoints.available.some(
    (endpoint) => endpoint.subject === 'operation.door.zone',
  ));
});

test('delivery checks are selected-only and each pack carries non-outcome advisories', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    assert.ok(pack.advisories.length > 0, pack.category);
    assert.ok(pack.advisories.every((advisory) => advisory.affectsOutcome === false));
    for (const rule of pack.rules.filter((candidate) => candidate.fitClass === 'hard_delivery')) {
      const selected = coverageRows(pack, rule.fieldId, (row) => row.selectorValues.deliverySelected === true);
      const unselected = coverageRows(pack, rule.fieldId, (row) => row.selectorValues.deliverySelected === false);
      assert.ok(selected.some((row) => row.disposition === 'EVALUATED'));
      assert.ok(unselected.length > 0);
      assert.ok(unselected.every((row) => row.disposition === 'EXCLUDED'));
    }
  }
});

test('every policy operand is typed and selector paths are not silently reused as values', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      assert.ok(rule.comparison && typeof rule.comparison.projection === 'string', `${rule.id}:comparison`);
      for (const endpoint of rule.endpoints.available) {
        assert.equal(typeof endpoint.valueType, 'string', `${rule.id}:${endpoint.contextPath}:valueType`);
        if (endpoint.source === 'site_profile_v4') {
          assert.equal(typeof endpoint.subject, 'string', `${rule.id}:${endpoint.contextPath}:subject`);
          assert.ok(endpoint.subject.length > 0, `${rule.id}:${endpoint.contextPath}:subject`);
          assert.ok(SITE_PROFILE_V4_SUBJECTS[endpoint.subject], `${rule.id}:${endpoint.subject}:contract`);
          assert.equal(endpoint.valueType, SITE_PROFILE_V4_SUBJECTS[endpoint.subject].valueType, rule.id);
          assert.equal(endpoint.unit, SITE_PROFILE_V4_SUBJECTS[endpoint.subject].unit, rule.id);
        } else {
          assert.equal(endpoint.source, 'selected_configuration', rule.id);
          assert.equal(typeof endpoint.configurationVariable, 'string', `${rule.id}:${endpoint.contextPath}:configurationVariable`);
          assert.equal(endpoint.contextPath, `configuration.${endpoint.configurationVariable}`, rule.id);
        }
      }
    }
  }
});

test('unknown selector branches use UNKNOWN_FIXED and arithmetic composition is never a singleton', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      for (const branch of rule.selectorBranches) {
        const hasUnknown = Object.values(branch.selectors).includes('unknown');
        if (hasUnknown) assert.equal(branch.configurationQuantifier, 'UNKNOWN_FIXED', `${rule.id}:${branch.id}`);
      }
      if (['MAX', 'SUM'].includes(rule.composition?.operator)) {
        assert.ok(rule.composition.fieldIds.length > 1, `${rule.id} has meaningless singleton arithmetic`);
      }
    }
  }
});

test('placement coherence prevents independent dimension and gap checks from creating false acceptance', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    assert.deepEqual(pack.placementConstraints.map((constraint) => constraint.id), [
      `${pack.category}.placement.width`,
      `${pack.category}.placement.height`,
      `${pack.category}.placement.depth`,
    ]);
    const width = pack.placementConstraints[0];
    assert.equal(width.composition.operator, 'SUM');
    assert.deepEqual(width.composition.terms, [
      { source: 'installation_knowledge_v4', fieldId: 'installation.clearance.leftMin' },
      { source: 'installation_knowledge_v4', fieldId: 'envelope.closed.width' },
      { source: 'installation_knowledge_v4', fieldId: 'installation.clearance.rightMin' },
    ]);
    assert.deepEqual(width.siteProofSubjects, [
      'cavity.width', 'placement.leftGap', 'placement.rightGap',
    ]);
    assert.equal(width.available.subject, 'cavity.width');
    assert.equal(width.missingOperandPolicy, 'BLOCK_VERIFICATION');
    assert.deepEqual(width.installationModes, pack.supportedInstallationModes);
    if (pack.supportedInstallationModes.includes('recessed')) {
      assert.ok(pack.placementConstraints[2].installationModes.includes('recessed'));
    }
  }
});

test('range direction and delivery operands match the physical question', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    const adjusted = fieldRule(pack, 'envelope.adjusted.heightRange');
    if (adjusted) assert.equal(adjusted.relation, 'WITHIN_RANGE', `${pack.category}:adjusted height`);

    for (const rule of pack.rules.filter((candidate) => candidate.fitClass === 'hard_delivery')) {
      assert.ok(rule.endpoints.available.every((endpoint) => endpoint.contextPath !== 'site.delivery.selected'), rule.id);
      assert.ok(rule.endpoints.available.every((endpoint) => endpoint.subject?.startsWith('delivery.path.')), rule.id);
    }
  }
});

test('every declared relation accepts its generated typed operands', () => {
  for (const pack of Object.values(FIT_POLICY_PACKS_V4)) {
    for (const rule of pack.rules) {
      assert.doesNotThrow(() => evaluateFitRelationV4(executableOperands(rule)), rule.id);
    }
  }
});
