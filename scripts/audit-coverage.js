'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

function percentage(covered, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((covered / total) * 100);
}

function toPercentString(value) {
  return `${Math.round(value)}%`;
}

function isPriceCovered(product) {
  return Number.isInteger(product?.price) && product.price > 0;
}

function isDirectUrlCovered(product) {
  return typeof product?.direct_url === 'string' && product.direct_url.startsWith('https://');
}

function isDoorSwingMissing(product) {
  return product?.door_swing_mm === null || product?.door_swing_mm === undefined;
}

function formatRankRow(rank, row) {
  const paddedRank = String(rank).padStart(3, ' ');
  const brand = String(row.brand).padEnd(18, ' ');
  const category = String(row.cat).padEnd(10, ' ');
  const total = String(row.total).padStart(5, ' ');
  const missing = String(row.missing).padStart(7, ' ');
  const coverage = `${String(row.pct).padStart(7, ' ')}%`;
  return `${paddedRank}   ${brand} ${category} ${total} ${missing} ${coverage}`;
}

async function auditCoverage({
  dataDir = path.join(path.resolve(__dirname, '..'), 'public', 'data'),
  outputPath = path.join(path.resolve(__dirname, '..'), 'docs', 'coverage-audit.json'),
  logger = console,
  write = true
} = {}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const appliancesText = await readFile(appliancesPath, 'utf8');
  const appliances = JSON.parse(appliancesText);
  const products = Array.isArray(appliances.products) ? appliances.products : [];

  const total = products.length;
  let hasPrice = 0;
  let hasDirectUrl = 0;
  let doorSwingMissing = 0;
  const perCategory = new Map();
  const byBrandAndCategory = new Map();

  for (const product of products) {
    if (isPriceCovered(product)) {
      hasPrice += 1;
    }

    if (isDirectUrlCovered(product)) {
      hasDirectUrl += 1;
    }

    const category = String(product?.cat ?? 'unknown');
    const categoryStats = perCategory.get(category) ?? { total: 0, missing: 0 };
    categoryStats.total += 1;

    const brand = String(product?.brand ?? 'UNKNOWN');
    const groupKey = `${category}::${brand}`;
    const groupStats = byBrandAndCategory.get(groupKey) ?? {
      brand,
      cat: category,
      total: 0,
      missing: 0
    };
    groupStats.total += 1;

    if (isDoorSwingMissing(product)) {
      doorSwingMissing += 1;
      categoryStats.missing += 1;
      groupStats.missing += 1;
    }

    perCategory.set(category, categoryStats);
    byBrandAndCategory.set(groupKey, groupStats);
  }

  const doorSwingCovered = total - doorSwingMissing;

  const doorSwingByBrand = Array.from(byBrandAndCategory.values())
    .map((row) => ({
      brand: row.brand,
      cat: row.cat,
      total: row.total,
      missing: row.missing,
      pct: percentage(row.total - row.missing, row.total)
    }))
    .sort((left, right) => {
      if (left.missing !== right.missing) return right.missing - left.missing;
      if (left.cat !== right.cat) return left.cat.localeCompare(right.cat);
      return left.brand.localeCompare(right.brand);
    });

  const categoryCoverage = Array.from(perCategory.entries())
    .map(([cat, stats]) => ({
      cat,
      total: stats.total,
      covered: stats.total - stats.missing,
      pct: percentage(stats.total - stats.missing, stats.total)
    }))
    .sort((left, right) => left.cat.localeCompare(right.cat));

  const report = {
    generated: new Date().toISOString().slice(0, 10),
    summary: {
      total,
      hasPrice,
      hasDirectUrl,
      doorSwingCovered,
      doorSwingMissing
    },
    doorSwingByBrand
  };

  logger.log(`=== FitAppliance Coverage Audit (${report.generated}) ===`);
  logger.log('DOOR SWING COVERAGE (door_swing_mm)');
  logger.log('Rank  Brand              Category   Total  Missing  Coverage');
  doorSwingByBrand.slice(0, 20).forEach((row, index) => {
    logger.log(formatRankRow(index + 1, row));
  });

  logger.log('PRICE COVERAGE');
  logger.log(`  Total products:        ${total}`);
  logger.log(`  Has price:             ${hasPrice} (${toPercentString(percentage(hasPrice, total))})`);
  logger.log(`  No price (unavailable): ${total - hasPrice} (${toPercentString(percentage(total - hasPrice, total))})`);
  logger.log(`  Has direct_url:        ${hasDirectUrl} (${toPercentString(percentage(hasDirectUrl, total))})`);

  logger.log('DATA COMPLETENESS BY CATEGORY');
  for (const row of categoryCoverage) {
    logger.log(
      `  ${row.cat}: ${String(row.total).padStart(5, ' ')} products  |  door_swing: ${String(row.pct).padStart(3, ' ')}% covered`
    );
  }

  if (write) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

if (require.main === module) {
  auditCoverage().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  auditCoverage,
  isPriceCovered,
  isDirectUrlCovered
};
