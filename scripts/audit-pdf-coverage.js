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
  if (!entry) return false;
  return entry.has_pdf_evidence === true || entry.status === 'verified';
}

function isVerifiedByRuntimeProduct(product) {
  return product?.evidence?.has_pdf_evidence === true
    || product?.data_source === 'official_pdf'
    || product?.metadata?.source_type === 'official_pdf';
}

function isPdfVerified(product, evidenceIndex) {
  return isVerifiedByEvidenceIndex(product, evidenceIndex) || isVerifiedByRuntimeProduct(product);
}

function buildPdfCoverageRows(products, evidenceIndex = {}) {
  const byBrand = new Map();

  for (const product of products) {
    const brand = productBrand(product);
    const current = byBrand.get(brand) || { brand, total: 0, verified: 0, missing: 0, coverage: 0 };
    const verified = isPdfVerified(product, evidenceIndex);
    const next = {
      ...current,
      total: current.total + 1,
      verified: current.verified + (verified ? 1 : 0)
    };
    next.missing = next.total - next.verified;
    next.coverage = next.total === 0 ? 0 : (next.verified / next.total) * 100;
    byBrand.set(brand, next);
  }

  return [...byBrand.values()]
    .map((row) => ({
      ...row,
      coverage: Math.round(row.coverage * 10) / 10
    }))
    .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
}

function renderPdfCoverageMarkdown(rows, { generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const totals = rows.reduce((acc, row) => ({
    total: acc.total + row.total,
    verified: acc.verified + row.verified,
    missing: acc.missing + row.missing
  }), { total: 0, verified: 0, missing: 0 });
  const totalCoverage = totals.total === 0 ? 0 : (totals.verified / totals.total) * 100;

  const lines = [
    '# Full Catalog PDF Coverage Audit',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total SKUs: ${totals.total}`,
    `- Verified with PDF evidence: ${totals.verified}`,
    `- Missing PDF evidence: ${totals.missing}`,
    `- Overall coverage: ${totalCoverage.toFixed(1)}%`,
    '',
    '## Coverage By Brand',
    '',
    '| Brand | Total SKUs | Verified (PDF) | Missing PDF | Coverage % |',
    '|---|---:|---:|---:|---:|'
  ];

  for (const row of rows) {
    lines.push(`| ${row.brand} | ${row.total} | ${row.verified} | ${row.missing} | ${row.coverage.toFixed(1)}% |`);
  }

  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Catalog source: `data/catalog-final.json`.');
  lines.push('- Evidence source: `data/evidence-index.json` when present, otherwise `public/data/evidence-index.json`.');
  lines.push('- A SKU is counted as verified when the evidence index marks it `verified` / `has_pdf_evidence: true`, or when the runtime product carries `evidence.has_pdf_evidence: true` / `data_source: "official_pdf"`.');
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
    verified: acc.verified + row.verified,
    missing: acc.missing + row.missing
  }), { total: 0, verified: 0, missing: 0 });

  return { rows, totals, outputPath, evidenceIndexPath, catalogPath };
}

function main() {
  const result = auditPdfCoverage();
  console.log(`PDF coverage audit written: ${path.relative(repoRoot, result.outputPath)}`);
  console.log(`Verified ${result.totals.verified}/${result.totals.total} SKUs`);
}

if (require.main === module) {
  main();
}

module.exports = {
  auditPdfCoverage,
  buildPdfCoverageRows,
  isPdfVerified,
  normalizeProducts,
  renderPdfCoverageMarkdown,
  resolveEvidenceIndexPath
};
