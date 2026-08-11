'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isRetailerProductPageUrl } = require('../public/scripts/search-core.js');
const { canonicalizeBrand } = require('./brand-canon.js');
const { normalizeRetailerPrice } = require('./common/retailer-price.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANUAL_RETAILERS_PATH = path.join(REPO_ROOT, 'data', 'manual-retailers.json');
const CATALOG_FILES = [
  'appliances.json',
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];

const PRIVATE_RETAILER_FIELDS = new Set([
  'affiliate_campaign',
  'affiliate_network',
  'affiliate_url',
  'camref',
  'commission_cookie_days',
  'commission_eligible',
  'commission_exclusion_reason',
  'commission_model',
  'commission_rate_percent',
  'commission_terms_observed_at',
  'feed_model',
  'feed_title',
  'pubref',
  'retailer_dimension_hint',
  'retailer_dimension_hint_catalog_delta_mm',
  'retailer_dimension_hint_review_required',
  'retailer_dimension_hint_source_text',
  'tgg_sku',
  'tracking_verified_at',
]);

function normalizeRetailerName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isPrivateRetailerEvidence(retailer) {
  if (!retailer || typeof retailer !== 'object') return false;
  const source = String(retailer.source ?? '').trim().toLowerCase();
  const sourceType = String(retailer.sourceType ?? '').trim().toLowerCase();
  const affiliateUrl = String(retailer.affiliate_url ?? '').trim().toLowerCase();
  const privateSourcePolicy = 'the-good-guys-partnerize-feed-v1';
  return source.includes('partnerize')
    || sourceType.includes('partnerize')
    || source === 'affiliate_feed'
    || sourceType === 'affiliate_feed'
    || String(retailer.adapterId ?? '').trim() === privateSourcePolicy
    || String(retailer.sourcePolicyId ?? '').trim() === privateSourcePolicy
    || String(retailer.affiliate_network ?? '').trim().toLowerCase() === 'partnerize'
    || affiliateUrl.includes('prf.hn/click')
    || affiliateUrl.includes('feeds.performancehorizon.com')
    || Object.keys(retailer).some((key) => PRIVATE_RETAILER_FIELDS.has(key));
}

function cloneRetailer(retailer) {
  if (isPrivateRetailerEvidence(retailer)) return null;
  const cloned = {
    n: String(retailer?.n ?? '').trim(),
    url: String(retailer?.url ?? '').trim(),
    p: normalizeRetailerPrice(retailer?.p ?? retailer?.price),
    verified_at: retailer?.verified_at ?? null,
    source: retailer?.source ?? 'manual',
  };
  for (const key of ['stock']) {
    const value = retailer?.[key];
    if (value !== undefined && value !== null && value !== '') {
      cloned[key] = String(value).trim();
    }
  }
  return cloned;
}

function mergeRetailers(existingRetailers = [], manualRetailers = []) {
  const merged = Array.isArray(existingRetailers)
    ? existingRetailers.map((retailer) => ({ ...retailer }))
    : [];

  for (const manualRetailer of manualRetailers) {
    const next = cloneRetailer(manualRetailer);
    if (!next?.n || !next.url) continue;

    const index = merged.findIndex((retailer) => normalizeRetailerName(retailer?.n) === normalizeRetailerName(next.n));
    if (index === -1) {
      merged.push(next);
    } else {
      merged[index] = next;
    }
  }

  return merged;
}

function removeRetailers(existingRetailers = [], removedRetailers = []) {
  if (!Array.isArray(existingRetailers)) return [];
  if (!Array.isArray(removedRetailers) || removedRetailers.length === 0) {
    return existingRetailers.map((retailer) => ({ ...retailer }));
  }

  const removed = new Set(removedRetailers.map(normalizeRetailerName).filter(Boolean));
  return existingRetailers
    .filter((retailer) => !removed.has(normalizeRetailerName(retailer?.n)))
    .map((retailer) => ({ ...retailer }));
}

function getApprovedManualEntry(product, manualDocument) {
  const products = manualDocument?.products ?? {};
  const key = product?.slug ?? product?.id;
  const entry = products[key];
  if (!entry?.approved) return null;
  if (!Array.isArray(entry.retailers) || entry.retailers.length === 0) return null;
  const retailers = entry.retailers
    .map(cloneRetailer)
    .filter((retailer) => retailer?.n && isRetailerProductPageUrl(retailer.url));
  if (retailers.length === 0) return null;
  return { ...entry, retailers };
}

function applyManualRetailers(products, manualDocument) {
  if (!Array.isArray(products)) return [];

  return products.map((product) => {
    const canonicalBrand = canonicalizeBrand(product?.brand);
    const sourceRetailers = Array.isArray(product.retailers) ? product.retailers : [];
    const existingPublicRetailers = sourceRetailers.filter((retailer) => !isPrivateRetailerEvidence(retailer));
    const removedPrivateRetailer = existingPublicRetailers.length !== sourceRetailers.length;
    const entry = getApprovedManualEntry(product, manualDocument);
    if (!entry) {
      return {
        ...product,
        brand: canonicalBrand,
        retailers: existingPublicRetailers.map((retailer) => ({ ...retailer })),
        unavailable: existingPublicRetailers.length > 0
          ? false
          : (removedPrivateRetailer ? true : product.unavailable),
      };
    }

    const existingRetailers = removeRetailers(existingPublicRetailers, entry.removed_retailers);
    const retailers = mergeRetailers(existingRetailers, entry.retailers);
    return {
      ...product,
      brand: canonicalBrand,
      retailers,
      unavailable: false,
    };
  });
}

function enrichCatalogFile(filePath, manualDocument) {
  const original = fs.readFileSync(filePath, 'utf8');
  const document = JSON.parse(original);
  const products = applyManualRetailers(document.products, manualDocument);
  const nextDocument = { ...document, products };
  // Preserve the catalog's compact (single-line) JSON format to avoid massive whitespace diffs.
  // Detect format by checking if the original lacks pretty-printing (has no internal newlines).
  const isCompact = !original.slice(0, 200).includes('\n') || original.split('\n').length < 5;
  const next = isCompact
    ? JSON.stringify(nextDocument)
    : `${JSON.stringify(nextDocument, null, 2)}\n`;

  if (next !== original) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

function countApprovedEntries(manualDocument) {
  return Object.values(manualDocument?.products ?? {}).filter((entry) => entry?.approved === true).length;
}

function enrichManualRetailers({
  manualRetailersPath = MANUAL_RETAILERS_PATH,
  dataDir = path.join(REPO_ROOT, 'public', 'data'),
} = {}) {
  const manualDocument = JSON.parse(fs.readFileSync(manualRetailersPath, 'utf8'));
  const approvedCount = countApprovedEntries(manualDocument);

  const changedFiles = [];
  for (const fileName of CATALOG_FILES) {
    const filePath = path.join(dataDir, fileName);
    if (enrichCatalogFile(filePath, manualDocument)) {
      changedFiles.push(filePath);
    }
  }

  console.log(`[enrich-manual-retailers] approved_count=${approvedCount}; changed_files=${changedFiles.length}`);
  return { approvedCount, changedFiles };
}

if (require.main === module) {
  enrichManualRetailers();
}

module.exports = {
  applyManualRetailers,
  enrichManualRetailers,
  isPrivateRetailerEvidence,
  mergeRetailers,
  removeRetailers,
};
