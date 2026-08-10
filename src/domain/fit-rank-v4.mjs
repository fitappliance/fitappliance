import { createHash } from 'node:crypto';

import { auditFitV4ShadowResult } from './fit-v4-audit.mjs';
import { FIT_POLICY_PACKS_V4 } from './fit-policies-v4/index.mjs';
import { evaluateFitV4Shadow } from './fit-v4-shadow.mjs';

export const FIT_V4_RANK_SCHEMA_VERSION = 1;
export const FIT_V4_RANK_POLICY_VERSION = 'fit-v4-rank-policy-1.0.0';

const OUTCOME_BANDS = Object.freeze({
  NO_FIT: 0,
  INSUFFICIENT_DATA: 1,
  CONDITIONAL_FIT: 2,
  LIKELY_FIT_ESTIMATED: 3,
  VERIFIED_FIT: 4,
});
const EVIDENCE_BANDS = Object.freeze({
  INCOMPLETE: 0,
  ESTIMATE_OR_COVERAGE: 1,
  AUDITED_POLICY: 2,
  SOURCE_BOUND_EXACT_OR_NORMATIVE: 3,
});
const INSTALLATION_COMPLEXITY = Object.freeze({
  hard_placement: 0,
  hard_operation: 1,
  hard_environment: 1,
  hard_service: 2,
  hard_professional: 3,
});
const CRITICAL_FIT_CLASSES = Object.freeze([
  'hard_placement', 'hard_environment', 'hard_service', 'hard_professional',
]);
const HYPOTHESIS_WEIGHTS = Object.freeze({
  criticalReserve: 40,
  operationReserve: 25,
  inverseInstallationComplexity: 20,
  evidence: 15,
});
const FORBIDDEN_KEYS = new Set([
  'score', 'fitscore', 'fitscorenumeric', 'verified', 'verifiedfit', 'isverified',
]);
const HASH = /^[a-f0-9]{64}$/;

function stopSchema2Rank(result) {
  if (result?.schemaVersion === 2) {
    const error = new TypeError('RANK_SCHEMA_V2_REQUIRED');
    error.code = 'RANK_SCHEMA_V2_REQUIRED';
    throw error;
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((row, index) => canonical(row, `${label}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
  }
  throw new TypeError(`${label} is not canonical JSON`);
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} schema keys invalid`);
  }
}

function forbiddenLegacyKey(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_KEYS.has(normalized)) return key;
    const nested = forbiddenLegacyKey(child);
    if (nested) return nested;
  }
  return null;
}

function completedResult(result) {
  stopSchema2Rank(result);
  if (!result || typeof result !== 'object') throw new TypeError('completed V4 shadow result required');
  const legacyKey = forbiddenLegacyKey(result);
  if (legacyKey) throw new TypeError(`legacy or generic V4 rank input key prohibited: ${legacyKey}`);
  const audit = auditFitV4ShadowResult(result);
  if (!audit.passed) {
    throw new TypeError(`V4 shadow result audit failed: ${audit.violations.map((row) => row.code).join(',')}`);
  }
  if (!Object.hasOwn(OUTCOME_BANDS, result.installationOutcome?.status)) {
    throw new TypeError('completed V4 installation outcome required');
  }
  const pack = FIT_POLICY_PACKS_V4[result.identity?.category];
  if (!pack || pack.packVersion !== result.versions?.policy
    || result.hashes?.policy !== semanticHash(pack)) {
    throw new TypeError('V4 result category policy binding invalid');
  }
  for (const key of ['market', 'category', 'canonicalProductId', 'model']) {
    if (typeof result.identity?.[key] !== 'string' || !result.identity[key]) {
      throw new TypeError(`V4 result identity ${key} required`);
    }
  }
  return pack;
}

function outcomeChecks(result) {
  const ids = new Set(result.installationOutcome.checkIds ?? []);
  return (result.checks ?? []).filter((row) => row.scope === 'installation' && ids.has(row.id));
}

function normalizedReserve(check) {
  if (typeof check.margin !== 'number' || !Number.isFinite(check.margin)) return null;
  const required = check.required?.value;
  if (!required || required.kind !== 'DETERMINISTIC'
    || typeof required.value !== 'number' || !Number.isFinite(required.value) || required.value <= 0) return null;
  return check.margin / required.value;
}

function reserve(checks, fitClasses) {
  const applicable = checks.filter((row) => fitClasses.includes(row.fitClass));
  const normalized = applicable.map(normalizedReserve).filter((value) => value !== null);
  return {
    value: normalized.length ? Math.min(...normalized) : null,
    applicableCheckCount: applicable.length,
    normalizedCheckCount: normalized.length,
  };
}

function installationComplexity(checks, policy) {
  const applicable = checks.filter((row) => Object.hasOwn(policy.fitClassComplexity, row.fitClass));
  if (!applicable.length) return { value: null, applicableCheckCount: 0 };
  const average = applicable.reduce((sum, row) => sum + policy.fitClassComplexity[row.fitClass], 0) / applicable.length;
  return { value: 1 / (1 + average), applicableCheckCount: applicable.length };
}

