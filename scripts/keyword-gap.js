'use strict';

const path = require('node:path');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');

function parseSitemapUrls(xmlText = '') {
  const matches = xmlText.matchAll(/<loc>([\s\S]*?)<\/loc>/g);
  const urls = [];
  for (const match of matches) {
    urls.push(String(match[1]).trim());
  }
  return urls;
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(text) {
  const stopWords = new Set([
    'a',
    'and',
    'appliance',
    'au',
    'australia',
    'for',
    'fit',
    'in',
    'mm',
    'of',
    'the',
    'to',
    'with'
  ]);

  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function looksCoveredBySitemap(query, sitemapUrls = []) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = normalizeText(sitemapUrls.join(' '));
  return tokens.some((token) => haystack.includes(token));
}

function buildKeywordGapReport({ today = new Date().toISOString().slice(0, 10), sitemapUrls = [], rows = [] } = {}) {
  const cleanRows = Array.isArray(rows) ? rows : [];
  const opportunities = cleanRows
    .filter((row) => Number(row?.position) >= 11 && Number(row?.position) <= 20)
    .sort((left, right) => Number(right?.impressions ?? 0) - Number(left?.impressions ?? 0))
    .map((row) => ({
      query: row.query,
      page: row.page,
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0)
    }));

  const contentGapMap = new Map();
  cleanRows.forEach((row) => {
    if (Number(row?.impressions ?? 0) <= 0) return;
    if (looksCoveredBySitemap(row.query, sitemapUrls)) return;
    const key = normalizeText(row.query);
    const existing = contentGapMap.get(key);
    if (!existing || Number(row.impressions ?? 0) > existing.impressions) {
      contentGapMap.set(key, {
        query: row.query,
        impressions: Number(row.impressions ?? 0),
        ctr: Number(row.ctr ?? 0),
        position: Number(row.position ?? 0)
      });
    }
  });

  const contentGaps = [...contentGapMap.values()].sort((left, right) => right.impressions - left.impressions);

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    summary: {
      totalQueries: cleanRows.length,
      contentGaps: contentGaps.length,
      optimizationOpportunities: opportunities.length
    },
    contentGaps,
    opportunities
  };
}

function toMarkdown(report) {
  const contentGapLines = report.contentGaps.length
    ? report.contentGaps
      .slice(0, 30)
      .map((row) => `- \`${row.query}\` — impressions: ${row.impressions}, position: ${row.position}`)
      .join('\n')
    : '- None detected.';

  const opportunityLines = report.opportunities.length
    ? report.opportunities
      .slice(0, 30)
      .map(
        (row) =>
          `- \`${row.query}\` → [${row.page}](${row.page}) (position ${row.position}, impressions ${row.impressions}, ctr ${row.ctr})`
      )
      .join('\n')
    : '- None detected.';

  return [
    '# Keyword Gap Report',
    '',
    `Generated: ${report.date}`,
    '',
    '## Summary',
    `- Total queries: ${report.summary.totalQueries}`,
    `- Content gaps: ${report.summary.contentGaps}`,
    `- Position 11-20 opportunities: ${report.summary.optimizationOpportunities}`,
    '',
    '## Content gaps',
    contentGapLines,
    '',
    '## Page-2 opportunities',
    opportunityLines,
    ''
  ].join('\n');
}

async function writeKeywordGapReport({ reportsDir, report }) {
  await mkdir(reportsDir, { recursive: true });
  const datedPath = path.join(reportsDir, `keyword-gap-${report.date}.md`);
  const latestPath = path.join(reportsDir, 'keyword-gap-latest.md');
  const markdown = toMarkdown(report);
  await writeFile(datedPath, markdown, 'utf8');
  await writeFile(latestPath, markdown, 'utf8');
  return datedPath;
}

async function readRowsFromReportFile(reportPath) {
  const text = await readFile(reportPath, 'utf8');
  const report = JSON.parse(text);
  return Array.isArray(report?.rows) ? report.rows : [];
}

async function findLatestGscReportPath(reportsDir) {
  const entries = await readdir(reportsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^gsc-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error(`No dated gsc report found in ${reportsDir}. Run \`npm run gsc-fetch\` first.`);
  }

  return path.join(reportsDir, files[files.length - 1]);
}

async function runKeywordGap({
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(repoRoot, 'reports'),
  sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  gscReportPath = null,
  today = new Date().toISOString().slice(0, 10),
  logger = console
} = {}) {
  const resolvedReportPath = gscReportPath ?? (await findLatestGscReportPath(reportsDir));
  const rows = await readRowsFromReportFile(resolvedReportPath);
  const sitemapXml = await readFile(sitemapPath, 'utf8');
  const sitemapUrls = parseSitemapUrls(sitemapXml);
  const report = buildKeywordGapReport({ today, sitemapUrls, rows });
  const outputPath = await writeKeywordGapReport({ reportsDir, report });
  logger.log(`Generated keyword gap report at ${outputPath}`);
  return { outputPath, report };
}

if (require.main === module) {
  runKeywordGap().catch((error) => {
    console.error(`[keyword-gap] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseSitemapUrls,
  normalizeText,
  buildKeywordGapReport,
  toMarkdown,
  writeKeywordGapReport,
  readRowsFromReportFile,
  findLatestGscReportPath,
  runKeywordGap
};
