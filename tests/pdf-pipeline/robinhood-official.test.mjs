import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearRobinhoodCaches,
  extractPdfUrls,
  findRobinhoodOfficialPdf,
  productUrlsFromSitemap
} from '../../scripts/pdf-pipeline/robinhood-official.js';

const technicalHtml = `
  <a href="https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual_2023.08.10.pdf?v=1">Manual</a>
  <a href="https://cdn.shopify.com/files/RHBFD121X_RHBFD121W_Technical_Sheet_Issue_1.pdf?v=2">Tech</a>
`;

const sitemapXml = `
  <urlset>
    <url><loc>https://robinhood.co.nz/products/copy-of-121l-bar-fridge</loc></url>
    <url><loc>https://robinhood.co.nz/products/395l-chest-freezer</loc></url>
  </urlset>
`;

test('Robinhood finder extracts Shopify PDF URLs from HTML', () => {
  const urls = extractPdfUrls(technicalHtml);
  assert.deepEqual(urls, [
    'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual_2023.08.10.pdf?v=1',
    'https://cdn.shopify.com/files/RHBFD121X_RHBFD121W_Technical_Sheet_Issue_1.pdf?v=2'
  ]);
});

test('Robinhood finder parses product sitemap URLs', () => {
  assert.deepEqual(productUrlsFromSitemap(sitemapXml), [
    'https://robinhood.co.nz/products/copy-of-121l-bar-fridge',
    'https://robinhood.co.nz/products/395l-chest-freezer'
  ]);
});

test('Robinhood finder prefers exact technical-page resources for a SKU', async () => {
  clearRobinhoodCaches();
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    if (String(url).includes('/pages/technical')) {
      return new Response(technicalHtml, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await findRobinhoodOfficialPdf(
    { brand: 'Robinhood', sku: 'RHBFD121W' },
    { fetchImpl }
  );

  assert.equal(result.sourceUrl, 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual_2023.08.10.pdf?v=1');
  assert.equal(result.resources.length, 2);
  assert.equal(result.resources[0].resourceType, 'user_manual');
  assert.ok(fetched.some((url) => url.includes('/pages/technical')));
});

test('Robinhood finder falls back to product sitemap pages when technical page lacks the SKU', async () => {
  clearRobinhoodCaches();
  const fetchImpl = async (url) => {
    if (String(url).includes('/pages/technical')) {
      return new Response('<html>No target PDFs</html>', { status: 200 });
    }
    if (String(url).includes('/sitemap_products_1.xml')) {
      return new Response(sitemapXml, { status: 200 });
    }
    if (String(url).endsWith('/copy-of-121l-bar-fridge')) {
      return new Response(`
        Product RHBFD121W
        <a href="https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf">Manual</a>
      `, { status: 200 });
    }
    return new Response('not target', { status: 200 });
  };

  const result = await findRobinhoodOfficialPdf(
    { brand: 'Robinhood', sku: 'RHBFD121W' },
    { fetchImpl }
  );

  assert.equal(result.sourceUrl, 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf');
  assert.equal(result.source, 'robinhood-official-user_manual');
});
