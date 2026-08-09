import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  RULE_LIMITS_V4,
  evaluateConditionalGroupV4,
  evaluateFitRuleV4,
  generateConditionalTruthTableV4,
  validateConditionalGroupV4,
  validateFitRuleV4,
} from '../../src/domain/fit-rule-v4.mjs';

const FIELD_MAP_PATH = new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url);
const INSTALLATION_MODES = [
  'freestanding', 'recessed', 'under_bench', 'integrated', 'flush', 'proud',
  'stacked', 'side_by_side', 'unknown',
];
const HINGE_SIDES = ['left', 'right', 'reversible_unselected', 'unknown'];

async function fieldMap() {
  return JSON.parse(await readFile(FIELD_MAP_PATH, 'utf8'));
}

function branch(id, when, outcome, assignments) {
  return { id, when, outcome, assignments };
}

function completeSelectorBranches({ path, variable, values, outcomes = {}, assignment }) {
  return values.map((value) => branch(
    value,
    { op: 'eq', path, value },
    outcomes[value] ?? (value === 'unknown' ? 'UNKNOWN' : 'PASS'),
    assignment ? assignment(value) : { [variable]: value },
  ));
}

function installationBranches(outcomes = {}, assignment) {
  return completeSelectorBranches({
    path: 'configuration.installationMode',
    variable: 'installationMode',
    values: INSTALLATION_MODES,
    outcomes,
    assignment,
  });
}

function group(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'refrigerator-installation-mode',
    quantifier: 'FIXED_SELECTED',
    selectors: [{
      path: 'configuration.installationMode',
      values: [...INSTALLATION_MODES],
    }],
    configurationVariables: ['installationMode'],
    branches: installationBranches(),
    ...overrides,
  };
}

test('data rules evaluate only the listed operators with strict scalar types', async () => {
  const map = await fieldMap();
  const rule = {
    op: 'all',
    rules: [
      { op: 'eq', path: 'configuration.installationMode', value: 'flush' },
      { op: 'neq', path: 'configuration.hingeSide', value: 'right' },
      { op: 'in', path: 'product.category', values: ['refrigerator', 'dishwasher'] },
      { op: 'not', rule: { op: 'lt', path: 'site.cavity', value: 600 } },
      { op: 'any', rules: [
        { op: 'gte', path: 'site.cavity', value: 600 },
        { op: 'gt', path: 'site.cavity', value: 900 },
      ] },
      { op: 'lte', path: 'site.cavity', value: 600 },
    ],
  };
  assert.deepEqual(evaluateFitRuleV4(map, rule, {
    product: { category: 'refrigerator' },
    configuration: { installationMode: 'flush', hingeSide: 'left' },
    site: { cavity: 600 },
  }), {
    matched: true,
    trace: [
      'all[0].eq:configuration.installationMode=true',
      'all[1].neq:configuration.hingeSide=true',
      'all[2].in:product.category=true',
      'all[3].not.lt:site.cavity=false',
      'all[3].not=true',
      'all[4].any[0].gte:site.cavity=true',
      'all[4].any[1].gt:site.cavity=false',
      'all[4].any=true',
      'all[5].lte:site.cavity=true',
      'all=true',
    ],
  });
  assert.equal(Object.isFrozen(validateFitRuleV4(map, rule)), true);
});

test('rules reject unknown, prototype and constructor paths through the Task 1 allowlist', async () => {
  const map = await fieldMap();
  for (const path of ['site.address', 'site.__proto__.polluted', 'site.constructor.value', 'site.prototype.value']) {
    assert.throws(
      () => validateFitRuleV4(map, { op: 'eq', path, value: 'x' }),
      /allowlist|context path|prototype|constructor/i,
    );
  }
});

test('missing context values fail closed rather than reading prototypes or coercing values', async () => {
  const map = await fieldMap();
  const eq = { op: 'eq', path: 'configuration.installationMode', value: 'flush' };
  assert.throws(() => evaluateFitRuleV4(map, eq, {}), /missing context/i);
  assert.equal(evaluateFitRuleV4(map, eq, { configuration: { installationMode: 'flush' } }).matched, true);
  assert.throws(
    () => evaluateFitRuleV4(map, eq, { configuration: { installationMode: new String('flush') } }),
    /scalar|type coercion/i,
  );
  assert.throws(
    () => evaluateFitRuleV4(map, { op: 'neq', path: 'site.cavity', value: 600 }, { site: { cavity: '600' } }),
    /same scalar type|type coercion/i,
  );
  assert.throws(
    () => evaluateFitRuleV4(map, { op: 'gte', path: 'site.cavity', value: 600 }, { site: { cavity: '600' } }),
    /finite number|type/i,
  );
});

