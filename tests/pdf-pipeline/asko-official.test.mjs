import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findAskoOfficialPdf } = require('../../scripts/pdf-pipeline/asko-official.js');

function response(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    arrayBuffer: async () => bytes,
  };
}

test('ASKO finder binds exact-model PDFs to immutable AU API discovery JSON', async () => {
  const exactPdf = 'https://partners.gorenje.com/fts/GetDigitDoc.aspx?sifra=576719&jezik=en&tipVsebine=1&docName=577992en.pdf';
  const siblingPdf = 'https://atag.hgecdn.net/medias/productSheet-000000000000590952-bs-asko-au-en-AU.pdf';
  const payload = {
    products: [
      {
        code: 'ggProductCatalog/Online/000000000000576719',
        modelMark: 'T408HD.W',
        manuals: [
          { desc: 'Instructions for use', url: exactPdf },
          { desc: 'Energy label', url: 'https://partners.gorenje.com/fts/EnLabel.ashx?ident=576719' },
        ],
      },
      {
        code: 'ggProductCatalog/Online/000000000000590952',
        modelMark: 'T408HD.W.AU',
        manuals: [{ desc: 'Product sheet', url: siblingPdf }],
      },
    ],
  };
  const detail = {
    code: '000000000000576719',
    modelMark: 'T408HD.W',
    documents: [{ desc: 'Instructions for use', type: 'user_manual', url: exactPdf }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '595' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '850' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '654' }] },
    ] }],
  };
  const payloadBytes = Buffer.from(JSON.stringify(detail));
  const payloadHash = createHash('sha256').update(payloadBytes).digest('hex');
  const writes = [];
  const result = await findAskoOfficialPdf(
    { brand: 'ASKO', sku: 'T408HD.W', model: 'T408HD.W' },
    {
      fetchImpl: async (url) => response(url.includes('/manuals/search') ? payload : detail),
      writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    },
  );

  assert.equal(result.sourceUrl, exactPdf);
  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0].matchedSku, 'T408HD.W');
  assert.equal(result.resources[0].discoveryProvenance.method, 'official_market_api');
  assert.equal(result.resources[0].discoveryProvenance.discoveryContentSha256, payloadHash);
  assert.equal(
    result.resources[0].discoveryProvenance.discoveryObjectPath,
    `evidence/web/sha256/${payloadHash.slice(0, 2)}/${payloadHash.slice(2, 4)}/${payloadHash}.json`,
  );
  assert.deepEqual(writes, [{
    path: result.resources[0].discoveryProvenance.discoveryObjectPath,
    bytes: payloadBytes,
  }]);
  assert.equal(result.resources.some((resource) => resource.url === siblingPdf), false);
});

test('ASKO finder permits only the official AU suffix variant and preserves both model identities', async () => {
  const code = '000000000000592077';
  const pdf = 'https://asko.hgecdn.net/medias/productSheet-000000000000592077-bs-asko-au-en-AU.pdf';
  const search = { products: [
    { code: `ggProductCatalog/Online/${code}`, modelMark: 'W4086C.W.AU' },
    { code: 'ggProductCatalog/Online/000000000000738297', modelMark: 'W4086C.W.P' },
    { code: 'ggProductCatalog/Online/000000000000738298', modelMark: 'W4086C.W/1' },
  ] };
  const detail = {
    code,
    modelMark: 'W4086C.W.AU',
    documents: [{ desc: 'Product sheet', url: pdf }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '595' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '850' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '585' }] },
    ] }],
  };
  const writes = [];
  const result = await findAskoOfficialPdf(
    { brand: 'ASKO', sku: 'W4086C.W', model: 'W4086C.W', category: 'washing_machine' },
    {
      fetchImpl: async (url) => response(url.includes('/manuals/search') ? search : detail),
      writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    },
  );

  assert.equal(result.matchedSku, 'W4086C.W.AU');
  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0].url, pdf);
  assert.equal(result.resources[0].matchedSku, 'W4086C.W.AU');
  assert.equal(result.resources[0].discoveryProvenance.requestedModel, 'W4086C.W');
  assert.equal(result.resources[0].discoveryProvenance.matchedModel, 'W4086C.W.AU');
  assert.equal(writes.length, 1);

  for (const modelMark of ['W4086C.W.P', 'W4086C.W/1']) {
    const rejected = await findAskoOfficialPdf(
      { brand: 'ASKO', sku: 'W4086C.W', model: 'W4086C.W', category: 'washing_machine' },
      {
        fetchImpl: async () => response({ products: [{
          code: 'ggProductCatalog/Online/000000000000738297', modelMark,
        }] }),
        writeObject: async () => assert.fail('non-AU variants must not be persisted'),
      },
    );
    assert.equal(rejected, null);
  }
});

