import { createHash } from 'node:crypto';

import { getFitV4Field, validateFitV4FieldMap } from './fit-v4-contract.mjs';
import { assertFitV4ReceiptUsable, validateFitV4NormalizedValue } from './installation-evidence-receipt-v4.mjs';
import { FIT_RELATIONS_V4 } from './fit-relation-v4.mjs';
import { evaluateFitRuleV4, validateFitRuleV4 } from './fit-rule-v4.mjs';

export const INSTALLATION_KNOWLEDGE_V4_SCHEMA_VERSION = 1;

const CATEGORIES = new Set(['refrigerator', 'dishwasher', 'washing_machine', 'dryer']);
const APPLICABILITY = new Set(['required', 'conditional', 'not_applicable', 'prohibited', 'unknown']);
const SELECTOR_STATES = new Set(['selected', 'unknown', 'prohibited']);
const COMPONENT_KINDS = new Set(['body', 'door', 'handle', 'feet', 'trim', 'panel']);
const GEOMETRY_TYPES = new Set(['box3', 'polygon2', 'route3', 'sweep3']);
const PHYSICAL_UNITS = new Set(['mm', 'mm2', 'm3', 'kg', 'kPa', 'V', 'A', 'percent', 'degree']);
const MODEL_PHYSICAL_PREFIXES = [
  'envelope.', 'installation.', 'operation.', 'ventilation.', 'water.', 'power.',
  'drain.', 'dishwasher.', 'stacking.', 'dryer.', 'delivery.',
];
const RELATION_OPERATORS = new Set(FIT_RELATIONS_V4);
const COMPOSITION_OPERATORS = new Set(['MAX', 'SUM']);
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]*$/;
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'identity', 'coordinateConfiguration', 'componentExtents',
  'adjustmentDomains', 'relationRefs', 'compositionRefs', 'operationGeometry',
  'services', 'environmentSupport', 'normativeRules', 'receiptRefs',
];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!isPlainObject(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} schema key set invalid`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function safeId(value, label) {
  const accepted = text(value, label);
  if (!SAFE_ID.test(accepted) || accepted.split(/[.:]/).some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new TypeError(`${label} safe lowercase ID required`);
  }
  return accepted;
}

function requiredArray(value, label, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) throw new TypeError(`${label} array required`);
  return value;
}

function canonical(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} finite JSON number required`);
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${label} array hole rejected`);
    }
    return value.map((item, index) => canonical(item, `${label}[${index}]`));
  }
  if (!isPlainObject(value)) throw new TypeError(`${label} plain JSON required`);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return semanticHash(left) === semanticHash(right);
}

function instant(value, label) {
  const parsed = new Date(text(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} invalid`);
  return parsed;
}

function validateApplicability(value, label) {
  exactKeys(value, ['state', 'predicate'], label);
  if (!APPLICABILITY.has(value.state)) throw new TypeError(`${label} state invalid`);
  if (value.state === 'conditional' && !isPlainObject(value.predicate)) throw new TypeError(`${label} conditional predicate required`);
  if (value.state !== 'conditional' && value.predicate !== null) throw new TypeError(`${label} predicate must be null unless conditional`);
  return canonical(value);
}

function assertPhysicalNonNegative(field, normalized, label) {
  if (field.value.type === 'connector' && normalized.value?.size !== undefined && normalized.value.size < 0) {
    throw new RangeError(`${label} connector size must be non-negative`);
  }
  if (!PHYSICAL_UNITS.has(normalized.unit) || normalized.unit === 'C' || normalized.value === null) return;
  if (typeof normalized.value === 'number' && normalized.value < 0) {
    throw new RangeError(`${label} physical value must be non-negative`);
  }
  if (field.value.type === 'closed_range'
    && (normalized.value.minimum < 0 || normalized.value.maximum < 0)) {
    throw new RangeError(`${label} physical range must be non-negative`);
  }
}

