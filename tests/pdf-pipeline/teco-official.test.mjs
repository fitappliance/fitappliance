import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTecoDownloadLinks,
  findTecoOfficialPdf
} from '../../scripts/pdf-pipeline/teco-official.js';

test('TECO official finder extracts exact-SKU manual PDFs and ignores catalog/warranty PDFs', () => {
  const html = `
    <a href="https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/09/TECO-HAD-Product-Catalogue.pdf">Catalogue</a>
    <a href="https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf">User Manual</a>
    <a href="https://appliances.teco.com.au/wp-content/uploads/sites/2/2025/10/TECO_Home_Appliances_Domestic_Warranty.pdf">Warranty</a>
    <a href="https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/OTHER-User-Manual.pdf">Other Manual</a>
  `;
  const links = extractTecoDownloadLinks(html, 'https://appliances.teco.com.au/product/334l-frost-free-refrigerator/', 'TFF334WNTAH');

  assert.equal(links.length, 1);
  assert.equal(links[0].resourceType, 'user_manual');
  assert.equal(links[0].sourceUrl, 'https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf');
});

test('TECO official finder uses WordPress product search and verifies exact SKU on product page', async () => {
  const productUrl = 'https://appliances.teco.com.au/product/334l-frost-free-refrigerator/';
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).startsWith('https://appliances.teco.com.au/wp-json/wp/v2/product')) {
      return {
        ok: true,
        text: async () => JSON.stringify([
          { id: 1, link: productUrl, title: { rendered: '334L Frost Free Refrigerator TFF334WNTAH' } }
        ])
      };
    }
    if (url === productUrl) {
      return {
        ok: true,
        text: async () => `
          <main>Model TFF334WNTAH</main>
          <a href="/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf">User Manual</a>
        `
      };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await findTecoOfficialPdf({ sku: 'TFF334WNTAH', brand: 'TECO' }, { fetchImpl });

  assert.equal(result.source, 'teco-official-user_manual');
  assert.equal(result.productUrl, productUrl);
  assert.equal(result.sourceUrl, 'https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf');
  assert.equal(calls.length, 2);
});

test('TECO official finder rejects product pages that do not contain the exact SKU', async () => {
  const productUrl = 'https://appliances.teco.com.au/product/some-fridge/';
  const fetchImpl = async (url) => {
    if (String(url).startsWith('https://appliances.teco.com.au/wp-json/wp/v2/product')) {
      return {
        ok: true,
        text: async () => JSON.stringify([
          { id: 1, link: productUrl, title: { rendered: 'Some TECO fridge TFF334WNTAH' } }
        ])
      };
    }
    return {
      ok: true,
      text: async () => '<a href="/manuals/OTHER-User-Manual.pdf">User Manual</a>'
    };
  };

  await assert.rejects(
    () => findTecoOfficialPdf({ sku: 'TFF334WNTAH', brand: 'TECO' }, { fetchImpl }),
    /does not contain exact SKU/
  );
});
