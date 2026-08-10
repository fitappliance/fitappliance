import { createHash } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { validateActiveRetailReleaseDescriptor } from './active-retail-release.mjs';
import { validateFitV4FieldMap } from './fit-v4-contract.mjs';
import {
  FIT_POLICY_PACKS_V4,
  FIT_POLICY_PACK_SCHEMA_VERSION,
  FIT_POLICY_PACK_VERSION,
  selectFitPolicyPackV4,
  validateFitPolicyPackV4,
} from './fit-policies-v4/index.mjs';
import { createFitV4ReceiptBundle } from './installation-evidence-receipt-v4.mjs';

const require = createRequire(import.meta.url);
const DEFAULT_FIELD_MAP = validateFitV4FieldMap(
  require('../../data/architecture-v2/policies/fit-v4-field-map.json'),
);

export const FIT_V4_READINESS_EPOCH_SCHEMA_VERSION = 1;
export const FIT_V4_READINESS_EPOCH_POLICY_VERSION = 'fit-v4-readiness-epoch-v1';
export const FIT_V4_PUBLICATION_RIGHTS_POLICY_VERSION = 'fit-v4-publication-rights-registry-v1';
export const FIT_V4_SOURCE_REGISTRY_POLICY_VERSION = 'fit-v4-source-registry-v1';

export const FIT_V4_READINESS_PREDECESSOR_ROLES = Object.freeze([
  'active_release_descriptor',
  'retail_catalog',
  'historical_reference',
  'identity_map',
  'field_map',
  'readiness_epoch_schema',
  'policy_pack:refrigerator',
  'policy_pack:dishwasher',
  'policy_pack:washing_machine',
  'policy_pack:dryer',
  'rights_dictionary',
  'receipt_bundle',
  'source_registry',
  'publication_rights_registry',
  'rights_evidence_inventory',
  'producer',
  'materializer',
]);

