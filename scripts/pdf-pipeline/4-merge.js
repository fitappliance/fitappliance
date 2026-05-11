#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_FILES = [
  ['fridge', 'fridges.json'],
  ['dishwasher', 'dishwashers.json'],
  ['dryer', 'dryers.json'],
  ['washing_machine', 'washing-machines.json']
];

const DEFAULT_OUTPUT_PATH = path.join('data', 'catalog-final.json');
const DEFAULT_EVIDENCE_DIR = path.join('data', 'pdf-evidence-raw');

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toSlashPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function getCatalogRows(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.products)) return catalog.products;
  return [];
}

function loadRuntimeCatalog(repoRoot = process.cwd()) {
  const rows = [];
  for (const [category, fileName] of CATALOG_FILES) {
    const filePath = path.join(repoRoot, 'public', 'data', fileName);
    const catalog = readJson(filePath, { products: [] });
    for (const product of getCatalogRows(catalog)) {
      rows.push({
        ...product,
        cat: product.cat || category
      });
    }
  }
  return rows;
}

function loadManualEvidenceManifest(repoRoot = process.cwd()) {
  return readJson(path.join(repoRoot, 'data', 'manual-evidence.json'), { products: {} });
}

function isValidRawEvidence(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.extracted
    && value.extracted.dimensions
    && value.extracted.clearance_requirements
    && value.extracted.flags
  );
}

function loadRawEvidenceEntries({
  repoRoot = process.cwd(),
  evidenceDir = path.join(repoRoot, DEFAULT_EVIDENCE_DIR)
} = {}) {
  if (!fs.existsSync(evidenceDir)) return [];
  return fs.readdirSync(evidenceDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const filePath = path.join(evidenceDir, fileName);
      const parsed = readJson(filePath);
      return {
        ...parsed,
        raw_json_path: toSlashPath(path.relative(repoRoot, filePath))
      };
    })
    .filter(isValidRawEvidence);
}

function getEvidenceSkuCandidates(evidence) {
  return [
    evidence?.model,
    evidence?.extracted?.sku,
    evidence?.extracted?.model
  ].map(normalizeToken).filter(Boolean);
}

function buildEvidenceIndex(entries) {
  const byProductId = new Map();
  const bySku = new Map();
  const ambiguousSkuTokens = new Set();
  const duplicateEntries = [];

  for (const entry of entries) {
    if (entry.product_id) {
      const productId = String(entry.product_id);
      if (byProductId.has(productId)) {
        duplicateEntries.push(entry);
        continue;
      }
      byProductId.set(productId, entry);
    }

    for (const sku of new Set(getEvidenceSkuCandidates(entry))) {
      if (ambiguousSkuTokens.has(sku)) continue;
      const existing = bySku.get(sku);
      if (!existing) {
        bySku.set(sku, entry);
      } else if (existing !== entry) {
        // SKU/model tokens are only a fallback path. Some legitimate AO bundles
        // and add-ons normalize to the same token (for example WTP-357B and
        // WTP357B), but they still have distinct product ids. Treat that token
        // as ambiguous instead of throwing either product away.
        bySku.delete(sku);
        ambiguousSkuTokens.add(sku);
        break;
      }
    }
  }

  return { byProductId, bySku, duplicateEntries, ambiguousSkuTokens };
}

function findEvidenceForProduct(product, evidenceIndex) {
  const productId = product?.id || product?.slug;
  if (productId && evidenceIndex.byProductId.has(String(productId))) {
    return evidenceIndex.byProductId.get(String(productId));
  }

  const skuCandidates = [
    product?.model,
    product?.sku,
    product?.id,
    product?.slug
  ].map(normalizeToken).filter(Boolean);

  for (const sku of skuCandidates) {
    if (evidenceIndex.bySku.has(sku)) return evidenceIndex.bySku.get(sku);
  }

  return null;
}

function findManifestEntryForEvidence(evidence, manifest) {
  const products = manifest?.products || {};
  if (evidence?.product_id && products[String(evidence.product_id)]) {
    return products[String(evidence.product_id)];
  }

  const evidenceSkus = new Set(getEvidenceSkuCandidates(evidence));
  if (evidenceSkus.size === 0) return null;

  return Object.values(products).find((entry) => {
    const entrySkus = [
      entry?.model,
      entry?.sku,
      entry?.product?.model,
      entry?.product?.sku
    ].map(normalizeToken).filter(Boolean);
    return entrySkus.some((sku) => evidenceSkus.has(sku));
  }) || null;
}

