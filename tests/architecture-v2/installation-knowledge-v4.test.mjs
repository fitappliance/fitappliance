import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { createFitV4Receipt, createFitV4ReceiptBundle } from '../../src/domain/installation-evidence-receipt-v4.mjs';
import { createInstallationKnowledgeV4, validateInstallationKnowledgeV4 } from '../../src/domain/installation-knowledge-v4.mjs';
import { createInstallationKnowledge, createModelRequirement } from '../../src/domain/installation-knowledge-v3.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => sha256(JSON.stringify(canonical(value)));
const FIELD_MAP = validateFitV4FieldMap(JSON.parse(await readFile(
  new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url), 'utf8',
)));
const NOW = '2026-08-08T00:00:00.000Z';
const NULL_NORMALIZED = Object.freeze({ value: null, unit: null, relation: null, endpoints: null });
const UNKNOWN = Object.freeze({ state: 'unknown', predicate: null });
const NOT_APPLICABLE = Object.freeze({ state: 'not_applicable', predicate: null });

function identity(category = 'refrigerator', model = 'X100') {
  const canonicalProductId = `product-${category}-${model.toLowerCase()}`;
  const binding = {
    schemaVersion: 1, bindingId: `exact-${canonicalProductId}`, canonicalProductId,
    category, brand: 'Example', model, market: 'AU', outcome: 'exact',
    fragmentSha256: sha256(`identity:${model}`),
  };
  return {
    canonicalProductId, category, brand: 'Example', model, market: 'AU',
    identityMapSha256: '1'.repeat(64), applicableModels: [model],
    exactBinding: { ...binding, bindingSha256: semanticHash(binding) },
  };
}

const RECEIPT_FIELDS = Object.freeze({
  width: { fieldId: 'envelope.closed.width', dictionaryFieldId: 'closedEnvelope.widthMm', value: 600 },
  height: { fieldId: 'envelope.closed.height', dictionaryFieldId: 'closedEnvelope.heightMm', value: 1800 },
});

