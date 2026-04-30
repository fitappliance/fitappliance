'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateProduct } = require('./schema.js');

const REPO_ROOT = path.resolve(__dirname, '..');

const PRODUCT_DATA_FILES = [
  { cat: 'fridge', file: 'public/data/fridges.json' },
  { cat: 'dishwasher', file: 'public/data/dishwashers.json' },
  { cat: 'dryer', file: 'public/data/dryers.json' },
  { cat: 'washing_machine', file: 'public/data/washing-machines.json' }
];

const CORE_EVIDENCE_FIELDS = ['brand', 'model', 'w', 'h', 'd', 'kwh_year', 'stars'];
const PRICE_STALE_DAYS = 30;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function daysBetween(left, right) {
  const leftDate = left instanceof Date ? left : new Date(left);
  const rightDate = right instanceof Date ? right : new Date(right);
  if (!Number.isFinite(leftDate.getTime()) || !Number.isFinite(rightDate.getTime())) return null;
  return Math.floor((rightDate.getTime() - leftDate.getTime()) / 86400000);
}

function normalizeBrandKey(brand) {
  return String(brand ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHost(hostname) {
  return String(hostname ?? '').toLowerCase().replace(/^www\./, '');
}

function isRootPath(pathname) {
  const value = String(pathname ?? '').trim();
  return value === '' || value === '/';
}

function hasSearchLikeSignal(parsed) {
  const pathname = parsed.pathname.toLowerCase();
  if (/\/(search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(\/|$)/i.test(pathname)) {
    return true;
  }
  for (const key of parsed.searchParams.keys()) {
    if (/^(q|query|search|searchterm|text|keyword)$/i.test(key)) return true;
  }
  return false;
}

function isRetailerProductPageUrl(url) {
  try {
    const parsed = new URL(String(url ?? '').trim());
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (isRootPath(parsed.pathname)) return false;
    if (hasSearchLikeSignal(parsed)) return false;

    const host = normalizeHost(parsed.hostname);
    const pathname = parsed.pathname.toLowerCase();

    if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
    if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
    if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);

    return false;
  } catch {
    return false;
  }
}

function getRetailerPrice(retailer) {
  const price = Number(retailer?.p ?? retailer?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function hasFieldEvidence(product, field) {
  const evidence = product?.evidence ?? product?.sources ?? product?.source ?? null;
  if (!evidence) return false;
  if (typeof evidence === 'string') return evidence.trim().length > 0;
  if (Array.isArray(evidence)) return evidence.length > 0;
  if (typeof evidence === 'object') {
    return Boolean(evidence[field] || evidence.core || evidence.specs || evidence.manufacturer);
  }
  return false;
}

function issue({ severity, code, product, field = null, retailer = null, message }) {
  return {
    severity,
    code,
    productId: product?.id ?? null,
    cat: product?.cat ?? null,
    brand: product?.brand ?? null,
    model: product?.model ?? null,
    field,
    retailer,
    message
  };
}

function calculateAccuracyGrade({
  hasInvalidRetailerUrl = false,
  hasSchemaError = false,
  hasRetailerProductUrl = false,
  hasFreshPrice = false,
  hasInferredFields = false,
  missingEvidenceCount = 0
} = {}) {
  if (hasInvalidRetailerUrl || hasSchemaError) return 'F';
  if (hasRetailerProductUrl && hasFreshPrice && missingEvidenceCount === 0) return 'A';
  if (hasRetailerProductUrl && hasFreshPrice) return 'A';
  if (hasRetailerProductUrl) return 'B';
  if (hasInferredFields || missingEvidenceCount > 0) return 'C';
  return 'D';
}

function loadCatalog(repoRoot = REPO_ROOT) {
  return PRODUCT_DATA_FILES.flatMap(({ file }) => {
    const document = readJson(path.join(repoRoot, file));
    const products = Array.isArray(document.products) ? document.products : [];
    return products.map((product) => ({ ...product }));
  });
}

function auditDataAccuracy({ products, repoRoot = REPO_ROOT, now = new Date() } = {}) {
  const rows = products ? products.map((product) => ({ ...product })) : loadCatalog(repoRoot);
  const blockers = [];
  const warnings = [];
  const info = [];
  const productGrades = [];
  const brandBuckets = new Map();

  for (const product of rows) {
    const productIssues = {
      hasInvalidRetailerUrl: false,
      hasSchemaError: false,
      hasRetailerProductUrl: false,
      hasFreshPrice: false,
      hasInferredFields: Boolean(product?.inferred_door_swing),
      missingEvidenceCount: 0
    };

    for (const schemaError of validateProduct(product)) {
      productIssues.hasSchemaError = true;
      blockers.push(issue({
        severity: 'blocker',
        code: 'schema_error',
        product,
        message: schemaError
      }));
    }

    const brandKey = normalizeBrandKey(product.brand);
    if (brandKey) {
      const key = `${product.cat}::${brandKey}`;
      const bucket = brandBuckets.get(key) ?? {
        cat: product.cat,
        normalized: brandKey,
        variants: new Set(),
        productIds: []
      };
      bucket.variants.add(String(product.brand).trim());
      bucket.productIds.push(product.id);
      brandBuckets.set(key, bucket);
    }

    for (const field of CORE_EVIDENCE_FIELDS) {
      if (!hasFieldEvidence(product, field)) {
        productIssues.missingEvidenceCount += 1;
      }
    }

    if (productIssues.missingEvidenceCount > 0) {
      warnings.push(issue({
        severity: 'warning',
        code: 'missing_core_field_evidence',
        product,
        field: CORE_EVIDENCE_FIELDS.join(','),
        message: `${productIssues.missingEvidenceCount}/${CORE_EVIDENCE_FIELDS.length} core fields do not expose source evidence yet`
      }));
    }

    const retailers = Array.isArray(product.retailers) ? product.retailers : [];
    for (const retailer of retailers) {
      const retailerName = String(retailer?.n ?? 'Retailer').trim() || 'Retailer';
      const retailerUrl = String(retailer?.url ?? '').trim();
      const isProductUrl = isRetailerProductPageUrl(retailerUrl);
      const price = getRetailerPrice(retailer);
      const verifiedAt = toIsoDate(retailer?.verified_at);

      if (!isProductUrl) {
        productIssues.hasInvalidRetailerUrl = true;
        blockers.push(issue({
          severity: 'blocker',
          code: 'retailer_non_product_url',
          product,
          retailer: retailerName,
          field: 'retailers.url',
          message: `${retailerName} URL is not a verified product page: ${retailerUrl || '<empty>'}`
        }));
      } else {
        productIssues.hasRetailerProductUrl = true;
      }

      if (price !== null && !verifiedAt) {
        warnings.push(issue({
          severity: 'warning',
          code: 'price_missing_verified_at',
          product,
          retailer: retailerName,
          field: 'retailers.p',
          message: `${retailerName} has price ${price} without verified_at`
        }));
      }

      if (price !== null && verifiedAt) {
        const ageDays = daysBetween(new Date(`${verifiedAt}T00:00:00Z`), now);
        if (ageDays !== null && ageDays <= PRICE_STALE_DAYS) {
          productIssues.hasFreshPrice = true;
        }
        if (ageDays !== null && ageDays > PRICE_STALE_DAYS) {
          warnings.push(issue({
            severity: 'warning',
            code: 'price_stale',
            product,
            retailer: retailerName,
            field: 'retailers.verified_at',
            message: `${retailerName} price is ${ageDays} days old`
          }));
        }
      }
    }

    productGrades.push({
      productId: product.id,
      cat: product.cat,
      brand: product.brand,
      model: product.model,
      grade: calculateAccuracyGrade(productIssues)
    });
  }

  const brandDuplicates = [...brandBuckets.values()]
    .map((bucket) => ({
      cat: bucket.cat,
      normalized: bucket.normalized,
      variants: [...bucket.variants].sort((a, b) => a.localeCompare(b)),
      productCount: bucket.productIds.length
    }))
    .filter((bucket) => bucket.variants.length > 1)
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.normalized.localeCompare(b.normalized));

  for (const duplicate of brandDuplicates) {
    warnings.push({
      severity: 'warning',
      code: 'brand_casing_duplicate',
      cat: duplicate.cat,
      normalized: duplicate.normalized,
      variants: duplicate.variants,
      productCount: duplicate.productCount,
      message: `${duplicate.cat} has brand casing variants: ${duplicate.variants.join(', ')}`
    });
  }

  const gradeCounts = productGrades.reduce((counts, row) => {
    counts[row.grade] = (counts[row.grade] ?? 0) + 1;
    return counts;
  }, {});

  const summary = {
    generatedAt: new Date(now).toISOString(),
    totalProducts: rows.length,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    infoCount: info.length,
    invalidRetailerUrlCount: blockers.filter((row) => row.code === 'retailer_non_product_url').length,
    pricedRetailersMissingVerifiedAt: warnings.filter((row) => row.code === 'price_missing_verified_at').length,
    stalePriceCount: warnings.filter((row) => row.code === 'price_stale').length,
    missingEvidenceProducts: warnings.filter((row) => row.code === 'missing_core_field_evidence').length,
    brandDuplicateGroups: brandDuplicates.length,
    gradeCounts
  };

  return {
    schema_version: 1,
    summary,
    issues: { blockers, warnings, info },
    brandDuplicates,
    productGrades
  };
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return '_None._\n';
  const header = `| ${columns.map((column) => column.label).join(' |')} |`;
  const divider = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? '').replace(/\|/g, '\\|')).join(' |')} |`);
  return [header, divider, ...body].join('\n') + '\n';
}

function buildMarkdownReport(report) {
  const { summary } = report;
  return [
    '# Data Accuracy Audit',
    '',
    `Generated: ${summary.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Products scanned: ${summary.totalProducts}`,
    `- Blockers: ${summary.blockerCount}`,
    `- Warnings: ${summary.warningCount}`,
    `- Invalid retailer product URLs: ${summary.invalidRetailerUrlCount}`,
    `- Priced retailer rows missing verified_at: ${summary.pricedRetailersMissingVerifiedAt}`,
    `- Stale price rows (> ${PRICE_STALE_DAYS} days): ${summary.stalePriceCount}`,
    `- Products missing field-level evidence: ${summary.missingEvidenceProducts}`,
    `- Brand duplicate groups: ${summary.brandDuplicateGroups}`,
    `- Accuracy grades: ${Object.entries(summary.gradeCounts).map(([grade, count]) => `${grade}=${count}`).join(', ') || 'none'}`,
    '',
    '## Blockers',
    '',
    markdownTable(report.issues.blockers.slice(0, 50), [
      { label: 'code', value: (row) => row.code },
      { label: 'product', value: (row) => row.productId },
      { label: 'brand', value: (row) => row.brand },
      { label: 'retailer', value: (row) => row.retailer ?? '' },
      { label: 'message', value: (row) => row.message }
    ]),
    '## Warnings',
    '',
    markdownTable(report.issues.warnings.slice(0, 50), [
      { label: 'code', value: (row) => row.code },
      { label: 'product', value: (row) => row.productId ?? '' },
      { label: 'cat', value: (row) => row.cat ?? '' },
      { label: 'message', value: (row) => row.message }
    ]),
    '## Brand Casing Duplicates',
    '',
    markdownTable(report.brandDuplicates, [
      { label: 'cat', value: (row) => row.cat },
      { label: 'normalized', value: (row) => row.normalized },
      { label: 'variants', value: (row) => row.variants.join(', ') },
      { label: 'products', value: (row) => row.productCount }
    ]),
    '## Next review workflow',
    '',
    '1. Fix blocker rows first: invalid retailer URLs must not be shown as buy links.',
    '2. Review stale or unverifiable prices before they are used in “best price” UI.',
    '3. Add field-level evidence metadata gradually through manual curation rather than bulk guessing.',
    '4. Treat this report as report-only until the blocker count is intentionally driven to zero.',
    ''
  ].join('\n');
}

function writeAccuracyReports(report, { outputDir = path.join(REPO_ROOT, 'reports', 'data-accuracy') } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdownReport(report));
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  return argv.reduce((options, arg, index, all) => {
    if (arg === '--strict') return { ...options, strict: true };
    if (arg === '--no-write') return { ...options, write: false };
    if (arg === '--output-dir') return { ...options, outputDir: all[index + 1] };
    if (arg.startsWith('--output-dir=')) return { ...options, outputDir: arg.slice('--output-dir='.length) };
    return options;
  }, { strict: false, write: true, outputDir: path.join(REPO_ROOT, 'reports', 'data-accuracy') });
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const report = auditDataAccuracy();
  if (options.write) {
    const outputs = writeAccuracyReports(report, { outputDir: options.outputDir });
    console.log(`[audit-data-accuracy] wrote ${path.relative(REPO_ROOT, outputs.jsonPath)} and ${path.relative(REPO_ROOT, outputs.markdownPath)}`);
  } else {
    console.log(JSON.stringify({ summary: report.summary }, null, 2));
  }
  if (options.strict && report.summary.blockerCount > 0) {
    console.error(`[audit-data-accuracy] strict mode failed: ${report.summary.blockerCount} blocker(s)`);
    process.exitCode = 1;
  }
}

module.exports = {
  PRICE_STALE_DAYS,
  PRODUCT_DATA_FILES,
  auditDataAccuracy,
  buildMarkdownReport,
  calculateAccuracyGrade,
  isRetailerProductPageUrl,
  loadCatalog,
  writeAccuracyReports
};
