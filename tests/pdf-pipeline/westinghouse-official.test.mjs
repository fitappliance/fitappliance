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
  assert.equal(westinghouseProductUrlMatchesTarget('https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302wc-l/', { sku: 'WBE5300WC' }), false);
});

test('Westinghouse official finder prefers dimension sheets over fact sheets', () => {
  const links = extractWestinghouseDownloadLinks(productHtml, 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/');

  assert.equal(links[0].type, 'dimension_sheet');
  assert.equal(links[0].url, 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925&documenttype=Dimension%20Sheet');
  assert.equal(links[1].type, 'fact_sheet');
});

test('Westinghouse official finder returns a dimension sheet for the matched product page', async () => {
  const result = await findWestinghouseOfficialPdf({
    brand: 'Westinghouse',
    sku: 'WBB3400AH',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({
      'https://www.westinghouse.com.au/sitemap.xml': sitemapXml,
      'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbb3400ah-x/': productHtml
    })
  });

  assert.equal(result.sourceUrl, 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925&documenttype=Dimension%20Sheet');
  assert.equal(result.source, 'westinghouse-official-dimension_sheet');
  assert.equal(result.resourceType, 'dimension_sheet');
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
