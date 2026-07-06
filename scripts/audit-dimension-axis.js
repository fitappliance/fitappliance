#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

const PRODUCT_DATA_FILES = Object.freeze([
  { cat: 'fridge', file: 'public/data/fridges.json' },
  { cat: 'dishwasher', file: 'public/data/dishwashers.json' },
  { cat: 'dryer', file: 'public/data/dryers.json' },
  { cat: 'washing_machine', file: 'public/data/washing-machines.json' }
]);

const DIMENSION_FIELDS = Object.freeze(['w', 'h', 'd']);
const DIMENSION_LABELS = Object.freeze({ w: 'width', h: 'height', d: 'depth' });
const DRIFT_THRESHOLD_MM = 5;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== null && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function loadRuntimeProducts(repoRoot = REPO_ROOT) {
  return PRODUCT_DATA_FILES.flatMap(({ file }) => {
    const document = readJson(path.join(repoRoot, file), { products: [] });
    const products = Array.isArray(document.products) ? document.products : [];
    return products.map((product) => ({ ...product }));
  });
}

function loadCatalogFinalByProductId(repoRoot = REPO_ROOT) {
  const document = readJson(path.join(repoRoot, 'data', 'catalog-final.json'), { products: [] });
  const rows = Array.isArray(document.products) ? document.products : [];
  return new Map(rows.map((product) => [product.id, product]));
}

function loadRawEvidenceByProductId(repoRoot = REPO_ROOT) {
  const evidenceDir = path.join(repoRoot, 'data', 'pdf-evidence-raw');
  if (!fs.existsSync(evidenceDir)) return new Map();

  const entries = fs.readdirSync(evidenceDir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  const byProductId = new Map();

  for (const file of entries) {
    const raw = readJson(path.join(evidenceDir, file), null);
    const productId = String(raw?.product_id ?? '').trim();
    if (!productId || byProductId.has(productId)) continue;
    byProductId.set(productId, raw);
  }

  return byProductId;
}

function rawEvidenceDimensions(raw) {
  const dimensions = raw?.extracted?.dimensions ?? {};
  const dims = {
    w: asNumber(dimensions.width_mm),
    h: asNumber(dimensions.height_mm),
    d: asNumber(dimensions.depth_mm)
  };

  if (!DIMENSION_FIELDS.every((field) => isFinitePositiveNumber(dims[field]))) {
    return null;
  }

  return dims;
}

function productDimensions(product) {
  const dims = {
    w: asNumber(product?.w),
    h: asNumber(product?.h),
    d: asNumber(product?.d)
  };

  if (!DIMENSION_FIELDS.every((field) => isFinitePositiveNumber(dims[field]))) {
    return null;
  }

  return dims;
}

function rawEvidenceConfidence(raw) {
  const direct = asNumber(raw?.extracted?.metadata?.confidence_score);
  if (direct !== null) return direct;
  const fallback = asNumber(raw?.extracted?.confidence_score ?? raw?.confidence_score);
  return fallback;
}

function hasVerifiedCatalogDimensions(product) {
  const evidence = product?.evidence;
  if (!evidence || typeof evidence !== 'object') return false;
  if (typeof evidence.raw_json_path === 'string' && evidence.raw_json_path.trim()) return true;
  if (Number(evidence.confidence_score) >= 0.8) return true;
  return Array.isArray(evidence.verified_fields) && evidence.verified_fields.includes('dimensions');
}

function dimensionDiffs(left, right) {
  return DIMENSION_FIELDS
    .map((field) => ({
      field,
      label: DIMENSION_LABELS[field],
      left: left[field],
      right: right[field],
      differenceMm: Math.abs(left[field] - right[field])
    }))
    .filter((row) => row.differenceMm >= DRIFT_THRESHOLD_MM);
}

function isSwappedWidthHeight(productDims, referenceDims) {
  return (
    productDims.w === referenceDims.h &&
    productDims.h === referenceDims.w &&
    productDims.d === referenceDims.d
  );
}

function featureText(product) {
  return Array.isArray(product?.features) ? product.features.join(' ') : String(product?.features ?? '');
}

function isChestLike(product) {
  return /\bchest\b/i.test(featureText(product));
}

function shouldWarnUprightFridgeShape(product, dims) {
  if (product?.cat !== 'fridge') return false;
  if (isChestLike(product)) return false;
  return dims.w > dims.h && dims.h < 1000;
}

function issue({ severity, code, product, message, field = null, source = null, diffs = [] }) {
  return {
    severity,
    code,
    productId: product?.id ?? null,
    cat: product?.cat ?? null,
    brand: product?.brand ?? null,
    model: product?.model ?? null,
    field,
    source,
    dimensions: {
      w: product?.w ?? null,
      h: product?.h ?? null,
      d: product?.d ?? null
    },
    diffs,
    message
  };
}

function findDimensionAxisIssues({
  products = [],
  rawEvidenceByProductId = new Map(),
  catalogFinalByProductId = new Map()
} = {}) {
  const issues = [];

  for (const product of products) {
    const dims = productDimensions(product);
    if (!dims) continue;

    let hasBlocker = false;
    const raw = rawEvidenceByProductId.get(product.id);
    const rawDims = rawEvidenceDimensions(raw);

    if (rawDims) {
      const diffs = dimensionDiffs(dims, rawDims);
      if (isSwappedWidthHeight(dims, rawDims)) {
        hasBlocker = true;
        issues.push(issue({
          severity: 'blocker',
          code: 'swapped_against_raw_evidence',
          product,
          source: raw?.source_url ?? raw?.extracted?.metadata?.source_pdf_url ?? null,
          diffs,
          message: `${product.id} runtime dimensions look width/height swapped against raw PDF evidence`
        }));
      } else if (diffs.length > 0) {
        hasBlocker = true;
        issues.push(issue({
          severity: 'blocker',
          code: 'dimension_mismatch_raw_evidence',
          product,
          source: raw?.source_url ?? raw?.extracted?.metadata?.source_pdf_url ?? null,
          diffs,
          message: `${product.id} runtime dimensions differ from raw PDF evidence by at least ${DRIFT_THRESHOLD_MM}mm`
        }));
      }
    }

    const catalogProduct = catalogFinalByProductId.get(product.id);
    const catalogDims = productDimensions(catalogProduct);
    if (!hasBlocker && catalogDims && hasVerifiedCatalogDimensions(catalogProduct)) {
      const diffs = dimensionDiffs(dims, catalogDims);
      if (diffs.length > 0) {
        hasBlocker = true;
        issues.push(issue({
          severity: 'blocker',
          code: 'runtime_catalog_final_dimension_drift',
          product,
          source: catalogProduct?.evidence?.raw_json_path ?? 'data/catalog-final.json',
          diffs,
          message: `${product.id} runtime dimensions differ from verified catalog-final dimensions`
        }));
      }
    }

    if (!hasBlocker && shouldWarnUprightFridgeShape(product, dims)) {
      issues.push(issue({
        severity: 'warning',
        code: 'upright_fridge_width_gt_height_review',
        product,
        field: 'w,h',
        message: `${product.id} is an upright fridge where width is greater than height; review before GEO treatment`
      }));
    }
  }

  return issues.sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity) ||
    String(left.productId).localeCompare(String(right.productId)) ||
    left.code.localeCompare(right.code)
  ));
}

