import { createHash } from 'node:crypto';

import { validateRetailLifecycleShadow } from './retail-lifecycle-shadow.mjs';
import { validateRetailerObservationCoverage } from './retailer-observation-coverage.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const EXECUTION_STATES = new Set([
  'RUNNABLE_AUTHORIZED_SOURCE',
  'BOUNDED_CANARY_ONLY',
  'BLOCKED_BY_SOURCE_POLICY',
]);

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

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function executionDisposition(tasks) {
  const states = new Set(tasks.map((task) => task.executionState));
  if (states.has('RUNNABLE_AUTHORIZED_SOURCE')) return 'RUNNABLE_AUTHORIZED_SOURCE';
  if (states.has('BOUNDED_CANARY_ONLY')) return 'BOUNDED_CANARY_ONLY';
  if (states.size === 1 && states.has('BLOCKED_BY_SOURCE_POLICY')) return 'BLOCKED_BY_SOURCE_POLICY';
  throw new Error('unresolved retailer source tasks have no safe execution disposition');
}

function semanticPayload(document) {
  const { inventoryId, semanticSha256, ...payload } = document;
  return payload;
}

export function validateRetailLifecycleRefreshInventory(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.items)) {
    throw new TypeError('retail lifecycle refresh inventory schema v1 required');
  }
  if (document.policyVersion !== 'retail-lifecycle-refresh-inventory-v1') {
    throw new TypeError('retail lifecycle refresh inventory policy unsupported');
  }
  for (const [key, value] of Object.entries(document.sourceBindings ?? {})) {
    sha256(value, `retail lifecycle refresh source binding ${key}`);
  }
  const ids = document.items.map((item) => required(item.canonicalProductId, 'refresh canonical product ID'));
  if (new Set(ids).size !== ids.length) throw new TypeError('duplicate refresh canonical product ID');
  if (ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError('retail lifecycle refresh items must be sorted');
  }
  for (const item of document.items) {
    if (item.lifecycleState !== 'UNKNOWN_RETAIL') {
      throw new TypeError(`refresh item is not unresolved: ${item.canonicalProductId}`);
    }
    if (!Array.isArray(item.sourceTasks) || item.sourceTasks.length === 0) {
      throw new TypeError(`refresh item missing source task: ${item.canonicalProductId}`);
    }
    const taskIds = item.sourceTasks.map((task) => required(task.baselineLinkId, 'refresh baseline link ID'));
    if (new Set(taskIds).size !== taskIds.length
      || taskIds.some((id, index) => index > 0 && taskIds[index - 1].localeCompare(id) > 0)) {
      throw new TypeError(`refresh source tasks must be sorted and unique: ${item.canonicalProductId}`);
    }
    for (const task of item.sourceTasks) {
      if (!EXECUTION_STATES.has(task.executionState)) {
        throw new TypeError(`unsupported refresh execution state: ${task.executionState}`);
      }
      if (task.terminalObservationState !== 'LEGACY_UNKNOWN'
        && !['TYPED_UNKNOWN', 'TYPED_CONFLICT', 'TYPED_REDIRECTED', 'TYPED_POLICY_EXCLUDED']
          .includes(task.terminalObservationState)) {
        throw new TypeError(`resolved retailer task cannot enter refresh inventory: ${task.baselineLinkId}`);
      }
    }
    if (item.executionDisposition !== executionDisposition(item.sourceTasks)) {
      throw new TypeError(`refresh execution disposition mismatch: ${item.canonicalProductId}`);
    }
  }
  const expectedSummary = {
    products: document.items.length,
    listings: document.items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
    byExecutionDisposition: countBy(document.items, (item) => item.executionDisposition),
    bySourceExecutionState: countBy(
      document.items.flatMap((item) => item.sourceTasks),
      (task) => task.executionState,
    ),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError('retail lifecycle refresh summary mismatch');
  }
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.inventoryId !== `retail_lifecycle_refresh_${semantic.slice(0, 24)}`) {
    throw new Error('retail lifecycle refresh inventory integrity mismatch');
  }
  return document;
}

export function buildRetailLifecycleRefreshInventory({
  shadow,
  shadowSha256,
  coverage,
  coverageSha256,
}) {
  validateRetailLifecycleShadow(shadow);
  validateRetailerObservationCoverage(coverage);
  const unresolved = new Set(shadow.cutover.unresolvedLegacyCurrentIds);
  const recordById = new Map(shadow.records.map((record) => [record.canonicalProductId, record]));
  const tasksByProduct = new Map();
  for (const item of coverage.items) {
    if (!unresolved.has(item.canonicalProductId)) continue;
    if (item.revalidation == null) continue;
    if (!tasksByProduct.has(item.canonicalProductId)) tasksByProduct.set(item.canonicalProductId, []);
    tasksByProduct.get(item.canonicalProductId).push({
      baselineLinkId: item.baselineLinkId,
      retailer: item.retailer,
      url: item.url,
      originSource: item.originSource,
      sourcePolicyId: item.sourcePolicyId,
      terminalObservationState: item.terminalObservationState,
      action: item.revalidation.action,
      executionState: item.revalidation.executionState,
      collectionMode: item.revalidation.collectionMode,
    });
  }
  const items = [...unresolved].sort().map((canonicalProductId) => {
    const record = recordById.get(canonicalProductId);
    if (!record) throw new Error(`refresh shadow record missing: ${canonicalProductId}`);
    const sourceTasks = (tasksByProduct.get(canonicalProductId) ?? [])
      .sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
    if (sourceTasks.length === 0) throw new Error(`refresh item missing source task: ${canonicalProductId}`);
    return {
      canonicalProductId,
      legacyRuntimeId: record.legacyRuntimeId,
      category: record.category,
      brand: record.brand,
      model: record.model,
      lifecycleState: record.lifecycleState,
      executionDisposition: executionDisposition(sourceTasks),
      sourceTasks,
    };
  });
  const document = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-refresh-inventory-v1',
    releaseEpoch: shadow.releaseEpoch,
    asOf: shadow.asOf,
    sourceBindings: {
      shadowSha256: sha256(shadowSha256, 'retail lifecycle shadow SHA-256'),
      shadowSemanticSha256: sha256(shadow.semanticSha256, 'retail lifecycle shadow semantic SHA-256'),
      coverageSha256: sha256(coverageSha256, 'retailer observation coverage SHA-256'),
      coverageSemanticSha256: sha256(coverage.semanticSha256, 'retailer observation coverage semantic SHA-256'),
    },
    items,
    summary: {
      products: items.length,
      listings: items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
      byExecutionDisposition: countBy(items, (item) => item.executionDisposition),
      bySourceExecutionState: countBy(items.flatMap((item) => item.sourceTasks), (task) => task.executionState),
    },
  };
  const semantic = canonicalSha256(document);
  document.inventoryId = `retail_lifecycle_refresh_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailLifecycleRefreshInventory(document));
}
