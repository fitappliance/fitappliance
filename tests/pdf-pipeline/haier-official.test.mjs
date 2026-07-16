import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildHaierProductCandidates,
  extractHaierSupportArticleUrls,
  extractHaierDownloadLinks,
  findHaierOfficialPdf,
  haierProductUrlMatchesTarget,
  hasExactHaierModelMention,
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
    return { ok: true, status: 200, url: String(url), text: async () => body };
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

test('Haier support matching tolerates model punctuation but rejects sibling models', () => {
  assert.equal(hasExactHaierModelMention('Models HDW9-TFE3WH and HDW9-TFE3SS', 'HDW9TFE3SS'), true);
  assert.equal(hasExactHaierModelMention('Model HDW9TFE3SS2', 'HDW9TFE3SS'), false);
  assert.equal(hasExactHaierModelMention('Model HDW15V3S1', 'HDW15V2S1'), false);
});

test('Haier support discovery excludes spare-parts articles', () => {
  const html = `
    <a href="/s/help-and-support/article/Dishwasher-Installation-Guide-8875">Install</a>
    <a href="/s/help-and-support/article/Dishwasher-User-Care-Guide-8870">User guide</a>
    <a href="/s/help-and-support/article/Spare-parts-manual-for-61575-A">Parts</a>`;
  assert.deepEqual(extractHaierSupportArticleUrls(
    html,
    'https://support.haier.com.au/s/help-and-support/dishwashing/product?id=HDW9TFE3SS',
  ), [
    'https://support.haier.com.au/s/help-and-support/article/Dishwasher-Installation-Guide-8875',
    'https://support.haier.com.au/s/help-and-support/article/Dishwasher-User-Care-Guide-8870',
  ]);
});

