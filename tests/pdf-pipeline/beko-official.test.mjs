import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryUrlsForTarget,
  extractProductPageUrlsForSku,
  extractPdfUrlsFromPage,
  extractSearchResultUrls,
  findBekoOfficialPdf,
  scorePdfUrl
} from '../../scripts/pdf-pipeline/beko-official.js';

test('Beko finder extracts official product PDFs from product pages', () => {
  const html = `
    <a href="/content/dam/australia-au-aem/australia-au-aemProductCatalog/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf">manual</a>
    <a href="/content/dam/bekoglobal/au/en/pdf/product/7685009077.pdf">Pdf</a>
  `;
  const urls = extractPdfUrlsFromPage(html, 'https://www.beko.com/au-en/home-appliances/demo');
  assert.equal(urls.length, 2);
  assert.ok(urls[0].startsWith('https://www.beko.com/content/dam/'));
});

test('Beko finder prefers SKU-bearing official PDFs over generic product PDFs', () => {
  const target = { sku: 'BDFB1430B', brand: 'BEKO' };
  const generic = 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7685009077.pdf';
  const skuManual = 'https://www.beko.com/content/dam/australia-au-aem/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf';
  assert.ok(scorePdfUrl(skuManual, target) > scorePdfUrl(generic, target));
});

test('Beko finder follows search result pages and returns a PDF', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('bing.com')) {
      return {
        ok: true,
        text: async () => '<a href="https://www.beko.com/au-en/home-appliances/freestanding-dishwasher/freestanding-dishwasher-14-place-settings-full-size-bdfb1430b">result</a>'
      };
    }
    return {
      ok: true,
      text: async () => '<a href="/content/dam/australia-au-aem/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf">manual</a>'
    };
  };

  const result = await findBekoOfficialPdf(
    { sku: 'BDFB1430B', brand: 'BEKO' },
    { fetchImpl, timeoutMs: 1_000 }
  );
  assert.equal(result.sourceUrl, 'https://www.beko.com/content/dam/australia-au-aem/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf');
  assert.ok(calls.some((url) => String(url).includes('bing.com')));
});

test('Beko finder extracts SKU-specific product pages from category HTML', () => {
  const html = `
    <a href="/au-en/home-appliances/washing-machines/front-loading-machine-8-kg-1400-rpm-bflb8020w">BFLB8020W</a>
    <a href="/au-en/home-appliances/washing-machines/front-loading-machine-9-kg-bflb902adw">BFLB902ADW</a>
  `;
  const urls = extractProductPageUrlsForSku(
    html,
    'https://www.beko.com/au-en/home-appliances/washing-machines',
    'BFLB8020W'
  );
  assert.deepEqual(urls, [
    'https://www.beko.com/au-en/home-appliances/washing-machines/front-loading-machine-8-kg-1400-rpm-bflb8020w'
  ]);
});

test('Beko finder selects category pages by appliance category', () => {
  assert.ok(categoryUrlsForTarget({ category: 'washing_machine' }).some((url) => url.endsWith('/washing-machines')));
  assert.ok(categoryUrlsForTarget({ category: 'dishwasher' }).some((url) => url.endsWith('/freestanding-dishwasher')));
});

test('Beko finder decodes direct Beko result URLs only', () => {
  const html = `
    <a href="https://www.beko.com/content/dam/australia-au-aem/product-documents/7178552800-BFLB8020W/en-US-User-Manual.pdf">pdf</a>
    <a href="https://example.com/file.pdf">bad</a>
  `;
  const urls = extractSearchResultUrls(html);
  assert.deepEqual(urls, [
    'https://www.beko.com/content/dam/australia-au-aem/product-documents/7178552800-BFLB8020W/en-US-User-Manual.pdf'
  ]);
});