const POLICY_STATES = Object.freeze([
  'SUPPORTED',
  'POLICY_UNSUPPORTED',
  'FORM_FACTOR_REQUIRED',
  'CONFIGURATION_REQUIRED',
  'CATEGORY_UNSUPPORTED',
]);
const EVIDENCE_STATES = Object.freeze([
  'ACCEPTED',
  'UNKNOWN',
  'CONFLICT',
  'STALE',
  'RIGHTS_BLOCKED',
  'UNSUPPORTED',
]);
const RIGHTS_STATES = Object.freeze([
  'ALLOWED',
  'DENIED',
  'EXPIRED',
  'WITHDRAWN',
  'ATTRIBUTION_UNMET',
  'UNKNOWN',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const POLICY_CATEGORIES = Object.freeze(['refrigerator', 'dishwasher', 'washing_machine', 'dryer']);
const READINESS_SCHEMA_DEFINITION = Object.freeze({
  schemaVersion: FIT_V4_READINESS_EPOCH_SCHEMA_VERSION,
  policyVersion: FIT_V4_READINESS_EPOCH_POLICY_VERSION,
  policyApplicability: POLICY_STATES,
  evidenceReadiness: EVIDENCE_STATES,
  publicationRightsDisposition: RIGHTS_STATES,
});
let defaultPoliciesValidated = false;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function semanticSha256(value) {
  return sha256(canonicalJsonBytes(value));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} object required`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} schema key set invalid`);
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function safeId(value, label) {
  const result = requiredText(value, label);
  if (!SAFE_ID.test(result) || ['__proto__', 'prototype', 'constructor'].includes(result)) {
    throw new TypeError(`${label} safe ID required`);
  }
  return result;
}

function assertSha(value, label) {
  if (!SHA256.test(String(value ?? ''))) throw new TypeError(`${label} SHA-256 invalid`);
  return value;
}

function iso(value, label) {
  const parsed = new Date(requiredText(value, label));
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} ISO timestamp invalid`);
  }
  return value;
}

function same(left, right) {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function parseBoundBytes(binding, label) {
  if (!binding || !Buffer.isBuffer(binding.bytes)) throw new TypeError(`${label} bytes required`);
  let parsed;
  try {
    parsed = JSON.parse(binding.bytes);
  } catch {
    throw new TypeError(`${label} JSON bytes invalid`);
  }
  if (!same(parsed, binding.document)) throw new Error(`${label} document and bytes drift`);
  return parsed;
}

function normalizeCategory(category) {
  return category === 'fridge' ? 'refrigerator' : category;
}

function validatePolicyPacks(fieldMap, policyPacks) {
  try {
    exactKeys(policyPacks, POLICY_CATEGORIES, 'Fit V4 policy packs');
    for (const category of POLICY_CATEGORIES) validateFitPolicyPackV4(fieldMap, policyPacks[category]);
  } catch (error) {
    throw new TypeError(`POLICY_DEFECT: ${error.message}`);
  }
  return policyPacks;
}

export function classifyFitV4PolicyApplicability(product, {
  fieldMap = DEFAULT_FIELD_MAP,
  policyPacks = FIT_POLICY_PACKS_V4,
} = {}) {
  if (fieldMap === DEFAULT_FIELD_MAP && policyPacks === FIT_POLICY_PACKS_V4) {
    if (!defaultPoliciesValidated) {
      validatePolicyPacks(DEFAULT_FIELD_MAP, FIT_POLICY_PACKS_V4);
      defaultPoliciesValidated = true;
    }
    return classifyValidatedPolicyApplicability(product, policyPacks);
  }
  const acceptedFieldMap = validateFitV4FieldMap(fieldMap);
  validatePolicyPacks(acceptedFieldMap, policyPacks);
  return classifyValidatedPolicyApplicability(product, policyPacks);
}

function classifyValidatedPolicyApplicability(product, policyPacks) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new TypeError('catalog product required');
  }
  const category = normalizeCategory(product.cat);
  const formFactor = product.geometry_v2?.formFactor ?? null;
  if (product.cat === 'washtower_combo' || formFactor === 'washtower_combo') {
    return freezeDeep({
      state: 'POLICY_UNSUPPORTED',
      policyCategory: 'washtower_combo',
      formFactor,
      reasonCodes: ['DEDICATED_WASHTOWER_POLICY_REQUIRED'],
      pack: null,
    });
  }
  if (!POLICY_CATEGORIES.includes(category)) {
    return freezeDeep({
      state: 'CATEGORY_UNSUPPORTED',
      policyCategory: category ?? null,
      formFactor,
      reasonCodes: ['CATEGORY_NOT_IN_FIT_V4_POLICY_PACK'],
      pack: null,
    });
  }
  if (!formFactor) {
    return freezeDeep({
      state: 'FORM_FACTOR_REQUIRED',
      policyCategory: category,
      formFactor: null,
      reasonCodes: ['FORM_FACTOR_MISSING'],
      pack: null,
    });
  }
  try {
    const pack = policyPacks[category];
    if (!pack.recognizedFormFactors.includes(formFactor)) {
      return freezeDeep({
        state: 'POLICY_UNSUPPORTED',
        policyCategory: category,
        formFactor,
        reasonCodes: ['FORM_FACTOR_NOT_RECOGNIZED_FOR_CATEGORY'],
        pack: null,
      });
    }
    selectFitPolicyPackV4({ category, formFactor });
    return freezeDeep({
      state: 'SUPPORTED',
      policyCategory: category,
      formFactor,
      reasonCodes: [],
      pack,
    });
  } catch (error) {
    if (/not recognized|dedicated combination policy|unsupported Fit V4 policy category/.test(error.message)) {
      return freezeDeep({
        state: 'POLICY_UNSUPPORTED',
        policyCategory: category,
        formFactor,
        reasonCodes: ['FORM_FACTOR_NOT_RECOGNIZED_FOR_CATEGORY'],
        pack: null,
      });
    }
    throw new TypeError(`POLICY_DEFECT: ${error.message}`);
  }
}

export function createNotMaterializedFitV4SourceRegistry(asOf) {
  return freezeDeep({
    schemaVersion: 1,
    policyVersion: FIT_V4_SOURCE_REGISTRY_POLICY_VERSION,
    status: 'NOT_MATERIALIZED',
    asOf: iso(asOf, 'source registry asOf'),
    sources: [],
  });
}

function validateSourceRegistry(value) {
  exactKeys(value, ['schemaVersion', 'policyVersion', 'status', 'asOf', 'sources'], 'Fit V4 source registry');
  if (value.schemaVersion !== 1 || value.policyVersion !== FIT_V4_SOURCE_REGISTRY_POLICY_VERSION
    || value.status !== 'NOT_MATERIALIZED' || !Array.isArray(value.sources)
    || value.sources.length !== 0) {
    throw new TypeError('typed NOT_MATERIALIZED source registry with zero sources required');
  }
  iso(value.asOf, 'source registry asOf');
  return freezeDeep(canonical(value));
}

function validateRightsDictionary(value) {
  if (!value || value.schemaVersion !== 1 || value.rights?.defaultDecision !== 'unknown_blocked') {
    throw new TypeError('rights dictionary default unknown_blocked required');
  }
  if (!Array.isArray(value.fields) || !Array.isArray(value.rights.actions)
    || !Array.isArray(value.rights.decisionStates)) {
    throw new TypeError('rights dictionary fields and actions required');
  }
  return value;
}

const REGISTRY_KEYS = Object.freeze([
  'schemaVersion',
  'policyVersion',
  'asOf',
  'defaultDisposition',
  'decisions',
  'withdrawals',
  'evidenceInventory',
]);
const DECISION_KEYS = Object.freeze([
  'decisionId',
  'providerId',
  'sourceId',
  'fieldId',
  'dictionaryFieldId',
  'actionId',
  'decision',
  'sourceContentSha256',
  'receiptId',
  'receiptSha256',
  'canonicalProductId',
  'market',
  'brand',
  'model',
  'authorizationEvidenceSha256',
  'validFrom',
  'validUntil',
  'conditions',
  'attribution',
  'predecessorDecisionId',
]);
const WITHDRAWAL_KEYS = Object.freeze([
  'withdrawalId',
  'decisionId',
  'predecessorDecisionId',
  'changedAt',
  'authorizationEvidenceSha256',
]);

function replayAuthorizationEvidence(hash, inventoryByHash, bytesByHash) {
  assertSha(hash, 'authorization evidence');
  const inventory = inventoryByHash.get(hash);
  const bytes = bytesByHash?.[hash];
  if (!inventory || !Buffer.isBuffer(bytes) || sha256(bytes) !== hash
    || bytes.length !== inventory.byteLength) {
    throw new Error('authorization evidence bytes are missing or do not replay');
  }
}

export function validateFitV4PublicationRightsRegistry(value, {
  fieldMap,
  rightsDictionary,
  receiptBundle,
  authorizationEvidenceBytes = {},
  asOf,
} = {}) {
  exactKeys(value, REGISTRY_KEYS, 'Fit V4 publication rights registry');
  if (value.schemaVersion !== 1 || value.policyVersion !== FIT_V4_PUBLICATION_RIGHTS_POLICY_VERSION
    || value.defaultDisposition !== 'UNKNOWN') {
    throw new TypeError('Fit V4 publication rights registry schema v1 required');
  }
  iso(value.asOf, 'publication rights registry asOf');
  if (asOf && value.asOf !== asOf) throw new Error('publication rights registry clock mismatch');
  const acceptedFieldMap = validateFitV4FieldMap(fieldMap);
  const dictionary = validateRightsDictionary(rightsDictionary);
  const acceptedBundle = createFitV4ReceiptBundle(receiptBundle?.receipts, { fieldMap: acceptedFieldMap });
  if (!same(acceptedBundle, receiptBundle)) throw new Error('receipt bundle hash drift');
  if (!Array.isArray(value.decisions) || !Array.isArray(value.withdrawals)
    || !Array.isArray(value.evidenceInventory)) {
    throw new TypeError('publication rights arrays required');
  }
  const inventoryByHash = new Map();
  for (const row of value.evidenceInventory) {
    exactKeys(row, ['evidenceSha256', 'mediaType', 'byteLength'], 'rights evidence inventory row');
    assertSha(row.evidenceSha256, 'rights evidence inventory');
    requiredText(row.mediaType, 'rights evidence media type');
    if (!Number.isSafeInteger(row.byteLength) || row.byteLength <= 0) {
      throw new TypeError('rights evidence byte length must be a positive integer');
    }
    if (inventoryByHash.has(row.evidenceSha256)) throw new TypeError('duplicate rights evidence inventory hash');
    inventoryByHash.set(row.evidenceSha256, row);
  }
  const fields = new Map(acceptedFieldMap.fields.map((field) => [field.id, field]));
  const dictionaryFields = new Set(dictionary.fields.map((field) => field.id));
  const dictionaryActions = new Set(dictionary.rights.actions.map((action) => action.id));
  const receipts = new Map(acceptedBundle.receipts.map((receipt) => [receipt.receiptId, receipt]));
  const decisions = new Map();
  for (const decision of value.decisions) {
    exactKeys(decision, DECISION_KEYS, 'publication rights decision');
    safeId(decision.decisionId, 'publication rights decision ID');
    safeId(decision.providerId, 'publication rights provider ID');
    safeId(decision.sourceId, 'publication rights source ID');
    const field = fields.get(decision.fieldId);
    if (!field || field.rights.mappingStatus !== 'EXACT') {
      throw new TypeError('UNMAPPED_BLOCKED field cannot receive publication rights');
    }
    if (decision.dictionaryFieldId !== field.rights.dictionaryFieldId
      || !dictionaryFields.has(decision.dictionaryFieldId)) {
      throw new TypeError('publication rights dictionary field binding invalid');
    }
    if (!['public_display', 'attribution'].includes(decision.actionId)
      || !dictionaryActions.has(decision.actionId)) {
      throw new TypeError('publication rights action invalid');
    }
    if (!dictionary.rights.decisionStates.includes(decision.decision)) {
      throw new TypeError('publication rights decision state invalid');
    }
    assertSha(decision.sourceContentSha256, 'publication rights source content');
    assertSha(decision.receiptSha256, 'publication rights receipt');
    safeId(decision.receiptId, 'publication rights receipt ID');
    safeId(decision.canonicalProductId, 'publication rights canonical product ID');
    if (decision.market !== 'AU') throw new TypeError('publication rights exact AU scope required');
    requiredText(decision.brand, 'publication rights brand');
    requiredText(decision.model, 'publication rights model');
    iso(decision.validFrom, 'publication rights validFrom');
    iso(decision.validUntil, 'publication rights validUntil');
    if (Date.parse(decision.validUntil) < Date.parse(decision.validFrom)) {
      throw new TypeError('publication rights validity interval invalid');
    }
    if (!Array.isArray(decision.conditions)
      || decision.conditions.some((condition) => typeof condition !== 'string' || !condition.trim())) {
      throw new TypeError('publication rights conditions invalid');
    }
    if (decision.decision === 'granted' && decision.conditions.length !== 0) {
      throw new TypeError('granted publication rights cannot carry unresolved conditions');
    }
    if (decision.decision === 'granted_with_conditions' && decision.conditions.length === 0) {
      throw new TypeError('granted_with_conditions publication rights require explicit conditions');
    }
    exactKeys(decision.attribution, ['required', 'fulfilled', 'evidenceSha256'], 'publication rights attribution');
    if (typeof decision.attribution.required !== 'boolean'
      || typeof decision.attribution.fulfilled !== 'boolean') {
      throw new TypeError('publication rights attribution booleans required');
    }
    if (decision.attribution.evidenceSha256 !== null) {
      replayAuthorizationEvidence(
        decision.attribution.evidenceSha256,
        inventoryByHash,
        authorizationEvidenceBytes,
      );
    }
    if (decision.predecessorDecisionId !== null) safeId(decision.predecessorDecisionId, 'predecessor decision ID');
    if (decision.decision === 'withdrawn' && decision.predecessorDecisionId === null) {
      throw new TypeError('withdrawn publication rights decision requires a predecessor decision');
    }
    replayAuthorizationEvidence(
      decision.authorizationEvidenceSha256,
      inventoryByHash,
      authorizationEvidenceBytes,
    );
    const receipt = receipts.get(decision.receiptId);
    if (!receipt || receipt.receiptSha256 !== decision.receiptSha256
      || receipt.source.providerId !== decision.providerId
      || receipt.source.sourceId !== decision.sourceId
      || receipt.source.contentSha256 !== decision.sourceContentSha256
      || receipt.fieldId !== decision.fieldId
      || receipt.identity.canonicalProductId !== decision.canonicalProductId
      || receipt.identity.market !== decision.market
      || receipt.identity.brand !== decision.brand
      || receipt.identity.model !== decision.model) {
      throw new Error('publication rights exact receipt/model/source binding invalid');
    }
    if (decisions.has(decision.decisionId)) throw new TypeError('duplicate publication rights decision ID');
    decisions.set(decision.decisionId, decision);
  }
  const successorByPredecessor = new Map();
  const sameDecisionScope = (left, right) => [
    'providerId', 'sourceId', 'fieldId', 'dictionaryFieldId', 'actionId',
    'canonicalProductId', 'market', 'brand', 'model',
  ].every((key) => left[key] === right[key]);
  for (const decision of decisions.values()) {
    if (decision.predecessorDecisionId === null) continue;
    if (decision.predecessorDecisionId === decision.decisionId) {
      throw new TypeError('publication rights predecessor cannot reference itself');
    }
    const predecessorDecision = decisions.get(decision.predecessorDecisionId);
    if (!predecessorDecision) throw new TypeError('publication rights predecessor decision is missing');
    if (!sameDecisionScope(decision, predecessorDecision)) {
      throw new TypeError('publication rights predecessor scope mismatch');
    }
    if (Date.parse(decision.validFrom) < Date.parse(predecessorDecision.validFrom)) {
      throw new TypeError('publication rights predecessor time would regress');
    }
    if (successorByPredecessor.has(decision.predecessorDecisionId)) {
      throw new TypeError('publication rights predecessor cannot branch');
    }
    successorByPredecessor.set(decision.predecessorDecisionId, decision.decisionId);
  }
  for (const decision of decisions.values()) {
    const seen = new Set();
    let cursor = decision;
    while (cursor.predecessorDecisionId !== null) {
      if (seen.has(cursor.decisionId)) throw new TypeError('publication rights predecessor cycle rejected');
      seen.add(cursor.decisionId);
      cursor = decisions.get(cursor.predecessorDecisionId);
    }
  }
  const withdrawals = new Set();
  for (const withdrawal of value.withdrawals) {
    exactKeys(withdrawal, WITHDRAWAL_KEYS, 'publication rights withdrawal');
    safeId(withdrawal.withdrawalId, 'publication rights withdrawal ID');
    safeId(withdrawal.decisionId, 'withdrawn decision ID');
    safeId(withdrawal.predecessorDecisionId, 'withdrawal predecessor decision ID');
    if (!decisions.has(withdrawal.decisionId)
      || withdrawal.predecessorDecisionId !== withdrawal.decisionId) {
      throw new TypeError('publication rights withdrawal predecessor binding invalid');
    }
    iso(withdrawal.changedAt, 'publication rights withdrawal timestamp');
    if (Date.parse(withdrawal.changedAt) > Date.parse(value.asOf)) {
      throw new TypeError('publication rights withdrawal occurs after registry clock');
    }
    if (Date.parse(withdrawal.changedAt) < Date.parse(decisions.get(withdrawal.decisionId).validFrom)) {
      throw new TypeError('publication rights withdrawal predates its decision');
    }
    replayAuthorizationEvidence(
      withdrawal.authorizationEvidenceSha256,
      inventoryByHash,
      authorizationEvidenceBytes,
    );
    if (withdrawals.has(withdrawal.decisionId)) throw new TypeError('duplicate publication rights withdrawal');
    withdrawals.add(withdrawal.decisionId);
  }
  return freezeDeep(canonical(value));
}

export function resolveFitV4PublicationRights({
  registry,
  receipt,
  fieldId,
  fieldMap,
  rightsDictionary,
  receiptBundle,
  authorizationEvidenceBytes,
  asOf,
}) {
  const accepted = validateFitV4PublicationRightsRegistry(registry, {
    fieldMap,
    rightsDictionary,
    receiptBundle,
    authorizationEvidenceBytes,
    asOf,
  });
  const field = fieldMap.fields.find((candidate) => candidate.id === fieldId);
  if (!field || field.rights.mappingStatus !== 'EXACT') {
    return freezeDeep({ state: 'UNKNOWN', decisionId: null, reasonCodes: ['FIELD_RIGHTS_UNMAPPED'] });
  }
  const superseded = new Set(accepted.decisions
    .map((decision) => decision.predecessorDecisionId)
    .filter((decisionId) => decisionId !== null));
  const matches = accepted.decisions.filter((decision) => (
    decision.actionId === 'public_display'
      && decision.fieldId === fieldId
      && decision.receiptId === receipt.receiptId
      && decision.receiptSha256 === receipt.receiptSha256
      && decision.canonicalProductId === receipt.identity.canonicalProductId
      && !superseded.has(decision.decisionId)
  ));
  if (matches.length === 0) {
    return freezeDeep({ state: 'UNKNOWN', decisionId: null, reasonCodes: ['PUBLIC_DISPLAY_DECISION_MISSING'] });
  }
  if (matches.length !== 1) throw new TypeError('ambiguous publication rights decisions');
  const decision = matches[0];
  if (accepted.withdrawals.some((withdrawal) => withdrawal.decisionId === decision.decisionId)
    || decision.decision === 'withdrawn') {
    return freezeDeep({ state: 'WITHDRAWN', decisionId: decision.decisionId, reasonCodes: ['PUBLIC_DISPLAY_WITHDRAWN'] });
  }
  if (decision.decision === 'denied') {
    return freezeDeep({ state: 'DENIED', decisionId: decision.decisionId, reasonCodes: ['PUBLIC_DISPLAY_DENIED'] });
  }
  if (decision.decision === 'expired' || Date.parse(decision.validUntil) < Date.parse(asOf)) {
    return freezeDeep({ state: 'EXPIRED', decisionId: decision.decisionId, reasonCodes: ['PUBLIC_DISPLAY_EXPIRED'] });
  }
  if (Date.parse(decision.validFrom) > Date.parse(asOf) || decision.decision === 'unknown') {
    return freezeDeep({ state: 'UNKNOWN', decisionId: decision.decisionId, reasonCodes: ['PUBLIC_DISPLAY_NOT_ACTIVE'] });
  }
  if (decision.attribution.required) {
    const attribution = accepted.decisions.filter((candidate) => (
      candidate.actionId === 'attribution'
        && candidate.providerId === decision.providerId
        && candidate.sourceId === decision.sourceId
        && candidate.fieldId === decision.fieldId
        && candidate.receiptId === decision.receiptId
        && candidate.canonicalProductId === decision.canonicalProductId
    ));
    if (!decision.attribution.fulfilled || attribution.length !== 1
      || !['granted', 'granted_with_conditions'].includes(attribution[0].decision)
      || !attribution[0].attribution.fulfilled
      || Date.parse(attribution[0].validFrom) > Date.parse(asOf)
      || Date.parse(attribution[0].validUntil) < Date.parse(asOf)) {
      return freezeDeep({ state: 'ATTRIBUTION_UNMET', decisionId: decision.decisionId, reasonCodes: ['ATTRIBUTION_NOT_FULFILLED'] });
    }
  }
  if (decision.decision === 'granted_with_conditions') {
    return freezeDeep({ state: 'UNKNOWN', decisionId: decision.decisionId, reasonCodes: ['PUBLIC_DISPLAY_CONDITIONS_UNRESOLVED'] });
  }
  if (decision.decision !== 'granted') {
    throw new TypeError('unhandled publication rights decision state');
  }
  return freezeDeep({ state: 'ALLOWED', decisionId: decision.decisionId, reasonCodes: [] });
}

function validateIdentityMap(binding, activeRelease) {
  const document = parseBoundBytes(binding, 'WP1 identity map');
  if (document.schemaVersion !== 1 || document.policyVersion !== 'fit-v4-universe-reconciliation-v1') {
    throw new TypeError('WP1 identity map schema required');
  }
  const { semanticSha256: declared, ...payload } = document;
  if (semanticSha256(payload) !== declared) throw new Error('WP1 identity map semantic hash drift');
  if (document.releaseBinding?.releaseCandidateId !== activeRelease.descriptor.releaseCandidateId
    || document.releaseBinding?.catalogSha256 !== activeRelease.descriptor.artifacts.publicProjection.sha256
    || document.releaseBinding?.historicalReferenceSha256 !== activeRelease.descriptor.artifacts.historicalReference.sha256) {
    throw new Error('WP1 identity map active release binding invalid');
  }
  if (!Array.isArray(document.catalogRows)) throw new TypeError('WP1 catalog rows required');
  return document;
}

function validateActiveRelease(input) {
  const descriptorDocument = parseBoundBytes({ bytes: input.descriptorBytes, document: input.descriptor }, 'active release descriptor');
  const descriptor = validateActiveRetailReleaseDescriptor(descriptorDocument);
  const catalog = parseBoundBytes({ bytes: input.catalogBytes, document: input.catalog }, 'active catalog');
  const reference = parseBoundBytes({ bytes: input.referenceBytes, document: input.reference }, 'active historical reference');
  if (sha256(input.catalogBytes) !== descriptor.artifacts.publicProjection.sha256) throw new Error('active catalog hash drift');
  if (sha256(input.referenceBytes) !== descriptor.artifacts.historicalReference.sha256) throw new Error('active historical reference hash drift');
  if (!Array.isArray(catalog.products) || !Array.isArray(reference.records)) {
    throw new TypeError('active release catalog and historical reference rows required');
  }
  return { descriptor, descriptorDocument, catalog, reference };
}

function predecessor(order, role, id, bytes, semantic = null) {
  return freezeDeep({
    order,
    role,
    id,
    bytesSha256: assertSha(Buffer.isBuffer(bytes) ? sha256(bytes) : bytes, `${role} bytes`),
    semanticSha256: assertSha(semantic ?? (Buffer.isBuffer(bytes) ? sha256(bytes) : bytes), `${role} semantic`),
  });
}

function currentReceipts(receiptBundle) {
  const deactivated = new Set(receiptBundle.receipts
    .filter((receipt) => receipt.lifecycle.transition !== 'assertion')
    .map((receipt) => receipt.lifecycle.targetReceiptId));
  return receiptBundle.receipts.filter((receipt) => (
    receipt.lifecycle.status === 'active' && !deactivated.has(receipt.receiptId)
  ));
}

function fieldReadinessRows({ product, wp1Row, applicability, receiptBundle, sourceRegistry, registryContext }) {
  if (applicability.state !== 'SUPPORTED') return [];
  const conflicts = new Set(receiptBundle.conflicts.map((row) => `${row.canonicalProductId}\0${row.fieldId}`));
  const active = currentReceipts(receiptBundle);
  return applicability.pack.rules.map((rule) => {
    const field = registryContext.fieldMap.fields.find((candidate) => candidate.id === rule.fieldId);
    const claimKey = `${product.canonicalProductId}\0${field.id}`;
    const receipts = active.filter((receipt) => (
      receipt.identity.canonicalProductId === product.canonicalProductId
        && receipt.identity.model === product.model
        && receipt.identity.market === 'AU'
        && receipt.fieldId === field.id
    ));
    let evidenceState = 'UNKNOWN';
    const evidenceReasons = [];
    if (wp1Row.mappingDisposition !== 'EXACT_SAME_MODEL') {
      evidenceState = 'RIGHTS_BLOCKED';
      evidenceReasons.push('EXACT_MODEL_MAPPING_REQUIRED');
    } else if (field.rights.mappingStatus === 'UNMAPPED_BLOCKED') {
      evidenceState = 'RIGHTS_BLOCKED';
      evidenceReasons.push('FIELD_RIGHTS_UNMAPPED');
    } else if (conflicts.has(claimKey) || receipts.length > 1) {
      evidenceState = 'CONFLICT';
      evidenceReasons.push('ACTIVE_RECEIPT_CONFLICT');
    } else if (receipts.length === 1 && sourceRegistry.status === 'NOT_MATERIALIZED') {
      evidenceReasons.push('SOURCE_REGISTRY_NOT_MATERIALIZED');
    } else if (receipts.length === 1) {
      evidenceState = 'ACCEPTED';
    } else {
      evidenceReasons.push('EXACT_ACTIVE_RECEIPT_MISSING');
    }
    const receipt = receipts.length === 1 ? receipts[0] : null;
    const internalState = evidenceState === 'ACCEPTED' ? 'ALLOWED' : 'UNKNOWN';
    const publicDisposition = receipt
      ? resolveFitV4PublicationRights({
        registry: registryContext.publicationRights,
        receipt,
        fieldId: field.id,
        fieldMap: registryContext.fieldMap,
        rightsDictionary: registryContext.rightsDictionary,
        receiptBundle,
        authorizationEvidenceBytes: registryContext.authorizationEvidenceBytes,
        asOf: registryContext.asOf,
      })
      : freezeDeep({ state: 'UNKNOWN', decisionId: null, reasonCodes: ['PUBLIC_DISPLAY_RECEIPT_MISSING'] });
    const privateBlockers = [];
    if (evidenceState !== 'ACCEPTED') privateBlockers.push(`EVIDENCE_${evidenceState}`);
    if (internalState !== 'ALLOWED') privateBlockers.push('INTERNAL_PROCESSING_RIGHTS_UNKNOWN');
    const publicBlockers = [...privateBlockers];
    if (publicDisposition.state !== 'ALLOWED') publicBlockers.push(`PUBLIC_DISPLAY_${publicDisposition.state}`);
    return freezeDeep({
      fieldId: field.id,
      policy: { state: 'SUPPORTED', ruleId: rule.id, reasonCodes: [] },
      receiptEvidence: {
        state: evidenceState,
        receiptId: receipt?.receiptId ?? null,
        receiptSha256: receipt?.receiptSha256 ?? null,
        bundleSha256: receiptBundle.bundleSha256,
        reasonCodes: evidenceReasons,
      },
      internalProcessingRights: {
        state: internalState,
        reasonCodes: internalState === 'ALLOWED' ? [] : ['INTERNAL_RIGHTS_REQUIRE_ACCEPTED_RECEIPT'],
      },
      publicDisplayRights: publicDisposition,
      attributionRights: {
        state: publicDisposition.state === 'ALLOWED' ? 'ALLOWED' : publicDisposition.state,
        reasonCodes: publicDisposition.reasonCodes,
      },
      privateKnowledgeCompilationBlockers: privateBlockers,
      publicKnowledgeCompilationBlockers: publicBlockers,
    });
  });
}

function versionParts(value) {
  return String(value).match(/\d+/g)?.map(Number) ?? [];
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function safetyFloorFor({ active, receiptBundle, sourceRegistry, publicationRights, asOf, clocks, fieldMap }) {
  const payload = {
    activeRelease: {
      releaseCandidateId: active.descriptor.releaseCandidateId,
      activatedAt: active.descriptor.activatedAt,
      catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
      historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
    },
    receiptBundle: {
      bundleSha256: receiptBundle.bundleSha256,
      receiptIds: receiptBundle.receipts.map((receipt) => receipt.receiptId).sort(),
      withdrawnReceiptIds: receiptBundle.receipts
        .filter((receipt) => receipt.lifecycle.status === 'withdrawn')
        .map((receipt) => receipt.lifecycle.targetReceiptId ?? receipt.receiptId)
        .sort(),
    },
    sourceRegistry: {
      semanticSha256: semanticSha256(sourceRegistry),
      status: sourceRegistry.status,
      asOf: sourceRegistry.asOf,
    },
    publicationRights: {
      semanticSha256: semanticSha256(publicationRights),
      decisionIds: publicationRights.decisions.map((decision) => decision.decisionId).sort(),
      withdrawnDecisionIds: publicationRights.withdrawals.map((row) => row.decisionId).sort(),
      asOf: publicationRights.asOf,
    },
    asOf,
    clocks,
    minimumVersions: {
      readinessEpochSchemaVersion: FIT_V4_READINESS_EPOCH_SCHEMA_VERSION,
      fieldMapVersion: fieldMap.version,
      policyPackSchemaVersion: FIT_POLICY_PACK_SCHEMA_VERSION,
      policyPackVersion: FIT_POLICY_PACK_VERSION,
    },
  };
  return freezeDeep({ ...payload, semanticSha256: semanticSha256(payload) });
}

export function buildFitV4ReadinessEpoch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('WP2 build input required');
  const active = validateActiveRelease(input.activeRelease);
  const identityMap = validateIdentityMap(input.identityMap, { descriptor: active.descriptor });
  const fieldMapDocument = parseBoundBytes(input.fieldMap, 'Fit V4 field map');
  const fieldMap = validateFitV4FieldMap(fieldMapDocument);
  const policyPacks = validatePolicyPacks(fieldMap, input.policyPacks ?? FIT_POLICY_PACKS_V4);
  const rightsDictionaryDocument = parseBoundBytes(input.rightsDictionary, 'rights dictionary');
  const rightsDictionary = validateRightsDictionary(rightsDictionaryDocument);
  const receiptBundle = createFitV4ReceiptBundle(input.receiptBundle?.receipts, { fieldMap });
  if (!same(receiptBundle, input.receiptBundle)) throw new Error('receipt bundle hash drift');
  const sourceRegistry = validateSourceRegistry(input.sourceRegistry);
  const publicationRightsDocument = parseBoundBytes(input.publicationRights, 'publication rights registry');
  const asOf = iso(input.asOf, 'readiness epoch asOf');
  exactKeys(input.clocks, ['catalog', 'receipt', 'source', 'rights'], 'readiness epoch clocks');
  const clocks = freezeDeep(Object.fromEntries(Object.entries(input.clocks).map(([key, value]) => [key, iso(value, `${key} clock`)])));
  if (clocks.catalog !== active.catalog.retailLifecycleRelease?.asOf
    || clocks.source !== sourceRegistry.asOf
    || clocks.rights !== publicationRightsDocument.asOf
    || Object.values(clocks).some((clock) => Date.parse(clock) > Date.parse(asOf))) {
    throw new Error('readiness epoch clock binding invalid');
  }
  const publicationRights = validateFitV4PublicationRightsRegistry(publicationRightsDocument, {
    fieldMap,
    rightsDictionary,
    receiptBundle,
    authorizationEvidenceBytes: input.publicationRights.authorizationEvidenceBytes,
    asOf: clocks.rights,
  });
  exactKeys(input.producer, ['producerSha256', 'materializerSha256'], 'WP2 producer hashes');
  assertSha(input.producer.producerSha256, 'WP2 producer');
  assertSha(input.producer.materializerSha256, 'WP2 materializer');

  const policyPredecessors = POLICY_CATEGORIES.map((category) => {
    const bytes = canonicalJsonBytes(policyPacks[category]);
    return { category, bytes, semanticSha256: semanticSha256(policyPacks[category]) };
  });
  const sourceBytes = canonicalJsonBytes(sourceRegistry);
  const receiptBytes = canonicalJsonBytes(receiptBundle);
  const readinessSchemaBytes = canonicalJsonBytes(READINESS_SCHEMA_DEFINITION);
  const inventoryBytes = canonicalJsonBytes(publicationRights.evidenceInventory);
  const graph = [
    predecessor(0, 'active_release_descriptor', active.descriptor.releaseCandidateId, input.activeRelease.descriptorBytes, semanticSha256(active.descriptorDocument)),
    predecessor(1, 'retail_catalog', active.descriptor.artifacts.publicProjection.path, input.activeRelease.catalogBytes, semanticSha256(active.catalog)),
    predecessor(2, 'historical_reference', active.descriptor.artifacts.historicalReference.path, input.activeRelease.referenceBytes, semanticSha256(active.reference)),
    predecessor(3, 'identity_map', identityMap.policyVersion, input.identityMap.bytes, identityMap.semanticSha256),
    predecessor(4, 'field_map', fieldMap.version, input.fieldMap.bytes, semanticSha256(fieldMapDocument)),
    predecessor(5, 'readiness_epoch_schema', FIT_V4_READINESS_EPOCH_POLICY_VERSION, readinessSchemaBytes, semanticSha256(READINESS_SCHEMA_DEFINITION)),
    ...policyPredecessors.map((row, index) => predecessor(
      6 + index,
      `policy_pack:${row.category}`,
      `${FIT_POLICY_PACK_VERSION}:${row.category}`,
      row.bytes,
      row.semanticSha256,
    )),
    predecessor(10, 'rights_dictionary', 'product-data-field-rights-dictionary-v1', input.rightsDictionary.bytes, semanticSha256(rightsDictionary)),
    predecessor(11, 'receipt_bundle', receiptBundle.bundleSha256, receiptBytes, receiptBundle.bundleSha256),
    predecessor(12, 'source_registry', sourceRegistry.status, sourceBytes, semanticSha256(sourceRegistry)),
    predecessor(13, 'publication_rights_registry', publicationRights.policyVersion, input.publicationRights.bytes, semanticSha256(publicationRights)),
    predecessor(14, 'rights_evidence_inventory', 'publication-rights-evidence-inventory', inventoryBytes, semanticSha256(publicationRights.evidenceInventory)),
    predecessor(15, 'producer', 'fit-v4-readiness-epoch-producer', input.producer.producerSha256, input.producer.producerSha256),
    predecessor(16, 'materializer', 'fit-v4-readiness-epoch-materializer', input.producer.materializerSha256, input.producer.materializerSha256),
  ];

  const current = active.catalog.products
    .map((product, sourceOrdinal) => ({ product, sourceOrdinal }))
    .filter(({ product }) => product.lifecycleVisibility === 'CURRENT_OUTPUT');
  const wp1ByOrdinal = new Map(identityMap.catalogRows.map((row) => [row.sourceOrdinal, row]));
  if (wp1ByOrdinal.size !== identityMap.catalogRows.length) throw new Error('duplicate WP1 source ordinal');
  const registryContext = {
    fieldMap,
    rightsDictionary,
    publicationRights,
    authorizationEvidenceBytes: input.publicationRights.authorizationEvidenceBytes,
    asOf,
  };
  const products = current.map(({ product, sourceOrdinal }) => {
    const wp1Row = wp1ByOrdinal.get(sourceOrdinal);
    if (!wp1Row || wp1Row.catalogProductId !== product.id
      || wp1Row.canonicalProductId !== product.canonicalProductId) {
      throw new Error(`WP1 strict join failed at catalog source ordinal ${sourceOrdinal}`);
    }
    const applicability = classifyValidatedPolicyApplicability(product, policyPacks);
    const fields = fieldReadinessRows({
      product,
      wp1Row,
      applicability,
      receiptBundle,
      sourceRegistry,
      registryContext,
    });
    const privateBlockers = [...new Set(fields.flatMap((field) => field.privateKnowledgeCompilationBlockers))].sort();
    const publicBlockers = [...new Set(fields.flatMap((field) => field.publicKnowledgeCompilationBlockers))].sort();
    if (applicability.state !== 'SUPPORTED') {
      privateBlockers.push(`POLICY_${applicability.state}`);
      publicBlockers.push(`POLICY_${applicability.state}`);
    }
    return freezeDeep({
      rowIdentity: `FIT_V4_READINESS:${sourceOrdinal}`,
      sourceOrdinal,
      catalogProductId: product.id,
      canonicalProductId: product.canonicalProductId,
      catalogRowSemanticSha256: semanticSha256(product),
      wp1RowIdentity: wp1Row.rowIdentity,
      wp1RowSemanticSha256: semanticSha256(wp1Row),
      category: product.cat,
      policyCategory: applicability.policyCategory,
      formFactor: applicability.formFactor,
      policyApplicability: {
        state: applicability.state,
        reasonCodes: applicability.reasonCodes,
        packVersion: applicability.pack?.packVersion ?? null,
        packSemanticSha256: applicability.pack ? semanticSha256(applicability.pack) : null,
      },
      fieldReadiness: fields,
      privateKnowledgeCompilationEligibility: {
        eligible: applicability.state === 'SUPPORTED' && fields.length > 0 && privateBlockers.length === 0,
        blockers: privateBlockers,
      },
      publicKnowledgeCompilationEligibility: {
        eligible: applicability.state === 'SUPPORTED' && fields.length > 0 && publicBlockers.length === 0,
        blockers: publicBlockers,
      },
    });
  });
  const policyApplicability = Object.fromEntries(POLICY_STATES.map((state) => [
    state,
    products.filter((product) => product.policyApplicability.state === state).length,
  ]));
  const summary = freezeDeep({
    activeCatalogProducts: active.catalog.products.length,
    historicalReferenceRecords: active.reference.records.length,
    currentCatalogProducts: products.length,
    policyApplicability,
    privateKnowledgeCompilationEligible: products.filter((product) => product.privateKnowledgeCompilationEligibility.eligible).length,
    publicKnowledgeCompilationEligible: products.filter((product) => product.publicKnowledgeCompilationEligibility.eligible).length,
  });
  const safetyFloor = safetyFloorFor({
    active,
    receiptBundle,
    sourceRegistry,
    publicationRights,
    asOf,
    clocks,
    fieldMap,
  });
  const payload = {
    schemaVersion: FIT_V4_READINESS_EPOCH_SCHEMA_VERSION,
    policyVersion: FIT_V4_READINESS_EPOCH_POLICY_VERSION,
    asOf,
    clocks,
    predecessors: graph,
    versions: {
      fieldMap: fieldMap.version,
      policyPack: FIT_POLICY_PACK_VERSION,
      receiptBundleSchema: receiptBundle.schemaVersion,
      readinessEpochSchema: FIT_V4_READINESS_EPOCH_SCHEMA_VERSION,
    },
    safetyFloor,
    summary,
    products,
  };
  const digest = semanticSha256(payload);
  return freezeDeep({
    ...payload,
    epochId: `fit_v4_readiness_${digest.slice(0, 24)}`,
    semanticSha256: digest,
  });
}

function textArray(value, label, { sorted = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`${label} string array required`);
  }
  if (new Set(value).size !== value.length) throw new TypeError(`${label} must be unique`);
  if (sorted && !same(value, [...value].sort())) throw new TypeError(`${label} must be sorted`);
  return value;
}

function sortedIds(value, label) {
  const accepted = textArray(value, label, { sorted: true });
  accepted.forEach((item) => safeId(item, label));
  return accepted;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} non-negative integer required`);
  return value;
}

