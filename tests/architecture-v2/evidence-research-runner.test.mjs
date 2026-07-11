import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchOfficialArtifact,
  runEvidenceResearchCycle,
} from '../../src/domain/evidence-research-runner.mjs';

const PAGE = `<!doctype html><html><head>
  <title>Model WHE6874BA | Westinghouse</title>
  <link rel="canonical" href="https://www.westinghouse.com.au/fridges/whe6874ba/">
</head><body data-product-model="WHE6874BA"><dl>
  <dt>Total width (mm)</dt><dd>913 mm</dd>
  <dt>Total height (mm)</dt><dd>1782 mm</dd>
  <dt>Total depth (mm)</dt><dd>803 mm</dd>
  <dt>Plumbed water supply required</dt><dd>Yes</dd>
</dl></body></html>`;

function caseRecord(overrides = {}) {
  return {
    id: 'case-1', legacyRuntimeId: 'fridge-1', brand: 'Westinghouse', model: 'WHE6874BA',
    category: 'fridge', attempt: 1, maxAttempts: 3, sources: [], history: [],
    candidateUrls: ['https://www.westinghouse.com.au/fridges/whe6874ba/'],
    initialFailure: { code: 'projection_conflict', conflictingFields: ['flags.requiresPlumbing'] },
    releasableQuarantineReasons: ['evidence_projection_hold'],
    ...overrides,
  };
}

test('official fetch records same-brand redirects and rejects redirect escape', async () => {
  const redirecting = async (url) => {
    if (url.endsWith('/start')) return new Response(null, {
      status: 302, headers: { location: '/fridges/whe6874ba/' },
    });
    return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  const fetched = await fetchOfficialArtifact('https://www.westinghouse.com.au/start', 'Westinghouse', {
    fetchImpl: redirecting,
  });
  assert.equal(fetched.finalUrl, 'https://www.westinghouse.com.au/fridges/whe6874ba/');
  assert.deepEqual(fetched.redirectChain, ['https://www.westinghouse.com.au/fridges/whe6874ba/']);

  await assert.rejects(() => fetchOfficialArtifact(
    'https://www.westinghouse.com.au/start', 'Westinghouse', {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/fake' } }),
    },
  ), /redirect.*official|official.*redirect/i);
});

test('research cycle discovers, extracts, attests, stores, and advances without a reviewer', async () => {
  const writes = [];
  const fetchImpl = async (url) => {
    assert.equal(url, 'https://www.westinghouse.com.au/fridges/whe6874ba/');
    return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const result = await runEvidenceResearchCycle(caseRecord(), {
    fetchImpl,
    now: '2026-07-11T15:00:00.000Z',
    writeObject: async (path, bytes) => writes.push({ path, bytes: bytes.length }),
    sitemapUrls: [],
  });

  assert.equal(result.caseRecord.attempt, 2);
  assert.equal(result.caseRecord.sources.length, 1);
  assert.equal(result.caseRecord.sources[0].claims.find((claim) => claim.field === 'closedEnvelope.widthMm').value, 913);
  assert.equal(result.caseRecord.sources[0].verificationReceipt.policyVersion, '2026-07-11.3');
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /^evidence\/web\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.html$/);
});

test('research cycle records a bounded failure when every candidate is unusable', async () => {
  const result = await runEvidenceResearchCycle(caseRecord({ attempt: 2 }), {
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
    now: '2026-07-11T15:00:00.000Z',
    writeObject: async () => assert.fail('failed source must not be stored'),
    sitemapUrls: [],
  });
  assert.equal(result.caseRecord.attempt, 3);
  assert.equal(result.caseRecord.automationState, 'quarantined');
  assert.equal(result.caseRecord.terminalReason, 'evidence_search_exhausted');
});

test('replaying an unchanged source is idempotent and does not consume an attempt', async () => {
  const first = await runEvidenceResearchCycle(caseRecord(), {
    fetchImpl: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: '2026-07-11T15:00:00.000Z', writeObject: async () => {}, sitemapUrls: [],
  });
  const replay = await runEvidenceResearchCycle(first.caseRecord, {
    fetchImpl: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: '2026-07-11T15:05:00.000Z', writeObject: async () => {}, sitemapUrls: [],
  });
  assert.deepEqual(replay.caseRecord, first.caseRecord);
});

test('refresh outage preserves still-valid resolved evidence and records operational failure', async () => {
  const first = await runEvidenceResearchCycle(caseRecord(), {
    fetchImpl: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: '2026-07-11T15:00:00.000Z', writeObject: async () => {}, sitemapUrls: [],
  });
  const refresh = await runEvidenceResearchCycle(first.caseRecord, {
    fetchImpl: async () => new Response('down', { status: 503 }),
    now: '2026-07-12T15:00:00.000Z', writeObject: async () => {}, sitemapUrls: [], refresh: true,
  });
  assert.equal(refresh.caseRecord.attempt, first.caseRecord.attempt);
  assert.deepEqual(refresh.caseRecord.sources, first.caseRecord.sources);
  assert.equal(refresh.caseRecord.refreshHistory.at(-1).outcome, 'failed');
});
