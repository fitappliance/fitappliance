'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CAMREF = '1011l5JNxE';
const TGG_RETAILER_NAME = 'The Good Guys';
const TGG_HOST = 'thegoodguys.com.au';
const TGG_CAMPAIGN_TERMS = Object.freeze({
  campaign: 'The Good Guys Australia',
  cookieDays: 7,
  coreApplianceCpaPercent: 3,
  observedAt: '2026-07-07',
  excludedBrands: Object.freeze([
    'Apple',
    'Playstation 5',
    'Xbox',
    'Nintendo',
    'Asko',
    'Miele',
    'Loewe',
  ]),
  excludedTransactions: Object.freeze([
    'Gift cards',
    'Gold Service Extras',
    'Home Services',
    'Fisher & Paykel products flagged as Shipped by Supplier',
    'Smeg products flagged as Shipped by Supplier',
    'Physical store transactions',
    'Phone Sales',
    'Pay Less Chat',
    'Commercial website transactions',
    'Marketplace transactions',
    'Coupon codes intended for another affiliate',
  ]),
});
const PUBLIC_DATA_FILES = [
  'appliances.json',
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];
const CORE_FEED_CATEGORY_TO_CATALOG = {
  fridge: 'fridge',
  dishwasher: 'dishwasher',
  dryer: 'dryer',
  washing_machine: 'washing_machine',
  washtower_combo: 'washtower_combo',
};

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeRetailerName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isTheGoodGuysRetailer(retailer) {
  return normalizeRetailerName(retailer?.n ?? retailer?.name) === normalizeRetailerName(TGG_RETAILER_NAME);
}

function isTheGoodGuysProductUrl(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return ['http:', 'https:'].includes(parsed.protocol) &&
      host === TGG_HOST &&
      /^\/[^/?#]+-[^/?#]+$/.test(pathname);
  } catch {
    return false;
  }
}

function assertSafeCamref(camref) {
  const value = String(camref ?? '').trim();
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    throw new Error('Partnerize camref must be alphanumeric');
  }
  return value;
}

function normalizePubref(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeModel(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeCampaignTerm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function canonicalExcludedBrand(value) {
  const normalized = normalizeCampaignTerm(value);
  return TGG_CAMPAIGN_TERMS.excludedBrands.find((brand) => normalizeCampaignTerm(brand) === normalized) ?? null;
}

function isTggExcludedBrand(value) {
  return Boolean(canonicalExcludedBrand(value));
}

function buildTggCommissionMetadata({ brand, cat } = {}) {
  const excludedBrand = canonicalExcludedBrand(brand);
  if (excludedBrand) {
    return {
      commission_eligible: false,
      commission_rate_percent: 0,
      commission_cookie_days: TGG_CAMPAIGN_TERMS.cookieDays,
      commission_model: 'CPA',
      commission_terms_observed_at: TGG_CAMPAIGN_TERMS.observedAt,
      commission_exclusion_reason: `Brand excluded by The Good Guys Australia Partnerize terms: ${excludedBrand}`,
    };
  }

  return {
    commission_eligible: true,
    commission_rate_percent: TGG_CAMPAIGN_TERMS.coreApplianceCpaPercent,
    commission_cookie_days: TGG_CAMPAIGN_TERMS.cookieDays,
    commission_model: 'CPA',
    commission_terms_observed_at: TGG_CAMPAIGN_TERMS.observedAt,
  };
}

function parseDelimitedRows(source, delimiter = '|') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  return rows;
}

function parsePipeCsv(source) {
  const rows = parseDelimitedRows(String(source ?? ''), '|');
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => String(header ?? '').replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ?? '';
    });
    return entry;
  });
}

