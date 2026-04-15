'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { validateAppliancesDocument, assertDoorSwingResearchCoverage } = require('./schema.js');
const { loadSourceDocuments } = require('./sources/local-json.js');
const { syncEnergyRatingData } = require('./sources/energyrating.js');
const { syncCommissionFactoryData } = require('./sources/commissionfactory.js');
const { inferDoorSwing } = require('./infer-door-swing.js');
const { runCircuitBreaker, runCircuitBreakerOrExit } = require('./utils/circuit-breaker.js');
const { writeJsonAtomically } = require('./utils/file-utils.js');

const GENERIC_CLEARANCE_DEFAULT = {
  side: 20,
  rear: 50,
  top: 50
};

function mergeProduct(baseProduct, sourceProduct) {
  const mergedProduct = { ...baseProduct };

  for (const [key, value] of Object.entries(sourceProduct)) {
    if (key === 'id') {
      continue;
    }

    mergedProduct[key] = value ?? mergedProduct[key];
  }

  if (!Object.prototype.hasOwnProperty.call(mergedProduct, 'door_swing_mm')) {
    mergedProduct.door_swing_mm = null;
  }

  return mergedProduct;
}

function normalizeNewProduct(sourceProduct) {
  const normalizedProduct = { ...sourceProduct };

  if (!Object.prototype.hasOwnProperty.call(normalizedProduct, 'door_swing_mm')) {
    normalizedProduct.door_swing_mm = null;
  }

  return normalizedProduct;
}

function buildSyncedDocument(baseDocument, sourceDocuments, today) {
  const productsById = new Map(
    baseDocument.products.map(product => [product.id, { ...product }])
  );

  for (const sourceDocument of sourceDocuments) {
    for (const sourceProduct of sourceDocument.products) {
      const existingProduct = productsById.get(sourceProduct.id);

      if (existingProduct) {
        productsById.set(sourceProduct.id, mergeProduct(existingProduct, sourceProduct));
        continue;
      }

      productsById.set(sourceProduct.id, normalizeNewProduct(sourceProduct));
    }
  }

  return {
    schema_version: baseDocument.schema_version ?? 2,
    last_updated: today ?? baseDocument.last_updated,
    products: Array.from(productsById.values())
  };
}

async function syncLocalData({
  dataDir,
  sourcesDir = path.join(dataDir, 'sources'),
  notesPath,
  today,
  write = true,
  runPreWriteCircuit = true
}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const sourceDocuments = await loadSourceDocuments(sourcesDir);
  const syncedDocument = buildSyncedDocument(baseDocument, sourceDocuments, today);

  if (runPreWriteCircuit) {
    // Defensive gate: never overwrite existing data when the new dataset looks suspicious.
    runCircuitBreaker(syncedDocument.products, baseDocument.products);
  }

  validateAppliancesDocument(syncedDocument);

  if (notesPath) {
    const notesText = await readFile(notesPath, 'utf8');
    assertDoorSwingResearchCoverage(syncedDocument, notesText);
  }

  if (write) {
    await writeJsonAtomically(appliancesPath, syncedDocument);
  }

  return syncedDocument;
}

function hasValidRetailPrice(product) {
  if (Number.isInteger(product.price) && product.price > 0) {
    return true;
  }

  if (!Array.isArray(product.retailers)) {
    return false;
  }

  return product.retailers.some(retailer => Number.isInteger(retailer.p) && retailer.p > 0);
}

function applyAvailabilityState(document) {
  return {
    ...document,
    products: document.products.map(product => ({
      ...product,
      unavailable: !hasValidRetailPrice(product)
    }))
  };
}

async function syncClearanceDefaults({
  dataDir,
  products,
  logger = console,
  write = true
}) {
  const clearancePath = path.join(dataDir, 'clearance.json');
  let clearanceDocument;

  try {
    clearanceDocument = JSON.parse(await readFile(clearancePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        addedCount: 0,
        skipped: true
      };
    }
    throw error;
  }

  const nextDocument = {
    ...clearanceDocument,
    rules: {
      ...(clearanceDocument.rules ?? {})
    }
  };
  let addedCount = 0;

  for (const product of products) {
    if (!product?.cat || !product?.brand) {
      continue;
    }

    const categoryRules = nextDocument.rules[product.cat] ?? { __default__: { ...GENERIC_CLEARANCE_DEFAULT } };
    if (!nextDocument.rules[product.cat]) {
      nextDocument.rules[product.cat] = categoryRules;
    }

    if (!categoryRules.__default__) {
      categoryRules.__default__ = { ...GENERIC_CLEARANCE_DEFAULT };
    }

    if (categoryRules[product.brand]) {
      continue;
    }

    categoryRules[product.brand] = { ...GENERIC_CLEARANCE_DEFAULT };
    addedCount += 1;
  }

  if (addedCount > 0 && write) {
    await writeJsonAtomically(clearancePath, nextDocument);
    logger.log(`[sync] Added default clearance rules for ${addedCount} unknown brand/category pairs`);
  }

  return {
    addedCount,
    skipped: false
  };
}

