'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { ENERGY_RESOURCE_CATEGORIES, syncEnergyRatingData } = require('./sources/energyrating.js');
const { syncClearanceDefaults } = require('./sync.js');

const BULK_IMPORT_CATEGORIES = new Set(['fridge', 'washing_machine']);

function normaliseSeedProductRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    ...row,
    direct_url: row.direct_url ?? null
  };
}

function applySeedRows(products, seedRows) {
  if (!Array.isArray(seedRows) || seedRows.length === 0) return products;

  const directUrlById = new Map();
  for (const row of seedRows) {
    const normalised = normaliseSeedProductRow(row);
    if (!normalised || typeof normalised.id !== 'string' || normalised.id.trim() === '') continue;
    directUrlById.set(normalised.id, normalised.direct_url);
  }

  if (directUrlById.size === 0) return products;

  return products.map((product) => {
    if (!directUrlById.has(product.id)) return product;
    return {
      ...product,
      direct_url: directUrlById.get(product.id) ?? null
    };
  });
}

async function runBulkImport(options = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const logger = options.logger ?? console;

  const categories = ENERGY_RESOURCE_CATEGORIES.filter(config =>
    BULK_IMPORT_CATEGORIES.has(config.category)
  );
  const syncResult = await syncEnergyRatingData({
    dataDir,
    today,
    lookbackYears: 3,
    categories,
    logger,
    fetchWithRetryFn: options.fetchWithRetryFn
  });
  const updatedDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const productsWithSeedUrls = applySeedRows(updatedDocument.products, options.seedRows);
  if (productsWithSeedUrls !== updatedDocument.products) {
    updatedDocument.products = productsWithSeedUrls;
    await writeFile(appliancesPath, `${JSON.stringify(updatedDocument, null, 2)}\n`);
  }
  const clearanceResult = await syncClearanceDefaults({
    dataDir,
    products: updatedDocument.products,
    logger
  });

  const categoryCounts = updatedDocument.products.reduce((counts, product) => {
    counts[product.cat] = (counts[product.cat] ?? 0) + 1;
    return counts;
  }, {});

  return {
    ...syncResult,
    clearanceAddedCount: clearanceResult.addedCount,
    totalProducts: updatedDocument.products.length,
    categoryCounts
  };
}

if (require.main === module) {
  runBulkImport()
    .then(result => {
      console.log(
        `Bulk import complete: ${result.totalProducts} products ` +
          `(fridge=${result.categoryCounts.fridge ?? 0}, ` +
          `washing_machine=${result.categoryCounts.washing_machine ?? 0})`
      );
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  applySeedRows,
  normaliseSeedProductRow,
  runBulkImport
};
