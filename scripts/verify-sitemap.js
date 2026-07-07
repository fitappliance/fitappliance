'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { isIndexableRoute, loadIndexabilityPolicy, normalizeRoute } = require('./common/indexability-policy.js');

const STATIC_PAGE_ROUTES = [
  '/',
  '/affiliate-disclosure',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/contact',
  '/about',
  '/methodology',
  '/about/editorial-standards',
  '/products',
  '/subscribe',
  '/tools/fit-checker'
];

function extractSitemapRoutes(xml) {
  return new Set(
    Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g))
      .map((match) => {
        const url = new URL(match[1]);
        return normalizeRoute(url.pathname);
      })
  );
}

async function readJsonIfExists(filePath, fallback = []) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function loadRouteAttributes(repoRoot) {
  const attributes = new Map();
  const brandRows = await readJsonIfExists(path.join(repoRoot, 'pages', 'brands', 'index.json'));
  const compareRows = await readJsonIfExists(path.join(repoRoot, 'pages', 'compare', 'index.json'));

  for (const row of Array.isArray(brandRows) ? brandRows : []) {
    attributes.set(normalizeRoute(row.url ?? `/brands/${row.slug}`), {
      models: Number(row.models ?? row.count ?? 0),
      cat: row.cat,
      brand: row.brand
    });
  }

  for (const row of Array.isArray(compareRows) ? compareRows : []) {
    attributes.set(normalizeRoute(row.url ?? `/compare/${row.slug}`), {
      modelsA: Number(row.modelsA ?? 0),
      modelsB: Number(row.modelsB ?? 0),
      cat: row.cat
    });
  }

  return attributes;
}

async function collectExpectedRoutes(repoRoot) {
  const expected = new Set(STATIC_PAGE_ROUTES);
  const policy = loadIndexabilityPolicy(path.join(repoRoot, 'data', 'indexability-policy.json'));
  const routeAttributes = await loadRouteAttributes(repoRoot);

  const addRoute = (route) => {
    const normalizedRoute = normalizeRoute(route);
    if (isIndexableRoute(normalizedRoute, routeAttributes.get(normalizedRoute) ?? {}, policy)) {
      expected.add(normalizedRoute);
    }
  };

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
        || rel === 'about.html'
        || rel === 'privacy.html'
        || rel === 'privacy-policy.html'
        || rel === 'terms.html'
        || rel === 'contact.html'
        || rel === 'methodology.html'
        || rel === 'subscribe.html'
        || rel === 'about/editorial-standards.html') {
        continue;
      }
      if (rel.startsWith('brands/')) addRoute(`/brands/${rel.slice('brands/'.length, -5)}`);
      else if (rel.startsWith('compare/')) addRoute(`/compare/${rel.slice('compare/'.length, -5)}`);
      else if (rel.startsWith('cavity/')) addRoute(`/cavity/${rel.slice('cavity/'.length, -5)}`);
      else if (rel.startsWith('doorway/')) addRoute(`/doorway/${rel.slice('doorway/'.length, -5)}`);
      else if (rel.startsWith('fit-check/')) addRoute(`/fit-check/${rel.slice('fit-check/'.length, -5)}`);
      else if (rel.startsWith('guides/')) addRoute(`/guides/${rel.slice('guides/'.length, -5)}`);
      else if (rel.startsWith('location/')) addRoute(`/${rel.slice(0, -5)}`);
      else if (rel.startsWith('products/')) addRoute(`/products/${rel.slice('products/'.length, -5)}`);
      else if (rel.startsWith('tools/')) addRoute(`/tools/${rel.slice('tools/'.length, -5)}`);
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
