#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const {
  buildLookupCandidates,
  extractLookupSkusFromText,
  findLgOfficialPdf,
  normalizeLookupSku
} = require('./lg-official');
const { discoverThirdPartyPdf } = require('./third-party-fallback');
const { normalizeProducts, isPdfVerified } = require('../audit-pdf-coverage');
const { canonicalizeBrand } = require('../brand-canon');
const {
  findManualEvidenceEntry,
  findManualEvidenceSourceUrl,
  findManualEvidenceVerifiedAlias
} = require('./1-fetch');

const DEFAULT_REPORT_JSON = 'reports/lg-pdf-hunter-report.json';
const DEFAULT_REPORT_MD = 'reports/lg-pdf-hunter-report.md';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

const LAUNDRY_SHORT_PREFIXES = [
  'WXLC',
  'WXLS',
  'WWT',
  'WXT',
  'WXL',
  'WXC',
  'WK'
];

const FRIDGE_SHORT_PREFIXES = [
  'GB',
  'GF',
  'GS',
  'GT',
  'GR'
];

const KNOWN_SUPPORT_ALIAS_CANDIDATES = {
  XD3: [
    'XD3A15BS',
    'XD3A15MB',
    'XD3A15NS',
    'XD3A25BS',
    'XD3A25MB',
    'XD3A25MW',
    'XD3A25PS',
    'XD3A25UNS'
  ],
  XD45: [
    'XD4B24UPS',
    'XD4B15PS',
    'XD4B24PS'
  ],
  'GF-L708MBL': [
    'GF-L708PL'
  ],
  'GT-279': [
    'GT-279BPL'
  ],
  'GT-3': [
    'GT-3S',
    'GT-332SDC'
  ],
  'GT-5': [
    'GT-5S',
    'GT-5W',
    'GT-515SDC'
  ],
  'GT-515DC': [
    'GT-515SDC'
  ],
  'GT-515*DC': [
    'GT-515SDC'
  ],
  'GT-5WLE': [
    'GT-5W'
  ],
  'GT-6SB': [
    'GT-6S',
    'GT-6MB'
  ],
  'GT-W6S': [
    'GT-6S',
    'GT-6MB'
  ],
  WTG1034: [
    'WTG1034WF'
  ],
  'WTL5-10B': [
    'WTL5-10W'
  ],
  'WV-1208': [
    'WV1-1208W',
    'WV5-1208W'
  ],
  'WV*-1208': [
    'WV1-1208W',
    'WV5-1208W'
  ],
  'WV-1408': [
    'WV5-1408W'
  ],
  'WV*-1408': [
    'WV5-1408W'
  ],
  'WV9-1408': [
    'WV9-1408W',
    'WV9-1408B'
  ],
  'WV9-1412': [
    'WV9-1412W',
    'WV9-1412B'
  ]
};

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function collectPotentialLookupText(target = {}) {
  return [
    target.sku,
    target.model,
    target.category,
    target.product?.model,
    target.product?.sku,
    target.product?.displayName,
    target.product?.title,
    target.product?.slug,
    target.product?.discovery?.product_url,
    target.product?.discovery?.source_discovery_url,
    target.entry?.model,
    target.entry?.sku,
    target.entry?.product?.model,
    target.entry?.product?.displayName,
    target.entry?.product?.title,
    target.entry?.product?.slug,
    target.entry?.product?.discovery?.product_url
  ].filter(Boolean).join(' ');
}

function extractPrimaryLgSkuToken(value) {
  const tokens = extractLookupSkusFromText(String(value || ''));
  return tokens.find((token) => /^[A-Z]{1,5}-?[A-Z0-9]*\d[A-Z0-9-]*$/i.test(token)) || '';
}

function looksLikeBareLaundryTowerSuffix(sku, category) {
  return /washing|dryer|laundry|washtower|combo/i.test(String(category || ''))
    && /^\d{3,5}[A-Z]{1,4}$/i.test(String(sku || ''));
}

function expandBareLaundryTowerSuffix(sku) {
  return LAUNDRY_SHORT_PREFIXES.map((prefix) => `${prefix}-${sku}`);
}

