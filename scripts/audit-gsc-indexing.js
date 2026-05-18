#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');

const { SITE_ORIGIN } = require('./common/site-origin.js');

function normalizeRoute(value) {
  const url = new URL(value, SITE_ORIGIN);
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function routeToFilePath(repoRoot, route) {
  if (route === '/') return path.join(repoRoot, 'index.html');
  return path.join(repoRoot, 'pages', `${route.replace(/^\//, '')}.html`);
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
}

function extractCanonical(html) {
  const match = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return match ? match[1].trim() : null;
}

function hasNoindexDirective(html) {
  return /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)
    || /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html)
    || /x-robots-tag\s*:\s*noindex/i.test(html);
}

function expectedCanonicalForRoute(route) {
  return route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`;
}

function buildMarkdownReport(result) {
  const issueLines = (items, formatter) => {
    if (items.length === 0) return '- None';
    return items.slice(0, 50).map(formatter).join('\n');
  };

  return `# GSC Indexing Readiness Audit

Generated: ${result.generatedAt}

## Summary

- Sitemap URLs: ${result.summary.sitemapUrls}
- Product URLs: ${result.summary.productUrls}
- Missing route files: ${result.summary.missingFiles}
- Pages with noindex: ${result.summary.noindex}
- Canonical mismatches: ${result.summary.canonicalMismatches}
- Missing canonical tags: ${result.summary.missingCanonicals}
- Status: ${result.ok ? 'PASS' : 'FAIL'}

## Blocking Issues

### Missing Files

${issueLines(result.issues.missingFiles, (item) => `- ${item.route} -> ${item.expectedFile}`)}

### Noindex Directives

${issueLines(result.issues.noindex, (item) => `- ${item.route} -> ${item.file}`)}

### Canonical Mismatches

${issueLines(result.issues.canonicalMismatches, (item) => `- ${item.route}: expected \`${item.expected}\`, found \`${item.actual}\``)}

### Missing Canonicals

${issueLines(result.issues.missingCanonicals, (item) => `- ${item.route} -> ${item.file}`)}

## GSC Operating Notes

- The current sitemap is technically ready for resubmission when this report is PASS.
- A \`Not indexed\` count in Search Console is not automatically a code defect. Google often leaves new programmatic URLs in "Discovered" or "Crawled" states until it allocates crawl and indexing budget.
- Highest-priority manual inspections should be: homepage, \`/products\`, one high-value product URL, one \`/fit-check/\` URL, and one \`/compare/\` URL.
- After deployment, submit \`https://www.fitappliance.com.au/sitemap.xml\` again and use URL Inspection on 3-5 representative URLs to request indexing.
- If GSC reports duplicate/canonical reasons, inspect the listed sample URLs against this report before changing generation logic.
`;
}

async function auditGscIndexing({
  repoRoot = path.resolve(__dirname, '..'),
  sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  outputPath = path.join(repoRoot, 'reports', 'gsc-indexing-readiness.md'),
  write = true,
  logger = console
} = {}) {
  const xml = await readFile(sitemapPath, 'utf8');
  const urls = extractSitemapUrls(xml);
  const routes = [...new Set(urls.map(normalizeRoute))].sort();

  const issues = {
    missingFiles: [],
    noindex: [],
    canonicalMismatches: [],
    missingCanonicals: []
  };

  for (const route of routes) {
    const filePath = routeToFilePath(repoRoot, route);
    if (!existsSync(filePath)) {
      issues.missingFiles.push({
        route,
        expectedFile: path.relative(repoRoot, filePath).replace(/\\/g, '/')
      });
      continue;
    }

    const html = await readFile(filePath, 'utf8');
    const relativeFile = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    if (hasNoindexDirective(html)) {
      issues.noindex.push({ route, file: relativeFile });
    }

    const canonical = extractCanonical(html);
    if (!canonical) {
      issues.missingCanonicals.push({ route, file: relativeFile });
      continue;
    }

    const expected = expectedCanonicalForRoute(route);
    if (canonical !== expected) {
      issues.canonicalMismatches.push({ route, expected, actual: canonical, file: relativeFile });
    }
  }

  const result = {
    ok: Object.values(issues).every((rows) => rows.length === 0),
    generatedAt: new Date().toISOString(),
    summary: {
      sitemapUrls: routes.length,
      productUrls: routes.filter((route) => route.startsWith('/products/')).length,
      missingFiles: issues.missingFiles.length,
      noindex: issues.noindex.length,
      canonicalMismatches: issues.canonicalMismatches.length,
      missingCanonicals: issues.missingCanonicals.length
    },
    issues
  };

  if (write) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buildMarkdownReport(result), 'utf8');
  }

  logger.log(`[gsc-indexing] ${result.ok ? 'PASS' : 'FAIL'} sitemap=${result.summary.sitemapUrls} products=${result.summary.productUrls}`);
  return result;
}

if (require.main === module) {
  auditGscIndexing().then((result) => {
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditGscIndexing,
  buildMarkdownReport,
  extractCanonical,
  extractSitemapUrls,
  hasNoindexDirective,
  normalizeRoute,
  routeToFilePath
};
