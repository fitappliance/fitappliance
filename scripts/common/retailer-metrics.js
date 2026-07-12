'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATEGORY_FILES = Object.freeze([
  { label: 'Fridges', file: 'fridges.json' },
  { label: 'Dishwashers', file: 'dishwashers.json' },
  { label: 'Dryers', file: 'dryers.json' },
  { label: 'Washing machines', file: 'washing-machines.json' },
]);

function metricsForProducts(label, products) {
  const rows = Array.isArray(products) ? products : [];
  return {
    label,
    products: rows.length,
    linkedProducts: rows.filter((product) => (product.retailers ?? []).length > 0).length,
    retailerLinks: rows.reduce((sum, product) => sum + (product.retailers ?? []).length, 0),
    multiRetailerProducts: rows.filter((product) => (product.retailers ?? []).length > 1).length,
    priceRows: rows.reduce((sum, product) => sum + (product.retailers ?? [])
      .filter((retailer) => {
        const price = Number(retailer?.p ?? retailer?.price);
        return Number.isFinite(price) && price > 0 && price <= 100000;
      }).length, 0),
  };
}

function computeRetailerMetrics(dataDir) {
  const rows = CATEGORY_FILES.map(({ label, file }) => {
    const document = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    return metricsForProducts(label, document.products);
  });
  const totals = rows.reduce((result, row) => {
    for (const key of ['products', 'linkedProducts', 'retailerLinks', 'multiRetailerProducts', 'priceRows']) {
      result[key] += row[key];
    }
    return result;
  }, { products: 0, linkedProducts: 0, retailerLinks: 0, multiRetailerProducts: 0, priceRows: 0 });
  return { rows, totals };
}

module.exports = { CATEGORY_FILES, computeRetailerMetrics, metricsForProducts };
