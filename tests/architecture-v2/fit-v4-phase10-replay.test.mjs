import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFitV4Phase10Replay } from '../../src/domain/fit-v4-phase10-replay.mjs';

const reviewManifest = JSON.parse(readFileSync(
  'data/architecture-v2/generated/phase10-evidence-review-manifest.json',
  'utf8',
));

test('replays the approved Phase 10 evidence without creating verified fit claims', () => {
  const report = buildFitV4Phase10Replay(reviewManifest);

  assert.equal(report.summary.selected, 40);
  assert.equal(report.summary.approvedExact, 36);
  assert.equal(report.summary.replayed, 36);
  assert.equal(report.summary.excluded, 4);
  assert.equal(report.summary.verifiedFit, 0);
  assert.deepEqual(report.summary.categories, {
    dishwasher: { selected: 10, replayed: 8 },
    dryer: { selected: 10, replayed: 10 },
    fridge: { selected: 10, replayed: 9 },
    washing_machine: { selected: 10, replayed: 9 },
  });
  assert.equal(report.records.length, 36);
  assert.ok(report.records.every((record) => record.outcome !== 'VERIFIED_FIT'));
  assert.ok(report.records.every((record) => /^[a-f0-9]{64}$/i.test(record.sourcePdfSha256)));
});

test('keeps excluded review outcomes visible instead of silently dropping the batch gap', () => {
  const report = buildFitV4Phase10Replay(reviewManifest);

  assert.deepEqual(report.summary.excludedByState, {
    no_source: 2,
    quarantined: 2,
  });
  assert.ok(report.excluded.some((record) => record.identityOutcome !== 'exact'));
});
