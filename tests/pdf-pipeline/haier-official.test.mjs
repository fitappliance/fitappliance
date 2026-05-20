import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildHaierProductCandidates,
  extractHaierDownloadLinks,
  findHaierOfficialPdf,
  haierProductUrlMatchesTarget
} = require('../../scripts/pdf-pipeline/haier-official.js');

const sitemapXml = `
<urlset>
  <url><loc>https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html</loc></url>
  <url><loc>https://www.haier.com.au/dishwashing/dishwashers/300-series-freestanding-dishwasher-hygiene-hdw13f0ps1-61665.html</loc></url>
  <url><loc>https://www.haier.com.au/refrigeration/refrigerators/342l-hrf340bs2-61751.html</loc></url>
  <url><loc>https://www.haier.com.au/about-us.html</loc></url>
</urlset>`;

const productHtml = `
<a href="https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw1/energy.pdf">Energy Label</a>
<a href="/on/demandware.static/-/Sites-haier-master-catalog/default/dw2/Haier-SpecificationGuide-en-HRF130UW2-HRF130UG2-BarRefrigerator-0-90004783A-AU-NZ.pdf">Specification Guide</a>
<a href="/on/demandware.static/-/Sites-haier-master-catalog/default/dw3/Haier-QRG-en-HRF130UW2.pdf">Quick Reference Guide</a>
<a href="/on/demandware.static/-/Sites-haier-master-catalog/default/dw4/Haier-UserGuide-en-HRF130UW2.pdf">User Guide</a>`;

function fetchMock(routes) {
  return async (url) => {
    const body = routes[String(url)];
    if (!body) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('Haier finder extracts core product URLs from sitemap XML', () => {
  assert.deepEqual(buildHaierProductCandidates(sitemapXml), [
    'https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html',
    'https://www.haier.com.au/dishwashing/dishwashers/300-series-freestanding-dishwasher-hygiene-hdw13f0ps1-61665.html',
    'https://www.haier.com.au/refrigeration/refrigerators/342l-hrf340bs2-61751.html'
  ]);
});

test('Haier finder safely matches SKU and Series variants in product URLs', () => {
  assert.equal(haierProductUrlMatchesTarget(
    'https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html',
    { sku: 'HRF130UW2' }
  ), true);
  assert.equal(haierProductUrlMatchesTarget(
    'https://www.haier.com.au/refrigeration/refrigerators/342l-hrf340bs2-61751.html',
    { sku: 'HRF340B Series' }
  ), true);
  assert.equal(haierProductUrlMatchesTarget(
    'https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html',
    { sku: 'HRF330TG' }
  ), false);
});

test('Haier finder prefers Specification Guide links and filters energy labels', () => {
  const links = extractHaierDownloadLinks(productHtml, 'https://www.haier.com.au/refrigeration/refrigerators/example.html');

  assert.equal(links[0].resourceType, 'specification_guide');
  assert.equal(links[0].source, 'haier-official-specification_guide');
  assert.equal(links.some((link) => /energy/i.test(link.url)), false);
});

test('Haier finder returns the matching product-page Specification Guide', async () => {
  const result = await findHaierOfficialPdf({
    brand: 'Haier',
    sku: 'HRF130UW2',
    category: 'fridge'
  }, {
    sitemapIndexUrl: 'https://example.test/sitemap_index.xml',
    fetchImpl: fetchMock({
      'https://example.test/sitemap_index.xml': '<sitemapindex><sitemap><loc>https://example.test/products.xml</loc></sitemap></sitemapindex>',
      'https://example.test/products.xml': sitemapXml,
      'https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html': productHtml
    })
  });

  assert.equal(result.resourceType, 'specification_guide');
  assert.match(result.sourceUrl, /SpecificationGuide-en-HRF130UW2/);
  assert.equal(result.productUrl, 'https://www.haier.com.au/refrigeration/refrigerators/129l-300-series-bar-refrigerator-hrf130uw2-62403.html');
});
