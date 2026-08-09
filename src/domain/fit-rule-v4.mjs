import {
  assertFitV4ContextPath,
  validateFitV4FieldMap,
} from './fit-v4-contract.mjs';

export const RULE_LIMITS_V4 = Object.freeze({
  maxDepth: 8,
  maxNodes: 128,
  maxGroupNodes: 512,
  maxListSize: 32,
  maxSelectors: 4,
  maxSelectorDomainSize: 16,
  maxBranches: 64,
  maxTruthTableRows: 4096,
});

const DATA_OPERATORS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in']);
const LOGICAL_OPERATORS = new Set(['all', 'any', 'not']);
const OUTCOMES = new Set(['PASS', 'FAIL', 'UNKNOWN']);
const QUANTIFIERS = new Set(['FIXED_SELECTED', 'INSTALLER_SELECTABLE', 'UNKNOWN_FIXED', 'PROHIBITED']);
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} object required`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} schema must contain exactly: ${expected.join(', ')}`);
  }
}

function requiredIdentifier(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} required`);
  if (value !== value.toLowerCase()) throw new TypeError(`${label} must be lowercase`);
  for (const character of value) {
    const code = character.charCodeAt(0);
    const valid = (code >= 97 && code <= 122) || (code >= 48 && code <= 57)
      || character === '_' || character === '-' || character === '.';
    if (!valid) throw new TypeError(`${label} contains an invalid character`);
  }
  if (value.split('.').some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    throw new TypeError(`${label} contains an unsafe prototype or constructor segment`);
  }
  return value;
}

function requiredStoredName(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} required`);
  if (value.split('.').some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    throw new TypeError(`${label} contains an unsafe prototype or constructor segment`);
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    const valid = (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
      || (code >= 48 && code <= 57) || character === '_';
    if (!valid) throw new TypeError(`${label} contains an invalid character`);
  }
  return value;
}

function scalarType(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
    return 'number';
  }
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  throw new TypeError(`${label} must be a scalar enum, boolean or finite number`);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]));
  return value;
}

function validateScalarList(values, label, maximum) {
  if (!Array.isArray(values) || values.length === 0 || values.length > maximum) {
    throw new TypeError(`${label} list size must be between 1 and ${maximum}`);
  }
  const types = values.map((value, index) => scalarType(value, `${label}[${index}]`));
  if (new Set(types).size !== 1) throw new TypeError(`${label} values must have the same type`);
  const signatures = values.map((value) => `${typeof value}:${String(value)}`);
  if (new Set(signatures).size !== signatures.length) throw new TypeError(`${label} contains duplicate values`);
  return values.map(clonePlain);
}

function validateRuleNode(fieldMap, rule, state, depth) {
  if (depth > RULE_LIMITS_V4.maxDepth) throw new TypeError('Fit V4 rule exceeds maximum depth complexity');
  state.nodes += 1;
  if (state.nodes > RULE_LIMITS_V4.maxNodes) throw new TypeError('Fit V4 rule exceeds maximum node complexity');
  if (!isPlainObject(rule) || typeof rule.op !== 'string') throw new TypeError('Fit V4 rule operator required');
  const { op } = rule;
  if (!DATA_OPERATORS.has(op) && !LOGICAL_OPERATORS.has(op)) {
    throw new TypeError(`unsupported Fit V4 rule operator: ${String(op)}`);
  }

  if (op === 'eq' || op === 'neq' || ['lt', 'lte', 'gt', 'gte'].includes(op)) {
    exactKeys(rule, ['op', 'path', 'value'], `${op} rule`);
    const path = assertFitV4ContextPath(fieldMap, rule.path);
    if (['lt', 'lte', 'gt', 'gte'].includes(op)) {
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) {
        throw new TypeError(`${op} rule operand must be a finite number`);
      }
    } else {
      scalarType(rule.value, `${op} rule operand`);
    }
    return { op, path, value: rule.value };
  }

  if (op === 'in') {
    exactKeys(rule, ['op', 'path', 'values'], 'in rule');
    const path = assertFitV4ContextPath(fieldMap, rule.path);
    const values = validateScalarList(rule.values, 'in rule values', RULE_LIMITS_V4.maxListSize);
    return { op, path, values };
  }

  if (op === 'not') {
    exactKeys(rule, ['op', 'rule'], 'not rule');
    return { op, rule: validateRuleNode(fieldMap, rule.rule, state, depth + 1) };
  }

  exactKeys(rule, ['op', 'rules'], `${op} rule`);
  if (!Array.isArray(rule.rules) || rule.rules.length === 0 || rule.rules.length > RULE_LIMITS_V4.maxListSize) {
    throw new TypeError(`${op} rule list size must be between 1 and ${RULE_LIMITS_V4.maxListSize}`);
  }
  return { op, rules: rule.rules.map((child) => validateRuleNode(fieldMap, child, state, depth + 1)) };
}

