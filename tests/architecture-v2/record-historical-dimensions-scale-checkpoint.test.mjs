import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseHistoricalDimensionsScaleCheckpointArgs,
} from '../../scripts/architecture-v2/record-historical-dimensions-scale-checkpoint.mjs';

test('checkpoint CLI requires a bounded stage, run ID and external storage root', () => {
  const parsed = parseHistoricalDimensionsScaleCheckpointArgs([
    '--stage', 'discovery',
    '--run-id', 'scale-p0-a',
    '--storage-root', '/tmp/fitappliance-evidence',
  ]);
  assert.equal(parsed.stage, 'DISCOVERY');
  assert.equal(parsed.runId, 'scale-p0-a');
  assert.equal(parsed.storageRoot, '/tmp/fitappliance-evidence');

  assert.throws(() => parseHistoricalDimensionsScaleCheckpointArgs([
    '--stage', 'other', '--run-id', 'a', '--storage-root', '/tmp/storage',
  ]), /stage must be discovery or dimensions/i);
  assert.throws(() => parseHistoricalDimensionsScaleCheckpointArgs([
    '--stage', 'discovery', '--run-id', '../escape', '--storage-root', '/tmp/storage',
  ]), /run-id invalid/i);
});

test('discovery checkpoint rejects an audit path while dimensions permits one', () => {
  assert.throws(() => parseHistoricalDimensionsScaleCheckpointArgs([
    '--stage', 'discovery', '--run-id', 'a', '--storage-root', '/tmp/storage',
    '--audit', '/tmp/audit.json',
  ]), /audit is only valid for dimensions/i);
  const parsed = parseHistoricalDimensionsScaleCheckpointArgs([
    '--stage', 'dimensions', '--run-id', 'a', '--storage-root', '/tmp/storage',
    '--audit', '/tmp/audit.json',
  ]);
  assert.equal(parsed.stage, 'DIMENSIONS');
  assert.equal(parsed.audit, '/tmp/audit.json');
});
