import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildHisenseOccProductUrl,
  findHisenseOfficialEvidence,
  findHisenseOfficialPdf,
  hisenseProductCodeMatchesSku,
  selectHisensePdfResource
} = require('../../scripts/pdf-pipeline/hisense-official.js');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function bodyResponse(body, {
  status = 200,
  url = 'https://hisense.com.au/',
  contentType = 'application/json',
} = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    arrayBuffer: async () => bytes,
  };
}

test('Hisense evidence finder completes bounded source lanes when an exact retired model has no live product', async () => {
  const written = [];
  const result = await findHisenseOfficialEvidence({
    brand: 'Hisense',
    sku: 'HRCD650SW',
    category: 'fridge',
  }, {
    writeObject: async (objectPath, bytes) => written.push([objectPath, Buffer.from(bytes)]),
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === 'https://hisense.com.au/sitemap.xml') {
        return bodyResponse(
          '<sitemapindex><sitemap><loc>https://hisense.com.au/sitemap-products.xml</loc></sitemap></sitemapindex>',
          { url: value, contentType: 'application/xml' },
        );
      }
      if (value === 'https://hisense.com.au/sitemap-products.xml') {
        return bodyResponse(
          '<urlset><url><loc>https://hisense.com.au/product/HRCD585BW/current-fridge</loc></url></urlset>',
          { url: value, contentType: 'application/xml' },
        );
      }
      if (value.includes('/products/HRCD650SW?')) {
        return bodyResponse({ errors: [{ type: 'UnknownIdentifierError' }] }, {
          status: 400,
          url: value,
        });
      }
      if (value.includes('/products/search?')) {
        return bodyResponse({ products: [], pagination: { totalResults: 0 } }, { url: value });
      }
      throw new Error(`Unexpected URL ${value}`);
    },
  });

  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.sourceLanes.map((lane) => [lane.laneId, lane.status]), [
    ['current_product', 'complete'],
    ['discontinued_archive', 'unsupported'],
    ['support_search_api', 'complete'],
    ['official_document_cdn', 'complete'],
    ['official_product_detail', 'complete'],
  ]);
  assert.equal(result.sourceLanes.find((lane) => lane.laneId === 'official_document_cdn').candidateCount, 0);
  assert.ok(result.sourceLanes.filter((lane) => lane.status === 'complete')
    .every((lane) => lane.provenance.length > 0));
  assert.equal(written.length, 4);
  assert.ok(written.every(([objectPath]) => /^evidence\/web\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.(?:json|xml)$/.test(objectPath)));
});

test('Hisense evidence finder binds exact OCC documents and product detail to immutable discovery payloads', async () => {
  const productPageUrl = 'https://hisense.com.au/product/HRBM418S/bottom-mount-fridge';
  const specificationUrl = 'https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf';
  const result = await findHisenseOfficialEvidence({
    brand: 'Hisense',
    sku: 'HRBM418S',
    category: 'fridge',
  }, {
    writeObject: async () => {},
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === 'https://hisense.com.au/sitemap.xml') {
        return bodyResponse(
          '<sitemapindex><sitemap><loc>https://hisense.com.au/sitemap-products.xml</loc></sitemap></sitemapindex>',
          { url: value, contentType: 'application/xml' },
        );
      }
      if (value === 'https://hisense.com.au/sitemap-products.xml') {
        return bodyResponse(`<urlset><url><loc>${productPageUrl}</loc></url></urlset>`, {
          url: value,
          contentType: 'application/xml',
        });
      }
      if (value.includes('/products/HRBM418S?')) {
        return bodyResponse({
          code: 'HRBM418S',
          name: 'Bottom Mount Fridge',
          url: '/product/HRBM418S/bottom-mount-fridge',
          specificationDoc: { name: 'HRBM418S-Spec.pdf', url: '/medias/HRBM418S-Spec.pdf' },
          productManual: { name: 'HRBM418S-UM.pdf', url: '/medias/HRBM418S-UM.pdf' },
        }, { url: value });
      }
      if (value.includes('/products/search?')) {
        return bodyResponse({ products: [], pagination: { totalResults: 0 } }, { url: value });
      }
      if (value === productPageUrl) {
        return bodyResponse('<html><body>Model No. HRBM418S</body></html>', {
          url: value,
          contentType: 'text/html',
        });
      }
      throw new Error(`Unexpected URL ${value}`);
    },
  });

  assert.equal(result.sourceUrl, specificationUrl);
  assert.deepEqual(result.resources.map((resource) => [resource.resourceType, resource.sourceLaneId]), [
    ['specification_doc', 'official_document_cdn'],
    ['product_manual', 'official_document_cdn'],
    ['product_page', 'official_product_detail'],
  ]);
  assert.equal(result.resources[0].discoveryProvenance.method, 'official_market_api');
  assert.equal(result.resources[0].discoveryProvenance.artifactUrl, specificationUrl);
  assert.equal(result.resources[2].discoveryProvenance.method, 'official_product_page');
  assert.equal(result.sourceLanes.find((lane) => lane.laneId === 'official_document_cdn').candidateCount, 2);
});

