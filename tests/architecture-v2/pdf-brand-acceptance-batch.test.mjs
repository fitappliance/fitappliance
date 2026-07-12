import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptanceCase } from '../../scripts/architecture-v2/run-pdf-brand-acceptance.mjs';

test('acceptance batch preserves multiple PDF candidates and official HTML fallback pages', () => {
  const result = acceptanceCase({
    id: 'lg-dvh5-08w', legacyRuntimeId: 'dryer-lg', brand: 'LG', model: 'DVH5-08W', category: 'dryer',
    urls: ['https://www.lg.com/wrong.pdf', 'https://www.lg.com/second.pdf'],
    productPageUrls: ['https://www.lg.com/au/washer-dryers/dryers/dvh5-08w/'],
  });
  assert.deepEqual(result.candidateUrls, [
    'https://www.lg.com/wrong.pdf', 'https://www.lg.com/second.pdf',
  ]);
  assert.deepEqual(result.productPageUrls, ['https://www.lg.com/au/washer-dryers/dryers/dvh5-08w/']);
  assert.equal(result.formFactor, null);
});

test('committed acceptance results carry geometry and Fit readiness for every accepted source', async () => {
  const results = JSON.parse(await (await import('node:fs/promises')).readFile(
    new URL('../../data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json', import.meta.url),
    'utf8',
  ));
  assert.equal(results.summary.entries, 10);
  assert.equal(results.outcomes.filter((row) => row.outcome === 'accepted').length, 10);
  assert.ok(results.outcomes.every((row) => row.geometryProjection?.evidenceLevel === 'dimensions'
    || row.geometryProjection?.evidenceLevel === 'verified'));
  assert.ok(results.outcomes.every((row) => Array.isArray(row.geometryProjection?.missingForVerifiedFit)));
  assert.ok(results.outcomes.every((row) => typeof row.geometryProjection?.successfulFitOutcome === 'string'));
});
