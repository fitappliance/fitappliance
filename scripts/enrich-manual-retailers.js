'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANUAL_RETAILERS_PATH = path.join(REPO_ROOT, 'data', 'manual-retailers.json');
const CATALOG_FILES = [
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];

function normalizeRetailerName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cloneRetailer(retailer) {
  return {
    n: String(retailer?.n ?? '').trim(),
    url: String(retailer?.url ?? '').trim(),
    p: retailer?.p ?? null,
    verified_at: retailer?.verified_at ?? null,
    source: retailer?.source ?? 'manual',
  };
}

function mergeRetailers(existingRetailers = [], manualRetailers = []) {
  const merged = Array.isArray(existingRetailers)
    ? existingRetailers.map((retailer) => ({ ...retailer }))
    : [];

  for (const manualRetailer of manualRetailers) {
    const next = cloneRetailer(manualRetailer);
    if (!next.n || !next.url) continue;

    const index = merged.findIndex((retailer) => normalizeRetailerName(retailer?.n) === normalizeRetailerName(next.n));
    if (index === -1) {
      merged.push(next);
    } else {
      merged[index] = next;
    }
  }

  return merged;
}

function getApprovedManualEntry(product, manualDocument) {
  const products = manualDocument?.products ?? {};
  const key = product?.slug ?? product?.id;
  const entry = products[key];
  if (!entry?.approved) return null;
  if (!Array.isArray(entry.retailers) || entry.retailers.length === 0) return null;
  return entry;
}

function applyManualRetailers(products, manualDocument) {
  if (!Array.isArray(products)) return [];

  return products.map((product) => {
    const entry = getApprovedManualEntry(product, manualDocument);
    if (!entry) return { ...product };

    const retailers = mergeRetailers(product.retailers, entry.retailers);
    return {
      ...product,
      retailers,
      unavailable: retailers.length > 0 ? false : product.unavailable,
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
  if (approvedCount === 0) {
    console.log('[enrich-manual-retailers] approved_count=0; no catalog changes');
    return { approvedCount, changedFiles: [] };
  }

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
  mergeRetailers,
};