function validateReadinessRights(value, label, { decision = false } = {}) {
  exactKeys(value, decision ? ['state', 'decisionId', 'reasonCodes'] : ['state', 'reasonCodes'], label);
  if (!RIGHTS_STATES.includes(value.state)) throw new TypeError(`${label} state invalid`);
  textArray(value.reasonCodes, `${label} reason codes`);
  if (decision) {
    if (value.decisionId !== null) safeId(value.decisionId, `${label} decision ID`);
    if (value.state !== 'UNKNOWN' && value.decisionId === null) {
      throw new TypeError(`${label} non-unknown state requires a decision ID`);
    }
  }
  if ((value.state === 'ALLOWED') !== (value.reasonCodes.length === 0)) {
    throw new TypeError(`${label} state and reason codes are inconsistent`);
  }
}

function validateFieldReadiness(value, receiptBundleSha256) {
  exactKeys(value, [
    'fieldId', 'policy', 'receiptEvidence', 'internalProcessingRights',
    'publicDisplayRights', 'attributionRights', 'privateKnowledgeCompilationBlockers',
    'publicKnowledgeCompilationBlockers',
  ], 'readiness field');
  safeId(value.fieldId, 'readiness field ID');
  exactKeys(value.policy, ['state', 'ruleId', 'reasonCodes'], 'readiness field policy');
  if (value.policy.state !== 'SUPPORTED') throw new TypeError('readiness field policy state invalid');
  safeId(value.policy.ruleId, 'readiness field policy rule ID');
  if (textArray(value.policy.reasonCodes, 'readiness field policy reason codes').length !== 0) {
    throw new TypeError('supported readiness field policy cannot have reason codes');
  }

  const evidence = value.receiptEvidence;
  exactKeys(evidence, [
    'state', 'receiptId', 'receiptSha256', 'bundleSha256', 'reasonCodes',
  ], 'readiness field receipt evidence');
  if (!EVIDENCE_STATES.includes(evidence.state)) throw new TypeError('readiness receipt evidence state invalid');
  assertSha(evidence.bundleSha256, 'readiness receipt evidence bundle');
  if (evidence.bundleSha256 !== receiptBundleSha256) {
    throw new TypeError('readiness receipt evidence bundle binding invalid');
  }
  if ((evidence.receiptId === null) !== (evidence.receiptSha256 === null)) {
    throw new TypeError('readiness receipt evidence ID/hash pair invalid');
  }
  if (evidence.receiptId !== null) {
    safeId(evidence.receiptId, 'readiness receipt evidence ID');
    assertSha(evidence.receiptSha256, 'readiness receipt evidence');
  }
  textArray(evidence.reasonCodes, 'readiness receipt evidence reason codes');
  if (evidence.state === 'ACCEPTED' && (evidence.receiptId === null || evidence.reasonCodes.length !== 0)) {
    throw new TypeError('accepted readiness receipt evidence binding invalid');
  }
  if (evidence.state !== 'ACCEPTED' && evidence.reasonCodes.length === 0) {
    throw new TypeError('blocked readiness receipt evidence requires a reason');
  }

  exactKeys(value.internalProcessingRights, ['state', 'reasonCodes'], 'internal processing rights readiness');
  if (!['ALLOWED', 'UNKNOWN'].includes(value.internalProcessingRights.state)) {
    throw new TypeError('internal processing rights state invalid');
  }
  textArray(value.internalProcessingRights.reasonCodes, 'internal processing rights reason codes');
  if ((value.internalProcessingRights.state === 'ALLOWED')
    !== (value.internalProcessingRights.reasonCodes.length === 0)) {
    throw new TypeError('internal processing rights state and reasons are inconsistent');
  }
  validateReadinessRights(value.publicDisplayRights, 'public display rights readiness', { decision: true });
  validateReadinessRights(value.attributionRights, 'attribution rights readiness');

  const expectedPrivateBlockers = [];
  if (evidence.state !== 'ACCEPTED') expectedPrivateBlockers.push(`EVIDENCE_${evidence.state}`);
  if (value.internalProcessingRights.state !== 'ALLOWED') {
    expectedPrivateBlockers.push('INTERNAL_PROCESSING_RIGHTS_UNKNOWN');
  }
  const expectedPublicBlockers = [...expectedPrivateBlockers];
  if (value.publicDisplayRights.state !== 'ALLOWED') {
    expectedPublicBlockers.push(`PUBLIC_DISPLAY_${value.publicDisplayRights.state}`);
  }
  textArray(value.privateKnowledgeCompilationBlockers, 'private knowledge compilation blockers');
  textArray(value.publicKnowledgeCompilationBlockers, 'public knowledge compilation blockers');
  if (!same(value.privateKnowledgeCompilationBlockers, expectedPrivateBlockers)
    || !same(value.publicKnowledgeCompilationBlockers, expectedPublicBlockers)) {
    throw new TypeError('readiness field knowledge blocker consistency invalid');
  }
}