function severityRank(severity) {
  if (severity === 'blocker') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function summarizeDimensionAxisIssues(issues = []) {
  return {
    issueCount: issues.length,
    blockerCount: issues.filter((row) => row.severity === 'blocker').length,
    warningCount: issues.filter((row) => row.severity === 'warning').length,
    rawEvidenceBlockers: issues.filter((row) => row.code === 'swapped_against_raw_evidence' || row.code === 'dimension_mismatch_raw_evidence').length,
    catalogFinalDriftBlockers: issues.filter((row) => row.code === 'runtime_catalog_final_dimension_drift').length,
    shapeReviewWarnings: issues.filter((row) => row.code === 'upright_fridge_width_gt_height_review').length
  };
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '_None._\n';
  const header = `| ${columns.map((column) => column.label).join(' |')} |`;
  const divider = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? '').replace(/\|/g, '\\|')).join(' |')} |`);
  return [header, divider, ...body].join('\n') + '\n';
}

function formatDiffs(diffs = []) {
  if (diffs.length === 0) return '';
  return diffs.map((row) => `${row.field}: runtime ${row.left}, source ${row.right}`).join('; ');
}

function buildMarkdownReport({ issues = [], generatedAt = new Date().toISOString() } = {}) {
  const summary = summarizeDimensionAxisIssues(issues);
  const blockers = issues.filter((row) => row.severity === 'blocker');
  const warnings = issues.filter((row) => row.severity === 'warning');

  return [
    '# Dimension Axis Audit',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Summary',
    '',
    `- Issues: ${summary.issueCount}`,
    `- Blockers: ${summary.blockerCount}`,
    `- Warnings: ${summary.warningCount}`,
    `- Raw evidence blockers: ${summary.rawEvidenceBlockers}`,
    `- Catalog-final drift blockers: ${summary.catalogFinalDriftBlockers}`,
    `- Shape review warnings: ${summary.shapeReviewWarnings}`,
    '',
    '## Blockers',
    '',
    markdownTable(blockers.slice(0, 80), [
      { label: 'code', value: (row) => row.code },
      { label: 'product', value: (row) => row.productId },
      { label: 'brand', value: (row) => row.brand },
      { label: 'model', value: (row) => row.model },
      { label: 'dims', value: (row) => `w=${row.dimensions.w} h=${row.dimensions.h} d=${row.dimensions.d}` },
      { label: 'source diff', value: (row) => formatDiffs(row.diffs) }
    ]),
    '## Warnings',
    '',
    markdownTable(warnings.slice(0, 80), [
      { label: 'code', value: (row) => row.code },
      { label: 'product', value: (row) => row.productId },
      { label: 'brand', value: (row) => row.brand },
      { label: 'model', value: (row) => row.model },
      { label: 'message', value: (row) => row.message }
    ]),
    '## Operating Decision',
    '',
    '- Blockers must be fixed before publishing GEO treatment pages or new fit-check pages.',
    '- Shape warnings are review queues; they should not block normal builds unless promoted deliberately.',
    '- Prefer verified raw evidence or `data/catalog-final.json` rows with dimension evidence over runtime public JSON when they disagree.',
    ''
  ].join('\n');
}

function writeDimensionAxisReports({
  issues = [],
  outputDir = path.join(REPO_ROOT, 'reports', 'dimension-axis'),
  generatedAt = new Date().toISOString()
} = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const report = {
    schema_version: 1,
    generatedAt,
    summary: summarizeDimensionAxisIssues(issues),
    issues
  };
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdownReport({ issues, generatedAt }));
  return { jsonPath, markdownPath };
}

function auditDimensionAxis({
  repoRoot = REPO_ROOT,
  products = null,
  rawEvidenceByProductId = null,
  catalogFinalByProductId = null
} = {}) {
  const rows = products ?? loadRuntimeProducts(repoRoot);
  const rawEvidence = rawEvidenceByProductId ?? loadRawEvidenceByProductId(repoRoot);
  const catalogFinal = catalogFinalByProductId ?? loadCatalogFinalByProductId(repoRoot);
  const issues = findDimensionAxisIssues({
    products: rows,
    rawEvidenceByProductId: rawEvidence,
    catalogFinalByProductId: catalogFinal
  });

  return {
    schema_version: 1,
    generatedAt: new Date().toISOString(),
    summary: summarizeDimensionAxisIssues(issues),
    issues
  };
}

function parseArgs(argv) {
  return argv.reduce((options, arg, index, all) => {
    if (arg === '--strict') return { ...options, strict: true };
    if (arg === '--no-write') return { ...options, write: false };
    if (arg === '--output-dir') return { ...options, outputDir: all[index + 1] };
    if (arg.startsWith('--output-dir=')) return { ...options, outputDir: arg.slice('--output-dir='.length) };
    return options;
  }, {
    strict: false,
    write: true,
    outputDir: path.join(REPO_ROOT, 'reports', 'dimension-axis')
  });
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const report = auditDimensionAxis();
  if (options.write) {
    const outputs = writeDimensionAxisReports({
      issues: report.issues,
      outputDir: options.outputDir,
      generatedAt: report.generatedAt
    });
    console.log(`[audit-dimension-axis] wrote ${path.relative(REPO_ROOT, outputs.jsonPath)} and ${path.relative(REPO_ROOT, outputs.markdownPath)}`);
  } else {
    console.log(JSON.stringify({ summary: report.summary }, null, 2));
  }

  if (options.strict && report.summary.blockerCount > 0) {
    console.error(`[audit-dimension-axis] strict mode failed: ${report.summary.blockerCount} blocker(s)`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DRIFT_THRESHOLD_MM,
  PRODUCT_DATA_FILES,
  auditDimensionAxis,
  buildMarkdownReport,
  findDimensionAxisIssues,
  loadCatalogFinalByProductId,
  loadRawEvidenceByProductId,
  loadRuntimeProducts,
  rawEvidenceConfidence,
  rawEvidenceDimensions,
  summarizeDimensionAxisIssues,
  writeDimensionAxisReports
};
