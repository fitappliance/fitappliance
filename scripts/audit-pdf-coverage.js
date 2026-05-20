#!/usr/bin/env node
'use strict';

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function loadJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeProducts(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.products)) return catalog.products;
  if (catalog?.products && typeof catalog.products === 'object') return Object.values(catalog.products);
  return [];
}

function productId(product) {
  return String(product?.id ?? product?.slug ?? product?.product_id ?? '').trim();
}

function productBrand(product) {
  return String(product?.brand ?? 'Unknown').trim() || 'Unknown';
}

function isVerifiedByEvidenceIndex(product, evidenceIndex) {
  const id = productId(product);
  const entry = id ? evidenceIndex?.products?.[id] : null;
  return entry || null;
}

function getRuntimeTrustLevel(product) {
  const explicit = String(product?.evidence?.trust_level || product?.trust_level || '').trim();
  if (['verified_fit', 'dimensions_verified', 'retailer_spec'].includes(explicit)) return explicit;
  if (product?.data_source === 'official_pdf') return 'verified_fit';
  if (product?.data_source === 'official_pdf_dimensions_only' || product?.evidence?.has_pdf_evidence === true) return 'dimensions_verified';
  if (product?.data_source === 'retailer_spec') return 'retailer_spec';
  return 'missing';
}

function getEvidenceTrustLevel(product, evidenceIndex) {
  const entry = isVerifiedByEvidenceIndex(product, evidenceIndex);
  const indexed = String(entry?.trust_level || '').trim();
  if (['verified_fit', 'dimensions_verified', 'retailer_spec'].includes(indexed)) return indexed;
  if (entry?.has_pdf_evidence === true || entry?.status === 'verified') return 'dimensions_verified';
  return getRuntimeTrustLevel(product);
}

function isPdfVerified(product, evidenceIndex) {
  return getEvidenceTrustLevel(product, evidenceIndex) !== 'missing';
}

function buildPdfCoverageRows(products, evidenceIndex = {}) {
  const byBrand = new Map();

  for (const product of products) {
    const brand = productBrand(product);
    const current = byBrand.get(brand) || {
      brand,
      total: 0,
      verified_fit: 0,
      dimensions_verified: 0,
      retailer_spec: 0,
      missing: 0,
      evidenceCoverage: 0,
      verifiedFitCoverage: 0
    };
    const trustLevel = getEvidenceTrustLevel(product, evidenceIndex);
    const next = {
      ...current,
      total: current.total + 1
    };
    if (trustLevel === 'verified_fit') next.verified_fit += 1;
    else if (trustLevel === 'dimensions_verified') next.dimensions_verified += 1;
    else if (trustLevel === 'retailer_spec') next.retailer_spec += 1;
    else next.missing += 1;
    const evidenced = next.verified_fit + next.dimensions_verified + next.retailer_spec;
    next.evidenceCoverage = next.total === 0 ? 0 : (evidenced / next.total) * 100;
    next.verifiedFitCoverage = next.total === 0 ? 0 : (next.verified_fit / next.total) * 100;
    byBrand.set(brand, next);
  }

  return [...byBrand.values()]
    .map((row) => ({
      ...row,
      evidenceCoverage: Math.round(row.evidenceCoverage * 10) / 10,
      verifiedFitCoverage: Math.round(row.verifiedFitCoverage * 10) / 10
    }))
    .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
}

