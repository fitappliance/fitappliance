import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradeDepotManualUrl,
  findVogueOfficialPdf
} from '../../scripts/pdf-pipeline/vogue-official.js';

test('VOGUE finder builds Trade Depot manual URL from SKU', () => {
  assert.equal(
    buildTradeDepotManualUrl('360113'),
    'https://trade-depot.s3.ap-southeast-2.amazonaws.com/files/products/manuals/360113_User_Manual.pdf'
  );
});

test('VOGUE finder accepts an existing Trade Depot PDF', async () => {
  const calls = [];
  const result = await findVogueOfficialPdf(
    { brand: 'VOGUE', sku: '360113' },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, method: options?.method });
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/pdf']])
        };
      }
    }
  );

  assert.equal(calls[0].method, 'HEAD');
  assert.equal(result.source, 'vogue-trade-depot-manual');
  assert.equal(result.sourceUrl, buildTradeDepotManualUrl('360113'));
});

test('VOGUE finder fails closed when Trade Depot PDF is missing', async () => {
  await assert.rejects(
    () => findVogueOfficialPdf(
      { brand: 'VOGUE', sku: '999999' },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          headers: new Map()
        })
      }
    ),
    /VOGUE PDF resources not found/
  );
});
