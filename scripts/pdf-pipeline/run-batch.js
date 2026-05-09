#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { fetchPdf, resolvePdfSourceUrl } = require('./1-fetch');
const { extractText } = require('./2-extract-text');
const { createEnvLlmCaller, extractStructuredData } = require('./3-ai-parse');
const { validateApplianceDimension } = require('./4-validate');
const { saveExtractionToVault } = require('./lib/vault');

const MISSING_API_KEY_MESSAGE = 'Missing API Key in .env file';

const CATALOG_FILES = [
  ['fridge', 'fridges.json'],
  ['dishwasher', 'dishwashers.json'],
  ['dryer', 'dryers.json'],
  ['washing_machine', 'washing-machines.json']
];

const MANUFACTURER_DOMAINS = {
  bosch: 'bosch-home.com.au',
  chiq: 'chiq.com.au',
  electrolux: 'electrolux.com.au',
  'fisher & paykel': 'fisherpaykel.com/au',
  fisherpaykel: 'fisherpaykel.com/au',
  haier: 'haier.com.au',
  hisense: 'hisense.com.au',
  lg: 'lg.com/au',
  miele: 'miele.com.au',
  samsung: 'samsung.com/au',
  westinghouse: 'westinghouse.com.au'
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasOpenAiApiKey(env = process.env) {
  return String(env.OPENAI_API_KEY || '').trim().length > 0;
}

function assertOpenAiApiKey(env = process.env) {
  if (!hasOpenAiApiKey(env)) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeBrandKey(brand) {
  return String(brand || '').trim().toLowerCase();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getProductSkuCandidates(product) {
  return [
    product?.model,
    product?.sku,
    product?.id,
    product?.slug
  ].map(normalizeSku).filter(Boolean);
}

function matchesSkuFilter(product, skuFilter) {
  if (!skuFilter) return true;
  const candidates = getProductSkuCandidates(product);
  return candidates.some((candidate) => (
    skuFilter.has(candidate)
    || [...skuFilter].some((requested) => (
      requested.length >= 4
      && candidate.length >= 4
      && (candidate.includes(requested) || requested.includes(candidate))
    ))
  ));
}

function slugPathPart(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function hasPdfEvidence(product) {
  return product?.evidence?.has_pdf_evidence === true;
}

function loadCatalogProducts(repoRoot = process.cwd()) {
  const products = [];
  for (const [category, fileName] of CATALOG_FILES) {
    const filePath = path.join(repoRoot, 'public', 'data', fileName);
    const catalog = readJson(filePath, { products: [] });
    const rows = Array.isArray(catalog?.products) ? catalog.products : [];
    for (const product of rows) {
      products.push({
        ...product,
        cat: product.cat || category
      });
    }
  }
  return products;
}

function loadManualEvidence(repoRoot = process.cwd()) {
  return readJson(path.join(repoRoot, 'data', 'manual-evidence.json'), { products: {} });
}

function loadBatchTargets({ repoRoot = process.cwd(), category = null, limit = null, skus = null } = {}) {
  const skuFilter = Array.isArray(skus)
    ? new Set(skus.map(normalizeSku).filter(Boolean))
    : null;
  const products = loadCatalogProducts(repoRoot)
    .filter((product) => product.unavailable === false)
    .filter((product) => !hasPdfEvidence(product))
    .filter((product) => !category || product.cat === category)
    .filter((product) => matchesSkuFilter(product, skuFilter));

  const targets = products.map((product) => ({
    id: product.id || product.slug || `${product.cat}-${product.brand}-${product.model}`,
    brand: product.brand,
    sku: product.model || product.sku,
    category: product.cat,
    product
  }));

  return Number.isFinite(limit) && limit >= 0 ? targets.slice(0, limit) : targets;
}

function buildPdfSearchQuery(target) {
  const brandKey = normalizeBrandKey(target.brand);
  const domain = MANUFACTURER_DOMAINS[brandKey];
  const domainClause = domain ? `site:${domain} ` : '';
  return `${domainClause}"${target.sku}" ("specification sheet" OR "installation manual" OR "dimensions") filetype:pdf`;
}

async function searchManufacturerPdf(target, {
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const key = env.GOOGLE_CSE_API_KEY;
  const cx = env.GOOGLE_CSE_CX;
  if (!key || !cx) {
    throw new Error('PDF source URL not found; add manual-evidence source_url or set GOOGLE_CSE_API_KEY+GOOGLE_CSE_CX');
  }
  if (!fetchImpl) throw new Error('searchManufacturerPdf requires fetch');

  const query = buildPdfSearchQuery(target);
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '5');

  const response = await fetchImpl(String(url));
  if (!response.ok) {
    throw new Error(`Google CSE PDF search failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  const item = (payload.items || []).find((candidate) => {
    const link = String(candidate.link || '');
    const mime = String(candidate.mime || candidate.fileFormat || '').toLowerCase();
    return /\.pdf($|[?#])/i.test(link) || mime.includes('pdf');
  });

  if (!item?.link) {
    throw new Error(`PDF not found for ${target.brand} ${target.sku}`);
  }
  return item.link;
}

async function findPdfSourceUrl(target, {
  repoRoot = process.cwd(),
  manualEvidence = loadManualEvidence(repoRoot),
  searchPdf = null,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  return resolvePdfSourceUrl(target, {
    repoRoot,
    manualEvidence,
    searchPdf: searchPdf || ((searchTarget) => searchManufacturerPdf(searchTarget, { env, fetchImpl }))
  });
}

function compareDimensions(product, strictData, { thresholdMm = 5 } = {}) {
  const dimensions = strictData?.dimensions || {};
  const pairs = [
    ['width', product?.w, dimensions.width_mm],
    ['height', product?.h, dimensions.height_mm],
    ['depth', product?.d, dimensions.depth_mm]
  ];

  return pairs
    .filter(([, legacy, pdf]) => Number.isFinite(legacy) && Number.isFinite(pdf))
    .map(([axis, legacy, pdf]) => ({ axis, legacy, pdf, delta_mm: pdf - legacy }))
    .filter((delta) => Math.abs(delta.delta_mm) >= thresholdMm);
}

function formatMarkdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function renderSuccessRows(successes) {
  if (successes.length === 0) return 'No successful runs.\n';
  return [
    '| SKU | Product | Category | Confidence | Source |',
    '| --- | --- | --- | ---: | --- |',
    ...successes.map((item) => (
      `| ${formatMarkdownCell(item.sku)} | ${formatMarkdownCell(item.brand)} | ${formatMarkdownCell(item.category)} | ${item.confidenceScore ?? 'n/a'} | ${formatMarkdownCell(item.sourceUrl)} |`
    ))
  ].join('\n') + '\n';
}

function renderDiscrepancyRows(discrepancies) {
  if (discrepancies.length === 0) return 'No significant discrepancies.\n';
  return [
    '| SKU | Axis | Legacy | PDF | Delta |',
    '| --- | --- | ---: | ---: | ---: |',
    ...discrepancies.map((item) => (
      `| ${formatMarkdownCell(item.sku)} | ${item.axis} | ${item.legacy}mm | ${item.pdf}mm | ${item.delta_mm > 0 ? '+' : ''}${item.delta_mm}mm |`
    ))
  ].join('\n') + '\n';
}

function renderFailureRows(failures) {
  if (failures.length === 0) return 'No failures.\n';
  return [
    '| SKU | Product | Reason |',
    '| --- | --- | --- |',
    ...failures.map((item) => (
      `| ${formatMarkdownCell(item.sku)} | ${formatMarkdownCell(item.brand)} | ${formatMarkdownCell(item.reason)} |`
    ))
  ].join('\n') + '\n';
}

function writeBatchReport({
  repoRoot = process.cwd(),
  successes = [],
  discrepancies = [],
  failures = [],
  runAt = new Date().toISOString()
} = {}) {
  const outputPath = path.join(repoRoot, 'reports', 'pdf-batch-results.md');
  const markdown = [
    '# PDF Batch Results',
    '',
    `Run at: ${runAt}`,
    '',
    '## Successful Runs',
    '',
    renderSuccessRows(successes),
    '## Significant Discrepancies',
    '',
    renderDiscrepancyRows(discrepancies),
    '## Failures',
    '',
    renderFailureRows(failures)
  ].join('\n');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
  return outputPath;
}

async function defaultParseText(text, context, env = process.env) {
  assertOpenAiApiKey(env);
  const llmCaller = createEnvLlmCaller(env);
  if (!llmCaller) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  const candidate = await extractStructuredData(text, {
    llmCaller,
    target: context.target,
    sourceUrl: context.sourceUrl
  });
  const enrichedCandidate = {
    ...candidate,
    metadata: {
      ...(candidate.metadata || {}),
      source_pdf_url: candidate.metadata?.source_pdf_url || context.sourceUrl,
      extraction_date: candidate.metadata?.extraction_date || new Date().toISOString()
    }
  };
  return enrichedCandidate;
}

async function runBatch({
  repoRoot = process.cwd(),
  targets = null,
  category = null,
  limit = null,
  skus = null,
  delayMs = 3000,
  logger = console,
  env = process.env,
  fetchPdfImpl = fetchPdf,
  extractTextImpl = extractText,
  parseTextImpl = null,
  validateStrictImpl = validateApplianceDimension,
  saveToVaultImpl = saveExtractionToVault,
  searchPdf = null
} = {}) {
  const batchTargets = targets || loadBatchTargets({ repoRoot, category, limit, skus });
  const manualEvidence = loadManualEvidence(repoRoot);
  const successes = [];
  const discrepancies = [];
  const failures = [];

  if (!parseTextImpl && batchTargets.length > 0) {
    assertOpenAiApiKey(env);
  }

  for (let index = 0; index < batchTargets.length; index += 1) {
    const target = batchTargets[index];
    logger.log(`Processing ${index + 1}/${batchTargets.length}: ${target.brand} ${target.sku}`);

    try {
      const { sourceUrl, source } = await findPdfSourceUrl(target, {
        repoRoot,
        manualEvidence,
        searchPdf,
        env
      });
      const pdfPath = path.join(
        repoRoot,
        '.tmp',
        'pdfs',
        slugPathPart(target.brand),
        `${slugPathPart(target.sku)}.pdf`
      );
      const fetched = await fetchPdfImpl(sourceUrl, pdfPath);
      const textResult = await extractTextImpl(fetched.path);
      const candidate = parseTextImpl
        ? await parseTextImpl(textResult.text, { target, sourceUrl, source, fetched, textResult })
        : await defaultParseText(textResult.text, { target, sourceUrl, source, fetched, textResult }, env);
      const validation = validateStrictImpl(candidate, { target });

      if (!validation.valid) {
        throw new Error(`Zod validation failed: ${validation.errors.join('; ')}`);
      }

      const strictData = validation.data;
      const vaultResult = saveToVaultImpl({
        repoRoot,
        productId: target.id,
        product: target.product,
        strictData,
        sourceUrl,
        verifiedAt: strictData.metadata.extraction_date
      });
      const deltas = compareDimensions(target.product, strictData);
      for (const delta of deltas) {
        discrepancies.push({
          ...delta,
          id: target.id,
          brand: target.brand,
          sku: target.sku,
          category: target.category
        });
      }

      successes.push({
        id: target.id,
        brand: target.brand,
        sku: target.sku,
        category: target.category,
        confidenceScore: strictData.metadata.confidence_score,
        source,
        sourceUrl,
        rawJsonRelativePath: vaultResult.rawJsonRelativePath,
        requiresManualReview: validation.requiresManualReview
      });
    } catch (error) {
      logger.error(`Failed ${target.brand} ${target.sku}: ${error.message}`);
      failures.push({
        id: target.id,
        brand: target.brand,
        sku: target.sku,
        category: target.category,
        reason: error.message
      });
    }

    if (delayMs > 0 && index < batchTargets.length - 1) {
      await sleep(delayMs);
    }
  }

  const reportPath = writeBatchReport({
    repoRoot,
    successes,
    discrepancies,
    failures
  });

  return {
    targets: batchTargets,
    successes,
    discrepancies,
    failures,
    reportPath
  };
}

function parseCliArgs(argv) {
  const args = { repoRoot: process.cwd(), delayMs: 3000 };
  for (const arg of argv) {
    if (arg.startsWith('--limit=')) args.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    if (arg.startsWith('--category=')) args.category = arg.slice('--category='.length);
    if (arg.startsWith('--delay-ms=')) args.delayMs = Number.parseInt(arg.slice('--delay-ms='.length), 10);
    if (arg.startsWith('--sku=')) {
      args.skus = arg.slice('--sku='.length).split(',').map((sku) => sku.trim()).filter(Boolean);
    }
  }
  return args;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await runBatch(options);
  console.log(`PDF batch complete: ${result.successes.length} success, ${result.failures.length} failures, ${result.discrepancies.length} discrepancies`);
  console.log(`Report: ${result.reportPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

exports.compareDimensions = compareDimensions;
exports.findPdfSourceUrl = findPdfSourceUrl;
exports.loadBatchTargets = loadBatchTargets;
exports.runBatch = runBatch;
exports.writeBatchReport = writeBatchReport;
exports.buildPdfSearchQuery = buildPdfSearchQuery;
exports.searchManufacturerPdf = searchManufacturerPdf;
exports.MISSING_API_KEY_MESSAGE = MISSING_API_KEY_MESSAGE;
