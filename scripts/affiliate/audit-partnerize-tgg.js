'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TGG_CAMPAIGN_TERMS, isTheGoodGuysProductUrl } = require('./partnerize-tgg.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANUAL_RETAILERS_PATH = path.join(REPO_ROOT, 'data', 'manual-retailers.json');
const CATALOG_FINAL_PATH = path.join(REPO_ROOT, 'data', 'catalog-final.json');
const REPORT_PATH = path.join(REPO_ROOT, 'reports', 'partnerize-tgg-integration-audit.md');
const PUBLIC_DATA_FILES = [
  'appliances.json',
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];

function isPartnerizeUrl(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    return parsed.protocol === 'https:' && parsed.hostname === 'prf.hn' && /\/click\/camref:1011l5JNxE\b/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isTggName(value) {
  return String(value ?? '').trim().toLowerCase() === 'the good guys';
}

function countManualRetailers(manualDocument) {
  const rows = [];
  for (const [slug, entry] of Object.entries(manualDocument?.products ?? {})) {
    for (const retailer of entry?.retailers ?? []) {
      if (isTggName(retailer?.n)) rows.push({ slug, retailer });
    }
  }
  return rows;
}

function countPublicRetailers() {
  const rows = [];
  for (const fileName of PUBLIC_DATA_FILES) {
    const filePath = path.join(REPO_ROOT, 'public', 'data', fileName);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const product of document.products ?? []) {
      for (const retailer of product.retailers ?? []) {
        if (isTggName(retailer?.n)) rows.push({ fileName, productId: product.id, retailer });
      }
    }
  }
  return rows;
}

function countCatalogRetailers(catalogDocument) {
  const products = Array.isArray(catalogDocument)
    ? catalogDocument
    : Array.isArray(catalogDocument?.products)
      ? catalogDocument.products
      : [];
  const rows = [];
  for (const product of products) {
    for (const retailer of product?.retailers ?? []) {
      if (isTggName(retailer?.n)) rows.push({ productId: product.id, retailer });
    }
  }
  return rows;
}

function summarize(rows) {
  return {
    total: rows.length,
    canonicalValid: rows.filter((row) => isTheGoodGuysProductUrl(row.retailer?.url)).length,
    affiliateValid: rows.filter((row) => isPartnerizeUrl(row.retailer?.affiliate_url)).length,
    missingAffiliate: rows.filter((row) => !row.retailer?.affiliate_url).length,
    badCanonical: rows.filter((row) => row.retailer?.url && !isTheGoodGuysProductUrl(row.retailer.url)).length,
    badAffiliate: rows.filter((row) => row.retailer?.affiliate_url && !isPartnerizeUrl(row.retailer.affiliate_url)).length,
  };
}

function buildReport({ manualSummary, catalogSummary, publicSummary, feedStatus }) {
  return `# Partnerize TGG Integration Audit

Generated: ${new Date().toISOString()}

## Executive Summary

- Tracking campaign captured from Partnerize: The Good Guys Australia, camref \`1011l5JNxE\`.
- Manual source keeps canonical The Good Guys product URLs and adds separate Partnerize \`affiliate_url\` fields for outbound clicks.
- Partnerize product feed is used only as retailer availability / price / affiliate-link evidence; it does not replace PDF dimension or clearance evidence.

## Manual Retailer Ledger

| Metric | Count |
|---|---:|
| The Good Guys rows | ${manualSummary.total} |
| Canonical product URLs valid | ${manualSummary.canonicalValid} |
| Partnerize affiliate URLs valid | ${manualSummary.affiliateValid} |
| Missing affiliate URLs | ${manualSummary.missingAffiliate} |
| Bad canonical URLs | ${manualSummary.badCanonical} |
| Bad affiliate URLs | ${manualSummary.badAffiliate} |

## Runtime Catalog Source

| Metric | Count |
|---|---:|
| The Good Guys rows in data/catalog-final.json | ${catalogSummary.total} |
| Canonical product URLs valid | ${catalogSummary.canonicalValid} |
| Partnerize affiliate URLs valid | ${catalogSummary.affiliateValid} |
| Missing affiliate URLs | ${catalogSummary.missingAffiliate} |
| Bad canonical URLs | ${catalogSummary.badCanonical} |
| Bad affiliate URLs | ${catalogSummary.badAffiliate} |

## Generated Public Data

| Metric | Count |
|---|---:|
| The Good Guys rows across public/data | ${publicSummary.total} |
| Canonical product URLs valid | ${publicSummary.canonicalValid} |
| Partnerize affiliate URLs valid | ${publicSummary.affiliateValid} |
| Missing affiliate URLs | ${publicSummary.missingAffiliate} |
| Bad canonical URLs | ${publicSummary.badCanonical} |
| Bad affiliate URLs | ${publicSummary.badAffiliate} |

## Partnerize Feed Check

- Backend creative overview shows \`Feed: 1\` for The Good Guys Australia.
- Feed id observed: \`1101l1365\`.
- Feed name observed: \`The Good Guys Product Feed\`.
- Download/import status: \`${feedStatus}\`.
- The private feed URL must not be committed. Feed imports should use a local file path via \`--feed\` or \`PARTNERIZE_TGG_FEED_PATH\`.

## Campaign Terms Snapshot

- Cookie period observed in Partnerize: ${TGG_CAMPAIGN_TERMS.cookieDays} days.
- Core FitAppliance appliance categories map to ${TGG_CAMPAIGN_TERMS.coreApplianceCpaPercent}% CPA in the displayed campaign rates.
- Excluded brands observed in campaign terms: ${TGG_CAMPAIGN_TERMS.excludedBrands.join(', ')}.
- Excluded transaction/product cases are retained as zero-commission assumptions, not as reasons to remove user-useful retailer links.

## Bug Audit

- Canonical retailer URLs are preserved for validation, SEO, and transparency.
- Click destinations use \`affiliate_url\` only when present and valid.
- Search/category URLs are still rejected by product-page validation.
- No Partnerize private feed URL is stored in the repository.
- Product feed cannot upgrade a product to \`Verified Fit\`; only official PDF clearance evidence can do that.
- Excluded-brand links can remain visible, but they must not be counted as commission-eligible or Merchant/Shopping proof.
`;
}

function runAudit({
  manualRetailersPath = MANUAL_RETAILERS_PATH,
  reportPath = REPORT_PATH,
  feedStatus = 'available for local import via partnerize-tgg --import-feed',
} = {}) {
  const manualDocument = JSON.parse(fs.readFileSync(manualRetailersPath, 'utf8'));
  const catalogDocument = JSON.parse(fs.readFileSync(CATALOG_FINAL_PATH, 'utf8'));
  const manualRows = countManualRetailers(manualDocument);
  const catalogRows = countCatalogRetailers(catalogDocument);
  const publicRows = countPublicRetailers();
  const report = buildReport({
    manualSummary: summarize(manualRows),
    catalogSummary: summarize(catalogRows),
    publicSummary: summarize(publicRows),
    feedStatus,
  });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  return {
    reportPath,
    catalogSummary: summarize(catalogRows),
    manualSummary: summarize(manualRows),
    publicSummary: summarize(publicRows),
  };
}

if (require.main === module) {
  const result = runAudit();
  console.log(`[partnerize-tgg-audit] wrote ${result.reportPath}`);
  console.log(JSON.stringify({
    manual: result.manualSummary,
    catalog: result.catalogSummary,
    runtime: result.publicSummary,
  }, null, 2));
}

module.exports = {
  countCatalogRetailers,
  isPartnerizeUrl,
  runAudit,
  summarize,
};
