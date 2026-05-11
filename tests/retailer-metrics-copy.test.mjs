import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CATEGORY_FILES = [
  ['Fridges', 'public/data/fridges.json'],
  ['Dishwashers', 'public/data/dishwashers.json'],
  ['Dryers', 'public/data/dryers.json'],
  ['Washing machines', 'public/data/washing-machines.json']
];

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function computeMetrics() {
  const rows = [];
  const totals = { products: 0, linkedProducts: 0, retailerLinks: 0, multiRetailerProducts: 0, priceRows: 0 };

  for (const [label, relativePath] of CATEGORY_FILES) {
    const products = JSON.parse(readText(relativePath)).products;
    const metrics = {
      label,
      products: products.length,
      linkedProducts: products.filter((product) => (product.retailers ?? []).length > 0).length,
      retailerLinks: products.reduce((sum, product) => sum + (product.retailers ?? []).length, 0),
      multiRetailerProducts: products.filter((product) => (product.retailers ?? []).length > 1).length,
      priceRows: products.reduce(
        (sum, product) => sum + (product.retailers ?? []).filter((retailer) => Number(retailer.p ?? retailer.price) > 0).length,
        0
      )
    };
    for (const key of Object.keys(totals)) totals[key] += metrics[key];
    rows.push(metrics);
  }

  return { rows, totals };
}

function fmt(number) {
  return number.toLocaleString('en-AU');
}

test('retailer metrics docs: README and audit copy separate raw specs from retailer evidence', () => {
  const { totals } = computeMetrics();
  const readme = readText('README.md');
  const audit = readText('docs/display-data-accuracy-audit.md');

  for (const text of [readme, audit]) {
    assert.match(text, new RegExp(`raw specs catalog(?: has|:)? ${fmt(totals.products)}`, 'i'));
    assert.match(text, new RegExp(`retailer-verified products:? ${fmt(totals.linkedProducts)}`, 'i'));
    assert.match(text, new RegExp(`verified retailer (?:product-page )?links(?: in total)?:?\\s*${fmt(totals.retailerLinks)}`, 'i'));
    assert.match(text, new RegExp(`live price rows:? ${fmt(totals.priceRows)}`, 'i'));
  }

  assert.doesNotMatch(readme, /2,188 products with verified retailer/i);
  assert.doesNotMatch(readme, /in stock/i);
});

test('retailer metrics docs: expansion plan category table matches current catalog', () => {
  const { rows, totals } = computeMetrics();
  const plan = readText('docs/retailer-data-expansion-plan.md');

  for (const row of rows) {
    assert.match(plan, new RegExp(`${row.label} \\| ${fmt(row.products)} \\| ${fmt(row.linkedProducts)} \\| ${fmt(row.retailerLinks)} \\| ${fmt(row.multiRetailerProducts)}`));
  }

  assert.match(plan, new RegExp(`\\*\\*Total\\*\\* \\| \\*\\*${fmt(totals.products)}\\*\\* \\| \\*\\*${fmt(totals.linkedProducts)}\\*\\* \\| \\*\\*${fmt(totals.retailerLinks)}\\*\\* \\| \\*\\*${fmt(totals.multiRetailerProducts)}\\*\\*`));
  assert.match(plan, /Search, category, collection, checkout, cart, and retailer home pages are rejected/);
  assert.match(plan, /`p` stays `null` unless a price is captured with a fresh `verified_at` date/);
});

test('retailer metrics docs: promotion copy does not overclaim inventory, prices, or complete coverage', () => {
  const { totals } = computeMetrics();
  const promotion = readText('docs/promotion-kit.md');

  assert.match(promotion, new RegExp(`${fmt(totals.products)} raw appliance spec rows`));
  assert.match(promotion, new RegExp(`${fmt(totals.linkedProducts)} products with verified retailer product-page links`));
  assert.match(promotion, new RegExp(`${fmt(totals.retailerLinks)} verified retailer product-page links`));
  assert.doesNotMatch(promotion, /100% door swing coverage/i);
  assert.doesNotMatch(promotion, /No affiliate links until/i);
  assert.doesNotMatch(promotion, /most comprehensive Australian appliance sizing database/i);
});
