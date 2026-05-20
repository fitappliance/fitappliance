import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildElectroluxProductCandidates,
  electroluxProductUrlMatchesTarget,
  extractElectroluxDownloadLinks,
  findElectroluxOfficialPdf
} = require('../../scripts/pdf-pipeline/electrolux-official.js');

const sitemapXml = `
<urlset>
  <url><loc>https://www.electrolux.com.au/fridges-and-freezers/fridges/ehe6899sa/</loc></url>
  <url><loc>https://www.electrolux.com.au/fridges-and-freezers/fridges/ebe4302bd-l/</loc></url>
  <url><loc>https://www.electrolux.com.au/support/ebe4507sc/</loc></url>
  <url><loc>https://www.electrolux.com.au/laundry/washing-machines/ewf1243r7wc/</loc></url>
  <url><loc>https://www.electrolux.com.au/about/</loc></url>
</urlset>`;

const productHtml = `
<a href="/documenthandler.ashx?file=dimension-token&amp;lang="
   data-ga4-file-name="Dimension Sheet"
   data-ga4-download-type="Dimension Sheet">Dimension Sheet</a>
<a href="https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EHE6899SA&amp;brand=Electrolux"
   data-ga4-download-type="Fact Sheet">Fact Sheet</a>`;

function fetchMock(routes) {
  return async (url) => {
    const body = routes[String(url)];
    if (!body) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('Electrolux finder extracts core product candidates from sitemap URLs', () => {
  assert.deepEqual(buildElectroluxProductCandidates(sitemapXml), [
    'https://www.electrolux.com.au/fridges-and-freezers/fridges/ehe6899sa/',
    'https://www.electrolux.com.au/fridges-and-freezers/fridges/ebe4302bd-l/',
    'https://www.electrolux.com.au/support/ebe4507sc/',
    'https://www.electrolux.com.au/laundry/washing-machines/ewf1243r7wc/'
  ]);
});

test('Electrolux finder safely matches direct, hinge, and colour URL variants', () => {
  assert.equal(electroluxProductUrlMatchesTarget('https://www.electrolux.com.au/fridges-and-freezers/fridges/ehe6899sa/', { sku: 'EHE6899SA' }), true);
  assert.equal(electroluxProductUrlMatchesTarget('https://www.electrolux.com.au/fridges-and-freezers/fridges/ebe4302bd-l/', { sku: 'EBE4302BD' }), true);
  assert.equal(electroluxProductUrlMatchesTarget('https://www.electrolux.com.au/laundry/washing-machines/ewf1243r7wc/', { sku: 'EWF1243R7' }), true);
  assert.equal(electroluxProductUrlMatchesTarget('https://www.electrolux.com.au/fridges-and-freezers/fridges/eqe5607ba/', { sku: 'EQE6870SA' }), false);
});

test('Electrolux finder prefers dimension sheets over fact sheets', () => {
  const links = extractElectroluxDownloadLinks(productHtml, 'https://www.electrolux.com.au/fridges-and-freezers/fridges/ehe6899sa/');

  assert.equal(links[0].type, 'dimension_sheet');
  assert.equal(links[0].url, 'https://www.electrolux.com.au/documenthandler.ashx?file=dimension-token&lang=');
  assert.equal(links[1].type, 'fact_sheet');
});

test('Electrolux finder returns product-page dimension sheets', async () => {
  const result = await findElectroluxOfficialPdf({
    brand: 'Electrolux',
    sku: 'EHE6899SA',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({
      'https://www.electrolux.com.au/sitemap.xml': sitemapXml,
      'https://www.electrolux.com.au/fridges-and-freezers/fridges/ehe6899sa/': productHtml
    })
  });

  assert.equal(result.sourceUrl, 'https://www.electrolux.com.au/documenthandler.ashx?file=dimension-token&lang=');
  assert.equal(result.source, 'electrolux-official-dimension_sheet');
  assert.equal(result.resourceType, 'dimension_sheet');
});

test('Electrolux finder uses known official dimension-guide families when support pages hide resources', async () => {
  const result = await findElectroluxOfficialPdf({
    brand: 'Electrolux',
    sku: 'EBE4507SC',
    category: 'fridge'
  }, {
    fetchImpl: fetchMock({
      'https://www.electrolux.com.au/sitemap.xml': sitemapXml,
      'https://www.electrolux.com.au/support/ebe4507sc/': '<main>No download panel</main>'
    })
  });

  assert.equal(result.sourceUrl, 'https://resource.electrolux.com.au/Public/File/?Id=51297');
  assert.equal(result.source, 'electrolux-official-known-dimension_sheet');
});