function validateRuleWithCount(fieldMap, rule) {
  validateFitV4FieldMap(fieldMap);
  const state = { nodes: 0 };
  const accepted = validateRuleNode(fieldMap, rule, state, 0);
  return { rule: freezeDeep(accepted), nodes: state.nodes };
}

export function validateFitRuleV4(fieldMap, rule) {
  return validateRuleWithCount(fieldMap, rule).rule;
}

function readContextPath(context, path) {
  let current = context;
  for (const segment of path.split('.')) {
    if (UNSAFE_SEGMENTS.has(segment) || !isPlainObject(current) || !Object.hasOwn(current, segment)) {
      throw new TypeError(`missing context value for allowlisted path: ${path}`);
    }
    current = current[segment];
  }
  return current;
}

function evaluateRuleNode(rule, context, prefix, trace) {
  const label = prefix ? `${prefix}.` : '';
  if (DATA_OPERATORS.has(rule.op)) {
    const actual = readContextPath(context, rule.path);
    let matched;
    if (rule.op === 'lt' || rule.op === 'lte' || rule.op === 'gt' || rule.op === 'gte') {
      if (typeof actual !== 'number' || !Number.isFinite(actual)) {
        throw new TypeError(`context value for ${rule.path} must be a finite number without type coercion`);
      }
      if (rule.op === 'lt') matched = actual < rule.value;
      if (rule.op === 'lte') matched = actual <= rule.value;
      if (rule.op === 'gt') matched = actual > rule.value;
      if (rule.op === 'gte') matched = actual >= rule.value;
    } else if (rule.op === 'in') {
      const actualType = scalarType(actual, `context value for ${rule.path}`);
      if (actualType !== typeof rule.values[0]) {
        throw new TypeError(`context and rule values for ${rule.path} must have the same scalar type without type coercion`);
      }
      matched = rule.values.some((value) => actual === value);
    } else {
      const actualType = scalarType(actual, `context value for ${rule.path}`);
      if (actualType !== typeof rule.value) {
        throw new TypeError(`context and rule values for ${rule.path} must have the same scalar type without type coercion`);
      }
      matched = actual === rule.value;
      if (rule.op === 'neq') matched = !matched;
    }
    trace.push(`${label}${rule.op}:${rule.path}=${matched}`);
    return matched;
  }

  if (rule.op === 'not') {
    const matched = !evaluateRuleNode(rule.rule, context, `${prefix ? `${prefix}.` : ''}not`, trace);
    trace.push(`${label}not=${matched}`);
    return matched;
  }

  const results = rule.rules.map((child, index) => evaluateRuleNode(
    child,
    context,
    `${prefix ? `${prefix}.` : ''}${rule.op}[${index}]`,
    trace,
  ));
  const matched = rule.op === 'all' ? results.every(Boolean) : results.some(Boolean);
  trace.push(`${label}${rule.op}=${matched}`);
  return matched;
}

function evaluateAcceptedRule(rule, context) {
  const trace = [];
  const matched = evaluateRuleNode(rule, context, '', trace);
  return freezeDeep({ matched, trace });
}

export function evaluateFitRuleV4(fieldMap, rule, context) {
  const accepted = validateFitRuleV4(fieldMap, rule);
  if (!isPlainObject(context)) throw new TypeError('Fit V4 rule context object required');
  return evaluateAcceptedRule(accepted, context);
}

function rulePaths(rule, paths = new Set()) {
  if (DATA_OPERATORS.has(rule.op)) paths.add(rule.path);
  else if (rule.op === 'not') rulePaths(rule.rule, paths);
  else for (const child of rule.rules) rulePaths(child, paths);
  return paths;
}

function setContextPath(context, path, value) {
  const segments = path.split('.');
  let current = context;
  for (const segment of segments.slice(0, -1)) {
    if (!Object.hasOwn(current, segment)) current[segment] = {};
    current = current[segment];
  }
  current[segments.at(-1)] = value;
}

function selectorRows(selectors) {
  let rows = [{}];
  for (const selector of selectors) {
    const next = [];
    for (const row of rows) {
      for (const value of selector.values) next.push({ ...row, [selector.path]: value });
    }
    rows = next;
  }
  return rows;
}

