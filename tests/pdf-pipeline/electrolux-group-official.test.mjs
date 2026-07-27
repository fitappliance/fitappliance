import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildElectroluxGroupFactsheetUrl,
  findElectroluxGroupFactsheet,
  resolveElectroluxGroupBrand
} = require('../../scripts/pdf-pipeline/electrolux-group-official.js');

test('Electrolux group resolver recognizes only supported AU brands', () => {
  assert.equal(resolveElectroluxGroupBrand({ brand: 'KELVINATOR' }), 'Kelvinator');
  assert.equal(resolveElectroluxGroupBrand({ product: { brand: 'Westinghouse' } }), 'Westinghouse');
  assert.equal(resolveElectroluxGroupBrand({ brand: 'Electrolux' }), 'Electrolux');
  assert.equal(resolveElectroluxGroupBrand({ brand: 'AEG' }), null);
});

test('Electrolux group resolver builds an exact model factsheet URL', () => {
  assert.equal(
    buildElectroluxGroupFactsheetUrl({ brand: 'Kelvinator', sku: ' KBM5302AC ' }),
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator'
  );
});

test('Electrolux group resolver probes the exact official PDF without downloading it', async () => {
  const requests = [];
  const result = await findElectroluxGroupFactsheet({
    brand: 'Kelvinator',
    sku: 'KBM5302AC'
  }, {
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/pdf' : null }
      };
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'HEAD');
  assert.equal(result.source, 'kelvinator-official-fact_sheet');
  assert.equal(result.resourceType, 'fact_sheet');
  assert.equal(result.verifiedAlias, 'KBM5302AC');
  assert.match(result.sourceUrl, /modelNumber=KBM5302AC&brand=Kelvinator$/);
});

test('Electrolux group resolver rejects missing and non-PDF model responses', async () => {
  await assert.rejects(
    findElectroluxGroupFactsheet({ brand: 'Kelvinator', sku: 'NOTREAL' }, {
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' } })
    }),
    /404.*NOTREAL/i
  );
  await assert.rejects(
    findElectroluxGroupFactsheet({ brand: 'Kelvinator', sku: 'KBM5302AC' }, {
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' } })
    }),
    /not a PDF/i
  );
});

test('Electrolux typed discovery binds an exact sitemap product page and its documents', async () => {
  const writes = [];
  const sitemapUrl = 'https://www.electrolux.com.au/sitemap.xml';
  const productUrl = 'https://www.electrolux.com.au/fridges-and-freezers/freezers/efe4227sc-l/';
  const siblingUrl = 'https://www.electrolux.com.au/fridges-and-freezers/freezers/efe4227sc-r/';
  const factsheetUrl = 'https://www.electrolux.com.au/documenthandler.ashx?file=exact-factsheet';
  const manualUrl = 'https://www.electrolux.com.au/documenthandler.ashx?file=family-manual';
  const sitemapXml = `<?xml version="1.0"?><urlset>
    <url><loc>${siblingUrl}</loc></url><url><loc>${productUrl}</loc></url>
  </urlset>`;
  const productHtml = `<!doctype html><html><head><title>EFE4227SC-L | Electrolux Australia</title></head>
    <body><h1>388L single door freezer - EFE4227SC-L</h1>
      <a href="${factsheetUrl}" data-ga4-file-name="Fact Sheet">Electrolux EFE4227SC Fact Sheet</a>
      <a href="${manualUrl}" data-ga4-file-name="User Manual">Electrolux Refrigeration User Manual</a>
    </body></html>`;
  const pageFetchImpl = async (url) => {
    const body = String(url) === sitemapUrl ? sitemapXml
      : String(url) === productUrl ? productHtml : null;
    assert.notEqual(body, null, `unexpected URL ${url}`);
    return { ok: true, status: 200, url: String(url), text: async () => body };
  };

  const result = await findElectroluxGroupFactsheet({
    brand: 'Electrolux', model: 'EFE4227SC-L', category: 'fridge',
  }, {
    pageFetchImpl,
    writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
  });

  assert.equal(result.sourceUrl, factsheetUrl);
  assert.equal(result.productUrl, productUrl);
  assert.deepEqual(result.resources.map((resource) => [
    resource.resourceType, resource.sourceLaneId, resource.sourceUrl, resource.requiredAttempt,
  ]), [
    ['product_page', 'official_product_detail', productUrl, false],
    ['fact_sheet', 'official_document_cdn', factsheetUrl, true],
    ['user_manual', 'official_document_cdn', manualUrl, false],
  ]);
  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.required, lane.supported, lane.status,
  ]), [
    ['current_product', true, true, 'complete'],
    ['discontinued_archive', false, false, 'unsupported'],
    ['support_search_api', false, false, 'unsupported'],
    ['official_document_cdn', true, true, 'complete'],
    ['official_product_detail', true, true, 'complete'],
  ]);
  assert.equal(writes.length, 2);
  assert.ok(writes.some((write) => write.path.endsWith('.xml')));
  assert.ok(writes.some((write) => write.path.endsWith('.html')));
  assert.equal(result.resources.every((resource) => (
    resource.discoveryProvenance?.requestedModel === 'EFE4227SC-L'
      && resource.discoveryProvenance?.matchedModel === 'EFE4227SC-L'
      && resource.discoveryProvenance?.artifactUrl === resource.sourceUrl
  )), true);
});

test('Electrolux typed discovery unwraps official documenthandler links without losing page provenance', async () => {
  const sitemapUrl = 'https://www.electrolux.com.au/sitemap.xml';
  const productUrl = 'https://www.electrolux.com.au/fridges-and-freezers/freezers/ere5047sc-r/';
  const directUrl = 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=ERE5047SC&brand=Electrolux';
  const encoded = Buffer.from(directUrl).toString('base64url');
  const wrapperUrl = `https://www.electrolux.com.au/documenthandler.ashx?file=${encoded}&lang=`;
  const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>${productUrl}</loc></url></urlset>`;
  const productHtml = `<!doctype html><html><head><title>ERE5047SC-R | Electrolux Australia</title></head>
    <body><h1>ERE5047SC-R</h1><a href="${wrapperUrl}" data-ga4-file-name="Fact Sheet">Fact Sheet</a></body></html>`;

  const result = await findElectroluxGroupFactsheet({
    brand: 'Electrolux', model: 'ERE5047SC-R', category: 'fridge',
  }, {
    pageFetchImpl: async (url) => ({
      ok: true,
      status: 200,
      url: String(url),
      text: async () => String(url) === sitemapUrl ? sitemapXml : productHtml,
    }),
    writeObject: async () => {},
  });

  const factSheet = result.resources.find((resource) => resource.resourceType === 'fact_sheet');
  assert.equal(factSheet.sourceUrl, directUrl);
  assert.equal(factSheet.discoveryProvenance.artifactUrl, directUrl);
  assert.equal(factSheet.discoveryProvenance.artifactLinkUrl, wrapperUrl);
});
