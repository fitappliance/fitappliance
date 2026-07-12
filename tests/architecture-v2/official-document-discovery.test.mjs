import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverOfficialDocumentCandidates,
  extractOfficialDocumentLinks,
} from '../../src/domain/official-document-discovery.mjs';

test('official product page extraction ranks exact-model installation and spec PDFs above family manuals', () => {
  const html = `<!doctype html><html><body>
    <a href="/docs/WHE5264SC-installation.pdf">Installation guide WHE5264SC</a>
    <a href="/docs/WHE5264SC-spec-sheet.pdf">Specifications</a>
    <a href="/docs/family-user-manual.pdf">User manual</a>
    <a href="https://retailer.example/WHE5264SC.pdf">retailer PDF</a>
  </body></html>`;
  const rows = extractOfficialDocumentLinks(html, {
    brand: 'Westinghouse', model: 'WHE5264SC',
    pageUrl: 'https://www.westinghouse.com.au/fridges/whe5264sc/',
  });
  assert.deepEqual(rows.map((row) => [row.documentType, row.modelSignal]), [
    ['installation_guide', 'exact_url_and_context'],
    ['specification_sheet', 'exact_url'],
    ['family_manual', 'none'],
  ]);
  assert.ok(rows.every((row) => row.authority === 'manufacturer'));
});

test('brand strategy emits exact-model official factsheet candidates without web search', async () => {
  const rows = await discoverOfficialDocumentCandidates({
    brand: 'Electrolux', model: 'EQE6160BA', category: 'fridge',
    productPageUrls: [], explicitUrls: [],
  }, { fetchImpl: async () => { throw new Error('no page fetch expected'); } });
  assert.equal(rows[0].url, 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux');
  assert.equal(rows[0].discoveryMethod, 'brand_template');
  assert.equal(rows[0].modelSignal, 'exact_query');
});

test('proven deterministic Bosch and Smeg templates emit exact-model specification PDFs', async () => {
  const fetchImpl = async () => { throw new Error('no page fetch expected'); };
  const bosch = await discoverOfficialDocumentCandidates({
    brand: 'Bosch', model: 'WAN24126AU', category: 'washing_machine',
    productPageUrls: [], explicitUrls: [],
  }, { fetchImpl });
  const smeg = await discoverOfficialDocumentCandidates({
    brand: 'Smeg', model: 'DWAU615DB3', category: 'dishwasher',
    productPageUrls: [], explicitUrls: [],
  }, { fetchImpl });
  assert.equal(bosch[0].url, 'https://media3.bosch-home.com/Documents/specsheet/en-AU/WAN24126AU.pdf');
  assert.equal(bosch[0].modelSignal, 'exact_url');
  assert.equal(smeg[0].url, 'https://sys.smeg.com.au/Product/Techspecs/DWAU615DB3.pdf');
  assert.equal(smeg[0].modelSignal, 'exact_url');
});

test('candidate discovery deduplicates URLs and rejects cross-brand product pages', async () => {
  const response = new Response('<!doctype html><a href="/WHE5264SC.pdf">spec</a>', {
    headers: { 'content-type': 'text/html' },
  });
  const rows = await discoverOfficialDocumentCandidates({
    brand: 'Westinghouse', model: 'WHE5264SC', category: 'fridge',
    explicitUrls: ['https://www.westinghouse.com.au/WHE5264SC.pdf'],
    productPageUrls: [
      'https://www.westinghouse.com.au/fridges/whe5264sc/',
      'https://evil.example/whe5264sc/',
    ],
  }, { fetchImpl: async () => response });
  assert.equal(rows.filter((row) => row.url === 'https://www.westinghouse.com.au/WHE5264SC.pdf').length, 1);
  assert.ok(rows.every((row) => !row.url.includes('evil.example')));
});
