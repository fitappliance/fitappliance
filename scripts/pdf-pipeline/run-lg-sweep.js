#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { fetchPdf } = require('./1-fetch');
const { extractText } = require('./2-extract-text');
const { validateApplianceDimension } = require('./4-validate');
const { saveExtractionToVault } = require('./lib/vault');
const { findLgOfficialPdf } = require('./lg-official');
const { parseLgText } = require('./parsers/lg');

const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function slugPathPart(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function isLgEvidenceEntry(entry = {}) {
  return /\blg\b|lg electronics/i.test([
    entry.brand,
    entry.product?.brand
  ].filter(Boolean).join(' '));
}

function isInvalidEntry(entry = {}) {
  if (entry.status === 'invalid') return true;
  return Array.isArray(entry.evidence) && entry.evidence.some((item) => item?.status === 'invalid');
}

function findEntrySourceUrl(entry = {}) {
  if (entry.source_url) return String(entry.source_url);
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  return String(evidence.find((item) => item?.source_url)?.source_url || '');
}

function findEntryVerifiedAlias(entry = {}) {
  if (entry.verified_alias) return String(entry.verified_alias);
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  return String(evidence.find((item) => item?.verified_alias)?.verified_alias || '');
}

function buildProductFromEntry(id, entry = {}) {
  const product = entry.product || {};
  return {
    ...product,
    id: product.id || id,
    cat: product.cat || product.category || entry.category,
    brand: product.brand || entry.brand || 'LG',
    model: product.model || product.sku || entry.model || entry.sku
  };
}

function loadRawEvidenceIndex(repoRoot) {
  const rawDir = path.join(repoRoot, 'data', 'pdf-evidence-raw');
  const index = {
    productIds: new Set(),
    skus: new Set()
  };
  if (!fs.existsSync(rawDir)) return index;

  for (const fileName of fs.readdirSync(rawDir).filter((name) => name.endsWith('.json')).sort()) {
    const raw = readJson(path.join(rawDir, fileName), null);
    if (!raw) continue;
    if (raw.product_id) index.productIds.add(String(raw.product_id));
    for (const value of [
      raw.model,
      raw.sku,
      raw.extracted?.sku,
      raw.extracted?.model
    ]) {
      const sku = normalizeSku(value);
      if (sku) index.skus.add(sku);
    }
  }
  return index;
}

function hasExistingRawEvidence(target, rawIndex) {
  if (rawIndex.productIds.has(String(target.id))) return true;
  return rawIndex.skus.has(normalizeSku(target.sku));
}

function collectLgSweepTargets({
  repoRoot = process.cwd(),
  includeExistingRaw = false
} = {}) {
  const manifest = readJson(path.join(repoRoot, 'data', 'manual-evidence.json'), { products: {} });
  const rawIndex = loadRawEvidenceIndex(repoRoot);
  const products = manifest.products || {};
  return Object.entries(products)
    .filter(([, entry]) => isLgEvidenceEntry(entry))
    .filter(([, entry]) => !isInvalidEntry(entry))
    .map(([id, entry]) => {
      const product = buildProductFromEntry(id, entry);
      return {
        id,
        brand: product.brand,
        sku: product.model || entry.model || entry.sku,
        category: product.cat || entry.category,
        product,
        sourceUrl: findEntrySourceUrl(entry),
        verifiedAlias: findEntryVerifiedAlias(entry),
        entry
      };
    })
    .filter((target) => target.sku)
    .filter((target) => includeExistingRaw || !hasExistingRawEvidence(target, rawIndex))
    .sort((a, b) => {
      const sourceRank = Number(Boolean(b.sourceUrl)) - Number(Boolean(a.sourceUrl));
      return sourceRank || a.id.localeCompare(b.id);
    });
}

function categorizeLgFailure(error) {
  const message = String(error?.message || error || '');
  if (/missing\s+source|source_url|pdf\s+not\s+found|no\s+pdf/i.test(message)) {
    return 'Missing PDF';
  }
  if (/fetch|download|HTTP|timeout|content-type|magic bytes|ECONNRESET|ETIMEDOUT/i.test(message)) {
    return 'Fetch Failed';
  }
  if (/clearance|ventilation|airflow|cabinet\/wall/i.test(message)) {
    return 'Clearance Missing';
  }
  if (/verify SKU|model tokens|model mismatch|alias/i.test(message)) {
    return 'Model Mismatch';
  }
  if (/dimension|could not find|Unsupported|category mismatch|layout|parse/i.test(message)) {
    return 'Unreadable Layout';
  }
  return 'Other';
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function writeLgSweepReport({
  repoRoot = process.cwd(),
  processed,
  successes,
  failures,
  reportPath = path.join(repoRoot, 'reports', 'lg-batch-results.md'),
  runAt = new Date().toISOString()
}) {
  const bucketCounts = failures.reduce((acc, failure) => {
    acc[failure.bucket] = (acc[failure.bucket] || 0) + 1;
    return acc;
  }, {});
  const byCategory = successes.reduce((acc, success) => {
    const category = success.category || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const lines = [
    '# LG PDF Batch Sweep',
    '',
    `Run at: ${runAt}`,
    '',
    '## Summary',
    '',
    `- Total LG pending SKUs processed: ${processed}`,
    `- Successful "Verified Fit" extractions: ${successes.length}`,
    `- Fail-closed: ${failures.length}`,
    '',
    '## Successful Verified Fit Extractions',
    '',
    '| Product ID | SKU | Category | Confidence | Source |',
    '|---|---:|---|---:|---|',
    ...successes.map((success) => [
      markdownEscape(success.id),
      markdownEscape(success.sku),
      markdownEscape(success.category),
      markdownEscape(success.confidence_score),
      markdownEscape(success.sourceUrl)
    ].join(' | ')).map((row) => `| ${row} |`),
    ...(successes.length ? [] : ['| _none_ |  |  |  |  |']),
    '',
    '## Successes By Category',
    '',
    ...Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => `- ${category}: ${count}`),
    ...(Object.keys(byCategory).length ? [] : ['- none']),
    '',
    '## Fail-closed Buckets',
    '',
    ...Object.entries(bucketCounts).sort(([a], [b]) => a.localeCompare(b)).map(([bucket, count]) => `- ${bucket}: ${count}`),
    ...(Object.keys(bucketCounts).length ? [] : ['- none']),
    '',
    '## Failure Details',
    '',
    '| Product ID | SKU | Category | Bucket | Reason |',
    '|---|---:|---|---|---|',
    ...failures.map((failure) => [
      markdownEscape(failure.id),
      markdownEscape(failure.sku),
      markdownEscape(failure.category),
      markdownEscape(failure.bucket),
      markdownEscape(failure.reason)
    ].join(' | ')).map((row) => `| ${row} |`),
    ...(failures.length ? [] : ['| _none_ |  |  |  |  |']),
    ''
  ];

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  return reportPath;
}

async function runLgSweep({
  repoRoot = process.cwd(),
  targets = null,
  delayMs = 0,
  fetchPdfImpl = fetchPdf,
  extractTextImpl = extractText,
  lgOfficialFinder = findLgOfficialPdf,
  validateStrictImpl = validateApplianceDimension,
  saveToVaultImpl = saveExtractionToVault,
  logger = console,
  runAt = new Date().toISOString()
} = {}) {
  const sweepTargets = targets || collectLgSweepTargets({ repoRoot });
  const successes = [];
  const failures = [];

  for (const target of sweepTargets) {
    const sourceCandidates = [];
    try {
      const official = await lgOfficialFinder(target);
      if (official?.sourceUrl) {
        sourceCandidates.push({
          sourceUrl: official.sourceUrl,
          source: official.source || 'lg-official-support-manual'
        });
      }
    } catch (error) {
      // Missing official support records are expected for older/discontinued rows.
    }
    if (target.sourceUrl) {
      sourceCandidates.push({
        sourceUrl: String(target.sourceUrl).trim(),
        source: 'manual-evidence'
      });
    }

    const seen = new Set();
    const uniqueCandidates = sourceCandidates.filter((candidate) => {
      const sourceUrl = String(candidate.sourceUrl || '').trim();
      if (!sourceUrl || seen.has(sourceUrl)) return false;
      seen.add(sourceUrl);
      return true;
    });

    if (!uniqueCandidates.length) {
      failures.push({
        id: target.id,
        sku: target.sku,
        category: target.category,
        bucket: 'Missing PDF',
        reason: 'No source_url in data/manual-evidence.json and LG support API returned no PDF'
      });
      continue;
    }

    let lastError = null;
    try {
      for (const candidate of uniqueCandidates) {
        const sourceUrl = candidate.sourceUrl;
        try {
          const suffix = uniqueCandidates.length > 1 ? `-${sourceCandidates.indexOf(candidate) + 1}` : '';
          const destPath = path.join(repoRoot, '.tmp', 'pdfs', 'lg', `${slugPathPart(target.sku)}${suffix}.pdf`);
          logger.log?.(`[lg-sweep] ${target.sku}: fetching ${sourceUrl}`);
          const fetchResult = await fetchPdfImpl(sourceUrl, destPath, {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            maxBytes: DEFAULT_MAX_BYTES
          });
          const extractedText = await extractTextImpl(fetchResult.path || destPath);
          const parsed = parseLgText(extractedText.text, {
            target,
            sourceUrl,
            extractionDate: runAt,
            verifiedAlias: target.verifiedAlias
          });
          const validation = validateStrictImpl(parsed.data);
          if (!validation.valid) {
            throw new Error(`Validation failed: ${(validation.errors || []).join('; ')}`);
          }
          if (validation.requiresManualReview) {
            throw new Error('Validation requires manual review');
          }

          const strictData = validation.data || parsed.data;
          saveToVaultImpl({
            repoRoot,
            productId: target.id,
            product: target.product,
            strictData,
            sourceUrl,
            verifiedAt: runAt
          });
          successes.push({
            id: target.id,
            sku: target.sku,
            category: target.category,
            sourceUrl,
            confidence_score: strictData.metadata?.confidence_score ?? ''
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          logger.warn?.(`[lg-sweep] ${target.sku}: candidate ${candidate.source} failed: ${error.message}`);
        }
      }
      if (lastError) throw lastError;
    } catch (error) {
      const bucket = categorizeLgFailure(error);
      logger.warn?.(`[lg-sweep] ${target.sku}: ${bucket}: ${error.message}`);
      failures.push({
        id: target.id,
        sku: target.sku,
        category: target.category,
        bucket,
        reason: error.message
      });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const reportPath = writeLgSweepReport({
    repoRoot,
    processed: sweepTargets.length,
    successes,
    failures,
    runAt
  });

  return {
    processed: sweepTargets.length,
    successes,
    failures,
    reportPath
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    delayMs: 0,
    includeExistingRaw: false,
    skus: null
  };
  for (const arg of argv) {
    if (arg.startsWith('--delay-ms=')) {
      args.delayMs = Number.parseInt(arg.slice('--delay-ms='.length), 10);
    } else if (arg === '--include-existing-raw') {
      args.includeExistingRaw = true;
    } else if (arg.startsWith('--sku=')) {
      args.skus = arg.slice('--sku='.length)
        .split(',')
        .map(normalizeSku)
        .filter(Boolean);
    }
  }
  return args;
}

async function main() {
  const args = parseCliArgs();
  let targets = collectLgSweepTargets({
    repoRoot: process.cwd(),
    includeExistingRaw: args.includeExistingRaw
  });
  if (args.skus?.length) {
    const allowed = new Set(args.skus);
    targets = targets.filter((target) => allowed.has(normalizeSku(target.sku)));
  }
  const result = await runLgSweep({
    repoRoot: process.cwd(),
    targets,
    delayMs: Number.isFinite(args.delayMs) ? args.delayMs : 0
  });
  console.log(`[lg-sweep] processed ${result.processed}; successes ${result.successes.length}; failures ${result.failures.length}`);
  console.log(`[lg-sweep] report ${path.relative(process.cwd(), result.reportPath)}`);
  if (result.failures.length) {
    const buckets = result.failures.reduce((acc, failure) => {
      acc[failure.bucket] = (acc[failure.bucket] || 0) + 1;
      return acc;
    }, {});
    console.log(`[lg-sweep] fail-closed buckets ${JSON.stringify(buckets)}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

exports.categorizeLgFailure = categorizeLgFailure;
exports.collectLgSweepTargets = collectLgSweepTargets;
exports.normalizeSku = normalizeSku;
exports.runLgSweep = runLgSweep;
exports.writeLgSweepReport = writeLgSweepReport;