test('rules have exact schemas and reject executable or non-finite operands', async () => {
  const map = await fieldMap();
  for (const rule of [
    { op: 'matches', path: 'product.category', value: '.*' },
    { op: 'eq', path: 'product.category', value: /refrigerator/ },
    { op: 'eq', path: 'product.category', value: () => true },
    { op: 'eq', path: 'product.category', value: 'refrigerator', expression: 'process.exit()' },
    { op: 'gt', path: 'site.cavity', value: Number.NaN },
    { op: 'lt', path: 'site.cavity', value: Number.POSITIVE_INFINITY },
    { op: 'in', path: 'product.category', values: ['refrigerator', 'refrigerator'] },
    { op: 'in', path: 'product.category', values: ['refrigerator', true] },
  ]) {
    assert.throws(() => validateFitRuleV4(map, rule), /operator|schema|scalar|finite|duplicate|same type/i);
  }
});

test('rule nesting, node count and list size are bounded', async () => {
  const map = await fieldMap();
  let deep = { op: 'eq', path: 'product.category', value: 'refrigerator' };
  for (let index = 0; index <= RULE_LIMITS_V4.maxDepth; index += 1) deep = { op: 'not', rule: deep };
  assert.throws(() => validateFitRuleV4(map, deep), /depth|complex/i);
  const leaf = { op: 'eq', path: 'product.category', value: 'refrigerator' };
  assert.throws(() => validateFitRuleV4(map, {
    op: 'all', rules: Array.from({ length: RULE_LIMITS_V4.maxListSize + 1 }, () => leaf),
  }), /list|size|complex/i);
  const wide = {
    op: 'all',
    rules: Array.from({ length: RULE_LIMITS_V4.maxListSize }, () => ({
      op: 'any', rules: Array.from({ length: RULE_LIMITS_V4.maxListSize }, () => leaf),
    })),
  };
  assert.throws(() => validateFitRuleV4(map, wide), /node|complex/i);
});

test('generated truth tables cover each canonical installation mode exactly once', async () => {
  const map = await fieldMap();
  const table = generateConditionalTruthTableV4(map, group());
  assert.deepEqual(table.map((row) => row.selectors['configuration.installationMode']), INSTALLATION_MODES);
  assert.deepEqual(table.map((row) => row.branchId), INSTALLATION_MODES);
  assert.deepEqual(table.map((row) => row.outcome), [
    'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'UNKNOWN',
  ]);
  assert.equal(new Set(table.map((row) => row.selectors['configuration.installationMode'])).size, 9);
  assert.equal(Object.isFrozen(table), true);
});

test('conditional groups reject gaps, overlaps and implicit defaults', async () => {
  const map = await fieldMap();
  const gap = group({ branches: group().branches.slice(0, 2) });
  assert.throws(() => validateConditionalGroupV4(map, gap), /gap|complete/i);
  const overlap = group({ branches: [
    ...group().branches,
    branch('not-proud', { op: 'neq', path: 'configuration.installationMode', value: 'proud' }, 'PASS', { installationMode: 'flush' }),
  ] });
  assert.throws(() => validateConditionalGroupV4(map, overlap), /overlap|exclusive/i);
  const fallback = group();
  fallback.branches[8] = { id: 'default', default: true, outcome: 'UNKNOWN', assignments: { installationMode: 'unknown' } };
  assert.throws(() => validateConditionalGroupV4(map, fallback), /schema|default|when/i);
});

test('conditional groups reject a declared branch selected by zero truth-table rows', async () => {
  const map = await fieldMap();
  const dead = branch(
    'impossible',
    { op: 'all', rules: [
      { op: 'eq', path: 'configuration.installationMode', value: 'flush' },
      { op: 'eq', path: 'configuration.installationMode', value: 'proud' },
    ] },
    'FAIL',
    { installationMode: 'flush' },
  );
  assert.throws(
    () => validateConditionalGroupV4(map, group({ branches: [...group().branches, dead] })),
    /dead branch|zero rows|never selected/i,
  );
});