function validateKnowledgeEligibility(value, label, expectedBlockers, expectedEligible) {
  exactKeys(value, ['eligible', 'blockers'], label);
  if (typeof value.eligible !== 'boolean') throw new TypeError(`${label} eligible boolean required`);
  textArray(value.blockers, `${label} blockers`, { sorted: true });
  if (!same(value.blockers, expectedBlockers) || value.eligible !== expectedEligible) {
    throw new TypeError(`${label} blocker or eligibility consistency invalid`);
  }
}

function validateReadinessProduct(value, versions, receiptBundleSha256) {
  exactKeys(value, [
    'rowIdentity', 'sourceOrdinal', 'catalogProductId', 'canonicalProductId',
    'catalogRowSemanticSha256', 'wp1RowIdentity', 'wp1RowSemanticSha256',
    'category', 'policyCategory', 'formFactor', 'policyApplicability',
    'fieldReadiness', 'privateKnowledgeCompilationEligibility',
    'publicKnowledgeCompilationEligibility',
  ], 'readiness product');
  nonNegativeInteger(value.sourceOrdinal, 'readiness product source ordinal');
  if (value.rowIdentity !== `FIT_V4_READINESS:${value.sourceOrdinal}`
    || value.wp1RowIdentity !== `CATALOG:${value.sourceOrdinal}`) {
    throw new TypeError('readiness product row identity or ordinal invalid');
  }
  safeId(value.catalogProductId, 'readiness catalog product ID');
  safeId(value.canonicalProductId, 'readiness canonical product ID');
  assertSha(value.catalogRowSemanticSha256, 'readiness catalog row');
  assertSha(value.wp1RowSemanticSha256, 'readiness WP1 row');
  requiredText(value.category, 'readiness product category');
  requiredText(value.policyCategory, 'readiness product policy category');
  if (value.formFactor !== null) requiredText(value.formFactor, 'readiness product form factor');

  const applicability = value.policyApplicability;
  exactKeys(applicability, ['state', 'reasonCodes', 'packVersion', 'packSemanticSha256'], 'readiness policy applicability');
  if (!POLICY_STATES.includes(applicability.state)) throw new TypeError('readiness policy applicability state invalid');
  textArray(applicability.reasonCodes, 'readiness policy applicability reason codes');
  const supported = applicability.state === 'SUPPORTED';
  if (supported) {
    if (applicability.reasonCodes.length !== 0 || applicability.packVersion !== versions.policyPack) {
      throw new TypeError('supported readiness policy applicability binding invalid');
    }
    assertSha(applicability.packSemanticSha256, 'readiness policy pack semantic');
    if (value.formFactor === null) throw new TypeError('supported readiness product requires a form factor');
  } else if (applicability.packVersion !== null || applicability.packSemanticSha256 !== null
    || applicability.reasonCodes.length === 0) {
    throw new TypeError('blocked readiness policy applicability binding invalid');
  }
  if (applicability.state === 'FORM_FACTOR_REQUIRED' && value.formFactor !== null) {
    throw new TypeError('FORM_FACTOR_REQUIRED readiness row cannot have a form factor');
  }

  if (!Array.isArray(value.fieldReadiness)
    || (supported && value.fieldReadiness.length === 0)
    || (!supported && value.fieldReadiness.length !== 0)) {
    throw new TypeError('readiness supported-versus-fields partition invalid');
  }
  const fieldIds = new Set();
  for (const field of value.fieldReadiness) {
    validateFieldReadiness(field, receiptBundleSha256);
    if (fieldIds.has(field.fieldId)) throw new TypeError('duplicate readiness field ID');
    fieldIds.add(field.fieldId);
  }
  const privateBlockers = [...new Set(value.fieldReadiness.flatMap(
    (field) => field.privateKnowledgeCompilationBlockers,
  ))].sort();
  const publicBlockers = [...new Set(value.fieldReadiness.flatMap(
    (field) => field.publicKnowledgeCompilationBlockers,
  ))].sort();
  if (!supported) {
    privateBlockers.push(`POLICY_${applicability.state}`);
    publicBlockers.push(`POLICY_${applicability.state}`);
  }
  validateKnowledgeEligibility(
    value.privateKnowledgeCompilationEligibility,
    'private knowledge compilation eligibility',
    privateBlockers,
    supported && value.fieldReadiness.length > 0 && privateBlockers.length === 0,
  );
  validateKnowledgeEligibility(
    value.publicKnowledgeCompilationEligibility,
    'public knowledge compilation eligibility',
    publicBlockers,
    supported && value.fieldReadiness.length > 0 && publicBlockers.length === 0,
  );
}

