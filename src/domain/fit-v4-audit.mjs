import { validateFitV4RunManifest } from './fit-v4-run-manifest.mjs';
import { selectFitV4SyntheticScenario } from './fit-v4-scenario-binding.mjs';

const HASH = /^[a-f0-9]{64}$/;
const RESULT_KEYS = [
  'schemaVersion', 'runId', 'versions', 'scenarioBinding', 'hashes', 'identity',
  'installationOutcome', 'deliveryOutcome', 'acceptedRules', 'checks', 'gaps',
  'conflicts', 'advisories',
];

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function violation(code, detail) {
  return freezeDeep({ code, detail });
}

function forbiddenPublicationPath(value, path = '$') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const current = `${path}.${key}`;
    if (/publication[_-]?eligibility/i.test(key)) return current;
    const nested = forbiddenPublicationPath(child, current);
    if (nested) return nested;
  }
  return null;
}

function outcomeContradictsEvidence(result, scope) {
  const outcome = scope === 'installation' ? result.installationOutcome : result.deliveryOutcome;
  if (!outcome || outcome.status === 'NOT_EVALUATED') return false;
  const checks = (result.checks ?? []).filter((row) => row.scope === scope);
  const gaps = (result.gaps ?? []).filter((row) => row.scope === scope);
  const conflicts = (result.conflicts ?? []).filter((row) => row.scope === scope);
  const failures = checks.filter((row) => row.status === 'FAIL');
  const unknowns = checks.filter((row) => row.status === 'UNKNOWN');
  if (outcome.status === 'NO_FIT') return failures.length === 0;
  if (failures.length) return true;
  if (['VERIFIED_FIT', 'LIKELY_FIT_ESTIMATED'].includes(outcome.status)) {
    if (checks.length === 0 || unknowns.length || gaps.length || conflicts.length) return true;
    const estimated = checks.some((row) => row.evidenceClass === 'ESTIMATE_OR_COVERAGE');
    return outcome.status === 'VERIFIED_FIT' ? estimated : !estimated;
  }
  return false;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function auditFitV4ShadowResult(result, trusted = {}) {
  const violations = [];
  if (!result || typeof result !== 'object') {
    return freezeDeep({ schemaVersion: 2, passed: false, violations: [violation('INVALID_SHADOW_RESULT', 'result object required')] });
  }
  if (result.schemaVersion !== 2) violations.push(violation('INVALID_SHADOW_SCHEMA', String(result.schemaVersion)));
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([...RESULT_KEYS].sort())) {
    violations.push(violation('INVALID_SHADOW_RESULT_KEYS', 'result'));
  }
  if (JSON.stringify(Object.keys(result.versions ?? {}).sort()) !== JSON.stringify([
    'fieldMap', 'knowledgeSchema', 'policy', 'policySchema', 'resultSchema', 'siteSchema',
  ].sort())) {
    violations.push(violation('INVALID_SHADOW_RESULT_KEYS', 'versions'));
  }
  if (JSON.stringify(Object.keys(result.scenarioBinding ?? {}).sort()) !== JSON.stringify([
    'scenarioBindingKind', 'scenarioMemberId', 'scenarioMemberSha256',
    'scenarioSetId', 'scenarioSetSha256',
  ].sort()) || result.scenarioBinding?.scenarioBindingKind !== 'PERSISTED_SYNTHETIC') {
    violations.push(violation('INVALID_SHADOW_RESULT_KEYS', 'scenarioBinding'));
  }
  for (const key of ['product', 'receipts', 'policy']) {
    if (!HASH.test(result.hashes?.[key] ?? '')) violations.push(violation('INVALID_AUDIT_HASH', key));
  }
  if (Object.keys(result.hashes ?? {}).sort().join(',') !== 'policy,product,receipts') {
    violations.push(violation('INVALID_AUDIT_HASH_KEYS', 'hashes'));
  }
  try {
    const manifest = validateFitV4RunManifest(trusted.manifest);
    const selected = selectFitV4SyntheticScenario(
      manifest.scenarioSetManifest,
      manifest.selectedScenarioMemberId,
      trusted.siteOptions,
    );
    if (!same(result.scenarioBinding, selected.scenarioBinding)
      || !same(result.scenarioBinding, manifest.semantic.scenarioBinding)) {
      violations.push(violation('SCENARIO_BINDING_DRIFT', 'scenarioBinding'));
    }
  } catch {
    violations.push(violation('SCENARIO_BINDING_UNTRUSTED', 'scenarioBinding'));
  }
  const leaked = forbiddenPublicationPath(result);
  if (leaked) violations.push(violation('PUBLICATION_ELIGIBILITY_LEAK', leaked));

  const resolved = new Set([
    ...(result.checks ?? []).map((check) => check.ruleId ?? check.constraintId),
    ...(result.gaps ?? []).map((gap) => gap.ruleId ?? gap.constraintId),
    ...(result.conflicts ?? []).map((conflict) => conflict.ruleId ?? conflict.constraintId),
  ].filter(Boolean));
  for (const accepted of result.acceptedRules ?? []) {
    const id = accepted.ruleId ?? accepted.constraintId;
    if (!resolved.has(id)) violations.push(violation('ACCEPTED_RULE_UNEVALUATED', id));
  }
  for (const check of result.checks ?? []) {
    if (!check.relation || !check.status || !check.reasonCode || !check.comparisonProjection) {
      violations.push(violation('UNTYPED_CHECK', check.id ?? 'unknown'));
    }
    if (!Array.isArray(check.receiptRefs)) violations.push(violation('MISSING_RECEIPT_REFS', check.id ?? 'unknown'));
  }
  const duplicateChecks = (result.checks ?? []).map((check) => check.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of new Set(duplicateChecks)) violations.push(violation('DUPLICATE_CHECK_ID', id));
  for (const scope of ['installation', 'delivery']) {
    if (outcomeContradictsEvidence(result, scope)) {
      violations.push(violation('OUTCOME_EVIDENCE_CONTRADICTION', scope));
    }
  }

  return freezeDeep({
    schemaVersion: 2,
    passed: violations.length === 0,
    violations,
    summary: {
      acceptedRules: result.acceptedRules?.length ?? 0,
      checks: result.checks?.length ?? 0,
      gaps: result.gaps?.length ?? 0,
      conflicts: result.conflicts?.length ?? 0,
    },
  });
}
