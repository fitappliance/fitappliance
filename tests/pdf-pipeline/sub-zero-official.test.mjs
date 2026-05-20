import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyProductDetailCandidates,
  extractSubZeroDownloadLinks,
  findSubZeroOfficialPdf,
  subZeroProductRowMatchesTarget
} from '../../scripts/pdf-pipeline/sub-zero-official.js';

const skuList = [
  {
    Name: 'icb36-inch-built-in-freezer',
    ModelNumber: 'ICBCL3650F/S',
    ProductName: '91 cm Classic Freezer',
    ProductPageUrl: '/en/products/sub-zero/full-size-refrigeration/builtin-refrigerators/ICBCL3650F/icb36-inch-built-in-freezer',
    IsLegacy: false
  }
];

const productHtml = `
<html>
  <body>
    <h1>91 cm Classic Freezer</h1>
    <p>Model # ICBCL3650F/S</p>
    <a href="/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbcl3650f/icb-classic-qr-sheet-3650fs-st.pdf">
      ICBCL3650F/S Quick Reference Guide - Standard Installation (PDF)
    </a>
    <a href="/-/media/files/united-states/product-downloads/icb-sub-zero-wolf/sub-zero/design-guides/sub-zero-classic-series-ss-proud-design-guide.pdf">
      Design Guide Classic Stainless Proud (PDF)
    </a>
  </body>
</html>
`;

function mockFetch(map) {
  return async (url) => {
    const key = String(url);
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      return { ok: false, status: 404, text: async () => '' };
    }
    const value = map[key];
    return {
      ok: true,
      status: 200,
      json: async () => value,
      text: async () => typeof value === 'string' ? value : JSON.stringify(value)
    };
  };
}

test('Sub-Zero finder matches current product rows with safe suffix variants', () => {
  assert.equal(subZeroProductRowMatchesTarget(skuList[0], { sku: 'ICBCL3650F/S/P/L' }), true);
  assert.equal(subZeroProductRowMatchesTarget(skuList[0], { sku: 'ICBCL4250F/S' }), false);
});

test('Sub-Zero finder extracts and ranks Quick Reference Guide links from product pages', () => {
  const links = extractSubZeroDownloadLinks(productHtml, 'https://au.subzero-wolf.com/en/trade-resources/product-specifications/product-specifications-detail/icb36-inch-built-in-freezer');
  assert.equal(links[0].resourceType, 'quick_reference_guide');
  assert.match(links[0].url, /icb-classic-qr-sheet-3650fs-st\.pdf$/);
});

test('Sub-Zero finder returns official QRG resources from the SKU list endpoint', async () => {
  const result = await findSubZeroOfficialPdf({ sku: 'ICBCL3650F/S/P/L' }, {
    fetchImpl: mockFetch({
      'https://au.subzero-wolf.com/api/ProductSpecifications/GetSKUList?includeAccessories=False&includeDiscontinued=True&contextLanguage=en-AU': skuList,
      'https://au.subzero-wolf.com/en/trade-resources/product-specifications/product-specifications-detail/icb36-inch-built-in-freezer': productHtml
    })
  });

  assert.equal(result.source, 'sub-zero-official-quick_reference_guide');
  assert.match(result.sourceUrl, /3650fs-st\.pdf$/);
  assert.equal(result.resources.length, 2);
});

test('Sub-Zero finder builds legacy ICBBI product page candidates when API rows are absent', () => {
  const candidates = buildLegacyProductDetailCandidates({ sku: 'ICBBI-36F/O-RH' });
  assert.ok(candidates.some((url) => /icb36-inch-built-in-freezer-panel-ready/.test(url)));
});

test('Sub-Zero finder falls back to legacy product-page candidates', async () => {
  const legacyUrl = 'https://au.subzero-wolf.com/en/trade-resources/product-specifications/product-specifications-detail/icb36-inch-built-in-freezer-panel-ready';
  const legacyHtml = `
    <p>Model # ICBBI-36F/O</p>
    <a href="/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36f/icb-built-in-refrigeration-qr-sheet-36fo-st.pdf">
      ICBBI-36F/O Quick Reference Guide - Standard Installation (PDF)
    </a>
  `;
  const result = await findSubZeroOfficialPdf({ sku: 'ICBBI-36F/O-RH' }, {
    fetchImpl: mockFetch({
      'https://au.subzero-wolf.com/api/ProductSpecifications/GetSKUList?includeAccessories=False&includeDiscontinued=True&contextLanguage=en-AU': [],
      [legacyUrl]: legacyHtml
    })
  });

  assert.equal(result.productUrl, legacyUrl);
  assert.match(result.sourceUrl, /36fo-st\.pdf$/);
});
