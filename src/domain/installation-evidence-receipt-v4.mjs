import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { assertSha256, getFitV4Field, mapV3FieldToV4 } from './fit-v4-contract.mjs';
import { validateInstallationFieldReceipt } from './installation-evidence-pipeline.mjs';

const require = createRequire(import.meta.url);
const rightsDictionary = require('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json');

export const FIT_V4_RECEIPT_SCHEMA_VERSION = 1;
export const FIT_V4_RECEIPT_BUNDLE_SCHEMA_VERSION = 1;

const RECEIPT_ID = /^fit_v4_receipt_[a-f0-9]{24}$/;
const MODEL_SOURCE_TYPES = new Set([
  'manufacturer_installation_guide', 'manufacturer_cad', 'manufacturer_product_page', 'licensed_product_data',
]);
const APPLICABILITY = new Set(['required', 'conditional', 'not_applicable', 'prohibited']);
const ENDPOINTS = new Set(['open', 'closed']);
const DICTIONARY_ACTIONS = new Set(rightsDictionary.rights.actions.map((action) => action.id));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNSAFE_IDS = new Set(['__proto__', 'prototype', 'constructor']);
const RECEIPT_KEYS = [
  'schemaVersion', 'identity', 'fieldId', 'applicability', 'original', 'normalized',
  'source', 'versions', 'rights', 'lifecycle', 'receiptId', 'receiptSha256',
];
const ADAPTER_KEYS = [
  'schemaVersion', 'adapterType', 'originalV3ReceiptId', 'originalV3SemanticReceiptSha256',
  'originalV3ReceiptSha256', 'originalV3ReceiptBytesBase64', 'v3FieldId', 'v4FieldId',
  'value', 'unit', 'adapterSemanticSha256',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} canonical JSON number must be finite`);
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${label} canonical JSON array hole rejected`);
    }
    return value.map((item, index) => canonical(item, `${label}[${index}]`));
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} canonical JSON plain object required`);
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
  }
  throw new TypeError(`${label} canonical JSON value invalid`);
}

function semanticHash(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} key set invalid`);
  }
  return value;
}

function safeId(value, label) {
  const id = text(value, label);
  if (!SAFE_ID.test(id) || id.split(/[.:]/).some((part) => UNSAFE_IDS.has(part))) {
    throw new TypeError(`${label} safe ID required`);
  }
  return id;
}

function instant(value, label) {
  const date = new Date(text(value, label));
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${label} invalid`);
  return date.toISOString();
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function point(value, dimensions, label) {
  if (!Array.isArray(value) || value.length !== dimensions) throw new TypeError(`${label} point invalid`);
  return value.map((coordinate) => finite(coordinate, `${label} coordinate`));
}

function box3(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} box invalid`);
  const minimum = point(value.min, 3, `${label} min`);
  const maximum = point(value.max, 3, `${label} max`);
  if (minimum.some((coordinate, index) => coordinate > maximum[index])) throw new TypeError(`${label} box bounds invalid`);
  return { min: minimum, max: maximum };
}

function route3(value, label) {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError(`${label} route requires at least two points`);
  return value.map((item) => point(item, 3, label));
}

