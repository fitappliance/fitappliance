#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} = require('node:fs/promises');
const { existsSync } = require('node:fs');

const { SITE_ORIGIN } = require('./common/site-origin.js');
const {
  extractCanonical,
  extractSitemapUrls,
  normalizeRoute,
  routeToFilePath
} = require('./audit-gsc-indexing.js');

const GENERATED_ROUTE_PREFIXES = [
  '/brands/',
  '/cavity/',
  '/compare/',
  '/doorway/',
  '/fit-check/',
  '/guides/',
  '/location/',
  '/products/',
  '/tools/'
];

const IGNORED_INTERNAL_LINK_PREFIXES = [
  '/data/',
  '/icons/',
  '/og-images/',
  '/pdf-evidence/',
  '/public/',
  '/scripts/'
];

const IGNORED_INTERNAL_LINK_EXACT = new Set([
  '/ads.txt',
  '/favicon.ico',
  '/image-sitemap.xml',
  '/manifest.webmanifest',
  '/robots.txt',
  '/rss.xml',
  '/service-worker.js',
  '/sitemap.xml',
  '/styles.css',
  '/styles-deferred.css'
]);

function slugFromBucketFilename(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    if (row.length > 0 || cell.length > 0) {
      pushCell();
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      pushCell();
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      pushRow();
      continue;
    }
    cell += char;
  }
  if (row.length > 0 || cell.length > 0) pushRow();
  if (rows.length === 0) return [];

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalizeInternalHref(href) {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  if (href.includes('${') || href.includes('%7B') || href.includes('%7D')) return null;
  let url;
  try {
    url = new URL(href, SITE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== SITE_ORIGIN) return null;
  return normalizeRoute(url.href);
}

function extractInternalLinks(html) {
  return [...new Set([...html.matchAll(/\bhref=["']([^"']+)["']/gi)]
    .map((match) => normalizeInternalHref(match[1]))
    .filter(Boolean)
    .filter((route) => !IGNORED_INTERNAL_LINK_EXACT.has(route))
    .filter((route) => !IGNORED_INTERNAL_LINK_PREFIXES.some((prefix) => route.startsWith(prefix)))
  )].sort();
}

async function listHtmlFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const entries = await readdir(rootDir);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      files.push(...await listHtmlFiles(fullPath));
    } else if (entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function filePathToRoute(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  if (relative === 'index.html') return '/';
  if (!relative.startsWith('pages/') || !relative.endsWith('.html')) return null;
  return `/${relative.slice('pages/'.length, -'.html'.length)}`;
}

function routeMatchesPattern(route, source) {
  if (source === route) return true;
  if (!source.includes(':')) return false;
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/:([a-zA-Z]+)\\\*/g, '.*')
    .replace(/:([a-zA-Z]+)/g, '[^/]+');
  return new RegExp(`^${pattern}$`).test(route);
}

function isRouteKnown(route, knownRoutes, redirectRules) {
  if (knownRoutes.has(route)) return true;
  return redirectRules.some((redirect) => routeMatchesPattern(route, redirect.source));
}

async function readGscCsvExports(exportsDir) {
  if (!existsSync(exportsDir)) return [];
  const files = (await readdir(exportsDir))
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    .sort();
  const rows = [];
  for (const file of files) {
    const csv = await readFile(path.join(exportsDir, file), 'utf8');
    const bucket = slugFromBucketFilename(file);
    for (const row of parseCsvRows(csv)) {
      const rawUrl = row.URL || row.Url || row.url || row.Page || row.page || '';
      const route = rawUrl ? normalizeRoute(rawUrl) : '';
      rows.push({
        bucket,
        route,
        url: rawUrl,
        itemName: row['Item name'] || row.Item || row.item || '',
        lastCrawled: row['Last crawled'] || row['Last Crawled'] || row.lastCrawled || ''
      });
    }
  }
  return rows;
}

