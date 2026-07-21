import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveHistoricalOfficialCandidateManifestGeneratedAt,
} from '../../scripts/architecture-v2/build-historical-official-candidate-manifest.mjs';

test('candidate manifest time ignores a stale prior wrapper timestamp', () => {
  assert.equal(deriveHistoricalOfficialCandidateManifestGeneratedAt({
    acquisitionQueue: { generatedAt: '2026-07-19T19:32:08.439Z' },
    priorManifest: {
      generatedAt: '2030-01-01T00:00:00.000Z',
      targets: [{ lastDiscoveryAt: '2026-07-18T00:00:00.000Z' }],
      candidates: [{ discoveries: [{ retrievedAt: '2026-07-17T04:19:39.580Z' }] }],
    },
  }), '2026-07-19T19:32:08.439Z');
});

test('candidate manifest time preserves a newer retained discovery observation', () => {
  assert.equal(deriveHistoricalOfficialCandidateManifestGeneratedAt({
    acquisitionQueue: { generatedAt: '2026-07-19T19:32:08.439Z' },
    priorManifest: {
      targets: [{ lastDiscoveryAt: '2026-07-20T01:02:03.000Z' }],
      candidates: [{ discoveries: [{ retrievedAt: '2026-07-20T02:03:04.000Z' }] }],
    },
  }), '2026-07-20T02:03:04.000Z');
});

test('candidate manifest time requires a bound input timestamp', () => {
  assert.throws(
    () => deriveHistoricalOfficialCandidateManifestGeneratedAt(),
    /timestamp/i,
  );
});
