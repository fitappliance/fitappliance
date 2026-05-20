import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearArtusiCaches,
  extractArtusiDownloadLinks,
  findArtusiOfficialPdf,
  productUrlMatchesTarget
} from '../../scripts/pdf-pipeline/artusi-official.js';

const sitemapXml = `
  <urlset>
    <url><loc>https://artusi.com.au/product/afbm462x/</loc></url>
    <url><loc>https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/</loc></url>
  </urlset>
`;

const dishwasherHtml = `
  <html><body>
    <h1>ADW5009X 60cm Freestanding Dishwasher</h1>
    <div>PDF Downloads</div>
    <a href="https://artusi.com.au/wp-content/uploads/2025/11/PF_ADW5009_Artusi-1.pdf">Specification Sheet</a>
    <a href="https://artusi.com.au/wp-content/uploads/2025/11/16076000B36026-General-combined-User-Manual-ADW5009XBWMBWQP12-U7609W-AUArtusi.pdf">User Manual</a>
  </body></html>
`;

test('Artusi finder extracts and classifies product-page PDF resources', () => {
  const resources = extractArtusiDownloadLinks(dishwasherHtml, 'https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/');

  assert.equal(resources.length, 2);
  assert.equal(resources[0].resourceType, 'specification_sheet');
  assert.equal(resources[1].resourceType, 'user_manual');
});

test('Artusi URL matching accepts family slugs without matching unrelated SKUs', () => {
  assert.equal(productUrlMatchesTarget('https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/', {
    sku: 'ADW5009X'
  }), true);
  assert.equal(productUrlMatchesTarget('https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5001/', {
    sku: 'ADW5009X'
  }), false);
});

test('Artusi official finder discovers the product page and returns all official PDFs', async () => {
  clearArtusiCaches();
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    if (url === 'https://artusi.com.au/wp-sitemap-posts-product-1.xml') {
      return { ok: true, text: async () => sitemapXml };
    }
    if (url === 'https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/') {
      return { ok: true, text: async () => dishwasherHtml };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await findArtusiOfficialPdf({ sku: 'ADW5009X' }, { fetchImpl });

  assert.equal(result.productUrl, 'https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/');
  assert.equal(result.resourceType, 'specification_sheet');
  assert.equal(result.resources.length, 2);
  assert.deepEqual(fetched, [
    'https://artusi.com.au/wp-sitemap-posts-product-1.xml',
    'https://artusi.com.au/product/60cm-freestanding-dishwasher-adw5009/'
  ]);
});