function mergeEvidenceIntoProduct(product, evidence) {
  const extracted = evidence?.extracted || {};
  const dimensions = extracted.dimensions || {};
  const clearanceRequirements = extracted.clearance_requirements || {};
  const flags = extracted.flags || {};
  const metadata = extracted.metadata || {};
  const dataSource = evidence?.data_source || metadata.data_source || 'official_pdf';
  const hasPdfEvidence = typeof evidence?.has_pdf_evidence === 'boolean'
    ? evidence.has_pdf_evidence
    : (typeof metadata.has_pdf_evidence === 'boolean' ? metadata.has_pdf_evidence : dataSource === 'official_pdf');

  return {
    ...product,
    w: dimensions.width_mm,
    h: dimensions.height_mm,
    d: dimensions.depth_mm,
    dimensions: { ...dimensions },
    clearance_requirements: { ...clearanceRequirements },
    flags: { ...flags },
    data_source: dataSource,
    evidence: {
      ...(product.evidence && typeof product.evidence === 'object' && !Array.isArray(product.evidence)
        ? product.evidence
        : {}),
      has_pdf_evidence: hasPdfEvidence,
      source_url: evidence.source_url || metadata.source_pdf_url || null,
      verified_at: evidence.verified_at || String(metadata.extraction_date || '').slice(0, 10) || null,
      confidence_score: metadata.confidence_score ?? null,
      ...(metadata.verified_alias ? { verified_alias: metadata.verified_alias } : {}),
      ...(metadata.source_type ? { source_type: metadata.source_type } : {}),
      ...(metadata.dimension_source ? { dimension_source: metadata.dimension_source } : {}),
      ...(metadata.clearance_source ? { clearance_source: metadata.clearance_source } : {}),
      ...(metadata.notes ? { notes: metadata.notes } : {}),
      raw_json_path: evidence.raw_json_path
    }
  };
}

function isDiscoveryManifestEntry(entry) {
  return Boolean(entry?.product && entry?.discovery?.retailer_key);
}

function isManualCatalogEntry(entry) {
  return Boolean(entry?.manual_catalog_entry === true && entry?.product);
}

function buildDiscoveryProductFromEvidence(evidence, manifestEntry) {
  if (!isDiscoveryManifestEntry(manifestEntry)) return null;
  const product = {
    ...(manifestEntry.product || {}),
    id: evidence.product_id || manifestEntry.product.id,
    cat: manifestEntry.category || manifestEntry.product.cat || String(evidence.extracted?.category || '').toLowerCase(),
    brand: manifestEntry.brand || manifestEntry.product.brand || evidence.brand,
    model: manifestEntry.model || manifestEntry.product.model || evidence.model || evidence.extracted?.sku,
    unavailable: false,
    retailers: Array.isArray(manifestEntry.product?.retailers) ? manifestEntry.product.retailers : []
  };

  return mergeEvidenceIntoProduct(product, evidence);
}

function buildManualCatalogProductFromEvidence(evidence, manifestEntry) {
  if (!isManualCatalogEntry(manifestEntry)) return null;
  const product = {
    ...(manifestEntry.product || {}),
    id: evidence.product_id || manifestEntry.product.id,
    cat: manifestEntry.category || manifestEntry.product.cat || String(evidence.extracted?.category || '').toLowerCase(),
    brand: manifestEntry.brand || manifestEntry.product.brand || evidence.brand,
    model: manifestEntry.model || manifestEntry.product.model || evidence.model || evidence.extracted?.sku,
    unavailable: manifestEntry.product.unavailable !== false,
    retailers: Array.isArray(manifestEntry.product?.retailers) ? manifestEntry.product.retailers : []
  };

  return mergeEvidenceIntoProduct(product, evidence);
}

function buildCatalogProductFromEvidence(entry, manifestEntry) {
  return buildDiscoveryProductFromEvidence(entry, manifestEntry)
    || buildManualCatalogProductFromEvidence(entry, manifestEntry);
}

function buildSummary({ products, evidenceEntries, mergedProducts, unmatchedEvidence, duplicateEvidence }) {
  const activeProducts = products.filter((product) => product.unavailable === false).length;
  const officialPdfProducts = mergedProducts.length;
  return {
    total_products: products.length,
    active_products: activeProducts,
    evidence_files: evidenceEntries.length,
    merged_products: officialPdfProducts,
    unmatched_evidence_files: unmatchedEvidence.length,
    duplicate_evidence_files: duplicateEvidence.length,
    categories: Object.fromEntries(
      CATALOG_FILES.map(([category]) => [
        category,
        products.filter((product) => product.cat === category).length
      ])
    ),
    official_pdf_by_category: Object.fromEntries(
      CATALOG_FILES.map(([category]) => [
        category,
        mergedProducts.filter((product) => product.cat === category).length
      ])
    )
  };
}

