import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAdjustableHeightMigrationAudit } from '../../src/domain/adjustable-height-migration.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('legacy adjustable heights remain ranges and only receipt-bound ranges publish', () => {
  const audit = buildAdjustableHeightMigrationAudit({
    phase8Selection: readJson('data/architecture-v2/reviews/phase-08/evidence-pilot.json'),
    phase8ReviewInput: readJson('data/architecture-v2/reviews/phase-08/evidence-pilot-review-input.json'),
    publicProjection: readJson('data/architecture-v2/generated/public-catalog-projection.json'),
    mineruAudit: readJson('data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json'),
    generatedAt: '2026-07-12T00:00:00.000Z',
  });
  assert.equal(audit.summary.cases, 3);
  assert.equal(audit.summary.publishedReceiptBoundRange, 3);
  assert.ok(audit.cases.every((entry) => (
    entry.expectedRange.minimumMm === 850
    && entry.expectedRange.maximumMm === 895
    && entry.scalarCoercionAllowed === false
    && entry.placementHeightMm === 895
  )));
  assert.deepEqual(audit.cases.map((entry) => entry.legacyRuntimeId).sort(), [
    'dishwasher-adw0961',
    'dishwasher-adw1146',
    'dishwasher-adw1276',
  ]);
  assert.ok(audit.cases.every((entry) => (
    entry.status === 'published_receipt_bound_range' && entry.publication.release === true
  )));
});
