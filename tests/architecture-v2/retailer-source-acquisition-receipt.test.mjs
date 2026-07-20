import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  acquireAuthorizedRetailerSource,
  buildRetailerSourceAcquisitionReceipt,
  validateRetailerSourceAcquisitionReceipt,
} from '../../src/domain/retailer-source-acquisition-receipt.mjs';

const SOURCE_POLICY_SHA = 'a'.repeat(64);
const CSV = Buffer.from('Category|Stock\nDishwashers|Yes\n');

test('receipt binds a secret-safe HTTPS acquisition to exact response bytes', () => {
  const receipt = buildRetailerSourceAcquisitionReceipt({
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    sourcePolicySha256: SOURCE_POLICY_SHA,
    acquisitionHosts: ['feeds.performancehorizon.com'],
    requestedUrl: 'https://feeds.performancehorizon.com/private/token.csv?key=secret',
    finalUrl: 'https://feeds.performancehorizon.com/private/token.csv?key=secret',
    redirects: [],
    startedAt: '2026-07-21T01:00:00.000Z',
    receivedAt: '2026-07-21T01:00:01.000Z',
    responseStatus: 200,
    responseHeaders: {
      date: 'Tue, 21 Jul 2026 01:00:01 GMT',
      'content-type': 'text/csv',
      'content-length': String(CSV.length),
      etag: 'private-etag',
    },
    rawBytes: CSV,
    mediaType: 'text/csv',
  });

  assert.equal(validateRetailerSourceAcquisitionReceipt(receipt, {
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    sourcePolicySha256: SOURCE_POLICY_SHA,
    acquisitionHosts: ['feeds.performancehorizon.com'],
    rawPayloadSha256: createHash('sha256').update(CSV).digest('hex'),
    byteSize: CSV.length,
  }).acquisitionId, receipt.acquisitionId);
  assert.equal(JSON.stringify(receipt).includes('private/token.csv'), false);
  assert.equal(JSON.stringify(receipt).includes('key=secret'), false);
  assert.equal(JSON.stringify(receipt).includes('private-etag'), false);
});

test('receipt rejects an unapproved redirect host and payload drift', () => {
  assert.throws(() => buildRetailerSourceAcquisitionReceipt({
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    sourcePolicySha256: SOURCE_POLICY_SHA,
    acquisitionHosts: ['feeds.performancehorizon.com'],
    requestedUrl: 'https://feeds.performancehorizon.com/feed.csv',
    finalUrl: 'https://evil.example/feed.csv',
    redirects: [{
      statusCode: 302,
      fromUrl: 'https://feeds.performancehorizon.com/feed.csv',
      toUrl: 'https://evil.example/feed.csv',
    }],
    startedAt: '2026-07-21T01:00:00.000Z',
    receivedAt: '2026-07-21T01:00:01.000Z',
    responseStatus: 200,
    responseHeaders: {},
    rawBytes: CSV,
    mediaType: 'text/csv',
  }), /approved acquisition host/i);
});

test('bounded fetch captures redirects without persisting credential-bearing paths', async () => {
  const calls = [];
  const responses = [
    new Response(null, {
      status: 302,
      headers: { location: 'https://feeds.performancehorizon.com/final/token.csv?secret=two' },
    }),
    new Response(CSV, {
      status: 200,
      headers: {
        date: 'Tue, 21 Jul 2026 01:00:01 GMT',
        'content-type': 'text/csv',
        'content-length': String(CSV.length),
      },
    }),
  ];
  const times = ['2026-07-21T01:00:00.000Z', '2026-07-21T01:00:01.000Z'];
  const result = await acquireAuthorizedRetailerSource({
    url: 'https://feeds.performancehorizon.com/start/token.csv?secret=one',
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    sourcePolicySha256: SOURCE_POLICY_SHA,
    acquisitionHosts: ['feeds.performancehorizon.com'],
    fetchImpl: async (url, options) => {
      calls.push([url, options.redirect]);
      return responses.shift();
    },
    now: () => times.shift(),
    timeoutMs: 1000,
    maximumBytes: 1024,
  });

  assert.deepEqual(result.bytes, CSV);
  assert.equal(result.receipt.redirects.length, 1);
  assert.equal(result.receipt.receivedAt, '2026-07-21T01:00:01.000Z');
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(result.receipt).includes('token.csv'), false);
  assert.equal(JSON.stringify(result.receipt).includes('secret='), false);
});

test('bounded fetch rejects HTML, oversized bodies, and non-HTTPS input', async () => {
  const base = {
    sourcePolicyId: 'the-good-guys-partnerize-feed-v1',
    sourcePolicySha256: SOURCE_POLICY_SHA,
    acquisitionHosts: ['feeds.performancehorizon.com'],
    now: () => '2026-07-21T01:00:00.000Z',
  };
  await assert.rejects(() => acquireAuthorizedRetailerSource({
    ...base,
    url: 'http://feeds.performancehorizon.com/feed.csv',
  }), /HTTPS/i);
  await assert.rejects(() => acquireAuthorizedRetailerSource({
    ...base,
    url: 'https://feeds.performancehorizon.com/feed.csv',
    fetchImpl: async () => new Response('<html>login</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  }), /CSV|content type/i);
  await assert.rejects(() => acquireAuthorizedRetailerSource({
    ...base,
    url: 'https://feeds.performancehorizon.com/feed.csv',
    maximumBytes: 4,
    fetchImpl: async () => new Response(CSV, {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    }),
  }), /maximum byte/i);
});