function validateReadinessSafetyFloor(value, { asOf, clocks, versions, predecessors }) {
  exactKeys(value, [
    'activeRelease', 'receiptBundle', 'sourceRegistry', 'publicationRights',
    'asOf', 'clocks', 'minimumVersions', 'semanticSha256',
  ], 'readiness safety floor');
  exactKeys(value.activeRelease, [
    'releaseCandidateId', 'activatedAt', 'catalogSha256', 'historicalReferenceSha256',
  ], 'readiness safety floor active release');
  safeId(value.activeRelease.releaseCandidateId, 'readiness safety floor release ID');
  iso(value.activeRelease.activatedAt, 'readiness safety floor activation');
  assertSha(value.activeRelease.catalogSha256, 'readiness safety floor catalog');
  assertSha(value.activeRelease.historicalReferenceSha256, 'readiness safety floor historical reference');

  exactKeys(value.receiptBundle, [
    'bundleSha256', 'receiptIds', 'withdrawnReceiptIds',
  ], 'readiness safety floor receipt bundle');
  assertSha(value.receiptBundle.bundleSha256, 'readiness safety floor receipt bundle');
  const receiptIds = sortedIds(value.receiptBundle.receiptIds, 'readiness safety floor receipt IDs');
  const withdrawnReceiptIds = sortedIds(
    value.receiptBundle.withdrawnReceiptIds,
    'readiness safety floor withdrawn receipt IDs',
  );
  if (!withdrawnReceiptIds.every((id) => receiptIds.includes(id))) {
    throw new TypeError('readiness safety floor withdrawal references an unknown receipt');
  }

  exactKeys(value.sourceRegistry, ['semanticSha256', 'status', 'asOf'], 'readiness safety floor source registry');
  assertSha(value.sourceRegistry.semanticSha256, 'readiness safety floor source registry');
  if (value.sourceRegistry.status !== 'NOT_MATERIALIZED') {
    throw new TypeError('readiness safety floor source registry status invalid');
  }
  iso(value.sourceRegistry.asOf, 'readiness safety floor source registry asOf');

  exactKeys(value.publicationRights, [
    'semanticSha256', 'decisionIds', 'withdrawnDecisionIds', 'asOf',
  ], 'readiness safety floor publication rights');
  assertSha(value.publicationRights.semanticSha256, 'readiness safety floor publication rights');
  const decisionIds = sortedIds(value.publicationRights.decisionIds, 'readiness safety floor decision IDs');
  const withdrawnDecisionIds = sortedIds(
    value.publicationRights.withdrawnDecisionIds,
    'readiness safety floor withdrawn decision IDs',
  );
  if (!withdrawnDecisionIds.every((id) => decisionIds.includes(id))) {
    throw new TypeError('readiness safety floor withdrawal references an unknown rights decision');
  }
  iso(value.publicationRights.asOf, 'readiness safety floor publication rights asOf');

  if (iso(value.asOf, 'readiness safety floor asOf') !== asOf) {
    throw new TypeError('readiness safety floor asOf binding invalid');
  }
  exactKeys(value.clocks, ['catalog', 'receipt', 'source', 'rights'], 'readiness safety floor clocks');
  for (const [key, clock] of Object.entries(value.clocks)) iso(clock, `readiness safety floor ${key} clock`);
  if (!same(value.clocks, clocks)
    || value.sourceRegistry.asOf !== clocks.source
    || value.publicationRights.asOf !== clocks.rights) {
    throw new TypeError('readiness safety floor clock binding invalid');
  }
  exactKeys(value.minimumVersions, [
    'readinessEpochSchemaVersion', 'fieldMapVersion', 'policyPackSchemaVersion',
    'policyPackVersion',
  ], 'readiness safety floor minimum versions');
  if (value.minimumVersions.readinessEpochSchemaVersion !== versions.readinessEpochSchema
    || value.minimumVersions.fieldMapVersion !== versions.fieldMap
    || value.minimumVersions.policyPackVersion !== versions.policyPack
    || !Number.isSafeInteger(value.minimumVersions.policyPackSchemaVersion)
    || value.minimumVersions.policyPackSchemaVersion < 1) {
    throw new TypeError('readiness safety floor minimum version binding invalid');
  }

  const byRole = new Map(predecessors.map((row) => [row.role, row]));
  if (byRole.get('active_release_descriptor')?.id !== value.activeRelease.releaseCandidateId
    || byRole.get('retail_catalog')?.bytesSha256 !== value.activeRelease.catalogSha256
    || byRole.get('historical_reference')?.bytesSha256 !== value.activeRelease.historicalReferenceSha256
    || byRole.get('receipt_bundle')?.id !== value.receiptBundle.bundleSha256
    || byRole.get('receipt_bundle')?.semanticSha256 !== value.receiptBundle.bundleSha256
    || byRole.get('source_registry')?.semanticSha256 !== value.sourceRegistry.semanticSha256
    || byRole.get('publication_rights_registry')?.semanticSha256 !== value.publicationRights.semanticSha256
    || byRole.get('field_map')?.id !== value.minimumVersions.fieldMapVersion) {
    throw new TypeError('readiness safety floor predecessor binding invalid');
  }
  const { semanticSha256: floorDigest, ...floorPayload } = value;
  assertSha(floorDigest, 'readiness safety floor semantic');
  if (semanticSha256(floorPayload) !== floorDigest) throw new TypeError('readiness safety floor hash invalid');
}

