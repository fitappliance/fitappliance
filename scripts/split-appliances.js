'use strict';

const path = require('node:path');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');

const CAT_FILE_MAP = {
  fridge: 'fridges.json',
  washing_machine: 'washing-machines.json',
  dishwasher: 'dishwashers.json',
  dryer: 'dryers.json'
};

const KNOWN_CATEGORIES = Object.keys(CAT_FILE_MAP);

async function writeMinifiedJsonAtomically(filePath, document) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(document));
  await rename(tempPath, filePath);
}

function buildSplitDocuments(appliancesDocument) {
  const products = Array.isArray(appliancesDocument?.products) ? appliancesDocument.products : [];
  const counts = Object.fromEntries(KNOWN_CATEGORIES.map((cat) => [cat, 0]));
  const groupedProducts = Object.fromEntries(KNOWN_CATEGORIES.map((cat) => [cat, []]));
  let skipped = 0;

  for (const product of products) {
    const category = product?.cat;
    if (!Object.prototype.hasOwnProperty.call(CAT_FILE_MAP, category)) {
      skipped += 1;
      continue;
    }

    groupedProducts[category].push(product);
    counts[category] += 1;
  }

  const schemaVersion = appliancesDocument?.schema_version ?? 2;
  const lastUpdated = appliancesDocument?.last_updated ?? new Date().toISOString().slice(0, 10);
  const categoryDocuments = Object.fromEntries(
    KNOWN_CATEGORIES.map((cat) => [
      cat,
      {
        schema_version: schemaVersion,
        last_updated: lastUpdated,
        cat,
        products: groupedProducts[cat]
      }
    ])
  );

  const files = Object.fromEntries(
    KNOWN_CATEGORIES.map((cat) => [cat, `/data/${CAT_FILE_MAP[cat]}`])
  );

  const metaDocument = {
    schema_version: schemaVersion,
    last_updated: lastUpdated,
    cats: KNOWN_CATEGORIES,
    counts,
    files
  };

  return {
    counts,
    skipped,
    totalProducts: products.length,
    categoryDocuments,
    metaDocument
  };
}

async function splitAppliances({
  dataDir = path.join(path.resolve(__dirname, '..'), 'public', 'data'),
  write = true,
  logger = console
} = {}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const appliancesDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const {
    counts,
    skipped,
    totalProducts,
    categoryDocuments,
    metaDocument
  } = buildSplitDocuments(appliancesDocument);
  const filesWritten = [...Object.values(CAT_FILE_MAP), 'appliances-meta.json'];

  if (write) {
    await mkdir(dataDir, { recursive: true });
    for (const category of KNOWN_CATEGORIES) {
      const targetPath = path.join(dataDir, CAT_FILE_MAP[category]);
      await writeMinifiedJsonAtomically(targetPath, categoryDocuments[category]);
    }

    await writeMinifiedJsonAtomically(path.join(dataDir, 'appliances-meta.json'), metaDocument);
    logger.log(`[split-data] Wrote ${filesWritten.length} files for ${totalProducts} products`);
    if (skipped > 0) {
      logger.warn?.(`[split-data] Skipped ${skipped} products with unknown categories`);
    }
  }

  return {
    cats: counts,
    totalProducts,
    skipped,
    filesWritten
  };
}

async function runCli() {
  await splitAppliances();
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('[split-data] Failed to split appliance data', error);
    process.exitCode = 1;
  });
}

module.exports = {
  CAT_FILE_MAP,
  KNOWN_CATEGORIES,
  buildSplitDocuments,
  splitAppliances
};
