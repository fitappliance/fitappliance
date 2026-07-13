import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurlArguments,
  fetchOfficialArtifactResilient,
} from '../../src/domain/official-artifact-transport.mjs';

const PDF = Buffer.from('%PDF-1.4\ntransport fixture');

const LG_DISCOVERY = Object.freeze({
  schemaVersion: 1,
  method: 'official_market_api',
  market: 'AU',
  discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
  requestedModel: 'WD1275A1',
  matchedModel: 'WD1275A1',
  artifactUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture',
  documentId: '20152207223286',
});

const FP_ARTICLE = 'https://www.fisherpaykel.com/au/support/articles/450L-Vertical-refrigerator---User-Care-Guide-22309-ka0Jw000000NxXFIA0/';
const FP_ARTIFACT_LINK = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000004i0Rp/gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE';
const FP_ARTIFACT = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw00000efk6MIAQ&d=/a/Jw000004i0Rp/gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE&operationContext=DELIVERY&viewId=05HJw00000Q7B2zMAF&dpt=';
const FP_DISCOVERY = Object.freeze({
  schemaVersion: 1,
  method: 'official_product_page',
  market: 'AU',
  discoveryUrl: FP_ARTICLE,
  requestedModel: 'E450LXFD',
  matchedModel: 'E450LXFD',
  artifactUrl: FP_ARTIFACT,
  artifactLinkUrl: FP_ARTIFACT_LINK,
  discoveryContentSha256: 'c'.repeat(64),
  discoveryObjectPath: `evidence/web/sha256/cc/cc/${'c'.repeat(64)}.html`,
  discoveryByteSize: 1234,
  documentId: '068Jw00000efk6MIAQ',
  originalFileName: '08dc03e0d61be8319432593c47c66a8126b830b7_upright_fridges_user_guide.pdf',
});

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

test('global official document endpoint requires bound Australian discovery provenance', async () => {
  const sourceUrl = LG_DISCOVERY.artifactUrl;
  const response = async () => new Response(PDF, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream;charset=UTF-8' },
  });

  await assert.rejects(() => fetchOfficialArtifactResilient(sourceUrl, 'LG', {
    fetchImpl: response,
  }), /official brand URL|market discovery provenance/i);

  const result = await fetchOfficialArtifactResilient(sourceUrl, 'LG', {
    fetchImpl: response,
    expectedModel: 'WD1275A1',
    discoveryProvenance: LG_DISCOVERY,
  });
  assert.equal(result.contentType, 'application/pdf');
  assert.deepEqual(result.bytes, PDF);
});

test('Fisher & Paykel Salesforce artifact requires exact tenant and bound Australian product-page provenance', async () => {
  const response = async () => new Response(PDF, {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });

  await assert.rejects(() => fetchOfficialArtifactResilient(FP_ARTIFACT, 'Fisher & Paykel', {
    fetchImpl: response,
  }), /official brand URL|market discovery provenance/i);

  const result = await fetchOfficialArtifactResilient(FP_ARTIFACT, 'Fisher & Paykel', {
    fetchImpl: response,
    expectedModel: 'E450LXFD',
    discoveryProvenance: FP_DISCOVERY,
  });
  assert.equal(result.contentType, 'application/pdf');
  assert.deepEqual(result.bytes, PDF);

  const otherTenant = FP_ARTIFACT.replace('fisherpaykel.my.salesforce.com', 'other.my.salesforce.com');
  await assert.rejects(() => fetchOfficialArtifactResilient(otherTenant, 'Fisher & Paykel', {
    fetchImpl: response,
    expectedModel: 'E450LXFD',
    discoveryProvenance: { ...FP_DISCOVERY, artifactUrl: otherTenant },
  }), /official brand URL|market discovery provenance/i);

  await assert.rejects(() => fetchOfficialArtifactResilient(FP_ARTIFACT, 'Fisher & Paykel', {
    fetchImpl: response,
    expectedModel: 'E450LXFD',
    discoveryProvenance: { ...FP_DISCOVERY, matchedModel: 'E450LXFD1' },
  }), /official brand URL|market discovery provenance|model/i);

  await assert.rejects(() => fetchOfficialArtifactResilient(FP_ARTIFACT, 'Fisher & Paykel', {
    fetchImpl: response,
    expectedModel: 'E450LXFD',
    discoveryProvenance: {
      ...FP_DISCOVERY,
      discoveryUrl: 'https://www.fisherpaykel.com/nz/support/articles/450L-Vertical-refrigerator/',
    },
  }), /official brand URL|market discovery provenance|Australian market/i);
});

test('native manufacturer URL cannot redirect to a global artifact host without bound provenance', async () => {
  const native = 'https://www.fisherpaykel.com/au/support/E450LXFD-guide';
  await assert.rejects(() => fetchOfficialArtifactResilient(native, 'Fisher & Paykel', {
    expectedModel: 'E450LXFD',
    fetchImpl: async (url) => {
      if (url === native) {
        return new Response(null, { status: 302, headers: { location: FP_ARTIFACT } });
      }
      return new Response(PDF, { headers: { 'content-type': 'application/pdf' } });
    },
  }), /redirect escaped official brand hosts|provenance/i);
});

test('generic binary response is accepted only when PDF magic bytes agree', async () => {
  await assert.rejects(() => fetchOfficialArtifactResilient(LG_DISCOVERY.artifactUrl, 'LG', {
    expectedModel: 'WD1275A1',
    discoveryProvenance: LG_DISCOVERY,
    fetchImpl: async () => new Response(Buffer.from('<html>not a PDF</html>'), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  }), /payload|PDF|content type/i);
});