async function runMasterSync({
  dataDir,
  notesPath,
  today = new Date().toISOString().slice(0, 10),
  logger = console,
  exitFn = process.exit,
  enableCommissionSync = true,
  sourcesDir = path.join(dataDir, 'sources'),
  energyRatingOptions = {},
  commissionFactoryOptions = {},
  syncLocalDataFn = syncLocalData,
  syncEnergyRatingDataFn = syncEnergyRatingData,
  syncCommissionFactoryDataFn = syncCommissionFactoryData,
  inferDoorSwingFn = inferDoorSwing,
  runCircuitBreakerOrExitFn = runCircuitBreakerOrExit
}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const clearancePath = path.join(dataDir, 'clearance.json');
  const baselineText = await readFile(appliancesPath, 'utf8');
  const baselineDocument = JSON.parse(baselineText);
  let baselineClearanceText = null;

  try {
    baselineClearanceText = await readFile(clearancePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await syncLocalDataFn({
      dataDir,
      sourcesDir,
      notesPath,
      today,
      runPreWriteCircuit: false
    });

    await syncEnergyRatingDataFn({
      dataDir,
      today,
      logger,
      ...energyRatingOptions
    });

    if (enableCommissionSync) {
      const commissionSyncFn =
        commissionFactoryOptions.syncCommissionFactoryDataFn ?? syncCommissionFactoryDataFn;
      const {
        syncCommissionFactoryDataFn: _ignored,
        ...commissionSourceOptions
      } = commissionFactoryOptions;

      await commissionSyncFn({
        dataDir,
        logger,
        ...commissionSourceOptions
      });
    } else {
      logger.log('[sync] CommissionFactory sync disabled; proceeding with local + Energy Rating only');
    }

    const availabilityDocument = applyAvailabilityState(
      JSON.parse(await readFile(appliancesPath, 'utf8'))
    );
    const inferResult = await inferDoorSwingFn({
      dataDir,
      logger,
      write: false,
      document: availabilityDocument
    });
    const finalDocument = inferResult.document;
    validateAppliancesDocument(finalDocument);
    await writeJsonAtomically(appliancesPath, finalDocument);
    await syncClearanceDefaults({
      dataDir,
      products: finalDocument.products,
      logger
    });
    let breakerExitCode = null;

    runCircuitBreakerOrExitFn(finalDocument.products, baselineDocument.products, {
      logger,
      exitFn(code) {
        breakerExitCode = code;
      }
    });

    if (breakerExitCode !== null) {
      const breakerError = new Error(`Circuit breaker requested exit ${breakerExitCode}`);
      breakerError.exitCode = breakerExitCode;
      throw breakerError;
    }

    return finalDocument;
  } catch (error) {
    await writeFile(appliancesPath, baselineText);

    if (baselineClearanceText !== null) {
      await writeFile(clearancePath, baselineClearanceText);
    }

    if (error && Object.prototype.hasOwnProperty.call(error, 'exitCode')) {
      exitFn(error.exitCode);
      return null;
    }

    throw error;
  }
}

async function runCli(options = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'public', 'data');
  const notesPath = path.join(repoRoot, 'docs', 'door-swing-research-notes.md');
  const today = new Date().toISOString().slice(0, 10);
  const logger = options.logger ?? console;
  const argv = new Set(options.argv ?? process.argv.slice(2));
  const apiKey = options.apiKey ?? process.env.CF_API_KEY;
  const skipCf = argv.has('--skip-cf') || argv.has('--no-cf');
  const enableCommissionSync = !skipCf && Boolean(apiKey);

  if (!enableCommissionSync) {
    logger.warn(
      '[sync] CF_API_KEY not configured (or --skip-cf used). CommissionFactory sync skipped; ' +
        'placeholder remains for future enablement.'
    );
  }

  const commissionFactoryOptions = {};
  if (apiKey) {
    commissionFactoryOptions.apiKey = apiKey;
  }

  const syncedDocument = await runMasterSync({
    dataDir,
    notesPath,
    today,
    logger,
    enableCommissionSync,
    commissionFactoryOptions
  });

  if (!syncedDocument) {
    return;
  }

  logger.log(
    `Synced ${syncedDocument.products.length} products into ${path.join('public', 'data', 'appliances.json')}`
  );
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSyncedDocument,
  mergeProduct,
  applyAvailabilityState,
  runMasterSync,
  syncClearanceDefaults,
  syncLocalData
};
