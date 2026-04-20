#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile, access } = require('node:fs/promises');

function normalizePathname(value) {
  if (!value) return null;
  let pathname = String(value).split('#')[0].split('?')[0].trim();
  if (!pathname) return null;
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return pathname;
}

function hrefToInternalPath(href, baseUrl = 'https://www.fitappliance.com.au') {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) {
    return null;
  }
  if (trimmed.startsWith('/')) return normalizePathname(trimmed);

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const expected = new URL(baseUrl);
      if (parsed.hostname.replace(/^www\./i, '') !== expected.hostname.replace(/^www\./i, '')) return null;
      return normalizePathname(parsed.pathname);
    } catch {
      return null;
    }
  }
  return null;
}

function extractInternalLinks(html, baseUrl = 'https://www.fitappliance.com.au') {
  const matches = html.matchAll(/\bhref\s*=\s*(['"])(.*?)\1/gi);
  const urls = [];
  for (const match of matches) {
    const normalized = hrefToInternalPath(match[2], baseUrl);
    if (normalized) urls.push(normalized);
  }
  return urls;
}

async function walkHtmlFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
    }
  }
  return files;
}

function toPageUrl(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  if (relative === 'index.html') return '/';
  if (!relative.startsWith('pages/') || !relative.endsWith('.html')) return null;
  return normalizePathname(relative.slice('pages/'.length).replace(/\.html$/i, ''));
}

function compileRewritePatterns(rewrites) {
  return (rewrites ?? [])
    .map((entry) => entry?.source)
    .filter((source) => typeof source === 'string' && source.startsWith('/'))
    .filter((source) => source !== '/(.*)')
    .map((source) => {
      const withNamed = source.replace(/:([a-zA-Z0-9_]+)\*/g, '(?<$1>.+)').replace(/:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)');
      return new RegExp(`^${withNamed}$`);
    });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isValidInternalTarget({
  href,
  repoRoot,
  pageUrls,
  rewritePatterns
}) {
  if (pageUrls.has(href)) return true;
  if (rewritePatterns.some((pattern) => pattern.test(href))) return true;

  const rootPath = path.join(repoRoot, href.slice(1));
  const publicPath = path.join(repoRoot, 'public', href.slice(1));
  if (await pathExists(rootPath)) return true;
  if (await pathExists(publicPath)) return true;
  return false;
}

async function findBrokenLinks({
  repoRoot = path.resolve(__dirname, '..'),
  vercelPath = path.join(repoRoot, 'vercel.json'),
  reportPath = path.join(repoRoot, 'reports', 'broken-links.json'),
  baseUrl = 'https://www.fitappliance.com.au',
  logger = console
} = {}) {
  const htmlFiles = [
    path.join(repoRoot, 'index.html'),
    ...(await walkHtmlFiles(path.join(repoRoot, 'pages')))
  ];

  const pageUrls = new Set();
  for (const filePath of htmlFiles) {
    const pageUrl = toPageUrl(repoRoot, filePath);
    if (pageUrl) pageUrls.add(pageUrl);
  }

  let rewrites = [];
  try {
    const vercelConfig = JSON.parse(await readFile(vercelPath, 'utf8'));
    rewrites = vercelConfig.rewrites ?? [];
  } catch {
    rewrites = [];
  }
  const rewritePatterns = compileRewritePatterns(rewrites);

  const checked = [];
  const broken = [];

  for (const filePath of htmlFiles) {
    const html = await readFile(filePath, 'utf8');
    const links = [...new Set(extractInternalLinks(html, baseUrl))];
    for (const href of links) {
      const ok = await isValidInternalTarget({
        href,
        repoRoot,
        pageUrls,
        rewritePatterns
      });
      const record = {
        source: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
        href,
        ok
      };
      checked.push(record);
      if (!ok) broken.push(record);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checked,
    broken
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[broken-link-check] checked=${checked.length} broken=${broken.length} report=${reportPath}`);
  return {
    checked,
    broken,
    reportPath,
    exitCode: broken.length > 0 ? 1 : 0
  };
}

if (require.main === module) {
  findBrokenLinks()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  extractInternalLinks,
  findBrokenLinks,
  hrefToInternalPath,
  normalizePathname
};