function expandHyphenlessLgSku(sku) {
  const normalized = String(sku || '').trim().toUpperCase();
  const match = normalized.match(/^(GB|GF|GS|GT|GR|WV|WX|WVC|WXL|WXLC|WXC|DVH|DXH|XD)([A-Z0-9].*)$/);
  if (!match || normalized.includes('-')) return [];
  return [`${match[1]}-${match[2]}`];
}

function expandShortFridgeSku(sku, category) {
  const normalized = String(sku || '').trim().toUpperCase();
  if (!/fridge|refrigerator/i.test(String(category || ''))) return [];
  if (!/^[A-Z]?\d{3,4}[A-Z]{1,4}$/i.test(normalized)) return [];
  return FRIDGE_SHORT_PREFIXES.map((prefix) => `${prefix}-${normalized}`);
}

function expandKnownSupportAliasSku(sku) {
  const normalized = String(sku || '').trim().toUpperCase();
  const compact = normalizeSku(normalized);
  return Object.entries(KNOWN_SUPPORT_ALIAS_CANDIDATES)
    .filter(([key]) => key.toUpperCase() === normalized || normalizeSku(key) === compact)
    .flatMap(([, candidates]) => candidates);
}

function expandFridgeSeriesAliasSku(sku, category) {
  const normalized = String(sku || '').trim().toUpperCase();
  if (!/fridge|refrigerator/i.test(String(category || ''))) return [];

  const candidates = [];

  // LG support sometimes indexes the family manual under GS-B... while the PDF
  // itself lists GS-VB.../GSVB... models. Try the support-indexed family SKU,
  // but keep parser acceptance gated on model evidence inside the PDF.
  const sideBySideMatch = normalized.match(/^GS-VB(\d{3,4}[A-Z]*)$/);
  if (sideBySideMatch) {
    candidates.push(`GS-B${sideBySideMatch[1]}`);
  }

  return candidates;
}

function buildHunterLookupCandidates(target = {}) {
  const category = target.category || target.cat || target.product?.cat || target.product?.category;
  const rawText = collectPotentialLookupText(target);
  const primary = extractPrimaryLgSkuToken(target.sku || target.model || target.product?.model || rawText);
  const base = buildLookupCandidates({
    ...target,
    sku: target.sku || target.model || target.product?.model || primary,
    product: target.product
  });

  const rawCandidates = [
    target.sku,
    target.model,
    target.product?.model,
    primary,
    ...base,
    ...extractLookupSkusFromText(rawText)
  ].map(normalizeLookupSku).filter(Boolean);

  const expanded = [];
  for (const candidate of rawCandidates) {
    expanded.push(candidate);
    expanded.push(...expandHyphenlessLgSku(candidate));
    if (looksLikeBareLaundryTowerSuffix(candidate, category)) {
      expanded.push(...expandBareLaundryTowerSuffix(candidate));
    }
    expanded.push(...expandShortFridgeSku(candidate, category));
    expanded.push(...expandFridgeSeriesAliasSku(candidate, category));
    expanded.push(...expandKnownSupportAliasSku(candidate));
  }

  return unique(expanded);
}

function evidenceIndexPath(repoRoot) {
  const dataPath = path.join(repoRoot, 'data', 'evidence-index.json');
  if (fs.existsSync(dataPath)) return dataPath;
  return path.join(repoRoot, 'public', 'data', 'evidence-index.json');
}

function productKey(product = {}) {
  return String(product.id || product.slug || `${product.brand || 'lg'}-${product.model || ''}`);
}