function evidenceBand(result, checks) {
  const unresolved = (result.gaps ?? []).some((row) => row.scope === 'installation')
    || (result.conflicts ?? []).some((row) => row.scope === 'installation')
    || checks.some((row) => row.status === 'UNKNOWN');
  if (unresolved) return 'INCOMPLETE';
  if (checks.some((row) => row.evidenceClass === 'ESTIMATE_OR_COVERAGE')) return 'ESTIMATE_OR_COVERAGE';
  const sourceBound = checks.length > 0 && checks.every((row) => (
    (row.receiptRefs?.length ?? 0) > 0 || row.evidenceClass === 'NORMATIVE_CONFIRMATION'
  ));
  return sourceBound ? 'SOURCE_BOUND_EXACT_OR_NORMATIVE' : 'AUDITED_POLICY';
}

function categoryPolicy(category) {
  return FIT_RANK_POLICY_V4.categories[category];
}

function rankCore(result, pack) {
  const policy = categoryPolicy(pack.category);
  const checks = outcomeChecks(result);
  const evidence = evidenceBand(result, checks);
  const criticalReserve = reserve(checks, policy.criticalFitClasses);
  const operationReserve = reserve(checks, ['hard_operation']);
  const complexity = installationComplexity(checks, policy);
  if (evidence === 'INCOMPLETE') {
    criticalReserve.value = null;
    operationReserve.value = null;
    complexity.value = null;
  }
  const identityTieBreaker = JSON.stringify([
    result.identity.market,
    result.identity.category,
    result.identity.canonicalProductId,
    result.identity.model,
  ]);
  return canonical({
    schemaVersion: FIT_V4_RANK_SCHEMA_VERSION,
    rankPolicyVersion: FIT_V4_RANK_POLICY_VERSION,
    categoryPolicyVersion: policy.version,
    sourceVersions: {
      resultSchema: result.versions.resultSchema,
      policy: result.versions.policy,
      policySchema: result.versions.policySchema,
      fieldMap: result.versions.fieldMap,
    },
    hashes: {
      sourceResult: semanticHash(result),
      product: result.hashes.product,
      receipts: result.hashes.receipts,
      siteScenario: result.hashes.siteScenario,
      policy: result.hashes.policy,
    },
    identity: canonical(result.identity),
    identityTieBreaker,
    outcomeBand: { name: result.installationOutcome.status, ordinal: OUTCOME_BANDS[result.installationOutcome.status] },
    evidenceBand: { name: evidence, ordinal: EVIDENCE_BANDS[evidence] },
    vector: {
      criticalReserve,
      operationReserve,
      inverseInstallationComplexity: complexity,
    },
    hypothesisWeights: HYPOTHESIS_WEIGHTS,
    calibrationStatus: 'TOTAL_DISABLED_INSUFFICIENT_SOURCE_BACKED_LABELS',
    totalEnabled: false,
    total: null,
  });
}

export const FIT_RANK_POLICY_V4 = freezeDeep({
  schemaVersion: 1,
  version: FIT_V4_RANK_POLICY_VERSION,
  outcomeBands: OUTCOME_BANDS,
  evidenceBands: EVIDENCE_BANDS,
  hypothesisWeights: HYPOTHESIS_WEIGHTS,
  categories: Object.fromEntries(Object.keys(FIT_POLICY_PACKS_V4).sort().map((category) => [category, {
    version: `${FIT_V4_RANK_POLICY_VERSION}:${category}`,
    normalization: 'SCALAR_MARGIN_DIVIDED_BY_POSITIVE_REQUIRED_MAGNITUDE',
    reserveAggregation: 'MINIMUM_APPLICABLE_NORMALIZED_RESERVE',
    criticalFitClasses: CRITICAL_FIT_CLASSES,
    fitClassComplexity: INSTALLATION_COMPLEXITY,
  }])),
});

function rankFromReplayInput(replayInput) {
  if (!replayInput || typeof replayInput !== 'object') throw new TypeError('trusted V4 shadow replay input required');
  const result = evaluateFitV4Shadow(replayInput);
  const pack = completedResult(result);
  const core = rankCore(result, pack);
  return freezeDeep({ fitV4Rank: { ...core, semanticSha256: semanticHash(core) } });
}

export function deriveFitV4Rank(result, replayInput) {
  stopSchema2Rank(result);
  const replayed = evaluateFitV4Shadow(replayInput);
  if (semanticHash(result) !== semanticHash(replayed)) {
    throw new TypeError('V4 rank source result does not match independently replayed evaluation');
  }
  const pack = completedResult(replayed);
  const core = rankCore(replayed, pack);
  return freezeDeep({ fitV4Rank: { ...core, semanticSha256: semanticHash(core) } });
}