test('distinct selector paths may share one explicit finite domain and repeated non-linked assignment', async () => {
  const map = await fieldMap();
  const values = ['a', 'b'];
  const branches = [];
  for (const kit of values) for (const companion of values) {
    branches.push(branch(
      `${kit}-${companion}`,
      { op: 'all', rules: [
        { op: 'eq', path: 'configuration.stackingKitId', value: kit },
        { op: 'eq', path: 'configuration.companionModel', value: companion },
      ] },
      'PASS',
      { adjustedHeightMm: 820 },
    ));
  }
  const input = group({
    id: 'identical-explicit-domains',
    selectors: [
      { path: 'configuration.stackingKitId', values },
      { path: 'configuration.companionModel', values },
    ],
    configurationVariables: ['adjustedHeightMm'],
    branches,
  });
  const table = generateConditionalTruthTableV4(map, input);
  assert.equal(table.length, 4);
  assert.deepEqual(table.map((row) => row.assignment), [
    { adjustedHeightMm: 820 },
    { adjustedHeightMm: 820 },
    { adjustedHeightMm: 820 },
    { adjustedHeightMm: 820 },
  ]);
});

test('conditional schemas reject duplicate selector paths and branch IDs', async () => {
  const map = await fieldMap();
  assert.throws(() => validateConditionalGroupV4(map, group({ selectors: [
    { path: 'configuration.installationMode', values: INSTALLATION_MODES },
    { path: 'configuration.installationMode', values: INSTALLATION_MODES },
  ] })), /duplicate selector|duplicate.*path/i);
  assert.throws(() => validateConditionalGroupV4(map, group({ branches: [
    ...group().branches,
    branch('flush', { op: 'eq', path: 'configuration.installationMode', value: 'flush' }, 'FAIL', { installationMode: 'proud' }),
  ] })), /duplicate branch/i);
});

test('canonical Task 1 selector domains reject omission, reordering and extra values', async () => {
  const map = await fieldMap();
  const omitted = group();
  omitted.selectors[0].values = INSTALLATION_MODES.slice(1);
  assert.throws(() => validateConditionalGroupV4(map, omitted), /canonical Task 1 domain|stored order/i);
  const reordered = group();
  reordered.selectors[0].values = [...INSTALLATION_MODES];
  [reordered.selectors[0].values[0], reordered.selectors[0].values[1]] = [
    reordered.selectors[0].values[1], reordered.selectors[0].values[0],
  ];
  assert.throws(() => validateConditionalGroupV4(map, reordered), /canonical Task 1 domain|stored order/i);
  const extra = group();
  extra.selectors[0].values = [...INSTALLATION_MODES, 'other'];
  assert.throws(() => validateConditionalGroupV4(map, extra), /canonical Task 1 domain|stored order/i);
});

test('selector domains and branch counts are bounded and selector values remain lowercase', async () => {
  const map = await fieldMap();
  assert.throws(() => validateConditionalGroupV4(map, group({ selectors: [{
    path: 'configuration.installationMode',
    values: Array.from({ length: RULE_LIMITS_V4.maxSelectorDomainSize + 1 }, (_, index) => `mode_${index}`),
  }] })), /selector domain|size/i);
  const uppercase = group();
  uppercase.selectors[0].values[0] = 'FLUSH';
  assert.throws(() => validateConditionalGroupV4(map, uppercase), /lowercase|selector/i);
  const missingUnknown = group();
  missingUnknown.selectors[0].values = INSTALLATION_MODES.slice(0, -1);
  missingUnknown.branches = missingUnknown.branches.slice(0, 2);
  assert.throws(() => validateConditionalGroupV4(map, missingUnknown), /canonical Task 1 domain|selector domain/i);
});

test('fixed selected evaluation returns one deterministic branch trace and linked assignment', async () => {
  const map = await fieldMap();
  const input = group();
  const context = { configuration: { installationMode: 'flush' } };
  const first = evaluateConditionalGroupV4(map, input, context);
  const second = evaluateConditionalGroupV4(map, structuredClone(input), structuredClone(context));
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: 'PASS',
    branchId: 'flush',
    assignment: { installationMode: 'flush' },
    installationCondition: null,
    trace: [
      'quantifier=FIXED_SELECTED',
      'selector:configuration.installationMode=flush',
      'branch:flush',
      'eq:configuration.installationMode=true',
      'outcome=PASS',
      'assignment:installationMode=flush',
    ],
  });
});

