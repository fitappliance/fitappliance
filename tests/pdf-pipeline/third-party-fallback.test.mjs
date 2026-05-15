import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildThirdPartySearchQueries,
  discoverThirdPartyPdf,
  extractPdfUrlsFromHtml,
  extractSearchResultUrls,
  isTrustedThirdPartyUrl,
  scoreThirdPartyCandidateUrl
} from '../../scripts/pdf-pipeline/third-party-fallback.js';

test('third-party fallback builds SKU-specific PDF searches before broad searches', () => {
  const queries = buildThirdPartySearchQueries({
    brand: 'LG',
    sku: 'GB-335PL',
    category: 'fridge'
  });

  assert.match(queries[0], /"GB-335PL"/);
  assert.match(queries[0], /"LG"/);
  assert.match(queries[0], /filetype:pdf/);
  assert.ok(queries.some((query) => query.includes('commercial.appliancesonline.com.au')));
  assert.ok(queries.every((query) => !query.includes('undefined')));
});

test('third-party fallback only trusts approved manual and retailer repository hosts', () => {
  assert.equal(isTrustedThirdPartyUrl('https://commercial.appliancesonline.com.au/manuals/a.pdf'), true);
  assert.equal(isTrustedThirdPartyUrl('https://www.manualslib.com/manual/123/lg.html'), true);
  assert.equal(isTrustedThirdPartyUrl('https://device.report/m/example.pdf'), true);
  assert.equal(isTrustedThirdPartyUrl('https://random.example.com/manual.pdf'), false);
});

test('third-party fallback extracts PDF links and DuckDuckGo result redirects', () => {
  const searchHtml = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcommercial.appliancesonline.com.au%2Fmanuals%2FGB-335PL.pdf">PDF</a>
    <a href="https://www.manualslib.com/manual/123/Lg-Gb335pl.html">Manual</a>
  `;
  const pageHtml = `
    <a href="/manuals/ak/1/2/GB-335PL_Specifications_Sheet.pdf">Download</a>
    <a href="https://random.example.com/bad.pdf">Bad</a>
  `;

  assert.deepEqual(extractSearchResultUrls(searchHtml), [
    'https://commercial.appliancesonline.com.au/manuals/GB-335PL.pdf',
    'https://www.manualslib.com/manual/123/Lg-Gb335pl.html'
  ]);
  assert.deepEqual(extractPdfUrlsFromHtml(pageHtml, 'https://commercial.appliancesonline.com.au/product'), [
    'https://commercial.appliancesonline.com.au/manuals/ak/1/2/GB-335PL_Specifications_Sheet.pdf',
    'https://random.example.com/bad.pdf'
  ]);
});

test('third-party fallback scores exact SKU direct PDFs above generic pages', () => {
  const target = { brand: 'LG', sku: 'GB-335PL', category: 'fridge' };
  const direct = scoreThirdPartyCandidateUrl('https://commercial.appliancesonline.com.au/manuals/GB-335PL_Specifications_Sheet.pdf', target);
  const page = scoreThirdPartyCandidateUrl('https://www.manualslib.com/manual/123/Lg-Fridge.html', target);

  assert.ok(direct > page);
});

test('third-party fallback follows trusted pages to trusted direct PDFs', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes('duckduckgo.com') || String(url).includes('bing.com')) {
      return new Response(`
        <a href="https://www.manualslib.com/manual/123/Lg-Gb335pl.html">Manual</a>
      `, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (String(url).includes('manualslib.com')) {
      return new Response(`
        <a href="https://commercial.appliancesonline.com.au/manuals/GB-335PL_Specifications_Sheet.pdf">PDF</a>
      `, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await discoverThirdPartyPdf({
    brand: 'LG',
    sku: 'GB-335PL',
    category: 'fridge'
  }, { fetchImpl, maxQueries: 1 });

  assert.equal(result.sourceUrl, 'https://commercial.appliancesonline.com.au/manuals/GB-335PL_Specifications_Sheet.pdf');
  assert.equal(result.source, 'third-party-fallback:commercial.appliancesonline.com.au');
  assert.ok(requested.some((url) => url.includes('bing.com') || url.includes('duckduckgo.com')));
});