function validateNormalized(fieldMap, fieldId, normalized, applicability, label) {
  exactKeys(normalized, ['value', 'unit', 'relation', 'endpoints'], `${label} normalized`);
  const field = getFitV4Field(fieldMap, fieldId);
  if (applicability.state === 'unknown') {
    if (normalized.value !== null || normalized.unit !== null || normalized.relation !== null || normalized.endpoints !== null) {
      throw new TypeError(`${label} unknown state must preserve a null normalized value`);
    }
    return canonical(normalized);
  }
  const accepted = validateFitV4NormalizedValue(fieldMap, fieldId, normalized, applicability);
  assertPhysicalNonNegative(field, accepted, label);
  return accepted;
}

function validateInlineRule(fieldMap, value, label) {
  exactKeys(value, ['ruleId', 'authority', 'fieldId', 'applicability', 'normalized', 'when'], label);
  const ruleId = safeId(value.ruleId, `${label}.ruleId`);
  if (value.authority !== 'fit_policy_v4') throw new TypeError(`${ruleId} policy authority marker invalid`);
  const fieldId = text(value.fieldId, `${ruleId} fieldId`);
  getFitV4Field(fieldMap, fieldId);
  const applicability = validateApplicability(value.applicability, `${ruleId} applicability`);
  const normalized = validateNormalized(fieldMap, fieldId, value.normalized, applicability, ruleId);
  const when = validateFitRuleV4(fieldMap, value.when);
  return freezeDeep({ ruleId, authority: 'fit_policy_v4', fieldId, applicability, normalized, when });
}

function validateTrustedPolicyBundle(fieldMap, bundle) {
  exactKeys(bundle, ['schemaVersion', 'bundleId', 'rules', 'bundleSha256'], 'trusted policy bundle');
  if (bundle.schemaVersion !== 1) throw new TypeError('trusted policy bundle schemaVersion 1 required');
  const bundleId = safeId(bundle.bundleId, 'trusted policy bundle ID');
  const rules = requiredArray(bundle.rules, 'trusted policy bundle rules');
  const payload = { schemaVersion: 1, bundleId, rules: canonical(rules) };
  if (semanticHash(payload) !== bundle.bundleSha256) throw new TypeError('trusted policy bundle hash mismatch');
  const index = new Map();
  for (const [position, entry] of rules.entries()) {
    exactKeys(entry, ['ruleId', 'usage', 'policyClass', 'content', 'semanticSha256'], `trusted policy rule[${position}]`);
    const content = validateInlineRule(fieldMap, entry.content, `trusted policy rule[${position}].content`);
    if (entry.ruleId !== content.ruleId || semanticHash(content) !== entry.semanticSha256) {
      throw new TypeError(`trusted policy rule hash/content mismatch: ${String(entry.ruleId)}`);
    }
    if (!['claim', 'configuration'].includes(entry.usage)) throw new TypeError('trusted policy rule usage invalid');
    if (!['knowledge_state', 'normative_requirement'].includes(entry.policyClass)) throw new TypeError('trusted policy class invalid');
    if (index.has(entry.ruleId)) throw new TypeError(`duplicate trusted policy rule: ${entry.ruleId}`);
    index.set(entry.ruleId, freezeDeep({ ...entry, content }));
  }
  return index;
}

function bindInlineRules(fieldMap, rules, trusted) {
  const inline = new Map();
  for (const [index, value] of requiredArray(rules, 'normativeRules').entries()) {
    const rule = validateInlineRule(fieldMap, value, `normativeRules[${index}]`);
    if (inline.has(rule.ruleId)) throw new TypeError(`duplicate normative rule: ${rule.ruleId}`);
    const trustedEntry = trusted.get(rule.ruleId);
    if (!trustedEntry || !same(trustedEntry.content, rule)) throw new TypeError(`normative rule is unknown or unbound: ${rule.ruleId}`);
    inline.set(rule.ruleId, trustedEntry);
  }
  return inline;
}