test('ASKO finder retains multiple exact product revisions only when every PIM dimension set agrees', async () => {
  const codes = ['000000000000740002', '000000000000747673'];
  const pdfs = codes.map((code) => `https://partners.gorenje.com/fts/${code}.pdf`);
  const search = { products: codes.map((code) => ({
    code: `ggProductCatalog/Online/${code}`, modelMark: 'DBI364ID.S.AU',
  })) };
  const detail = (code, depth = '554') => ({
    code, modelMark: 'DBI364ID.S.AU', documents: [{ desc: 'Instructions for use', url: pdfs[codes.indexOf(code)] }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '596' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '819' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: depth }] },
    ] }],
  });
  const writes = [];
  const result = await findAskoOfficialPdf({ model: 'DBI364ID.S.AU' }, {
    fetchImpl: async (url) => response(url.includes('/manuals/search')
      ? search : detail(codes.find((code) => url.includes(code)))),
    writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
  });
  assert.deepEqual(result.resources.map((resource) => resource.url).sort(), [...pdfs].sort());
  assert.equal(new Set(result.resources.map((resource) => resource.discoveryProvenance.documentId)).size, 2);
  assert.equal(writes.length, 2);

  await assert.rejects(() => findAskoOfficialPdf({ model: 'DBI364ID.S.AU' }, {
    fetchImpl: async (url) => response(url.includes('/manuals/search')
      ? search : detail(codes.find((code) => url.includes(code)), url.includes(codes[1]) ? '555' : '554')),
    writeObject: async () => assert.fail('conflicting revisions must not be persisted'),
  }), /multiple product codes.*dimensions/i);
});

test('ASKO finder uses a bounded punctuation-aware AU lookup and exposes exact PIM JSON as dimensions-only evidence', async () => {
  const code = '000000000000732485';
  const sourceModel = 'DBI243IB.S.AU';
  const detail = {
    code,
    modelMark: sourceModel,
    documents: [{ desc: 'Product dimensions', url: 'https://asko.hgecdn.net/medias/DBI243IB-S-AU.jpg' }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '596' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '819' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '559' }] },
    ] }],
  };
  const queries = [];
  const writes = [];
  const result = await findAskoOfficialPdf(
    { brand: 'ASKO', model: 'DBI243IBS', category: 'dishwasher' },
    {
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/manuals/search')) {
          queries.push(parsed.searchParams.get('query'));
          return response(parsed.searchParams.get('query') === sourceModel
            ? { products: [{ code: `ggProductCatalog/Online/${code}`, modelMark: sourceModel }] }
            : { products: [] });
        }
        return response(detail);
      },
      writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    },
  );

  assert.deepEqual(queries, ['DBI243IBS', 'DBI243IBS.AU', 'DBI243IB.S.AU']);
  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0].resourceType, 'structured_product_data');
  assert.equal(result.resources[0].url, result.resources[0].discoveryProvenance.discoveryUrl);
  assert.equal(result.resources[0].discoveryProvenance.artifactUrl, result.resources[0].url);
  assert.equal(result.resources[0].matchedSku, sourceModel);
  assert.equal(writes.length, 1);
});

test('ASKO finder does not infer an AU relation when normalized model characters differ', async () => {
  const result = await findAskoOfficialPdf(
    { brand: 'ASKO', model: 'D5424SS', category: 'dishwasher' },
    {
      fetchImpl: async (url) => response(url.includes('/manuals/search')
        ? { products: [{ code: 'ggProductCatalog/Online/000000000000484444', modelMark: 'D5424S' }] }
        : assert.fail('unapproved sibling must not reach product detail')),
      writeObject: async () => assert.fail('unapproved sibling must not be persisted'),
    },
  );
  assert.equal(result, null);
});