function summarizeSamples(rows, maxRows = 25) {
  if (rows.length === 0) return '- None';
  return rows.slice(0, maxRows).map((row) => {
    if (typeof row === 'string') return `- ${row}`;
    const bits = [
      row.route || row.source || row.url,
      row.destination ? `-> ${row.destination}` : '',
      row.file ? `(${row.file})` : '',
      row.lastCrawled ? `last crawled: ${row.lastCrawled}` : '',
      row.itemName ? `item: ${row.itemName}` : ''
    ].filter(Boolean);
    return `- ${bits.join(' ')}`;
  }).join('\n');
}

function buildMarkdownReport(result) {
  const gscGroups = result.buckets.gscCsvSamples.reduce((groups, row) => {
    groups[row.bucket] ??= [];
    groups[row.bucket].push(row);
    return groups;
  }, {});
  const gscSections = Object.entries(gscGroups).length === 0
    ? '- No CSV files found in `reports/gsc-exports/`. Export GSC buckets as CSV into that folder and rerun `npm run gsc-bucket-audit`.'
    : Object.entries(gscGroups).map(([bucket, rows]) => `### ${bucket}\n\n${summarizeSamples(rows)}`).join('\n\n');

  return `# GSC Index Bucket Cleanup Audit

Generated: ${result.generatedAt}

## Summary

- Sitemap URLs: ${result.summary.sitemapUrls}
- Local HTML routes scanned: ${result.summary.htmlRoutes}
- Internal broken-link candidates: ${result.summary.localBrokenLinks}
- Duplicate canonical groups in generated HTML: ${result.summary.duplicateCanonicalGroups}
- Canonical mismatch routes: ${result.summary.canonicalMismatches}
- Permanent redirects configured: ${result.summary.redirectRules}
- GSC CSV samples imported: ${result.summary.gscCsvSamples}
- Status: ${result.ok ? 'PASS' : 'REVIEW'}

## 404 Bucket

### Local broken internal links

${summarizeSamples(result.buckets.localBrokenLinks.map((item) => ({
  route: item.missingRoute,
  file: item.sourceFile
})))}

### Existing redirect coverage

These routes are already configured as permanent redirects and are the current safest known mappings for prior GSC 404/redirect samples.

${summarizeSamples(result.buckets.redirectRules)}

## Duplicate / Canonical Buckets

### Duplicate canonical groups generated by this repo

${result.buckets.duplicateCanonicalGroups.length === 0
  ? '- None. Generated pages currently self-canonicalize uniquely.'
  : result.buckets.duplicateCanonicalGroups.map((group) => `- ${group.canonical}\n  Routes: ${group.routes.join(', ')}`).join('\n')}

### Canonical mismatches

${summarizeSamples(result.buckets.canonicalMismatches.map((item) => ({
  route: item.route,
  destination: item.canonical,
  file: item.file
})))}

## Imported GSC Samples

${gscSections}

## Operating Decision

- If a GSC \`Not found (404)\` sample is also in "Local broken internal links", fix the internal link or add a precise redirect.
- If a GSC \`Not found (404)\` sample is not linked anywhere locally, prefer a redirect only when the old URL maps cleanly to one existing route.
- If a GSC duplicate/canonical sample has a query string or trailing slash variant, keep waiting when the canonical points to the clean URL.
- If a generated HTML route appears in "Duplicate canonical groups" or "Canonical mismatches", treat it as a code defect and fix the generator.
`;
}