test('fixed selected unknown or missing selector remains unknown', async () => {
  const map = await fieldMap();
  assert.equal(evaluateConditionalGroupV4(map, group(), { configuration: { installationMode: 'unknown' } }).status, 'UNKNOWN');
  const unsafeUnknownPass = group({
    branches: installationBranches({ unknown: 'PASS' }),
  });
  assert.equal(
    evaluateConditionalGroupV4(map, unsafeUnknownPass, { configuration: { installationMode: 'unknown' } }).status,
    'UNKNOWN',
  );
  assert.deepEqual(evaluateConditionalGroupV4(map, group(), {}), {
    status: 'UNKNOWN', branchId: null, assignment: null,
    installationCondition: null,
    trace: ['quantifier=FIXED_SELECTED', 'missing-selector:configuration.installationMode'],
  });
});

test('installer selectable returns a feasible setting as an explicit condition, never an unconditional pass', async () => {
  const map = await fieldMap();
  const input = group({
    id: 'adjustable-height',
    quantifier: 'INSTALLER_SELECTABLE',
    configurationVariables: ['adjustedHeightMm'],
    branches: installationBranches(
      Object.fromEntries(INSTALLATION_MODES.map((mode) => [
        mode, mode === 'flush' ? 'PASS' : mode === 'unknown' ? 'UNKNOWN' : 'FAIL',
      ])),
      (mode) => ({ adjustedHeightMm: mode === 'flush' ? 820 : mode === 'unknown' ? 835 : 850 }),
    ),
  });
  const result = evaluateConditionalGroupV4(map, input, {});
  assert.equal(result.status, 'CONDITIONAL');
  assert.deepEqual(result.assignment, { adjustedHeightMm: 820 });
  assert.deepEqual(result.installationCondition, {
    code: 'INSTALLER_SETTING_REQUIRED',
    feasibleAssignments: [{ adjustedHeightMm: 820 }],
  });
});

test('unknown fixed passes only if every assignment passes and fails only if every assignment fails', async () => {
  const map = await fieldMap();
  const unknownFixed = (outcomes) => group({
    quantifier: 'UNKNOWN_FIXED',
    branches: installationBranches(outcomes),
  });
  const allFail = Object.fromEntries(INSTALLATION_MODES.map((mode) => [mode, mode === 'unknown' ? 'UNKNOWN' : 'FAIL']));
  const mixed = { ...allFail, freestanding: 'PASS' };
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed({}), {}).status, 'PASS');
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed(allFail), {}).status, 'FAIL');
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed(mixed), {}).status, 'UNKNOWN');
});

test('quantifiers exclude unknown sentinels and retain compatible known constraints', async () => {
  const map = await fieldMap();
  const unknownFixed = (outcomes) => group({
    quantifier: 'UNKNOWN_FIXED',
    branches: installationBranches(outcomes),
  });
  const installerSelectable = (outcomes) => group({
    quantifier: 'INSTALLER_SELECTABLE',
    branches: installationBranches(outcomes),
  });
  const allFail = Object.fromEntries(INSTALLATION_MODES.map((mode) => [mode, mode === 'unknown' ? 'UNKNOWN' : 'FAIL']));
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed({}), {}).status, 'PASS');
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed(allFail), {}).status, 'FAIL');
  assert.equal(evaluateConditionalGroupV4(map, installerSelectable(allFail), {}).status, 'FAIL');
  assert.equal(evaluateConditionalGroupV4(map, unknownFixed({}), {
    configuration: { installationMode: 'unknown' },
  }).status, 'PASS');

  const modes = INSTALLATION_MODES;
  const hinges = HINGE_SIDES;
  const branches = [];
  for (const mode of modes) for (const hinge of hinges) {
    const sentinel = mode === 'unknown' || hinge === 'unknown';
    branches.push(branch(
      `${mode}-${hinge}`,
      { op: 'all', rules: [
        { op: 'eq', path: 'configuration.installationMode', value: mode },
        { op: 'eq', path: 'configuration.hingeSide', value: hinge },
      ] },
      sentinel ? 'UNKNOWN' : hinge === 'left' ? 'PASS' : 'FAIL',
      { installationMode: mode, hingeSide: hinge },
    ));
  }
  const constrained = group({
    id: 'unknown-fixed-with-known-constraint',
    quantifier: 'UNKNOWN_FIXED',
    selectors: [
      { path: 'configuration.installationMode', values: modes },
      { path: 'configuration.hingeSide', values: hinges },
    ],
    configurationVariables: ['installationMode', 'hingeSide'],
    branches,
  });
  assert.equal(evaluateConditionalGroupV4(map, constrained, { configuration: {
    installationMode: 'unknown', hingeSide: 'left',
  } }).status, 'PASS');
  assert.equal(evaluateConditionalGroupV4(map, constrained, { configuration: {
    installationMode: 'unknown', hingeSide: 'right',
  } }).status, 'FAIL');
  assert.equal(evaluateConditionalGroupV4(map, constrained, { configuration: {
    installationMode: 'flush', hingeSide: 'unknown',
  } }).status, 'UNKNOWN');
  const selectableConstrained = { ...constrained, quantifier: 'INSTALLER_SELECTABLE' };
  assert.equal(evaluateConditionalGroupV4(map, selectableConstrained, { configuration: {
    installationMode: 'unknown', hingeSide: 'left',
  } }).status, 'CONDITIONAL');
  assert.equal(evaluateConditionalGroupV4(map, selectableConstrained, { configuration: {
    installationMode: 'unknown', hingeSide: 'right',
  } }).status, 'FAIL');
});