function validateReadinessSummary(value, products) {
  exactKeys(value, [
    'activeCatalogProducts', 'historicalReferenceRecords', 'currentCatalogProducts',
    'policyApplicability', 'privateKnowledgeCompilationEligible',
    'publicKnowledgeCompilationEligible',
  ], 'readiness summary');
  nonNegativeInteger(value.activeCatalogProducts, 'readiness active catalog count');
  nonNegativeInteger(value.historicalReferenceRecords, 'readiness historical reference count');
  nonNegativeInteger(value.currentCatalogProducts, 'readiness current catalog count');
  nonNegativeInteger(value.privateKnowledgeCompilationEligible, 'readiness private eligible count');
  nonNegativeInteger(value.publicKnowledgeCompilationEligible, 'readiness public eligible count');
  exactKeys(value.policyApplicability, POLICY_STATES, 'readiness policy applicability summary');
  for (const state of POLICY_STATES) nonNegativeInteger(value.policyApplicability[state], `${state} readiness count`);
  const expected = {
    activeCatalogProducts: value.activeCatalogProducts,
    historicalReferenceRecords: value.historicalReferenceRecords,
    currentCatalogProducts: products.length,
    policyApplicability: Object.fromEntries(POLICY_STATES.map((state) => [
      state,
      products.filter((product) => product.policyApplicability.state === state).length,
    ])),
    privateKnowledgeCompilationEligible: products.filter(
      (product) => product.privateKnowledgeCompilationEligibility.eligible,
    ).length,
    publicKnowledgeCompilationEligible: products.filter(
      (product) => product.publicKnowledgeCompilationEligibility.eligible,
    ).length,
  };
  if (value.activeCatalogProducts < products.length || !same(value, expected)) {
    throw new TypeError('readiness summary partition or count invalid');
  }
}

