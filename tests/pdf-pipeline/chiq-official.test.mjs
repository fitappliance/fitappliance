import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildChiqSpecUrls,
  collectLookupSkus,
  findChiqOfficialPdf
} = require('../../scripts/pdf-pipeline/chiq-official.js');

function response(status = 200, contentType = 'application/pdf') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : '';
      }
    }
  };
}

test('CHIQ official finder probes direct Shopify CDN SPEC PDF paths', async () => {
  const calls = [];
  const result = await findChiqOfficialPdf({
    brand: 'CHIQ',
    sku: 'CBC064BG',
    category: 'fridge'
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options?.method });
      assert.equal(String(url), buildChiqSpecUrls('CBC064BG')[0]);
      assert.equal(options.method, 'HEAD');
      return response(200);
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.sourceUrl, 'https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf');
  assert.equal(result.source, 'chiq-official-spec_sheet');
  assert.equal(result.productCode, 'CBC064BG');
});

test('CHIQ official finder extracts concrete SKU token from longer catalog titles', async () => {
  const calls = [];
  const result = await findChiqOfficialPdf({
    brand: 'CHIQ',
    sku: 'CCD499NWS 503L Quad Door Fridge',
    category: 'fridge'
  }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      assert.equal(String(url), buildChiqSpecUrls('CCD499NWS')[0]);
      return response(200);
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.productCode, 'CCD499NWS');
});

test('CHIQ official finder skips manifest wildcard SKUs rather than guessing variants', () => {
  assert.deepEqual(collectLookupSkus({
    brand: 'CHIQ',
    sku: 'CCF14**E',
    category: 'fridge'
  }), []);
});

test('CHIQ official finder falls back to tiny GET when HEAD is unavailable', async () => {
  const calls = [];
  const result = await findChiqOfficialPdf({
    brand: 'CHIQ',
    sku: 'WD85SB1',
    category: 'washing_machine'
  }, {
    fetchImpl: async (url, options) => {
      calls.push(options.method);
      if (options.method === 'HEAD') return response(405, 'text/html');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Range, 'bytes=0-5');
      return response(206, 'application/pdf');
    }
  });

  assert.deepEqual(calls, ['HEAD', 'GET']);
  assert.equal(result.productCode, 'WD85SB1');
});

test('CHIQ official finder binds an exact Shopify product and specification to immutable source lanes', async () => {
  const writes = [];
  const calls = [];
  const searchUrl = 'https://www.chiq.com.au/search/suggest.json?q=CSR125DW&resources%5Btype%5D=product&resources%5Blimit%5D=10';
  const productUrl = 'https://www.chiq.com.au/products/chiq-125l-single-door-bar-fridge-white-csr125dw';
  const productJsonUrl = `${productUrl}.js`;
  const specificationUrl = 'https://chiq.com.au/cdn/shop/files/CSR125DW_SPEC.pdf';
  const searchJson = JSON.stringify({ resources: { results: { products: [
    { handle: 'chiq-125l-single-door-bar-fridge-white-csr125dwx', url: '/products/chiq-125l-single-door-bar-fridge-white-csr125dwx' },
    { handle: 'chiq-125l-single-door-bar-fridge-white-csr125dw', url: '/products/chiq-125l-single-door-bar-fridge-white-csr125dw' },
  ] } } });
  const productJson = JSON.stringify({
    handle: 'chiq-125l-single-door-bar-fridge-white-csr125dw',
    vendor: 'CSR125DW',
    variants: [{ sku: 'CSR125DW', available: false }],
  });
  const productHtml = `<!doctype html><html><head>
    <link rel="canonical" href="${productUrl}">
    <title>CHiQ 125L Single Door Bar Fridge White | CSR125DW</title>
  </head><body>
    <h1>CHiQ 125L Single Door Bar Fridge White</h1><p>Model Number: CSR125DW</p>
    <table><tr><th>Product Dimensions W*H*D (mm)</th><td>494 x 847 x 551</td></tr></table>
    <a href="https://chiq.com.au/cdn/shop/files/CSR125DW_CSR124DBS_USER_MANUAL.pdf">USER MANUAL</a>
    <a href="${specificationUrl}">SPECIFICATIONS</a>
  </body></html>`;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET' });
    const body = String(url) === searchUrl ? searchJson
      : String(url) === productJsonUrl ? productJson
        : String(url) === productUrl ? productHtml : null;
    assert.notEqual(body, null, `unexpected URL ${url}`);
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => String(name).toLowerCase() === 'content-type'
        ? (String(url).endsWith('.js') || String(url).includes('suggest.json') ? 'application/json' : 'text/html')
        : '' },
      text: async () => body,
    };
  };

  const result = await findChiqOfficialPdf({
    brand: 'CHIQ', model: 'CSR125DW', category: 'fridge',
  }, {
    fetchImpl,
    writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
  });

  assert.equal(result.sourceUrl, specificationUrl);
  assert.equal(result.productUrl, productUrl);
  assert.deepEqual(result.resources.map((resource) => [
    resource.resourceType, resource.sourceLaneId, resource.sourceUrl,
  ]), [
    ['product_page', 'official_product_detail', productUrl],
    ['specification_sheet', 'official_document_cdn', specificationUrl],
  ]);
  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.required, lane.supported, lane.status,
  ]), [
    ['current_product', true, true, 'complete'],
    ['discontinued_archive', false, false, 'unsupported'],
    ['support_search_api', true, true, 'complete'],
    ['official_document_cdn', true, true, 'complete'],
    ['official_product_detail', true, true, 'complete'],
  ]);
  assert.equal(result.resources.every((resource) => (
    resource.discoveryProvenance?.requestedModel === 'CSR125DW'
    && resource.discoveryProvenance?.matchedModel === 'CSR125DW'
    && resource.discoveryProvenance?.artifactUrl === resource.sourceUrl
  )), true);
  assert.deepEqual(calls.map((call) => call.url), [searchUrl, productJsonUrl, productUrl]);
  assert.equal(writes.length, 3);
  assert.ok(writes.every((write) => /^evidence\/web\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.(?:json|html)$/.test(write.path)));
  assert.deepEqual(new Set(writes.map((write) => write.bytes.toString())), new Set([
    searchJson, productJson, productHtml,
  ]));
});
