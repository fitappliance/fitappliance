import { createHash } from 'node:crypto';

import { validateRetailLifecycleShadow } from './retail-lifecycle-shadow.mjs';
import { validateRetailerObservationCoverage } from './retailer-observation-coverage.mjs';
import { validateRetailerIdentityMigration } from './retailer-identity-migration.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const EXECUTION_STATES = new Set([
  'RUNNABLE_AUTHORIZED_SOURCE',
  'BOUNDED_CANARY_ONLY',
  'BLOCKED_BY_SOURCE_POLICY',
  'RUNNABLE_POLICY_REVIEWED_SOURCE',
]);
const RESOLUTION_EXECUTION_STATES = new Set(['REQUIRES_DISCOVERY_PIPELINE']);
const CONTROL_EXECUTION_STATES = new Set([
  'PENDING_ATOMIC_IDENTITY_CUTOVER',
  'REQUIRES_AUTHORIZED_SOURCE_DISCOVERY',
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

function retailerUrl(value) {
  const url = new URL(required(value, 'retailer URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('retailer URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
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
  if (states.has('RUNNABLE_POLICY_REVIEWED_SOURCE')) return 'RUNNABLE_POLICY_REVIEWED_SOURCE';
  if (states.has('BOUNDED_CANARY_ONLY')) return 'BOUNDED_CANARY_ONLY';
  if (states.size === 1 && states.has('BLOCKED_BY_SOURCE_POLICY')) return 'BLOCKED_BY_SOURCE_POLICY';
  throw new Error('unresolved retailer source tasks have no safe execution disposition');
}

function itemExecutionDisposition(sourceTasks, resolutionTasks, controlTasks = []) {
  if (resolutionTasks.length === 1
    && resolutionTasks[0].executionState === 'REQUIRES_DISCOVERY_PIPELINE') {
    return 'REQUIRES_EXACT_MODEL_REDISCOVERY';
  }
  if (controlTasks.length === 1) return controlTasks[0].executionState;
  if (sourceTasks.length > 0) return executionDisposition(sourceTasks);
  throw new Error('unresolved product has no safe execution disposition');
}

function semanticPayload(document) {
  const { inventoryId, semanticSha256, ...payload } = document;
  return payload;
}

export function validateRetailLifecycleRefreshInventory(document) {
  if (!document || ![1, 2, 3].includes(document.schemaVersion) || !Array.isArray(document.items)) {
    throw new TypeError('retail lifecycle refresh inventory schema v1, v2, or v3 required');
  }
  const expectedPolicyVersion = document.schemaVersion === 1
    ? 'retail-lifecycle-refresh-inventory-v1'
    : document.schemaVersion === 2
      ? 'retail-lifecycle-refresh-inventory-v2'
      : 'retail-lifecycle-refresh-inventory-v3';
  if (document.policyVersion !== expectedPolicyVersion) {
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
    if (!Array.isArray(item.sourceTasks)) {
      throw new TypeError(`refresh item source tasks required: ${item.canonicalProductId}`);
    }
    const resolutionTasks = item.resolutionTasks ?? [];
    const controlTasks = item.controlTasks ?? [];
    if (!Array.isArray(resolutionTasks)) {
      throw new TypeError(`refresh item resolution tasks required: ${item.canonicalProductId}`);
    }
    if (document.schemaVersion === 1 && resolutionTasks.length > 0) {
      throw new TypeError(`schema v1 refresh item cannot carry resolution tasks: ${item.canonicalProductId}`);
    }
    if (document.schemaVersion < 3 && controlTasks.length > 0) {
      throw new TypeError(`legacy refresh item cannot carry control tasks: ${item.canonicalProductId}`);
    }
    if (item.sourceTasks.length + resolutionTasks.length + controlTasks.length === 0) {
      throw new TypeError(`refresh item missing executable or resolution task: ${item.canonicalProductId}`);
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
        && !['TYPED_UNKNOWN', 'TYPED_CONFLICT', 'TYPED_REDIRECTED', 'TYPED_POLICY_EXCLUDED',
          'SOURCE_ABSENT_IN_AUTHORIZED_FEED']
          .includes(task.terminalObservationState)) {
        throw new TypeError(`resolved retailer task cannot enter refresh inventory: ${task.baselineLinkId}`);
      }
    }
    const resolutionTaskIds = resolutionTasks.map((task) => required(
      task.resolutionTaskId,
      'refresh resolution task ID',
    ));
    if (new Set(resolutionTaskIds).size !== resolutionTaskIds.length
      || resolutionTaskIds.some((id, index) => index > 0
        && resolutionTaskIds[index - 1].localeCompare(id) > 0)) {
      throw new TypeError(`refresh resolution tasks must be sorted and unique: ${item.canonicalProductId}`);
    }
    for (const task of resolutionTasks) {
      if (task.kind !== 'EXACT_MODEL_RETAIL_REDISCOVERY'
        || task.action !== 'DISCOVER_EXACT_MODEL_RETAIL_SOURCE'
        || !RESOLUTION_EXECUTION_STATES.has(task.executionState)) {
        throw new TypeError(`unsupported refresh resolution task: ${task.resolutionTaskId}`);
      }
      if (!Array.isArray(task.quarantinedSources) || task.quarantinedSources.length === 0) {
        throw new TypeError(`refresh resolution task missing quarantined sources: ${task.resolutionTaskId}`);
      }
      const quarantinedIds = task.quarantinedSources.map((source) => required(
        source.baselineLinkId,
        'quarantined baseline link ID',
      ));
      if (new Set(quarantinedIds).size !== quarantinedIds.length
        || quarantinedIds.some((id, index) => index > 0
          && quarantinedIds[index - 1].localeCompare(id) > 0)) {
        throw new TypeError(`quarantined sources must be sorted and unique: ${task.resolutionTaskId}`);
      }
      if (JSON.stringify(task.quarantinedBaselineLinkIds) !== JSON.stringify(quarantinedIds)) {
        throw new TypeError(`quarantined source ID projection mismatch: ${task.resolutionTaskId}`);
      }
      for (const source of task.quarantinedSources) {
        retailerUrl(source.url);
        required(source.reasonCode, 'identity mismatch reason code');
        required(source.receivedModel, 'identity mismatch received model');
      }
      const expectedIdentity = task.expectedIdentity ?? {};
      for (const key of ['category', 'brand', 'model']) {
        if (required(expectedIdentity[key], `resolution expected ${key}`) !== required(item[key], `refresh ${key}`)) {
          throw new TypeError(`resolution expected identity mismatch: ${task.resolutionTaskId}`);
        }
      }
      const expectedTaskId = `retail_resolution_${canonicalSha256({
        canonicalProductId: item.canonicalProductId,
        quarantinedBaselineLinkIds: quarantinedIds,
      }).slice(0, 24)}`;
      if (task.resolutionTaskId !== expectedTaskId) {
        throw new TypeError(`refresh resolution task ID mismatch: ${task.resolutionTaskId}`);
      }
    }
    const controlTaskIds = controlTasks.map((task) => required(task.controlTaskId, 'refresh control task ID'));
    if (new Set(controlTaskIds).size !== controlTaskIds.length
      || controlTaskIds.some((id, index) => index > 0
        && controlTaskIds[index - 1].localeCompare(id) > 0)) {
      throw new TypeError(`refresh control tasks must be sorted and unique: ${item.canonicalProductId}`);
    }
    if (controlTasks.length > 1 || (controlTasks.length > 0
      && (resolutionTasks.length > 0 || item.sourceTasks.length > 0))) {
      throw new TypeError(`refresh control task must be the sole product action: ${item.canonicalProductId}`);
    }
    for (const task of controlTasks) {
      if (!CONTROL_EXECUTION_STATES.has(task.executionState)
        || !Array.isArray(task.identityEventIds) || task.identityEventIds.length === 0
        || new Set(task.identityEventIds).size !== task.identityEventIds.length
        || task.identityEventIds.some((id, index) => index > 0
          && task.identityEventIds[index - 1].localeCompare(id) > 0)) {
        throw new TypeError(`unsupported refresh control task: ${task.controlTaskId}`);
      }
      const merge = task.kind === 'CANONICAL_IDENTITY_MIGRATION'
        && task.action === 'APPLY_DECLARATIVE_CANONICAL_MERGE'
        && task.canonicalAction === 'MERGE_DUPLICATE_CANONICAL'
        && task.executionState === 'PENDING_ATOMIC_IDENTITY_CUTOVER';
      const quarantine = task.kind === 'CANONICAL_IDENTITY_MIGRATION'
        && task.action === 'APPLY_DECLARATIVE_CANONICAL_QUARANTINE'
        && task.canonicalAction === 'QUARANTINE_UNSUPPORTED_CANONICAL'
        && task.executionState === 'PENDING_ATOMIC_IDENTITY_CUTOVER';
      const discovery = task.kind === 'EXACT_MODEL_RETAIL_SOURCE_DISCOVERY'
        && task.action === 'DISCOVER_AUTHORIZED_EXACT_MODEL_RETAIL_SOURCE'
        && task.canonicalAction === 'KEEP_CANONICAL_IDENTITY'
        && task.executionState === 'REQUIRES_AUTHORIZED_SOURCE_DISCOVERY';
      if (!merge && !quarantine && !discovery) {
        throw new TypeError(`refresh control task contract mismatch: ${task.controlTaskId}`);
      }
      const expectedId = `retail_control_${canonicalSha256({
        canonicalProductId: item.canonicalProductId,
        canonicalAction: task.canonicalAction,
        identityEventIds: task.identityEventIds,
      }).slice(0, 24)}`;
      if (task.controlTaskId !== expectedId) {
        throw new TypeError(`refresh control task ID mismatch: ${task.controlTaskId}`);
      }
    }
    if (item.executionDisposition !== itemExecutionDisposition(
      item.sourceTasks,
      resolutionTasks,
      controlTasks,
    )) {
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
  if (document.schemaVersion >= 2) {
    expectedSummary.resolutionTasks = document.items.reduce(
      (sum, item) => sum + item.resolutionTasks.length,
      0,
    );
    expectedSummary.byResolutionExecutionState = countBy(
      document.items.flatMap((item) => item.resolutionTasks),
      (task) => task.executionState,
    );
  }
  if (document.schemaVersion >= 3) {
    expectedSummary.controlTasks = document.items.reduce(
      (sum, item) => sum + item.controlTasks.length,
      0,
    );
    expectedSummary.byControlExecutionState = countBy(
      document.items.flatMap((item) => item.controlTasks),
      (task) => task.executionState,
    );
  }
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
  identityMigration,
  identityMigrationSha256,
}) {
  validateRetailLifecycleShadow(shadow);
  validateRetailerObservationCoverage(coverage);
  validateRetailerIdentityMigration(identityMigration);
  const migrationCases = new Map(identityMigration.cases.map((row) => [
    row.sourceCanonicalProductId,
    row,
  ]));
  if (migrationCases.size !== identityMigration.cases.length) {
    throw new TypeError('identity migration contains duplicate source canonical products');
  }
  const migrationEvents = new Map();
  for (const event of identityMigration.linkEvents) {
    if (!migrationEvents.has(event.sourceCanonicalProductId)) {
      migrationEvents.set(event.sourceCanonicalProductId, []);
    }
    migrationEvents.get(event.sourceCanonicalProductId).push(event.id);
  }
  for (const events of migrationEvents.values()) events.sort();
  const appliedEventIds = new Set(coverage.items
    .filter((item) => item.typedObservation?.kind === 'IDENTITY_RESOLUTION')
    .map((item) => item.typedObservation.eventId));
  for (const event of identityMigration.linkEvents) {
    if (!appliedEventIds.has(event.id)) {
      throw new Error(`identity migration event is not reflected in coverage: ${event.id}`);
    }
  }
  const unresolved = new Set(shadow.cutover.unresolvedLegacyCurrentIds);
  const recordById = new Map(shadow.records.map((record) => [record.canonicalProductId, record]));
  const tasksByProduct = new Map();
  const mismatchesByProduct = new Map();
  for (const item of coverage.items) {
    if (!unresolved.has(item.canonicalProductId)) continue;
    if (item.terminalObservationState === 'QUARANTINED_IDENTITY_MISMATCH') {
      if (!mismatchesByProduct.has(item.canonicalProductId)) {
        mismatchesByProduct.set(item.canonicalProductId, []);
      }
      mismatchesByProduct.get(item.canonicalProductId).push({
        baselineLinkId: item.baselineLinkId,
        retailer: item.retailer,
        url: item.url,
        reasonCode: item.typedObservation.reasonCode,
        receivedModel: item.typedObservation.receivedModel,
        rawSourceSha256: item.typedObservation.rawSourceSha256,
      });
    }
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
    const quarantinedSources = (mismatchesByProduct.get(canonicalProductId) ?? [])
      .sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
    const resolutionTasks = quarantinedSources.length > 0 ? [{
      resolutionTaskId: `retail_resolution_${canonicalSha256({
        canonicalProductId,
        quarantinedBaselineLinkIds: quarantinedSources.map((source) => source.baselineLinkId),
      }).slice(0, 24)}`,
      kind: 'EXACT_MODEL_RETAIL_REDISCOVERY',
      action: 'DISCOVER_EXACT_MODEL_RETAIL_SOURCE',
      executionState: 'REQUIRES_DISCOVERY_PIPELINE',
      expectedIdentity: {
        category: record.category,
        brand: record.brand,
        model: record.model,
      },
      quarantinedBaselineLinkIds: quarantinedSources.map((source) => source.baselineLinkId),
      quarantinedSources,
    }] : [];
    const migrationCase = migrationCases.get(canonicalProductId) ?? null;
    const identityEventIds = migrationEvents.get(canonicalProductId) ?? [];
    let controlTasks = [];
    if (['MERGE_DUPLICATE_CANONICAL', 'QUARANTINE_UNSUPPORTED_CANONICAL']
      .includes(migrationCase?.action)) {
      sourceTasks.splice(0);
      resolutionTasks.splice(0);
      const quarantine = migrationCase.action === 'QUARANTINE_UNSUPPORTED_CANONICAL';
      controlTasks = [{
        controlTaskId: `retail_control_${canonicalSha256({
          canonicalProductId,
          canonicalAction: migrationCase.action,
          identityEventIds,
        }).slice(0, 24)}`,
        kind: 'CANONICAL_IDENTITY_MIGRATION',
        action: quarantine
          ? 'APPLY_DECLARATIVE_CANONICAL_QUARANTINE'
          : 'APPLY_DECLARATIVE_CANONICAL_MERGE',
        executionState: 'PENDING_ATOMIC_IDENTITY_CUTOVER',
        canonicalAction: migrationCase.action,
        identityEventIds,
      }];
    } else if (migrationCase?.action === 'CORRECT_CANONICAL_MODEL') {
      throw new Error(`corrected canonical identity remains unresolved: ${canonicalProductId}`);
    } else if (sourceTasks.length + resolutionTasks.length === 0
      && migrationCase?.action === 'KEEP_CANONICAL_IDENTITY') {
      controlTasks = [{
        controlTaskId: `retail_control_${canonicalSha256({
          canonicalProductId,
          canonicalAction: migrationCase.action,
          identityEventIds,
        }).slice(0, 24)}`,
        kind: 'EXACT_MODEL_RETAIL_SOURCE_DISCOVERY',
        action: 'DISCOVER_AUTHORIZED_EXACT_MODEL_RETAIL_SOURCE',
        executionState: 'REQUIRES_AUTHORIZED_SOURCE_DISCOVERY',
        canonicalAction: migrationCase.action,
        identityEventIds,
      }];
    }
    if (sourceTasks.length + resolutionTasks.length + controlTasks.length === 0) {
      throw new Error(`refresh item missing executable or identity rediscovery task: ${canonicalProductId}`);
    }
    return {
      canonicalProductId,
      legacyRuntimeId: record.legacyRuntimeId,
      category: record.category,
      brand: record.brand,
      model: record.model,
      lifecycleState: record.lifecycleState,
      executionDisposition: itemExecutionDisposition(sourceTasks, resolutionTasks, controlTasks),
      sourceTasks,
      resolutionTasks,
      controlTasks,
    };
  });
  const document = {
    schemaVersion: 3,
    policyVersion: 'retail-lifecycle-refresh-inventory-v3',
    releaseEpoch: shadow.releaseEpoch,
    asOf: shadow.asOf,
    sourceBindings: {
      shadowSha256: sha256(shadowSha256, 'retail lifecycle shadow SHA-256'),
      shadowSemanticSha256: sha256(shadow.semanticSha256, 'retail lifecycle shadow semantic SHA-256'),
      coverageSha256: sha256(coverageSha256, 'retailer observation coverage SHA-256'),
      coverageSemanticSha256: sha256(coverage.semanticSha256, 'retailer observation coverage semantic SHA-256'),
      identityMigrationSha256: sha256(
        identityMigrationSha256,
        'retailer identity migration SHA-256',
      ),
      identityMigrationSemanticSha256: sha256(
        identityMigration.semanticSha256,
        'retailer identity migration semantic SHA-256',
      ),
    },
    items,
    summary: {
      products: items.length,
      listings: items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
      byExecutionDisposition: countBy(items, (item) => item.executionDisposition),
      bySourceExecutionState: countBy(items.flatMap((item) => item.sourceTasks), (task) => task.executionState),
      resolutionTasks: items.reduce((sum, item) => sum + item.resolutionTasks.length, 0),
      byResolutionExecutionState: countBy(
        items.flatMap((item) => item.resolutionTasks),
        (task) => task.executionState,
      ),
      controlTasks: items.reduce((sum, item) => sum + item.controlTasks.length, 0),
      byControlExecutionState: countBy(
        items.flatMap((item) => item.controlTasks),
        (task) => task.executionState,
      ),
    },
  };
  const semantic = canonicalSha256(document);
  document.inventoryId = `retail_lifecycle_refresh_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailLifecycleRefreshInventory(document));
}
