import { createHash } from 'node:crypto';

import { validateFitV4FieldMap } from './fit-v4-contract.mjs';
import { validateFitPolicyPackV4 } from './fit-policies-v4/index.mjs';
import { evaluateFitRelationV4 } from './fit-relation-v4.mjs';
import { evaluateFitRuleV4 } from './fit-rule-v4.mjs';
import { auditFitV4ShadowResult } from './fit-v4-audit.mjs';
import { validateFitV4RunManifest } from './fit-v4-run-manifest.mjs';
import { selectFitV4SyntheticScenario } from './fit-v4-scenario-binding.mjs';
import { replayFitV4Receipt } from './installation-evidence-receipt-v4.mjs';
import { validateInstallationKnowledgeV4 } from './installation-knowledge-v4.mjs';
import { validateSiteProfileV4 } from './site-profile-v4.mjs';

export const FIT_V4_SHADOW_SCHEMA_VERSION = 2;

const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^fit_v4_run_[a-f0-9]{24}$/;
const GEOMETRY_TYPES = new Set(['box3', 'polygon2', 'route3', 'sweep3']);
const CATEGORICAL_TYPES = new Set(['boolean', 'string', 'enum', 'enum_set', 'connector']);
const MAX_SITE_OBSERVATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MANIFEST_POLICY_KEYS = Object.freeze({
  dishwasher: 'dishwasher',
  dryer: 'dryer',
  refrigerator: 'refrigerator',
  washing_machine: 'washingMachine',
});
const LIVE_CAPABILITIES = new WeakMap();
const LIVE_RESULTS = new WeakMap();

function liveError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function opaqueLiveObject(properties = {}) {
  const value = {};
  for (const [key, descriptor] of Object.entries(properties)) {
    Object.defineProperty(value, key, { enumerable: false, configurable: false, ...descriptor });
  }
  Object.defineProperty(value, 'toJSON', {
    enumerable: false,
    configurable: false,
    value() { throw liveError('LIVE_EPHEMERAL_SERIALIZATION_PROHIBITED'); },
  });
  return Object.freeze(value);
}