export function validateFitV4ReadinessEpoch(value) {
  exactKeys(value, [
    'schemaVersion', 'policyVersion', 'asOf', 'clocks', 'predecessors', 'versions',
    'safetyFloor', 'summary', 'products', 'epochId', 'semanticSha256',
  ], 'Fit V4 readiness epoch');
  if (value.schemaVersion !== FIT_V4_READINESS_EPOCH_SCHEMA_VERSION
    || value.policyVersion !== FIT_V4_READINESS_EPOCH_POLICY_VERSION) {
    throw new TypeError('Fit V4 readiness epoch schema required');
  }
  iso(value.asOf, 'readiness epoch asOf');
  exactKeys(value.clocks, ['catalog', 'receipt', 'source', 'rights'], 'readiness epoch clocks');
  for (const [key, clock] of Object.entries(value.clocks)) {
    iso(clock, `${key} readiness epoch clock`);
    if (Date.parse(clock) > Date.parse(value.asOf)) throw new TypeError('readiness epoch clock exceeds asOf');
  }
  exactKeys(value.versions, [
    'fieldMap', 'policyPack', 'receiptBundleSchema', 'readinessEpochSchema',
  ], 'readiness epoch versions');
  requiredText(value.versions.fieldMap, 'readiness field map version');
  requiredText(value.versions.policyPack, 'readiness policy pack version');
  if (!Number.isSafeInteger(value.versions.receiptBundleSchema)
    || value.versions.receiptBundleSchema < 1
    || value.versions.readinessEpochSchema !== FIT_V4_READINESS_EPOCH_SCHEMA_VERSION) {
    throw new TypeError('readiness epoch version binding invalid');
  }
  if (!Array.isArray(value.predecessors)
    || !same(value.predecessors.map((row) => row.role), FIT_V4_READINESS_PREDECESSOR_ROLES)) {
    throw new TypeError('readiness predecessor role order or duplicate invalid');
  }
  value.predecessors.forEach((row, index) => {
    exactKeys(row, ['order', 'role', 'id', 'bytesSha256', 'semanticSha256'], 'readiness predecessor');
    if (row.order !== index) throw new TypeError('readiness predecessor order invalid');
    requiredText(row.id, 'readiness predecessor ID');
    assertSha(row.bytesSha256, 'readiness predecessor bytes');
    assertSha(row.semanticSha256, 'readiness predecessor semantic');
  });
  validateReadinessSafetyFloor(value.safetyFloor, {
    asOf: value.asOf,
    clocks: value.clocks,
    versions: value.versions,
    predecessors: value.predecessors,
  });
  if (!Array.isArray(value.products)) throw new TypeError('readiness product partition required');
  const ordinals = new Set();
  const catalogIds = new Set();
  const canonicalIds = new Set();
  let previousOrdinal = -1;
  for (const product of value.products) {
    validateReadinessProduct(product, value.versions, value.safetyFloor.receiptBundle.bundleSha256);
    if (product.sourceOrdinal <= previousOrdinal || ordinals.has(product.sourceOrdinal)) {
      throw new TypeError('readiness product source ordinals must be unique and ordered');
    }
    if (catalogIds.has(product.catalogProductId)) throw new TypeError('duplicate readiness catalog product ID');
    if (canonicalIds.has(product.canonicalProductId)) throw new TypeError('duplicate readiness canonical product ID');
    previousOrdinal = product.sourceOrdinal;
    ordinals.add(product.sourceOrdinal);
    catalogIds.add(product.catalogProductId);
    canonicalIds.add(product.canonicalProductId);
  }
  validateReadinessSummary(value.summary, value.products);
  const { epochId, semanticSha256: digest, ...payload } = value;
  assertSha(digest, 'readiness epoch semantic');
  if (semanticSha256(payload) !== digest || epochId !== `fit_v4_readiness_${digest.slice(0, 24)}`) {
    throw new TypeError('readiness epoch immutable binding invalid');
  }
  return freezeDeep(canonical(value));
}

function includesAll(left, right) {
  const values = new Set(right);
  return left.every((value) => values.has(value));
}

function assertNonRegressingSafetyFloor(current, target) {
  const currentReleaseAt = Date.parse(current.activeRelease.activatedAt);
  const targetReleaseAt = Date.parse(target.activeRelease.activatedAt);
  const receiptsRetainedOrWithdrawn = current.receiptBundle.receiptIds.every((receiptId) => (
    target.receiptBundle.receiptIds.includes(receiptId)
      || target.receiptBundle.withdrawnReceiptIds.includes(receiptId)
  ));
  const decisionsRetainedOrWithdrawn = current.publicationRights.decisionIds.every((decisionId) => (
    target.publicationRights.decisionIds.includes(decisionId)
      || target.publicationRights.withdrawnDecisionIds.includes(decisionId)
  ));
  if (targetReleaseAt < currentReleaseAt
    || (targetReleaseAt === currentReleaseAt
      && target.activeRelease.releaseCandidateId !== current.activeRelease.releaseCandidateId)
    || (targetReleaseAt === currentReleaseAt
      && (target.activeRelease.catalogSha256 !== current.activeRelease.catalogSha256
        || target.activeRelease.historicalReferenceSha256 !== current.activeRelease.historicalReferenceSha256))
    || Date.parse(target.asOf) < Date.parse(current.asOf)
    || Date.parse(target.clocks.catalog) < Date.parse(current.clocks.catalog)
    || Date.parse(target.clocks.receipt) < Date.parse(current.clocks.receipt)
    || Date.parse(target.clocks.source) < Date.parse(current.clocks.source)
    || Date.parse(target.clocks.rights) < Date.parse(current.clocks.rights)
    || compareVersions(target.minimumVersions.fieldMapVersion, current.minimumVersions.fieldMapVersion) < 0
    || compareVersions(target.minimumVersions.policyPackVersion, current.minimumVersions.policyPackVersion) < 0
    || target.minimumVersions.readinessEpochSchemaVersion < current.minimumVersions.readinessEpochSchemaVersion
    || target.minimumVersions.policyPackSchemaVersion < current.minimumVersions.policyPackSchemaVersion
    || !receiptsRetainedOrWithdrawn
    || !decisionsRetainedOrWithdrawn
    || !includesAll(current.receiptBundle.withdrawnReceiptIds, target.receiptBundle.withdrawnReceiptIds)
    || !includesAll(current.publicationRights.withdrawnDecisionIds, target.publicationRights.withdrawnDecisionIds)) {
    throw new Error('readiness safety floor would regress or reactivate withdrawn state');
  }
}

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeImmutable(path, bytes, label) {
  try {
    const handle = await open(path, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!(await readFile(path)).equals(bytes)) throw new Error(`${label} write verification failed`);
    return 'CREATED';
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (!existing.equals(bytes)) throw new Error(`${label} content-address collision`);
    return 'REPLAYED';
  }
}

