#!/usr/bin/env node

const path = require('node:path');
const { getAdapter } = require('./adapters/index.js');
const {
  buildDiscoveryReport,
  diffDiscoveries,
  loadExistingModelSet,
  writeDiscoveryReport,
} = require('./lib/catalog.js');
const { collectSitemapUrls } = require('./lib/sitemap.js');

const REPO_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((args, token) => {
    if (!token.startsWith('--')) return args;
    const [rawKey, ...rawValue] = token.slice(2).split('=');
    return {
      ...args,
      [rawKey]: rawValue.length > 0 ? rawValue.join('=') : true,
    };
  }, {});
}

function integerArg(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function runScout({
  catalogPath = path.join(REPO_ROOT, 'data/catalog-final.json'),
  delayMs = 1000,
  fetchImpl,
  generatedAt = new Date().toISOString(),
  maxSitemaps = 25,
  outputPath = path.join(REPO_ROOT, 'data/discovery-report.json'),
  retailer = 'appliancesonline',
  sitemapUrls,
  timeoutMs = 30000,
} = {}) {
  const adapter = getAdapter(retailer);
  const seeds = sitemapUrls?.length ? sitemapUrls : adapter.sitemapUrls;
  const existingModelSet = loadExistingModelSet(catalogPath);
  const { fetchedSitemaps, productUrls } = await collectSitemapUrls(seeds, {
    delayMs,
    fetchImpl,
    maxSitemaps,
    timeoutMs,
    userAgent: adapter.userAgent,
  });
  const allDiscoveries = adapter.extractDiscoveries(productUrls);
  const delta = diffDiscoveries(allDiscoveries, existingModelSet);
  const report = buildDiscoveryReport({
    discoveries: delta,
    generatedAt,
    retailer: adapter.retailer,
    sourceUrls: fetchedSitemaps,
  });

  writeDiscoveryReport(report, outputPath);

  return {
    all_discovery_count: allDiscoveries.length,
    fetched_sitemap_count: fetchedSitemaps.length,
    outputPath,
    report,
    scanned_url_count: productUrls.length,
  };
}

async function main() {
  const args = parseArgs();
  const retailer = args.retailer || 'appliancesonline';
  const catalogPath = args.catalog
    ? path.resolve(process.cwd(), args.catalog)
    : path.join(REPO_ROOT, 'data/catalog-final.json');
  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(REPO_ROOT, 'data/discovery-report.json');
  const sitemapUrls = args['sitemap-url'] ? [String(args['sitemap-url'])] : undefined;

  console.log(`[discovery] retailer=${retailer}`);
  console.log(`[discovery] catalog=${catalogPath}`);
  console.log(`[discovery] output=${outputPath}`);

  const result = await runScout({
    catalogPath,
    delayMs: integerArg(args['delay-ms'], 1000),
    maxSitemaps: integerArg(args['max-sitemaps'], 25),
    outputPath,
    retailer,
    sitemapUrls,
    timeoutMs: integerArg(args['timeout-ms'], 30000),
  });

  console.log(`[discovery] fetched_sitemaps=${result.fetched_sitemap_count}`);
  console.log(`[discovery] scanned_urls=${result.scanned_url_count}`);
  console.log(`[discovery] retailer_product_candidates=${result.all_discovery_count}`);
  console.log(`[discovery] new_discoveries=${result.report.summary.new_discovery_count}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[discovery] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runScout,
};