function assignmentSignature(assignment) {
  return JSON.stringify(Object.fromEntries(Object.keys(assignment).sort().map((key) => [key, assignment[key]])));
}

function validateGroupShape(fieldMap, input) {
  const map = validateFitV4FieldMap(fieldMap);
  exactKeys(input, ['schemaVersion', 'id', 'quantifier', 'selectors', 'configurationVariables', 'branches'], 'conditional group');
  if (input.schemaVersion !== 1) throw new TypeError('conditional group schemaVersion 1 required');
  const id = requiredIdentifier(input.id, 'conditional group ID');
  if (!QUANTIFIERS.has(input.quantifier)) throw new TypeError('conditional group quantifier invalid');
  if (!Array.isArray(input.selectors) || input.selectors.length === 0 || input.selectors.length > RULE_LIMITS_V4.maxSelectors) {
    throw new TypeError(`conditional group selectors size must be between 1 and ${RULE_LIMITS_V4.maxSelectors}`);
  }
  const selectorPaths = new Set();
  const selectors = input.selectors.map((selector, index) => {
    exactKeys(selector, ['path', 'values'], `selector ${index}`);
    const path = assertFitV4ContextPath(map, selector.path);
    if (selectorPaths.has(path)) throw new TypeError(`duplicate selector domain path: ${path}`);
    selectorPaths.add(path);
    const values = validateScalarList(selector.values, `selector domain ${path}`, RULE_LIMITS_V4.maxSelectorDomainSize);
    for (const value of values) {
      if (typeof value === 'string' && value !== value.toLowerCase()) {
        throw new TypeError(`selector values must be lowercase: ${path}`);
      }
    }
    const variable = path.startsWith('configuration.') ? path.slice('configuration.'.length) : null;
    if (variable && Object.hasOwn(map.selectorDomains, variable)) {
      const canonicalDomain = map.selectorDomains[variable];
      const exactCanonicalDomain = values.length === canonicalDomain.length
        && values.every((value, valueIndex) => (
          typeof value === typeof canonicalDomain[valueIndex]
          && value === canonicalDomain[valueIndex]
        ));
      if (!exactCanonicalDomain) {
        throw new TypeError(`selector values must equal canonical Task 1 domain ${variable} in stored order`);
      }
    }
    return { path, values };
  });
  const rowCount = selectors.reduce((count, selector) => count * selector.values.length, 1);
  if (rowCount > RULE_LIMITS_V4.maxTruthTableRows) throw new TypeError('conditional selector domains exceed truth-table size');

  if (!Array.isArray(input.configurationVariables) || input.configurationVariables.length === 0) {
    throw new TypeError('conditional group configurationVariables array required');
  }
  const configurationVariables = input.configurationVariables.map((variable) => requiredStoredName(variable, 'configuration variable'));
  if (new Set(configurationVariables).size !== configurationVariables.length) {
    throw new TypeError('duplicate configuration variable assignment domain');
  }
  for (const variable of configurationVariables) {
    if (!map.configurationVariables.includes(variable)) throw new TypeError(`unknown Task 1 configuration variable: ${variable}`);
  }

  if (!Array.isArray(input.branches) || input.branches.length === 0 || input.branches.length > RULE_LIMITS_V4.maxBranches) {
    throw new TypeError(`conditional branches size must be between 1 and ${RULE_LIMITS_V4.maxBranches}`);
  }
  const branchIds = new Set();
  let groupNodes = 0;
  const branches = input.branches.map((branch, index) => {
    exactKeys(branch, ['id', 'when', 'outcome', 'assignments'], `conditional branch ${index}`);
    const branchId = requiredIdentifier(branch.id, 'conditional branch ID');
    if (branchIds.has(branchId)) throw new TypeError(`duplicate branch ID: ${branchId}`);
    branchIds.add(branchId);
    if (!OUTCOMES.has(branch.outcome)) throw new TypeError(`conditional branch outcome invalid: ${branchId}`);
    const acceptedRule = validateRuleWithCount(map, branch.when);
    groupNodes += acceptedRule.nodes;
    if (groupNodes > RULE_LIMITS_V4.maxGroupNodes) throw new TypeError('conditional group exceeds maximum node complexity');
    for (const path of rulePaths(acceptedRule.rule)) {
      if (!selectorPaths.has(path)) throw new TypeError(`branch path is not a declared finite selector: ${path}`);
    }
    exactKeys(branch.assignments, configurationVariables, `linked assignment for ${branchId}`);
    const assignments = {};
    for (const variable of configurationVariables) {
      scalarType(branch.assignments[variable], `linked assignment ${variable}`);
      if (Object.hasOwn(map.selectorDomains, variable)
        && !map.selectorDomains[variable].includes(branch.assignments[variable])) {
        throw new TypeError(`assignment is outside Task 1 domain ${variable}`);
      }
      assignments[variable] = branch.assignments[variable];
    }
    return { id: branchId, when: acceptedRule.rule, outcome: branch.outcome, assignments };
  });
  return { schemaVersion: 1, id, quantifier: input.quantifier, selectors, configurationVariables, branches };
}