async function atomicWrite(path, bytes, token) {
  const temporary = `${path}.${token}.tmp`;
  let ownsTemporary = false;
  try {
    const handle = await open(temporary, 'wx');
    ownsTemporary = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } finally {
    if (ownsTemporary) {
      try {
        await unlink(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}

function headPath(storeRoot) {
  return join(storeRoot, 'head.json');
}

export async function readFitV4ReadinessHead(storeRoot) {
  const bytes = await readOptional(headPath(storeRoot));
  if (!bytes) return null;
  const head = JSON.parse(bytes);
  exactKeys(head, ['schemaVersion', 'sequence', 'activeEpochId', 'activeTransitionId'], 'readiness head');
  if (head.schemaVersion !== 1 || !Number.isSafeInteger(head.sequence) || head.sequence < 1) {
    throw new TypeError('readiness head invalid');
  }
  safeId(head.activeEpochId, 'readiness head active epoch ID');
  safeId(head.activeTransitionId, 'readiness head active transition ID');
  return freezeDeep({ head, headSha256: sha256(bytes), bytes });
}

async function acquireLock({ storeRoot, expectedHeadSha256, owner, now, staleRecovery }) {
  exactKeys(owner, ['ownerToken', 'pid', 'host', 'processStartFingerprint'], 'readiness lock owner');
  safeId(owner.ownerToken, 'readiness lock owner token');
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new TypeError('readiness lock PID invalid');
  requiredText(owner.host, 'readiness lock host');
  requiredText(owner.processStartFingerprint, 'readiness lock process start fingerprint');
  const lock = {
    schemaVersion: 1,
    ...owner,
    expectedHeadSha256,
    acquiredAt: iso(now, 'readiness lock acquisition time'),
  };
  const bytes = canonicalJsonBytes(lock);
  const path = join(storeRoot, 'writer.lock');
  try {
    await writeFile(path, bytes, { flag: 'wx' });
    return { path, bytes, lock };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!staleRecovery) throw new Error('readiness writer lock is active');
  const staleBytes = await readFile(path);
  const staleHash = sha256(staleBytes);
  if (staleHash !== staleRecovery.expectedLockSha256) throw new Error('stale lock byte hash mismatch');
  const stale = JSON.parse(staleBytes);
  exactKeys(stale, [
    'schemaVersion', 'ownerToken', 'pid', 'host', 'processStartFingerprint',
    'expectedHeadSha256', 'acquiredAt',
  ], 'stale readiness lock');
  if (stale.host !== hostname() || stale.host !== owner.host) throw new Error('stale lock host mismatch');
  const age = Date.parse(now) - Date.parse(stale.acquiredAt);
  if (!Number.isFinite(age) || age < staleRecovery.minimumAgeMs) throw new Error('stale lock minimum age not met');
  if (typeof staleRecovery.isProcessAlive !== 'function'
    || staleRecovery.isProcessAlive({ pid: stale.pid, processStartFingerprint: stale.processStartFingerprint })) {
    throw new Error('stale lock process is alive or unproven');
  }
  const quarantineDirectory = join(storeRoot, 'stale-locks');
  await mkdir(quarantineDirectory, { recursive: true });
  const quarantinePath = join(quarantineDirectory, `${staleHash}.json`);
  await rename(path, quarantinePath);
  if (!(await readFile(quarantinePath)).equals(staleBytes)) throw new Error('stale lock quarantine verification failed');
  await writeFile(path, bytes, { flag: 'wx' });
  return { path, bytes, lock };
}

async function releaseLock(lock) {
  const existing = await readOptional(lock.path);
  if (existing?.equals(lock.bytes)) await unlink(lock.path);
}

async function loadStoredEpoch(storeRoot, epochId) {
  safeId(epochId, 'stored readiness epoch ID');
  const bytes = await readFile(join(storeRoot, 'epochs', `${epochId}.json`));
  const epoch = validateFitV4ReadinessEpoch(JSON.parse(bytes));
  if (epoch.epochId !== epochId) throw new Error('readiness epoch path identity mismatch');
  return epoch;
}

function transitionRecord({ type, sequence, fromEpochId, toEpochId, previousTransitionId, expectedHeadSha256, createdAt, safetyFloorSha256 }) {
  const payload = {
    schemaVersion: 1,
    policyVersion: 'fit-v4-readiness-transition-v1',
    type,
    sequence,
    fromEpochId,
    toEpochId,
    previousTransitionId,
    expectedHeadSha256,
    createdAt,
    safetyFloorSha256,
  };
  const digest = semanticSha256(payload);
  return freezeDeep({ ...payload, transitionId: `fit_v4_readiness_transition_${digest.slice(0, 24)}`, semanticSha256: digest });
}

function validateTransitionRecord(value) {
  exactKeys(value, [
    'schemaVersion', 'policyVersion', 'type', 'sequence', 'fromEpochId', 'toEpochId',
    'previousTransitionId', 'expectedHeadSha256', 'createdAt', 'safetyFloorSha256',
    'transitionId', 'semanticSha256',
  ], 'readiness transition');
  if (value.schemaVersion !== 1 || value.policyVersion !== 'fit-v4-readiness-transition-v1'
    || !['ACTIVATE', 'SUPERSEDE', 'ROLLBACK'].includes(value.type)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    throw new TypeError('readiness transition schema invalid');
  }
  safeId(value.transitionId, 'readiness transition ID');
  if (value.fromEpochId !== null) safeId(value.fromEpochId, 'readiness transition source epoch ID');
  safeId(value.toEpochId, 'readiness transition target epoch ID');
  if (value.previousTransitionId !== null) {
    safeId(value.previousTransitionId, 'previous readiness transition ID');
  }
  if (value.expectedHeadSha256 !== null) assertSha(value.expectedHeadSha256, 'readiness transition expected head');
  const firstActivation = value.type === 'ACTIVATE' && value.sequence === 1;
  if (value.type === 'ACTIVATE' && (!firstActivation
    || value.fromEpochId !== null
    || value.previousTransitionId !== null
    || value.expectedHeadSha256 !== null)) {
    throw new TypeError('ACTIVATE transition lifecycle requires sequence 1 and null predecessor state');
  }
  if (value.type !== 'ACTIVATE' && (value.sequence === 1
    || value.fromEpochId === null
    || value.previousTransitionId === null
    || value.expectedHeadSha256 === null)) {
    throw new TypeError(`${value.type} transition lifecycle requires an observed predecessor head`);
  }
  iso(value.createdAt, 'readiness transition timestamp');
  assertSha(value.safetyFloorSha256, 'readiness transition safety floor');
  const { transitionId, semanticSha256: digest, ...payload } = value;
  if (semanticSha256(payload) !== digest
    || transitionId !== `fit_v4_readiness_transition_${digest.slice(0, 24)}`) {
    throw new TypeError('readiness transition immutable binding invalid');
  }
  return freezeDeep(canonical(value));
}

export async function readFitV4ReadinessTransition(storeRoot, transitionId) {
  safeId(transitionId, 'readiness transition ID');
  const bytes = await readFile(join(storeRoot, 'transitions', `${transitionId}.json`));
  const transition = validateTransitionRecord(JSON.parse(bytes));
  if (transition.transitionId !== transitionId) throw new Error('readiness transition path identity mismatch');
  return freezeDeep({ transition, bytes });
}

export async function materializeFitV4ReadinessEpoch({
  storeRoot,
  epoch: rawEpoch,
  expectedHeadSha256,
  owner,
  now,
  faultAt = null,
  staleRecovery = null,
  transitionType = null,
  revalidatedEpoch = null,
}) {
  const epoch = validateFitV4ReadinessEpoch(rawEpoch);
  if (expectedHeadSha256 !== null) assertSha(expectedHeadSha256, 'expected readiness head');
  iso(now, 'readiness materialization time');
  await mkdir(join(storeRoot, 'epochs'), { recursive: true });
  await mkdir(join(storeRoot, 'transitions'), { recursive: true });
  const lock = await acquireLock({ storeRoot, expectedHeadSha256, owner, now, staleRecovery });
  try {
    const observed = await readFitV4ReadinessHead(storeRoot);
    if ((observed?.headSha256 ?? null) !== expectedHeadSha256) throw new Error('readiness head CAS mismatch');
    if (transitionType !== null && !['ROLLBACK', 'SUPERSEDE', 'ACTIVATE'].includes(transitionType)) {
      throw new TypeError('readiness transition type invalid');
    }
    const type = transitionType ?? (observed ? 'SUPERSEDE' : 'ACTIVATE');
    if (!observed && type !== 'ACTIVATE') {
      throw new Error(`${type} transition lifecycle is invalid without an active head`);
    }
    if (observed && type === 'ACTIVATE') {
      throw new Error('ACTIVATE transition lifecycle is invalid when an active head exists');
    }
    let current = null;
    if (observed) {
      const activeTransition = (await readFitV4ReadinessTransition(
        storeRoot,
        observed.head.activeTransitionId,
      )).transition;
      if (activeTransition.sequence !== observed.head.sequence
        || activeTransition.toEpochId !== observed.head.activeEpochId) {
        throw new Error('readiness head active transition replay mismatch');
      }
      current = await loadStoredEpoch(storeRoot, observed.head.activeEpochId);
      if (activeTransition.safetyFloorSha256 !== current.safetyFloor.semanticSha256) {
        throw new Error('readiness head transition safety floor mismatch');
      }
    }
    if (observed && type === 'ROLLBACK') {
      if (!revalidatedEpoch) throw new Error('rollback requires a revalidated readiness epoch');
      const acceptedRevalidatedEpoch = validateFitV4ReadinessEpoch(revalidatedEpoch);
      assertNonRegressingSafetyFloor(current.safetyFloor, acceptedRevalidatedEpoch.safetyFloor);
      if (!same(acceptedRevalidatedEpoch.safetyFloor, epoch.safetyFloor)) {
        throw new Error('rollback revalidated safety floor must equal target floor');
      }
    }
    if (observed?.head.activeEpochId === epoch.epochId) {
      return freezeDeep({ status: 'NO_OP', epochId: epoch.epochId, transitionId: observed.head.activeTransitionId });
    }
    if (observed) {
      if (type !== 'ROLLBACK') {
        assertNonRegressingSafetyFloor(current.safetyFloor, epoch.safetyFloor);
      }
    }
    const epochBytes = canonicalJsonBytes(epoch);
    const epochPath = join(storeRoot, 'epochs', `${epoch.epochId}.json`);
    await writeImmutable(epochPath, epochBytes, 'readiness epoch');
    if (!same(await loadStoredEpoch(storeRoot, epoch.epochId), epoch)) {
      throw new Error('readiness epoch persisted verification failed');
    }
    if (faultAt === 'AFTER_EPOCH') throw new Error('fault injection AFTER_EPOCH');
    const transition = transitionRecord({
      type,
      sequence: (observed?.head.sequence ?? 0) + 1,
      fromEpochId: observed?.head.activeEpochId ?? null,
      toEpochId: epoch.epochId,
      previousTransitionId: observed?.head.activeTransitionId ?? null,
      expectedHeadSha256,
      createdAt: now,
      safetyFloorSha256: epoch.safetyFloor.semanticSha256,
    });
    const transitionBytes = canonicalJsonBytes(transition);
    await writeImmutable(
      join(storeRoot, 'transitions', `${transition.transitionId}.json`),
      transitionBytes,
      'readiness transition',
    );
    const persistedTransition = await readFitV4ReadinessTransition(storeRoot, transition.transitionId);
    if (!persistedTransition.bytes.equals(transitionBytes)) {
      throw new Error('readiness transition persisted verification failed');
    }
    if (faultAt === 'AFTER_TRANSITION') throw new Error('fault injection AFTER_TRANSITION');
    const head = {
      schemaVersion: 1,
      sequence: transition.sequence,
      activeEpochId: epoch.epochId,
      activeTransitionId: transition.transitionId,
    };
    const headBytes = canonicalJsonBytes(head);
    await atomicWrite(headPath(storeRoot), headBytes, owner.ownerToken);
    const persistedHead = await readFitV4ReadinessHead(storeRoot);
    if (!persistedHead?.bytes.equals(headBytes)) throw new Error('readiness head persisted verification failed');
    if (faultAt === 'AFTER_HEAD') throw new Error('fault injection AFTER_HEAD');
    return freezeDeep({ status: 'ACTIVATED', epochId: epoch.epochId, transitionId: transition.transitionId });
  } finally {
    await releaseLock(lock);
  }
}
