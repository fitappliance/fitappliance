'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { validateAppliancesDocument, assertDoorSwingResearchCoverage } = require('./schema.js');
const { loadSourceDocuments } = require('./sources/local-json.js');
const { syncEnergyRatingData } = require('./sources/energyrating.js');
const { syncCommissionFactoryData } = require('./sources/commissionfactory.js');
const { runCircuitBreaker, runCircuitBreakerOrExit } = require('./utils/circuit-breaker.js');
const { writeJsonAtomically } = require('./utils/file-utils.js');

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

async function runMasterSync({
  dataDir,
  notesPath,
  today = new Date().toISOString().slice(0, 10),
  logger = console,
  exitFn = process.exit,
  sourcesDir = path.join(dataDir, 'sources'),
  energyRatingOptions = {},
  commissionFactoryOptions = {},
  syncLocalDataFn = syncLocalData,
  syncEnergyRatingDataFn = syncEnergyRatingData,
  syncCommissionFactoryDataFn = syncCommissionFactoryData,
  runCircuitBreakerOrExitFn = runCircuitBreakerOrExit
}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baselineText = await readFile(appliancesPath, 'utf8');
  const baselineDocument = JSON.parse(baselineText);

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

    const finalDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
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
  const apiKey = process.env.CF_API_KEY;

  if (!apiKey) {
    throw new Error('CF_API_KEY is required for full sync');
  }

  const syncedDocument = await runMasterSync({
    dataDir,
    notesPath,
    today,
    commissionFactoryOptions: {
      apiKey
    }
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
  runMasterSync,
  syncLocalData
};
