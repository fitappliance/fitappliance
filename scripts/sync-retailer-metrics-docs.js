'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { computeRetailerMetrics } = require('./common/retailer-metrics.js');

function fmt(value) {
  return Number(value).toLocaleString('en-AU');
}

function percentage(numerator, denominator) {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : '0.0%';
}

function replaceGeneratedBlock(source, marker, content) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex
    || source.indexOf(start, startIndex + start.length) >= 0
    || source.indexOf(end, endIndex + end.length) >= 0) {
    throw new Error(`exactly one ordered ${marker} block required`);
  }
  return `${source.slice(0, startIndex)}${start}\n${content.trim()}\n${end}${source.slice(endIndex + end.length)}`;
}

function auditTable(rows, totals) {
  const lines = [
    '| Category | Products | Products with retailer links | Verified retailer links | Multi-retailer products | Positive price rows |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.label} | ${fmt(row.products)} | ${fmt(row.linkedProducts)} | ${fmt(row.retailerLinks)} | ${fmt(row.multiRetailerProducts)} | ${fmt(row.priceRows)} |`),
    `| **Total** | **${fmt(totals.products)}** | **${fmt(totals.linkedProducts)}** | **${fmt(totals.retailerLinks)}** | **${fmt(totals.multiRetailerProducts)}** | **${fmt(totals.priceRows)}** |`,
  ];
  return lines.join('\n');
}

function baselineTable(totals) {
  return [
    '| Metric | Count | Meaning |',
    '| --- | ---: | --- |',
    `| Raw specs catalog | ${fmt(totals.products)} | Sizing/spec rows across fridges, dishwashers, dryers, and washing machines. |`,
    `| Retailer-verified products | ${fmt(totals.linkedProducts)} | Products with at least one verified product-page link from the five tracked retailers. |`,
    `| Verified retailer links | ${fmt(totals.retailerLinks)} | Total product-page links across JB Hi-Fi, Appliances Online, The Good Guys, Harvey Norman, and Bing Lee. |`,
    `| Multi-retailer products | ${fmt(totals.multiRetailerProducts)} | Products with two or more verified retailer product-page links. |`,
    `| Live price rows | ${fmt(totals.priceRows)} | Positive retailer prices captured with enough evidence to show as price data. |`,
  ].join('\n');
}

function coverageTable(rows, totals) {
  return [
    '| Category | Raw specs | Retailer-verified products | Verified retailer links | Multi-retailer products | Link coverage |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.label} | ${fmt(row.products)} | ${fmt(row.linkedProducts)} | ${fmt(row.retailerLinks)} | ${fmt(row.multiRetailerProducts)} | ${percentage(row.linkedProducts, row.products)} |`),
    `| **Total** | **${fmt(totals.products)}** | **${fmt(totals.linkedProducts)}** | **${fmt(totals.retailerLinks)}** | **${fmt(totals.multiRetailerProducts)}** | **${percentage(totals.linkedProducts, totals.products)}** |`,
  ].join('\n');
}

function writeUpdated(filePath, markerBlocks) {
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = Object.entries(markerBlocks).reduce(
    (source, [marker, content]) => replaceGeneratedBlock(source, marker, content),
    original,
  );
  if (updated !== original) fs.writeFileSync(filePath, updated);
  return updated !== original;
}

function syncRetailerMetricsDocs({ repoRoot = path.resolve(__dirname, '..') } = {}) {
  const { rows, totals } = computeRetailerMetrics(path.join(repoRoot, 'public', 'data'));
  const summary = `- \u2705 Catalog: raw specs catalog: ${fmt(totals.products)} products across 4 categories; retailer-verified products: ${fmt(totals.linkedProducts)}; verified retailer links: ${fmt(totals.retailerLinks)}; live price rows: ${fmt(totals.priceRows)}`;
  const auditSummary = `The current raw specs catalog has ${fmt(totals.products)} products;\nretailer-verified products: ${fmt(totals.linkedProducts)}; verified retailer product-page links in total:\n${fmt(totals.retailerLinks)}; live price rows: ${fmt(totals.priceRows)}. That means the UI must be careful about three words:\nprice, stock, and requirement.`;
  const changed = [];
  if (writeUpdated(path.join(repoRoot, 'README.md'), { RETAILER_METRICS_SUMMARY: summary })) changed.push('README.md');
  if (writeUpdated(path.join(repoRoot, 'docs', 'display-data-accuracy-audit.md'), {
    RETAILER_METRICS_SUMMARY: auditSummary,
    RETAILER_METRICS_TABLE: auditTable(rows, totals),
  })) changed.push('docs/display-data-accuracy-audit.md');
  if (writeUpdated(path.join(repoRoot, 'docs', 'retailer-data-expansion-plan.md'), {
    RETAILER_METRICS_BASELINE: baselineTable(totals),
    RETAILER_METRICS_COVERAGE: coverageTable(rows, totals),
  })) changed.push('docs/retailer-data-expansion-plan.md');
  const promotion = [
    `- **${fmt(totals.products)} raw appliance spec rows** across fridges, washing machines, dishwashers, and dryers`,
    `- **${fmt(totals.linkedProducts)} products with verified retailer product-page links** across tracked AU retailers`,
    `- **${fmt(totals.retailerLinks)} verified retailer product-page links**; live price rows are ${fmt(totals.priceRows)}`,
  ].join('\n');
  if (writeUpdated(path.join(repoRoot, 'docs', 'promotion-kit.md'), {
    RETAILER_METRICS_PROMOTION: promotion,
  })) changed.push('docs/promotion-kit.md');
  return { rows, totals, changed };
}

if (require.main === module) {
  const result = syncRetailerMetricsDocs();
  process.stdout.write(`${JSON.stringify({ totals: result.totals, changed: result.changed }, null, 2)}\n`);
}

module.exports = { replaceGeneratedBlock, syncRetailerMetricsDocs };