function normalizedTypedValue(type, value, label) {
  switch (type) {
    case 'finite_number': return finite(value, label);
    case 'integer':
      if (!Number.isInteger(value)) throw new TypeError(`${label} integer required`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') throw new TypeError(`${label} boolean required`);
      return value;
    case 'string':
    case 'enum': return text(value, `${label} enum or string`);
    case 'enum_set': {
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
        throw new TypeError(`${label} enum set invalid`);
      }
      if (new Set(value).size !== value.length) throw new TypeError(`${label} enum set duplicate`);
      return [...value];
    }
    case 'connector': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} connector invalid`);
      const result = { type: text(value.type, `${label} connector type`) };
      if (Object.hasOwn(value, 'size')) result.size = finite(value.size, `${label} connector size`);
      return result;
    }
    case 'closed_range': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} range invalid`);
      const minimum = finite(value.minimum, `${label} range minimum`);
      const maximum = finite(value.maximum, `${label} range maximum`);
      if (minimum > maximum) throw new TypeError(`${label} range inverted`);
      return { minimum, maximum };
    }
    case 'box3': return box3(value, label);
    case 'polygon2':
      if (!Array.isArray(value) || value.length < 3) throw new TypeError(`${label} polygon invalid`);
      return value.map((item) => point(item, 2, label));
    case 'route3': return route3(value, label);
    case 'sweep3':
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} sweep invalid`);
      return { path: route3(value.path, `${label} sweep path`), envelope: box3(value.envelope, `${label} sweep envelope`) };
    default: throw new TypeError(`${label} value type unsupported`);
  }
}

function normalizedEndpoints(field, relation, endpoints) {
  if (field.value.type === 'closed_range') {
    if (!endpoints || !ENDPOINTS.has(endpoints.minimum) || !ENDPOINTS.has(endpoints.maximum)
      || Object.keys(endpoints).length !== 2) throw new TypeError('normalized range endpoint semantics invalid');
    return { minimum: endpoints.minimum, maximum: endpoints.maximum };
  }
  if (['MIN_REQUIRED', 'MAX_ALLOWED'].includes(relation)) {
    if (!endpoints || !ENDPOINTS.has(endpoints.boundary) || Object.keys(endpoints).length !== 1) {
      throw new TypeError('normalized boundary endpoint semantics invalid');
    }
    return { boundary: endpoints.boundary };
  }
  if (endpoints !== null) throw new TypeError('normalized endpoint semantics must be null for this relation');
  return null;
}

export function validateFitV4NormalizedValue(fieldMap, fieldId, normalized, applicability) {
  const field = getFitV4Field(fieldMap, fieldId);
  if (!APPLICABILITY.has(applicability?.state)) throw new TypeError('receipt applicability invalid');
  if (!normalized || !Object.hasOwn(normalized, 'value') || !Object.hasOwn(normalized, 'unit')
    || !Object.hasOwn(normalized, 'relation') || !Object.hasOwn(normalized, 'endpoints')) {
    throw new TypeError('normalized value, unit, relation and endpoints required');
  }
  if (applicability.state === 'not_applicable') {
    if (normalized.value !== null || normalized.unit !== null || normalized.relation !== null || normalized.endpoints !== null) {
      throw new TypeError('not-applicable evidence cannot coerce null into a value claim');
    }
    return freezeDeep({ value: null, unit: null, relation: null, endpoints: null });
  }
  if (normalized.unit !== field.value.unit) throw new TypeError('normalized unit conflicts with field map');
  if (!field.permittedRelations.includes(normalized.relation)) throw new TypeError('normalized relation conflicts with field map');
  return freezeDeep(canonical({
    value: normalizedTypedValue(field.value.type, normalized.value, `normalized ${field.id}`),
    unit: normalized.unit,
    relation: normalized.relation,
    endpoints: normalizedEndpoints(field, normalized.relation, normalized.endpoints),
  }));
}

function exactIdentity(identity, field) {
  if (!identity || typeof identity !== 'object') throw new TypeError('exact model identity required');
  for (const key of ['canonicalProductId', 'category', 'brand', 'model', 'market']) text(identity[key], `identity ${key}`);
  if (identity.market !== 'AU') throw new TypeError('exact AU identity market required');
  assertSha256(identity.identityMapSha256, 'identity map');
  if (!field.applicability.categories.includes(identity.category)) throw new TypeError('field does not apply to receipt category');
  if (!Array.isArray(identity.applicableModels) || identity.applicableModels.length !== 1
    || identity.applicableModels[0].trim().toUpperCase() !== identity.model.trim().toUpperCase()) {
    throw new TypeError('cross-model receipt rejected; exact model identity required');
  }
  const binding = identity.exactBinding;
  if (!binding || binding.schemaVersion !== 1 || binding.outcome !== 'exact'
    || binding.canonicalProductId !== identity.canonicalProductId
    || binding.category !== identity.category || binding.brand !== identity.brand
    || binding.model !== identity.model || binding.market !== identity.market) {
    throw new TypeError('exact receipt-bound identity binding required');
  }
  text(binding.bindingId, 'identity binding ID');
  assertSha256(binding.fragmentSha256, 'identity binding fragment');
  const { bindingSha256, ...bindingPayload } = binding;
  if (bindingSha256 !== semanticHash(bindingPayload)) throw new TypeError('exact identity binding hash drift');
  return canonical(identity);
}

function normalizedLifecycle(value) {
  if (!value || typeof value !== 'object') throw new TypeError('receipt lifecycle required');
  const transition = value.transition;
  if (!['assertion', 'supersession', 'withdrawal'].includes(transition)) throw new TypeError('receipt lifecycle transition invalid');
  if (transition === 'assertion') {
    if (value.status !== 'active' || value.targetReceiptId !== null || value.reason !== null || value.changedAt !== null) {
      throw new TypeError('assertion lifecycle contract invalid');
    }
    return { status: 'active', transition, targetReceiptId: null, reason: null, changedAt: null };
  }
  if ((transition === 'supersession' && value.status !== 'active')
    || (transition === 'withdrawal' && value.status !== 'withdrawal')) {
    throw new TypeError(`${transition} lifecycle status invalid`);
  }
  if (!RECEIPT_ID.test(String(value.targetReceiptId ?? ''))) throw new TypeError(`${transition} target receipt required`);
  return {
    status: value.status,
    transition,
    targetReceiptId: value.targetReceiptId,
    reason: text(value.reason, `${transition} reason`),
    changedAt: instant(value.changedAt, `${transition} changedAt`),
  };
}

function validateSource(source, field, applicability) {
  if (!source || typeof source !== 'object') throw new TypeError('receipt source required');
  for (const key of ['bytesSha256', 'contentSha256', 'fragmentSha256']) assertSha256(source[key], `source ${key}`);
  safeId(source.providerId, 'source providerId');
  safeId(source.sourceId, 'source sourceId');
  text(source.url, 'source URL');
  text(source.jurisdiction, 'source jurisdiction');
  text(source.language, 'source language');
  text(source.documentRevision, 'document revision');
  const fragmentText = text(source.fragmentText, 'source fragment text');
  if (sha256(fragmentText) !== source.fragmentSha256) throw new TypeError('source fragment text hash drift');
  if (applicability.state === 'not_applicable'
    && !/\b(?:not applicable|not required|does not apply|prohibited)\b/i.test(fragmentText)) {
    throw new TypeError('not-applicable receipt requires explicit negative evidence');
  }
  if (!source.locator || typeof source.locator !== 'object' || !text(source.locator.kind, 'source locator kind')) {
    throw new TypeError('source locator required');
  }
  const locatorSha256 = semanticHash(source.locator);
  if (source.locatorSha256 !== undefined && source.locatorSha256 !== locatorSha256) throw new TypeError('source locator hash drift');
  const sourceType = text(source.authority?.sourceType, 'source authority type');
  text(source.authority?.organization, 'source authority organization');
  if (!MODEL_SOURCE_TYPES.has(sourceType) || !field.authority.permittedSourceTypes.includes(sourceType)) {
    throw new TypeError(`source model authority is insufficient for ${field.id}`);
  }
  return canonical({
    ...source,
    locatorSha256,
    observedAt: instant(source.observedAt, 'source observedAt'),
    retrievedAt: instant(source.retrievedAt, 'source retrievedAt'),
  });
}

function validateRights(rights, field, source) {
  if (field.rights.mappingStatus === 'UNMAPPED_BLOCKED') {
    throw new TypeError(`UNMAPPED_BLOCKED field requires a future exact rights dictionary entry: ${field.id}`);
  }
  exactKeys(rights, ['decisions'], 'receipt rights');
  if (!Array.isArray(rights.decisions)) throw new TypeError('receipt rights decisions required');
  const required = field.rights.requiredActions;
  if (rights.decisions.length !== required.length) throw new TypeError('exactly one rights decision per required action required');
  const seen = new Set();
  const decisions = rights.decisions.map((decision) => {
    exactKeys(decision, [
      'providerId', 'sourceId', 'fieldId', 'actionId', 'decision', 'conditions', 'evidenceSha256',
    ], 'rights decision');
    safeId(decision.providerId, 'rights providerId');
    safeId(decision.sourceId, 'rights sourceId');
    safeId(decision.actionId, 'rights actionId');
    if (decision.providerId !== source.providerId || decision.sourceId !== source.sourceId
      || decision.fieldId !== field.rights.dictionaryFieldId) {
      throw new TypeError('rights provider/source/field binding mismatch');
    }
    if (!DICTIONARY_ACTIONS.has(decision.actionId) || !required.includes(decision.actionId)) {
      throw new TypeError('rights action is unrelated or absent from dictionary field requirements');
    }
    if (seen.has(decision.actionId)) throw new TypeError('duplicate rights action decision');
    seen.add(decision.actionId);
    if (!['granted', 'granted_with_conditions'].includes(decision.decision)) {
      throw new TypeError('rights decision must be granted or granted_with_conditions');
    }
    if (!Array.isArray(decision.conditions)
      || decision.conditions.some((condition) => typeof condition !== 'string' || !condition.trim())) {
      throw new TypeError('rights conditions must be non-empty strings');
    }
    if (decision.decision === 'granted' && decision.conditions.length !== 0) {
      throw new TypeError('granted rights decision requires empty conditions');
    }
    if (decision.decision === 'granted_with_conditions' && decision.conditions.length === 0) {
      throw new TypeError('granted_with_conditions requires explicit conditions');
    }
    assertSha256(decision.evidenceSha256, 'rights evidence');
    return canonical(decision, 'rights decision');
  });
  if (required.some((action) => !seen.has(action))) throw new TypeError('missing required rights action decision');
  return canonical({ decisions }, 'receipt rights');
}

export function createFitV4Receipt(input, { fieldMap } = {}) {
  if (!input || typeof input !== 'object') throw new TypeError('Fit V4 receipt input required');
  canonical(input, 'receipt input');
  const field = getFitV4Field(fieldMap, input.fieldId);
  if (field.rights.mappingStatus === 'UNMAPPED_BLOCKED') return validateRights(input.rights, field, input.source);
  const applicability = input.applicability;
  if (!APPLICABILITY.has(applicability?.state)) throw new TypeError('receipt applicability invalid');
  if (applicability.state === 'conditional' && !applicability.predicate) throw new TypeError('conditional applicability predicate required');
  if (!input.original || !Object.hasOwn(input.original, 'value') || !Object.hasOwn(input.original, 'unit')) {
    throw new TypeError('original value and unit required');
  }
  if (applicability.state === 'not_applicable' && (input.original.value !== null || input.original.unit !== null)) {
    throw new TypeError('not-applicable original value and unit must remain null');
  }
  const versions = input.versions;
  for (const key of ['parser', 'policy', 'fieldMap']) text(versions?.[key], `${key} version`);
  if (versions.fieldMap !== fieldMap.version) throw new TypeError('receipt field-map version mismatch');
  const source = validateSource(input.source, field, applicability);
  const payload = canonical({
    schemaVersion: FIT_V4_RECEIPT_SCHEMA_VERSION,
    identity: exactIdentity(input.identity, field),
    fieldId: field.id,
    applicability: canonical(applicability),
    original: canonical(input.original),
    normalized: validateFitV4NormalizedValue(fieldMap, field.id, input.normalized, applicability),
    source,
    versions: canonical(versions),
    rights: validateRights(input.rights, field, source),
    lifecycle: normalizedLifecycle(input.lifecycle),
  });
  const receiptSha256 = semanticHash(payload);
  return freezeDeep({ ...payload, receiptId: `fit_v4_receipt_${receiptSha256.slice(0, 24)}`, receiptSha256 });
}

export function validateFitV4Receipt(value, { fieldMap } = {}) {
  if (!value || value.schemaVersion !== FIT_V4_RECEIPT_SCHEMA_VERSION) throw new TypeError('Fit V4 receipt schema required');
  exactKeys(value, RECEIPT_KEYS, 'Fit V4 receipt schema');
  const rebuilt = createFitV4Receipt(value, { fieldMap });
  if (value.receiptId !== rebuilt.receiptId || value.receiptSha256 !== rebuilt.receiptSha256) {
    throw new TypeError('Fit V4 receipt immutable binding invalid');
  }
  return rebuilt;
}

function claimKey(receipt) {
  return `${receipt.identity.canonicalProductId}\0${receipt.fieldId}`;
}

function claimValue(receipt) {
  return JSON.stringify(canonical({ applicability: receipt.applicability, normalized: receipt.normalized }));
}

export function validateFitV4ReceiptLifecycleTransitions(rows) {
  if (!Array.isArray(rows)) throw new TypeError('receipt lifecycle transition rows required');
  const byId = new Map(rows.map((row) => [row.receiptId, row]));
  if (byId.size !== rows.length) throw new TypeError('duplicate lifecycle receipt ID');
  const targeted = new Map();
  for (const row of rows) {
    if (row.transition === 'assertion') continue;
    const target = byId.get(row.targetReceiptId);
    if (!target) throw new TypeError(`lifecycle target missing: ${row.targetReceiptId}`);
    if (target.claimKey !== row.claimKey) throw new TypeError('lifecycle target crosses product or field identity');
    const prior = targeted.get(row.targetReceiptId);
    if (prior) throw new TypeError(`lifecycle fork or supersession/withdrawal ambiguity for ${row.targetReceiptId}`);
    targeted.set(row.targetReceiptId, row);
  }
  for (const start of rows) {
    const seen = new Set();
    let current = start;
    while (current?.targetReceiptId) {
      if (seen.has(current.receiptId)) throw new TypeError('receipt lifecycle cycle detected');
      seen.add(current.receiptId);
      current = byId.get(current.targetReceiptId);
    }
  }
  return freezeDeep({ targeted });
}

export function createFitV4ReceiptBundle(receipts, { fieldMap } = {}) {
  if (!Array.isArray(receipts) || !fieldMap) throw new TypeError('validated receipt array and field map required');
  const byId = new Map();
  for (const value of receipts) {
    const receipt = validateFitV4Receipt(value, { fieldMap });
    const prior = byId.get(receipt.receiptId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(receipt)) throw new TypeError('duplicate receipt ID conflict');
    byId.set(receipt.receiptId, receipt);
  }
  const accepted = [...byId.values()].sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const lifecycle = validateFitV4ReceiptLifecycleTransitions(accepted.map((receipt) => ({
    receiptId: receipt.receiptId,
    claimKey: claimKey(receipt),
    transition: receipt.lifecycle.transition,
    targetReceiptId: receipt.lifecycle.targetReceiptId,
  })));
  const deactivated = new Set(lifecycle.targeted.keys());
  const active = accepted.filter((receipt) => receipt.lifecycle.status === 'active' && !deactivated.has(receipt.receiptId));
  const groups = new Map();
  for (const receipt of active) {
    const rows = groups.get(claimKey(receipt)) ?? [];
    rows.push(receipt);
    groups.set(claimKey(receipt), rows);
  }
  const conflicts = [...groups.entries()].flatMap(([key, rows]) => {
    if (new Set(rows.map(claimValue)).size <= 1) return [];
    const [canonicalProductId, fieldId] = key.split('\0');
    return [{ canonicalProductId, fieldId, receiptIds: rows.map((row) => row.receiptId).sort() }];
  }).sort((left, right) => `${left.canonicalProductId}\0${left.fieldId}`.localeCompare(`${right.canonicalProductId}\0${right.fieldId}`));
  const semantic = { schemaVersion: FIT_V4_RECEIPT_BUNDLE_SCHEMA_VERSION, receipts: accepted, conflicts };
  return freezeDeep({ ...semantic, bundleSha256: semanticHash(semantic) });
}

export function appendFitV4ReceiptBundle(bundle, receipts, { fieldMap } = {}) {
  const current = createFitV4ReceiptBundle(bundle?.receipts, { fieldMap });
  if (current.bundleSha256 !== bundle.bundleSha256) throw new TypeError('current receipt bundle hash drift');
  return createFitV4ReceiptBundle([...current.receipts, ...receipts], { fieldMap });
}

export function assertFitV4ReceiptUsable(value, { bundle, fieldMap } = {}) {
  const receipt = validateFitV4Receipt(value, { fieldMap });
  const acceptedBundle = createFitV4ReceiptBundle(bundle?.receipts, { fieldMap });
  if (acceptedBundle.bundleSha256 !== bundle.bundleSha256) throw new TypeError('receipt bundle hash drift');
  if (!acceptedBundle.receipts.some((row) => row.receiptId === receipt.receiptId)) throw new TypeError('receipt absent from bundle');
  if (receipt.lifecycle.status === 'withdrawal') throw new Error(`withdrawal record is not a usable claim: ${receipt.receiptId}`);
  const transition = acceptedBundle.receipts.find((row) => row.lifecycle.targetReceiptId === receipt.receiptId);
  if (transition?.lifecycle.transition === 'supersession') throw new Error(`receipt superseded: ${receipt.receiptId}`);
  if (transition?.lifecycle.transition === 'withdrawal') throw new Error(`receipt withdrawn: ${receipt.receiptId}`);
  if (acceptedBundle.conflicts.some((row) => row.receiptIds.includes(receipt.receiptId))) throw new Error(`receipt has active conflict: ${receipt.receiptId}`);
  return receipt;
}

export function replayFitV4Receipt(value, context) {
  const receipt = validateFitV4Receipt(value, { fieldMap: context?.fieldMap });
  assertFitV4ReceiptUsable(receipt, { bundle: context?.bundle, fieldMap: context?.fieldMap });
  if (!Buffer.isBuffer(context.sourceBytes) || sha256(context.sourceBytes) !== receipt.source.bytesSha256) throw new Error('source bytes hash drift');
  if (!Buffer.isBuffer(context.contentBytes) || sha256(context.contentBytes) !== receipt.source.contentSha256) throw new Error('source content hash drift');
  if (!Buffer.isBuffer(context.fragmentBytes) || sha256(context.fragmentBytes) !== receipt.source.fragmentSha256) throw new Error('source fragment hash drift');
  if (!Buffer.isBuffer(context.identityFragmentBytes)
    || sha256(context.identityFragmentBytes) !== receipt.identity.exactBinding.fragmentSha256) throw new Error('identity fragment hash drift');
  if (!context.rightsEvidenceBytes || typeof context.rightsEvidenceBytes !== 'object'
    || Array.isArray(context.rightsEvidenceBytes)) throw new Error('rights evidence bytes required');
  for (const decision of receipt.rights.decisions) {
    const bytes = Object.hasOwn(context.rightsEvidenceBytes, decision.evidenceSha256)
      ? context.rightsEvidenceBytes[decision.evidenceSha256]
      : null;
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== decision.evidenceSha256) {
      throw new Error(`rights evidence hash drift: ${decision.actionId}`);
    }
  }
  return freezeDeep({
    status: 'PASS',
    receiptId: receipt.receiptId,
    replaySha256: semanticHash({
      receiptId: receipt.receiptId,
      receiptSha256: receipt.receiptSha256,
      bundleSha256: context.bundle.bundleSha256,
      bytesSha256: sha256(context.sourceBytes),
      contentSha256: sha256(context.contentBytes),
      fragmentSha256: sha256(context.fragmentBytes),
      identityFragmentSha256: sha256(context.identityFragmentBytes),
      locatorSha256: receipt.source.locatorSha256,
      rightsEvidenceSha256: [...new Set(receipt.rights.decisions.map((decision) => decision.evidenceSha256))].sort(),
    }),
  });
}

export function adaptV3Receipt(bytes, options) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('original V3 receipt bytes required');
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('installation field V3 receipt schema invalid');
  }
  let receipt;
  try {
    receipt = validateInstallationFieldReceipt(parsed);
  } catch (error) {
    throw new TypeError(`installation field V3 receipt schema invalid: ${error.message}`);
  }
  const mapping = mapV3FieldToV4(options.fieldMap, {
    fieldId: receipt.field,
    value: receipt.value,
    unit: receipt.unit,
    relation: options.relation,
    coordinateFrameId: options.coordinateFrameId,
    scope: options.scope,
  });
  const payload = canonical({
    schemaVersion: 1,
    adapterType: 'V3_REFERENCE_ONLY',
    originalV3ReceiptId: receipt.receiptId,
    originalV3SemanticReceiptSha256: receipt.semanticReceiptSha256,
    originalV3ReceiptSha256: sha256(bytes),
    originalV3ReceiptBytesBase64: bytes.toString('base64'),
    v3FieldId: receipt.field,
    v4FieldId: mapping.fieldId,
    value: mapping.value,
    unit: mapping.unit,
  });
  return freezeDeep({ ...payload, adapterSemanticSha256: semanticHash(payload) });
}

export function restoreV3ReceiptBytes(adapter) {
  if (!adapter || adapter.adapterType !== 'V3_REFERENCE_ONLY') throw new TypeError('V3 receipt adapter required');
  exactKeys(adapter, ADAPTER_KEYS, 'V3 receipt adapter');
  const { adapterSemanticSha256, ...payload } = adapter;
  if (adapterSemanticSha256 !== semanticHash(payload)) throw new TypeError('V3 receipt adapter semantic binding drift');
  const bytes = Buffer.from(text(adapter.originalV3ReceiptBytesBase64, 'V3 receipt bytes'), 'base64');
  if (bytes.toString('base64') !== adapter.originalV3ReceiptBytesBase64) throw new TypeError('V3 receipt adapter base64 invalid');
  if (sha256(bytes) !== adapter.originalV3ReceiptSha256) throw new TypeError('V3 receipt byte identity drift');
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('installation field V3 receipt schema invalid');
  }
  let receipt;
  try {
    receipt = validateInstallationFieldReceipt(parsed);
  } catch (error) {
    throw new TypeError(`installation field V3 receipt schema invalid: ${error.message}`);
  }
  if (receipt.receiptId !== adapter.originalV3ReceiptId
    || receipt.semanticReceiptSha256 !== adapter.originalV3SemanticReceiptSha256
    || receipt.field !== adapter.v3FieldId) {
    throw new TypeError('V3 receipt adapter metadata binding drift');
  }
  return bytes;
}
