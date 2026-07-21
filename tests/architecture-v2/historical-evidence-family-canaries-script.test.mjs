import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveHistoricalEvidenceFamilyCanariesGeneratedAt,
} from '../../scripts/architecture-v2/build-historical-evidence-family-canaries.mjs';

test('family canary time preserves the previous event-ledger snapshot cursor', () => {
  assert.equal(deriveHistoricalEvidenceFamilyCanariesGeneratedAt({
    documentGraph: { generatedAt: '2026-07-18T00:00:00.000Z' },
    executableQueue: { generatedAt: '2026-07-19T19:32:08.439Z' },
    attemptLedger: { generatedAt: '2026-07-19T19:16:16.066Z' },
    previousCanaries: { generatedAt: '2030-01-01T00:00:00.000Z' },
  }), '2030-01-01T00:00:00.000Z');
});

test('family canary time requires at least one bound input timestamp', () => {
  assert.throws(
    () => deriveHistoricalEvidenceFamilyCanariesGeneratedAt(),
    /generatedAt source/i,
  );
});