function buildFinalCatalog({
  repoRoot = process.cwd(),
  evidenceDir = path.join(repoRoot, DEFAULT_EVIDENCE_DIR)
} = {}) {
  const products = loadRuntimeCatalog(repoRoot);
  const manualEvidence = loadManualEvidenceManifest(repoRoot);
  const evidenceEntries = loadRawEvidenceEntries({ repoRoot, evidenceDir });
  const evidenceIndex = buildEvidenceIndex(evidenceEntries);
  const usedEvidencePaths = new Set();
  const existingProductTokens = new Set(products.flatMap((product) => [
    normalizeToken(product.id),
    normalizeToken(product.model),
    normalizeToken(product.sku)
  ].filter(Boolean)));

  const baseProducts = products.map((product) => {
    const evidence = findEvidenceForProduct(product, evidenceIndex);
    if (!evidence) return { ...product };
    if (usedEvidencePaths.has(evidence.raw_json_path)) return { ...product };
    usedEvidencePaths.add(evidence.raw_json_path);
    return mergeEvidenceIntoProduct(product, evidence);
  });

  const discoveryProducts = evidenceEntries
    .filter((entry) => !usedEvidencePaths.has(entry.raw_json_path))
    .filter((entry) => !evidenceIndex.duplicateEntries.some((duplicate) => duplicate.raw_json_path === entry.raw_json_path))
    .map((entry) => ({
      entry,
      manifestEntry: findManifestEntryForEvidence(entry, manualEvidence)
    }))
    .map(({ entry, manifestEntry }) => buildCatalogProductFromEvidence(entry, manifestEntry))
    .filter(Boolean)
    .filter((product) => {
      const tokens = [
        normalizeToken(product.id),
        normalizeToken(product.model),
        normalizeToken(product.sku)
      ].filter(Boolean);
      if (tokens.some((token) => existingProductTokens.has(token))) return false;
      tokens.forEach((token) => existingProductTokens.add(token));
      usedEvidencePaths.add(product.evidence.raw_json_path);
      return true;
    });

  const finalProducts = [...baseProducts, ...discoveryProducts];

  const mergedProducts = finalProducts.filter((product) => product.data_source === 'official_pdf');
  const unmatchedEvidence = evidenceEntries
    .filter((entry) => !usedEvidencePaths.has(entry.raw_json_path))
    .filter((entry) => !evidenceIndex.duplicateEntries.some((duplicate) => duplicate.raw_json_path === entry.raw_json_path))
    .map((entry) => ({
      raw_json_path: entry.raw_json_path,
      product_id: entry.product_id || null,
      model: entry.model || entry.extracted?.sku || null,
      category: entry.category || String(entry.extracted?.category || '').toLowerCase() || null
    }));
  const duplicateEvidence = evidenceIndex.duplicateEntries.map((entry) => ({
    raw_json_path: entry.raw_json_path,
    product_id: entry.product_id || null,
    model: entry.model || entry.extracted?.sku || null,
    category: entry.category || String(entry.extracted?.category || '').toLowerCase() || null
  }));
  const latestVerifiedAt = uniqueSorted(
    evidenceEntries.map((entry) => entry.verified_at || String(entry.extracted?.metadata?.extraction_date || '').slice(0, 10))
  ).at(-1) || null;
  const summary = buildSummary({
    products: finalProducts,
    evidenceEntries,
    mergedProducts,
    unmatchedEvidence,
    duplicateEvidence
  });

  return {
    catalog: {
      schema_version: 1,
      source: 'fitappliance-pdf-evidence-merge',
      generated_from: {
        catalog_files: CATALOG_FILES.map(([, fileName]) => toSlashPath(path.join('public', 'data', fileName))),
        evidence_dir: toSlashPath(path.relative(repoRoot, evidenceDir) || DEFAULT_EVIDENCE_DIR)
      },
      latest_verified_at: latestVerifiedAt,
      summary,
      unmatched_evidence: unmatchedEvidence,
      duplicate_evidence: duplicateEvidence,
      products: finalProducts
    },
    summary
  };
}

function runMerge({
  repoRoot = process.cwd(),
  evidenceDir = path.join(repoRoot, DEFAULT_EVIDENCE_DIR),
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH)
} = {}) {
  const result = buildFinalCatalog({ repoRoot, evidenceDir });
  writeJson(outputPath, result.catalog);
  return {
    outputPath,
    summary: result.summary,
    catalog: result.catalog
  };
}

function printSummary(result) {
  console.log(`catalog-final written: ${result.outputPath}`);
  console.log(`products: ${result.summary.total_products}`);
  console.log(`evidence files: ${result.summary.evidence_files}`);
  console.log(`merged products: ${result.summary.merged_products}`);
  console.log(`unmatched evidence files: ${result.summary.unmatched_evidence_files}`);
  console.log(`duplicate evidence files: ${result.summary.duplicate_evidence_files}`);
  console.log(`official PDF by category: ${JSON.stringify(result.summary.official_pdf_by_category)}`);
}

if (require.main === module) {
  const result = runMerge();
  printSummary(result);
}

exports.buildFinalCatalog = buildFinalCatalog;
exports.mergeEvidenceIntoProduct = mergeEvidenceIntoProduct;
exports.runMerge = runMerge;
exports.loadRawEvidenceEntries = loadRawEvidenceEntries;
exports.loadRuntimeCatalog = loadRuntimeCatalog;
exports.findEvidenceForProduct = findEvidenceForProduct;
exports.buildDiscoveryProductFromEvidence = buildDiscoveryProductFromEvidence;
exports.buildManualCatalogProductFromEvidence = buildManualCatalogProductFromEvidence;
