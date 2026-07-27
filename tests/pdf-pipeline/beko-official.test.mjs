import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryUrlsForTarget,
  extractManualResultUrlForSku,
  extractProductPageUrlsForSku,
  extractPdfUrlsFromPage,
  extractSearchResultUrls,
  findBekoOfficialPdf,
  manualSearchApiUrlForTarget,
  scorePdfUrl
} from '../../scripts/pdf-pipeline/beko-official.js';

test('Beko finder builds the bounded AU support search endpoint', () => {
  assert.equal(
    manualSearchApiUrlForTarget({ sku: 'BDF1640AX' }),
    'https://www.beko.com/content/bekoglobal/au/en/support/user-manual/jcr:content/root/responsivegrid/responsivegrid/productsearch.ajax.html?search=BDF1640AX'
  );
});

test('Beko finder selects only an exact model from support autocomplete HTML', () => {
  const html = `
    <a href="/au-en/support/user-manuals-result?search=BDF1640A"><span>BDF1640A</span></a>
    <a href="/au-en/support/user-manuals-result?search=BDF1640AX"><span class="ModelSelectItem__modelName">BDF1640AX</span></a>
    <a href="https://example.com/au-en/support/user-manuals-result?search=BDF1640AX"><span>BDF1640AX</span></a>
  `;
  assert.equal(
    extractManualResultUrlForSku(html, 'BDF1640AX'),
    'https://www.beko.com/au-en/support/user-manuals-result?search=BDF1640AX'
  );
  assert.equal(extractManualResultUrlForSku(html, 'BDF1640AXZ'), null);
});

test('Beko finder extracts official product PDFs from product pages', () => {
  const html = `
    <a href="/content/dam/australia-au-aem/australia-au-aemProductCatalog/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf">manual</a>
    <a href="/content/dam/bekoglobal/au/en/pdf/product/7685009077.pdf">Pdf</a>
  `;
  const urls = extractPdfUrlsFromPage(html, 'https://www.beko.com/au-en/home-appliances/demo');
  assert.equal(urls.length, 2);
  assert.ok(urls[0].startsWith('https://www.beko.com/content/dam/'));
});

test('Beko finder prefers a product-page-bound specification over a SKU user manual', () => {
  const target = { sku: 'BDFB1430B', brand: 'BEKO' };
  const generic = 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7685009077.pdf';
  const skuManual = 'https://www.beko.com/content/dam/australia-au-aem/product-documents/7685009077-BDFB1430B/en-US-User-Manual.pdf';
  assert.ok(scorePdfUrl(generic, target) > scorePdfUrl(skuManual, target));
});

test('Beko finder uses the exact AU manual result and binds every PDF to stored discovery HTML', async () => {
  const calls = [];
  const writes = [];
  const productPage = 'https://www.beko.com/au-en/home-appliances/freestanding-dishwasher/freestanding-dishwasher-16-place-settings-full-size-bdf1640ax';
  const manual = 'https://www.beko.com/content/dam/australia-au-aem/australia-au-aemProductCatalog/product-documents/7679159077-BDF1640AX/en-US-7679159077-User-Manual.pdf';
  const installation = 'https://www.beko.com/content/dam/australia-au-aem/australia-au-aemProductCatalog/product-documents/7679159077-BDF1640AX/en-US-7679159077-Installation-Diagram.pdf';
  const specification = 'https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7679159077.pdf';
  const supportApiUrl = 'https://www.beko.com/content/bekoglobal/au/en/support/user-manual/jcr:content/root/responsivegrid/responsivegrid/productsearch.ajax.html?search=BDF1640AX';
  const supportApiHtml = `<!doctype html><html><body>
    <a href="/au-en/support/user-manuals-result?search=BDF1640AX">
      <span class="ModelSelectItem__modelName">BDF1640AX</span>
    </a>
  </body></html>`;
  const discoveryHtml = `<!doctype html><html><body>
    <a href="${productPage}"><span>BDF1640AX</span></a>
    <a href="${manual}" aria-label="User Manual">User Manual</a>
    <a href="${installation}" aria-label="Installation Diagram">Installation Diagram</a>
  </body></html>`;
  const productHtml = `<!doctype html><html><body>
    <h1>BDF1640AX</h1>
    <a href="${specification}" aria-label="Product Specifications">Product Specifications</a>
    <a href="${manual}" aria-label="User Manual">User Manual</a>
  </body></html>`;
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: false, status: 403, text: async () => 'blocked' };
  };

  const result = await findBekoOfficialPdf(
    { sku: 'BDF1640AX', brand: 'BEKO', category: 'dishwasher' },
    {
      fetchImpl,
      timeoutMs: 1_000,
      scraplingImpl: async (url) => ({
        finalUrl: url,
        redirectChain: [],
        contentType: 'text/html',
        bytes: Buffer.from(url === supportApiUrl
          ? supportApiHtml
          : url === productPage ? productHtml : discoveryHtml),
      }),
      writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    }
  );
  assert.equal(result.sourceUrl, specification);
  assert.equal(result.productPageUrl, productPage);
  assert.equal(result.resources.length, 5);
  assert.equal(result.resources.every((resource) => resource.discoveryProvenance?.requestedModel === 'BDF1640AX'), true);
  assert.equal(result.resources.every((resource) => resource.discoveryProvenance?.matchedModel === 'BDF1640AX'), true);
  assert.equal(result.resources.every((resource) => resource.discoveryProvenance?.artifactUrl === resource.url), true);
  assert.equal(result.resources.find((resource) => resource.url === specification).requiredAttempt, true);
  assert.equal(result.resources.find((resource) => resource.url === manual).requiredAttempt, false);
  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.required, lane.supported, lane.status,
  ]), [
    ['current_product', false, true, 'complete'],
    ['discontinued_archive', false, false, 'unsupported'],
    ['support_search_api', true, true, 'complete'],
    ['official_document_cdn', true, true, 'complete'],
    ['official_product_detail', true, true, 'complete'],
  ]);
  assert.equal(result.resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn').length, 3);
  assert.equal(result.resources.filter((resource) => resource.sourceLaneId === 'official_product_detail').length, 2);
  assert.equal(writes.length, 3);
  assert.ok(writes.every((write) => /^evidence\/web\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.html$/.test(write.path)));
  assert.deepEqual(new Set(writes.map((write) => write.bytes.toString())), new Set([
    supportApiHtml, discoveryHtml, productHtml,
  ]));
  assert.equal(calls[0], supportApiUrl);
  assert.equal(calls.some((url) => String(url).includes('bing.com')), false);
});

test('Beko finder extracts SKU-specific product pages from category HTML', () => {
  const html = `
    <a href="/au-en/home-appliances/washing-machines/front-loading-machine-8-kg-1400-rpm-bflb8020w">BFLB8020W</a>
    <a href="/au-en/home-appliances/washing-machines/front-loading-machine-9-kg-bflb902adw">BFLB902ADW</a>
    <a href="/au-en/home-appliances/washing-machines/front-loading-machine-8-kg-1400-rpm-bflb8020wx">BFLB8020WX</a>
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
