#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

function normalizePathname(value) {
  if (!value) return null;
  let pathname = String(value).split('#')[0].split('?')[0].trim();
  if (!pathname) return null;
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

function toPageUrl(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  if (relative === 'index.html') return '/';
  if (!relative.startsWith('pages/') || !relative.endsWith('.html')) return null;
  const withoutPages = relative.slice('pages/'.length).replace(/\.html$/i, '');
  if (withoutPages === 'affiliate-disclosure') return '/affiliate-disclosure';
  if (withoutPages === 'privacy-policy') return '/privacy-policy';
  return normalizePathname(withoutPages);
}

function normalizeHrefToInternalUrl(href, baseUrl = 'https://www.fitappliance.com.au') {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('javascript:')) {
    return null;
  }

  if (trimmed.startsWith('/')) return normalizePathname(trimmed);

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace(/^www\./i, '');
      const allowedBaseHost = new URL(baseUrl).hostname.replace(/^www\./i, '');
      if (host !== allowedBaseHost) return null;
      return normalizePathname(parsed.pathname);
    } catch {
      return null;
    }
  }

  return null;
}

async function walkHtmlFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function extractHrefValues(html) {
  const matches = html.matchAll(/\bhref\s*=\s*(['"])(.*?)\1/gi);
  return [...matches].map((match) => match[2]);
}

async function buildLinkGraph({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'reports', 'link-graph.json'),
  baseUrl = 'https://www.fitappliance.com.au',
  logger = console
} = {}) {
  const htmlFiles = [
    path.join(repoRoot, 'index.html'),
    ...(await walkHtmlFiles(path.join(repoRoot, 'pages')))
  ];

  const pages = [];
  for (const filePath of htmlFiles) {
    const url = toPageUrl(repoRoot, filePath);
    if (!url) continue;
    pages.push({ filePath, url });
  }

  const urlSet = new Set(pages.map((page) => page.url));
  const inMap = new Map(pages.map((page) => [page.url, new Set()]));
  const outMap = new Map(pages.map((page) => [page.url, new Set()]));

  for (const page of pages) {
    const html = await readFile(page.filePath, 'utf8');
    for (const href of extractHrefValues(html)) {
      const normalized = normalizeHrefToInternalUrl(href, baseUrl);
      if (!normalized || !urlSet.has(normalized)) continue;
      if (normalized === page.url) continue;
      outMap.get(page.url).add(normalized);
      inMap.get(normalized).add(page.url);
    }
  }

  const nodes = pages
    .map((page) => ({
      url: page.url,
      file: path.relative(repoRoot, page.filePath).replace(/\\/g, '/'),
      inlinks: inMap.get(page.url).size,
      outlinks: outMap.get(page.url).size
    }))
    .sort((left, right) => left.url.localeCompare(right.url));

  const totalEdges = nodes.reduce((sum, node) => sum + node.outlinks, 0);
  const orphanUrls = nodes.filter((node) => node.inlinks === 0).map((node) => node.url);
  const averageInlinks = nodes.length > 0
    ? nodes.reduce((sum, node) => sum + node.inlinks, 0) / nodes.length
    : 0;

  const report = {
    summary: {
      totalPages: nodes.length,
      totalEdges,
      orphanPages: orphanUrls.length,
      averageInlinks: Number(averageInlinks.toFixed(2))
    },
    orphanUrls,
    nodes
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.log(
    `Generated link graph report with ${report.summary.totalPages} pages, ${report.summary.totalEdges} edges, orphan pages=${report.summary.orphanPages}`
  );
  return { outputPath, report };
}

if (require.main === module) {
  buildLinkGraph().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildLinkGraph,
  normalizeHrefToInternalUrl,
  toPageUrl
};