function validateTrustedReferenceRegistry(registry) {
  exactKeys(registry, ['schemaVersion', 'registryId', 'references', 'registrySha256'], 'trusted reference registry');
  if (registry.schemaVersion !== 1) throw new TypeError('trusted reference registry schemaVersion 1 required');
  const registryId = safeId(registry.registryId, 'trusted reference registry ID');
  const references = requiredArray(registry.references, 'trusted reference registry references');
  const payload = { schemaVersion: 1, registryId, references: canonical(references) };
  if (semanticHash(payload) !== registry.registrySha256) throw new TypeError('trusted reference registry hash mismatch');
  const index = new Map();
  for (const [position, reference] of references.entries()) {
    exactKeys(reference, ['id', 'type', 'fieldIds', 'operator', 'semanticSha256'], `trusted reference[${position}]`);
    const content = {
      id: safeId(reference.id, 'trusted reference ID'),
      type: reference.type,
      fieldIds: canonical(reference.fieldIds),
      operator: reference.operator,
    };
    if (!['relation', 'composition'].includes(content.type)) throw new TypeError('trusted reference type invalid');
    if (content.type === 'relation' && !RELATION_OPERATORS.has(content.operator)) {
      throw new TypeError(`trusted relation operator invalid: ${String(content.operator)}`);
    }
    if (content.type === 'composition' && !COMPOSITION_OPERATORS.has(content.operator)) {
      throw new TypeError(`trusted composition operator invalid: ${String(content.operator)}`);
    }
    if (semanticHash(content) !== reference.semanticSha256) throw new TypeError(`trusted reference hash/content mismatch: ${content.id}`);
    if (index.has(content.id)) throw new TypeError(`duplicate trusted reference: ${content.id}`);
    index.set(content.id, freezeDeep({ ...content, semanticSha256: reference.semanticSha256 }));
  }
  return index;
}

function receiptIndex(fieldMap, receiptBundle, receiptRefs, identity, options, asOf) {
  const index = new Map();
  for (const receiptId of requiredArray(receiptRefs, 'receiptRefs', { nonEmpty: false })) {
    text(receiptId, 'receipt reference');
    if (index.has(receiptId)) throw new TypeError(`duplicate receipt reference: ${receiptId}`);
    const candidate = receiptBundle?.receipts?.find((receipt) => receipt.receiptId === receiptId);
    if (!candidate) throw new TypeError(`receipt reference absent from bundle: ${receiptId}`);
    const receipt = assertFitV4ReceiptUsable(candidate, { bundle: receiptBundle, fieldMap });
    for (const key of ['canonicalProductId', 'category', 'brand', 'model', 'market']) {
      if (receipt.identity[key] !== identity[key]) throw new TypeError(`cross-model receipt identity mismatch: ${key}`);
    }
    const observedAt = instant(receipt.source.observedAt, 'receipt observedAt');
    if (observedAt > asOf) throw new Error(`future receipt observation is after asOf: ${receipt.receiptId}`);
    if (options.maxReceiptAgeMs !== undefined) {
      if (!Number.isFinite(options.maxReceiptAgeMs) || options.maxReceiptAgeMs < 0) throw new TypeError('maxReceiptAgeMs must be non-negative and finite');
      if (asOf.valueOf() - observedAt.valueOf() > options.maxReceiptAgeMs) throw new Error(`stale receipt evidence: ${receipt.receiptId}`);
    }
    index.set(receiptId, receipt);
  }
  return index;
}

