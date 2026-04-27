import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildSearchQuery,
  calculateConfidence,
  isProductPageUrl,
  parseDuckDuckGoResults,
  researchRetailers,
  RETAILERS,
  selectTopProducts,
} = require('../scripts/research-retailers.js');

test('manual retailer research: search query combines model and site filter', () => {
  const query = buildSearchQuery(
    { brand: 'LG', model: 'GTH560NPL' },
    { domain: 'jbhifi.com.au' }
  );

  assert.equal(query, '"LG GTH560NPL" site:jbhifi.com.au');
});

test('manual retailer research: product URL detector accepts product pages and rejects search/category pages', () => {
  assert.equal(isProductPageUrl('https://www.jbhifi.com.au/products/lg-gth560npl'), true);
  assert.equal(isProductPageUrl('https://www.harveynorman.com.au/lg-gth560npl-fridge.html'), true);
  assert.equal(isProductPageUrl('https://www.jbhifi.com.au/search?q=LG'), false);
  assert.equal(isProductPageUrl('https://www.jbhifi.com.au/collections/fridges'), false);
  assert.equal(isProductPageUrl('https://www.appliancesonline.com.au/category/fridges/'), false);
});

test('manual retailer research: DuckDuckGo parser extracts first product result on target domain', () => {
  const html = `
    <html><body>
      <a class="result__a" href="https://www.example.com/not-it">Wrong site</a>
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.jbhifi.com.au%2Fproducts%2Flg-gth560npl">LG at JB Hi-Fi</a>
      <a class="result__a" href="https://www.jbhifi.com.au/collections/fridges">Category, should be ignored</a>
    </body></html>`;

  const result = parseDuckDuckGoResults(html, { domain: 'jbhifi.com.au' });

  assert.equal(result?.url, 'https://www.jbhifi.com.au/products/lg-gth560npl');
  assert.equal(result?.source, 'duckduckgo-search');
});

test('manual retailer research: DuckDuckGo parser ignores non-product target-domain results', () => {
  const html = `
    <html><body>
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.jbhifi.com.au%2Fsearch%3Fq%3DLG">Search result</a>
      <a class="result__a" href="https://www.jbhifi.com.au/collections/fridges">Category</a>
    </body></html>`;

  assert.equal(parseDuckDuckGoResults(html, { domain: 'jbhifi.com.au' }), null);
});

test('manual retailer research: confidence scoring follows found retailer count', () => {
  assert.equal(calculateConfidence(5, RETAILERS.length), 'high');
  assert.equal(calculateConfidence(3, RETAILERS.length), 'medium');
  assert.equal(calculateConfidence(0, RETAILERS.length), 'low');
  assert.equal(calculateConfidence(1, RETAILERS.length), 'low');
});

test('manual retailer research: priority selection is stable by score then id', () => {
  const products = [
    { id: 'b', priorityScore: 20 },
    { id: 'c', priorityScore: 10 },
    { id: 'a', priorityScore: 20 },
  ];

  assert.deepEqual(selectTopProducts(products, 2).map((product) => product.id), ['a', 'b']);
});

test('manual retailer research: mocked end-to-end report writes candidates without network side effects', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-retailer-research-'));
  const output = path.join(tmpDir, 'candidates.json');
  const fetchImpl = async (url) => {
    const query = decodeURIComponent(String(url));
    const domain = RETAILERS.find((retailer) => query.includes(retailer.domain))?.domain ?? 'jbhifi.com.au';
    return new Response(`
      <html><body>
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=${encodeURIComponent(`https://www.${domain}/products/mock-product`)}">Mock product</a>
      </body></html>
    `, { status: 200 });
  };

  const { report } = await researchRetailers({
    top: 1,
    category: 'fridge',
    output,
    fetchImpl,
    sleepFn: async () => {},
    now: new Date('2026-04-27T00:00:00.000Z'),
  });

  assert.equal(report.research_count, 1);
  const [entry] = Object.values(report.products);
  assert.equal(entry.approved, false);
  assert.equal(entry.confidence, 'high');
  assert.equal(entry.retailers.length, RETAILERS.length);
  assert.equal(fs.existsSync(output), true);
});