test('quantifiers return unknown when a declared domain has no concrete assignment', async () => {
  const map = await fieldMap();
  const sentinelOnly = (quantifier) => group({
    quantifier,
    selectors: [{ path: 'configuration.stackingKitId', values: ['unknown'] }],
    configurationVariables: ['stackingKitId'],
    branches: [branch(
      'unknown',
      { op: 'eq', path: 'configuration.stackingKitId', value: 'unknown' },
      'UNKNOWN',
      { stackingKitId: 'unknown' },
    )],
  });
  const fixed = evaluateConditionalGroupV4(map, sentinelOnly('UNKNOWN_FIXED'), {});
  const selectable = evaluateConditionalGroupV4(map, sentinelOnly('INSTALLER_SELECTABLE'), {});
  assert.equal(fixed.status, 'UNKNOWN');
  assert.equal(selectable.status, 'UNKNOWN');
  assert.ok(fixed.trace.includes('candidate-branches='));
  assert.ok(selectable.trace.includes('candidate-branches='));
});

test('prohibited quantifier fails only a known prohibited selection', async () => {
  const map = await fieldMap();
  const input = group({
    quantifier: 'PROHIBITED',
    branches: installationBranches({ proud: 'FAIL' }),
  });
  const prohibited = evaluateConditionalGroupV4(map, input, { configuration: { installationMode: 'proud' } });
  assert.deepEqual(prohibited, {
    status: 'FAIL',
    branchId: 'proud',
    assignment: { installationMode: 'proud' },
    installationCondition: { code: 'CONFIGURATION_PROHIBITED' },
    trace: [
      'quantifier=PROHIBITED',
      'selector:configuration.installationMode=proud',
      'branch:proud',
      'eq:configuration.installationMode=true',
      'outcome=FAIL',
      'condition=CONFIGURATION_PROHIBITED',
      'assignment:installationMode=proud',
    ],
  });
  const allowed = evaluateConditionalGroupV4(map, input, { configuration: { installationMode: 'flush' } });
  assert.equal(allowed.status, 'PASS');
  assert.equal(allowed.installationCondition, null);
  assert.deepEqual(allowed.assignment, { installationMode: 'flush' });
  assert.deepEqual(evaluateConditionalGroupV4(map, input, {}), {
    status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
    trace: ['quantifier=PROHIBITED', 'missing-selector:configuration.installationMode'],
  });
  assert.deepEqual(evaluateConditionalGroupV4(map, input, { configuration: { installationMode: 'unknown' } }), {
    status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
    trace: ['quantifier=PROHIBITED', 'unknown-selector:configuration.installationMode'],
  });
});

test('hinge rules preserve one consistent linked assignment', async () => {
  const map = await fieldMap();
  const input = group({
    id: 'hinge-side',
    selectors: [{ path: 'configuration.hingeSide', values: HINGE_SIDES }],
    configurationVariables: ['hingeSide'],
    branches: completeSelectorBranches({
      path: 'configuration.hingeSide',
      variable: 'hingeSide',
      values: HINGE_SIDES,
      outcomes: { right: 'FAIL', reversible_unselected: 'UNKNOWN' },
    }),
  });
  assert.deepEqual(
    generateConditionalTruthTableV4(map, input).map((row) => row.selectors['configuration.hingeSide']),
    HINGE_SIDES,
  );
  assert.deepEqual(evaluateConditionalGroupV4(map, input, { configuration: { hingeSide: 'left' } }).assignment, { hingeSide: 'left' });
});

