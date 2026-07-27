import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractSmegProductUrlFromSitemap,
  extractSmegProductResources,
  findSmegOfficialEvidence,
} = require('../../scripts/pdf-pipeline/smeg-official.js');

const MODEL = 'FAB32RWH5AU';
const PRODUCT_URL = `https://www.smeg.com/au/products/${MODEL}`;
const PRODUCT_SHEET_URL = `https://pi-exchange.smeg.it/catalog/${MODEL}/en-AU`;

function response(body, contentType, status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

test('Smeg sitemap lookup requires an exact AU product model', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.smeg.com/au/products/FAB32RWH5AU</loc></url>
    <url><loc>https://www.smeg.com/au/products/FAB32RWH5</loc></url>
  </urlset>`;
  assert.equal(extractSmegProductUrlFromSitemap(xml, MODEL), PRODUCT_URL);
  assert.equal(extractSmegProductUrlFromSitemap(xml, 'FAB32RWH5AUX'), null);
});

test('Smeg product resources are accepted only from an exact canonical model page', () => {
  const html = `<html><head><link rel="canonical" href="${PRODUCT_URL}"></head>
    <body><h1>${MODEL}</h1><a href="${PRODUCT_SHEET_URL}">Product sheet</a></body></html>`;
  assert.deepEqual(extractSmegProductResources(html, PRODUCT_URL, MODEL), [{
    sourceUrl: PRODUCT_SHEET_URL,
    resourceType: 'specification_sheet',
  }]);
  assert.throws(
    () => extractSmegProductResources(
      html.replace(PRODUCT_URL, 'https://www.smeg.com/au/products/FAB32RWH5'),
      PRODUCT_URL,
      MODEL,
    ),
    /canonical.*model/i,
  );
});

test('Smeg finder persists sitemap and product page before emitting exact-model candidates', async () => {
  const sitemap = `<?xml version="1.0"?><urlset><url><loc>${PRODUCT_URL}</loc></url></urlset>`;
  const productHtml = `<html><head><link rel="canonical" href="${PRODUCT_URL}"></head>
    <body><h1>${MODEL}</h1><a href="${PRODUCT_SHEET_URL}">Product sheet</a></body></html>`;
  const writes = new Map();
  const fetchImpl = async (url) => {
    if (url === 'https://www.smeg.com/au/sitemap/products.xml') {
      return response(sitemap, 'application/xml');
    }
    if (url === PRODUCT_URL) return response(productHtml, 'text/html; charset=utf-8');
    return response('missing', 'text/plain', 404);
  };
  const result = await findSmegOfficialEvidence(
    { brand: 'Smeg', model: MODEL, category: 'fridge' },
    { fetchImpl, writeObject: async (path, bytes) => writes.set(path, Buffer.from(bytes)) },
  );

  assert.equal(result.sourceUrl, PRODUCT_SHEET_URL);
  assert.deepEqual(result.sourceLanes.map((lane) => [lane.laneId, lane.status]), [
    ['current_product', 'complete'],
    ['discontinued_archive', 'unsupported'],
    ['support_search_api', 'unsupported'],
    ['official_document_cdn', 'complete'],
    ['official_product_detail', 'complete'],
  ]);
  assert.deepEqual(result.resources.map((resource) => [
    resource.sourceLaneId,
    resource.sourceUrl,
    resource.requiredAttempt,
  ]), [
    ['official_document_cdn', PRODUCT_SHEET_URL, true],
    ['official_product_detail', PRODUCT_URL, false],
  ]);
  assert.equal(result.resources[0].discoveryProvenance.requestedModel, MODEL);
  assert.equal(result.resources[0].discoveryProvenance.matchedModel, MODEL);
  assert.equal(result.resources[0].discoveryProvenance.artifactUrl, PRODUCT_SHEET_URL);
  assert.equal(writes.size, 2);
  for (const [path, bytes] of writes) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.match(path, new RegExp(`/${hash}\\.(?:xml|html)$`));
  }
});

test('Smeg finder returns typed retryable lanes when exact product binding is absent', async () => {
  const result = await findSmegOfficialEvidence(
    { brand: 'Smeg', model: MODEL, category: 'fridge' },
    {
      fetchImpl: async () => response(
        '<?xml version="1.0"?><urlset><url><loc>https://www.smeg.com/au/products/FAB32RWH5</loc></url></urlset>',
        'application/xml',
      ),
      writeObject: async () => {},
    },
  );
  assert.equal(result.sourceUrl, null);
  assert.equal(result.resources.length, 0);
  assert.deepEqual(result.sourceLanes.filter((lane) => lane.required).map((lane) => lane.status), [
    'complete', 'retryable', 'retryable',
  ]);
});