function collectLgMissingPdfTargets({
  repoRoot = process.cwd(),
  activeOnly = false
} = {}) {
  const catalog = readJson(path.join(repoRoot, 'data', 'catalog-final.json'), []);
  const evidenceIndex = readJson(evidenceIndexPath(repoRoot), {});
  const manualEvidence = readJson(path.join(repoRoot, 'data', 'manual-evidence.json'), { products: {} });

  return normalizeProducts(catalog)
    .filter((product) => canonicalizeBrand(product.brand) === 'LG')
    .filter((product) => !isPdfVerified(product, evidenceIndex))
    .filter((product) => !activeOnly || product.unavailable === false)
    .map((product) => {
      const id = productKey(product);
      const entry = findManualEvidenceEntry({
        id,
        product,
        sku: product.model,
        model: product.model,
        brand: product.brand
      }, manualEvidence);
      return {
        id,
        brand: product.brand || entry?.brand || 'LG',
        sku: product.model || entry?.model || entry?.sku,
        category: product.cat || product.category || entry?.category,
        product,
        entry,
        sourceUrl: findManualEvidenceSourceUrl({ id, product, sku: product.model }, manualEvidence) || '',
        verifiedAlias: findManualEvidenceVerifiedAlias({ id, product, sku: product.model }, manualEvidence) || ''
      };
    })
    .filter((target) => target.sku)
    .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || a.sku.localeCompare(b.sku));
}

async function findOfficialPdfFromHunterCandidates(target, {
  officialFinder = findLgOfficialPdf,
  logger = console
} = {}) {
  const candidates = buildHunterLookupCandidates(target);
  const errors = [];

  for (const candidate of candidates) {
    try {
      const result = await officialFinder({
        ...target,
        sku: candidate,
        model: candidate,
        product: {
          ...(target.product || {}),
          model: candidate
        }
      });
      if (result?.sourceUrl) {
        return {
          ...result,
          lookupSku: result.lookupSku || candidate,
          attempted: candidates
        };
      }
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
      logger.warn?.(`[lg-hunter] ${target.sku}: ${candidate} failed: ${error.message}`);
    }
  }

  const error = new Error(`LG official PDF not found after ${candidates.length} lookup candidates`);
  error.attempted = candidates;
  error.errors = errors;
  throw error;
}

