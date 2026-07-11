import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildElectroluxGroupFactsheetUrl,
  findElectroluxGroupFactsheet,
  resolveElectroluxGroupBrand
} = require('../../scripts/pdf-pipeline/electrolux-group-official.js');

test('Electrolux group resolver recognizes only supported AU brands', () => {
  assert.equal(resolveElectroluxGroupBrand({ brand: 'KELVINATOR' }), 'Kelvinator');
  assert.equal(resolveElectroluxGroupBrand({ product: { brand: 'Westinghouse' } }), 'Westinghouse');
  assert.equal(resolveElectroluxGroupBrand({ brand: 'Electrolux' }), 'Electrolux');
  assert.equal(resolveElectroluxGroupBrand({ brand: 'AEG' }), null);
});

test('Electrolux group resolver builds an exact model factsheet URL', () => {
  assert.equal(
    buildElectroluxGroupFactsheetUrl({ brand: 'Kelvinator', sku: ' KBM5302AC ' }),
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator'
  );
});

test('Electrolux group resolver probes the exact official PDF without downloading it', async () => {
  const requests = [];
  const result = await findElectroluxGroupFactsheet({
    brand: 'Kelvinator',
    sku: 'KBM5302AC'
  }, {
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/pdf' : null }
      };
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'HEAD');
  assert.equal(result.source, 'kelvinator-official-fact_sheet');
  assert.equal(result.resourceType, 'fact_sheet');
  assert.equal(result.verifiedAlias, 'KBM5302AC');
  assert.match(result.sourceUrl, /modelNumber=KBM5302AC&brand=Kelvinator$/);
});

test('Electrolux group resolver rejects missing and non-PDF model responses', async () => {
  await assert.rejects(
    findElectroluxGroupFactsheet({ brand: 'Kelvinator', sku: 'NOTREAL' }, {
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' } })
    }),
    /404.*NOTREAL/i
  );
  await assert.rejects(
    findElectroluxGroupFactsheet({ brand: 'Kelvinator', sku: 'KBM5302AC' }, {
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' } })
    }),
    /not a PDF/i
  );
});
