#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const { mkdir, readFile, stat, writeFile } = require('node:fs/promises');
const { parseArgs } = require('node:util');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse').default;

const DEFAULT_PAGES = [
  '/',
  '/pages/cavity/1000mm-fridge.html',
  '/pages/doorway/600mm-fridge-doorway.html',
  '/pages/brands/samsung-fridge-clearance.html',
  '/pages/compare/lg-vs-hisense-washing-machine-clearance.html'
];
const REPORT_FILE_PREFIX = 'reports/lighthouse-';
const REPORTS_DIR_NAME = REPORT_FILE_PREFIX.split('/')[0];
const DEFAULT_PORT = 4173;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.rss': 'application/rss+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};

function parseCliArgs(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'base-url': { type: 'string' },
      'min-score': { type: 'string', default: '0.9' },
      headless: { type: 'boolean', default: true },
      port: { type: 'string', default: String(DEFAULT_PORT) }
    }
  });

  const minScore = Number.parseFloat(values['min-score']);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new Error(`Invalid --min-score value: ${values['min-score']}`);
  }
  const port = Number.parseInt(values.port, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid --port value: ${values.port}`);
  }

  return {
    baseUrl: values['base-url'] ? String(values['base-url']).replace(/\/+$/, '') : null,
    minScore,
    headless: values.headless,
    port
  };
}

function buildReportName(today = new Date()) {
  const yyyy = String(today.getUTCFullYear());
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  return `lighthouse-${yyyy}${mm}${dd}.json`;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function toSafeRelativePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const normalized = decoded === '/' ? '/index.html' : decoded;
  const withoutLeadingSlash = normalized.replace(/^\/+/, '');
  const resolved = path.normalize(withoutLeadingSlash);
  if (resolved.startsWith('..')) return null;
  return resolved;
}

async function createStaticServer({ repoRoot, port = DEFAULT_PORT }) {
  const server = http.createServer(async (req, res) => {
    try {
      const relativePath = toSafeRelativePath(req.url ?? '/');
      if (!relativePath) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
      }
      const filePath = path.join(repoRoot, relativePath);
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': getMimeType(filePath), 'Cache-Control': 'no-store' });
      res.end(content);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function runLighthouse({
  baseUrl,
  minScore = 0.9,
  pages = DEFAULT_PAGES,
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(path.resolve(__dirname, '..'), REPORTS_DIR_NAME),
  logger = console,
  headless = true,
  port = DEFAULT_PORT
}) {
  let staticServer = null;
  if (!baseUrl) {
    staticServer = await createStaticServer({ repoRoot, port });
  }
  const auditBaseUrl = baseUrl || staticServer.baseUrl;

  const chrome = await chromeLauncher.launch({
    chromeFlags: headless ? ['--headless=new', '--disable-gpu', '--no-sandbox'] : ['--disable-gpu']
  });

  try {
    const entries = [];
    for (const pagePath of pages) {
      const url = `${auditBaseUrl}${pagePath}`;
      logger.log(`[lighthouse] Auditing ${url}`);
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance'],
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
        throttlingMethod: 'provided'
      });
      if (result.lhr.runtimeError) {
        throw new Error(`Lighthouse runtime error for ${url}: ${result.lhr.runtimeError.message}`);
      }
      const performance = result.lhr.categories.performance?.score ?? 0;
      entries.push({
        path: pagePath,
        url,
        score: Number(performance.toFixed(3)),
        lcpMs: result.lhr.audits['largest-contentful-paint']?.numericValue ?? null,
        cls: result.lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
        inpMs: result.lhr.audits['interaction-to-next-paint']?.numericValue ?? null,
        tbtMs: result.lhr.audits['total-blocking-time']?.numericValue ?? null
      });
    }

    const minimumObserved = entries.reduce((min, entry) => Math.min(min, entry.score), 1);
    const averageScore = entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: auditBaseUrl,
      minScore,
      pages: entries,
      summary: {
        minimumObserved: Number(minimumObserved.toFixed(3)),
        averageScore: Number(averageScore.toFixed(3)),
        pass: minimumObserved >= minScore
      }
    };

    await mkdir(reportsDir, { recursive: true });
    const datedPath = path.join(reportsDir, buildReportName());
    const latestPath = path.join(reportsDir, 'lighthouse-latest.json');
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(datedPath, serialized, 'utf8');
    await writeFile(latestPath, serialized, 'utf8');

    if (!report.summary.pass) {
      throw new Error(
        `Lighthouse performance gate failed: minimum ${report.summary.minimumObserved} < required ${minScore}`
      );
    }

    logger.log(
      `[lighthouse] PASS min=${report.summary.minimumObserved} avg=${report.summary.averageScore} (threshold ${minScore})`
    );
    return {
      report,
      datedPath,
      latestPath
    };
  } finally {
    await chrome.kill();
    if (staticServer && typeof staticServer.close === 'function') {
      await staticServer.close();
    }
  }
}

if (require.main === module) {
  (async () => {
    const options = parseCliArgs();
    await runLighthouse(options);
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_PAGES,
  buildReportName,
  parseCliArgs,
  runLighthouse
};
