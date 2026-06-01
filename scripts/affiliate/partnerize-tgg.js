'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CAMREF = '1011l5JNxE';
const TGG_RETAILER_NAME = 'The Good Guys';
const TGG_HOST = 'thegoodguys.com.au';
const PUBLIC_DATA_FILES = [
  'appliances.json',
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];

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
      const result = withPartnerizeRetailer(retailer, { camref, pubref, verifiedAt });
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

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const catalogMode = process.argv.includes('--catalog');
  const publicDataMode = process.argv.includes('--public-data');
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
  applyPartnerizeTrackingToCatalog,
  applyPartnerizeTrackingToManualRetailers,
  buildPartnerizeClickUrl,
  isTheGoodGuysProductUrl,
  writeCatalogPartnerizeTracking,
  writePartnerizeTracking,
  writePublicDataPartnerizeTracking,
};