function validatedRank(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !value.fitV4Rank) {
    throw new TypeError('exact fitV4Rank namespace required');
  }
  const { semanticSha256, ...core } = value.fitV4Rank;
  if (semanticSha256 !== semanticHash(core)) throw new TypeError('fitV4Rank semantic hash drift');
  exactKeys(core, [
    'schemaVersion', 'rankPolicyVersion', 'categoryPolicyVersion', 'sourceVersions', 'hashes',
    'identity', 'identityTieBreaker', 'outcomeBand', 'evidenceBand', 'vector',
    'hypothesisWeights', 'calibrationStatus', 'totalEnabled', 'total',
  ], 'fitV4Rank');
  if (core.schemaVersion !== FIT_V4_RANK_SCHEMA_VERSION || core.rankPolicyVersion !== FIT_V4_RANK_POLICY_VERSION) {
    throw new TypeError('fitV4Rank schema or policy version invalid');
  }
  const policy = categoryPolicy(core.identity?.category);
  if (!policy || core.categoryPolicyVersion !== policy.version) throw new TypeError('fitV4Rank category policy invalid');
  if (OUTCOME_BANDS[core.outcomeBand?.name] !== core.outcomeBand?.ordinal) {
    throw new TypeError('fitV4Rank outcome band ordinal invalid');
  }
  if (EVIDENCE_BANDS[core.evidenceBand?.name] !== core.evidenceBand?.ordinal) {
    throw new TypeError('fitV4Rank evidence band ordinal invalid');
  }
  exactKeys(core.hashes, ['sourceResult', 'product', 'receipts', 'siteScenario', 'policy'], 'fitV4Rank hashes');
  if (Object.values(core.hashes).some((hash) => !HASH.test(hash))) throw new TypeError('fitV4Rank SHA-256 binding invalid');
  exactKeys(core.vector, ['criticalReserve', 'operationReserve', 'inverseInstallationComplexity'], 'fitV4Rank vector');
  for (const name of ['criticalReserve', 'operationReserve']) {
    const component = core.vector[name];
    exactKeys(component, ['value', 'applicableCheckCount', 'normalizedCheckCount'], `fitV4Rank ${name}`);
    if ((component.value !== null && !Number.isFinite(component.value))
      || !Number.isInteger(component.applicableCheckCount) || component.applicableCheckCount < 0
      || !Number.isInteger(component.normalizedCheckCount) || component.normalizedCheckCount < 0
      || component.normalizedCheckCount > component.applicableCheckCount) {
      throw new TypeError(`fitV4Rank ${name} invalid`);
    }
  }
  const complexity = core.vector.inverseInstallationComplexity;
  exactKeys(complexity, ['value', 'applicableCheckCount'], 'fitV4Rank inverse installation complexity');
  if ((complexity.value !== null && (!Number.isFinite(complexity.value) || complexity.value < 0 || complexity.value > 1))
    || !Number.isInteger(complexity.applicableCheckCount) || complexity.applicableCheckCount < 0) {
    throw new TypeError('fitV4Rank inverse installation complexity invalid');
  }
  if (semanticHash(core.hypothesisWeights) !== semanticHash(HYPOTHESIS_WEIGHTS)
    || core.calibrationStatus !== 'TOTAL_DISABLED_INSUFFICIENT_SOURCE_BACKED_LABELS') {
    throw new TypeError('fitV4Rank uncalibrated metadata drift');
  }
  const expectedTieBreaker = JSON.stringify([
    core.identity.market, core.identity.category, core.identity.canonicalProductId, core.identity.model,
  ]);
  if (core.identityTieBreaker !== expectedTieBreaker) throw new TypeError('fitV4Rank identity tie-breaker drift');
  if (core.totalEnabled !== false || core.total !== null) throw new TypeError('Fit V4 total must remain disabled');
  return core;
}

function descendingNullable(left, right) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

export function compareFitV4Ranks(leftInput, rightInput, sources) {
  const left = validatedRank(leftInput);
  const right = validatedRank(rightInput);
  exactKeys(sources, ['leftReplayInput', 'rightReplayInput'], 'fitV4Rank replay inputs');
  if (semanticHash(rankFromReplayInput(sources.leftReplayInput)) !== semanticHash(leftInput)
    || semanticHash(rankFromReplayInput(sources.rightReplayInput)) !== semanticHash(rightInput)) {
    throw new TypeError('fitV4Rank does not match its independently replayed source result');
  }
  const outcome = right.outcomeBand.ordinal - left.outcomeBand.ordinal;
  if (outcome) return outcome;
  const evidence = right.evidenceBand.ordinal - left.evidenceBand.ordinal;
  if (evidence) return evidence;
  for (const value of [
    ['criticalReserve', 'value'],
    ['operationReserve', 'value'],
    ['inverseInstallationComplexity', 'value'],
  ]) {
    const compared = descendingNullable(left.vector[value[0]][value[1]], right.vector[value[0]][value[1]]);
    if (compared) return compared;
  }
  return left.identityTieBreaker.localeCompare(right.identityTieBreaker);
}
