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
  assert.equal(inventory.summary.products, 1384);
  assert.equal(inventory.summary.listings, 1614);
  assert.deepEqual(inventory.summary.byExecutionDisposition, {
    BLOCKED_BY_SOURCE_POLICY: 40,
    BOUNDED_CANARY_ONLY: 1172,
    RUNNABLE_AUTHORIZED_SOURCE: 172,
  });
  assert.deepEqual(
    inventory.items.map((item) => item.canonicalProductId),
    [...shadow.cutover.unresolvedLegacyCurrentIds].sort(),
  );
  assert.ok(inventory.items.every((item) => item.sourceTasks.length > 0));
  assert.ok(inventory.items.every((item) => item.lifecycleState === 'UNKNOWN_RETAIL'));
  assert.ok(inventory.items.every((item) => item.sourceTasks.every((source) => (
    source.terminalObservationState !== 'TYPED_AVAILABLE'
    && source.terminalObservationState !== 'TYPED_UNAVAILABLE'
  ))));
});