function getDestinationFromPartnerizeUrl(value) {
  try {
    const raw = String(value ?? '').trim();
    const match = raw.match(/(?:^|\/)destination:([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function classifyFeedCategory(row) {
  const category = String(row?.Category ?? '').trim();
  const title = String(row?.Title ?? '').trim().toLowerCase();
  const haystack = `${category} ${title}`.toLowerCase();

  if (category.startsWith('Fridges & Freezers > Refrigerators')) {
    if (haystack.includes('wine fridge') || haystack.includes('bar fridge')) return null;
    return 'fridge';
  }
  if (category.startsWith('Cooking & Dishwashers > Dishwashers')) return 'dishwasher';
  if (category.startsWith('Laundry > Dryers')) return 'dryer';
  if (category.startsWith('Laundry > Washing Machines')) {
    if (haystack.includes('washtower') || haystack.includes('washer dryer combo') || haystack.includes('laundry centre')) {
      return 'washtower_combo';
    }
    return 'washing_machine';
  }

  return null;
}

function parsePositivePrice(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parsePartnerizeFeedCsv(source, { requireInStock = true } = {}) {
  return parsePipeCsv(source)
    .map((row) => {
      const fitCategory = classifyFeedCategory(row);
      const manufacturerModel = String(row?.['SKU/Unique Identifier'] ?? '').trim();
      const partnerizeUrl = String(row?.URL ?? '').trim();
      const url = getDestinationFromPartnerizeUrl(partnerizeUrl);
      const p = parsePositivePrice(row?.PriceSale) ?? parsePositivePrice(row?.Price);
      const stock = String(row?.Stock ?? '').trim();
      const tggSku = String(row?.ModelNumber ?? '').trim();

      return {
        raw: row,
        affiliate_url: partnerizeUrl,
        brand: String(row?.Brand ?? '').trim(),
        feed_category: String(row?.Category ?? '').trim(),
        fit_category: fitCategory,
        manufacturer_model_normalized: normalizeModel(manufacturerModel),
        manufacturer_model: manufacturerModel,
        p,
        partnerize_url: partnerizeUrl,
        stock,
        tgg_sku: tggSku,
        title: String(row?.Title ?? '').trim(),
        url,
      };
    })
    .filter((row) => row.fit_category && row.manufacturer_model_normalized && row.url && row.partnerize_url)
    .filter((row) => isTheGoodGuysProductUrl(row.url))
    .filter((row) => !requireInStock || row.stock.toLowerCase() === 'yes');
}

function buildCatalogModelIndex(catalogProducts) {
  const index = new Map();
  for (const product of Array.isArray(catalogProducts) ? catalogProducts : []) {
    const model = normalizeModel(product?.model);
    if (!model) continue;
    const list = index.get(model) ?? [];
    list.push(product);
    index.set(model, list);
  }
  return index;
}

function buildFeedRetailer(row, {
  pubref,
  verifiedAt = toIsoDate(),
  product = null,
} = {}) {
  const commissionMetadata = buildTggCommissionMetadata({
    brand: product?.brand ?? row.brand,
    cat: product?.cat ?? CORE_FEED_CATEGORY_TO_CATALOG[row.fit_category],
  });
  return {
    n: TGG_RETAILER_NAME,
    url: row.url,
    p: row.p,
    verified_at: verifiedAt,
    source: 'partnerize-feed',
    affiliate_url: row.affiliate_url,
    affiliate_network: 'partnerize',
    affiliate_campaign: 'The Good Guys Australia',
    pubref: normalizePubref(pubref),
    tracking_verified_at: verifiedAt,
    stock: row.stock,
    tgg_sku: row.tgg_sku,
    feed_title: row.title,
    feed_model: row.manufacturer_model,
    ...commissionMetadata,
  };
}

function upsertRetailer(retailers, nextRetailer) {
  const existing = Array.isArray(retailers) ? retailers : [];
  const index = existing.findIndex((retailer) => normalizeRetailerName(retailer?.n ?? retailer?.name) === normalizeRetailerName(nextRetailer.n));
  if (index === -1) return [...existing, nextRetailer];
  return existing.map((retailer, retailerIndex) => (retailerIndex === index ? nextRetailer : retailer));
}

function importPartnerizeFeedToManualRetailers({
  manualDocument,
  catalogProducts,
  feedCsv,
  verifiedAt = toIsoDate(),
  includeArchived = false,
  requireInStock = true,
} = {}) {
  if (!manualDocument || typeof manualDocument !== 'object') throw new Error('manualDocument is required');
  if (!Array.isArray(catalogProducts)) throw new Error('catalogProducts is required');
  const feedRows = parsePartnerizeFeedCsv(feedCsv, { requireInStock });
  const catalogByModel = buildCatalogModelIndex(catalogProducts);
  const nextProducts = { ...(manualDocument.products ?? {}) };
  const seenProducts = new Set();
  let exactMatches = 0;
  let skippedArchivedMatches = 0;
  let skippedCategoryMismatches = 0;
  let updatedProducts = 0;
  let unmatchedFeedRows = 0;

  for (const row of feedRows) {
    const matches = catalogByModel.get(row.manufacturer_model_normalized) ?? [];
    if (matches.length === 0) {
      unmatchedFeedRows += 1;
      continue;
    }
    exactMatches += 1;

    const wantedCategory = CORE_FEED_CATEGORY_TO_CATALOG[row.fit_category];
    const categoryMatches = matches.filter((product) => !wantedCategory || product?.cat === wantedCategory);
    const product = categoryMatches[0] ?? matches[0];
    if (wantedCategory && product?.cat !== wantedCategory) {
      skippedCategoryMismatches += 1;
      continue;
    }
    if (!includeArchived && product?.unavailable !== false) {
      skippedArchivedMatches += 1;
      continue;
    }

    const key = product?.slug ?? product?.id;
    if (!key || seenProducts.has(key)) continue;
    seenProducts.add(key);

    const existingEntry = nextProducts[key] ?? {};
    const nextRetailer = buildFeedRetailer(row, { pubref: key, verifiedAt, product });
    const retailers = upsertRetailer(existingEntry.retailers, nextRetailer);
    nextProducts[key] = {
      ...existingEntry,
      researched_at: existingEntry.researched_at ?? verifiedAt,
      approved: true,
      confidence: existingEntry.confidence ?? 'high',
      retailers,
    };
    updatedProducts += 1;
  }

  return {
    document: {
      ...manualDocument,
      last_updated: verifiedAt,
      approved_count: Object.values(nextProducts).filter((entry) => entry?.approved === true).length,
      products: nextProducts,
    },
    stats: {
      exactMatches,
      feedRows: feedRows.length,
      skippedArchivedMatches,
      skippedCategoryMismatches,
      unmatchedFeedRows,
      updatedProducts,
    },
  };
}

function importPartnerizeFeedToCatalog({
  catalogDocument,
  feedCsv,
  verifiedAt = toIsoDate(),
  includeArchived = false,
  requireInStock = true,
} = {}) {
  const catalogProducts = Array.isArray(catalogDocument)
    ? catalogDocument
    : Array.isArray(catalogDocument?.products)
      ? catalogDocument.products
      : null;
  if (!Array.isArray(catalogProducts)) throw new Error('catalogDocument products are required');

  const feedRows = parsePartnerizeFeedCsv(feedCsv, { requireInStock });
  const catalogByModel = buildCatalogModelIndex(catalogProducts);
  const updatesByKey = new Map();
  let exactMatches = 0;
  let skippedArchivedMatches = 0;
  let skippedCategoryMismatches = 0;
  let updatedProducts = 0;
  let unmatchedFeedRows = 0;

  for (const row of feedRows) {
    const matches = catalogByModel.get(row.manufacturer_model_normalized) ?? [];
    if (matches.length === 0) {
      unmatchedFeedRows += 1;
      continue;
    }
    exactMatches += 1;

    const wantedCategory = CORE_FEED_CATEGORY_TO_CATALOG[row.fit_category];
    const categoryMatches = matches.filter((product) => !wantedCategory || product?.cat === wantedCategory);
    const product = categoryMatches[0] ?? matches[0];
    if (wantedCategory && product?.cat !== wantedCategory) {
      skippedCategoryMismatches += 1;
      continue;
    }
    if (!includeArchived && product?.unavailable !== false) {
      skippedArchivedMatches += 1;
      continue;
    }

    const key = product?.id ?? product?.slug;
    if (!key || updatesByKey.has(key)) continue;

    const nextRetailer = buildFeedRetailer(row, { pubref: key, verifiedAt, product });
    updatesByKey.set(key, nextRetailer);
    updatedProducts += 1;
  }

  const nextProducts = catalogProducts.map((product) => {
    const key = product?.id ?? product?.slug;
    const retailer = updatesByKey.get(key);
    if (!retailer) return product;
    return {
      ...product,
      retailers: upsertRetailer(product.retailers, retailer),
    };
  });

  return {
    document: Array.isArray(catalogDocument)
      ? nextProducts
      : { ...catalogDocument, products: nextProducts },
    stats: {
      exactMatches,
      feedRows: feedRows.length,
      skippedArchivedMatches,
      skippedCategoryMismatches,
      unmatchedFeedRows,
      updatedProducts,
    },
  };
}

function buildPartnerizeClickUrl(destinationUrl, {
  camref = DEFAULT_CAMREF,
  pubref = '',
} = {}) {
  if (!isTheGoodGuysProductUrl(destinationUrl)) {
    throw new Error(`Refusing to build Partnerize link for non-TGG product URL: ${destinationUrl}`);
  }

  const safeCamref = assertSafeCamref(camref);
  const safePubref = normalizePubref(pubref);
  const pubrefSegment = safePubref ? `/pubref:${encodeURIComponent(safePubref)}` : '';
  return `https://prf.hn/click/camref:${safeCamref}${pubrefSegment}/destination:${encodeURIComponent(destinationUrl)}`;
}

function applyPartnerizeTrackingToManualRetailers(manualDocument, {
  camref = DEFAULT_CAMREF,
  verifiedAt = toIsoDate(),
} = {}) {
  const products = manualDocument?.products ?? {};
  let updatedRetailers = 0;
  let skippedRetailers = 0;
  let touchedProducts = 0;

  const nextProducts = Object.fromEntries(Object.entries(products).map(([slug, entry]) => {
    if (!entry || !Array.isArray(entry.retailers)) return [slug, entry];

    let changed = false;
    const retailers = entry.retailers.map((retailer) => {
      if (!isTheGoodGuysRetailer(retailer)) return retailer;
      if (!isTheGoodGuysProductUrl(retailer?.url)) {
        skippedRetailers += 1;
        return retailer;
      }

      const affiliateUrl = buildPartnerizeClickUrl(retailer.url, { camref, pubref: slug });
      const nextRetailer = {
        ...retailer,
        affiliate_url: affiliateUrl,
        affiliate_network: 'partnerize',
        affiliate_campaign: 'The Good Guys Australia',
        camref,
        pubref: normalizePubref(slug),
        tracking_verified_at: verifiedAt,
      };
      if (JSON.stringify(nextRetailer) !== JSON.stringify(retailer)) {
        changed = true;
        updatedRetailers += 1;
      }
      return nextRetailer;
    });

    if (!changed) return [slug, entry];
    touchedProducts += 1;
    return [slug, { ...entry, retailers }];
  }));

  return {
    document: { ...manualDocument, products: nextProducts },
    stats: {
      touchedProducts,
      updatedRetailers,
      skippedRetailers,
      camref,
      verifiedAt,
    },
  };
}

function withPartnerizeRetailer(retailer, {
  camref = DEFAULT_CAMREF,
  pubref = '',
  verifiedAt = toIsoDate(),
  product = null,
} = {}) {
  if (!isTheGoodGuysRetailer(retailer)) return { retailer, updated: false, skipped: false };
  if (!isTheGoodGuysProductUrl(retailer?.url)) {
    return { retailer, updated: false, skipped: true };
  }

  const affiliateUrl = buildPartnerizeClickUrl(retailer.url, { camref, pubref });
  const nextRetailer = {
    ...retailer,
    affiliate_url: affiliateUrl,
    affiliate_network: 'partnerize',
    affiliate_campaign: 'The Good Guys Australia',
    camref,
    pubref: normalizePubref(pubref),
    tracking_verified_at: verifiedAt,
    ...buildTggCommissionMetadata({
      brand: product?.brand,
      cat: product?.cat,
    }),
  };
  return {
    retailer: nextRetailer,
    updated: JSON.stringify(nextRetailer) !== JSON.stringify(retailer),
    skipped: false,
  };
}

function applyPartnerizeTrackingToCatalog(catalogDocument, {
  camref = DEFAULT_CAMREF,
  verifiedAt = toIsoDate(),
} = {}) {
  const products = Array.isArray(catalogDocument)
    ? catalogDocument
    : Array.isArray(catalogDocument?.products)
      ? catalogDocument.products
      : [];
  let updatedRetailers = 0;
  let skippedRetailers = 0;
  let touchedProducts = 0;

  const nextProducts = products.map((product) => {
    if (!Array.isArray(product?.retailers)) return product;
    let changed = false;
    const pubref = product?.id ?? product?.slug ?? product?.model ?? '';
    const retailers = product.retailers.map((retailer) => {
      const result = withPartnerizeRetailer(retailer, { camref, pubref, verifiedAt, product });
      if (result.updated) {
        changed = true;
        updatedRetailers += 1;
      }
      if (result.skipped) skippedRetailers += 1;
      return result.retailer;
    });
    if (!changed) return product;
    touchedProducts += 1;
    return { ...product, retailers };
  });

  return {
    document: Array.isArray(catalogDocument)
      ? nextProducts
      : { ...catalogDocument, products: nextProducts },
    stats: {
      touchedProducts,
      updatedRetailers,
      skippedRetailers,
      camref,
      verifiedAt,
    },
  };
}

function writePartnerizeTracking({
  inputPath,
  outputPath = inputPath,
  camref = process.env.PARTNERIZE_TGG_CAMREF || DEFAULT_CAMREF,
  verifiedAt = toIsoDate(),
  compact = null,
} = {}) {
  if (!inputPath) throw new Error('inputPath is required');
  const original = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(original);
  const { document, stats } = applyPartnerizeTrackingToManualRetailers(parsed, { camref, verifiedAt });
  const useCompact = compact ?? original.split('\n').length < 5;
  const next = useCompact ? JSON.stringify(document) : `${JSON.stringify(document, null, 2)}\n`;
  if (next !== original) {
    fs.writeFileSync(outputPath, next);
  }
  return stats;
}

function writeCatalogPartnerizeTracking({
  inputPath,
  outputPath = inputPath,
  camref = process.env.PARTNERIZE_TGG_CAMREF || DEFAULT_CAMREF,
  verifiedAt = toIsoDate(),
  compact = null,
} = {}) {
  if (!inputPath) throw new Error('inputPath is required');
  const original = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(original);
  const { document, stats } = applyPartnerizeTrackingToCatalog(parsed, { camref, verifiedAt });
  const useCompact = compact ?? original.split('\n').length < 5;
  const next = useCompact ? JSON.stringify(document) : `${JSON.stringify(document, null, 2)}\n`;
  if (next !== original) {
    fs.writeFileSync(outputPath, next);
  }
  return stats;
}

function writePublicDataPartnerizeTracking({
  publicDataDir,
  camref = process.env.PARTNERIZE_TGG_CAMREF || DEFAULT_CAMREF,
  verifiedAt = toIsoDate(),
} = {}) {
  if (!publicDataDir) throw new Error('publicDataDir is required');
  const totals = {
    touchedProducts: 0,
    updatedRetailers: 0,
    skippedRetailers: 0,
    camref,
    verifiedAt,
  };

  for (const fileName of PUBLIC_DATA_FILES) {
    const inputPath = path.join(publicDataDir, fileName);
    const stats = writeCatalogPartnerizeTracking({ inputPath, camref, verifiedAt });
    totals.touchedProducts += stats.touchedProducts;
    totals.updatedRetailers += stats.updatedRetailers;
    totals.skippedRetailers += stats.skippedRetailers;
  }

  return totals;
}

function writePartnerizeFeedImport({
  manualRetailersPath,
  catalogPath,
  feedPath,
  verifiedAt = toIsoDate(),
  includeArchived = false,
  requireInStock = true,
  compact = false,
} = {}) {
  if (!manualRetailersPath) throw new Error('manualRetailersPath is required');
  if (!catalogPath) throw new Error('catalogPath is required');
  if (!feedPath) throw new Error('feedPath is required');

  const original = fs.readFileSync(manualRetailersPath, 'utf8');
  const catalogOriginal = fs.readFileSync(catalogPath, 'utf8');
  const catalogDocument = JSON.parse(catalogOriginal);
  const catalogProducts = Array.isArray(catalogDocument)
    ? catalogDocument
    : Array.isArray(catalogDocument?.products)
      ? catalogDocument.products
      : [];
  const feedCsv = fs.readFileSync(feedPath, 'utf8');
  const { document, stats } = importPartnerizeFeedToManualRetailers({
    manualDocument: JSON.parse(original),
    catalogProducts,
    feedCsv,
    verifiedAt,
    includeArchived,
    requireInStock,
  });
  const { document: catalogNext, stats: catalogStats } = importPartnerizeFeedToCatalog({
    catalogDocument,
    feedCsv,
    verifiedAt,
    includeArchived,
    requireInStock,
  });
  const next = compact ? JSON.stringify(document) : `${JSON.stringify(document, null, 2)}\n`;
  if (next !== original) fs.writeFileSync(manualRetailersPath, next);
  const catalogFormatted = compact ? JSON.stringify(catalogNext) : `${JSON.stringify(catalogNext, null, 2)}\n`;
  if (catalogFormatted !== catalogOriginal) fs.writeFileSync(catalogPath, catalogFormatted);
  return {
    ...stats,
    catalogUpdatedProducts: catalogStats.updatedProducts,
  };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const catalogMode = process.argv.includes('--catalog');
  const publicDataMode = process.argv.includes('--public-data');
  const feedImportMode = process.argv.includes('--import-feed');
  if (feedImportMode) {
    const feedPath = process.argv.includes('--feed')
      ? process.argv[process.argv.indexOf('--feed') + 1]
      : process.env.PARTNERIZE_TGG_FEED_PATH;
    const verifiedAt = process.argv.includes('--verified-at')
      ? process.argv[process.argv.indexOf('--verified-at') + 1]
      : toIsoDate();
    const stats = writePartnerizeFeedImport({
      manualRetailersPath: path.join(repoRoot, 'data', 'manual-retailers.json'),
      catalogPath: path.join(repoRoot, 'data', 'catalog-final.json'),
      feedPath,
      verifiedAt,
      includeArchived: process.argv.includes('--include-archived'),
      requireInStock: !process.argv.includes('--include-out-of-stock'),
    });
    console.log(`[partnerize-tgg-feed] feed_rows=${stats.feedRows}; matches=${stats.exactMatches}; updated_products=${stats.updatedProducts}; skipped_archived=${stats.skippedArchivedMatches}; unmatched=${stats.unmatchedFeedRows}`);
    return;
  }
  const inputPath = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : publicDataMode
      ? path.join(repoRoot, 'public', 'data')
      : catalogMode
      ? path.join(repoRoot, 'data', 'catalog-final.json')
      : path.join(repoRoot, 'data', 'manual-retailers.json');
  const verifiedAt = process.argv.includes('--verified-at')
    ? process.argv[process.argv.indexOf('--verified-at') + 1]
    : toIsoDate();
  const stats = publicDataMode
    ? writePublicDataPartnerizeTracking({ publicDataDir: inputPath, verifiedAt })
    : catalogMode
    ? writeCatalogPartnerizeTracking({ inputPath, verifiedAt })
    : writePartnerizeTracking({ inputPath, verifiedAt });
  console.log(`[partnerize-tgg] touched_products=${stats.touchedProducts}; updated_retailers=${stats.updatedRetailers}; skipped=${stats.skippedRetailers}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CAMREF,
  TGG_CAMPAIGN_TERMS,
  applyPartnerizeTrackingToCatalog,
  applyPartnerizeTrackingToManualRetailers,
  buildTggCommissionMetadata,
  buildPartnerizeClickUrl,
  importPartnerizeFeedToCatalog,
  importPartnerizeFeedToManualRetailers,
  isTggExcludedBrand,
  isTheGoodGuysProductUrl,
  parsePartnerizeFeedCsv,
  writeCatalogPartnerizeTracking,
  writePartnerizeFeedImport,
  writePartnerizeTracking,
  writePublicDataPartnerizeTracking,
};
