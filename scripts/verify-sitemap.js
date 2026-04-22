'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { SITE_ORIGIN } = require('./common/site-origin.js');

const STATIC_PAGE_ROUTES = [
  '/',
  '/affiliate-disclosure',
  '/privacy-policy',
  '/methodology',
  '/about/editorial-standards',
  '/subscribe',
  '/tools/fit-checker'
];

function normalizeRoute(route) {
  if (!route) return '/';
  return route === '/' ? route : route.replace(/\/+$/, '');
}

function extractSitemapRoutes(xml) {
  return new Set(
    Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g))
      .map((match) => {
        const url = new URL(match[1]);
        return normalizeRoute(url.pathname);
      })
  );
}

async function collectExpectedRoutes(repoRoot) {
  const expected = new Set(STATIC_PAGE_ROUTES);

  const pagesDir = path.join(repoRoot, 'pages');
  if (!existsSync(pagesDir)) {
    return expected;
  }

  async function walk(currentDir) {
    const { readdir } = require('node:fs/promises');
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const rel = path.relative(pagesDir, fullPath).replace(/\\/g, '/');
      if (rel === 'affiliate-disclosure.html'
        || rel === 'privacy-policy.html'
        || rel === 'methodology.html'
        || rel === 'subscribe.html'
        || rel === 'about/editorial-standards.html') {
        continue;
      }
      if (rel.startsWith('brands/')) expected.add(`/brands/${rel.slice('brands/'.length, -5)}`);
      else if (rel.startsWith('compare/')) expected.add(`/compare/${rel.slice('compare/'.length, -5)}`);
      else if (rel.startsWith('cavity/')) expected.add(`/cavity/${rel.slice('cavity/'.length, -5)}`);
      else if (rel.startsWith('doorway/')) expected.add(`/doorway/${rel.slice('doorway/'.length, -5)}`);
      else if (rel.startsWith('guides/')) expected.add(`/guides/${rel.slice('guides/'.length, -5)}`);
      else if (rel.startsWith('location/')) expected.add(`/${rel.slice(0, -5)}`);
      else if (rel.startsWith('tools/')) expected.add(`/tools/${rel.slice('tools/'.length, -5)}`);
    }
  }

  await walk(pagesDir);
  return expected;
}

async function verifySitemap({
  repoRoot = path.resolve(__dirname, '..'),
  sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  logger = console
} = {}) {
  const [xml, expectedRoutes] = await Promise.all([
    readFile(sitemapPath, 'utf8'),
    collectExpectedRoutes(repoRoot)
  ]);
  const sitemapRoutes = extractSitemapRoutes(xml);
  const missing = [...expectedRoutes].filter((route) => !sitemapRoutes.has(route)).sort();
  const extra = [...sitemapRoutes].filter((route) => !expectedRoutes.has(route)).sort();
  const ok = missing.length === 0 && extra.length === 0;
  const summary = {
    ok,
    missing,
    extra,
    expectedCount: expectedRoutes.size,
    actualCount: sitemapRoutes.size,
    sitemapPath,
    siteOrigin: SITE_ORIGIN
  };

  if (ok) {
    logger.log(`[verify-sitemap] ok routes=${summary.actualCount}`);
  } else {
    logger.error?.(`[verify-sitemap] drift missing=${missing.length} extra=${extra.length}`);
  }

  return summary;
}

if (require.main === module) {
  verifySitemap()
    .then((result) => {
      if (!result.ok) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  STATIC_PAGE_ROUTES,
  collectExpectedRoutes,
  extractSitemapRoutes,
  verifySitemap
};
