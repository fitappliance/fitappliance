import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildWestinghouseProductCandidates,
  extractWestinghouseDownloadLinks,
  findWestinghouseOfficialPdf,
  westinghouseProductUrlMatchesTarget
} = require('../../scripts/pdf-pipeline/westinghouse-official.js');

const sitemapXml = `
<urlset>
  <url><loc>https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/</loc></url>
  <url><loc>https://www.westinghouse.com.au/support/wtb3400wh/</loc></url>
  <url><loc>https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302wc-l/</loc></url>
  <url><loc>https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6602xb/</loc></url>
  <url><loc>https://www.westinghouse.com.au/about/</loc></url>
</urlset>`;

const productHtml = `
<title>WBB3400AH refrigerator | Westinghouse Australia</title>
<h1>WBB3400AH bottom mount refrigerator</h1>
<a href="/documenthandler.ashx?assetid=511925&amp;documenttype=Dimension Sheet" data-ga4-download-type="Dimension Sheet">
  Dimension Sheet
</a>
<a href="https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WBB3400AH&amp;brand=Westinghouse" data-ga4-download-type="Fact Sheet">
  Fact Sheet
</a>`;

function fetchMock(routes) {
  return async (url) => {
    const key = String(url);
    const body = routes[key];
    if (!body) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('Westinghouse official finder extracts product candidates from public sitemap URLs', () => {
  assert.deepEqual(buildWestinghouseProductCandidates(sitemapXml), [
    'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/',
    'https://www.westinghouse.com.au/support/wtb3400wh/',
    'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302wc-l/',
    'https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6602xb/'
  ]);
});

test('Westinghouse official finder matches colour and hinge URL suffixes safely', () => {
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/', { sku: 'WBB3400AH' }), true);
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302wc-l/', { sku: 'WBE4302WC' }), true);
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe5300bc-r/', { sku: 'WBE5300BC-R' }), true);
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe5300bc-l/', { sku: 'WBE5300BC-R' }), false);
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302wc-l/', { sku: 'WBE5300WC' }), false);
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6608x/', { sku: 'WSF6608XA' }), false);
});

test('Westinghouse official finder prefers dimension sheets over fact sheets', () => {
  const links = extractWestinghouseDownloadLinks(productHtml, 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/');

  assert.equal(links[0].type, 'dimension_sheet');
  assert.equal(links[0].url, 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925&documenttype=Dimension%20Sheet');
  assert.equal(links[1].type, 'fact_sheet');
});

test('Westinghouse official finder returns a dimension sheet for the matched product page', async () => {
  const userAgents = [];
  const writes = [];
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WBB3400AH',
    category: 'fridge'
  }, {
    fetchImpl: async (url, init = {}) => {
      userAgents.push(init.headers?.['User-Agent'] || init.headers?.['user-agent'] || '');
      return fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml': sitemapXml,
      'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/': productHtml
      })(url);
    },
    writeObject: async (objectPath, bytes) => writes.push({ objectPath, bytes: Buffer.from(bytes) })
  });

  assert.equal(result.sourceUrl, 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925&documenttype=Dimension%20Sheet');
  assert.equal(result.source, 'westinghouse-official-dimension_sheet');
  assert.equal(result.resourceType, 'dimension_sheet');
  assert.equal(userAgents.every((value) => value.includes('Mozilla/5.0')), true);
  assert.equal(writes.length, 2);
  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.required, lane.supported, lane.status, lane.candidateCount,
  ]), [
    ['current_product', true, true, 'complete', 1],
    ['discontinued_archive', true, true, 'complete', 0],
    ['support_search_api', false, false, 'unsupported', 0],
    ['official_document_cdn', true, true, 'complete', 2],
    ['official_product_detail', true, true, 'complete', 1],
  ]);
  assert.deepEqual(result.resources.map((resource) => resource.sourceLaneId), [
    'official_product_detail',
    'official_document_cdn',
    'official_document_cdn',
  ]);
  assert.equal(result.resources[1].discoveryProvenance.method, 'official_product_page');
  assert.equal(result.resources[1].discoveryProvenance.requestedModel, 'WBB3400AH');
  assert.equal(result.resources[1].discoveryProvenance.matchedModel, 'WBB3400AH');
  assert.equal(result.resources[1].discoveryProvenance.artifactUrl, result.resources[1].sourceUrl);
  assert.match(result.resources[1].discoveryProvenance.discoveryContentSha256, /^[a-f0-9]{64}$/);
});