function exactReceipt({ category = 'refrigerator', model = 'X100', kind = 'width', observedAt = '2026-08-07T00:00:00.000Z' } = {}) {
  const spec = RECEIPT_FIELDS[kind];
  const productIdentity = identity(category, model);
  const fragmentText = `Closed ${kind} ${spec.value} mm`;
  const sourceId = `${category}-${kind}-guide`;
  return createFitV4Receipt({
    identity: productIdentity,
    fieldId: spec.fieldId,
    applicability: { state: 'required', predicate: null },
    original: { value: spec.value, unit: 'mm' },
    normalized: { value: spec.value, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' } },
    source: {
      providerId: 'example-manufacturer', sourceId, url: 'https://example.invalid/install.pdf',
      bytesSha256: sha256('pdf'), contentSha256: sha256(fragmentText), fragmentSha256: sha256(fragmentText),
      fragmentText, locator: { kind: 'pdf_bbox', page: 2, bbox: [1, 2, 3, 4] },
      authority: { sourceType: 'manufacturer_installation_guide', organization: 'Example' },
      jurisdiction: 'AU', language: 'en-AU', documentRevision: 'REV-A', observedAt, retrievedAt: observedAt,
    },
    versions: { parser: 'mineru-v2', policy: 'fit-policy-v4.0.0', fieldMap: FIELD_MAP.version },
    rights: {
      decisions: ['cache_source', 'cache_normalized_fields', 'retain_audit_copy'].map((actionId) => ({
        providerId: 'example-manufacturer', sourceId, fieldId: spec.dictionaryFieldId,
        actionId, decision: 'granted', conditions: [], evidenceSha256: sha256('rights grant'),
      })),
    },
    lifecycle: { status: 'active', transition: 'assertion', targetReceiptId: null, reason: null, changedAt: null },
  }, { fieldMap: FIELD_MAP });
}

function policy(ruleId, fieldId, applicability, normalized, category) {
  return {
    ruleId, authority: 'fit_policy_v4', fieldId, applicability, normalized,
    when: { op: 'eq', path: 'product.category', value: category },
  };
}

function policyClaim(id, rule) {
  return {
    id, fieldId: rule.fieldId, applicability: rule.applicability,
    normalized: rule.normalized, attribution: { kind: 'policy_rule', ruleId: rule.ruleId },
  };
}

function componentClaim(component, rule, id = component) {
  return { ...policyClaim(id, rule), component };
}

function trustedPolicyBundle(rules, configurationRuleId = 'rule-configuration', policyClassOverrides = {}) {
  const entries = rules.map((content) => ({
    ruleId: content.ruleId,
    usage: content.ruleId === configurationRuleId ? 'configuration' : 'claim',
    policyClass: policyClassOverrides[content.ruleId]
      ?? (content.applicability.state === 'required' || content.applicability.state === 'prohibited'
        ? 'normative_requirement' : 'knowledge_state'),
    content,
    semanticSha256: semanticHash(content),
  }));
  const payload = { schemaVersion: 1, bundleId: 'trusted-fit-policy-v4-test', rules: entries };
  return { ...payload, bundleSha256: semanticHash(payload) };
}

function trustedReferenceRegistry(knowledge) {
  const references = [...knowledge.relationRefs, ...knowledge.compositionRefs].map((reference) => {
    const content = {
      id: reference.id,
      type: reference.type,
      fieldIds: reference.fieldIds,
      operator: reference.type === 'relation'
        ? FIELD_MAP.fields.find((field) => field.id === reference.fieldIds[0]).permittedRelations[0]
        : 'MAX',
    };
    return { ...content, semanticSha256: semanticHash(content) };
  });
  const payload = { schemaVersion: 1, registryId: 'trusted-fit-reference-v4-test', references };
  return { ...payload, registrySha256: semanticHash(payload) };
}

function fixture({ category = 'refrigerator', model = 'X100', observedAt } = {}) {
  const receipt = exactReceipt({ category, model, observedAt });
  const rules = [
    policy('rule-body', 'envelope.body.width', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-door', 'envelope.door.closedDepth', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-handle', 'envelope.handle.depth', NOT_APPLICABLE, NULL_NORMALIZED, category),
    policy('rule-feet', 'envelope.adjusted.heightRange', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-trim', 'envelope.trim.extent', NOT_APPLICABLE, NULL_NORMALIZED, category),
    policy('rule-panel', 'envelope.panel.extent', NOT_APPLICABLE, NULL_NORMALIZED, category),
    policy('rule-adjustment', 'envelope.adjusted.heightRange', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-operation', 'operation.component.removalZone', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-service', 'power.socket.prohibitedZone', UNKNOWN, NULL_NORMALIZED, category),
    policy('rule-environment', 'environment.location.prohibited', { state: 'prohibited', predicate: null }, {
      value: ['outdoor'], unit: null, relation: 'NOT_MEMBER_OF', endpoints: null,
    }, category),
    policy('rule-configuration', 'envelope.body.width', UNKNOWN, NULL_NORMALIZED, category),
  ];
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]));
  const knowledge = {
    schemaVersion: 1,
    identity: { canonicalProductId: receipt.identity.canonicalProductId, category, brand: 'Example', model, market: 'AU' },
    coordinateConfiguration: {
      coordinateFrameId: 'installed_appliance', configurationId: `configuration-${category}`,
      selectorState: 'unknown', values: {}, attribution: { kind: 'policy_rule', ruleId: 'rule-configuration' },
    },
    componentExtents: [
      componentClaim('body', byId.get('rule-body')), componentClaim('door', byId.get('rule-door')),
      componentClaim('handle', byId.get('rule-handle')), componentClaim('feet', byId.get('rule-feet')),
      componentClaim('trim', byId.get('rule-trim')), componentClaim('panel', byId.get('rule-panel')),
    ],
    adjustmentDomains: [policyClaim('height', byId.get('rule-adjustment'))],
    relationRefs: [{
      id: 'closed-width', type: 'relation', fieldIds: ['envelope.closed.width'],
      attribution: { kind: 'receipt', receiptId: receipt.receiptId },
    }],
    compositionRefs: [{
      id: 'body-width-composition', type: 'composition', fieldIds: ['envelope.body.width'],
      attribution: { kind: 'policy_rule', ruleId: 'rule-body' },
    }],
    operationGeometry: [policyClaim('removal-zone', byId.get('rule-operation'))],
    services: [policyClaim('socket-zone', byId.get('rule-service'))],
    environmentSupport: [policyClaim('location', byId.get('rule-environment'))],
    normativeRules: rules,
    receiptRefs: [receipt.receiptId],
  };
  return {
    knowledge,
    receipt,
    options: {
      fieldMap: FIELD_MAP,
      receiptBundle: createFitV4ReceiptBundle([receipt], { fieldMap: FIELD_MAP }),
      trustedPolicyBundle: trustedPolicyBundle(rules),
      trustedReferenceRegistry: trustedReferenceRegistry(knowledge),
      asOf: NOW,
    },
  };
}