test('Haier finder resolves archived AU support articles and binds attachment provenance', async () => {
  const productUrl = 'https://support.haier.com.au/s/help-and-support/dishwashing/product?id=HDW9TFE3SS';
  const articleUrl = 'https://support.haier.com.au/s/help-and-support/article/Dishwasher-Installation-Guide-8875';
  const artifactLinkUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000ZuKH/bvotDdcSLfdw.htXZGovkodua2Mar.7lUf1eqIawLh4';
  const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw0000000001&d=%2Fa%2FJw000000ZuKH%2FbvotDdcSLfdw.htXZGovkodua2Mar.7lUf1eqIawLh4&operationContext=DELIVERY&viewId=05HJw0000000001&dpt=';
  const productPage = `<title>HDW9TFE3SS</title><a href="${articleUrl}">Installation guide</a>`;
  const articlePage = `<html><head><meta name="description" content="Install guide for HDW9-TFE3WH and HDW9-TFE3SS"></head><body><a href="${artifactLinkUrl}">Download</a></body></html>`;
  const writes = [];

  const result = await findHaierOfficialPdf({
    brand: 'Haier', sku: 'HDW9TFE3SS', category: 'dishwasher',
  }, {
    fetchImpl: fetchMock({ [productUrl]: productPage, [articleUrl]: articlePage }),
    salesforceResolver: async (url) => {
      assert.equal(url, artifactLinkUrl);
      return { url: artifactUrl, sourceUrl: artifactLinkUrl, name: 'Installation guide' };
    },
    sitemapIndexUrl: 'https://example.test/missing-sitemap.xml',
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  const hash = createHash('sha256').update(articlePage).digest('hex');
  assert.equal(result.sourceUrl, artifactUrl);
  assert.equal(result.resourceType, 'installation_guide');
  assert.equal(result.productUrl, productUrl);
  assert.deepEqual(result.resources[0].discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: articleUrl,
    requestedModel: 'HDW9TFE3SS',
    matchedModel: 'HDW9TFE3SS',
    artifactUrl,
    artifactLinkUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`,
    discoveryByteSize: Buffer.byteLength(articlePage),
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], result.resources[0].discoveryProvenance.discoveryObjectPath);
  assert.equal(writes[0][1].toString('utf8'), articlePage);
});

test('Haier finder does not bind a support article that only names a sibling model', async () => {
  const productUrl = 'https://support.haier.com.au/s/help-and-support/dishwashing/product?id=HDW15V2S1';
  const articleUrl = 'https://support.haier.com.au/s/help-and-support/article/Dishwasher-Installation-Guide-sibling';
  const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000Sibling/token';
  await assert.rejects(
    findHaierOfficialPdf({ brand: 'Haier', sku: 'HDW15V2S1', category: 'dishwasher' }, {
      fetchImpl: fetchMock({
        [productUrl]: `<title>HDW15V2S1</title><a href="${articleUrl}">Install</a>`,
        [articleUrl]: `<meta name="description" content="Guide for HDW15V3S1"><a href="${artifactUrl}">Download</a>`,
      }),
      renderedHtmlImpl: async (url) => ({
        finalUrl: url,
        contentType: 'text/html',
        bytes: Buffer.from(`<meta name="description" content="Guide for HDW15V3S1"><a href="${artifactUrl}">Download</a>`),
      }),
      sitemapIndexUrl: 'https://example.test/missing-sitemap.xml',
      writeObject: async () => {},
    }),
    /resources not found/i,
  );
});

test('Haier finder uses rendered official support HTML when static fetch returns a shell page', async () => {
  const productUrl = 'https://support.haier.com.au/s/help-and-support/dishwashing/product?id=HDW15V2S1';
  const articleUrl = 'https://support.haier.com.au/s/help-and-support/article/Dishwasher-Installation-Guide-8718';
  const artifactLinkUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000ZqtN/oO1cUd0E53LCavglAqCG6pIhUt8WxF0h1B7oKOFFR.g';
  const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw0000000002&d=%2Fa%2FJw000000ZqtN%2FoO1cUd0E53LCavglAqCG6pIhUt8WxF0h1B7oKOFFR.g&operationContext=DELIVERY&viewId=05HJw0000000002&dpt=';
  const renderedCalls = [];
  const rendered = {
    [productUrl]: `<title>HDW15V2S1</title><a href="${articleUrl}">Install</a>`,
    [articleUrl]: `<meta name="description" content="Guide for HDW15V2S1 and HDW15V3S1"><a href="${artifactLinkUrl}">Download</a>`,
  };

  const result = await findHaierOfficialPdf({
    brand: 'Haier', sku: 'HDW15V2S1', category: 'dishwasher',
  }, {
    fetchImpl: fetchMock({ [productUrl]: '<html>Salesforce shell</html>', [articleUrl]: '<html>Salesforce shell</html>' }),
    renderedHtmlImpl: async (url) => {
      renderedCalls.push(url);
      return { finalUrl: url, contentType: 'text/html', bytes: Buffer.from(rendered[url]) };
    },
    salesforceResolver: async () => ({ url: artifactUrl, sourceUrl: artifactLinkUrl }),
    sitemapIndexUrl: 'https://example.test/missing-sitemap.xml',
    writeObject: async () => {},
  });

  assert.deepEqual(renderedCalls, [productUrl, articleUrl]);
  assert.equal(result.sourceUrl, artifactUrl);
  assert.equal(result.discoveryProvenance.artifactLinkUrl, artifactLinkUrl);
  assert.equal(result.discoveryProvenance.discoveryUrl, articleUrl);
});

test('Haier finder rejects a Salesforce resolver that escapes the approved attachment identity', async () => {
  const productUrl = 'https://support.haier.com.au/s/help-and-support/dishwashing/product?id=HDW15G3W';
  const articleUrl = 'https://support.haier.com.au/s/help-and-support/article/Freestanding-Dishwasher-Installation-Guide-8468';
  const artifactLinkUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000Safe/token';

  await assert.rejects(
    findHaierOfficialPdf({ brand: 'Haier', sku: 'HDW15G3W', category: 'dishwasher' }, {
      fetchImpl: fetchMock({
        [productUrl]: `<title>HDW15G3W</title><a href="${articleUrl}">Install</a>`,
        [articleUrl]: `<meta name="description" content="Guide for HDW15G3W"><a href="${artifactLinkUrl}">Download</a>`,
      }),
      salesforceResolver: async () => ({
        url: 'https://attacker.example/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw0000000001&d=%2Fa%2FJw000000Safe%2Ftoken&operationContext=DELIVERY&viewId=05HJw0000000001',
        sourceUrl: artifactLinkUrl,
      }),
      sitemapIndexUrl: 'https://example.test/missing-sitemap.xml',
      writeObject: async () => {},
    }),
    /resources not found/i,
  );
});
