import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyVerifiedCatalogOverrides
} = require('../scripts/apply-verified-catalog-overrides.js');

test('verified catalog overrides repair WBE4302WC dimensions in runtime data', () => {
  const runtime = {
    schema_version: 2,
    last_updated: '2026-07-01',
    products: [{
      id: 'fridge-arf2745',
      cat: 'fridge',
      brand: 'Westinghouse',
      model: 'WBE4302WC',
      w: 1725,
      h: 699,
      d: 723,
      price: 1234,
      retailer: 'Example Retailer',
      direct_url: 'https://retailer.example/product',
      affiliate_url: 'https://affiliate.example/product',
      evidence: { trust_level: 'retailer_spec' }
    }]
  };
  const catalogFinal = {
    products: [{
      id: 'fridge-arf2745',
      cat: 'fridge',
      brand: 'Westinghouse',
      model: 'WBE4302WC',
      w: 699,
      h: 1725,
      d: 723,
      price: 9999,
      retailer: 'Should Not Copy',
      direct_url: 'https://wrong.example/product',
      affiliate_url: 'https://wrong-affiliate.example/product',
      evidence: {
        raw_json_path: 'data/pdf-evidence-raw/WBE4302WC.json',
        confidence_score: 0.9,
        verified_fields: ['dimensions']
      }
    }]
  };

  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });

  assert.equal(result.products[0].w, 699);
  assert.equal(result.products[0].h, 1725);
  assert.equal(result.products[0].d, 723);
  assert.equal(result.products[0].price, 1234);
  assert.equal(result.products[0].retailer, 'Example Retailer');
  assert.equal(result.products[0].direct_url, 'https://retailer.example/product');
  assert.equal(result.products[0].affiliate_url, 'https://affiliate.example/product');
  assert.deepEqual(result.products[0].evidence, catalogFinal.products[0].evidence);
  assert.equal(result.summary.updatedProducts, 1);
});

test('verified catalog overrides ignore catalog rows without raw evidence or high confidence', () => {
  const runtime = {
    products: [{
      id: 'fridge-unverified',
      cat: 'fridge',
      w: 700,
      h: 1700,
      d: 700,
      evidence: { trust_level: 'retailer_spec' }
    }]
  };
  const catalogFinal = {
    products: [{
      id: 'fridge-unverified',
      cat: 'fridge',
      w: 650,
      h: 1800,
      d: 720,
      evidence: { confidence_score: 0.6 }
    }]
  };

  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });

  assert.deepEqual(result.products[0], runtime.products[0]);
  assert.equal(result.summary.updatedProducts, 0);
});

test('verified catalog overrides preserve runtime order and do not mutate inputs', () => {
  const runtime = {
    products: [
      { id: 'first', cat: 'fridge', w: 600, h: 1600, d: 700, evidence: { original: true } },
      { id: 'second', cat: 'dishwasher', w: 598, h: 845, d: 600, evidence: { original: true } }
    ]
  };
  const catalogFinal = {
    products: [
      {
        id: 'second',
        cat: 'dishwasher',
        w: 599,
        h: 846,
        d: 601,
        evidence: { confidence_score: 0.95, verified_fields: ['dimensions'] }
      },
      {
        id: 'first',
        cat: 'fridge',
        w: 601,
        h: 1601,
        d: 701,
        evidence: { confidence_score: 0.95, verified_fields: ['dimensions'] }
      }
    ]
  };
  const runtimeBefore = structuredClone(runtime);

  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });

  assert.deepEqual(result.products.map((product) => product.id), ['first', 'second']);
  assert.deepEqual(runtime, runtimeBefore);
  assert.notEqual(result.products[0], runtime.products[0]);
  assert.equal(result.products[0].w, 601);
  assert.equal(result.products[1].w, 599);
  assert.equal(result.summary.updatedProducts, 2);
});

test('verified catalog overrides canonicalize runtime brand casing even without dimension updates', () => {
  const runtime = {
    products: [{
      id: 'fridge-uppercase-brand',
      cat: 'fridge',
      brand: 'WESTINGHOUSE',
      model: 'WBE4302WC',
      w: 699,
      h: 1725,
      d: 723
    }]
  };
  const catalogFinal = {
    products: []
  };

  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });

  assert.equal(result.products[0].brand, 'Westinghouse');
  assert.equal(result.summary.updatedProducts, 1);
});