function replaceRule(base, replacement, registryOptions = {}) {
  const normativeRules = base.knowledge.normativeRules.map((rule) => rule.ruleId === replacement.ruleId ? replacement : rule);
  return {
    knowledge: { ...base.knowledge, normativeRules },
    options: { ...base.options, trustedPolicyBundle: trustedPolicyBundle(normativeRules, 'rule-configuration', registryOptions) },
  };
}

test('trusted policy and reference registries preserve four categories plus unknown/not-applicable/prohibited', () => {
  for (const category of ['refrigerator', 'dishwasher', 'washing_machine', 'dryer']) {
    const base = fixture({ category });
    const accepted = createInstallationKnowledgeV4(base.knowledge, base.options);
    assert.equal(accepted.identity.category, category);
    assert.equal(accepted.componentExtents.find((claim) => claim.id === 'body').applicability.state, 'unknown');
    assert.equal(accepted.componentExtents.find((claim) => claim.id === 'panel').applicability.state, 'not_applicable');
    assert.equal(accepted.environmentSupport[0].applicability.state, 'prohibited');
  }
});

test('missing, duplicate, unknown and unbound trusted policy entries fail closed', () => {
  const base = fixture();
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, { ...base.options, trustedPolicyBundle: undefined }), /trusted policy|bundle/i);
  const duplicateRules = [...base.options.trustedPolicyBundle.rules, base.options.trustedPolicyBundle.rules[0]];
  const duplicatePayload = { schemaVersion: 1, bundleId: 'duplicate', rules: duplicateRules };
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, {
    ...base.options, trustedPolicyBundle: { ...duplicatePayload, bundleSha256: semanticHash(duplicatePayload) },
  }), /duplicate|policy/i);
  assert.throws(() => validateInstallationKnowledgeV4({ ...base.knowledge, normativeRules: base.knowledge.normativeRules.slice(1) }, base.options), /unbound|normative|rule|trusted|policy/i);
});

test('tampered trusted policy hash or content is rejected', () => {
  const base = fixture();
  const changed = structuredClone(base.options.trustedPolicyBundle);
  changed.rules[0].content.when.value = 'dishwasher';
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, { ...base.options, trustedPolicyBundle: changed }), /hash|content|bundle/i);
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, {
    ...base.options, trustedPolicyBundle: { ...base.options.trustedPolicyBundle, bundleSha256: 'f'.repeat(64) },
  }), /hash|bundle/i);
});

test('policy applicability must match identity and cannot depend on an unknown selector for a concrete claim', () => {
  const base = fixture({ category: 'dishwasher' });
  const mismatched = base.knowledge.normativeRules.map((rule) => ({ ...rule, when: { ...rule.when, value: 'refrigerator' } }));
  assert.throws(() => validateInstallationKnowledgeV4({ ...base.knowledge, normativeRules: mismatched }, {
    ...base.options, trustedPolicyBundle: trustedPolicyBundle(mismatched),
  }), /applicable|category|rule/i);

  const refrigerator = fixture();
  const environment = refrigerator.knowledge.normativeRules.find((rule) => rule.ruleId === 'rule-environment');
  const selectorRule = { ...environment, when: { op: 'eq', path: 'configuration.installationMode', value: 'recessed' } };
  const changed = replaceRule(refrigerator, selectorRule, { 'rule-environment': 'normative_requirement' });
  assert.throws(() => validateInstallationKnowledgeV4(changed.knowledge, changed.options), /missing context|selector|applicable/i);
});

test('trusted policy cannot fabricate concrete model physical values', () => {
  const base = fixture();
  const concrete = policy('rule-body', 'envelope.body.width', { state: 'required', predicate: null }, {
    value: 600, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' },
  }, 'refrigerator');
  const changed = replaceRule(base, concrete, { 'rule-body': 'normative_requirement' });
  changed.knowledge.componentExtents = changed.knowledge.componentExtents.map((claim) => claim.id === 'body'
    ? componentClaim('body', concrete)
    : claim);
  assert.throws(() => validateInstallationKnowledgeV4(changed.knowledge, changed.options), /receipt|model-specific|physical/i);
});

test('trusted policy cannot fabricate model clearance, ventilation or service values', () => {
  const base = fixture();
  const concrete = policy('rule-service', 'ventilation.rear.minimum', { state: 'required', predicate: null }, {
    value: 50, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' },
  }, 'refrigerator');
  const changed = replaceRule(base, concrete, { 'rule-service': 'normative_requirement' });
  changed.knowledge.services = [policyClaim('rear-ventilation', concrete)];
  assert.throws(() => validateInstallationKnowledgeV4(changed.knowledge, changed.options), /receipt|model-specific|physical/i);
});

