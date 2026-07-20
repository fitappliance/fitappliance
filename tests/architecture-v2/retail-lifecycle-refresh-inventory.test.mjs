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
  const shadow = JSON.parse(shadowBytes);
  const coverage = JSON.parse(coverageBytes);
  const inventory = buildRetailLifecycleRefreshInventory({
    shadow,
    shadowSha256: hash(shadowBytes),
    coverage,
    coverageSha256: hash(coverageBytes),
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
    item.sourceTasks.length + item.resolutionTasks.length > 0
  )));
  assert.ok(inventory.items.every((item) => item.lifecycleState === 'UNKNOWN_RETAIL'));
  assert.ok(inventory.items.every((item) => item.sourceTasks.every((source) => (
    source.terminalObservationState !== 'TYPED_AVAILABLE'
    && source.terminalObservationState !== 'TYPED_UNAVAILABLE'
  ))));

  const identityRediscovery = inventory.items.find((item) => item.model === 'GS-B655PL');
  assert.ok(identityRediscovery, 'identity-quarantined product remains in the unresolved inventory');
  assert.equal(identityRediscovery.sourceTasks.length, 0);
  assert.equal(identityRediscovery.executionDisposition, 'REQUIRES_EXACT_MODEL_REDISCOVERY');
  assert.deepEqual(identityRediscovery.resolutionTasks.map((task) => ({
    action: task.action,
    executionState: task.executionState,
    expectedModel: task.expectedIdentity.model,
    quarantinedBaselineLinkIds: task.quarantinedBaselineLinkIds,
  })), [{
    action: 'DISCOVER_EXACT_MODEL_RETAIL_SOURCE',
    executionState: 'REQUIRES_DISCOVERY_PIPELINE',
    expectedModel: 'GS-B655PL',
    quarantinedBaselineLinkIds: ['retail_link_8248f5525f2a0c2266b3970d'],
  }]);
  assert.equal(inventory.summary.resolutionTasks, 1);
});