function auditTruthTable(accepted) {
  const table = [];
  const selectedBranchIds = new Set();
  for (const selectors of selectorRows(accepted.selectors)) {
    const context = {};
    for (const [path, value] of Object.entries(selectors)) setContextPath(context, path, value);
    const matches = accepted.branches
      .map((branch) => ({ branch, evaluation: evaluateAcceptedRule(branch.when, context) }))
      .filter(({ evaluation }) => evaluation.matched);
    if (matches.length === 0) throw new TypeError(`conditional branch gap; group is not complete at ${assignmentSignature(selectors)}`);
    if (matches.length > 1) {
      throw new TypeError(`conditional branch overlap; branches are not mutually exclusive at ${assignmentSignature(selectors)}`);
    }
    const { branch, evaluation } = matches[0];
    selectedBranchIds.add(branch.id);
    for (const selector of accepted.selectors) {
      if (!selector.path.startsWith('configuration.')) continue;
      const variable = selector.path.slice('configuration.'.length);
      if (!accepted.configurationVariables.includes(variable)) continue;
      const selected = selectors[selector.path];
      const assigned = branch.assignments[variable];
      if (typeof selected !== typeof assigned || selected !== assigned) {
        throw new TypeError(`linked assignment for ${variable} must equal selector ${selector.path}`);
      }
    }
    table.push({
      selectors: clonePlain(selectors),
      branchId: branch.id,
      outcome: branch.outcome,
      assignment: clonePlain(branch.assignments),
      ruleTrace: [...evaluation.trace],
    });
  }
  const deadBranch = accepted.branches.find((branch) => !selectedBranchIds.has(branch.id));
  if (deadBranch) throw new TypeError(`dead branch is selected by zero rows: ${deadBranch.id}`);
  return freezeDeep(table);
}

export function validateConditionalGroupV4(fieldMap, input) {
  const accepted = validateGroupShape(fieldMap, input);
  const truthTable = auditTruthTable(accepted);
  return freezeDeep({ ...accepted, truthTable });
}

export function generateConditionalTruthTableV4(fieldMap, input) {
  return validateConditionalGroupV4(fieldMap, input).truthTable;
}

function suppliedSelectorValues(accepted, context) {
  const values = {};
  for (const selector of accepted.selectors) {
    try {
      const value = readContextPath(context, selector.path);
      if (!selector.values.some((candidate) => typeof candidate === typeof value && candidate === value)) {
        throw new TypeError(`unknown selector value for ${selector.path}: ${String(value)}`);
      }
      values[selector.path] = value;
    } catch (error) {
      if (!String(error.message).startsWith('missing context value')) throw error;
    }
  }
  return values;
}

function matchingRows(accepted, supplied) {
  return accepted.truthTable.filter((row) => Object.entries(supplied)
    .every(([path, value]) => typeof row.selectors[path] === typeof value && row.selectors[path] === value));
}

function concreteQuantifierRows(accepted, supplied) {
  const concreteConstraints = Object.fromEntries(
    Object.entries(supplied).filter(([, value]) => value !== 'unknown'),
  );
  return matchingRows(accepted, concreteConstraints)
    .filter((row) => !Object.values(row.selectors).includes('unknown'));
}

function assignmentTrace(assignment) {
  return Object.keys(assignment).sort().map((key) => `assignment:${key}=${String(assignment[key])}`);
}

