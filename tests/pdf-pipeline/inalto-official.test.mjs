import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductPageUrlsForSku,
  extractPdfUrlsFromProductPage,
  findInaltoOfficialPdf
} from '../../scripts/pdf-pipeline/inalto-official.js';

test('Inalto finder extracts SKU product pages from sitemap XML', () => {
  const xml = `
    <urlset>
      <url><loc>https://inalto.house/en-au/chilling/p/43l-bar-fridge-white-ibf46w</loc></url>
      <url><loc>https://inalto.house/en-au/inalto-archive/p/129l-bar-fridge-stainless-steel-ibf129s</loc></url>
    </urlset>
  `;

  assert.deepEqual(extractProductPageUrlsForSku(xml, 'IBF129S'), [
    'https://inalto.house/en-au/inalto-archive/p/129l-bar-fridge-stainless-steel-ibf129s'
  ]);
});

test('Inalto finder extracts escaped Squarespace PDF links from product page HTML', () => {
  const html = `
    <p><a href=\\"/s/InAlto_ProductCard-IBF129S.pdf\\">Product Card</a></p>
    <p><a href=\\"/s/IBF129S-W_Manual_V10.pdf\\">User Manual</a></p>
  `;

  assert.deepEqual(extractPdfUrlsFromProductPage(html, 'https://inalto.house/en-au/inalto-archive/p/ibf129s'), [
    'https://inalto.house/s/InAlto_ProductCard-IBF129S.pdf',
    'https://inalto.house/s/IBF129S-W_Manual_V10.pdf'
  ]);
});

test('Inalto finder follows sitemap product page and prefers manual PDF', async () => {
  const fetchImpl = async (url) => {
    if (url === 'https://inalto.house/sitemap.xml') {
      return new Response('<url><loc>https://inalto.house/en-au/inalto-archive/p/129l-bar-fridge-stainless-steel-ibf129s</loc></url>');
    }
    if (url.includes('/129l-bar-fridge')) {
      return new Response('<a href=\\"/s/InAlto_ProductCard-IBF129S.pdf\\">Product Card</a><a href=\\"/s/IBF129S-W_Manual_V10.pdf\\">User Manual</a>');
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await findInaltoOfficialPdf({ sku: 'IBF129S', brand: 'Inalto' }, { fetchImpl });
  assert.equal(result.sourceUrl, 'https://inalto.house/s/IBF129S-W_Manual_V10.pdf');
  assert.equal(result.source, 'inalto-official');
});
