import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearOmegaCaches,
  extractOmegaSpecResources,
  findOmegaOfficialPdf
} from '../../scripts/pdf-pipeline/omega-official.js';

const SPEC_HTML = `
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604.pdf">Specifications: OFI604</a>
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604A.pdf">Specifications: OFI604A</a>
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-ODW300XN.pdf">Specifications: ODW300XN</a>
`;

const AU_SITEMAP_XML = `
  <urlset>
    <url><loc>https://omegaappliances.com.au/dishwashers/p/55cm-freestanding-benchtop-dishwasher-odw101w</loc></url>
    <url><loc>https://omegaappliances.com.au/dishwashers/p/60cm-freestanding-dishwasher-odwf6014x</loc></url>
    <url><loc>https://omegaappliances.com.au/archive/p/60cm-freestanding-dishwasher-odw101</loc></url>
  </urlset>
`;

const ODW101W_PRODUCT_HTML = `
  <html>
    <head>
      <title>55cm Benchtop Dishwasher | ODW101W - Omega Appliances</title>
      <link rel="canonical" href="https://omegaappliances.com.au/dishwashers/p/55cm-freestanding-benchtop-dishwasher-odw101w">
    </head>
    <body>
      <h1>55cm Benchtop Dishwasher | ODW101W</h1>
      <a href="/s/ODW101W_V21_FA_0523-9dbx.pdf">User Manual</a>
      <a href="/s/ODW101W_Specsheet_40.pdf">Specifications</a>
      <a href="/dishwashers/p/60cm-freestanding-dishwasher-odwf6014x">ODWF6014X</a>
    </body>
  </html>
`;

test('Omega finder extracts exact specification resources from official spec sheet page', () => {
  const resources = extractOmegaSpecResources(SPEC_HTML);

  assert.deepEqual(resources.map((resource) => resource.sku), ['OFI604', 'OFI604A', 'ODW300XN']);
  assert.equal(resources[0].resourceType, 'specification_sheet');
  assert.equal(resources[0].source, 'omega-official-spec_sheet');
});

test('Omega finder binds an exact Australian product page to first-party PDF links and typed lanes', async () => {
  clearOmegaCaches();
  const persisted = new Map();
  const fetched = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    fetched.push(value);
    if (value === 'https://omegaappliances.com.au/sitemap.xml') {
      return new Response(AU_SITEMAP_XML, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    if (value.endsWith('/55cm-freestanding-benchtop-dishwasher-odw101w')) {
      return new Response(ODW101W_PRODUCT_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (options.method === 'GET' && value.endsWith('/s/ODW101W_Specsheet_40.pdf')) {
      return new Response('%PDF-1.7', { status: 206, headers: { 'content-type': 'application/pdf' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await findOmegaOfficialPdf(
    { brand: 'Omega', sku: 'ODW101W', category: 'dishwasher' },
    {
      fetchImpl,
      writeObject: async (path, bytes) => persisted.set(path, Buffer.from(bytes)),
    },
  );

  assert.equal(result.sourceUrl, 'https://omegaappliances.com.au/s/ODW101W_Specsheet_40.pdf');
  assert.equal(result.productUrl, 'https://omegaappliances.com.au/dishwashers/p/55cm-freestanding-benchtop-dishwasher-odw101w');
  assert.deepEqual(
    result.resources.map((resource) => [resource.resourceType, resource.sourceUrl]),
    [
      ['product_page', result.productUrl],
      ['specification_sheet', 'https://omegaappliances.com.au/s/ODW101W_Specsheet_40.pdf'],
      ['user_manual', 'https://omegaappliances.com.au/s/ODW101W_V21_FA_0523-9dbx.pdf'],
    ],
  );
  assert.equal(result.discoveryProvenance.method, 'official_product_page');
  assert.equal(result.discoveryProvenance.requestedModel, 'ODW101W');
  assert.equal(result.discoveryProvenance.artifactLinkUrl, result.sourceUrl);
  assert.deepEqual(
    result.sourceLanes.map((lane) => [lane.laneId, lane.status, lane.candidateCount]),
    [
      ['current_product', 'complete', 1],
      ['discontinued_archive', 'complete', 0],
      ['support_search_api', 'unsupported', 0],
      ['official_document_cdn', 'complete', 2],
      ['official_product_detail', 'complete', 1],
    ],
  );
  assert.ok([...persisted.keys()].some((path) => path.endsWith('.xml')));
  assert.ok([...persisted.keys()].some((path) => path.endsWith('.html')));
  assert.equal(fetched.some((url) => url.includes('odwf6014x')), false);
});

test('Omega finder does not bind downloads when the official product page lacks the exact model', async () => {
  clearOmegaCaches();
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value === 'https://omegaappliances.com.au/sitemap.xml') {
      return new Response(AU_SITEMAP_XML, { status: 200 });
    }
    if (value.endsWith('/55cm-freestanding-benchtop-dishwasher-odw101w')) {
      return new Response(`
        <h1>60cm Dishwasher | ODW101</h1>
        <a href="/s/ODW101W_Specsheet_40.pdf">Specifications</a>
      `, { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await findOmegaOfficialPdf(
    { brand: 'Omega', sku: 'ODW101W', category: 'dishwasher' },
    { fetchImpl, verifyPdf: false, writeObject: async () => {} },
  );

  assert.equal(result.sourceUrl, null);
  assert.deepEqual(result.resources, []);
  assert.equal(
    result.sourceLanes.find((lane) => lane.laneId === 'official_product_detail').status,
    'retryable',
  );
  assert.match(result.reason, /does not identify exact model ODW101W/i);
});
