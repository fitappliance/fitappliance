'use strict';

const fs = require('node:fs');
const path = require('node:path');

function safeSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function writeScrapeReport(retailer, category, results, summary = {}, opts = {}) {
  const now = opts.now ?? new Date();
  const runAt = now.toISOString();
  const products = Array.isArray(results) ? results : [];
  const matchedCount = products.filter((product) => product.matched || product.match?.matched).length;
  const document = {
    retailer,
    category,
    run_at: runAt,
    scraped_count: summary.scraped_count ?? products.length,
    matched_count: summary.matched_count ?? matchedCount,
    unmatched_count: summary.unmatched_count ?? Math.max(0, (summary.scraped_count ?? products.length) - (summary.matched_count ?? matchedCount)),
    products,
    ...summary.extra,
  };

  const outputDir = opts.outputDir ?? path.join(process.cwd(), 'reports', 'scrape');
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${safeSlug(retailer)}-${safeSlug(category)}-${runAt.slice(0, 10)}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
  return { filePath, document };
}

module.exports = {
  writeScrapeReport,
};