async function huntLgPdfTargets({
  targets,
  officialFinder = findLgOfficialPdf,
  useThirdParty = false,
  thirdPartyFinder = discoverThirdPartyPdf,
  delayMs = 0,
  logger = console,
  runAt = new Date().toISOString()
} = {}) {
  const found = [];
  const missing = [];

  for (const target of targets) {
    let officialError = null;
    try {
      const official = await findOfficialPdfFromHunterCandidates(target, {
        officialFinder,
        logger
      });
      found.push({
        id: target.id,
        sku: target.sku,
        category: target.category,
        brand: target.brand,
        product: target.product,
        sourceUrl: official.sourceUrl,
        source: official.source || 'lg-official-support-manual',
        lookupSku: official.lookupSku || '',
        originalFileName: official.originalFileName || '',
        resourceType: official.resourceType || '',
        attempted: official.attempted || buildHunterLookupCandidates(target),
        discoveredAt: runAt
      });
      if (delayMs > 0) await sleep(delayMs);
      continue;
    } catch (error) {
      officialError = error;
    }

    if (useThirdParty) {
      try {
        const thirdParty = await thirdPartyFinder(target, {
          userAgent: DEFAULT_USER_AGENT
        });
        found.push({
          id: target.id,
          sku: target.sku,
          category: target.category,
          brand: target.brand,
          product: target.product,
          sourceUrl: thirdParty.sourceUrl,
          source: thirdParty.source || 'third-party-fallback',
          lookupSku: '',
          originalFileName: '',
          resourceType: 'third_party_candidate',
          attempted: buildHunterLookupCandidates(target),
          discoveredAt: runAt
        });
        if (delayMs > 0) await sleep(delayMs);
        continue;
      } catch (error) {
        missing.push({
          id: target.id,
          sku: target.sku,
          category: target.category,
          brand: target.brand,
          reason: `official: ${officialError.message}; third-party: ${error.message}`,
          attempted: officialError.attempted || buildHunterLookupCandidates(target)
        });
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
    }

    if (target.sourceUrl) {
      found.push({
        id: target.id,
        sku: target.sku,
        category: target.category,
        brand: target.brand,
        product: target.product,
        sourceUrl: target.sourceUrl,
        source: 'manual-evidence-existing-source',
        lookupSku: target.verifiedAlias || '',
        originalFileName: '',
        resourceType: 'existing_candidate',
        attempted: officialError.attempted || buildHunterLookupCandidates(target),
        discoveredAt: runAt
      });
    } else {
      missing.push({
        id: target.id,
        sku: target.sku,
        category: target.category,
        brand: target.brand,
        reason: officialError.message,
        attempted: officialError.attempted || buildHunterLookupCandidates(target)
      });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    runAt,
    processed: targets.length,
    found,
    missing
  };
}

function applyHunterWriteUpdates({
  repoRoot = process.cwd(),
  found = [],
  overwriteSource = false,
  runAt = new Date().toISOString()
} = {}) {
  const manifestPath = path.join(repoRoot, 'data', 'manual-evidence.json');
  const manifest = readJson(manifestPath, {
    schema_version: 1,
    last_updated: runAt.slice(0, 10),
    products: {}
  });
  manifest.products ||= {};

  let written = 0;
  let skippedExisting = 0;
  for (const item of found) {
    const id = item.id;
    if (!id || !item.sourceUrl) continue;
    const entry = manifest.products[id] || {};
    if (entry.source_url && !overwriteSource) {
      skippedExisting += 1;
      continue;
    }

    manifest.products[id] = {
      ...entry,
      category: entry.category || item.category,
      brand: entry.brand || item.brand || 'LG',
      model: entry.model || item.sku,
      sku: entry.sku || item.sku,
      product: compactProductForManifest(entry.product || item.product || {
        id,
        cat: item.category,
        brand: item.brand || 'LG',
        model: item.sku
      }),
      source_url: item.sourceUrl,
      type: entry.type || 'user_manual',
      status: entry.status === 'approved' ? entry.status : 'candidate',
      has_pdf_evidence: Boolean(entry.has_pdf_evidence),
      discovered_at: runAt,
      discovery_source: item.source,
      lookup_sku: item.lookupSku || entry.lookup_sku || '',
      original_file_name: item.originalFileName || entry.original_file_name || '',
      notes: entry.notes || 'LG PDF hunter candidate. Requires parser validation before approval.'
    };
    written += 1;
  }

  manifest.last_updated = runAt.slice(0, 10);
  writeJson(manifestPath, manifest);
  return { written, skippedExisting };
}

function compactProductForManifest(product = {}) {
  return {
    id: product.id,
    cat: product.cat || product.category,
    brand: product.brand,
    model: product.model || product.sku,
    w: product.w,
    h: product.h,
    d: product.d,
    displayName: product.displayName,
    title: product.title,
    slug: product.slug,
    discovery: product.discovery
  };
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function writeHunterReports({
  repoRoot = process.cwd(),
  result,
  jsonPath = DEFAULT_REPORT_JSON,
  mdPath = DEFAULT_REPORT_MD
} = {}) {
  const absoluteJsonPath = path.join(repoRoot, jsonPath);
  const absoluteMdPath = path.join(repoRoot, mdPath);
  writeJson(absoluteJsonPath, result);

  const sourceCounts = result.found.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});
  const categoryCounts = result.found.reduce((acc, item) => {
    const category = item.category || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# LG PDF Hunter Report',
    '',
    `Run at: ${result.runAt}`,
    '',
    '## Summary',
    '',
    `- Processed LG missing-PDF SKUs: ${result.processed}`,
    `- PDF URL candidates found: ${result.found.length}`,
    `- Still missing: ${result.missing.length}`,
    '',
    '## Found Sources',
    '',
    ...Object.entries(sourceCounts).sort(([a], [b]) => a.localeCompare(b)).map(([source, count]) => `- ${source}: ${count}`),
    ...(Object.keys(sourceCounts).length ? [] : ['- none']),
    '',
    '## Found By Category',
    '',
    ...Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => `- ${category}: ${count}`),
    ...(Object.keys(categoryCounts).length ? [] : ['- none']),
    '',
    '## Candidate URLs',
    '',
    '| Product ID | SKU | Category | Source | Lookup SKU | URL |',
    '|---|---:|---|---|---:|---|',
    ...result.found.map((item) => `| ${[
      markdownEscape(item.id),
      markdownEscape(item.sku),
      markdownEscape(item.category),
      markdownEscape(item.source),
      markdownEscape(item.lookupSku),
      markdownEscape(item.sourceUrl)
    ].join(' | ')} |`),
    ...(result.found.length ? [] : ['| _none_ |  |  |  |  |  |']),
    '',
    '## Missing',
    '',
    '| Product ID | SKU | Category | Reason | Attempted lookup candidates |',
    '|---|---:|---|---|---|',
    ...result.missing.map((item) => `| ${[
      markdownEscape(item.id),
      markdownEscape(item.sku),
      markdownEscape(item.category),
      markdownEscape(item.reason),
      markdownEscape((item.attempted || []).join(', '))
    ].join(' | ')} |`),
    ...(result.missing.length ? [] : ['| _none_ |  |  |  |  |']),
    ''
  ];
  fs.mkdirSync(path.dirname(absoluteMdPath), { recursive: true });
  fs.writeFileSync(absoluteMdPath, `${lines.join('\n')}\n`);
  return {
    jsonPath: absoluteJsonPath,
    mdPath: absoluteMdPath
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    activeOnly: false,
    delayMs: 0,
    limit: Infinity,
    overwriteSource: false,
    reportJson: DEFAULT_REPORT_JSON,
    reportMd: DEFAULT_REPORT_MD,
    skus: null,
    useThirdParty: false,
    write: false
  };

  for (const arg of argv) {
    if (arg === '--active-only') args.activeOnly = true;
    else if (arg === '--third-party') args.useThirdParty = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--overwrite-source') args.overwriteSource = true;
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number.parseInt(arg.slice('--delay-ms='.length), 10);
    else if (arg.startsWith('--limit=')) args.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    else if (arg.startsWith('--sku=')) args.skus = arg.slice('--sku='.length).split(',').map(normalizeSku).filter(Boolean);
    else if (arg.startsWith('--report-json=')) args.reportJson = arg.slice('--report-json='.length);
    else if (arg.startsWith('--report-md=')) args.reportMd = arg.slice('--report-md='.length);
  }

  return args;
}

async function main() {
  const args = parseCliArgs();
  let targets = collectLgMissingPdfTargets({
    repoRoot: process.cwd(),
    activeOnly: args.activeOnly
  });
  if (args.skus?.length) {
    const allowed = new Set(args.skus);
    targets = targets.filter((target) => allowed.has(normalizeSku(target.sku)));
  }
  if (Number.isFinite(args.limit)) targets = targets.slice(0, args.limit);

  const result = await huntLgPdfTargets({
    targets,
    useThirdParty: args.useThirdParty,
    delayMs: Number.isFinite(args.delayMs) ? args.delayMs : 0
  });
  const reports = writeHunterReports({
    repoRoot: process.cwd(),
    result,
    jsonPath: args.reportJson,
    mdPath: args.reportMd
  });

  let writeSummary = null;
  if (args.write) {
    writeSummary = applyHunterWriteUpdates({
      repoRoot: process.cwd(),
      found: result.found.filter((item) => item.source !== 'manual-evidence-existing-source'),
      overwriteSource: args.overwriteSource,
      runAt: result.runAt
    });
  }

  console.log(`[lg-hunter] processed ${result.processed}; found ${result.found.length}; missing ${result.missing.length}`);
  console.log(`[lg-hunter] report ${path.relative(process.cwd(), reports.mdPath)}`);
  if (writeSummary) {
    console.log(`[lg-hunter] manifest writes ${writeSummary.written}; skipped existing ${writeSummary.skippedExisting}`);
  } else {
    console.log('[lg-hunter] dry-run only; add --write to seed data/manual-evidence.json');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

exports.applyHunterWriteUpdates = applyHunterWriteUpdates;
exports.buildHunterLookupCandidates = buildHunterLookupCandidates;
exports.collectLgMissingPdfTargets = collectLgMissingPdfTargets;
exports.findOfficialPdfFromHunterCandidates = findOfficialPdfFromHunterCandidates;
exports.huntLgPdfTargets = huntLgPdfTargets;
exports.writeHunterReports = writeHunterReports;
