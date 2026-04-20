'use strict';

const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { writeJsonAtomically } = require('./utils/file-utils.js');

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_SITE_URL = 'sc-domain:fitappliance.com.au';
const FALLBACK_SITE_URLS = ['https://www.fitappliance.com.au/', 'https://www.fitappliance.com.au/'];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseServiceAccountJson(raw) {
  if (!raw || !String(raw).trim()) {
    throw new Error('GSC_SA_JSON is required to fetch Google Search Console data.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`GSC_SA_JSON is not valid JSON: ${error.message}`);
  }

  const requiredFields = ['client_email', 'private_key', 'token_uri'];
  for (const field of requiredFields) {
    if (!parsed[field] || typeof parsed[field] !== 'string') {
      throw new Error(`GSC_SA_JSON missing required service account field: ${field}`);
    }
  }

  return parsed;
}

function normalizeSearchAnalyticsRows(rawRows = []) {
  return rawRows
    .map((row) => {
      const keys = Array.isArray(row?.keys) ? row.keys : [];
      return {
        query: String(keys[0] ?? '').trim(),
        page: String(keys[1] ?? '').trim(),
        clicks: Number(row?.clicks ?? 0),
        impressions: Number(row?.impressions ?? 0),
        ctr: Number(row?.ctr ?? 0),
        position: Number(row?.position ?? 0)
      };
    })
    .filter((row) => row.query || row.page);
}

function validateSearchAnalyticsRows(rows = []) {
  rows.forEach((row, index) => {
    const prefix = `Row ${index}`;
    if (!Number.isFinite(row.clicks) || row.clicks < 0) {
      throw new Error(`${prefix} clicks must be a non-negative number.`);
    }
    if (!Number.isFinite(row.impressions) || row.impressions < 0) {
      throw new Error(`${prefix} impressions must be a non-negative number.`);
    }
    if (!Number.isFinite(row.ctr) || row.ctr < 0 || row.ctr > 1) {
      throw new Error(`${prefix} ctr must be within [0,1].`);
    }
    if (!Number.isFinite(row.position) || row.position <= 0) {
      throw new Error(`${prefix} position must be greater than 0.`);
    }
  });
}

function buildSearchAnalyticsQueryFn({ serviceAccount, googleapisModule } = {}) {
  const { google } = googleapisModule ?? require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: [GSC_SCOPE]
  });
  const webmasters = google.webmasters({ version: 'v3', auth });

  return async function querySearchAnalytics({ siteUrl, startDate, endDate, rowLimit = 25000, dimensions = ['query', 'page'] }) {
    return webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit
      }
    });
  };
}

function isPermissionError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes('sufficient permission');
}

function buildSiteUrlCandidates(siteUrl) {
  const base = String(siteUrl || DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL;
  const candidates = [base];
  if (base === DEFAULT_SITE_URL) {
    candidates.push(...FALLBACK_SITE_URLS);
  }
  return [...new Set(candidates)];
}

function summarizeRows(rows = []) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks;
      acc.impressions += row.impressions;
      acc.position += row.position;
      return acc;
    },
    { clicks: 0, impressions: 0, position: 0 }
  );

  return {
    rowCount: rows.length,
    totalClicks: totals.clicks,
    totalImpressions: totals.impressions,
    averageCtr: totals.impressions > 0 ? Number((totals.clicks / totals.impressions).toFixed(4)) : 0,
    averagePosition: rows.length > 0 ? Number((totals.position / rows.length).toFixed(2)) : 0
  };
}

async function fetchGscReport({
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(repoRoot, 'reports'),
  siteUrl = DEFAULT_SITE_URL,
  windowDays = 28,
  today = formatDate(new Date()),
  serviceAccountJson = process.env.GSC_SA_JSON,
  searchanalyticsQueryFn = null,
  googleapisModule = null,
  write = true,
  logger = console
} = {}) {
  const day = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    throw new Error(`Invalid today value: ${today}`);
  }
  const start = new Date(day);
  start.setUTCDate(start.getUTCDate() - Math.max(1, windowDays) + 1);
  const startDate = formatDate(start);
  const endDate = formatDate(day);

  const serviceAccount = parseServiceAccountJson(serviceAccountJson);
  const queryFn =
    searchanalyticsQueryFn
    ?? buildSearchAnalyticsQueryFn({
      serviceAccount,
      googleapisModule
    });

  const candidateSiteUrls = buildSiteUrlCandidates(siteUrl);
  let response = null;
  let effectiveSiteUrl = candidateSiteUrls[0];
  let lastError = null;

  for (const candidateSiteUrl of candidateSiteUrls) {
    try {
      response = await queryFn({
        siteUrl: candidateSiteUrl,
        startDate,
        endDate,
        rowLimit: 25000,
        dimensions: ['query', 'page']
      });
      effectiveSiteUrl = candidateSiteUrl;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isPermissionError(error) || candidateSiteUrl === candidateSiteUrls[candidateSiteUrls.length - 1]) {
        throw error;
      }
    }
  }

  if (!response) {
    throw lastError ?? new Error('Unable to fetch GSC Search Analytics data.');
  }

  const rows = normalizeSearchAnalyticsRows(response?.data?.rows ?? []);
  validateSearchAnalyticsRows(rows);

  const document = {
    generatedAt: new Date().toISOString(),
    siteUrl: effectiveSiteUrl,
    requestedSiteUrl: siteUrl,
    range: {
      days: windowDays,
      startDate,
      endDate
    },
    summary: summarizeRows(rows),
    rows
  };

  let outputPath = null;
  if (write) {
    await mkdir(reportsDir, { recursive: true });
    outputPath = path.join(reportsDir, `gsc-${today}.json`);
    const latestPath = path.join(reportsDir, 'gsc-latest.json');
    await writeJsonAtomically(outputPath, document);
    await writeJsonAtomically(latestPath, document);
    logger.log(`Generated GSC report with ${rows.length} rows at ${outputPath}`);
  }

  return {
    outputPath,
    ...document
  };
}

async function runCli() {
  try {
    const result = await fetchGscReport();
    console.log(`[gsc-fetch] rows=${result.summary.rowCount} site=${result.siteUrl}`);
  } catch (error) {
    console.error(`[gsc-fetch] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DEFAULT_SITE_URL,
  FALLBACK_SITE_URLS,
  GSC_SCOPE,
  parseServiceAccountJson,
  normalizeSearchAnalyticsRows,
  validateSearchAnalyticsRows,
  buildSiteUrlCandidates,
  buildSearchAnalyticsQueryFn,
  fetchGscReport
};
