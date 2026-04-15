'use strict';

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { fetchWithRetry } = require('../utils/fetch-utils.js');
const { writeJsonAtomically } = require('../utils/file-utils.js');
const { normalizeKey, toInteger } = require('../utils/parse-utils.js');
const { validateProduct } = require('../schema.js');

const DEFAULT_API_URL = 'https://api.commissionfactory.com/V1/Affiliate/Functions/GetDataFeeds/';
const DEFAULT_SEARCH_KEYWORDS = [
  'refrigerator',
  'fridge',
  'freezer',
  'washing machine',
  'washer',
  'dryer',
  'dishwasher'
];
const DEFAULT_MERCHANTS = [
  'The Good Guys',
  'JB Hi-Fi',
  'Bing Lee',
  'Appliances Online',
  'Harvey Norman',
  'Betta Home Living'
];
const SUPPORTED_MERCHANT_ALIASES = {
  thegoodguys: 'The Good Guys',
  'thegoodguyscomau': 'The Good Guys',
  jbhifi: 'JB Hi-Fi',
  binglee: 'Bing Lee',
  appliancesonline: 'Appliances Online',
  harveynorman: 'Harvey Norman',
  bettahomeliving: 'Betta Home Living',
  betta: 'Betta Home Living'
};

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

function buildFeedRequestUrls(apiUrl, merchants, searchKeywords, fanoutEnabled) {
  if (!fanoutEnabled) {
    return [apiUrl];
  }

  const urls = new Set([apiUrl]);

  for (const merchant of merchants) {
    for (const keyword of searchKeywords) {
      try {
        const requestUrl = new URL(apiUrl);
        requestUrl.searchParams.set('merchant', merchant);
        requestUrl.searchParams.set('q', keyword);
        requestUrl.searchParams.set('query', keyword);
        urls.add(requestUrl.toString());
      } catch {
        urls.add(apiUrl);
      }
    }
  }

  return Array.from(urls);
}

function normalizeMerchantName(rawMerchantName) {
  if (typeof rawMerchantName !== 'string' || rawMerchantName.trim().length === 0) {
    return null;
  }

  const cleaned = rawMerchantName.trim();
  const aliasKey = normalizeKey(cleaned);
  return SUPPORTED_MERCHANT_ALIASES[aliasKey] ?? cleaned;
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

function upsertRetailerEntry(retailers, nextRetailer) {
  const currentRetailers = Array.isArray(retailers) ? retailers : [];
  const nextRetailers = [...currentRetailers];
  const existingIndex = nextRetailers.findIndex(
    retailer => normalizeKey(retailer.n) === normalizeKey(nextRetailer.n)
  );

  if (existingIndex === -1) {
    nextRetailers.push(nextRetailer);
    return nextRetailers;
  }

  const existing = nextRetailers[existingIndex];
  nextRetailers[existingIndex] = {
    ...existing,
    url: nextRetailer.url ?? existing.url,
    p: nextRetailer.p ?? existing.p
  };
  return nextRetailers;
}

function hasAnyValidPrice(product) {
  if (product.price !== null && Number.isInteger(product.price) && product.price > 0) {
    return true;
  }

  if (!Array.isArray(product.retailers)) {
    return false;
  }

  return product.retailers.some(retailer => Number.isInteger(retailer.p) && retailer.p > 0);
}

function deriveBestRetailPrice(product) {
  const directPrice =
    Number.isInteger(product.price) && product.price > 0 ? [product.price] : [];
  const retailerPrices = Array.isArray(product.retailers)
    ? product.retailers
        .map(retailer => retailer.p)
        .filter(price => Number.isInteger(price) && price > 0)
    : [];
  const allPrices = [...directPrice, ...retailerPrices];

  if (allPrices.length === 0) {
    return product.price;
  }

  return Math.min(...allPrices);
}

async function syncCommissionFactoryData({
  dataDir,
  apiUrl = DEFAULT_API_URL,
  apiKey = process.env.CF_API_KEY,
  merchants = DEFAULT_MERCHANTS,
  searchKeywords = DEFAULT_SEARCH_KEYWORDS,
  enableQueryFanout,
  fetchWithRetryFn = fetchWithRetry,
  logger = console,
  write = true
}) {
  if (!apiKey) {
    throw new Error('CF_API_KEY is required for CommissionFactory sync');
  }

  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const productsById = new Map(baseDocument.products.map(product => [product.id, { ...product }]));
  const indexEntries = buildProductSearchIndex(baseDocument.products);
  const fanoutEnabled = enableQueryFanout ?? fetchWithRetryFn === fetchWithRetry;
  const requestUrls = buildFeedRequestUrls(apiUrl, merchants, searchKeywords, fanoutEnabled);
  const feedItems = [];

  for (const requestUrl of requestUrls) {
    const response = await fetchWithRetryFn(
      requestUrl,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      },
      3
    );

    if (response.status >= 400) {
      logger.warn(`[commissionfactory] Ignored HTTP ${response.status} for ${requestUrl}`);
      continue;
    }

    const payload = await response.json();
    feedItems.push(...extractFeedItems(payload));
  }

  if (feedItems.length === 0) {
    throw new Error('CommissionFactory returned no feed items from all configured requests');
  }

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
    const merchantName = normalizeMerchantName(
      feedItem.MerchantName ?? feedItem.merchantName ?? feedItem.Retailer ?? feedItem.Store
    );

    if (mappedAffiliateUrl && !hasValidAffiliate) {
      invalidAffiliateCount += 1;
      logger.warn(
        `[commissionfactory] Rejected affiliate_url for ${baseProduct.brand} ${baseProduct.model}: ${mappedAffiliateUrl} ` +
          '(must start with https://)'
      );
    }

    const nextRetailers =
      merchantName && hasValidAffiliate
        ? upsertRetailerEntry(baseProduct.retailers, {
            n: merchantName,
            url: mappedAffiliateUrl,
            p: hasValidPrice ? mappedPrice : null
          })
        : baseProduct.retailers;

    const mergedProduct = {
      ...baseProduct,
      // Keep ?? semantics so 0 is not treated as "missing" by fallback logic.
      price: hasValidPrice ? mappedPrice ?? baseProduct.price : baseProduct.price,
      affiliate_url: hasValidAffiliate ? mappedAffiliateUrl : baseProduct.affiliate_url,
      retailers: nextRetailers
    };
    mergedProduct.price = deriveBestRetailPrice(mergedProduct);
    mergedProduct.unavailable = !hasAnyValidPrice(mergedProduct);

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
  DEFAULT_MERCHANTS,
  DEFAULT_SEARCH_KEYWORDS,
  buildFeedRequestUrls,
  extractFeedItems,
  findMatchedProductId,
  syncCommissionFactoryData
};
