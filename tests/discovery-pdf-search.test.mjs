import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

const {
  buildDirectPdfCandidates,
  buildSearchQueries,
  extractDuckDuckGoResultUrls,
  extractYahooResultUrls,
  searchPdfForDiscovery,
} = require('../scripts/discovery-pipeline/lib/pdf-search.js');

test('DuckDuckGo result parser extracts decoded PDF result URLs', () => {
  const html = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmedia3.bosch-home.com%2FDocuments%2Fspecsheet%2Fen-AU%2FKFD96AXEAA.pdf&amp;rut=abc">PDF</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnot-product.html&amp;rut=def">HTML</a>
  `;

  const urls = extractDuckDuckGoResultUrls(html);

  assert.deepEqual(urls, [
    'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
    'https://example.com/not-product.html',
  ]);
});

test('Yahoo result parser extracts decoded RU redirect URLs', () => {
  const html = `
    <a href="https://r.search.yahoo.com/_ylt=x/RV=2/RE=1/RO=10/RU=https%3a%2f%2fmedia3.bosch-home.com%2fDocuments%2fspecsheet%2fen-AU%2fKFD96AXEAA.pdf/RK=2/RS=x">PDF</a>
  `;

  assert.deepEqual(extractYahooResultUrls(html), [
    'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
  ]);
});

test('PDF search adds Samsung fallback search domains for one-pagers and trusted retailer PDFs', () => {
  const queries = buildSearchQueries({ brand: 'Samsung', model: 'SRF5300BD' });

  assert.ok(queries.some((query) => query.includes('site:samsung.com')));
  assert.ok(queries.some((query) => query.includes('site:images.samsung.com') && query.includes('onepager')));
  assert.ok(queries.some((query) => query.includes('site:commercial.appliancesonline.com.au')));
});

test('PDF search prefers accepted official manufacturer PDF URLs that contain the model', async () => {
  const fixtureHtml = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2FKFD96AXEAA.pdf&amp;rut=bad">Bad host</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fimages.samsung.com%2Fis%2Fcontent%2Fsamsung%2Fp6%2Fau%2FSRF7300BSS-specification-sheet.pdf&amp;rut=good">Spec sheet</a>
  `;
  const seenQueries = [];

  const result = await searchPdfForDiscovery({
    brand: 'Samsung',
    model: 'SRF7300BSS',
    category: 'fridge',
  }, {
    delayMs: 0,
    fetchImpl: async (url) => {
      seenQueries.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => fixtureHtml,
      };
    },
  });

  assert.equal(result.url, 'https://images.samsung.com/is/content/samsung/p6/au/SRF7300BSS-specification-sheet.pdf');
  assert.equal(result.source, 'duckduckgo-html');
  assert.ok(seenQueries[0].includes('duckduckgo.com/html/'));
});

test('PDF search uses verified direct manufacturer URL patterns before search engines', async () => {
  const calls = [];
  const result = await searchPdfForDiscovery({
    brand: 'Bosch',
    model: 'KFD96AXEAA',
    category: 'fridge',
  }, {
    delayMs: 0,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 206,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => Buffer.from('%PDF-'),
      };
    },
  });

  assert.deepEqual(buildDirectPdfCandidates({ brand: 'Bosch', model: 'KFD96AXEAA' }), [
    'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
  ]);
  assert.equal(result.source, 'direct-manufacturer-pattern');
  assert.equal(result.url, 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf');
  assert.equal(calls.length, 1);
});