function fixedResult(accepted, context, supplied) {
  for (const selector of accepted.selectors) {
    if (!Object.hasOwn(supplied, selector.path)) {
      return freezeDeep({
        status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
        trace: [`quantifier=${accepted.quantifier}`, `missing-selector:${selector.path}`],
      });
    }
    if (supplied[selector.path] === 'unknown') {
      return freezeDeep({
        status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
        trace: [`quantifier=${accepted.quantifier}`, `unknown-selector:${selector.path}`],
      });
    }
  }
  const [row] = matchingRows(accepted, supplied);
  const evaluation = evaluateAcceptedRule(
    accepted.branches.find((branch) => branch.id === row.branchId).when,
    context,
  );
  return freezeDeep({
    status: row.outcome,
    branchId: row.branchId,
    assignment: clonePlain(row.assignment),
    installationCondition: null,
    trace: [
      `quantifier=${accepted.quantifier}`,
      ...accepted.selectors.map((selector) => `selector:${selector.path}=${String(supplied[selector.path])}`),
      `branch:${row.branchId}`,
      ...evaluation.trace,
      `outcome=${row.outcome}`,
      ...assignmentTrace(row.assignment),
    ],
  });
}

function prohibitedResult(accepted, context, supplied) {
  for (const selector of accepted.selectors) {
    if (!Object.hasOwn(supplied, selector.path)) {
      return freezeDeep({
        status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
        trace: [`quantifier=${accepted.quantifier}`, `missing-selector:${selector.path}`],
      });
    }
    if (supplied[selector.path] === 'unknown') {
      return freezeDeep({
        status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
        trace: [`quantifier=${accepted.quantifier}`, `unknown-selector:${selector.path}`],
      });
    }
  }
  const [row] = matchingRows(accepted, supplied);
  const evaluation = evaluateAcceptedRule(
    accepted.branches.find((branch) => branch.id === row.branchId).when,
    context,
  );
  const prohibited = row.outcome === 'FAIL';
  return freezeDeep({
    status: row.outcome,
    branchId: row.branchId,
    assignment: clonePlain(row.assignment),
    installationCondition: prohibited ? { code: 'CONFIGURATION_PROHIBITED' } : null,
    trace: [
      `quantifier=${accepted.quantifier}`,
      ...accepted.selectors.map((selector) => `selector:${selector.path}=${String(supplied[selector.path])}`),
      `branch:${row.branchId}`,
      ...evaluation.trace,
      `outcome=${row.outcome}`,
      ...(prohibited ? ['condition=CONFIGURATION_PROHIBITED'] : []),
      ...assignmentTrace(row.assignment),
    ],
  });
}

function aggregateResult(accepted, rows) {
  const outcomes = rows.map((row) => row.outcome);
  if (rows.length === 0) {
    return freezeDeep({
      status: 'UNKNOWN', branchId: null, assignment: null, installationCondition: null,
      trace: [
        `quantifier=${accepted.quantifier}`,
        'candidate-branches=',
        'candidate-outcomes=',
        'outcome=UNKNOWN',
      ],
    });
  }
  let status;
  let selected = null;
  let installationCondition = null;
  if (accepted.quantifier === 'INSTALLER_SELECTABLE') {
    const feasible = rows.filter((row) => row.outcome === 'PASS');
    if (feasible.length > 0) {
      status = 'CONDITIONAL';
      selected = feasible[0];
      installationCondition = {
        code: 'INSTALLER_SETTING_REQUIRED',
        feasibleAssignments: feasible.map((row) => clonePlain(row.assignment)),
      };
    } else if (outcomes.every((outcome) => outcome === 'FAIL')) {
      status = 'FAIL';
    } else {
      status = 'UNKNOWN';
    }
  } else {
    if (outcomes.every((outcome) => outcome === 'PASS')) status = 'PASS';
    else if (outcomes.every((outcome) => outcome === 'FAIL')) status = 'FAIL';
    else status = 'UNKNOWN';
  }
  return freezeDeep({
    status,
    branchId: selected?.branchId ?? null,
    assignment: selected ? clonePlain(selected.assignment) : null,
    installationCondition,
    trace: [
      `quantifier=${accepted.quantifier}`,
      `candidate-branches=${rows.map((row) => row.branchId).join(',')}`,
      `candidate-outcomes=${outcomes.join(',')}`,
      `outcome=${status}`,
      ...(selected ? assignmentTrace(selected.assignment) : []),
    ],
  });
}

export function evaluateConditionalGroupV4(fieldMap, input, context) {
  const accepted = validateConditionalGroupV4(fieldMap, input);
  if (!isPlainObject(context)) throw new TypeError('conditional context object required');
  const supplied = suppliedSelectorValues(accepted, context);
  if (accepted.quantifier === 'FIXED_SELECTED') return fixedResult(accepted, context, supplied);
  if (accepted.quantifier === 'PROHIBITED') return prohibitedResult(accepted, context, supplied);
  return aggregateResult(accepted, concreteQuantifierRows(accepted, supplied));
}
