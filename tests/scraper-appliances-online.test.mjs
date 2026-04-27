import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  APPLIANCES_ONLINE_RETAILER,
  categoryUrlForAppliancesOnline,
  parseAppliancesOnlineProducts,
  scrapeAppliancesOnline,
} = require('../scripts/scrapers/appliances-online.js');

const fixturePath = path.join(repoRoot, 'scripts', 'scrapers', 'fixtures', 'appliances-online-fridges.html');

test('appliances online scraper: fixture extraction returns product facts only', () => {
  const html = fs.readFileSync(fixturePath, 'utf8');
  const products = parseAppliancesOnlineProducts(html, {
    category: 'fridges',
    sourceUrl: 'https://www.appliancesonline.com.au/category/fridges/',
    scrapedAt: '2026-04-27T00:00:00.000Z',
  });

  assert.equal(products.length, 3);
  assert.deepEqual(
    products.map((product) => [product.brand, product.model]),
    [
      ['Samsung', 'SRF7500BB'],
      ['LG', 'GF-L708MBL'],
      ['Fisher & Paykel', 'RF522ADUX5'],
    ]
  );
  assert.equal(products[0].url, 'https://www.appliancesonline.com.au/product/samsung-srf7500bb-family-hub-french-door-fridge');
  assert.equal(products[0].price, 3499);
  assert.ok(products.every((product) => product.retailer === APPLIANCES_ONLINE_RETAILER));
  assert.ok(products.every((product) => !Object.hasOwn(product, 'description')), 'POC must not capture retailer descriptions');
});

test('appliances online scraper: html injection path does not perform network fetch', async () => {
  const html = fs.readFileSync(fixturePath, 'utf8');

  const products = await scrapeAppliancesOnline({
    category: 'fridges',
    html,
    maxProducts: 2,
    fetchImpl: async () => {
      throw new Error('network should not be used for fixture mode');
    },
  });

  assert.equal(products.length, 2);
  assert.equal(products[1].brand, 'LG');
});

test('appliances online scraper: supported categories map to predictable category URLs', () => {
  assert.equal(categoryUrlForAppliancesOnline('fridges'), 'https://www.appliancesonline.com.au/category/fridges/');
  assert.equal(categoryUrlForAppliancesOnline('dishwashers'), 'https://www.appliancesonline.com.au/category/dishwashers/');
  assert.equal(categoryUrlForAppliancesOnline('dryers'), 'https://www.appliancesonline.com.au/category/dryers/');
  assert.equal(categoryUrlForAppliancesOnline('washing-machines'), 'https://www.appliancesonline.com.au/category/washing-machines/');
  assert.throws(() => categoryUrlForAppliancesOnline('ovens'), /Unsupported Appliances Online category/);
});

