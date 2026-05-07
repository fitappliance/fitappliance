'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateApplianceDimension } = require('./pdf-pipeline/4-validate');

const REPO_ROOT = path.resolve(__dirname, '..');
const PDF_EVIDENCE_TYPES = new Set(['manufacturer_manual', 'installation_manual', 'spec_sheet']);
const PRODUCT_DATA_FILES = [
  { category: 'fridge', file: 'public/data/fridges.json' },
  { category: 'dishwasher', file: 'public/data/dishwashers.json' },
  { category: 'dryer', file: 'public/data/dryers.json' },
  { category: 'washing_machine', file: 'public/data/washing-machines.json' },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function loadCatalog(repoRoot = REPO_ROOT) {
  return PRODUCT_DATA_FILES.flatMap(({ category, file }) => {
    const document = readJson(path.join(repoRoot, file));
    return (document.products || []).map((product) => ({
      ...product,
      cat: product.cat || category,
    }));
  });
}

function loadManualEvidence(repoRoot = REPO_ROOT) {
  const filePath = path.join(repoRoot, 'data/manual-evidence.json');
  if (!fs.existsSync(filePath)) return { products: {} };
  return readJson(filePath);
}

function validateCatalogDimensionShape(product = {}) {
  const errors = [];
  if (!String(product.id || '').trim()) errors.push('id is required');
  if (!String(product.cat || '').trim()) errors.push('cat is required');
  if (!String(product.brand || '').trim()) errors.push('brand is required');
  if (!String(product.model || '').trim()) errors.push('model is required');
  for (const key of ['w', 'h', 'd']) {
    if (!isPositiveInt(product[key])) errors.push(`${key} must be a positive integer mm value`);
  }
  return { valid: errors.length === 0, errors };
}

function hasApprovedPdfEvidence(entry = {}) {
  const safeEntry = entry || {};
  return Array.isArray(safeEntry.evidence) && safeEntry.evidence.some((evidence) => {
    return PDF_EVIDENCE_TYPES.has(evidence?.type)
      && evidence.status === 'approved'
      && isHttpUrl(evidence.source_url);
  });
}

function getApprovedPdfEvidence(entry = {}) {
  const safeEntry = entry || {};
  if (!Array.isArray(safeEntry.evidence)) return [];
  return safeEntry.evidence.filter((evidence) => {
    return PDF_EVIDENCE_TYPES.has(evidence?.type)
      && evidence.status === 'approved'
      && isHttpUrl(evidence.source_url);
  });
}

function getStrictPayload(evidence = {}) {
  return evidence.extracted
    || evidence.appliance_dimension
    || evidence.applianceDimension
    || evidence.strict_json
    || evidence.strictJson
    || evidence.data
    || null;
}

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function retailerCount(product = {}) {
  return Array.isArray(product.retailers) ? product.retailers.length : 0;
}

function makeReviewQueueEntry(product, shape, reason = 'missing_approved_pdf_evidence') {
  return {
    id: product.id,
    cat: product.cat,
    brand: product.brand,
    model: product.model,
    retailerCount: retailerCount(product),
    priorityScore: normalizeNumber(product.priorityScore),
    reason,
    shapeValid: shape.valid,
    shapeErrors: shape.errors,
  };
}

function sortReviewQueue(a, b) {
  return (b.retailerCount > 0) - (a.retailerCount > 0)
    || b.retailerCount - a.retailerCount
    || b.priorityScore - a.priorityScore
    || String(a.id).localeCompare(String(b.id));
}

function emptyCategorySummary() {
  return {
    totalProducts: 0,
    shapeValid: 0,
    approvedPdfEvidenceProducts: 0,
    missingPdfEvidenceProducts: 0,
    strictEvidenceValid: 0,
    strictEvidenceInvalid: 0,
    catalogPdfDimensionMismatches: 0,
  };
}

function compareCatalogToStrictDimensions(product = {}, strictData = {}) {
  const dimensions = strictData.dimensions || {};
  const checks = [
    ['width', product.w, dimensions.width_mm],
    ['height', product.h, dimensions.height_mm],
    ['depth', product.d, dimensions.depth_mm],
  ];
  return checks
    .filter(([, catalogValue, pdfValue]) => catalogValue !== pdfValue)
    .map(([axis, catalogValue, pdfValue]) => ({ axis, catalogValue, pdfValue }));
}

function auditPdfEvidenceCoverage({
  products,
  manualEvidence,
  repoRoot = REPO_ROOT,
  now = new Date(),
  reviewQueueLimit = 50,
} = {}) {
  const allProducts = products || loadCatalog(repoRoot);
  const evidenceDocument = manualEvidence || loadManualEvidence(repoRoot);
  const evidenceProducts = evidenceDocument.products || {};
  const runAt = typeof now === 'string' ? now : now.toISOString();
  const summary = {
    runAt,
    totalProducts: 0,
    catalogDimensionShapeValid: 0,
    catalogDimensionShapeInvalid: 0,
    approvedPdfEvidenceProducts: 0,
    missingPdfEvidenceProducts: 0,
    strictEvidenceValid: 0,
    strictEvidenceInvalid: 0,
    catalogPdfDimensionMismatches: 0,
  };
  const byCategory = {};
  const issues = [];
  const reviewQueue = [];

  for (const product of allProducts) {
    const category = product.cat || 'unknown';
    byCategory[category] = byCategory[category] || emptyCategorySummary();
    byCategory[category].totalProducts += 1;
    summary.totalProducts += 1;

    const shape = validateCatalogDimensionShape(product);
    if (shape.valid) {
      summary.catalogDimensionShapeValid += 1;
      byCategory[category].shapeValid += 1;
    } else {
      summary.catalogDimensionShapeInvalid += 1;
      issues.push({
        code: 'catalog_dimension_shape_invalid',
        productId: product.id,
        errors: shape.errors,
      });
    }

    const evidenceEntry = evidenceProducts[product.id] || evidenceProducts[product.slug] || null;
    const approvedEvidence = getApprovedPdfEvidence(evidenceEntry);
    if (approvedEvidence.length === 0) {
      summary.missingPdfEvidenceProducts += 1;
      byCategory[category].missingPdfEvidenceProducts += 1;
      reviewQueue.push(makeReviewQueueEntry(product, shape));
      continue;
    }

    summary.approvedPdfEvidenceProducts += 1;
    byCategory[category].approvedPdfEvidenceProducts += 1;

    for (const evidence of approvedEvidence) {
      const payload = getStrictPayload(evidence);
      if (!payload) continue;
      const result = validateApplianceDimension(payload);
      if (result.valid) {
        summary.strictEvidenceValid += 1;
        byCategory[category].strictEvidenceValid += 1;
        const differences = compareCatalogToStrictDimensions(product, result.data);
        if (differences.length > 0) {
          summary.catalogPdfDimensionMismatches += 1;
          byCategory[category].catalogPdfDimensionMismatches += 1;
          issues.push({
            code: 'catalog_pdf_dimension_mismatch',
            productId: product.id,
            sourceUrl: evidence.source_url,
            differences,
          });
        }
      } else {
        summary.strictEvidenceInvalid += 1;
        byCategory[category].strictEvidenceInvalid += 1;
        issues.push({
          code: 'strict_evidence_invalid',
          productId: product.id,
          sourceUrl: evidence.source_url,
          errors: result.errors,
        });
      }
    }
  }

  reviewQueue.sort(sortReviewQueue);

  return {
    schema_version: 1,
    runAt,
    summary,
    byCategory,
    reviewQueueCount: reviewQueue.length,
    reviewQueue: reviewQueue.slice(0, reviewQueueLimit),
    issues,
    notes: [
      'Shape-valid catalog rows are not PDF-verified rows.',
      'Only approved manufacturer manuals, installation manuals, and spec sheets count as PDF evidence.',
      'Retailer product pages can support availability, but they do not satisfy manufacturer-dimension evidence.',
    ],
  };
}

function buildMarkdownReport(report) {
  const lines = [
    '# PDF Evidence Coverage Audit',
    '',
    `Run at: ${report.runAt}`,
    '',
    '## Important interpretation',
    '',
    '**Shape-valid catalog rows are not PDF-verified rows.** Existing `w/h/d` catalog values can be structurally usable while still lacking manufacturer PDF evidence.',
    '',
    '## Summary',
    '',
    `- Total products: ${report.summary.totalProducts}`,
    `- Catalog rows with valid dimension shape: ${report.summary.catalogDimensionShapeValid}`,
    `- Catalog rows with invalid dimension shape: ${report.summary.catalogDimensionShapeInvalid}`,
    `- Products with approved manufacturer/spec PDF evidence: ${report.summary.approvedPdfEvidenceProducts}`,
    `- Products missing approved PDF evidence: ${report.summary.missingPdfEvidenceProducts}`,
    `- Strict extracted evidence valid: ${report.summary.strictEvidenceValid}`,
    `- Strict extracted evidence invalid: ${report.summary.strictEvidenceInvalid}`,
    `- Catalog rows whose dimensions differ from approved PDF evidence: ${report.summary.catalogPdfDimensionMismatches}`,
    '',
    '## Category breakdown',
    '',
    '| Category | Total | Shape valid | PDF evidence | Missing PDF evidence | Strict valid | Strict invalid | PDF mismatch |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const [category, stats] of Object.entries(report.byCategory).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${category} | ${stats.totalProducts} | ${stats.shapeValid} | ${stats.approvedPdfEvidenceProducts} | ${stats.missingPdfEvidenceProducts} | ${stats.strictEvidenceValid} | ${stats.strictEvidenceInvalid} | ${stats.catalogPdfDimensionMismatches} |`);
  }

  lines.push('', '## Top review queue', '');
  if (report.reviewQueue.length === 0) {
    lines.push('No products currently need PDF evidence review.');
  } else {
    lines.push('| Product | Category | Retailers | Priority | Reason |');
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const entry of report.reviewQueue) {
      lines.push(`| ${entry.brand} ${entry.model} (${entry.id}) | ${entry.cat} | ${entry.retailerCount} | ${entry.priorityScore} | ${entry.reason} |`);
    }
  }

  if (report.issues.length > 0) {
    lines.push('', '## Issues', '');
    for (const issue of report.issues.slice(0, 100)) {
      lines.push(`- ${issue.code}: ${issue.productId}${issue.errors ? ` — ${issue.errors.join('; ')}` : ''}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function writePdfEvidenceAuditReports(report, { outputDir = path.join(REPO_ROOT, 'reports') } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const date = String(report.runAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  const jsonPath = path.join(outputDir, `pdf-evidence-audit-${date}.json`);
  const markdownPath = path.join(outputDir, `pdf-evidence-audit-${date}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdownReport(report));
  return { jsonPath, markdownPath };
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--output' || arg === '--output-dir') {
      options.outputDir = args[i + 1];
      i += 1;
    } else if (arg === '--limit') {
      options.reviewQueueLimit = Number(args[i + 1]);
      i += 1;
    }
  }
  return options;
}

function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const report = auditPdfEvidenceCoverage({
    reviewQueueLimit: Number.isFinite(options.reviewQueueLimit) ? options.reviewQueueLimit : 50,
  });
  const outputs = writePdfEvidenceAuditReports(report, {
    outputDir: options.outputDir || path.join(REPO_ROOT, 'reports'),
  });

  console.log(`PDF evidence audit written: ${outputs.jsonPath}`);
  console.log(`Markdown summary written: ${outputs.markdownPath}`);
  console.log(`Products with approved PDF evidence: ${report.summary.approvedPdfEvidenceProducts}/${report.summary.totalProducts}`);
  console.log(`Missing PDF evidence: ${report.summary.missingPdfEvidenceProducts}`);
  return report.summary.strictEvidenceInvalid > 0 || report.summary.catalogDimensionShapeInvalid > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  PRODUCT_DATA_FILES,
  auditPdfEvidenceCoverage,
  buildMarkdownReport,
  hasApprovedPdfEvidence,
  loadCatalog,
  loadManualEvidence,
  validateCatalogDimensionShape,
  writePdfEvidenceAuditReports,
};