async function auditGscBuckets({
  repoRoot = path.resolve(__dirname, '..'),
  outputMarkdownPath = path.join(repoRoot, 'reports', 'gsc-index-bucket-cleanup.md'),
  outputJsonPath = path.join(repoRoot, 'reports', 'gsc-index-bucket-cleanup.json'),
  exportsDir = path.join(repoRoot, 'reports', 'gsc-exports'),
  write = true,
  now = new Date().toISOString(),
  logger = console
} = {}) {
  const sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml');
  const sitemapXml = existsSync(sitemapPath) ? await readFile(sitemapPath, 'utf8') : '';
  const sitemapRoutes = new Set(extractSitemapUrls(sitemapXml).map(normalizeRoute));
  const htmlFiles = [
    ...(existsSync(path.join(repoRoot, 'index.html')) ? [path.join(repoRoot, 'index.html')] : []),
    ...await listHtmlFiles(path.join(repoRoot, 'pages'))
  ];
  const routes = [];
  const canonicalGroups = new Map();
  const canonicalMismatches = [];
  const localBrokenLinks = [];
  const knownRoutes = new Set(['/']);

  for (const file of htmlFiles) {
    const route = filePathToRoute(repoRoot, file);
    if (route) knownRoutes.add(route);
  }
  for (const route of sitemapRoutes) knownRoutes.add(route);

  const vercelPath = path.join(repoRoot, 'vercel.json');
  const vercel = existsSync(vercelPath) ? JSON.parse(await readFile(vercelPath, 'utf8')) : {};
  const redirectRules = (vercel.redirects ?? []).filter((redirect) => redirect.permanent !== false);

  for (const file of htmlFiles) {
    const route = filePathToRoute(repoRoot, file);
    if (!route) continue;
    const html = await readFile(file, 'utf8');
    const relativeFile = path.relative(repoRoot, file).replace(/\\/g, '/');
    const canonical = extractCanonical(html);
    routes.push(route);
    if (canonical) {
      const canonicalRoute = normalizeRoute(canonical);
      canonicalGroups.set(canonicalRoute, [...(canonicalGroups.get(canonicalRoute) ?? []), route]);
      if (canonicalRoute !== route) {
        canonicalMismatches.push({ route, canonical: canonicalRoute, file: relativeFile });
      }
    }

    for (const linkRoute of extractInternalLinks(html)) {
      if (!isRouteKnown(linkRoute, knownRoutes, redirectRules)) {
        localBrokenLinks.push({ sourceRoute: route, sourceFile: relativeFile, missingRoute: linkRoute });
      }
    }
  }

  const duplicateCanonicalGroups = [...canonicalGroups.entries()]
    .filter(([, groupedRoutes]) => groupedRoutes.length > 1)
    .map(([canonical, groupedRoutes]) => ({ canonical, routes: groupedRoutes.sort() }))
    .filter((group) => GENERATED_ROUTE_PREFIXES.some((prefix) => group.canonical.startsWith(prefix)));

  const gscCsvSamples = await readGscCsvExports(exportsDir);
  const result = {
    ok: localBrokenLinks.length === 0 && duplicateCanonicalGroups.length === 0 && canonicalMismatches.length === 0,
    generatedAt: now,
    summary: {
      sitemapUrls: sitemapRoutes.size,
      htmlRoutes: routes.length,
      localBrokenLinks: localBrokenLinks.length,
      duplicateCanonicalGroups: duplicateCanonicalGroups.length,
      canonicalMismatches: canonicalMismatches.length,
      redirectRules: redirectRules.length,
      gscCsvSamples: gscCsvSamples.length
    },
    buckets: {
      localBrokenLinks,
      redirectRules: redirectRules.map(({ source, destination, permanent }) => ({ source, destination, permanent })),
      duplicateCanonicalGroups,
      canonicalMismatches,
      gscCsvSamples
    }
  };

  if (write) {
    await mkdir(path.dirname(outputMarkdownPath), { recursive: true });
    await writeFile(outputMarkdownPath, buildMarkdownReport(result), 'utf8');
    await writeFile(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  logger.log(`[gsc-buckets] ${result.ok ? 'PASS' : 'REVIEW'} broken=${result.summary.localBrokenLinks} duplicateCanonicals=${result.summary.duplicateCanonicalGroups} gscCsv=${result.summary.gscCsvSamples}`);
  return result;
}

if (require.main === module) {
  auditGscBuckets().then((result) => {
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditGscBuckets,
  buildMarkdownReport,
  extractInternalLinks,
  parseCsvRows,
  slugFromBucketFilename
};
