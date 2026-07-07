#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const HOST = 'www.fitappliance.com.au';
const REPO_ROOT = path.resolve(__dirname, '..');
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

function routeFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname === '/' ? '/' : pathname.replace(/\/+$/u, '');
  } catch {
    return null;
  }
}

function normalizeRoute(route) {
  const value = String(route || '').trim();
  if (!value) return null;
  const pathname = value.startsWith('http')
    ? routeFromUrl(value)
    : (value.startsWith('/') ? value : `/${value}`);
  if (!pathname) return null;
  return pathname === '/' ? '/' : pathname.replace(/\/+$/u, '');
}

function loadManifestRoutes(manifestPath, repoRoot = REPO_ROOT) {
  const resolvedPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(repoRoot, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const rows = [
    ...(Array.isArray(manifest.treatment) ? manifest.treatment : []),
    ...(Array.isArray(manifest.controls) ? manifest.controls : [])
  ];
  return new Set(rows.map((row) => normalizeRoute(row.route)).filter(Boolean));
}

function filterUrlsByManifest(urls, manifestRoutes) {
  if (!(manifestRoutes instanceof Set)) return urls;
  return urls.filter((url) => manifestRoutes.has(routeFromUrl(url)));
}

function routeToPagePath(route) {
  const normalized = normalizeRoute(route);
  if (!normalized) return null;
  if (normalized === '/') return 'index.html';
  return `${path.posix.join('pages', ...normalized.split('/').filter(Boolean))}.html`;
}

function normalizeChangedFile(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//u, '');
}

function filterUrlsByChangedFiles(urls, changedFiles) {
  if (!Array.isArray(changedFiles)) return urls;
  const changed = new Set(changedFiles.map(normalizeChangedFile).filter(Boolean));
  return urls.filter((url) => {
    const pagePath = routeToPagePath(routeFromUrl(url));
    return pagePath ? changed.has(pagePath) : false;
  });
}

function loadGitChangedFiles({ changedFrom, repoRoot = REPO_ROOT }) {
  const output = execFileSync('git', ['diff', '--name-only', changedFrom], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
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
    manifestPath: null,
    changedFrom: null,
    dryRun: false,
    endpoints: [ENDPOINTS.api]
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--fit-check-only') args.includePrefix = '/fit-check/';
    if (arg.startsWith('--include-prefix=')) args.includePrefix = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--report=')) args.reportPath = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--manifest=')) args.manifestPath = arg.split('=').slice(1).join('=');
    if (arg.startsWith('--changed-from=')) args.changedFrom = arg.split('=').slice(1).join('=');
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
  repoRoot = REPO_ROOT,
  host = HOST,
  includePrefix = null,
  manifestPath = null,
  changedFrom = null,
  changedFiles = null,
  dryRun = false,
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
  let urls = filterSitemapUrls(parseSitemapUrls(sitemap), { includePrefix, host });
  const manifestRoutes = manifestPath ? loadManifestRoutes(manifestPath, repoRoot) : null;
  urls = filterUrlsByManifest(urls, manifestRoutes);
  const resolvedChangedFiles = changedFrom && !Array.isArray(changedFiles)
    ? loadGitChangedFiles({ changedFrom, repoRoot })
    : changedFiles;
  urls = changedFrom ? filterUrlsByChangedFiles(urls, resolvedChangedFiles) : urls;
  const selectedRoutes = urls.map(routeFromUrl).filter(Boolean);

  if (!key || !/^[a-f0-9]{32}$/u.test(key)) {
    throw new Error('[indexnow] Invalid key format in .indexnow-key');
  }
  if (urls.length === 0) {
    throw new Error('[indexnow] No URLs selected from sitemap');
  }

  const payload = buildIndexNowPayload({
    host,
    key,
    urls
  });
  const responses = [];

  for (const endpoint of endpoints) {
    if (dryRun) {
      responses.push({
        engine: endpoint.name,
        endpoint: `https://${endpoint.hostname}${endpoint.path}`,
        statusCode: null,
        ok: true,
        dryRun: true,
        body: `Dry run: no request sent for ${urls.length} URLs`
      });
      logger.log(`[indexnow] ${endpoint.name} dry run for ${urls.length} URLs`);
      continue;
    }

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
    selection: {
      includePrefix,
      manifestPath,
      manifestRouteCount: manifestRoutes ? manifestRoutes.size : null,
      changedFrom,
      changedFileCount: Array.isArray(resolvedChangedFiles) ? resolvedChangedFiles.length : null,
      dryRun
    },
    urlCount: urls.length,
    urls,
    selectedRoutes,
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
  filterUrlsByChangedFiles,
  filterUrlsByManifest,
  filterSitemapUrls,
  loadManifestRoutes,
  parseArgs,
  parseSitemapUrls,
  pingIndexNow
};