test('Hisense official finder reads specificationDoc from the OCC product endpoint', async () => {
  const calls = [];
  const result = await findHisenseOfficialPdf({
    brand: 'Hisense',
    sku: 'HRBM418S',
    category: 'fridge'
  }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      assert.equal(String(url), buildHisenseOccProductUrl('HRBM418S'));
      return jsonResponse({
        code: 'HRBM418S',
        name: 'Hisense Bottom Mount Fridge',
        url: '/product/HRBM418S/bottom-mount-fridge',
        specificationDoc: {
          name: 'HRBM418S-Spec.pdf',
          url: '/medias/HRBM418S-Spec.pdf'
        },
        productManual: {
          name: 'HRBM418S-UM.pdf',
          url: '/medias/HRBM418S-UM.pdf'
        }
      });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.sourceUrl, 'https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf');
  assert.equal(result.source, 'hisense-official-specification_doc');
  assert.equal(result.resourceType, 'specification_doc');
  assert.equal(result.productPageUrl, 'https://hisense.com.au/product/HRBM418S/bottom-mount-fridge');
});

test('Hisense official finder removes an OCC trailing slug hyphen from product page URLs', async () => {
  const result = await findHisenseOfficialPdf({
    brand: 'Hisense',
    sku: 'HWF3S8514X',
    category: 'washing_machine',
  }, {
    fetchImpl: async () => jsonResponse({
      code: 'HWF3S8514X',
      name: 'Hisense front load washing machine',
      url: '/product/HWF3S8514X/8.5kg-series-3-front-load-washer-',
      specificationDoc: {
        name: 'HWF3S8514X-Spec.pdf',
        url: '/medias/HWF3S8514X-Spec.pdf',
      },
    }),
  });

  assert.equal(
    result.productPageUrl,
    'https://hisense.com.au/product/HWF3S8514X/8.5kg-series-3-front-load-washer',
  );
});

test('Hisense official finder uses product search when direct OCC lookup misses', async () => {
  const calls = [];
  const result = await findHisenseOfficialPdf({
    brand: 'Hisense',
    sku: 'HWF3S8514',
    category: 'washing_machine'
  }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('/products/HWF3S8514?')) {
        return jsonResponse({}, 404);
      }
      if (String(url).includes('/products/search?')) {
        return jsonResponse({
          products: [{
            code: 'HWF3S8514',
            name: 'Hisense front load washing machine',
            specificationDoc: {
              name: 'HWF3S8514-Spec.pdf',
              url: 'https://assets.example.test/HWF3S8514-Spec.pdf'
            }
          }]
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.sourceUrl, 'https://assets.example.test/HWF3S8514-Spec.pdf');
  assert.equal(result.productCode, 'HWF3S8514');
});

test('Hisense official finder extracts clean SKU token from catalog titles', async () => {
  const calls = [];
  const result = await findHisenseOfficialPdf({
    brand: 'Hisense',
    sku: 'HRCD563BW Side by Side 563L',
    category: 'fridge'
  }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('/products/HRCD563BW%20SIDE%20BY%20SIDE%20563L?')) {
        return jsonResponse({}, 400);
      }
      assert.equal(String(url), buildHisenseOccProductUrl('HRCD563BW'));
      return jsonResponse({
        code: 'HRCD563BW',
        name: 'Hisense side by side fridge',
        specificationDoc: {
          name: 'HRCD563BW-Spec.pdf',
          url: '/medias/HRCD563BW-Spec.pdf'
        }
      });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.productCode, 'HRCD563BW');
});

test('Hisense official matcher accepts exact and manifest wildcard matches only', () => {
  assert.equal(hisenseProductCodeMatchesSku('HWF3S8514X', 'HWF3S8514*'), true);
  assert.equal(hisenseProductCodeMatchesSku('HWF3S8514', 'HWF3S8514'), true);
  assert.equal(hisenseProductCodeMatchesSku('HRCD563BW', 'HRCD563BW'), true);
  assert.equal(hisenseProductCodeMatchesSku('HRCD563BW', 'HRTF206'), false);
  assert.equal(hisenseProductCodeMatchesSku('HR', 'HRCD563BW'), false);
});

test('Hisense official resource selector prefers specification PDFs over manuals', () => {
  const resource = selectHisensePdfResource({
    specificationDoc: { name: 'spec.pdf', url: '/spec.pdf' },
    productManual: { name: 'manual.pdf', url: '/manual.pdf' }
  });

  assert.equal(resource.type, 'specification_doc');
  assert.equal(resource.url, 'https://dtc-aus-api.hisense.com/spec.pdf');
});

test('Hisense official finder fails closed on ambiguous search-only matches', async () => {
  await assert.rejects(() => findHisenseOfficialPdf({
    brand: 'Hisense',
    sku: 'HRCD563*',
    category: 'fridge'
  }, {
    fetchImpl: async (url) => {
      if (String(url).includes('/products/HRCD563*?')) return jsonResponse({}, 404);
      return jsonResponse({
        products: [
          { code: 'HRCD563BW', specificationDoc: { url: '/one.pdf' } },
          { code: 'HRCD563TBW', specificationDoc: { url: '/two.pdf' } }
        ]
      });
    }
  }), /ambiguous/i);
});
