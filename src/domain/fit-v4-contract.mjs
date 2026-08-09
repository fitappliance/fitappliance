import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rightsDictionary = require('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json');

export const FIT_V4_FIELD_MAP_VERSION = 'fit-v4-field-map-1.2.0';

const CATEGORIES = new Set(['refrigerator', 'dishwasher', 'washing_machine', 'dryer']);
const RELATIONS = new Set([
  'MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE', 'CONTAINS', 'REQUIRED_CONTAINS',
  'PROHIBITED_ZONE', 'NO_INTERSECTION', 'EXACT_MATCH', 'REQUIRES_TRUE',
  'NOT_MEMBER_OF', 'SET_CONTAINS',
]);
const LEGACY_V3_RELATIONS = new Set([
  'MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE', 'CONTAINS',
  'PROHIBITED_ZONE', 'NO_INTERSECTION',
]);
const VALUE_TYPES = new Set([
  'finite_number', 'integer', 'boolean', 'string', 'enum', 'enum_set', 'connector',
  'closed_range', 'box3', 'polygon2', 'route3', 'sweep3',
]);
const FIT_CLASSES = new Set([
  'hard_placement', 'hard_operation', 'hard_service', 'hard_environment',
  'hard_professional', 'hard_delivery', 'advisory',
]);
const RELATIONS_BY_VALUE_TYPE = Object.freeze({
  finite_number: new Set(['MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE']),
  integer: new Set(['MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE']),
  closed_range: new Set(['WITHIN_RANGE', 'CONTAINS']),
  boolean: new Set(['REQUIRES_TRUE']),
  string: new Set(['EXACT_MATCH']),
  enum: new Set(['EXACT_MATCH']),
  connector: new Set(['EXACT_MATCH']),
  enum_set: new Set(['NOT_MEMBER_OF', 'SET_CONTAINS']),
  box3: new Set(['CONTAINS', 'REQUIRED_CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
  polygon2: new Set(['CONTAINS', 'REQUIRED_CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
  route3: new Set(['CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
  sweep3: new Set(['CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
});
const UNSAFE_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const SHA256 = /^[a-f0-9]{64}$/;

const APPROVED_EXACT_RIGHTS = new Map([
  ['envelope.closed.width', 'closedEnvelope.widthMm'],
  ['envelope.closed.height', 'closedEnvelope.heightMm'],
  ['envelope.closed.depth', 'closedEnvelope.depthMm'],
  ['envelope.adjusted.heightRange', 'adjustableRange.heightMm'],
  ['installation.clearance.leftMin', 'installationClearance.leftMm'],
  ['installation.clearance.rightMin', 'installationClearance.rightMm'],
  ['installation.clearance.topMin', 'installationClearance.topMm'],
  ['installation.clearance.rearMin', 'installationClearance.rearMm'],
  ['operation.door.openDepth', 'operationEnvelope.depthMm'],
  ['operation.lid.openHeight', 'operationEnvelope.heightMm'],
  ['ventilation.left.minimum', 'ventilation.leftMm'],
  ['ventilation.right.minimum', 'ventilation.rightMm'],
  ['ventilation.top.minimum', 'ventilation.topMm'],
  ['ventilation.rear.minimum', 'ventilation.rearMm'],
  ['ventilation.openArea.minimum', 'ventilation.openAreaMm2'],
  ['power.connection.currentMinimum', 'powerConnection.currentA'],
  ['drain.connection.heightRange', 'drainConnection.heightRangeMm'],
  ['delivery.package.width', 'packagedEnvelope.widthMm'],
  ['delivery.package.height', 'packagedEnvelope.heightMm'],
  ['delivery.package.depth', 'packagedEnvelope.depthMm'],
]);

const dictionaryFields = new Map(rightsDictionary.fields.map((field) => [field.id, field]));
const dictionaryActions = new Set(rightsDictionary.rights.actions.map((action) => action.id));

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} array required`);
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function assertSafeName(value, label) {
  const name = requiredText(value, label);
  if (UNSAFE_NAMES.has(name) || name.split('.').some((segment) => UNSAFE_NAMES.has(segment))) {
    throw new TypeError(`${label} contains unsafe prototype or constructor path`);
  }
  return name;
}

function uniqueArray(value, label) {
  const items = requiredArray(value, label);
  const signatures = items.map((item) => JSON.stringify(item));
  if (new Set(signatures).size !== signatures.length) throw new TypeError(`${label} contains duplicate values`);
  return items;
}

function validateRights(field) {
  const rights = field.rights;
  if (!rights || !['EXACT', 'UNMAPPED_BLOCKED'].includes(rights.mappingStatus)) {
    throw new TypeError(`rights mapping status required for ${field.id}`);
  }
  if (rights.mappingStatus === 'UNMAPPED_BLOCKED') {
    if (rights.dictionaryFieldId !== null || !Array.isArray(rights.requiredActions)
      || rights.requiredActions.length !== 0 || Object.hasOwn(rights, 'compatibility')) {
      throw new TypeError(`UNMAPPED_BLOCKED rights contract invalid for ${field.id}`);
    }
    if (APPROVED_EXACT_RIGHTS.has(field.id)) throw new TypeError(`approved EXACT rights mapping omitted for ${field.id}`);
    return canonical(rights);
  }
  const approvedDictionaryId = APPROVED_EXACT_RIGHTS.get(field.id);
  if (!approvedDictionaryId || rights.dictionaryFieldId !== approvedDictionaryId) {
    throw new TypeError(`incompatible or unapproved EXACT rights mapping for ${field.id}`);
  }
  const dictionaryField = dictionaryFields.get(approvedDictionaryId);
  const expectedCompatibility = {
    unit: dictionaryField.unit ?? null,
    valueShape: dictionaryField.valueShape,
    scope: dictionaryField.scope,
  };
  if (JSON.stringify(canonical(rights.compatibility)) !== JSON.stringify(canonical(expectedCompatibility))) {
    throw new TypeError(`EXACT rights compatibility drift for ${field.id}`);
  }
  const canonicalValueShape = {
    finite_number: 'scalar',
    closed_range: 'range',
  }[field.value.type];
  if (canonicalValueShape !== dictionaryField.valueShape
    || (field.value.unit ?? null) !== (dictionaryField.unit ?? null)) {
    throw new TypeError(`EXACT rights unit or value-shape incompatibility for ${field.id}`);
  }
  const actions = uniqueArray(rights.requiredActions, `rights actions for ${field.id}`);
  if (actions.length === 0 || actions.some((action) => !dictionaryActions.has(action))) {
    throw new TypeError(`rights action is not in the rights dictionary for ${field.id}`);
  }
  return canonical(rights);
}

function validateField(field, contract) {
  const id = assertSafeName(field?.id, 'field ID');
  if (!/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/.test(id)) throw new TypeError(`field ID invalid: ${id}`);
  if (!VALUE_TYPES.has(field?.value?.type) || !Object.hasOwn(field?.value ?? {}, 'unit')) {
    throw new TypeError(`field value type/unit invalid: ${id}`);
  }
  const frameId = assertSafeName(field?.coordinateFrame?.id, `coordinate frame for ${id}`);
  if (!contract.coordinateFrameIds.has(frameId)) throw new TypeError(`coordinate frame invalid for ${id}`);
  const relations = uniqueArray(field.permittedRelations, `permitted relations for ${id}`);
  if (relations.length === 0 || relations.some((relation) => !RELATIONS.has(relation))) {
    throw new TypeError(`permitted relations invalid for ${id}`);
  }
  if (relations.some((relation) => !RELATIONS_BY_VALUE_TYPE[field.value.type].has(relation))) {
    throw new TypeError(`permitted relation is incompatible with value type for ${id}`);
  }
  const categories = uniqueArray(field?.applicability?.categories, `applicability categories for ${id}`);
  if (categories.length === 0 || categories.some((category) => !CATEGORIES.has(category))) {
    throw new TypeError(`applicability categories invalid for ${id}`);
  }
  uniqueArray(field.applicability.formFactors, `form factors for ${id}`);
  if (field.applicability.unknownPolicy !== 'PRESERVE_UNKNOWN_BLOCK_VERIFICATION') {
    throw new TypeError(`unknown policy invalid for ${id}`);
  }
  if (!FIT_CLASSES.has(field.fitClass)) throw new TypeError(`Fit class invalid for ${id}`);
  for (const selector of uniqueArray(field.selectorDomains, `selector domains for ${id}`)) {
    assertSafeName(selector, `selector domain for ${id}`);
    if (!Object.hasOwn(contract.selectorDomains, selector)) throw new TypeError(`selector domain unknown for ${id}: ${selector}`);
  }
  for (const variable of uniqueArray(field.configurationVariables, `configuration variables for ${id}`)) {
    assertSafeName(variable, `configuration variable for ${id}`);
    if (!contract.configurationVariables.includes(variable)) throw new TypeError(`configuration variable unknown for ${id}: ${variable}`);
  }
  for (const path of uniqueArray(field.contextPaths, `context paths for ${id}`)) {
    assertSafeName(path, `context path for ${id}`);
    if (!contract.allowedContextPaths.includes(path)) throw new TypeError(`context path unknown for ${id}: ${path}`);
  }
  if (field.v3Mapping) {
    const mappingKeys = ['fieldId', 'unit', 'relation', 'targetRelation', 'coordinateFrameId', 'scope'];
    if (JSON.stringify(Object.keys(field.v3Mapping).sort()) !== JSON.stringify([...mappingKeys].sort())) {
      throw new TypeError(`V3 mapping key set invalid for ${id}`);
    }
    for (const key of mappingKeys) {
      requiredText(field.v3Mapping[key], `V3 mapping ${key} for ${id}`);
    }
    if (!LEGACY_V3_RELATIONS.has(field.v3Mapping.relation)
      || !relations.includes(field.v3Mapping.targetRelation)
      || field.v3Mapping.coordinateFrameId !== frameId) {
      throw new TypeError(`V3 mapping is not structurally lossless for ${id}`);
    }
    if (field.v3Mapping.fieldId.startsWith('closedEnvelope.') && !id.startsWith('envelope.closed.')) {
      throw new TypeError(`V3 product_closed mapping cannot target body geometry: ${id}`);
    }
  }
  return canonical({ ...field, rights: validateRights(field) });
}

export function validateFitV4FieldMap(value) {
  if (!value || value.schemaVersion !== 1 || value.version !== FIT_V4_FIELD_MAP_VERSION) {
    throw new TypeError(`Fit V4 field map ${FIT_V4_FIELD_MAP_VERSION} required`);
  }
  const coordinateFrames = uniqueArray(value.coordinateFrames, 'coordinate frames');
  const coordinateFrameIds = new Set();
  for (const frame of coordinateFrames) {
    const id = assertSafeName(frame?.id, 'coordinate frame ID');
    if (coordinateFrameIds.has(id)) throw new TypeError(`duplicate coordinate frame: ${id}`);
    coordinateFrameIds.add(id);
  }
  const allowedContextPaths = uniqueArray(value.allowedContextPaths, 'allowed context paths');
  for (const path of allowedContextPaths) assertSafeName(path, 'allowed context path');
  const configurationVariables = uniqueArray(value.configurationVariables, 'configuration variables');
  for (const variable of configurationVariables) assertSafeName(variable, 'configuration variable');
  if (!value.selectorDomains || typeof value.selectorDomains !== 'object' || Array.isArray(value.selectorDomains)) {
    throw new TypeError('selector domains object required');
  }
  for (const [name, domain] of Object.entries(value.selectorDomains)) {
    assertSafeName(name, 'selector domain name');
    const values = uniqueArray(domain, `selector domain ${name}`);
    if (values.length === 0) throw new TypeError(`selector domain ${name} cannot be empty`);
    for (const item of values) if (typeof item === 'string') assertSafeName(item, `selector domain ${name} value`);
  }
  const contract = {
    ...value, coordinateFrames, coordinateFrameIds, allowedContextPaths, configurationVariables,
  };
  const fields = requiredArray(value.fields, 'fields').map((field) => validateField(field, contract));
  const fieldIds = new Set();
  for (const field of fields) {
    if (fieldIds.has(field.id)) throw new TypeError(`duplicate field ID: ${field.id}`);
    fieldIds.add(field.id);
  }
  const hardFields = fields
    .filter((field) => field.fitClass.startsWith('hard_'))
    .flatMap((field) => field.applicability.categories.map((category) => ({ category, fieldId: field.id })))
    .sort((left, right) => `${left.category}\0${left.fieldId}`.localeCompare(`${right.category}\0${right.fieldId}`));
  if (Object.hasOwn(value, 'hardFields')
    && JSON.stringify(value.hardFields) !== JSON.stringify(hardFields)) {
    throw new TypeError('provided hardFields drift from exhaustive derived definitions');
  }
  const coveredCategories = [...new Set(hardFields.map((row) => row.category))].sort();
  if (JSON.stringify(coveredCategories) !== JSON.stringify([...CATEGORIES].sort())) {
    throw new TypeError('hard field definitions must cover all four categories including dryer');
  }
  const { coordinateFrameIds: ignored, ...result } = { ...contract, fields, hardFields };
  return freezeDeep(canonical(result));
}

export function assertFitV4ContextPath(fieldMap, path) {
  const accepted = validateFitV4FieldMap(fieldMap);
  assertSafeName(path, 'Fit V4 context path');
  if (!accepted.allowedContextPaths.includes(path)) throw new TypeError(`Fit V4 context path is not allowlisted: ${String(path)}`);
  return path;
}

export function getFitV4Field(fieldMap, fieldId) {
  const accepted = validateFitV4FieldMap(fieldMap);
  const field = accepted.fields.find((row) => row.id === fieldId);
  if (!field) throw new TypeError(`unknown Fit V4 field: ${String(fieldId)}`);
  return field;
}

export function mapV3FieldToV4(fieldMap, input) {
  const accepted = validateFitV4FieldMap(fieldMap);
  const candidates = accepted.fields.filter((field) => field.v3Mapping?.fieldId === input?.fieldId);
  if (candidates.length !== 1) throw new TypeError(`V3 field has no lossless V4 mapping: ${String(input?.fieldId)}`);
  const field = candidates[0];
  for (const key of ['unit', 'relation', 'coordinateFrameId', 'scope']) {
    if (input[key] !== field.v3Mapping[key]) throw new TypeError(`V3 mapping is lossy: ${key} mismatch for ${input.fieldId}`);
  }
  if (typeof input.value === 'number' && !Number.isFinite(input.value)) throw new TypeError('V3 mapping value must be finite');
  return freezeDeep({
    fieldId: field.id,
    value: input.value,
    unit: input.unit,
    relation: field.v3Mapping.targetRelation,
    sourceFieldId: input.fieldId,
    sourceRelation: input.relation,
  });
}

export function assertSha256(value, label) {
  if (!SHA256.test(String(value ?? ''))) throw new TypeError(`${label} SHA-256 invalid`);
  return value;
}
