'use strict';

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { fetchWithRetry } = require('../utils/fetch-utils.js');
const { writeJsonAtomically } = require('../utils/file-utils.js');
const { normalizeKey, toInteger } = require('../utils/parse-utils.js');
const { validateProduct } = require('../schema.js');

const DEFAULT_API_URL = 'https://api.commissionfactory.com/V1/Affiliate/Functions/GetDataFeeds/';

function extractFeedItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.result)) {
    return payload.result;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.Products)) {
    return payload.Products;
  }

  return [];
}

function buildProductSearchIndex(products) {
  return products.map(product => ({
    id: product.id,
    brandModelKey: normalizeKey(`${product.brand}${product.model}`),
    modelKey: normalizeKey(product.model)
  }));
}

function findMatchedProductId(feedItem, indexEntries) {
  const nameKey = normalizeKey(feedItem.ProductName ?? feedItem.productName ?? feedItem.Name ?? '');
  const brandKey = normalizeKey(feedItem.Brand ?? feedItem.brand ?? '');
  const modelKey = normalizeKey(feedItem.Model ?? feedItem.model ?? '');

  if (brandKey && modelKey) {
    const exactKey = `${brandKey}${modelKey}`;
    const exactMatch = indexEntries.find(entry => entry.brandModelKey === exactKey);
    if (exactMatch) {
      return exactMatch.id;
    }
  }

  let bestMatch = null;
  for (const entry of indexEntries) {
    if (nameKey && (nameKey.includes(entry.brandModelKey) || nameKey.includes(entry.modelKey))) {
      const score = Math.max(entry.brandModelKey.length, entry.modelKey.length);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: entry.id, score };
      }
    }
  }

  return bestMatch?.id ?? null;
}

function pickAffiliateUrl(feedItem) {
  return (
    feedItem.DeepLink ??
    feedItem.deepLink ??
    feedItem.AffiliateUrl ??
    feedItem.affiliate_url ??
    feedItem.url ??
    null
  );
}

function isHttpsUrl(value) {
  return typeof value === 'string' && value.startsWith('https://');
}

async function syncCommissionFactoryData({
  dataDir,
  apiUrl = DEFAULT_API_URL,
  apiKey = process.env.CF_API_KEY,
  fetchWithRetryFn = fetchWithRetry,
  logger = console,
  write = true
}) {
  if (!apiKey) {
    throw new Error('CF_API_KEY is required for CommissionFactory sync');
  }

  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const productsById = new Map(baseDocument.products.map(product => [product.id, product]));
  const indexEntries = buildProductSearchIndex(baseDocument.products);

  const response = await fetchWithRetryFn(
    apiUrl,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    },
    3
  );

  if (response.status >= 400) {
    throw new Error(`CommissionFactory fetch failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const feedItems = extractFeedItems(payload);

  let updatedCount = 0;
  let discardedCount = 0;
  let unmatchedCount = 0;
  let invalidAffiliateCount = 0;

  for (const feedItem of feedItems) {
    const matchedId = findMatchedProductId(feedItem, indexEntries);

    if (!matchedId) {
      unmatchedCount += 1;
      continue;
    }

    const baseProduct = productsById.get(matchedId);
    const mappedPrice = toInteger(feedItem.Price ?? feedItem.price);
    const hasValidPrice = mappedPrice !== null && mappedPrice > 0;
    const mappedAffiliateUrl = pickAffiliateUrl(feedItem);
    const hasValidAffiliate = isHttpsUrl(mappedAffiliateUrl);

    if (mappedAffiliateUrl && !hasValidAffiliate) {
      invalidAffiliateCount += 1;
      logger.warn(
        `[commissionfactory] Rejected affiliate_url for ${baseProduct.brand} ${baseProduct.model}: ${mappedAffiliateUrl} ` +
          '(must start with https://)'
      );
    }

    const mergedProduct = {
      ...baseProduct,
      // Keep ?? semantics so 0 is not treated as "missing" by fallback logic.
      price: hasValidPrice ? mappedPrice ?? baseProduct.price : baseProduct.price,
      affiliate_url: hasValidAffiliate ? mappedAffiliateUrl : baseProduct.affiliate_url
    };

    const errors = validateProduct(mergedProduct);
    if (errors.length > 0) {
      discardedCount += 1;
      logger.warn(
        `[commissionfactory] Discarded row for ${baseProduct.brand} ${baseProduct.model}: ${errors.join('; ')}`
      );
      continue;
    }

    productsById.set(matchedId, mergedProduct);
    updatedCount += 1;
  }

  const updatedDocument = {
    ...baseDocument,
    products: baseDocument.products.map(product => productsById.get(product.id) ?? product)
  };

  if (write) {
    await writeJsonAtomically(appliancesPath, updatedDocument);
  }

  return {
    updatedDocument,
    updatedCount,
    discardedCount,
    unmatchedCount,
    invalidAffiliateCount,
    totalRows: feedItems.length
  };
}

module.exports = {
  DEFAULT_API_URL,
  extractFeedItems,
  findMatchedProductId,
  syncCommissionFactoryData
};