test('truth-table audit rejects selector and linked-assignment disagreement', async () => {
  const map = await fieldMap();
  const direct = group({
    id: 'hinge-mismatch',
    selectors: [{ path: 'configuration.hingeSide', values: HINGE_SIDES }],
    configurationVariables: ['hingeSide'],
    branches: [
      branch('left', { op: 'eq', path: 'configuration.hingeSide', value: 'left' }, 'PASS', { hingeSide: 'right' }),
      branch('right', { op: 'eq', path: 'configuration.hingeSide', value: 'right' }, 'PASS', { hingeSide: 'left' }),
      branch('reversible', { op: 'eq', path: 'configuration.hingeSide', value: 'reversible_unselected' }, 'PASS', { hingeSide: 'reversible_unselected' }),
      branch('unknown', { op: 'eq', path: 'configuration.hingeSide', value: 'unknown' }, 'UNKNOWN', { hingeSide: 'unknown' }),
    ],
  });
  assert.throws(() => validateConditionalGroupV4(map, direct), /linked assignment.*selector|selector.*assignment/i);

  const compound = group({
    id: 'hinge-in-mismatch',
    selectors: [{ path: 'configuration.hingeSide', values: HINGE_SIDES }],
    configurationVariables: ['hingeSide'],
    branches: [
      branch('known', { op: 'in', path: 'configuration.hingeSide', values: ['left', 'right', 'reversible_unselected'] }, 'PASS', { hingeSide: 'left' }),
      branch('unknown', { op: 'eq', path: 'configuration.hingeSide', value: 'unknown' }, 'UNKNOWN', { hingeSide: 'unknown' }),
    ],
  });
  assert.throws(() => validateConditionalGroupV4(map, compound), /linked assignment.*selector|selector.*assignment/i);
});

test('exact stacked combinations fail every non-exact kit and companion assignment', async () => {
  const map = await fieldMap();
  const modes = INSTALLATION_MODES;
  const kits = ['kit_a', 'kit_other', 'unknown'];
  const companions = ['dryer_a', 'unknown'];
  const branches = [];
  for (const mode of modes) for (const kit of kits) for (const companion of companions) {
    const exact = mode === 'stacked' && kit === 'kit_a' && companion === 'dryer_a';
    const unknown = mode === 'unknown' || kit === 'unknown' || companion === 'unknown';
    branches.push(branch(
      `${mode}-${kit}-${companion}`,
      { op: 'all', rules: [
        { op: 'eq', path: 'configuration.installationMode', value: mode },
        { op: 'eq', path: 'configuration.stackingKitId', value: kit },
        { op: 'eq', path: 'configuration.companionModel', value: companion },
      ] },
      exact ? 'PASS' : unknown ? 'UNKNOWN' : 'FAIL',
      { installationMode: mode, stackingKitId: kit, companionModel: companion },
    ));
  }
  const input = group({
    id: 'exact-stack',
    selectors: [
      { path: 'configuration.installationMode', values: modes },
      { path: 'configuration.stackingKitId', values: kits },
      { path: 'configuration.companionModel', values: companions },
    ],
    configurationVariables: ['installationMode', 'stackingKitId', 'companionModel'],
    branches,
  });
  assert.equal(generateConditionalTruthTableV4(map, input).length, 54);
  assert.equal(evaluateConditionalGroupV4(map, input, { configuration: {
    installationMode: 'stacked', stackingKitId: 'kit_a', companionModel: 'dryer_a',
  } }).status, 'PASS');
  assert.equal(evaluateConditionalGroupV4(map, input, { configuration: {
    installationMode: 'stacked', stackingKitId: 'kit_other', companionModel: 'dryer_a',
  } }).status, 'FAIL');
});

test('linked branches must assign every declared variable exactly once with scalar finite values', async () => {
  const map = await fieldMap();
  const missing = group();
  missing.branches[0].assignments = {};
  assert.throws(() => validateConditionalGroupV4(map, missing), /assignment|linked/i);
  const extra = group();
  extra.branches[0].assignments = { installationMode: 'flush', hingeSide: 'left' };
  assert.throws(() => validateConditionalGroupV4(map, extra), /assignment|schema/i);
  const nonFinite = group({ configurationVariables: ['adjustedHeightMm'] });
  nonFinite.branches = nonFinite.branches.map((item) => ({ ...item, assignments: { adjustedHeightMm: Number.NaN } }));
  assert.throws(() => validateConditionalGroupV4(map, nonFinite), /finite|assignment/i);
});
