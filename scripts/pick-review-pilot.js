#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { slugNormalize } = require('./common/slug-normalize.js');
const { buildModelSlug } = require('./common/model-slug.js');
const { createFileDateReader, toDateOnly } = require('./common/file-dates.js');

const CATEGORY_SLUGS = {
  fridge: 'fridge',
  washing_machine: 'washing-machine',
  dishwasher: 'dishwasher',
  dryer: 'dryer'
};

const CATEGORY_QUOTAS = {
  fridge: 2,
  washing_machine: 1,
  dishwasher: 1,
  dryer: 1
};

const CAVITY_MIN_WIDTH = 500;
const CAVITY_MAX_WIDTH = 1100;
const CAVITY_STEP = 10;

function toDateStamp(now) {
  if (now instanceof Date) return now.toISOString().slice(0, 10);
  const match = String(now ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  return toDateOnly(now);
}

function roundUpToStep(value, step = CAVITY_STEP) {
  return Math.ceil(value / step) * step;
}

function isCurrentInStock(product) {
  if (!product || typeof product !== 'object') return false;
  if (product.unavailable) return false;
  if (typeof product.direct_url === 'string' && /^https:\/\//i.test(product.direct_url)) return true;
  if (Array.isArray(product.retailers) && product.retailers.some((row) => row && Number.isInteger(row.p) && row.p > 0)) {
    return true;
  }
  return Number.isInteger(product.price) && product.price > 0;
}

function getRetailerCount(product) {
  return Array.isArray(product?.retailers) ? product.retailers.length : 0;
}

function getCategoryPageCoverage(product, clearanceRules) {
  if (product?.cat !== 'fridge') return 1;
  const fridgeRules = clearanceRules?.fridge ?? {};
  const rule = fridgeRules[product.brand] ?? fridgeRules.__default__ ?? { side: 20 };
  const side = Number.isFinite(rule.side) ? rule.side : 20;
  const minimumWidth = roundUpToStep((Number(product.w) || 0) + side * 2);
  if (minimumWidth > CAVITY_MAX_WIDTH) return 1;
  const cavityPages = Math.max(0, Math.floor((CAVITY_MAX_WIDTH - Math.max(CAVITY_MIN_WIDTH, minimumWidth)) / CAVITY_STEP) + 1);
  return 1 + cavityPages;
}

function buildPilotEntry(product, clearanceRules) {
  const modelSlug = buildModelSlug(product.brand, product.model);
  const categorySlug = CATEGORY_SLUGS[product.cat] ?? slugNormalize(product.cat);
  const brandPageSlug = `${slugNormalize(product.brand)}-${categorySlug}-clearance`;
  const coverageCount = getCategoryPageCoverage(product, clearanceRules);
  let cavityPageSlug = null;

  if (product.cat === 'fridge') {
    const fridgeRules = clearanceRules?.fridge ?? {};
    const rule = fridgeRules[product.brand] ?? fridgeRules.__default__ ?? { side: 20 };
    const side = Number.isFinite(rule.side) ? rule.side : 20;
    const targetWidth = roundUpToStep((Number(product.w) || 0) + side * 2);
    if (targetWidth >= CAVITY_MIN_WIDTH && targetWidth <= CAVITY_MAX_WIDTH) {
      cavityPageSlug = `${targetWidth}mm-fridge`;
    }
  }

  return {
    productId: product.id,
    cat: product.cat,
    brand: product.brand,
    model: product.model,
    modelSlug,
    brandPageSlug,
    cavityPageSlug,
    coverageCount,
    retailers: getRetailerCount(product),
    stars: Number.isFinite(product.stars) ? product.stars : null
  };
}

function rankPilotCandidates(products, clearanceRules) {
  return products
    .filter((product) => CATEGORY_QUOTAS[product.cat] && isCurrentInStock(product))
    .map((product) => buildPilotEntry(product, clearanceRules))
    .sort((left, right) => {
      if (left.coverageCount !== right.coverageCount) return right.coverageCount - left.coverageCount;
      if (left.retailers !== right.retailers) return right.retailers - left.retailers;
      const leftStars = Number.isFinite(left.stars) ? left.stars : -1;
      const rightStars = Number.isFinite(right.stars) ? right.stars : -1;
      if (leftStars !== rightStars) return rightStars - leftStars;
      return left.modelSlug.localeCompare(right.modelSlug);
    });
}

function pickReviewPilotEntries({ products, clearanceRules }) {
  const ranked = rankPilotCandidates(products, clearanceRules);
  const picks = [];

  for (const [category, quota] of Object.entries(CATEGORY_QUOTAS)) {
    const categoryRows = ranked.filter((row) => row.cat === category).slice(0, quota);
    if (categoryRows.length < quota) {
      throw new Error(`Insufficient in-stock candidates for ${category}; expected ${quota}, found ${categoryRows.length}`);
    }
    picks.push(...categoryRows);
  }

  return picks.sort((left, right) => {
    if (left.coverageCount !== right.coverageCount) return right.coverageCount - left.coverageCount;
    return left.modelSlug.localeCompare(right.modelSlug);
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function pickReviewPilot({
  repoRoot = path.resolve(__dirname, '..'),
  appliancesPath = path.join(repoRoot, 'public', 'data', 'appliances.json'),
  clearancePath = path.join(repoRoot, 'public', 'data', 'clearance.json'),
  outputPath = path.join(repoRoot, 'data', 'videos', 'review-pilot-slugs.json'),
  now = null,
  logger = console
} = {}) {
  const appliances = await readJson(appliancesPath);
  const clearance = await readJson(clearancePath);
  const pilots = pickReviewPilotEntries({
    products: appliances.products ?? [],
    clearanceRules: clearance.rules ?? {}
  });
  const dateReader = createFileDateReader({ repoRoot });

  const output = {
    schema_version: 1,
    last_updated: toDateStamp(now ?? dateReader.getFileLastModified(outputPath)),
    pilots
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  logger.log(`[pick-review-pilot] selected ${pilots.length} pilot models`);

  return { outputPath, pilots };
}

if (require.main === module) {
  pickReviewPilot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CATEGORY_QUOTAS,
  isCurrentInStock,
  pickReviewPilot,
  pickReviewPilotEntries
};
