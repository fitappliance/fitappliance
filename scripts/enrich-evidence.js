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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

function getHostname(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isRetailerOrThirdPartySource(sourceType, sourceUrl) {
  const normalizedSource = String(sourceType ?? '').toLowerCase();
  if (normalizedSource.includes('retailer') || normalizedSource.includes('third_party')) return true;
  const host = getHostname(sourceUrl);
  return [
    'appliancesonline.com.au',
    'commercial.appliancesonline.com.au',
    'thegoodguys.com.au',
    'harveynorman.com.au',
    'binglee.com.au',
    'device.report',
    'manualslib.com',
    'usermanuals.au',
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeVerifiedFields(fields, trustLevel) {
  if (trustLevel !== 'verified_fit') return ['dimensions'];
  if (Array.isArray(fields)) {
    const next = [...new Set(fields.filter((field) => ['dimensions', 'clearance'].includes(field)))];
    if (next.length > 0) return next;
  }
  return ['dimensions', 'clearance'];
}

function hasExtractedDimensionsEvidence(evidence) {
  const dimensions = evidence?.extracted?.dimensions;
  return ['height_mm', 'width_mm', 'depth_mm'].every((key) => (
    typeof dimensions?.[key] === 'number' && Number.isFinite(dimensions[key]) && dimensions[key] > 0
  ));
}

function hasExtractedClearanceEvidence(evidence) {
  const clearance = evidence?.extracted?.clearance_requirements;
  return ['top_mm', 'left_mm', 'right_mm', 'rear_mm'].every((key) => (
    typeof clearance?.[key] === 'number' && Number.isFinite(clearance[key]) && clearance[key] >= 0
  ));
}

function hasNonZeroExtractedClearance(evidence) {
  const clearance = evidence?.extracted?.clearance_requirements;
  return ['top_mm', 'left_mm', 'right_mm', 'rear_mm'].some((key) => (
    typeof clearance?.[key] === 'number' && Number.isFinite(clearance[key]) && clearance[key] > 0
  ));
}

function hasExplicitClearanceEvidence(evidence) {
  if (evidence?.clearance_verified === true) return true;
  if (Array.isArray(evidence?.verified_fields) && evidence.verified_fields.includes('clearance')) return true;
  const metadata = evidence?.extracted?.metadata ?? {};
  if (isNonEmptyString(evidence?.clearance_source) || isNonEmptyString(metadata.clearance_source)) return true;
  return hasExtractedClearanceEvidence(evidence) && hasNonZeroExtractedClearance(evidence);
}

function inferTrustLevel(evidence, hasPdfEvidence, sourceType, sourceUrl = '') {
  const explicit = String(evidence?.trust_level ?? '').trim();
  if (explicit === 'retailer_spec') return 'retailer_spec';
  if (hasPdfEvidence === false || isRetailerOrThirdPartySource(sourceType, sourceUrl)) {
    return 'retailer_spec';
  }
  if (explicit === 'verified_fit' && hasExplicitClearanceEvidence(evidence)) return 'verified_fit';
  if (explicit === 'dimensions_verified') return 'dimensions_verified';
  if (
    hasExtractedDimensionsEvidence(evidence)
    && hasExplicitClearanceEvidence(evidence)
  ) {
    return 'verified_fit';
  }
  return 'dimensions_verified';
}

function normalizeSourceTypeForTrust(sourceType, sourceUrl) {
  if (!isRetailerOrThirdPartySource(sourceType, sourceUrl)) return sourceType;
  const normalized = String(sourceType ?? '').toLowerCase();
  return ['official_pdf', 'manual_evidence', 'spec_sheet', 'installation_manual'].includes(normalized)
    ? 'retailer_spec'
    : sourceType;
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
  const hasPdfEvidence = typeof approved.has_pdf_evidence === 'boolean' ? approved.has_pdf_evidence : true;
  const sourceType = isNonEmptyString(approved.source_type)
    ? approved.source_type
    : (hasPdfEvidence ? 'official_pdf' : 'retailer_spec');
  const trustLevel = inferTrustLevel(approved, hasPdfEvidence, sourceType, sourceUrl);
  const effectiveSourceType = normalizeSourceTypeForTrust(sourceType, sourceUrl);
  const verifiedFields = normalizeVerifiedFields(approved.verified_fields, trustLevel);
  const clearanceVerified = trustLevel !== 'verified_fit'
    ? false
    : typeof approved.clearance_verified === 'boolean'
    ? approved.clearance_verified
    : trustLevel === 'verified_fit';

  return {
    has_pdf_evidence: hasPdfEvidence,
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    verified_at: getVerifiedAt(approved),
    source_type: effectiveSourceType,
    trust_level: trustLevel,
    verified_fields: verifiedFields,
    clearance_verified: clearanceVerified,
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