function validateAttribution(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} attribution required`);
  if (value.kind === 'receipt') {
    exactKeys(value, ['kind', 'receiptId'], `${label} receipt attribution`);
    return { kind: 'receipt', receiptId: text(value.receiptId, `${label} receipt ID`) };
  }
  if (value.kind === 'policy_rule') {
    exactKeys(value, ['kind', 'ruleId'], `${label} policy attribution`);
    return { kind: 'policy_rule', ruleId: safeId(value.ruleId, `${label} rule ID`) };
  }
  throw new TypeError(`${label} attribution kind invalid`);
}

function ruleContext(identity, configuration) {
  return {
    product: { category: identity.category, identity: { market: identity.market } },
    configuration: configuration.values,
  };
}

function assertRuleApplicable(entry, context, label) {
  let evaluation;
  try {
    evaluation = evaluateFitRuleV4(context.fieldMap, entry.content.when, ruleContext(context.identity, context.configuration));
  } catch (error) {
    throw new TypeError(`${label} trusted policy is not applicable because selector context is missing: ${error.message}`);
  }
  if (!evaluation.matched) throw new TypeError(`${label} trusted policy is not applicable to knowledge identity/configuration`);
}

function policyForAttribution(attribution, context, label, usage) {
  const entry = context.rules.get(attribution.ruleId);
  if (!entry || entry.usage !== usage) throw new TypeError(`${label} requires an applicable trusted ${usage} policy`);
  assertRuleApplicable(entry, context, label);
  return entry;
}

function validateClaim(value, label, context) {
  exactKeys(value, ['id', 'fieldId', 'applicability', 'normalized', 'attribution'], label);
  const id = safeId(value.id, `${label} id`);
  const fieldId = text(value.fieldId, `${label} fieldId`);
  const field = getFitV4Field(context.fieldMap, fieldId);
  const applicability = validateApplicability(value.applicability, `${label} applicability`);
  if (!field.applicability.categories.includes(context.identity.category)
    && !['not_applicable', 'unknown', 'prohibited'].includes(applicability.state)) {
    throw new TypeError(`${label} field is not applicable to category`);
  }
  const normalized = validateNormalized(context.fieldMap, fieldId, value.normalized, applicability, label);
  const attribution = validateAttribution(value.attribution, label);
  if (attribution.kind === 'receipt') {
    const receipt = context.receipts.get(attribution.receiptId);
    if (!receipt) throw new TypeError(`${label} receipt attribution is not referenced`);
    if (receipt.fieldId !== fieldId || !same(receipt.applicability, applicability) || !same(receipt.normalized, normalized)) {
      throw new TypeError(`${label} receipt claim drift`);
    }
    context.usedReceipts.add(receipt.receiptId);
  } else {
    const entry = policyForAttribution(attribution, context, label, 'claim');
    const rule = entry.content;
    if (rule.fieldId !== fieldId || !same(rule.applicability, applicability) || !same(rule.normalized, normalized)) {
      throw new TypeError(`${label} trusted policy claim drift`);
    }
    if (normalized.value !== null && entry.policyClass !== 'normative_requirement') {
      throw new TypeError(`${label} concrete value requires a trusted normative requirement or receipt`);
    }
    if (normalized.value !== null && MODEL_PHYSICAL_PREFIXES.some((prefix) => fieldId.startsWith(prefix))) {
      throw new TypeError(`${label} model-specific physical value requires an exact usable receipt`);
    }
  }
  return freezeDeep({ id, fieldId, applicability, normalized, attribution });
}

function validateCollection(values, label, context, compatible) {
  const ids = new Set();
  return requiredArray(values, label).map((value, index) => {
    const claim = validateClaim(value, `${label}[${index}]`, context);
    if (ids.has(claim.id)) throw new TypeError(`${label} duplicate claim ID: ${claim.id}`);
    ids.add(claim.id);
    const field = getFitV4Field(context.fieldMap, claim.fieldId);
    if (!compatible(claim, field)) throw new TypeError(`${label} claim ${claim.id} has incompatible field or value type`);
    return claim;
  });
}

function componentCompatible(claim) {
  const prefixes = {
    body: ['envelope.body.'], door: ['envelope.door.'], handle: ['envelope.handle.'],
    feet: ['envelope.adjusted.'], trim: ['envelope.trim.'], panel: ['envelope.panel.', 'dishwasher.panel.'],
  }[claim.component] ?? [];
  return prefixes.some((prefix) => claim.fieldId.startsWith(prefix));
}

function validateComponentExtents(values, context) {
  const ids = new Set();
  const fields = new Set();
  const components = new Set();
  const accepted = requiredArray(values, 'componentExtents').map((value, index) => {
    exactKeys(value, ['id', 'component', 'fieldId', 'applicability', 'normalized', 'attribution'], `componentExtents[${index}]`);
    if (!COMPONENT_KINDS.has(value.component)) throw new TypeError(`componentExtents[${index}] component invalid`);
    const { component, ...claimInput } = value;
    const claim = validateClaim(claimInput, `componentExtents[${index}]`, context);
    if (!componentCompatible({ ...claim, component })) throw new TypeError(`componentExtents claim ${claim.id} has incompatible component field`);
    if (ids.has(claim.id)) throw new TypeError(`componentExtents duplicate claim ID: ${claim.id}`);
    const fieldKey = `${component}\0${claim.fieldId}`;
    if (fields.has(fieldKey)) throw new TypeError(`duplicate component field: ${component} ${claim.fieldId}`);
    ids.add(claim.id);
    fields.add(fieldKey);
    components.add(component);
    return freezeDeep({ ...claim, component });
  });
  if (components.size !== COMPONENT_KINDS.size || [...COMPONENT_KINDS].some((kind) => !components.has(kind))) {
    throw new TypeError('componentExtents must explicitly cover body, door, handle, feet, trim and panel');
  }
  return accepted;
}

function validateReference(value, expectedType, label, context) {
  exactKeys(value, ['id', 'type', 'fieldIds', 'attribution'], label);
  const id = safeId(value.id, `${label} id`);
  if (value.type !== expectedType) throw new TypeError(`${label} type must be ${expectedType}`);
  const fieldIds = requiredArray(value.fieldIds, `${label} fieldIds`).map((fieldId) => {
    getFitV4Field(context.fieldMap, fieldId);
    return fieldId;
  });
  if (new Set(fieldIds).size !== fieldIds.length) throw new TypeError(`${label} duplicate field ID`);
  const trusted = context.references.get(id);
  if (!trusted || trusted.type !== expectedType || !same(trusted.fieldIds, fieldIds)) {
    throw new TypeError(`${label} reference is unknown or unbound in trusted registry`);
  }
  const attribution = validateAttribution(value.attribution, label);
  if (attribution.kind === 'receipt') {
    const receipt = context.receipts.get(attribution.receiptId);
    if (!receipt || !fieldIds.includes(receipt.fieldId)) throw new TypeError(`${label} receipt reference mismatch`);
    context.usedReceipts.add(receipt.receiptId);
  } else {
    const entry = policyForAttribution(attribution, context, label, 'claim');
    if (!fieldIds.includes(entry.content.fieldId)) throw new TypeError(`${label} policy reference mismatch`);
  }
  return freezeDeep({ id, type: expectedType, fieldIds, attribution });
}

function validateConfigurationValues(fieldMap, state, input) {
  if (!isPlainObject(input)) throw new TypeError('configuration values object required');
  const values = canonical(input);
  if (state === 'unknown' && Object.keys(values).length !== 0) throw new TypeError('unknown selector state requires empty configuration values');
  if (state === 'selected' && Object.keys(values).length === 0) throw new TypeError('selected configuration requires explicit values');
  for (const [name, selected] of Object.entries(values)) {
    if (!fieldMap.configurationVariables.includes(name)) throw new TypeError(`unknown configuration variable: ${name}`);
    if (selected === 'unknown') throw new TypeError(`selected configuration value cannot be unknown: ${name}`);
    const domain = fieldMap.selectorDomains[name];
    if (domain && (!domain.includes(selected) || selected === 'unknown')) {
      throw new TypeError(`selected configuration value is unknown or outside Task 1 domain: ${name}`);
    }
    if (!domain && !(typeof selected === 'number' && Number.isFinite(selected)) && typeof selected !== 'string') {
      throw new TypeError(`configuration value type invalid: ${name}`);
    }
  }
  return values;
}

function validateCoordinateConfiguration(value, context) {
  exactKeys(value, ['coordinateFrameId', 'configurationId', 'selectorState', 'values', 'attribution'], 'coordinateConfiguration');
  const coordinateFrameId = text(value.coordinateFrameId, 'coordinate frame ID');
  if (!context.fieldMap.coordinateFrames.some((frame) => frame.id === coordinateFrameId)) throw new TypeError('coordinate frame is not declared by Fit V4');
  const configurationId = safeId(value.configurationId, 'configuration ID');
  if (!SELECTOR_STATES.has(value.selectorState)) throw new TypeError('configuration selector state invalid');
  const values = validateConfigurationValues(context.fieldMap, value.selectorState, value.values);
  const attribution = validateAttribution(value.attribution, 'coordinateConfiguration');
  if (attribution.kind !== 'policy_rule') throw new TypeError('coordinate configuration requires trusted configuration policy, not an unrelated receipt');
  const configuration = { coordinateFrameId, configurationId, selectorState: value.selectorState, values, attribution };
  context.configuration = configuration;
  policyForAttribution(attribution, context, 'coordinateConfiguration', 'configuration');
  return freezeDeep(configuration);
}

export function validateInstallationKnowledgeV4(value, options = {}) {
  exactKeys(value, TOP_LEVEL_KEYS, 'Installation Knowledge V4');
  if (value.schemaVersion !== INSTALLATION_KNOWLEDGE_V4_SCHEMA_VERSION) throw new TypeError('Installation Knowledge V4 schemaVersion 1 required');
  const fieldMap = validateFitV4FieldMap(options.fieldMap);
  const asOf = instant(options.asOf, 'knowledge asOf');
  exactKeys(value.identity, ['canonicalProductId', 'category', 'brand', 'model', 'market'], 'knowledge identity');
  const identity = {
    canonicalProductId: text(value.identity.canonicalProductId, 'canonical product ID'),
    category: text(value.identity.category, 'category'), brand: text(value.identity.brand, 'brand'),
    model: text(value.identity.model, 'model'), market: text(value.identity.market, 'market'),
  };
  if (!CATEGORIES.has(identity.category)) throw new TypeError(`unsupported installation category: ${identity.category}`);
  if (identity.market !== 'AU') throw new TypeError('Installation Knowledge V4 market must be AU');
  const trusted = validateTrustedPolicyBundle(fieldMap, options.trustedPolicyBundle);
  const rules = bindInlineRules(fieldMap, value.normativeRules, trusted);
  const references = validateTrustedReferenceRegistry(options.trustedReferenceRegistry);
  const receipts = receiptIndex(fieldMap, options.receiptBundle, value.receiptRefs, identity, options, asOf);
  const context = { fieldMap, identity, rules, references, receipts, usedReceipts: new Set(), configuration: null };
  const coordinateConfiguration = validateCoordinateConfiguration(value.coordinateConfiguration, context);
  const componentExtents = validateComponentExtents(value.componentExtents, context);
  const referenceList = (rows, type, label) => {
    const ids = new Set();
    return requiredArray(rows, label).map((row, index) => {
      const accepted = validateReference(row, type, `${label}[${index}]`, context);
      if (ids.has(accepted.id)) throw new TypeError(`${label} duplicate reference ID`);
      ids.add(accepted.id);
      return accepted;
    });
  };
  const accepted = {
    schemaVersion: 1, identity, coordinateConfiguration, componentExtents,
    adjustmentDomains: validateCollection(value.adjustmentDomains, 'adjustmentDomains', context,
      (claim, field) => (claim.fieldId.startsWith('envelope.adjusted.') || claim.fieldId.startsWith('dishwasher.panel.') || claim.fieldId.startsWith('dishwasher.toeKick.'))
        && ['closed_range', 'finite_number'].includes(field.value.type)),
    relationRefs: referenceList(value.relationRefs, 'relation', 'relationRefs'),
    compositionRefs: referenceList(value.compositionRefs, 'composition', 'compositionRefs'),
    operationGeometry: validateCollection(value.operationGeometry, 'operationGeometry', context,
      (claim, field) => claim.fieldId.startsWith('operation.') && GEOMETRY_TYPES.has(field.value.type)),
    services: validateCollection(value.services, 'services', context,
      (claim) => ['ventilation.', 'water.', 'power.', 'drain.', 'dishwasher.serviceHole.', 'dryer.duct.', 'dryer.condensate.'].some((prefix) => claim.fieldId.startsWith(prefix))),
    environmentSupport: validateCollection(value.environmentSupport, 'environmentSupport', context,
      (claim) => ['environment.', 'cabinet.support.', 'stability.'].some((prefix) => claim.fieldId.startsWith(prefix))),
    normativeRules: [...rules.values()].map((entry) => entry.content),
    receiptRefs: [...receipts.keys()],
  };
  for (const receiptId of receipts.keys()) {
    if (!context.usedReceipts.has(receiptId)) throw new TypeError(`unused receipt reference: ${receiptId}`);
  }
  return freezeDeep(canonical(accepted));
}

export function createInstallationKnowledgeV4(input, options = {}) {
  return validateInstallationKnowledgeV4(input, options);
}
