import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canonicalizeBrand } = require('../scripts/brand-canon.js');
const { validateProduct } = require('../scripts/schema.js');
const { isRetailerProductPageUrl } = require('../public/scripts/search-core.js');

const CATALOG_FILES = [
  'public/data/fridges.json',
  'public/data/dishwashers.json',
  'public/data/dryers.json',
  'public/data/washing-machines.json'
];

function loadProducts() {
  return CATALOG_FILES.flatMap((file) => {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    return document.products.map((product) => ({ ...product, __file: file }));
  });
}

test('catalog cleanup: every retailer URL that remains is a product page URL', () => {
  const badRows = [];
  for (const product of loadProducts()) {
    for (const retailer of product.retailers ?? []) {
      if (!isRetailerProductPageUrl(retailer?.url)) {
        badRows.push(`${product.__file}:${product.id}:${retailer?.n}:${retailer?.url}`);
      }
    }
  }

  assert.deepEqual(badRows, []);
});

test('catalog cleanup: all runtime products pass schema validation', () => {
  const schemaErrors = loadProducts().flatMap((product) => (
    validateProduct(product).map((error) => `${product.__file}:${error}`)
  ));

  assert.deepEqual(schemaErrors, []);
});

test('catalog cleanup: runtime brand casing matches brand-canon aliases', () => {
  const mismatches = loadProducts()
    .map((product) => ({
      product,
      canonical: canonicalizeBrand(product.brand)
    }))
    .filter(({ product, canonical }) => product.brand !== canonical)
    .map(({ product, canonical }) => `${product.__file}:${product.id}:${product.brand}->${canonical}`);

  assert.deepEqual(mismatches, []);
});
