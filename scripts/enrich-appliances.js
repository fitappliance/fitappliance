'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

const { canonicalizeBrand } = require('./brand-canon.js');
const { computePriorityScore, inferBrandTier } = require('./common/popularity-score.js');
const { enrichReadableCopy } = require('./common/readable-spec.js');
const { buildSplitDocuments, CAT_FILE_MAP } = require('./split-appliances.js');
const { isRetailerProductPageUrl } = require('../public/scripts/search-core.js');

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writePrettyJson(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

async function writeMinifiedJson(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(document), 'utf8');
}

function findResearchEntry(researchDocument, product) {
  if (!researchDocument || typeof researchDocument !== 'object') return null;
  const products = researchDocument.products ?? {};
  return products[product?.id] ?? products[product?.slug] ?? null;
}

function filterVerifiedRetailers(retailers) {
  if (!Array.isArray(retailers)) return [];
  return retailers
    .filter((retailer) => isRetailerProductPageUrl(retailer?.url))
    .map((retailer) => ({ ...retailer }));
}

function getBestRetailerPrice(retailers) {
  const prices = filterVerifiedRetailers(retailers)
    .map((retailer) => Number(retailer?.p))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (!prices.length) return null;
  return Math.min(...prices);
}

async function enrichAppliances({
  repoRoot = path.resolve(__dirname, '..'),
  dataDir = path.join(repoRoot, 'public', 'data'),
  clearancesPath = path.join(repoRoot, 'data', 'clearance-defaults.json'),
  seriesDictionaryPath = path.join(repoRoot, 'data', 'series-dictionary.json'),
  popularityPath = path.join(repoRoot, 'data', 'popularity-research.json'),
  logger = console
} = {}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const appliancesDocument = await readJson(appliancesPath);
  const seriesDictionary = await readJson(seriesDictionaryPath, {});
  await readJson(clearancesPath, {});
  const popularityResearch = await readJson(popularityPath, { products: {}, last_researched: null });

  const products = Array.isArray(appliancesDocument?.products) ? appliancesDocument.products : [];
  let displayNameCount = 0;
  let readableSpecCount = 0;
  let nullSeriesCount = 0;

  const enrichedProducts = products.map((product) => {
    const baseProduct = {
      ...product,
      brand: canonicalizeBrand(product?.brand)
    };
    const readable = enrichReadableCopy(baseProduct, { seriesDictionary });
    const research = findResearchEntry(popularityResearch, product);
    const researchedRetailers = Array.isArray(research?.retailers) ? filterVerifiedRetailers(research.retailers) : null;
    const existingRetailers = filterVerifiedRetailers(baseProduct.retailers);
    const hasResearchedRetailers = Array.isArray(researchedRetailers) && researchedRetailers.length > 0;
    const nextRetailers = hasResearchedRetailers ? researchedRetailers : existingRetailers;
    const nextUnavailable = nextRetailers.length > 0 ? false : true;
    const nextPrice = getBestRetailerPrice(nextRetailers);
    const priorityScore = computePriorityScore({
      ...baseProduct,
      retailers: nextRetailers,
      brandTier: inferBrandTier(baseProduct?.brand)
    }, {
      now: popularityResearch?.last_researched ?? appliancesDocument?.last_updated,
      verifiedAt: research?.researchedAt ?? appliancesDocument?.last_updated,
      research
    });

    if (readable.displayName) displayNameCount += 1;
    if (readable.readableSpec) readableSpecCount += 1;
    if (!readable.series) nullSeriesCount += 1;

    return {
      ...baseProduct,
      retailers: nextRetailers,
      unavailable: nextUnavailable,
      price: nextPrice,
      sponsored: nextRetailers.length > 0 ? baseProduct.sponsored : false,
      displayName: readable.displayName,
      readableSpec: readable.readableSpec,
      priorityScore
    };
  });

  const nextDocument = {
    ...appliancesDocument,
    products: enrichedProducts
  };

  await writePrettyJson(appliancesPath, nextDocument);

  const { categoryDocuments, metaDocument } = buildSplitDocuments(nextDocument);
  for (const [category, fileName] of Object.entries(CAT_FILE_MAP)) {
    await writeMinifiedJson(path.join(dataDir, fileName), categoryDocuments[category]);
  }
  await writeMinifiedJson(path.join(dataDir, 'appliances-meta.json'), metaDocument);

  const summary = {
    totalProducts: enrichedProducts.length,
    displayNameCount,
    readableSpecCount,
    nullSeriesCount
  };

  logger.log(
    `[enrich-appliances] displayName=${displayNameCount} readableSpec=${readableSpecCount} seriesNull=${nullSeriesCount}`
  );

  return summary;
}

if (require.main === module) {
  enrichAppliances().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  findResearchEntry,
  filterVerifiedRetailers,
  enrichAppliances
};