test('Westinghouse official finder preserves an explicit hinge suffix in source-lane provenance', async () => {
  const productUrl = 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe5300bc-r/';
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse', model: 'WBE5300BC-R', category: 'fridge'
  }, {
    fetchImpl: fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml':
        `<urlset><url><loc>${productUrl}</loc></url></urlset>`,
      [productUrl]: `<title>WBE5300BC-R refrigerator | Westinghouse Australia</title>
        <a href="/documenthandler.ashx?assetid=51195" data-ga4-download-type="Dimension Sheet">Dimension Sheet</a>`
    }),
    writeObject: async () => {}
  });

  assert.equal(result.productUrl, productUrl);
  assert.equal(result.sourceLanes.every((lane) => lane.status !== 'retryable'), true);
  assert.deepEqual([...new Set(result.resources.map((resource) => resource.sourceModelHint))], [
    'WBE5300BC-R',
  ]);
  assert.deepEqual([...new Set(result.resources
    .map((resource) => resource.discoveryProvenance?.requestedModel)
    .filter(Boolean))], ['WBE5300BC-R']);
});

test('Westinghouse official finder rejects a slug match when the page does not identify the exact model', async () => {
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WSF6608XA',
    category: 'dishwasher'
  }, {
    fetchImpl: fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml': `
        <urlset><url><loc>https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6608xa/</loc></url></urlset>`,
      'https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6608xa/':
        '<title>WSF6608XB dishwasher | Westinghouse Australia</title>'
    }),
    writeObject: async () => {}
  });

  assert.equal(result.sourceUrl, null);
  assert.equal(result.resources.length, 0);
  assert.equal(result.sourceLanes.find((lane) => lane.laneId === 'official_product_detail').status, 'retryable');
});

test('Westinghouse official finder ignores a stale support route after an exact product page is proven', async () => {
  const productUrl = 'https://www.westinghouse.com.au/dishwashing/dishwashers/wsf6608xa/';
  const supportUrl = 'https://www.westinghouse.com.au/support/wsf6608xa/';
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse', sku: 'WSF6608XA', category: 'dishwasher'
  }, {
    fetchImpl: fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml': `
        <urlset><url><loc>${productUrl}</loc></url><url><loc>${supportUrl}</loc></url></urlset>`,
      [productUrl]: `<title>WSF6608XA dishwasher | Westinghouse Australia</title>${productHtml}`,
      [supportUrl]: '<title>Product support | Westinghouse Australia</title>'
    }),
    writeObject: async () => {}
  });

  assert.equal(result.sourceLanes.find((lane) => lane.laneId === 'official_document_cdn').status, 'complete');
  assert.equal(result.sourceLanes.find((lane) => lane.laneId === 'official_product_detail').status, 'complete');
  assert.equal(result.resources.some((resource) => resource.sourceUrl === supportUrl), false);
});

test('Westinghouse official finder can use known official dimension-guide families when support pages hide resources', async () => {
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WTB3400WH',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml': sitemapXml,
      'https://www.westinghouse.com.au/support/wtb3400wh/': '<main data-layout="DOCUMENT"></main>'
    })
  });

  assert.equal(result.sourceUrl, 'https://resource.electrolux.com.au/Public/File/?Id=51194');
  assert.equal(result.source, 'westinghouse-official-known-dimension_sheet');
  assert.equal(result.resourceType, 'dimension_sheet');
});

test('Westinghouse official finder maps additional known guide families and wildcard SKUs', async () => {
  const topMount = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WTB3100WK',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({}),
    knownOnly: true
  });
  const wildcard = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WRB3504*A',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({}),
    knownOnly: true
  });

  assert.equal(topMount.sourceUrl, 'https://resource.electrolux.com.au/Public/File/?Id=53211');
  assert.equal(wildcard.sourceUrl, 'https://resource.electrolux.com.au/Public/File/?Id=51198');
});
