import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildHisenseOccProductUrl,
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
