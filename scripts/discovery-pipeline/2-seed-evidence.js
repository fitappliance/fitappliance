#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const {
  fetchAppliancesOnlineProductBundle,
  sleep
} = require('./lib/appliances-online-product-api.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_DISCOVERY_REPORT = path.join(REPO_ROOT, 'data', 'discovery-report.json');
const DEFAULT_MANUAL_EVIDENCE = path.join(REPO_ROOT, 'data', 'manual-evidence.json');
const DEFAULT_REPORT_DIR = path.join(REPO_ROOT, 'reports', 'discovery-pipeline');

const DEFAULT_MANIFEST = {
  schema_version: 1,
  last_updated: '1970-01-01',
  storage: {
    root_env: 'EVIDENCE_ROOT_DIR',
    path_rule: 'Each evidence.local_path is relative to EVIDENCE_ROOT_DIR.'
  },
  products: {}
};

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function dateOnly(value = new Date().toISOString()) {
  return String(value).slice(0, 10);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function flattenDiscoveryReport(report, { category = null } = {}) {
  const grouped = report?.new_discoveries || {};
  const rows = [];
  for (const [cat, brands] of Object.entries(grouped)) {
    if (category && cat !== category) continue;
    for (const [brand, items] of Object.entries(brands || {})) {
      for (const item of Array.isArray(items) ? items : []) {
        rows.push({
          category: cat,
          brand: item.brand || brand,
          model: item.model,
          url: item.url,
          retailer: item.retailer || 'Appliances Online',
          retailer_key: item.retailer_key || 'appliancesonline',
          source: item.source || 'sitemap'
        });
      }
    }
  }
  return rows;
}

function dedupeDiscoveries(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = `${row.category}:${normalizeKey(row.brand)}:${normalizeKey(row.model)}:${row.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function hasExistingApprovedEvidence(entry) {
  if (entry?.has_pdf_evidence === true) return true;
  return (entry?.evidence || []).some((item) => item?.has_pdf_evidence === true || item?.status === 'approved');
}

function buildManifestEntry({ bundle, selectedManual, seededAt }) {
  const product = bundle.product;
  const productId = product.id;
  return {
    productId,
    entry: {
      category: product.cat,
      brand: product.brand,
      model: product.model,
      sku: product.model,
      source_url: selectedManual.url,
      type: 'spec_sheet',
      status: 'candidate',
      has_pdf_evidence: false,
      seeded_at: seededAt,
      product,
      discovery: {
        ...product.discovery,
        source_discovery_url: bundle.discovery.url,
        source_report: 'data/discovery-report.json'
      },
      evidence: [
        {
          type: 'spec_sheet',
          status: 'candidate',
          source_url: selectedManual.url,
          seeded_at: seededAt,
          source: 'appliances-online-manuals-api',
          title: selectedManual.name || selectedManual.description || 'Appliances Online PDF'
        }
      ]
    }
  };
}

async function seedDiscoveryEvidence({
  discoveryReportPath = DEFAULT_DISCOVERY_REPORT,
  manualEvidencePath = DEFAULT_MANUAL_EVIDENCE,
  outputReportPath = null,
  category = null,
  delayMs = 250,
  fetchImpl = globalThis.fetch,
  limit = null,
  logger = console,
  runAt = new Date().toISOString(),
  timeoutMs = 30_000
} = {}) {
  const discoveryReport = readJson(discoveryReportPath, { new_discoveries: {} });
  const manifest = {
    ...DEFAULT_MANIFEST,
    ...readJson(manualEvidencePath, DEFAULT_MANIFEST)
  };
  const products = { ...(manifest.products || {}) };
  const candidates = dedupeDiscoveries(flattenDiscoveryReport(discoveryReport, { category }));
  const targets = Number.isFinite(limit) && limit >= 0 ? candidates.slice(0, limit) : candidates;
  const seeded = [];
  const skipped = [];
  const failures = [];
  const seededAt = dateOnly(runAt);

  for (let index = 0; index < targets.length; index += 1) {
    const discovery = targets[index];
    logger.log(`[seed] ${index + 1}/${targets.length} ${discovery.category} ${discovery.brand} ${discovery.model}`);
    try {
      const bundle = await fetchAppliancesOnlineProductBundle(discovery, { fetchImpl, timeoutMs });
      const existing = products[bundle.product.id];
      if (hasExistingApprovedEvidence(existing)) {
        skipped.push({
          id: bundle.product.id,
          brand: bundle.product.brand,
          model: bundle.product.model,
          reason: 'already has approved evidence'
        });
      } else if (!bundle.selectedManual) {
        failures.push({
          brand: discovery.brand,
          model: discovery.model,
          category: discovery.category,
          url: discovery.url,
          reason: 'no usable PDF manual/spec sheet found'
        });
      } else {
        const { productId, entry } = buildManifestEntry({
          bundle,
          selectedManual: bundle.selectedManual,
          seededAt
        });
        products[productId] = {
          ...(products[productId] || {}),
          ...entry
        };
        seeded.push({
          id: productId,
          brand: entry.brand,
          model: entry.model,
          category: entry.category,
          source_url: entry.source_url,
          retailer_url: entry.product?.discovery?.product_url || discovery.url
        });
      }
    } catch (error) {
      failures.push({
        brand: discovery.brand,
        model: discovery.model,
        category: discovery.category,
        url: discovery.url,
        reason: error.message
      });
    }

    if (delayMs > 0 && index < targets.length - 1) {
      await sleep(delayMs);
    }
  }

  const nextManifest = {
    ...manifest,
    last_updated: seededAt,
    products
  };
  writeJson(manualEvidencePath, nextManifest);

  const report = {
    schema_version: 1,
    run_at: runAt,
    discovery_report_path: path.relative(REPO_ROOT, discoveryReportPath),
    manual_evidence_path: path.relative(REPO_ROOT, manualEvidencePath),
    scanned_count: targets.length,
    seeded_count: seeded.length,
    skipped_count: skipped.length,
    failure_count: failures.length,
    seeded,
    skipped,
    failures
  };
  const reportPath = outputReportPath || path.join(DEFAULT_REPORT_DIR, `evidence-seed-${seededAt.replace(/-/g, '')}.json`);
  writeJson(reportPath, report);

  return { report, reportPath, manualEvidencePath };
}

async function main() {
  const args = parseArgs();
  const result = await seedDiscoveryEvidence({
    category: args.category || null,
    delayMs: integerArg(args['delay-ms'], 250),
    discoveryReportPath: args.discovery
      ? path.resolve(process.cwd(), args.discovery)
      : DEFAULT_DISCOVERY_REPORT,
    limit: args.limit === undefined ? null : integerArg(args.limit, null),
    manualEvidencePath: args.evidence
      ? path.resolve(process.cwd(), args.evidence)
      : DEFAULT_MANUAL_EVIDENCE,
    outputReportPath: args.output
      ? path.resolve(process.cwd(), args.output)
      : null,
    timeoutMs: integerArg(args['timeout-ms'], 30_000)
  });

  console.log(`[seed] complete seeded=${result.report.seeded_count} skipped=${result.report.skipped_count} failures=${result.report.failure_count}`);
  console.log(`[seed] report=${result.reportPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildManifestEntry,
  dedupeDiscoveries,
  flattenDiscoveryReport,
  seedDiscoveryEvidence
};
