import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = [
  'public/data/fridges.json',
  'public/data/dishwashers.json',
  'public/data/dryers.json',
  'public/data/washing-machines.json'
];

function formatNumber(value) {
  return new Intl.NumberFormat('en-AU').format(value);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function currentMetrics() {
  const products = dataFiles.flatMap((relativePath) => {
    const document = JSON.parse(readText(relativePath));
    return Array.isArray(document.products) ? document.products : [];
  });
  const linkedProducts = products.filter((product) => Array.isArray(product.retailers) && product.retailers.length > 0);
  const retailerLinks = linkedProducts.reduce((count, product) => count + product.retailers.length, 0);
  const pricedLinks = linkedProducts.reduce(
    (count, product) => count + product.retailers.filter((retailer) => Number(retailer.p) > 0).length,
    0
  );

  return {
    rawCatalogProducts: products.length,
    retailerVerifiedProducts: linkedProducts.length,
    verifiedRetailerLinks: retailerLinks,
    livePriceRows: pricedLinks
  };
}

test('retailer metrics copy: README names raw catalog, verified retailer products, links, and price rows separately', () => {
  const metrics = currentMetrics();
  const readme = readText('README.md');

  assert.match(readme, new RegExp(`Raw specs catalog: ${formatNumber(metrics.rawCatalogProducts)} products`));
  assert.match(readme, new RegExp(`Retailer-verified products: ${formatNumber(metrics.retailerVerifiedProducts)}`));
  assert.match(readme, new RegExp(`Verified retailer links: ${formatNumber(metrics.verifiedRetailerLinks)}`));
  assert.match(readme, new RegExp(`Live price rows: ${formatNumber(metrics.livePriceRows)}`));
  assert.doesNotMatch(readme, /609 products with AU retailer data/i);
});

test('retailer metrics copy: methodology uses current verified-link numbers, not stale retailer-data counts', () => {
  const metrics = currentMetrics();
  const methodology = readText('pages/methodology.html');

  assert.match(
    methodology,
    new RegExp(`${formatNumber(metrics.retailerVerifiedProducts)} of ${formatNumber(metrics.rawCatalogProducts)} raw catalog products`)
  );
  assert.match(methodology, new RegExp(`${formatNumber(metrics.verifiedRetailerLinks)} verified retailer product-page links`));
  assert.doesNotMatch(methodology, /21 of roughly 2,170 catalogue products/i);
});

test('retailer expansion plan: documents category gaps and the next data batches', () => {
  const plan = readText('docs/retailer-data-expansion-plan.md');

  assert.match(plan, /Retailer Data Expansion Plan/);
  assert.match(plan, /Raw specs catalog/i);
  assert.match(plan, /Retailer-verified products/i);
  assert.match(plan, /Batch 1/i);
  assert.match(plan, /Batch 2/i);
  assert.match(plan, /Dishwasher/i);
  assert.match(plan, /Dryer/i);
  assert.match(plan, /Washing machine/i);
  assert.match(plan, /Do not count raw specs as retailer inventory/i);
});
