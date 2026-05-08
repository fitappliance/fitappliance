#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const HOST = 'www.fitappliance.com.au';
const KEY_FILE = path.join(__dirname, '..', '.indexnow-key');
const SITEMAP = path.join(__dirname, '..', 'public', 'sitemap.xml');
const DEFAULT_REPORT_DATE = '2026-05-08';
const ENDPOINTS = {
  api: { name: 'IndexNow API', hostname: 'api.indexnow.org', path: '/IndexNow' },
  bing: { name: 'Bing', hostname: 'www.bing.com', path: '/indexnow' },
  yandex: { name: 'Yandex', hostname: 'yandex.com', path: '/indexnow' }
};

function parseSitemapUrls(xmlText) {
  return [...xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function normalizeUrlHost(url, host = HOST) {
  return String(url).replace('https://www.fitappliance.com.au', `https://${host}`);
}

function filterSitemapUrls(urls, { includePrefix = null, host = HOST } = {}) {
  return urls
    .map((url) => normalizeUrlHost(url, host))
    .filter((url) => {
      if (!includePrefix) return true;
      try {
        return new URL(url).pathname.startsWith(includePrefix);
      } catch {
        return false;
      }
    });
}

function buildIndexNowPayload({ host = HOST, key, urls }) {
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls
  };
}

function postJson({ endpoint, payload, timeoutMs = 30000 }) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: endpoint.hostname,
      path: endpoint.path,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`IndexNow request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseArgs(argv) {
  const args = {
    includePrefix: null,
    reportPath: null,
    endpoints: [ENDPOINTS.api]
  };

  for (const arg of argv) {
    if (arg === '--fit-check-only') args.includePrefix = '/fit-check/';
    if (arg.startsWith('--include-prefix=')) args.includePrefix = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--report=')) args.reportPath = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--engines=')) {
      args.endpoints = arg
        .split('=')
        .slice(1)
        .join('=')
        .split(',')
        .map((name) => ENDPOINTS[name.trim().toLowerCase()])
        .filter(Boolean);
    }
  }

  if (args.endpoints.length === 0) args.endpoints = [ENDPOINTS.api];
  return args;
}

async function pingIndexNow({
  keyFile = KEY_FILE,
  sitemapPath = SITEMAP,
  host = HOST,
  includePrefix = null,
  endpoints = [ENDPOINTS.api],
  reportPath = null,
  reportDate = DEFAULT_REPORT_DATE,
  requester = postJson,
  logger = console
} = {}) {
  if (!fs.existsSync(keyFile)) {
    throw new Error('[indexnow] Missing .indexnow-key');
  }
  if (!fs.existsSync(sitemapPath)) {
    throw new Error('[indexnow] Missing public/sitemap.xml');
  }

  const key = fs.readFileSync(keyFile, 'utf8').trim();
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const urls = filterSitemapUrls(parseSitemapUrls(sitemap), { includePrefix, host });

  if (!key || !/^[a-f0-9]{32}$/u.test(key)) {
    throw new Error('[indexnow] Invalid key format in .indexnow-key');
  }
  if (urls.length === 0) {
    throw new Error('[indexnow] No URLs found in sitemap');
  }

  const payload = buildIndexNowPayload({
    host,
    key,
    urls
  });
  const responses = [];

  for (const endpoint of endpoints) {
    try {
      const response = await requester({ endpoint, payload });
      responses.push({
        engine: endpoint.name,
        endpoint: `https://${endpoint.hostname}${endpoint.path}`,
        statusCode: response.statusCode,
        ok: response.statusCode === 200 || response.statusCode === 202,
        body: String(response.body ?? '').slice(0, 500)
      });
      logger.log(`[indexnow] ${endpoint.name} HTTP ${response.statusCode} for ${urls.length} URLs`);
    } catch (error) {
      responses.push({
        engine: endpoint.name,
        endpoint: `https://${endpoint.hostname}${endpoint.path}`,
        statusCode: null,
        ok: false,
        error: error.message
      });
      logger.error(`[indexnow] ${endpoint.name} failed: ${error.message}`);
    }
  }

  const report = {
    schema_version: 1,
    report_date: reportDate,
    host,
    includePrefix,
    urlCount: urls.length,
    urls,
    responses
  };

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  pingIndexNow(args).then((report) => {
    if (report.responses.some((row) => !row.ok)) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ENDPOINTS,
  buildIndexNowPayload,
  filterSitemapUrls,
  parseArgs,
  parseSitemapUrls,
  pingIndexNow
};
