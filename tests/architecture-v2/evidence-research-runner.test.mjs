import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchOfficialArtifact,
  runEvidenceResearchCycle,
} from '../../src/domain/evidence-research-runner.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';
import { buildMineruDerivedArtifact } from '../../src/domain/mineru-document.mjs';
import { createHash } from 'node:crypto';

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
  assert.equal(
    result.caseRecord.sources[0].verificationReceipt.policyVersion,
    evidenceSourcePolicy.resolutionPolicy.policyVersion,
  );
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

test('unchanged bytes replace a stale policy receipt without consuming an attempt', async () => {
  const first = await runEvidenceResearchCycle(caseRecord(), {
    fetchImpl: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: '2026-07-11T15:00:00.000Z', writeObject: async () => {}, sitemapUrls: [],
  });
  const stale = structuredClone(first.caseRecord);
  stale.sources[0].verificationReceipt.policyVersion = 'obsolete-policy';
  const replay = await runEvidenceResearchCycle(stale, {
    fetchImpl: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: '2026-07-11T15:05:00.000Z', writeObject: async () => {}, sitemapUrls: [],
  });
  assert.equal(replay.caseRecord.attempt, stale.attempt);
  assert.equal(replay.caseRecord.sources.length, 1);
  assert.equal(
    replay.caseRecord.sources[0].verificationReceipt.policyVersion,
    evidenceSourcePolicy.resolutionPolicy.policyVersion,
  );
  assert.equal(replay.caseRecord.history.at(-1).reason, 'source_reverified');
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

test('PDF research stores source plus MinerU JSON and never approves from plain text', async () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nHisense test');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title', content: { title_content: [{ type: 'text', content: 'Hisense HRCD640TBW Specifications' }] },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Model Number</td><td>HRCD640TBW</td></tr><tr><td>Dimensions (Net) (W x H x D)</td><td>914 x 1790 x 730 mm</td></tr></table>',
      },
      bbox: [80, 200, 800, 900],
    },
  ]]));
  const pdfCase = caseRecord({
    id: 'case-hisense', legacyRuntimeId: 'fridge-hisense', brand: 'Hisense', model: 'HRCD640TBW',
    candidateUrls: ['https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf'],
    initialFailure: {
      code: 'projection_conflict',
      conflictingFields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    },
  });
  const writes = [];
  const result = await runEvidenceResearchCycle(pdfCase, {
    fetchImpl: async () => new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
    now: '2026-07-11T15:00:00.000Z',
    writeObject: async (path, bytes) => writes.push({ path, size: bytes.length }),
    sitemapUrls: [],
    processPdf: async () => ({
      jsonBytes,
      derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
        pdfSha256: pdfHash, parserVersion: '3.4.4',
        modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9', pageCount: 1,
      }),
    }),
  });
  assert.equal(result.caseRecord.sources.length, 1);
  assert.equal(result.caseRecord.sources[0].derivedArtifact.parserName, 'MinerU');
  assert.equal(result.caseRecord.sources[0].claims[0].page, 1);
  assert.equal(writes.length, 2);
  assert.ok(writes.some((write) => write.path.endsWith('.pdf')));
  assert.ok(writes.some((write) => write.path.endsWith('.json')));

  const failed = await runEvidenceResearchCycle(pdfCase, {
    fetchImpl: async () => new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
    now: '2026-07-11T15:00:00.000Z', writeObject: async () => assert.fail('must fail before write'),
    sitemapUrls: [],
    extractPdfText: async () => 'HRCD640TBW Width 914 mm',
  });
  assert.equal(failed.caseRecord.sources.length, 0);
  assert.match(failed.failures[0].reason, /MinerU|PDF processor/i);
});
