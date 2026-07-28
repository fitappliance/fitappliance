import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('Inalto finder binds a manual to immutable exact-model product-page provenance', async () => {
  const productPageUrl = 'https://inalto.house/en-au/chilling/p/142l-hybrid-chest-fridge-freezer-icf142b2';
  const artifactUrl = 'https://inalto.house/s/ICF142B2-User-Manual.pdf';
  const html = `<h1>142L Hybrid Chest Fridge/Freezer ICF142B2</h1><a href="${artifactUrl}">User Manual</a>`;
  const writes = [];
  const fetchImpl = async (url) => {
    if (url === 'https://inalto.house/sitemap.xml') {
      return new Response(`<url><loc>${productPageUrl}</loc></url>`);
    }
    if (url === productPageUrl) return new Response(html);
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await findInaltoOfficialPdf(
    { sku: 'ICF142B2', brand: 'InAlto' },
    { fetchImpl, writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }) },
  );
  const hash = createHash('sha256').update(Buffer.from(html)).digest('hex');

  assert.equal(result.sourceUrl, artifactUrl);
  assert.equal(result.discoveryProvenance.method, 'official_product_page');
  assert.equal(result.discoveryProvenance.requestedModel, 'ICF142B2');
  assert.equal(result.discoveryProvenance.matchedModel, 'ICF142B2');
  assert.equal(result.discoveryProvenance.discoveryUrl, productPageUrl);
  assert.equal(result.discoveryProvenance.artifactUrl, artifactUrl);
  assert.equal(result.discoveryProvenance.discoveryContentSha256, hash);
  assert.equal(result.discoveryProvenance.discoveryObjectPath,
    `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`);
  assert.equal(result.discoveryProvenance.discoveryByteSize, Buffer.byteLength(html));
  assert.deepEqual(writes, [{
    path: result.discoveryProvenance.discoveryObjectPath,
    bytes: Buffer.from(html),
  }]);
});