function renderPdfCoverageMarkdown(rows, { generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const totals = rows.reduce((acc, row) => ({
    total: acc.total + row.total,
    verified_fit: acc.verified_fit + row.verified_fit,
    dimensions_verified: acc.dimensions_verified + row.dimensions_verified,
    retailer_spec: acc.retailer_spec + row.retailer_spec,
    missing: acc.missing + row.missing
  }), { total: 0, verified_fit: 0, dimensions_verified: 0, retailer_spec: 0, missing: 0 });
  const evidenced = totals.verified_fit + totals.dimensions_verified + totals.retailer_spec;
  const totalEvidenceCoverage = totals.total === 0 ? 0 : (evidenced / totals.total) * 100;
  const totalVerifiedFitCoverage = totals.total === 0 ? 0 : (totals.verified_fit / totals.total) * 100;

  const lines = [
    '# Full Catalog PDF Coverage Audit',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total SKUs: ${totals.total}`,
    `- Verified Fit: ${totals.verified_fit}`,
    `- Dimensions Verified: ${totals.dimensions_verified}`,
    `- Retailer Spec: ${totals.retailer_spec}`,
    `- Missing evidence: ${totals.missing}`,
    `- Evidence coverage: ${totalEvidenceCoverage.toFixed(1)}%`,
    `- Verified Fit coverage: ${totalVerifiedFitCoverage.toFixed(1)}%`,
    '',
    '## Coverage By Brand',
    '',
    '| Brand | Total SKUs | Verified Fit | Dimensions Verified | Retailer Spec | Missing Evidence | Evidence Coverage % | Verified Fit % |',
    '|---|---:|---:|---:|---:|---:|---:|---:|'
  ];

  for (const row of rows) {
    lines.push(`| ${row.brand} | ${row.total} | ${row.verified_fit} | ${row.dimensions_verified} | ${row.retailer_spec} | ${row.missing} | ${row.evidenceCoverage.toFixed(1)}% | ${row.verifiedFitCoverage.toFixed(1)}% |`);
  }

  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Catalog source: `data/catalog-final.json`.');
  lines.push('- Evidence source: `data/evidence-index.json` when present, otherwise `public/data/evidence-index.json`.');
  lines.push('- Evidence tiers are strict: `Verified Fit` requires explicit dimensions and installation clearance; `Dimensions Verified` means physical dimensions are verified but clearance is estimated; `Retailer Spec` means retailer-sourced dimensions only.');
  lines.push('- Missing evidence means no runtime or evidence-index trust tier is available for that SKU.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function resolveEvidenceIndexPath(root = repoRoot) {
  const dataPath = path.join(root, 'data', 'evidence-index.json');
  if (existsSync(dataPath)) return dataPath;
  return path.join(root, 'public', 'data', 'evidence-index.json');
}

function auditPdfCoverage({
  root = repoRoot,
  catalogPath = path.join(root, 'data', 'catalog-final.json'),
  evidenceIndexPath = resolveEvidenceIndexPath(root),
  outputPath = path.join(root, 'reports', 'FULL-CATALOG-AUDIT.md'),
  generatedAt = new Date().toISOString().slice(0, 10)
} = {}) {
  const catalog = loadJson(catalogPath, { products: [] });
  const evidenceIndex = loadJson(evidenceIndexPath, { products: {} });
  const rows = buildPdfCoverageRows(normalizeProducts(catalog), evidenceIndex);
  const markdown = renderPdfCoverageMarkdown(rows, { generatedAt });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  const totals = rows.reduce((acc, row) => ({
    total: acc.total + row.total,
    verified: acc.verified + row.verified_fit + row.dimensions_verified + row.retailer_spec,
    missing: acc.missing + row.missing
  }), { total: 0, verified: 0, missing: 0 });

  return { rows, totals, outputPath, evidenceIndexPath, catalogPath };
}

function main() {
  const result = auditPdfCoverage();
  const verifiedFit = result.rows.reduce((sum, row) => sum + row.verified_fit, 0);
  console.log(`PDF coverage audit written: ${path.relative(repoRoot, result.outputPath)}`);
  console.log(`Evidence-backed ${result.totals.verified}/${result.totals.total} SKUs`);
  console.log(`Verified Fit ${verifiedFit}/${result.totals.total} SKUs`);
}

if (require.main === module) {
  main();
}

module.exports = {
  auditPdfCoverage,
  buildPdfCoverageRows,
  isPdfVerified,
  getEvidenceTrustLevel,
  normalizeProducts,
  renderPdfCoverageMarkdown,
  resolveEvidenceIndexPath
};