test('component extents support multiple independently attributed axes per component', () => {
  const base = fixture();
  const height = policy('rule-body-height', 'envelope.body.height', UNKNOWN, NULL_NORMALIZED, 'refrigerator');
  const rules = [...base.knowledge.normativeRules, height];
  const knowledge = {
    ...base.knowledge,
    normativeRules: rules,
    componentExtents: [...base.knowledge.componentExtents, componentClaim('body', height, 'body-height')],
  };
  const accepted = validateInstallationKnowledgeV4(knowledge, {
    ...base.options,
    trustedPolicyBundle: trustedPolicyBundle(rules),
  });
  assert.equal(accepted.componentExtents.filter((claim) => claim.component === 'body').length, 2);
  const duplicateField = {
    ...knowledge,
    componentExtents: [...knowledge.componentExtents, componentClaim('body', rules[0], 'body-width-duplicate')],
  };
  assert.throws(() => validateInstallationKnowledgeV4(duplicateField, {
    ...base.options,
    trustedPolicyBundle: trustedPolicyBundle(rules),
  }), /duplicate.*component|component.*field/i);
});

test('a shared trusted policy bundle may contain rules not used by one product', () => {
  const base = fixture();
  const otherCategoryRule = policy(
    'dishwasher-unused-rule', 'envelope.body.width', UNKNOWN, NULL_NORMALIZED, 'dishwasher',
  );
  assert.doesNotThrow(() => validateInstallationKnowledgeV4(base.knowledge, {
    ...base.options,
    trustedPolicyBundle: trustedPolicyBundle([...base.knowledge.normativeRules, otherCategoryRule]),
  }));
});

test('collections enforce semantic field and value-type compatibility', () => {
  const base = fixture();
  const serviceRule = base.knowledge.normativeRules.find((rule) => rule.ruleId === 'rule-service');
  const incompatible = {
    ...base.knowledge,
    componentExtents: base.knowledge.componentExtents.map((claim) => claim.id === 'body'
      ? componentClaim('body', serviceRule)
      : claim),
  };
  assert.throws(() => validateInstallationKnowledgeV4(incompatible, base.options), /component|body|compatible/i);

  const doorRule = base.knowledge.normativeRules.find((rule) => rule.ruleId === 'rule-door');
  const changedOperation = { ...base.knowledge, operationGeometry: [policyClaim('removal-zone', doorRule)] };
  assert.throws(() => validateInstallationKnowledgeV4(changedOperation, base.options), /operation|geometry|value type/i);
});

test('relation and composition references require exact hash-bound trusted registry entries', () => {
  const base = fixture();
  const arbitrary = { ...base.knowledge, relationRefs: [{ ...base.knowledge.relationRefs[0], id: 'arbitrary-relation' }] };
  assert.throws(() => validateInstallationKnowledgeV4(arbitrary, base.options), /reference|registry|unknown/i);
  const tampered = structuredClone(base.options.trustedReferenceRegistry);
  tampered.references[0].fieldIds = ['envelope.closed.height'];
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, { ...base.options, trustedReferenceRegistry: tampered }), /hash|reference|registry/i);
  const invalidOperator = structuredClone(base.options.trustedReferenceRegistry);
  invalidOperator.references[0].operator = 'EXECUTE_ARBITRARY';
  const payload = {
    schemaVersion: invalidOperator.schemaVersion,
    registryId: invalidOperator.registryId,
    references: invalidOperator.references,
  };
  invalidOperator.references[0].semanticSha256 = semanticHash({
    id: invalidOperator.references[0].id,
    type: invalidOperator.references[0].type,
    fieldIds: invalidOperator.references[0].fieldIds,
    operator: invalidOperator.references[0].operator,
  });
  invalidOperator.registrySha256 = semanticHash(payload);
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, {
    ...base.options, trustedReferenceRegistry: invalidOperator,
  }), /operator|relation|reference/i);
});

test('coordinate configuration requires applicable configuration policy and exact selected domains', () => {
  const base = fixture();
  assert.throws(() => validateInstallationKnowledgeV4({
    ...base.knowledge,
    coordinateConfiguration: { ...base.knowledge.coordinateConfiguration, attribution: { kind: 'receipt', receiptId: base.receipt.receiptId } },
  }, base.options), /configuration.*policy|unrelated receipt/i);
  assert.throws(() => validateInstallationKnowledgeV4({
    ...base.knowledge,
    coordinateConfiguration: { ...base.knowledge.coordinateConfiguration, values: { installationMode: 'recessed' } },
  }, base.options), /unknown.*empty|selector/i);
  for (const installationMode of ['unknown', 'not-a-mode']) {
    assert.throws(() => validateInstallationKnowledgeV4({
      ...base.knowledge,
      coordinateConfiguration: {
        ...base.knowledge.coordinateConfiguration, selectorState: 'selected', values: { installationMode },
      },
    }, base.options), /unknown|domain|configuration/i);
  }
});