export function createFitV4LiveScenarioCapability(profile, siteOptions = {}) {
  if (profile?.sourceKind === 'consented_offline') throw liveError('CONSENTED_OFFLINE_NOT_SUPPORTED');
  if (profile?.sourceKind !== 'real_site') throw liveError('LIVE_EPHEMERAL_PROFILE_REQUIRED');
  let accepted;
  try {
    accepted = validateSiteProfileV4(profile, siteOptions);
  } catch {
    throw liveError('LIVE_EPHEMERAL_PROFILE_INVALID');
  }
  const capability = opaqueLiveObject({
    scenarioBindingKind: { get() { return 'LIVE_EPHEMERAL'; } },
  });
  LIVE_CAPABILITIES.set(capability, accepted);
  return capability;
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
  if (Array.isArray(value)) return value.map((child, index) => canonical(child, `${label}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
  }
  throw new TypeError(`${label} is not canonical JSON`);
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function assertedHash(value, expected, label) {
  if (!HASH.test(expected ?? '')) throw new TypeError(`${label} SHA-256 required`);
  const actual = semanticHash(value);
  if (actual !== expected) throw new TypeError(`${label} hash drift`);
  return actual;
}

function assertSameSemantic(left, right, label) {
  if (semanticHash(left) !== semanticHash(right)) throw new TypeError(`${label} binding drift`);
}

function validateTrustEnvelope(input, fieldMap, pack) {
  if (['siteProfile', 'siteScenarioSha256', 'scenarioSetManifest', 'selectedScenarioMemberId']
    .some((key) => Object.hasOwn(input, key))) {
    throw new TypeError('raw or duplicate scenario authority is prohibited');
  }
  const manifest = validateFitV4RunManifest(input.runManifest);
  const expectedManifest = validateFitV4RunManifest(input.expectedManifest);
  assertSameSemantic(manifest, expectedManifest, 'expected run manifest');
  if (input.runId !== manifest.runId) throw new TypeError('Fit V4 run ID does not match run manifest');

  const semantic = manifest.semantic;
  if (semantic.fieldMapSha256 !== semanticHash(fieldMap)) throw new TypeError('field map manifest binding drift');
  if (semantic.receiptBundleSha256 !== input.receiptBundle?.bundleSha256) {
    throw new TypeError('receipt bundle manifest binding drift');
  }
  if (semantic.identityMapSha256 !== input.identityMapSha256) throw new TypeError('identity map manifest binding drift');
  const policyKey = MANIFEST_POLICY_KEYS[pack.category];
  if (!policyKey || semantic.policyHashes[policyKey] !== semanticHash(pack)
    || semantic.policyEpoch !== pack.packVersion) {
    throw new TypeError('category policy manifest binding drift');
  }
  if (semantic.trustedRegistryHashes.knowledgePolicyBundle !== input.trustedPolicyBundle?.bundleSha256) {
    throw new TypeError('trusted policy registry manifest binding drift');
  }
  if (semantic.trustedRegistryHashes.knowledgeReferenceRegistry !== input.trustedReferenceRegistry?.registrySha256) {
    throw new TypeError('trusted reference registry manifest binding drift');
  }
  const approvalHash = input.approvalRegistry?.registrySha256 ?? null;
  if (semantic.trustedRegistryHashes.consentApprovalRegistry !== approvalHash) {
    throw new TypeError('trusted consent registry manifest binding drift');
  }

  const referenced = new Set(input.knowledge?.receiptRefs ?? []);
  const replayed = new Set();
  const rightsEvidenceSha256 = [];
  for (const receipt of input.receiptBundle?.receipts ?? []) {
    if (!referenced.has(receipt.receiptId)) continue;
    const context = input.receiptReplayContexts?.[receipt.receiptId];
    if (!context) throw new TypeError(`receipt replay context missing: ${receipt.receiptId}`);
    replayFitV4Receipt(receipt, { ...context, fieldMap, bundle: input.receiptBundle });
    replayed.add(receipt.receiptId);
    rightsEvidenceSha256.push(...receipt.rights.decisions.map((decision) => decision.evidenceSha256));
  }
  if (referenced.size !== replayed.size || [...referenced].some((receiptId) => !replayed.has(receiptId))) {
    throw new TypeError('referenced receipt absent from replayed bundle');
  }
  const rightsEvidenceSet = semanticHash({
    schemaVersion: 1,
    evidenceSha256: [...new Set(rightsEvidenceSha256)].sort(),
  });
  if (semantic.trustedRegistryHashes.rightsEvidenceSet !== rightsEvidenceSet) {
    throw new TypeError('rights evidence registry manifest binding drift');
  }

  const knowledge = validateInstallationKnowledgeV4(input.knowledge, {
    fieldMap,
    asOf: semantic.asOf,
    trustedPolicyBundle: input.trustedPolicyBundle,
    trustedReferenceRegistry: input.trustedReferenceRegistry,
    receiptBundle: input.receiptBundle,
  });
  const siteOptions = {
    fieldMap,
    asOf: semantic.asOf,
    maxObservationAgeMs: MAX_SITE_OBSERVATION_AGE_MS,
    approvalRegistry: input.approvalRegistry,
    approvalEvidenceBytes: input.approvalEvidenceBytes,
  };
  const scenarioSelection = selectFitV4SyntheticScenario(
    manifest.scenarioSetManifest,
    manifest.selectedScenarioMemberId,
    siteOptions,
  );
  const { siteProfile } = scenarioSelection;
  if (semanticHash(semantic.scenarioBinding) !== semanticHash(scenarioSelection.scenarioBinding)
    || semantic.clockBindings.siteObservation?.bundleSha256
      !== scenarioSelection.scenarioBinding.scenarioMemberSha256) {
    throw new TypeError('site scenario manifest binding drift');
  }
  return { manifest, knowledge, siteProfile, scenarioSelection };
}

function typedGap({ rule, constraint, fitClass, fieldId, type, reasonCode, endpoint = null, detail = null }) {
  return freezeDeep({
    type,
    scope: fitClass === 'hard_delivery' ? 'delivery' : 'installation',
    ruleId: rule?.id ?? null,
    constraintId: constraint?.id ?? null,
    fieldId: fieldId ?? rule?.fieldId ?? null,
    fitClass: fitClass ?? rule?.fitClass ?? constraint?.fitClass ?? null,
    reasonCode,
    endpoint,
    detail,
  });
}

function typedConflict({ rule = null, fieldId = null, fitClass = null, reasonCode, refs = [] }) {
  const resolvedFitClass = rule?.fitClass ?? fitClass;
  return freezeDeep({
    type: 'EVIDENCE_CONFLICT',
    scope: resolvedFitClass === 'hard_delivery' ? 'delivery' : 'installation',
    ruleId: rule?.id ?? null,
    constraintId: null,
    fieldId: fieldId ?? rule?.fieldId ?? null,
    fitClass: resolvedFitClass ?? null,
    reasonCode,
    refs: [...refs].sort(),
  });
}

export function evaluateTypedFitCheckV4(input) {
  if (!input || typeof input !== 'object') throw new TypeError('typed Fit V4 check input required');
  if (!input.comparison?.projection) throw new TypeError('explicit comparison projection required');
  const relationInput = {
    relation: input.relation,
    required: input.required,
    available: input.available,
    ...(['MIN_REQUIRED', 'MAX_ALLOWED'].includes(input.relation) ? { equality: input.equality ?? 'closed' } : {}),
  };
  const evaluated = evaluateFitRelationV4(relationInput);
  const required = input.requiredEndpoint
    ? { ...input.requiredEndpoint, value: input.required }
    : { value: input.required };
  const available = input.availableEndpoint
    ? { ...input.availableEndpoint, value: input.available }
    : { value: input.available };
  return freezeDeep({
    id: input.id,
    ruleId: input.ruleId ?? null,
    constraintId: input.constraintId ?? null,
    fieldId: input.fieldId ?? null,
    fitClass: input.fitClass,
    scope: input.fitClass === 'hard_delivery' ? 'delivery' : 'installation',
    relation: input.relation,
    comparisonProjection: input.comparison.projection,
    branchId: input.branch?.id ?? null,
    branchSelectors: canonical(input.branch?.selectors ?? {}),
    configurationQuantifier: input.branch?.configurationQuantifier ?? input.configurationQuantifier ?? 'FIXED_SELECTED',
    status: evaluated.status,
    reasonCode: evaluated.reasonCode,
    required,
    available,
    margin: evaluated.margin ?? null,
    intersection: evaluated.intersection ?? null,
    witness: evaluated.witness ?? null,
    evidenceClass: input.evidenceClass ?? 'EXACT_MODEL_AND_BOUNDED_SITE',
    receiptRefs: [...new Set(input.receiptRefs ?? [])].sort(),
  });
}

function claimRows(knowledge, receipts) {
  const rows = [];
  for (const receipt of receipts) {
    rows.push({
      fieldId: receipt.fieldId,
      applicability: receipt.applicability,
      normalized: receipt.normalized,
      attribution: { kind: 'receipt', receiptId: receipt.receiptId },
      receiptSha256: receipt.receiptSha256,
    });
  }
  for (const collection of [
    knowledge.componentExtents, knowledge.adjustmentDomains, knowledge.operationGeometry,
    knowledge.services, knowledge.environmentSupport,
  ]) {
    for (const row of collection ?? []) rows.push({ ...row, attribution: row.attribution ?? { kind: 'policy_rule', ruleId: row.ruleId } });
  }
  return rows;
}

function indexClaims(rows, conflicts, fieldMap, identity, values) {
  const index = new Map();
  const unresolvedFields = new Set();
  for (const row of rows) {
    if (!row?.fieldId || !row.applicability || !row.normalized) continue;
    const applicability = predicateApplies(fieldMap, row, identity, values);
    if (applicability.unknown) {
      unresolvedFields.add(row.fieldId);
      continue;
    }
    if (!applicability.matched) continue;
    const current = index.get(row.fieldId);
    if (!current) {
      index.set(row.fieldId, row);
      continue;
    }
    if (JSON.stringify(canonical({ applicability: current.applicability, normalized: current.normalized }))
      !== JSON.stringify(canonical({ applicability: row.applicability, normalized: row.normalized }))) {
      conflicts.push(typedConflict({
        fieldId: row.fieldId,
        fitClass: fieldMap.fields.find((field) => field.id === row.fieldId)?.fitClass ?? null,
        reasonCode: 'CONFLICTING_KNOWLEDGE_CLAIMS',
        refs: [current.attribution?.receiptId, row.attribution?.receiptId].filter(Boolean),
      }));
    } else if (row.attribution?.kind === 'receipt') {
      index.set(row.fieldId, row);
    }
  }
  return { index, unresolvedFields };
}

function validateKnowledgeClaimShape(knowledge) {
  for (const name of [
    'componentExtents', 'adjustmentDomains', 'relationRefs', 'compositionRefs',
    'operationGeometry', 'services', 'environmentSupport', 'normativeRules',
    'receiptRefs',
  ]) {
    if (!Array.isArray(knowledge?.[name])) throw new TypeError(`Installation Knowledge V4 ${name} array required`);
  }
  if (new Set(knowledge.receiptRefs).size !== knowledge.receiptRefs.length) {
    throw new TypeError('Installation Knowledge V4 receipt references must be unique');
  }
}

function referencedReceipts(knowledge, receiptBundle, identity, conflicts, fieldMap) {
  const refs = new Set(knowledge.receiptRefs);
  const byId = new Map((receiptBundle.receipts ?? []).map((receipt) => [receipt.receiptId, receipt]));
  const accepted = [];
  for (const receiptId of refs) {
    const receipt = byId.get(receiptId);
    if (!receipt) throw new TypeError(`referenced Fit V4 receipt missing: ${receiptId}`);
    const sameIdentity = receipt.identity?.canonicalProductId === identity.canonicalProductId
      && receipt.identity?.category === identity.category
      && receipt.identity?.model === identity.model
      && receipt.identity?.market === identity.market;
    if (!sameIdentity) {
      const fitClass = fieldMap.fields.find((field) => field.id === receipt.fieldId)?.fitClass ?? null;
      conflicts.push(typedConflict({
        fieldId: receipt.fieldId,
        fitClass,
        reasonCode: 'RECEIPT_IDENTITY_MISMATCH',
        refs: [receipt.receiptId],
      }));
      continue;
    }
    accepted.push(receipt);
  }
  return accepted;
}

function configurationValues(input) {
  const knowledge = input.knowledge?.coordinateConfiguration?.values ?? {};
  const site = input.siteProfile?.configuration?.values ?? {};
  const conflicts = [];
  for (const name of new Set([...Object.keys(knowledge), ...Object.keys(site)])) {
    if (Object.hasOwn(knowledge, name) && Object.hasOwn(site, name) && knowledge[name] !== site[name]) conflicts.push(name);
  }
  return { values: { ...knowledge, ...site }, conflicts };
}

function selectorValue(name, values, siteProfile) {
  if (name === 'deliverySelected') return siteProfile.delivery?.selected === true;
  return Object.hasOwn(values, name) ? values[name] : 'unknown';
}

function selectedBranch(rule, values, siteProfile) {
  const selectors = Object.fromEntries(rule.selectorDomains.map((selector) => [
    selector.name,
    selectorValue(selector.name, values, siteProfile),
  ]));
  const branch = rule.selectorBranches.find((candidate) => (
    JSON.stringify(canonical(candidate.selectors)) === JSON.stringify(canonical(selectors))
  ));
  return { branch, selectors, unknown: Object.values(selectors).includes('unknown') };
}

function coverageDisposition(pack, rule, branch, identity, values) {
  const installationMode = values.installationMode ?? 'unknown';
  return pack.coverageManifest.cases.find((row) => row.ruleId === rule.id
    && row.formFactor === identity.formFactor
    && row.installationMode === installationMode
    && row.selectorBranchId === branch.id)?.disposition;
}

function unresolvedInstallerSettings(fieldMap, rule, branch, values) {
  if (branch.configurationQuantifier !== 'INSTALLER_SELECTABLE') return [];
  const field = fieldMap.fields.find((candidate) => candidate.id === rule.fieldId);
  return (field?.configurationVariables ?? []).filter((name) => {
    const value = values[name];
    if (name === 'hingeSide') return !['left', 'right'].includes(value);
    if (name === 'adjustedHeightMm') return !Number.isFinite(value);
    return value === undefined || value === null || value === 'unknown';
  });
}

function observationsBySubject(siteProfile) {
  const index = new Map();
  for (const observation of siteProfile.observations ?? []) {
    const rows = index.get(observation.subject) ?? [];
    rows.push(observation);
    index.set(observation.subject, rows);
  }
  return index;
}

function projectionIdentity(comparison) {
  return {
    unit: comparison.unit,
    coordinateSystem: comparison.coordinateSystem,
    datum: 'fit_v4_policy_projection',
    axis: comparison.axis,
    geometryId: comparison.geometryId,
  };
}

function scalarMeasurement(value, identity, kind = 'DETERMINISTIC', direction = null) {
  if (kind === 'COVERAGE_INTERVAL') {
    return {
      kind,
      minimum: value.minimum,
      maximum: value.maximum,
      minimumEndpoint: value.minimumEndpoint ?? 'closed',
      maximumEndpoint: value.maximumEndpoint ?? 'closed',
      ...identity,
    };
  }
  if (kind === 'DETERMINISTIC_BOUND') return { kind, value, direction, ...identity };
  return { kind, value, ...identity };
}

function projectValue(value, valueType, comparison, source = {}) {
  const identity = projectionIdentity(comparison);
  if (GEOMETRY_TYPES.has(valueType)) {
    return {
      kind: valueType,
      value,
      unit: comparison.unit,
      coordinateSystem: comparison.coordinateSystem,
      datum: 'fit_v4_policy_projection',
    };
  }
  if (CATEGORICAL_TYPES.has(valueType)) {
    return { kind: 'DETERMINISTIC', valueType, value, ...identity };
  }
  if (valueType === 'closed_range') {
    return scalarMeasurement(value, identity, 'COVERAGE_INTERVAL');
  }
  return scalarMeasurement(value, identity, source.boundKind ?? (source.estimate ? 'ESTIMATE' : 'DETERMINISTIC'), source.boundDirection);
}

function observationValue(rows, relation) {
  if (!rows?.length) return null;
  const observationRefs = rows.map((row) => row.id).sort();
  if (rows.length === 1) return { ...rows[0], observationRefs };
  const identity = (row) => canonical({
    valueType: row.valueType, unit: row.unit, coordinateSystem: row.coordinateSystem,
    datum: row.datum, axis: row.axis, geometryId: row.geometryId,
  });
  if (rows.some((row) => JSON.stringify(identity(row)) !== JSON.stringify(identity(rows[0])))) return null;
  if (rows.some((row) => row.boundKind !== 'DETERMINISTIC' || typeof row.value !== 'number')) return null;
  const values = rows.map((row) => row.value);
  if (relation === 'WITHIN_RANGE') {
    return {
      ...rows[0],
      value: { minimum: Math.min(...values), maximum: Math.max(...values) },
      boundKind: 'COVERAGE_INTERVAL',
      observationRefs,
    };
  }
  if (!['MIN_REQUIRED', 'MAX_ALLOWED'].includes(relation)) return null;
  return {
    ...rows[0],
    value: relation === 'MIN_REQUIRED' ? Math.min(...values) : Math.max(...values),
    observationRefs,
  };
}

function sameAxes(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function geometryOperandMismatch(fieldMap, rule, endpoint, observation) {
  if (!GEOMETRY_TYPES.has(endpoint.valueType)) return null;
  const sourceFrame = fieldMap.coordinateFrames.find((frame) => frame.id === observation.coordinateSystem);
  const targetFrame = fieldMap.coordinateFrames.find((frame) => frame.id === rule.comparison.coordinateSystem);
  if (!sourceFrame || !targetFrame || observation.datum !== sourceFrame.origin) return 'UNPROVEN_GEOMETRY_DATUM';
  if (rule.comparison.projection === 'SAME_FRAME_GEOMETRY' && sourceFrame.id !== targetFrame.id) {
    return 'GEOMETRY_FRAME_MISMATCH';
  }
  if (rule.comparison.projection === 'ALIGNED_FRAME_GEOMETRY'
    && (sourceFrame.origin !== targetFrame.origin || !sameAxes(sourceFrame.axes, targetFrame.axes))) {
    return 'UNPROVEN_GEOMETRY_TRANSFORM';
  }
  return null;
}

function availableOperand(rule, endpoint, values, observationIndex, fieldMap) {
  if (endpoint.source === 'selected_configuration') {
    if (!Object.hasOwn(values, endpoint.configurationVariable)) return null;
    return {
      operand: projectValue(values[endpoint.configurationVariable], endpoint.valueType, rule.comparison),
      endpoint: { source: endpoint.source, configurationVariable: endpoint.configurationVariable },
      uncertain: false,
    };
  }
  const observation = observationValue(observationIndex.get(endpoint.subject), rule.relation);
  if (!observation) return null;
  const contractMismatch = observation.valueType !== endpoint.valueType
    || observation.unit !== endpoint.unit
    || observation.axis !== rule.comparison.axis;
  const geometryMismatch = geometryOperandMismatch(fieldMap, rule, endpoint, observation);
  if (contractMismatch || geometryMismatch) {
    return {
      error: {
        reasonCode: 'AVAILABLE_OPERAND_CONTRACT_MISMATCH',
        detail: {
          mismatch: geometryMismatch ?? 'TYPE_UNIT_OR_AXIS_MISMATCH',
          expected: { valueType: endpoint.valueType, unit: endpoint.unit, axis: rule.comparison.axis },
          observed: {
            valueType: observation.valueType, unit: observation.unit, axis: observation.axis,
            coordinateSystem: observation.coordinateSystem, datum: observation.datum,
          },
        },
      },
    };
  }
  return {
    operand: projectValue(observation.value, endpoint.valueType, rule.comparison, observation),
    endpoint: {
      source: endpoint.source, subject: endpoint.subject, observationRefs: observation.observationRefs,
      coordinateSystem: observation.coordinateSystem, datum: observation.datum,
    },
    uncertain: ['ESTIMATE', 'COVERAGE_INTERVAL', 'DETERMINISTIC_BOUND'].includes(observation.boundKind),
  };
}

function predicateApplies(fieldMap, claim, identity, values) {
  if (claim.applicability.state !== 'conditional') return { matched: true, unknown: false };
  try {
    const evaluated = evaluateFitRuleV4(fieldMap, claim.applicability.predicate, {
      product: { category: identity.category, identity: { category: identity.category, market: identity.market } },
      configuration: values,
    });
    return { matched: evaluated.matched, unknown: false };
  } catch {
    return { matched: false, unknown: true };
  }
}

function evidenceClass(claim, available) {
  if (available.uncertain || claim.normalized.estimate === true) return 'ESTIMATE_OR_COVERAGE';
  if (claim.attribution?.kind === 'receipt') return 'EXACT_MODEL_AND_BOUNDED_SITE';
  if (claim.normalized.value !== null && ['boolean', 'string', 'enum', 'enum_set', 'connector'].includes(
    typeof claim.normalized.value === 'boolean' ? 'boolean' : Array.isArray(claim.normalized.value) ? 'enum_set' : typeof claim.normalized.value,
  )) return 'NORMATIVE_CONFIRMATION';
  return 'NORMATIVE_RULE';
}

function outcome(status, reasonCode, checkIds = [], gapCount = 0) {
  return freezeDeep({ status, reasonCode, checkIds: [...checkIds], gapCount });
}

function installationOutcome(checks, gaps, conflicts) {
  const scopedChecks = checks.filter((check) => check.scope === 'installation');
  const scopedGaps = gaps.filter((gap) => gap.scope === 'installation');
  const scopedConflicts = conflicts.filter((conflict) => conflict.scope === 'installation');
  const failures = scopedChecks.filter((check) => check.status === 'FAIL');
  if (failures.length) return outcome('NO_FIT', 'APPLICABLE_HARD_FAILURE', failures.map((row) => row.id), scopedGaps.length);
  const placementUnknown = scopedChecks.filter((check) => check.fitClass === 'hard_placement' && check.status === 'UNKNOWN');
  const placementGaps = scopedGaps.filter((gap) => gap.fitClass === 'hard_placement');
  const placementConflicts = scopedConflicts.filter((conflict) => conflict.fitClass === 'hard_placement' || conflict.fitClass === null);
  if (placementUnknown.length || placementGaps.length || placementConflicts.length) {
    return outcome('INSUFFICIENT_DATA', 'PLACEMENT_EVIDENCE_INSUFFICIENT', placementUnknown.map((row) => row.id), placementGaps.length + placementConflicts.length);
  }
  const unresolved = scopedChecks.filter((check) => check.status === 'UNKNOWN');
  if (unresolved.length || scopedGaps.length || scopedConflicts.length) {
    return outcome('CONDITIONAL_FIT', 'UNRESOLVED_INSTALLATION_REQUIREMENT', unresolved.map((row) => row.id), scopedGaps.length + scopedConflicts.length);
  }
  if (scopedChecks.some((check) => check.evidenceClass === 'ESTIMATE_OR_COVERAGE')) {
    return outcome('LIKELY_FIT_ESTIMATED', 'PASS_WITH_ESTIMATE_OR_COVERAGE_EVIDENCE', scopedChecks.map((row) => row.id));
  }
  return outcome('VERIFIED_FIT', 'ALL_APPLICABLE_HARD_CONDITIONS_PROVEN', scopedChecks.map((row) => row.id));
}

function deliveryOutcome(siteProfile, checks, gaps, conflicts) {
  if (siteProfile.delivery?.selected !== true) return outcome('NOT_EVALUATED', 'DELIVERY_NOT_SELECTED');
  const scopedChecks = checks.filter((check) => check.scope === 'delivery');
  const scopedGaps = gaps.filter((gap) => gap.scope === 'delivery');
  const scopedConflicts = conflicts.filter((conflict) => conflict.scope === 'delivery');
  const failures = scopedChecks.filter((check) => check.status === 'FAIL');
  if (failures.length) return outcome('NO_FIT', 'DELIVERY_HARD_FAILURE', failures.map((row) => row.id), scopedGaps.length);
  if (scopedChecks.some((check) => check.status === 'UNKNOWN') || scopedGaps.length || scopedConflicts.length) {
    return outcome('INSUFFICIENT_DATA', 'DELIVERY_EVIDENCE_INSUFFICIENT', [], scopedGaps.length + scopedConflicts.length);
  }
  if (scopedChecks.some((check) => check.evidenceClass === 'ESTIMATE_OR_COVERAGE')) {
    return outcome('LIKELY_FIT_ESTIMATED', 'DELIVERY_PASS_WITH_ESTIMATE_OR_COVERAGE', scopedChecks.map((row) => row.id));
  }
  return outcome('VERIFIED_FIT', 'ALL_SELECTED_DELIVERY_CONDITIONS_PROVEN', scopedChecks.map((row) => row.id));
}

function placementConstraintCheck(constraint, claimIndex, observationIndex) {
  const values = [];
  const receiptRefs = [];
  for (const term of constraint.composition.terms) {
    const claim = claimIndex.get(term.fieldId);
    if (!claim || !['required', 'conditional', 'prohibited'].includes(claim.applicability.state)
      || typeof claim.normalized.value !== 'number') return { reasonCode: 'PLACEMENT_COMPOSITION_OPERAND_MISSING' };
    values.push(claim.normalized.value);
    if (claim.attribution?.receiptId) receiptRefs.push(claim.attribution.receiptId);
  }
  const proof = [];
  for (const subject of constraint.siteProofSubjects) {
    const rows = observationIndex.get(subject);
    if (!rows || rows.length !== 1) return { reasonCode: 'PLACEMENT_PROOF_OPERAND_MISSING' };
    const observation = observationValue(rows, constraint.relation);
    if (!observation || observation.boundKind !== 'DETERMINISTIC' || typeof observation.value !== 'number') {
      return { reasonCode: 'PLACEMENT_PROOF_OPERAND_INVALID' };
    }
    proof.push(observation);
  }
  const proofIdentity = (row) => canonical({
    unit: row.unit, coordinateSystem: row.coordinateSystem, datum: row.datum,
    axis: row.axis, geometryId: row.geometryId,
  });
  if (proof.some((row) => JSON.stringify(proofIdentity(row)) !== JSON.stringify(proofIdentity(proof[0])))) {
    return { reasonCode: 'PLACEMENT_PROOF_IDENTITY_MISMATCH' };
  }
  const [availableObservation, ...gapObservations] = proof;
  const envelopeTerm = constraint.composition.terms.find((term) => term.fieldId.startsWith('envelope.closed.'));
  const envelopeIndex = constraint.composition.terms.indexOf(envelopeTerm);
  const projectedOccupancy = values[envelopeIndex] + gapObservations.reduce((sum, row) => sum + row.value, 0);
  if (Math.abs(projectedOccupancy - availableObservation.value) > 1e-9) {
    return {
      reasonCode: 'PLACEMENT_OBSERVATIONS_INCOHERENT',
      detail: { projectedOccupancy, available: availableObservation.value },
    };
  }
  const identity = proofIdentity(availableObservation);
  const required = scalarMeasurement(values.reduce((sum, value) => sum + value, 0), identity);
  const available = scalarMeasurement(availableObservation.value, identity);
  return { check: evaluateTypedFitCheckV4({
    id: `constraint:${constraint.id}`,
    constraintId: constraint.id,
    relation: constraint.relation,
    required,
    available,
    fitClass: constraint.fitClass,
    comparison: constraint.comparison,
    configurationQuantifier: 'FIXED_SELECTED',
    requiredEndpoint: {
      source: 'composed_placement', terms: constraint.composition.terms,
      siteProofObservationRefs: proof.flatMap((row) => row.observationRefs).sort(),
    },
    availableEndpoint: {
      source: 'site_profile_v4', subject: constraint.available.subject,
      observationRefs: availableObservation.observationRefs,
      coordinateSystem: availableObservation.coordinateSystem, datum: availableObservation.datum,
      geometryId: availableObservation.geometryId,
    },
    evidenceClass: 'EXACT_MODEL_AND_BOUNDED_SITE',
    receiptRefs,
  }) };
}

function validatedEvaluationContext(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Fit V4 shadow input required');
  if (!RUN_ID.test(input.runId ?? '')) throw new TypeError('Fit V4 run ID required');
  const fieldMap = validateFitV4FieldMap(input.fieldMap);
  const pack = validateFitPolicyPackV4(fieldMap, input.policyPack);
  if (pack.category !== input.identity?.category || pack.fieldMapVersion !== fieldMap.version) throw new TypeError('policy identity or field-map binding mismatch');
  if (!pack.recognizedFormFactors.includes(input.identity.formFactor)) throw new TypeError('policy form factor mismatch');
  return { fieldMap, pack };
}

export function evaluateFitV4Shadow(input) {
  const { fieldMap, pack } = validatedEvaluationContext(input);
  const trust = validateTrustEnvelope(input, fieldMap, pack);
  return evaluateValidatedFitV4(input, fieldMap, pack, trust);
}

function evaluateValidatedFitV4(input, fieldMap, pack, trust, { live = false } = {}) {
  const knowledge = trust.knowledge;
  const siteProfile = trust.siteProfile;
  const productHash = assertedHash(knowledge, input.productSha256, 'product');
  const knowledgeIdentity = knowledge.identity;
  for (const key of ['canonicalProductId', 'category', 'brand', 'model', 'market']) {
    if (knowledgeIdentity?.[key] !== input.identity?.[key]) {
      throw new TypeError(`Installation Knowledge identity mismatch: ${key}`);
    }
  }
  const receiptSemantic = {
    schemaVersion: input.receiptBundle?.schemaVersion,
    receipts: input.receiptBundle?.receipts ?? [],
    conflicts: input.receiptBundle?.conflicts ?? [],
  };
  const receiptHash = assertedHash(receiptSemantic, input.receiptBundleSha256, 'receipt bundle');
  if (input.receiptBundle?.bundleSha256 !== receiptHash) throw new TypeError('receipt bundle immutable binding drift');
  const policyHash = assertedHash(pack, input.policySha256, 'policy');

  const checks = [];
  const gaps = [];
  const conflicts = [];
  const acceptedRules = [];
  validateKnowledgeClaimShape(knowledge);
  const receiptRefs = new Set(knowledge.receiptRefs);
  for (const conflict of input.receiptBundle?.conflicts ?? []) {
    if (conflict.canonicalProductId !== input.identity.canonicalProductId
      && !(conflict.receiptIds ?? []).some((receiptId) => receiptRefs.has(receiptId))) continue;
    const fitClass = fieldMap.fields.find((field) => field.id === conflict.fieldId)?.fitClass ?? null;
    conflicts.push(typedConflict({
      fieldId: conflict.fieldId,
      fitClass,
      reasonCode: 'ACTIVE_RECEIPT_CONFLICT',
      refs: conflict.receiptIds ?? [],
    }));
  }
  const trustedInput = { ...input, knowledge, siteProfile };
  const configuration = configurationValues(trustedInput);
  const receipts = referencedReceipts(knowledge, input.receiptBundle, input.identity, conflicts, fieldMap);
  const indexedClaims = indexClaims(
    claimRows(knowledge, receipts), conflicts, fieldMap, input.identity, configuration.values,
  );
  const claimIndex = indexedClaims.index;
  const observationIndex = observationsBySubject(siteProfile);
  for (const name of configuration.conflicts) {
    conflicts.push(typedConflict({ fieldId: null, reasonCode: 'CONFIGURATION_ASSIGNMENT_CONFLICT', refs: [name] }));
  }

  for (const rule of pack.rules) {
    const selected = selectedBranch(rule, configuration.values, siteProfile);
    if (!selected.branch) {
      const gap = typedGap({ rule, type: 'UNKNOWN_BRANCH', reasonCode: 'NO_SELECTOR_BRANCH', detail: selected.selectors });
      gaps.push(gap);
      acceptedRules.push({ ruleId: rule.id, fieldId: rule.fieldId, scope: gap.scope });
      continue;
    }
    const disposition = coverageDisposition(pack, rule, selected.branch, input.identity, configuration.values);
    if (disposition === 'EXCLUDED') continue;
    const claim = claimIndex.get(rule.fieldId);
    if (claim?.applicability?.state === 'not_applicable') continue;
    const acceptedRule = { ruleId: rule.id, fieldId: rule.fieldId, scope: rule.fitClass === 'hard_delivery' ? 'delivery' : 'installation' };
    if (selected.unknown) {
      acceptedRules.push(acceptedRule);
      gaps.push(typedGap({
        rule,
        type: 'UNKNOWN_APPLICABILITY',
        reasonCode: 'UNKNOWN_SELECTOR_ASSIGNMENT',
        detail: { selectors: selected.selectors, configurationQuantifier: selected.branch.configurationQuantifier },
      }));
      continue;
    }
    if (!claim) {
      acceptedRules.push(acceptedRule);
      gaps.push(typedGap({
        rule,
        type: indexedClaims.unresolvedFields.has(rule.fieldId) ? 'UNKNOWN_APPLICABILITY' : 'MISSING_CLAIM',
        reasonCode: indexedClaims.unresolvedFields.has(rule.fieldId)
          ? 'CONDITIONAL_APPLICABILITY_UNRESOLVED'
          : 'MISSING_KNOWLEDGE_CLAIM',
        endpoint: rule.endpoints.required,
      }));
      continue;
    }
    if (claim.applicability.state === 'unknown') {
      acceptedRules.push(acceptedRule);
      gaps.push(typedGap({ rule, type: 'UNKNOWN_APPLICABILITY', reasonCode: 'KNOWLEDGE_APPLICABILITY_UNKNOWN', endpoint: rule.endpoints.required }));
      continue;
    }
    const applicability = predicateApplies(fieldMap, claim, input.identity, configuration.values);
    if (applicability.unknown) {
      acceptedRules.push(acceptedRule);
      gaps.push(typedGap({ rule, type: 'UNKNOWN_APPLICABILITY', reasonCode: 'CONDITIONAL_APPLICABILITY_UNRESOLVED' }));
      continue;
    }
    if (!applicability.matched) continue;
    acceptedRules.push(acceptedRule);
    if (claim.normalized.relation !== rule.relation) {
      conflicts.push(typedConflict({ rule, reasonCode: 'CLAIM_RELATION_POLICY_CONFLICT', refs: [claim.attribution?.receiptId].filter(Boolean) }));
      continue;
    }
    const endpoint = rule.endpoints.available[0];
    const available = availableOperand(rule, endpoint, configuration.values, observationIndex, fieldMap);
    if (!available) {
      gaps.push(typedGap({ rule, type: 'MISSING_OPERAND', reasonCode: 'MISSING_OR_UNKNOWN_AVAILABLE_OPERAND', endpoint }));
      continue;
    }
    if (available.error) {
      gaps.push(typedGap({
        rule,
        type: 'INVALID_OPERAND',
        reasonCode: available.error.reasonCode,
        endpoint,
        detail: available.error.detail,
      }));
      continue;
    }
    const required = projectValue(claim.normalized.value, rule.comparison.requiredValueType, rule.comparison, claim.normalized);
    const receiptRefs = claim.attribution?.receiptId ? [claim.attribution.receiptId] : [];
    checks.push(evaluateTypedFitCheckV4({
      id: `rule:${rule.id}`,
      ruleId: rule.id,
      fieldId: rule.fieldId,
      fitClass: rule.fitClass,
      relation: rule.relation,
      comparison: rule.comparison,
      required,
      available: available.operand,
      equality: claim.normalized.endpoints?.boundary,
      branch: selected.branch,
      requiredEndpoint: { source: 'installation_knowledge_v4', fieldId: rule.fieldId },
      availableEndpoint: available.endpoint,
      evidenceClass: evidenceClass(claim, available),
      receiptRefs,
    }));
    const unresolvedSettings = unresolvedInstallerSettings(fieldMap, rule, selected.branch, configuration.values);
    if (unresolvedSettings.length) {
      gaps.push(typedGap({
        rule,
        type: 'UNRESOLVED_CONFIGURATION',
        reasonCode: 'INSTALLER_SETTING_REQUIRED',
        endpoint: rule.endpoints.required,
        detail: { configurationVariables: unresolvedSettings },
      }));
    }
  }

  const installationMode = configuration.values.installationMode ?? 'unknown';
  for (const constraint of pack.placementConstraints.filter((row) => row.installationModes.includes(installationMode))) {
    acceptedRules.push({ constraintId: constraint.id, fieldId: null, scope: 'installation' });
    const evaluation = placementConstraintCheck(constraint, claimIndex, observationIndex);
    if (evaluation.check) checks.push(evaluation.check);
    else gaps.push(typedGap({
      constraint,
      fitClass: constraint.fitClass,
      type: 'MISSING_OPERAND',
      reasonCode: evaluation.reasonCode,
      endpoint: { composition: constraint.composition, available: constraint.available },
      detail: evaluation.detail ?? null,
    }));
  }

  const result = {
    schemaVersion: FIT_V4_SHADOW_SCHEMA_VERSION,
    ...(live ? { scenarioBindingKind: 'LIVE_EPHEMERAL' } : {
      runId: input.runId,
      scenarioBinding: trust.scenarioSelection.scenarioBinding,
    }),
    versions: {
      resultSchema: `fit-v4-shadow-${FIT_V4_SHADOW_SCHEMA_VERSION}`,
      policy: pack.packVersion,
      policySchema: pack.schemaVersion,
      fieldMap: fieldMap.version,
      knowledgeSchema: knowledge.schemaVersion,
      siteSchema: siteProfile.schemaVersion,
    },
    hashes: {
      product: productHash,
      receipts: receiptHash,
      policy: policyHash,
    },
    identity: canonical(input.identity),
    installationOutcome: installationOutcome(checks, gaps, conflicts),
    deliveryOutcome: deliveryOutcome(siteProfile, checks, gaps, conflicts),
    acceptedRules,
    checks,
    gaps,
    conflicts,
    advisories: pack.advisories,
  };
  const frozen = freezeDeep(canonical(result));
  if (live) return frozen;
  const audit = auditFitV4ShadowResult(frozen, {
    manifest: trust.manifest,
    siteOptions: {
      fieldMap,
      asOf: trust.manifest.semantic.asOf,
      maxObservationAgeMs: MAX_SITE_OBSERVATION_AGE_MS,
      approvalRegistry: input.approvalRegistry,
      approvalEvidenceBytes: input.approvalEvidenceBytes,
    },
  });
  if (!audit.passed) throw new Error(`Fit V4 shadow audit failed: ${audit.violations.map((row) => row.code).join(',')}`);
  return frozen;
}

export function evaluateFitV4LiveShadow(value) {
  if (!value || typeof value !== 'object'
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['capability', 'evaluationInput'])) {
    throw liveError('LIVE_EPHEMERAL_EVALUATION_INPUT_INVALID');
  }
  const siteProfile = LIVE_CAPABILITIES.get(value.capability);
  if (!siteProfile) throw liveError('LIVE_EPHEMERAL_CAPABILITY_INVALID');
  let evaluation;
  try {
    const { fieldMap, pack } = validatedEvaluationContext(value.evaluationInput);
    const persistedTrust = validateTrustEnvelope(value.evaluationInput, fieldMap, pack);
    evaluation = evaluateValidatedFitV4(
      value.evaluationInput,
      fieldMap,
      pack,
      { ...persistedTrust, siteProfile },
      { live: true },
    );
  } catch {
    throw liveError('LIVE_EPHEMERAL_EVALUATION_FAILED');
  }
  const outcome = evaluation.installationOutcome.status;
  const reasonCode = evaluation.installationOutcome.reasonCode;
  const result = opaqueLiveObject({
    scenarioBindingKind: { get() { return 'LIVE_EPHEMERAL'; } },
    outcome: { get() { return outcome; } },
    reasonCode: { get() { return reasonCode; } },
  });
  LIVE_RESULTS.set(result, { capability: value.capability, evaluation });
  return result;
}

export function auditFitV4LiveShadowResult(value) {
  if (!value || typeof value !== 'object'
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['capability', 'result'])) {
    throw liveError('LIVE_EPHEMERAL_AUDIT_INPUT_INVALID');
  }
  if (!LIVE_CAPABILITIES.has(value.capability)) throw liveError('LIVE_EPHEMERAL_CAPABILITY_INVALID');
  const stored = LIVE_RESULTS.get(value.result);
  if (!stored || stored.capability !== value.capability) throw liveError('LIVE_EPHEMERAL_RESULT_INVALID');
  return opaqueLiveObject({
    scenarioBindingKind: { get() { return 'LIVE_EPHEMERAL'; } },
    passed: { get() { return true; } },
    outcome: { get() { return stored.evaluation.installationOutcome.status; } },
    reasonCode: { get() { return stored.evaluation.installationOutcome.reasonCode; } },
  });
}
