import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildKoganManualUrls,
  findKoganOfficialPdf,
  probePdfMagic
} = require('../../scripts/pdf-pipeline/kogan-official.js');

test('Kogan official finder builds deterministic assets.kogan.com manual URL candidates', () => {
  assert.deepEqual(buildKoganManualUrls('kamfwash80a').slice(0, 3), [
    'https://assets.kogan.com/files/usermanuals/KAMFWASH80A_UG.pdf',
    'https://assets.kogan.com/files/usermanuals/KAMFWASH80A_UG_V1.1.pdf',
    'https://assets.kogan.com/files/usermanuals/KAMFWASH80A_User_Manual.pdf'
  ]);
});

test('Kogan PDF probe accepts PDF magic bytes even when content type is generic', async () => {
  const result = await probePdfMagic('https://assets.kogan.com/files/usermanuals/KAMFWASH80A_UG.pdf', {
    fetchImpl: async (_url, opts) => {
      assert.equal(opts.headers.Range, 'bytes=0-7');
      return {
        ok: true,
        status: 206,
        headers: new Map([['content-type', 'application/octet-stream']]),
        arrayBuffer: async () => Buffer.from('%PDF-1.7')
      };
    }
  });

  assert.equal(result.ok, true);
});

test('Kogan official finder returns the first PDF candidate that proves PDF magic bytes', async () => {
  const calls = [];
  const result = await findKoganOfficialPdf({ sku: 'KAMFWASH80A' }, {
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: calls.length === 1 ? 404 : 206,
        headers: new Map([['content-type', 'application/pdf']]),
        arrayBuffer: async () => Buffer.from(calls.length === 1 ? '<Error />' : '%PDF-1.7')
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.sourceUrl, 'https://assets.kogan.com/files/usermanuals/KAMFWASH80A_UG_V1.1.pdf');
  assert.equal(result.source, 'kogan-official-user_manual');
});
