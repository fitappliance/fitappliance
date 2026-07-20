import { createHash } from 'node:crypto';

import { createRetailerObservationsFromSnapshot } from './retailer-source-adapter.mjs';
import {
  buildRetailerObservationLedger,
  normalizeRetailerSourcePolicy,
} from './retailer-observation-ledger.mjs';
import { validateRetailLifecycleRefreshInventory } from './retail-lifecycle-refresh-inventory.mjs';
import { validateRetailerSourceAcquisitionReceipt } from './retailer-source-acquisition-receipt.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OUTCOMES = new Set(['succeeded', 'failed']);

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function timestamp(value, label) {
  const result = required(value, label);
  const parsed = new Date(result);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function sortedUnique(values, selector, label) {
  const keys = values.map(selector);
  if (new Set(keys).size !== keys.length) throw new TypeError(`duplicate ${label}`);
  if (keys.some((key, index) => index > 0 && keys[index - 1].localeCompare(key) > 0)) {
    throw new TypeError(`${label} must be sorted`);
  }
}

function semanticPayload(document, idField) {
  const clone = structuredClone(document);
  delete clone[idField];
  delete clone.semanticSha256;
  return clone;
}

function normalizedProjectionIdentity(product) {
  return {
    canonicalProductId: required(product?.canonicalProductId, 'catalogue canonical product ID'),
    legacyRuntimeId: required(product?.id, 'catalogue legacy runtime ID'),
    category: required(product?.cat, 'catalogue category'),
    brand: required(product?.brand, 'catalogue brand'),
    model: required(product?.model, 'catalogue model'),
  };
}

function normalizedTarget(item, sourcePolicyId) {
  const sourceTasks = (item?.sourceTasks ?? [])
    .filter((task) => task.sourcePolicyId === sourcePolicyId)
    .map((task) => ({
      baselineLinkId: required(task.baselineLinkId, 'refresh baseline link ID'),
      retailer: required(task.retailer, 'refresh retailer'),
      url: new URL(required(task.url, 'refresh retailer URL')).toString(),
      action: required(task.action, 'refresh action'),
      executionState: required(task.executionState, 'refresh execution state'),
    }))
    .sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  if (sourceTasks.length === 0) return null;
  sortedUnique(sourceTasks, (task) => task.baselineLinkId, 'refresh source task');
  return {
    canonicalProductId: required(item.canonicalProductId, 'refresh canonical product ID'),
    legacyRuntimeId: required(item.legacyRuntimeId, 'refresh legacy runtime ID'),
    category: required(item.category, 'refresh category'),
    brand: required(item.brand, 'refresh brand'),
    model: required(item.model, 'refresh model'),
    sourceTasks,
  };
}

function sourceContract(source, policy) {
  const exactProductCanary = source.sourceType === 'public_retailer_api'
    && source.collectionMode === 'bounded_exact_product_api'
    && source.termsReviewState === 'pending_automated_scale_review';
  const exactProductScale = source.sourceType === 'public_retailer_api'
    && source.collectionMode === 'bounded_exact_product_api'
    && source.termsReviewState === 'reviewed_bounded_exact_product_api';
  const controls = source.automationControls ?? {};
  if (exactProductScale
    && (!Number.isInteger(controls.maximumTargetsPerRun)
      || controls.maximumTargetsPerRun < 1 || controls.maximumTargetsPerRun > 100
      || controls.maximumConcurrency !== 1
      || JSON.stringify(controls.stopHttpStatuses) !== JSON.stringify([403, 429])
      || !Number.isInteger(controls.maximumConsecutiveFailures)
      || controls.maximumConsecutiveFailures < 1 || controls.maximumConsecutiveFailures > 10
      || !SHA256.test(String(controls.canaryRunSha256 ?? '')))) {
    throw new TypeError('reviewed exact-product API automation controls are incomplete');
  }
  return {
    sourcePolicyId: source.id,
    sourcePolicyVersion: policy.policyVersion,
    adapterPolicyVersion: source.policyVersion,
    retailer: source.retailer,
    sourceType: source.sourceType,
    collectionMode: source.collectionMode,
    termsReviewState: source.termsReviewState,
    allowedHosts: [...source.allowedHosts],
    acquisitionHosts: [...source.acquisitionHosts],
    minimumIntervalMs: source.minimumIntervalMs,
    maximumTargetsPerRun: exactProductCanary ? 20 : exactProductScale ? controls.maximumTargetsPerRun : null,
    maximumConcurrency: exactProductCanary ? 1 : exactProductScale ? controls.maximumConcurrency : null,
    maximumConsecutiveFailures: exactProductCanary ? 1 : exactProductScale ? controls.maximumConsecutiveFailures : null,
    canaryRunSha256: exactProductScale ? controls.canaryRunSha256 : null,
    stopHttpStatuses: exactProductCanary || exactProductScale ? [403, 429] : [],
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  };
}

export function retailerRawObjectPath(value, extension = 'bin') {
  const hash = sha256(value, 'retailer raw object SHA-256');
  const normalizedExtension = required(extension, 'retailer raw object extension').toLowerCase();
  if (!['bin', 'csv', 'json'].includes(normalizedExtension)) {
    throw new TypeError('unsupported retailer raw object extension');
  }
  return `evidence/retailer/sha256/${hash.slice(0, 2)}/${hash}.${normalizedExtension}`;
}

function isExactProductMode(mode) {
  return ['BOUNDED_EXACT_PRODUCT_API_CANARY', 'BOUNDED_EXACT_PRODUCT_API_SCALE'].includes(mode);
}

export function validateRetailLifecycleRefreshPlan(document) {
  if (!document || document.schemaVersion !== 1
    || document.planPolicyVersion !== 'retail-lifecycle-refresh-plan-v1'
    || !Array.isArray(document.targets) || !Array.isArray(document.catalogScope)) {
    throw new TypeError('retail lifecycle refresh plan schema v1 required');
  }
  if (!['COMPLETE_AFFILIATE_FEED_REPLAY', 'BOUNDED_EXACT_PRODUCT_API_CANARY',
    'BOUNDED_EXACT_PRODUCT_API_SCALE'].includes(document.mode)) {
    throw new TypeError(`unsupported retail lifecycle refresh plan mode ${document.mode}`);
  }
  timestamp(document.observedAt, 'refresh plan observedAt');
  for (const [key, value] of Object.entries(document.sourceBindings ?? {})) {
    sha256(value, `refresh plan source binding ${key}`);
  }
  const source = document.sourceContract;
  if (document.mode === 'COMPLETE_AFFILIATE_FEED_REPLAY'
    && (source?.sourceType !== 'affiliate_feed'
      || source.collectionMode !== 'partnerize_feed_only'
      || source.termsReviewState !== 'authorized_partner_feed')) {
    throw new Error('refresh plan source is not an authorised complete affiliate feed');
  }
  if (document.mode === 'BOUNDED_EXACT_PRODUCT_API_CANARY'
    && (source?.sourceType !== 'public_retailer_api'
      || source.collectionMode !== 'bounded_exact_product_api'
      || source.termsReviewState !== 'pending_automated_scale_review'
      || source.maximumTargetsPerRun !== 20
      || source.minimumIntervalMs < 1000
      || JSON.stringify(source.stopHttpStatuses) !== JSON.stringify([403, 429]))) {
    throw new Error('refresh plan source does not satisfy bounded exact-product canary policy');
  }
  if (document.mode === 'BOUNDED_EXACT_PRODUCT_API_SCALE'
    && (source?.sourceType !== 'public_retailer_api'
      || source.collectionMode !== 'bounded_exact_product_api'
      || source.termsReviewState !== 'reviewed_bounded_exact_product_api'
      || source.maximumConcurrency !== 1
      || !Number.isInteger(source.maximumTargetsPerRun)
      || source.maximumTargetsPerRun < 1 || source.maximumTargetsPerRun > 100
      || !Number.isInteger(source.maximumConsecutiveFailures)
      || source.maximumConsecutiveFailures < 1 || source.maximumConsecutiveFailures > 10
      || !SHA256.test(String(source.canaryRunSha256 ?? ''))
      || source.minimumIntervalMs < 1000
      || JSON.stringify(source.stopHttpStatuses) !== JSON.stringify([403, 429]))) {
    throw new Error('refresh plan source does not satisfy reviewed bounded exact-product policy');
  }
  required(source.sourcePolicyId, 'refresh source policy ID');
  required(source.sourcePolicyVersion, 'refresh source policy version');
  required(source.adapterPolicyVersion, 'refresh adapter policy version');
  if (!Array.isArray(source.allowedHosts) || source.allowedHosts.length === 0) {
    throw new TypeError('refresh source allowed hosts required');
  }
  sortedUnique(document.targets, (target) => required(target.canonicalProductId, 'refresh target ID'), 'refresh target');
  sortedUnique(
    document.catalogScope,
    (product) => required(product.canonicalProductId, 'refresh catalogue product ID'),
    'refresh catalogue canonical product',
  );
  for (const target of document.targets) {
    if (!Array.isArray(target.sourceTasks) || target.sourceTasks.length === 0) {
      throw new TypeError(`refresh target missing source tasks: ${target.canonicalProductId}`);
    }
    sortedUnique(target.sourceTasks, (task) => required(task.baselineLinkId, 'source task ID'), 'refresh source task');
    const expectedExecutionState = document.mode === 'COMPLETE_AFFILIATE_FEED_REPLAY'
      ? 'RUNNABLE_AUTHORIZED_SOURCE'
      : document.mode === 'BOUNDED_EXACT_PRODUCT_API_CANARY'
        ? 'BOUNDED_CANARY_ONLY'
        : 'RUNNABLE_POLICY_REVIEWED_SOURCE';
    if (target.sourceTasks.some((task) => task.executionState !== expectedExecutionState)) {
      throw new Error(`refresh target contains source task outside plan execution mode: ${target.canonicalProductId}`);
    }
  }
  const catalogueIds = new Set(document.catalogScope.map((row) => row.canonicalProductId));
  if (document.targets.some((target) => !catalogueIds.has(target.canonicalProductId))) {
    throw new Error('refresh target is outside catalogue scope');
  }
  if (isExactProductMode(document.mode)) {
    const targetIds = document.targets.map((target) => target.canonicalProductId);
    const scopeIds = document.catalogScope.map((product) => product.canonicalProductId);
    const sourceTaskCount = document.targets.reduce((sum, target) => sum + target.sourceTasks.length, 0);
    if (targetIds.length === 0 || sourceTaskCount > source.maximumTargetsPerRun) {
      throw new Error(`exact-product plan exceeds maximum ${source.maximumTargetsPerRun} source requests`);
    }
    if (JSON.stringify(targetIds) !== JSON.stringify(scopeIds)) {
      throw new Error('exact-product canary catalogue scope must equal selected targets');
    }
  }
  const expectedSummary = {
    targets: document.targets.length,
    sourceTasks: document.targets.reduce((sum, target) => sum + target.sourceTasks.length, 0),
    catalogProducts: document.catalogScope.length,
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new Error('retail lifecycle refresh plan summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document, 'planId'));
  if (document.semanticSha256 !== semantic
    || document.planId !== `retail_lifecycle_refresh_plan_${semantic.slice(0, 24)}`) {
    throw new Error('retail lifecycle refresh plan integrity mismatch');
  }
  return document;
}

export function buildRetailLifecycleRefreshPlan({
  inventory,
  inventorySha256,
  publicProjection,
  publicProjectionSha256,
  sourcePolicy,
  sourcePolicySha256,
  sourcePolicyId,
  observedAt,
  selectedCanonicalProductIds = null,
}) {
  validateRetailLifecycleRefreshInventory(inventory);
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public catalogue projection required');
  }
  const normalizedPolicy = normalizeRetailerSourcePolicy(sourcePolicy);
  const source = normalizedPolicy.sources.find((candidate) => candidate.id === sourcePolicyId);
  if (!source) throw new TypeError(`unknown retailer source policy ${sourcePolicyId}`);
  if (source.termsReviewState === 'collection_blocked') {
    throw new Error(`retailer source policy is blocked: ${source.id}`);
  }
  const completeFeed = source.sourceType === 'affiliate_feed'
    && source.collectionMode === 'partnerize_feed_only'
    && source.termsReviewState === 'authorized_partner_feed';
  const exactProductCanary = source.sourceType === 'public_retailer_api'
    && source.collectionMode === 'bounded_exact_product_api'
    && source.termsReviewState === 'pending_automated_scale_review';
  const exactProductScale = source.sourceType === 'public_retailer_api'
    && source.collectionMode === 'bounded_exact_product_api'
    && source.termsReviewState === 'reviewed_bounded_exact_product_api';
  if (!completeFeed && !exactProductCanary && !exactProductScale) {
    throw new Error(`retailer source is not approved for a supported refresh mode: ${source.id}`);
  }
  let targets = inventory.items
    .map((item) => normalizedTarget(item, source.id))
    .filter(Boolean)
    .sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  sortedUnique(targets, (target) => target.canonicalProductId, 'refresh target canonical product');
  if (exactProductCanary || exactProductScale) {
    if (!Array.isArray(selectedCanonicalProductIds) || selectedCanonicalProductIds.length === 0) {
      throw new TypeError('exact-product canary selected canonical product IDs required');
    }
    const selected = [...selectedCanonicalProductIds]
      .map((id) => required(id, 'selected canonical product ID'))
      .sort();
    if (new Set(selected).size !== selected.length) throw new TypeError('duplicate selected canonical product ID');
    const maximumTargets = exactProductCanary ? 20 : source.automationControls?.maximumTargetsPerRun;
    if (!Number.isInteger(maximumTargets)) throw new Error('bounded exact-product maximum is unavailable');
    const available = new Set(targets.map((target) => target.canonicalProductId));
    const unknown = selected.filter((id) => !available.has(id));
    if (unknown.length) throw new Error(`selected target is not an executable exact-product task: ${unknown[0]}`);
    const selectedSet = new Set(selected);
    targets = targets.filter((target) => selectedSet.has(target.canonicalProductId));
    const selectedSourceTasks = targets.reduce((sum, target) => sum + target.sourceTasks.length, 0);
    if (selectedSourceTasks > maximumTargets) {
      throw new Error(`bounded exact-product maximum is ${maximumTargets} source requests`);
    }
  } else if (selectedCanonicalProductIds != null) {
    throw new TypeError('complete affiliate feed plan does not accept a target subset');
  }
  let catalogScope = publicProjection.products
    .map(normalizedProjectionIdentity)
    .sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  sortedUnique(catalogScope, (product) => product.canonicalProductId, 'catalogue canonical product');
  if (exactProductCanary || exactProductScale) {
    const targetIds = new Set(targets.map((target) => target.canonicalProductId));
    catalogScope = catalogScope.filter((product) => targetIds.has(product.canonicalProductId));
    if (catalogScope.length !== targets.length) throw new Error('selected exact-product target is missing from catalogue');
  }
  const document = {
    schemaVersion: 1,
    planPolicyVersion: 'retail-lifecycle-refresh-plan-v1',
    mode: completeFeed
      ? 'COMPLETE_AFFILIATE_FEED_REPLAY'
      : exactProductCanary ? 'BOUNDED_EXACT_PRODUCT_API_CANARY' : 'BOUNDED_EXACT_PRODUCT_API_SCALE',
    observedAt: timestamp(observedAt, 'refresh plan observedAt'),
    sourceBindings: {
      inventorySha256: sha256(inventorySha256, 'refresh inventory SHA-256'),
      inventorySemanticSha256: sha256(inventory.semanticSha256 ?? canonicalSha256(inventory), 'refresh inventory semantic SHA-256'),
      publicProjectionSha256: sha256(publicProjectionSha256, 'public projection SHA-256'),
      publicProjectionSemanticSha256: sha256(
        publicProjection.semanticSha256 ?? canonicalSha256(publicProjection),
        'public projection semantic SHA-256',
      ),
      sourcePolicySha256: sha256(sourcePolicySha256, 'retailer source policy SHA-256'),
    },
    sourceContract: sourceContract(source, normalizedPolicy),
    targets,
    catalogScope,
    summary: {
      targets: targets.length,
      sourceTasks: targets.reduce((sum, target) => sum + target.sourceTasks.length, 0),
      catalogProducts: catalogScope.length,
    },
  };
  const semantic = canonicalSha256(document);
  document.planId = `retail_lifecycle_refresh_plan_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailLifecycleRefreshPlan(document));
}

function validateRawObject(rawObject, snapshot, plan) {
  if (!rawObject || typeof rawObject !== 'object') throw new TypeError('successful refresh record raw object required');
  const hash = sha256(rawObject.sha256, 'refresh raw object SHA-256');
  if (!Number.isInteger(rawObject.byteSize) || rawObject.byteSize < 1) {
    throw new TypeError('refresh raw object byte size must be positive');
  }
  const extension = rawObject.mediaType === 'text/csv' ? 'csv'
    : rawObject.mediaType === 'application/json' ? 'json' : 'bin';
  if (rawObject.objectPath !== retailerRawObjectPath(hash, extension)) {
    throw new Error('refresh raw object path is not content addressed');
  }
  if (snapshot.rawPayloadSha256 !== hash) {
    throw new Error('refresh raw object hash does not match snapshot raw payload');
  }
  if (rawObject.acquisitionReceipt == null) {
    if (snapshot.acquisitionReceiptSha256 != null) {
      throw new Error('refresh snapshot acquisition receipt lacks raw object receipt');
    }
    return;
  }
  const receipt = validateRetailerSourceAcquisitionReceipt(rawObject.acquisitionReceipt, {
    sourcePolicyId: plan.sourceContract.sourcePolicyId,
    sourcePolicySha256: plan.sourceBindings.sourcePolicySha256,
    acquisitionHosts: plan.sourceContract.acquisitionHosts,
    rawPayloadSha256: hash,
    byteSize: rawObject.byteSize,
  });
  if (receipt.receivedAt !== snapshot.observedAt
    || receipt.semanticSha256 !== snapshot.acquisitionReceiptSha256) {
    throw new Error('refresh acquisition receipt is not bound to snapshot time and hash');
  }
}

function validateSnapshot(snapshot, plan, record) {
  const source = plan.sourceContract;
  const contract = [
    ['adapterId', source.sourcePolicyId],
    ['retailer', source.retailer],
    ['sourceType', source.sourceType],
    ['policyVersion', source.adapterPolicyVersion],
    ['expectedCadenceHours', source.expectedCadenceHours],
    ['maximumCurrentAgeHours', source.maximumCurrentAgeHours],
    ['observedAt', plan.observedAt],
  ];
  for (const [field, expected] of contract) {
    if (snapshot?.[field] !== expected) throw new Error(`refresh snapshot source policy drift: ${field}`);
  }
  const expectedScope = plan.mode === 'COMPLETE_AFFILIATE_FEED_REPLAY'
    ? plan.catalogScope.map((row) => row.canonicalProductId)
    : [required(record.canonicalProductId, 'exact-product record canonical product ID')];
  if (plan.mode === 'COMPLETE_AFFILIATE_FEED_REPLAY'
    && (snapshot.collectionStatus !== 'succeeded' || snapshot.complete !== true)) {
    throw new Error('complete affiliate feed snapshot must be successful and complete');
  }
  if (isExactProductMode(plan.mode)
    && (snapshot.complete !== false
      || snapshot.canonicalProductIds.length !== 1
      || snapshot.rows.length > 1)) {
    throw new Error('exact-product canary snapshot exceeds bounded scope');
  }
  if (JSON.stringify(snapshot.canonicalProductIds) !== JSON.stringify(expectedScope)) {
    throw new Error('refresh snapshot catalogue scope mismatch');
  }
  const allowed = new Set(expectedScope);
  if (snapshot.rows.some((row) => !allowed.has(row.canonicalProductId))) {
    throw new Error('refresh snapshot row escapes catalogue scope');
  }
  createRetailerObservationsFromSnapshot(snapshot);
}

export function validateRetailLifecycleRefreshRun(document) {
  if (!document || document.schemaVersion !== 1
    || document.runPolicyVersion !== 'retail-lifecycle-refresh-run-v1'
    || !Array.isArray(document.records)) {
    throw new TypeError('retail lifecycle refresh run schema v1 required');
  }
  if (!SAFE_ID.test(required(document.runId, 'refresh run ID'))) throw new TypeError('refresh run ID is unsafe');
  const plan = validateRetailLifecycleRefreshPlan(document.plan);
  if (document.status !== 'completed') throw new Error('only completed retailer refresh runs can be replayed');
  sortedUnique(document.records, (record) => required(record.recordId, 'refresh record ID'), 'refresh record');
  if (plan.mode === 'COMPLETE_AFFILIATE_FEED_REPLAY' && document.records.length !== 1) {
    throw new Error('complete affiliate feed run requires exactly one record');
  }
  if (isExactProductMode(plan.mode)) {
    const expectedTaskIds = plan.targets
      .flatMap((target) => target.sourceTasks.map((task) => task.baselineLinkId))
      .sort();
    const taskBound = document.records.every((record) => record.baselineLinkId != null);
    const legacyProductBound = document.records.every((record) => record.baselineLinkId == null)
      && plan.targets.every((target) => target.sourceTasks.length === 1);
    if (taskBound) {
      const recordTaskIds = document.records
        .map((record) => required(record.baselineLinkId, 'exact-product record baseline link ID'))
        .sort();
      if (JSON.stringify(recordTaskIds) !== JSON.stringify(expectedTaskIds)) {
        throw new Error('exact-product run must account for every selected source task exactly once');
      }
    } else if (legacyProductBound) {
      const targetIds = plan.targets.map((target) => target.canonicalProductId);
      const recordIds = document.records.map((record) => required(
        record.canonicalProductId,
        'exact-product record canonical product ID',
      ));
      if (JSON.stringify(recordIds) !== JSON.stringify(targetIds)) {
        throw new Error('legacy exact-product run must account for every selected target exactly once');
      }
    } else {
      throw new Error('exact-product run mixes product and source-task record grain');
    }
  }
  for (const record of document.records) {
    if (!OUTCOMES.has(record.outcome)) throw new TypeError(`unsupported refresh record outcome ${record.outcome}`);
    if (!Array.isArray(record.quarantines)) throw new TypeError('refresh record quarantines required');
    if (record.outcome === 'succeeded') {
      validateSnapshot(record.snapshot, plan, record);
      if (record.snapshot.collectionStatus !== 'succeeded') {
        throw new Error('successful refresh record requires successful snapshot');
      }
      validateRawObject(record.rawObject, record.snapshot, plan);
      if (record.error != null) throw new Error('successful refresh record cannot carry an error');
    } else {
      if (!isExactProductMode(plan.mode)) {
        throw new Error('complete affiliate feed run cannot publish a failed record');
      }
      validateSnapshot(record.snapshot, plan, record);
      if (record.snapshot.collectionStatus !== 'failed') {
        throw new Error('failed exact-product record requires a failed snapshot');
      }
      required(record.error, 'failed refresh record error');
      const identityFailure = record.snapshot.failureContext?.kind === 'identity_mismatch';
      const responseContractFailure = record.snapshot.failureContext?.kind === 'response_contract_failure';
      if (identityFailure) {
        if (!record.rawObject || record.quarantines.length !== 1
          || record.quarantines[0]?.kind !== 'identity_mismatch'
          || record.quarantines[0]?.baselineLinkId !== record.baselineLinkId
          || record.snapshot.failureContext.baselineLinkId !== record.baselineLinkId) {
          throw new Error('identity mismatch record requires one raw-bound listing quarantine');
        }
        validateRawObject(record.rawObject, record.snapshot, plan);
      } else if (responseContractFailure) {
        if (!record.rawObject || record.quarantines.length !== 0
          || record.snapshot.failureContext.baselineLinkId !== record.baselineLinkId
          || record.snapshot.failureContext.reasonCode !== 'AO_RESPONSE_CONTRACT_FAILURE') {
          throw new Error('response contract failure requires one raw-bound non-terminal listing attempt');
        }
        validateRawObject(record.rawObject, record.snapshot, plan);
      } else if (record.rawObject != null || record.snapshot.failureContext != null
        || record.quarantines.length !== 0) {
        throw new Error('ordinary failed exact-product record cannot carry raw or quarantine evidence');
      }
    }
  }
  const expectedSummary = {
    records: document.records.length,
    succeeded: document.records.filter((record) => record.outcome === 'succeeded').length,
    failed: document.records.filter((record) => record.outcome === 'failed').length,
    snapshots: document.records.filter((record) => record.snapshot != null).length,
    observations: document.records.reduce((sum, record) => sum + (record.snapshot?.rows.length ?? 0), 0),
    quarantines: document.records.reduce((sum, record) => sum + record.quarantines.length, 0),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new Error('retail lifecycle refresh run summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document, 'runId'));
  if (document.semanticSha256 !== semantic) throw new Error('retail lifecycle refresh run integrity mismatch');
  return document;
}

export function buildRetailLifecycleRefreshRun({ runId, plan, records }) {
  validateRetailLifecycleRefreshPlan(plan);
  if (!Array.isArray(records)) throw new TypeError('refresh run records required');
  const normalizedRecords = structuredClone(records)
    .sort((left, right) => String(left.recordId).localeCompare(String(right.recordId)));
  const document = {
    schemaVersion: 1,
    runPolicyVersion: 'retail-lifecycle-refresh-run-v1',
    runId: required(runId, 'refresh run ID'),
    status: 'completed',
    plan: structuredClone(plan),
    records: normalizedRecords,
    summary: {
      records: normalizedRecords.length,
      succeeded: normalizedRecords.filter((record) => record.outcome === 'succeeded').length,
      failed: normalizedRecords.filter((record) => record.outcome === 'failed').length,
      snapshots: normalizedRecords.filter((record) => record.snapshot != null).length,
      observations: normalizedRecords.reduce((sum, record) => sum + (record.snapshot?.rows.length ?? 0), 0),
      quarantines: normalizedRecords.reduce((sum, record) => sum + (record.quarantines?.length ?? 0), 0),
    },
  };
  document.semanticSha256 = canonicalSha256(semanticPayload(document, 'runId'));
  return freezeDeep(validateRetailLifecycleRefreshRun(document));
}

export function typedSnapshotsFromRetailLifecycleRefreshRun(document) {
  validateRetailLifecycleRefreshRun(document);
  return freezeDeep(document.records
    .map((record) => structuredClone(record.snapshot)));
}

function assertAffiliateFeedEpochAdvance(run, existingLedger) {
  if (run.plan.mode !== 'COMPLETE_AFFILIATE_FEED_REPLAY'
    || existingLedger?.schemaVersion !== 2
    || !Array.isArray(existingLedger.collectionAttempts)) return;
  const adapterId = run.plan.sourceContract.sourcePolicyId;
  const observedAt = run.plan.observedAt;
  const rawPayloadSha256 = run.records[0]?.rawObject?.sha256;
  const priorSameBytes = existingLedger.collectionAttempts.filter((attempt) => (
    attempt.adapterId === adapterId
      && attempt.rawPayloadSha256 === rawPayloadSha256
      && attempt.observedAt !== observedAt
  ));
  if (priorSameBytes.length === 0) return;
  const receipt = run.records[0]?.rawObject?.acquisitionReceipt;
  if (!receipt) {
    throw new Error(
      'identical affiliate feed source bytes cannot advance freshness without a distinct verified acquisition receipt',
    );
  }
  if (priorSameBytes.some((attempt) => attempt.acquisitionReceiptSha256 === receipt.semanticSha256)
    || priorSameBytes.some((attempt) => new Date(attempt.observedAt) >= new Date(observedAt))) {
    throw new Error('affiliate feed acquisition receipt is reused or does not advance source time');
  }
}

export async function applyRetailLifecycleRefreshRun({
  run,
  existingLedger,
  publicProjection,
  publicProjectionSha256,
  inventorySha256,
  inventorySemanticSha256,
  sourcePolicy,
  sourcePolicySha256,
  readObject,
}) {
  validateRetailLifecycleRefreshRun(run);
  if (typeof readObject !== 'function') throw new TypeError('retailer raw object reader required');
  const bindings = run.plan.sourceBindings;
  const currentBindings = {
    inventorySha256: sha256(inventorySha256, 'current refresh inventory SHA-256'),
    inventorySemanticSha256: sha256(
      inventorySemanticSha256,
      'current refresh inventory semantic SHA-256',
    ),
    publicProjectionSha256: sha256(publicProjectionSha256, 'current public projection SHA-256'),
    publicProjectionSemanticSha256: sha256(
      publicProjection?.semanticSha256 ?? canonicalSha256(publicProjection),
      'current public projection semantic SHA-256',
    ),
    sourcePolicySha256: sha256(sourcePolicySha256, 'current retailer source policy SHA-256'),
  };
  for (const [key, expected] of Object.entries(bindings)) {
    if (currentBindings[key] !== expected) {
      const label = key === 'sourcePolicySha256' ? 'source policy'
        : key.startsWith('inventory') ? 'refresh inventory' : 'public projection';
      throw new Error(`${label} drift blocks retailer refresh application`);
    }
  }
  const normalizedPolicy = normalizeRetailerSourcePolicy(sourcePolicy);
  const currentSource = normalizedPolicy.sources.find((source) => (
    source.id === run.plan.sourceContract.sourcePolicyId
  ));
  if (!currentSource
    || JSON.stringify(sourceContract(currentSource, normalizedPolicy))
      !== JSON.stringify(run.plan.sourceContract)) {
    throw new Error('source policy contract drift blocks retailer refresh application');
  }
  assertAffiliateFeedEpochAdvance(run, existingLedger);
  for (const record of run.records.filter((candidate) => candidate.rawObject != null)) {
    const bytes = Buffer.from(await readObject(record.rawObject.objectPath));
    if (bytes.length !== record.rawObject.byteSize) {
      throw new Error(`retailer raw object byte size mismatch: ${record.recordId}`);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== record.rawObject.sha256) {
      throw new Error(`retailer raw object hash mismatch: ${record.recordId}`);
    }
  }
  return buildRetailerObservationLedger({
    existingLedger,
    publicProjection,
    publicProjectionSha256: currentBindings.publicProjectionSha256,
    sourcePolicy,
    sourcePolicySha256: currentBindings.sourcePolicySha256,
    typedSnapshots: typedSnapshotsFromRetailLifecycleRefreshRun(run),
  });
}
