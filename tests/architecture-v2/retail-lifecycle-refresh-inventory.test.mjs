import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRetailLifecycleRefreshInventory,
  validateRetailLifecycleRefreshInventory,
} from '../../src/domain/retail-lifecycle-refresh-inventory.mjs';

const bytes = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('refresh inventory accounts for every unresolved prior-current product without synthesizing a state', () => {
  const shadowBytes = bytes('../../data/architecture-v2/reviews/automated/retail-lifecycle-shadow.json');
  const coverageBytes = bytes('../../data/architecture-v2/reviews/automated/retailer-observation-coverage.json');
  const identityMigrationBytes = bytes('../../data/architecture-v2/reviews/automated/retailer-identity-migration.json');
  const shadow = JSON.parse(shadowBytes);
  const coverage = JSON.parse(coverageBytes);
  const identityMigration = JSON.parse(identityMigrationBytes);
  const inventory = buildRetailLifecycleRefreshInventory({
    shadow,
    shadowSha256: hash(shadowBytes),
    coverage,
    coverageSha256: hash(coverageBytes),
    identityMigration,
    identityMigrationSha256: hash(identityMigrationBytes),
  });

  validateRetailLifecycleRefreshInventory(inventory);
  assert.equal(inventory.summary.products, shadow.cutover.unresolvedLegacyCurrentIds.length);
  assert.equal(
    inventory.summary.listings,
    inventory.items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
  );
  assert.equal(
    Object.values(inventory.summary.byExecutionDisposition).reduce((sum, count) => sum + count, 0),
    inventory.summary.products,
  );
  assert.deepEqual(
    inventory.items.map((item) => item.canonicalProductId),
    [...shadow.cutover.unresolvedLegacyCurrentIds].sort(),
  );
  assert.ok(inventory.items.every((item) => (
    item.sourceTasks.length + item.resolutionTasks.length + item.controlTasks.length > 0
  )));
  assert.ok(inventory.items.every((item) => item.lifecycleState === 'UNKNOWN_RETAIL'));
  assert.ok(inventory.items.every((item) => item.sourceTasks.every((source) => (
    source.terminalObservationState !== 'TYPED_AVAILABLE'
    && source.terminalObservationState !== 'TYPED_UNAVAILABLE'
  ))));

  const unresolvedIds = new Set(shadow.cutover.unresolvedLegacyCurrentIds);
  const mismatchProductIds = new Set(coverage.items
    .filter((item) => item.terminalObservationState === 'QUARANTINED_IDENTITY_MISMATCH')
    .map((item) => item.canonicalProductId)
    .filter((id) => unresolvedIds.has(id)));
  assert.equal(mismatchProductIds.size, 0);
  assert.equal(inventory.summary.resolutionTasks, 0);

  const identityConflict = inventory.items.find((item) => item.legacyRuntimeId === 'f3');
  assert.equal(identityConflict.sourceTasks.length, 0);
  assert.equal(identityConflict.resolutionTasks.length, 0);
  assert.equal(identityConflict.controlTasks[0].action, 'APPLY_DECLARATIVE_CANONICAL_QUARANTINE');
  assert.equal(identityConflict.executionDisposition, 'PENDING_ATOMIC_IDENTITY_CUTOVER');

  const mixedDependency = inventory.items.find((item) => item.legacyRuntimeId === 'f7');
  assert.equal(mixedDependency.sourceTasks.length, 0);
  assert.equal(mixedDependency.resolutionTasks.length, 0);
  assert.equal(mixedDependency.controlTasks[0].action, 'APPLY_DECLARATIVE_CANONICAL_MERGE');
  assert.equal(mixedDependency.executionDisposition, 'PENDING_ATOMIC_IDENTITY_CUTOVER');

  const identityRediscovery = inventory.items.find((item) => item.model === 'GS-B655PL');
  assert.equal(identityRediscovery, undefined, 'exact LG official evidence closes retail rediscovery');
  assert.equal(inventory.summary.resolutionTasks, 0);
  assert.equal(inventory.summary.controlTasks, 2);
});
