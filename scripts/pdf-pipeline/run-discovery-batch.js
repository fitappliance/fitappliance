#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { runBatch, MISSING_API_KEY_MESSAGE } = require('./run-batch.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANUAL_EVIDENCE = path.join(REPO_ROOT, 'data', 'manual-evidence.json');

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((args, token) => {
    if (!token.startsWith('--')) return args;
    const [rawKey, ...rawValue] = token.slice(2).split('=');
    return {
      ...args,
      [rawKey]: rawValue.length > 0 ? rawValue.join('=') : true
    };
  }, {});
}

function integerArg(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasApprovedPdfEvidence(entry) {
  if (entry?.has_pdf_evidence === true) return true;
  return (entry?.evidence || []).some((item) => (
    item?.has_pdf_evidence === true
    || (item?.status === 'approved' && item?.raw_json_path)
  ));
}

function isDiscoveryCandidate(entry) {
  return Boolean(
    entry
    && entry.source_url
    && entry.status !== 'rejected'
    && entry.product
    && entry.discovery?.retailer_key === 'appliancesonline'
  );
}

function loadDiscoveryTargets({
  manualEvidencePath = DEFAULT_MANUAL_EVIDENCE,
  category = null,
  limit = null,
  skus = null
} = {}) {
  const skuFilter = skus
    ? new Set(skus.map(normalizeSku).filter(Boolean))
    : null;
  const manifest = readJson(manualEvidencePath, { products: {} });
  const targets = Object.entries(manifest.products || {})
    .filter(([, entry]) => isDiscoveryCandidate(entry))
    .filter(([, entry]) => !hasApprovedPdfEvidence(entry))
    .filter(([, entry]) => !category || entry.category === category)
    .filter(([, entry]) => {
      if (!skuFilter) return true;
      return skuFilter.has(normalizeSku(entry.model)) || skuFilter.has(normalizeSku(entry.sku));
    })
    .map(([id, entry]) => ({
      id,
      brand: entry.brand,
      sku: entry.model || entry.sku,
      category: entry.category,
      product: {
        ...(entry.product || {}),
        id,
        brand: entry.brand,
        model: entry.model || entry.sku,
        cat: entry.category
      }
    }));

  return Number.isFinite(limit) && limit >= 0 ? targets.slice(0, limit) : targets;
}

async function runDiscoveryBatch({
  repoRoot = REPO_ROOT,
  category = null,
  delayMs = 3000,
  limit = null,
  manualEvidencePath = DEFAULT_MANUAL_EVIDENCE,
  skus = null,
  logger = console,
  env = process.env
} = {}) {
  if (!String(env.OPENAI_API_KEY || '').trim()) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  const targets = loadDiscoveryTargets({ manualEvidencePath, category, limit, skus });
  logger.log(`[discovery-batch] targets=${targets.length}`);
  return runBatch({
    repoRoot,
    targets,
    delayMs,
    logger,
    env
  });
}

async function main() {
  const args = parseArgs();
  const skus = args.sku
    ? String(args.sku).split(',').map((sku) => sku.trim()).filter(Boolean)
    : null;
  const result = await runDiscoveryBatch({
    category: args.category || null,
    delayMs: integerArg(args['delay-ms'], 3000),
    limit: args.limit === undefined ? null : integerArg(args.limit, null),
    skus
  });

  console.log(`Discovery PDF batch complete: ${result.successes.length} success, ${result.failures.length} failures, ${result.discrepancies.length} discrepancies`);
  console.log(`Report: ${result.reportPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[discovery-batch] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  loadDiscoveryTargets,
  runDiscoveryBatch
};
