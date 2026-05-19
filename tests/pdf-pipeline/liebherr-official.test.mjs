import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLookupTokens,
  findLiebherrOfficialPdf,
  findMatchingProductUrls
} from '../../scripts/pdf-pipeline/liebherr-official.js';

const sitemapXml = `
  <urlset>
    <url><loc>https://www.appliancesonline.com.au/product/liebherr-icnh-5123lh-integrated-fridge</loc></url>
    <url><loc>https://www.appliancesonline.com.au/product/liebherr-icnh-5123rh-integrated-fridge</loc></url>
    <url><loc>https://www.appliancesonline.com.au/product/liebherr-cnef-4315-fridge-freezer</loc></url>
    <url><loc>https://www.appliancesonline.com.au/product/other-brand-icnh-5123</loc></url>
  </urlset>
`;

test('Liebherr finder matches sitemap URLs by SKU base and LH/RH variant', () => {
  const urls = findMatchingProductUrls(sitemapXml, { sku: 'ICNh 5123' });
  const tokens = buildLookupTokens({ sku: 'ICNh 5123' }, urls);

  assert.equal(urls.length, 2);
  assert.deepEqual(tokens.sort(), ['ICNH5123', 'ICNH5123LH', 'ICNH5123RH']);
});

test('Liebherr finder probes deterministic PDF candidate URLs from matching product tokens', async () => {
  const probed = [];
  const fetchImpl = async (url) => {
    if (String(url).endsWith('sitemap-products.xml')) {
      return new Response(sitemapXml, { status: 200 });
    }
    probed.push(String(url));
    const ok = /ICNH5123LH-Liebherr-(Specifications-Sheet|Installation-Guide)\.pdf$/.test(String(url));
    return new Response(ok ? '%PDF-fixture' : 'not found', { status: ok ? 206 : 404 });
  };

  const result = await findLiebherrOfficialPdf(
    { brand: 'Liebherr', sku: 'ICNh 5123' },
    { fetchImpl }
  );

  assert.equal(result.sourceUrl, 'https://www.appliancesonline.com.au/public/manuals/ICNH5123LH-Liebherr-Specifications-Sheet.pdf');
  assert.equal(result.resourceType, 'specification_sheet');
  assert.ok(result.resources.some((resource) => resource.sourceUrl.endsWith('ICNH5123LH-Liebherr-Specifications-Sheet.pdf')));
  assert.ok(result.resources.some((resource) => resource.sourceUrl.endsWith('ICNH5123LH-Liebherr-Installation-Guide.pdf')));
  assert.ok(probed.some((url) => url.includes('ICNH5123LH-Liebherr-Installation-Guide.pdf')));
});
