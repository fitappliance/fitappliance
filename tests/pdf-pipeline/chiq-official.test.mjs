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
