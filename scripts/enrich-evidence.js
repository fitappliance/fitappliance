'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANUAL_EVIDENCE_PATH = path.join(REPO_ROOT, 'data', 'manual-evidence.json');
const CATALOG_FILES = [
  'appliances.json',
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toDateStamp(value) {
  const raw = String(value ?? '').trim();
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function isHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getSourceUrl(evidence) {
  const candidates = [
    evidence?.source_url,
    evidence?.extracted?.metadata?.source_pdf_url,
  ];
  return candidates.map((value) => String(value ?? '').trim()).find(isHttpUrl) ?? '';
}

function getVerifiedAt(evidence) {
  return toDateStamp(evidence?.verified_at)
    || toDateStamp(evidence?.extracted?.metadata?.extraction_date);
}

function buildEvidencePatch(manualEntry) {
  if (!isPlainObject(manualEntry) || !Array.isArray(manualEntry.evidence)) return null;

  const approved = manualEntry.evidence.find((item) => {
    if (!isPlainObject(item)) return false;
    if (item.status !== 'approved') return false;
    if (!getVerifiedAt(item)) return false;
    const sourceUrl = getSourceUrl(item);
    return !sourceUrl || isHttpUrl(sourceUrl);
  });

  if (!approved) return null;

  const sourceUrl = getSourceUrl(approved);
  return {
    has_pdf_evidence: true,
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    verified_at: getVerifiedAt(approved),
  };
}

function getManualProducts(manualDocument) {
  return isPlainObject(manualDocument?.products) ? manualDocument.products : {};
}

function getManualEntryForProduct(product, manualDocument) {
  const products = getManualProducts(manualDocument);
  const directKeys = [product?.slug, product?.id]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  for (const key of directKeys) {
    if (products[key]) return products[key];
  }

  const productBrand = normalizeKey(product?.brand);
  const productModel = normalizeKey(product?.model);
  if (!productBrand || !productModel) return null;

  return Object.values(products).find((entry) => {
    const entryBrand = normalizeKey(entry?.brand);
    const entryModel = normalizeKey(entry?.model);
    const extractedSku = normalizeKey(entry?.evidence?.find?.((item) => item?.status === 'approved')?.extracted?.sku);
    return entryBrand === productBrand && (entryModel === productModel || extractedSku === productModel);
  }) ?? null;
}

function applyEvidence(products, manualDocument) {
  if (!Array.isArray(products)) return [];

  return products.map((product) => {
    const entry = getManualEntryForProduct(product, manualDocument);
    const evidence = buildEvidencePatch(entry);
    if (!evidence) return { ...product };
    return { ...product, evidence };
  });
}

function enrichCatalogFile(filePath, manualDocument) {
  if (!fs.existsSync(filePath)) return false;

  const original = fs.readFileSync(filePath, 'utf8');
  const document = JSON.parse(original);
  const products = applyEvidence(document.products, manualDocument);
  const nextDocument = { ...document, products };
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
  return Object.values(getManualProducts(manualDocument))
    .filter((entry) => buildEvidencePatch(entry) !== null)
    .length;
}

function enrichEvidence({
  manualEvidencePath = MANUAL_EVIDENCE_PATH,
  dataDir = path.join(REPO_ROOT, 'public', 'data'),
} = {}) {
  const manualDocument = JSON.parse(fs.readFileSync(manualEvidencePath, 'utf8'));
  const approvedCount = countApprovedEntries(manualDocument);
  if (approvedCount === 0) {
    console.log('[enrich-evidence] approved_count=0; no catalog changes');
    return { approvedCount, changedFiles: [] };
  }

  const changedFiles = [];
  for (const fileName of CATALOG_FILES) {
    const filePath = path.join(dataDir, fileName);
    if (enrichCatalogFile(filePath, manualDocument)) {
      changedFiles.push(filePath);
    }
  }

  console.log(`[enrich-evidence] approved_count=${approvedCount}; changed_files=${changedFiles.length}`);
  return { approvedCount, changedFiles };
}

if (require.main === module) {
  enrichEvidence();
}

module.exports = {
  applyEvidence,
  buildEvidencePatch,
  enrichEvidence,
};