test('nested negative physical ranges and connector sizes are rejected while negative coordinates remain valid', () => {
  const base = fixture();
  const negativeRange = policy('rule-service', 'water.connection.pressureRange', { state: 'required', predicate: null }, {
    value: { minimum: -1, maximum: 10 }, unit: 'kPa', relation: 'WITHIN_RANGE',
    endpoints: { minimum: 'closed', maximum: 'closed' },
  }, 'refrigerator');
  const changed = replaceRule(base, negativeRange, { 'rule-service': 'normative_requirement' });
  changed.knowledge.services = [policyClaim('pressure', negativeRange)];
  assert.throws(() => validateInstallationKnowledgeV4(changed.knowledge, changed.options), /negative|non-negative|range/i);

  const negativeConnector = policy('rule-service', 'water.connection.fitting', { state: 'required', predicate: null }, {
    value: { type: 'g3/4', size: -1 }, unit: null, relation: 'EXACT_MATCH', endpoints: null,
  }, 'refrigerator');
  const connectorChanged = replaceRule(base, negativeConnector, { 'rule-service': 'normative_requirement' });
  connectorChanged.knowledge.services = [policyClaim('water-fitting', negativeConnector)];
  assert.throws(() => validateInstallationKnowledgeV4(connectorChanged.knowledge, connectorChanged.options), /connector|negative|non-negative/i);

  const withNegativeCoordinates = structuredClone(base);
  const operationRule = policy('rule-operation', 'operation.component.removalZone', { state: 'required', predicate: null }, {
    value: { min: [-10, -10, 0], max: [10, 10, 20] }, unit: 'mm', relation: 'NO_INTERSECTION', endpoints: null,
  }, 'refrigerator');
  const receiptAttribution = { kind: 'receipt', receiptId: base.receipt.receiptId };
  // The geometry is structurally valid, but the unrelated width receipt must still fail before coordinates are blamed.
  withNegativeCoordinates.knowledge.operationGeometry = [{ ...policyClaim('removal-zone', operationRule), attribution: receiptAttribution }];
  assert.throws(() => validateInstallationKnowledgeV4(withNegativeCoordinates.knowledge, withNegativeCoordinates.options), /receipt.*drift|field/i);
});

test('asOf is mandatory; future and unused receipts are rejected', () => {
  const base = fixture();
  assert.throws(() => validateInstallationKnowledgeV4(base.knowledge, { ...base.options, asOf: undefined }), /asOf|required/i);
  const future = fixture({ observedAt: '2026-08-09T00:00:00.000Z' });
  assert.throws(() => validateInstallationKnowledgeV4(future.knowledge, future.options), /future|after asOf/i);
  const unused = exactReceipt({ kind: 'height' });
  const bundle = createFitV4ReceiptBundle([base.receipt, unused], { fieldMap: FIELD_MAP });
  assert.throws(() => validateInstallationKnowledgeV4({ ...base.knowledge, receiptRefs: [...base.knowledge.receiptRefs, unused.receiptId] }, {
    ...base.options, receiptBundle: bundle,
  }), /unused receipt/i);
});

test('Task 4 correction does not mutate V3 knowledge or requirements', () => {
  const evidence = {
    sourceUrl: 'https://example.invalid/x100.pdf', artifactSha256: 'a'.repeat(64),
    receiptBindingSha256: 'b'.repeat(64), fragmentSha256: 'c'.repeat(64), locator: { page: 1 },
    quote: 'width 600 mm', applicableModels: ['X100'], identityOutcome: 'exact', sourceStatus: 'current', observedAt: NOW,
  };
  const requirement = createModelRequirement({ field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', evidence, targetModel: 'X100' });
  const v3 = createInstallationKnowledge({
    canonicalProductId: 'v3-x100', category: 'fridge', brand: 'Example', model: 'X100',
    requirements: { 'closedEnvelope.widthMm': requirement },
  });
  const before = JSON.stringify(v3);
  const base = fixture();
  validateInstallationKnowledgeV4(base.knowledge, base.options);
  assert.equal(JSON.stringify(v3), before);
  assert.equal(v3.requirements['closedEnvelope.widthMm'], requirement);
});
