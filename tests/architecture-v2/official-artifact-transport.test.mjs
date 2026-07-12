import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurlArguments,
  fetchOfficialArtifactResilient,
} from '../../src/domain/official-artifact-transport.mjs';

const PDF = Buffer.from('%PDF-1.4\ntransport fixture');

test('resilient transport falls back to curl after a retriable fetch timeout', async () => {
  const result = await fetchOfficialArtifactResilient(
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux',
    'Electrolux',
    {
      fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); },
      allowCurlFallback: true,
      curlImpl: async () => ({
        finalUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux',
        redirectChain: [], contentType: 'application/pdf', bytes: PDF,
      }),
    },
  );
  assert.equal(result.transport, 'curl');
  assert.deepEqual(result.bytes, PDF);
});

test('curl fallback cannot turn HTML or a cross-brand redirect into PDF evidence', async () => {
  const base = {
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
    allowCurlFallback: true,
  };
  await assert.rejects(() => fetchOfficialArtifactResilient(
    'https://www.westinghouse.com.au/WHE5264SC.pdf', 'Westinghouse', {
      ...base,
      curlImpl: async () => ({
        finalUrl: 'https://www.westinghouse.com.au/WHE5264SC.pdf', redirectChain: [],
        contentType: 'text/html', bytes: Buffer.from('<html>blocked</html>'),
      }),
    },
  ), /content type|payload/i);
  await assert.rejects(() => fetchOfficialArtifactResilient(
    'https://www.westinghouse.com.au/WHE5264SC.pdf', 'Westinghouse', {
      ...base,
      curlImpl: async () => ({
        finalUrl: 'https://evil.example/WHE5264SC.pdf', redirectChain: ['https://evil.example/WHE5264SC.pdf'],
        contentType: 'application/pdf', bytes: PDF,
      }),
    },
  ), /official brand hosts/i);
});

test('policy rejection never invokes a fallback transport', async () => {
  let curlCalls = 0;
  await assert.rejects(() => fetchOfficialArtifactResilient(
    'https://evil.example/fake.pdf', 'Westinghouse', {
      fetchImpl: async () => new Response(PDF),
      curlImpl: async () => { curlCalls += 1; },
    },
  ), /official brand URL/i);
  assert.equal(curlCalls, 0);
});

test('known incompatible official hosts use the declared curl-first profile', async () => {
  let fetchCalls = 0;
  const result = await fetchOfficialArtifactResilient(
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
    'Westinghouse',
    {
      allowCurlFallback: true,
      fetchImpl: async () => { fetchCalls += 1; throw new Error('should not fetch first'); },
      curlImpl: async () => ({
        finalUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
        redirectChain: [], contentType: 'application/pdf', bytes: PDF,
      }),
    },
  );
  assert.equal(result.transport, 'curl');
  assert.equal(fetchCalls, 0);
});

test('Electrolux resource transport preserves curl default user agent', () => {
  const args = buildCurlArguments(
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
    { maximumBytes: 20 * 1024 * 1024, timeoutMs: 30000, maximumRedirects: 5 },
    '/tmp/body',
    '/tmp/headers',
  );
  assert.equal(args.includes('--user-agent'), false);
  assert.equal(args.includes('FitApplianceEvidenceBot/3.0 (+https://www.fitappliance.com.au/about/editorial-standards)'), false);
});

test('other official hosts retain the accountable evidence bot user agent', () => {
  const args = buildCurlArguments(
    'https://media3.bosch-home.com/Documents/specsheet/en-AU/SMS6HCI01A.pdf',
    { maximumBytes: 20 * 1024 * 1024, timeoutMs: 30000, maximumRedirects: 5 },
    '/tmp/body',
    '/tmp/headers',
  );
  assert.equal(args.includes('--user-agent'), true);
  assert.equal(args.includes('FitApplianceEvidenceBot/3.0 (+https://www.fitappliance.com.au/about/editorial-standards)'), true);
});
