#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validatePreviewInputs } from './build-retail-cutover-preview.mjs';

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CORE_CATEGORIES = Object.freeze(['dishwasher', 'dryer', 'fridge', 'washing_machine']);
export const SNAPSHOT_RUNTIME_DIRECTORIES = Object.freeze(['public/js', 'public/scripts']);
const FIT_FIELDS = new Set([
  'currentFit',
  'fit',
  'fitClassification',
  'fitDecision',
  'fitOutcome',
  'fitScore',
  'fitStatus',
]);
const COMMERCIAL_FIELDS = Object.freeze([
  'affiliateUrl',
  'affiliate_url',
  'availability',
  'directUrl',
  'direct_url',
  'offer',
  'offers',
  'price',
  'salePrice',
  'sale_price',
  'stock',
  'stockStatus',
  'stock_status',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hasNoindexMeta(html) {
  return [...String(html ?? '').matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => (
    /\bname\s*=\s*["']robots["']/i.test(tag)
    && /\bcontent\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(tag)
  ));
}

function sortedObject(counts) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function meaningful(value) {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isCurrentRetail(product) {
  if (product?.retailLifecycle) {
    return product.retailLifecycle.lifecycleState === 'CURRENT_RETAIL'
      && product.lifecycleVisibility !== 'MARKET_REFERENCE_ONLY';
  }
  return product?.unavailable === false
    && Array.isArray(product?.retailers)
    && product.retailers.length > 0;
}

function slugKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function currentProducts(projection) {
  if (!projection || !Array.isArray(projection.products)) {
    throw new TypeError('projection products required');
  }
  return projection.products.filter(isCurrentRetail);
}

function findClearanceRule(clearanceRules, category, brand) {
  const categoryRules = clearanceRules?.[category] ?? {};
  const brandKey = slugKey(brand);
  const brandRule = Object.entries(categoryRules).find(([name]) => slugKey(name) === brandKey)?.[1];
  return brandRule ?? categoryRules.__default__ ?? {};
}

function countCohortGroup(products, cohort, group, clearanceRules) {
  const categoryProducts = cohort.category
    ? products.filter((product) => product.cat === cohort.category)
    : products;
  const brand = group?.brand;
  const brandProducts = brand
    ? categoryProducts.filter((product) => slugKey(product.brand) === slugKey(brand))
    : categoryProducts;
  if (cohort.kind !== 'cavity') return brandProducts.length;
  if (!Number.isFinite(cohort.widthMm) || cohort.widthMm <= 0) {
    throw new TypeError(`cavity cohort ${cohort.route} requires widthMm`);
  }
  return brandProducts.filter((product) => {
    const width = Number(product.w);
    if (!Number.isFinite(width) || width <= 0) return false;
    const rule = findClearanceRule(clearanceRules, cohort.category, product.brand);
    const side = Number.isFinite(Number(rule.side)) ? Number(rule.side) : 0;
    return width + (side * 2) <= cohort.widthMm;
  }).length;
}

export function buildMeasuredCohortDeltas({
  baseline,
  candidate,
  cohorts,
  clearanceRules = {},
  derivedPageResults = null,
}) {
  if (cohorts?.schemaVersion !== 1 || !Array.isArray(cohorts.cohorts) || cohorts.cohorts.length === 0) {
    throw new TypeError('measured search cohort manifest v1 with at least one cohort required');
  }
  const baselineProducts = currentProducts(baseline);
  const candidateProducts = currentProducts(candidate);
  return cohorts.cohorts.map((cohort) => {
    if (!cohort?.route || !cohort?.kind) throw new TypeError('cohort route and kind required');
    if (cohort.kind === 'cavity' && derivedPageResults === null) {
      throw new TypeError(`generated results required for measured cavity cohort ${cohort.route}`);
    }
    const groups = Array.isArray(cohort.groups) && cohort.groups.length > 0
      ? cohort.groups
      : [{ id: 'results' }];
    const results = groups.map((group) => {
      const useGeneratedResults = cohort.kind === 'cavity' && derivedPageResults !== null;
      const baselineResults = useGeneratedResults
        ? derivedPageResults?.baseline?.[cohort.route]
        : countCohortGroup(baselineProducts, cohort, group, clearanceRules);
      const candidateResults = useGeneratedResults
        ? derivedPageResults?.candidate?.[cohort.route]
        : countCohortGroup(candidateProducts, cohort, group, clearanceRules);
      if (!Number.isFinite(baselineResults) || !Number.isFinite(candidateResults)) {
        throw new TypeError(`generated results missing for measured cohort ${cohort.route}`);
      }
      return {
        id: String(group.id ?? 'results'),
        ...(group.brand ? { brand: group.brand } : {}),
        baselineResults,
        candidateResults,
        delta: candidateResults - baselineResults,
      };
    });
    const zeroed = results.some((row) => row.baselineResults > 0 && row.candidateResults === 0);
    const hadBaseline = results.some((row) => row.baselineResults > 0);
    return {
      rank: cohort.rank ?? null,
      route: cohort.route,
      kind: cohort.kind,
      status: zeroed ? 'ZEROED' : hadBaseline ? 'PRESERVED' : 'NO_BASELINE_RESULTS',
      groups: results,
    };
  });
}

export function applyRetailCutoverDecision({ impact, browserQa, fitAudit, cohortDeltas }) {
  const blockers = [];
  if (impact?.status !== 'PASS' || (impact?.issues?.length ?? 0) > 0) {
    blockers.push({ code: 'IMPACT_AUDIT_FAILED' });
  }

  const requiredBrowserChecks = ['desktop-cavity-search', 'desktop-replacement-search'];
  const browserChecks = new Map((browserQa?.checks ?? []).map((row) => [row.id, row.status]));
  if (browserQa?.status !== 'PASS') blockers.push({ code: 'BROWSER_QA_FAILED' });
  for (const id of requiredBrowserChecks) {
    if (browserChecks.get(id) !== 'PASS') blockers.push({ code: 'REQUIRED_BROWSER_CHECK_FAILED', id });
  }

  const geometryViolations = fitAudit?.summary?.violations;
  const installationViolations = fitAudit?.installation?.summary?.violations;
  if (!Number.isInteger(geometryViolations) || !Number.isInteger(installationViolations)) {
    blockers.push({ code: 'FIT_PUBLICATION_AUDIT_MISSING' });
  } else if (geometryViolations + installationViolations > 0) {
    blockers.push({ code: 'FIT_PUBLICATION_VIOLATION' });
  }
  const failedBrowserChecks = (browserQa?.checks ?? []).filter((row) => row.status !== 'PASS');
  if (failedBrowserChecks.length > 0) {
    blockers.push({
      code: 'BROWSER_QA_CHECK_FAILED',
      ids: failedBrowserChecks.map((row) => row.id ?? 'unknown'),
    });
  }
  if (!Array.isArray(cohortDeltas) || cohortDeltas.length === 0) {
    blockers.push({ code: 'MEASURED_COHORT_EVIDENCE_MISSING' });
  } else {
    const zeroed = cohortDeltas.filter((row) => row.status === 'ZEROED');
    if (zeroed.length > 0) {
      blockers.push({ code: 'MEASURED_COHORT_ZEROED', routes: zeroed.map((row) => row.route) });
    }
    const measuredRoutes = new Set(cohortDeltas.map((row) => row.route));
    const newlyNoindexed = (impact?.routes?.newlyNoindexed ?? []).filter((route) => measuredRoutes.has(route));
    if (newlyNoindexed.length > 0) {
      blockers.push({ code: 'MEASURED_ROUTE_NEWLY_NOINDEX', routes: newlyNoindexed });
    }

    const routeEvidence = impact?.routes;
    if (
      !Array.isArray(routeEvidence?.added)
      || !Array.isArray(routeEvidence?.preserved)
      || !Array.isArray(routeEvidence?.configuredRedirects)
    ) {
      blockers.push({ code: 'MEASURED_ROUTE_RESOLUTION_MISSING' });
    } else {
      const candidateRoutes = new Set(
        [...routeEvidence.added, ...routeEvidence.preserved].map(normalizedSitemapRoute)
      );
      const permanentRedirects = new Map(
        routeEvidence.configuredRedirects
          .filter((redirect) => redirect?.permanent === true)
          .map((redirect) => [normalizedSitemapRoute(redirect.source), redirect])
      );
      const unresolved = cohortDeltas
        .map((row) => normalizedSitemapRoute(row.route))
        .filter((route) => {
          if (candidateRoutes.has(route)) return false;
          const redirect = permanentRedirects.get(route);
          return !redirect || !candidateRoutes.has(normalizedSitemapRoute(redirect.destination));
        });
      if (unresolved.length > 0) {
        blockers.push({ code: 'MEASURED_ROUTE_UNRESOLVED', routes: [...new Set(unresolved)].sort() });
      }
    }
  }

  return {
    policyVersion: 'retail-cutover-decision-v1',
    decision: blockers.length === 0 ? 'CUTOVER_ALLOWED' : 'RETAIL_COVERAGE_REQUIRED',
    blockers,
  };
}

function fitFieldPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (FIT_FIELDS.has(key) && meaningful(child)) result.push(path);
    if (child && typeof child === 'object') result.push(...fitFieldPaths(child, path));
  }
  return result;
}

function marketReferenceLeakage(product) {
  const fields = [];
  if ((product?.retailers?.length ?? 0) > 0) fields.push('retailers');
  if (product?.sponsored === true) fields.push('sponsored');
  for (const field of COMMERCIAL_FIELDS) {
    if (meaningful(product?.[field])) fields.push(field);
  }
  fields.push(...fitFieldPaths(product));
  return [...new Set(fields)].sort();
}

export function buildProjectionSummary(projection) {
  if (!projection || !Array.isArray(projection.products)) {
    throw new TypeError('projection products required');
  }
  const currentByCategory = new Map();
  const currentByBrand = new Map();
  const retailerUrls = new Set();
  const invalidRetailerUrls = [];
  const marketReferenceLeakageRows = [];
  const currentWithoutRetailerLinks = [];
  let currentRetailProducts = 0;
  let archivedProducts = 0;
  let unknownRetailProducts = 0;
  let marketReferenceProducts = 0;
  let retailerCtas = 0;

  for (const product of projection.products) {
    const lifecycle = product?.retailLifecycle?.lifecycleState;
    if (lifecycle === 'CATALOG_ARCHIVED') archivedProducts += 1;
    if (lifecycle === 'UNKNOWN_RETAIL') unknownRetailProducts += 1;
    if (product?.lifecycleVisibility === 'MARKET_REFERENCE_ONLY') {
      marketReferenceProducts += 1;
      const fields = marketReferenceLeakage(product);
      if (fields.length > 0) {
        marketReferenceLeakageRows.push({
          id: String(product.id ?? ''),
          canonicalProductId: String(product.canonicalProductId ?? ''),
          fields,
        });
      }
    }
    if (!isCurrentRetail(product)) continue;
    currentRetailProducts += 1;
    if (!Array.isArray(product.retailers) || product.retailers.length === 0) {
      currentWithoutRetailerLinks.push(String(product.id ?? product.canonicalProductId ?? 'unknown'));
    }
    const category = String(product.cat ?? 'unknown');
    const brand = String(product.brand ?? 'Unknown');
    currentByCategory.set(category, (currentByCategory.get(category) ?? 0) + 1);
    currentByBrand.set(brand, (currentByBrand.get(brand) ?? 0) + 1);
    for (const retailer of product.retailers ?? []) {
      retailerCtas += 1;
      const url = String(retailer?.url ?? '').trim();
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') throw new TypeError('HTTPS required');
        retailerUrls.add(parsed.href);
      } catch {
        invalidRetailerUrls.push({ productId: String(product.id ?? ''), url });
      }
    }
  }

  return {
    products: projection.products.length,
    currentRetailProducts,
    archivedProducts,
    unknownRetailProducts,
    marketReferenceProducts,
    currentByCategory: sortedObject(currentByCategory),
    currentByBrand: sortedObject(currentByBrand),
    retailerCtas,
    uniqueRetailerUrls: retailerUrls.size,
    invalidRetailerUrls: invalidRetailerUrls.sort((left, right) => (
      left.productId.localeCompare(right.productId) || left.url.localeCompare(right.url)
    )),
    currentWithoutRetailerLinks: currentWithoutRetailerLinks.sort(),
    marketReferenceLeakage: marketReferenceLeakageRows.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function routeFromHtmlPath(path) {
  const normalized = String(path).split(sep).join('/').replace(/^\.\//, '');
  if (normalized === 'index.html') return '/';
  if (!normalized.startsWith('pages/') || !normalized.endsWith('.html')) {
    throw new TypeError(`unsupported deployed HTML path: ${path}`);
  }
  let route = normalized.slice('pages'.length, -'.html'.length);
  if (route.endsWith('/index')) route = route.slice(0, -'/index'.length) || '/';
  return route || '/';
}

function fileMap(files) {
  return new Map((files ?? []).map((file) => [file.path, `${file.sha256}:${file.byteLength}`]));
}

function compareFiles(expected, actual) {
  const left = fileMap(expected);
  const right = fileMap(actual);
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .filter((path) => left.get(path) !== right.get(path))
    .map((path) => ({ path, expected: left.get(path) ?? null, actual: right.get(path) ?? null }));
}

function snapshotByteMismatches(expected, actual) {
  const mismatches = compareFiles(expected.files, actual.files);
  for (const field of ['projection', 'historicalReference', 'sitemap']) {
    if (expected?.[field]?.sha256 !== actual?.[field]?.sha256) {
      mismatches.push({
        path: field,
        expected: expected?.[field]?.sha256 ?? null,
        actual: actual?.[field]?.sha256 ?? null,
      });
    }
  }
  return mismatches.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizedSitemapRoute(value) {
  try {
    const parsed = new URL(value, 'https://www.fitappliance.com.au');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(value);
  }
}

export function buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback }) {
  for (const [label, snapshot] of Object.entries({ baseline, candidate, candidateRepeat, rollback })) {
    if (!snapshot || snapshot.schemaVersion !== 1) throw new TypeError(`${label} snapshot schema v1 required`);
  }
  const baselineRoutes = new Set(baseline.routes.map((record) => record.route));
  const candidateRoutes = new Set(candidate.routes.map((record) => record.route));
  const added = [...candidateRoutes].filter((route) => !baselineRoutes.has(route)).sort();
  const preserved = [...candidateRoutes].filter((route) => baselineRoutes.has(route)).sort();
  const removed = [...baselineRoutes].filter((route) => !candidateRoutes.has(route)).sort();
  const redirectRows = candidate.redirects ?? [];
  const redirects = new Map(redirectRows.map((redirect) => [redirect.source, redirect]));
  const redirectSourceCounts = new Map();
  for (const redirect of redirectRows) {
    redirectSourceCounts.set(redirect.source, (redirectSourceCounts.get(redirect.source) ?? 0) + 1);
  }
  const duplicateRedirectSources = [...redirectSourceCounts]
    .filter(([, count]) => count > 1)
    .map(([source]) => source)
    .sort();
  const redirected = removed
    .filter((route) => redirects.has(route))
    .map((source) => ({ source, destination: redirects.get(source).destination }));
  const nonPermanentRedirects = removed
    .filter((route) => redirects.has(route) && redirects.get(route).permanent !== true)
    .sort();
  const invalidRedirects = redirected.filter(({ destination }) => (
    !candidateRoutes.has(normalizedSitemapRoute(destination))
  ));
  const unexplainedRemoved = removed.filter((route) => !redirects.has(route));
  const noindexed = candidate.routes.filter((record) => record.noindex).map((record) => record.route).sort();
  const baselineNoindexed = new Set(
    baseline.routes.filter((record) => record.noindex).map((record) => record.route)
  );
  const newlyNoindexed = noindexed.filter((route) => !baselineNoindexed.has(route));
  const candidateSitemap = new Set(candidate.sitemap.urls.map(normalizedSitemapRoute));
  const baselineSitemap = new Set(baseline.sitemap.urls.map(normalizedSitemapRoute));
  const sitemapRemoved = [...baselineSitemap].filter((route) => !candidateSitemap.has(route)).sort();
  const noindexSet = new Set(noindexed);
  const indexableSitemapRemoved = sitemapRemoved.filter((route) => (
    candidateRoutes.has(route) && !noindexSet.has(route)
  ));
  const noindexInSitemap = noindexed.filter((route) => candidateSitemap.has(route));
  const candidateMismatches = snapshotByteMismatches(candidate, candidateRepeat);
  const rollbackMismatches = snapshotByteMismatches(baseline, rollback);
  const issues = [];

  if (candidate.projection.marketReferenceLeakage.length > 0) {
    issues.push({ code: 'MARKET_REFERENCE_COMMERCIAL_LEAKAGE', count: candidate.projection.marketReferenceLeakage.length });
  }
  if (candidate.projection.invalidRetailerUrls.length > 0) {
    issues.push({ code: 'INVALID_RETAILER_CTA_URL', count: candidate.projection.invalidRetailerUrls.length });
  }
  if ((candidate.projection.currentWithoutRetailerLinks ?? []).length > 0) {
    issues.push({ code: 'CURRENT_RETAILER_LINK_MISSING', count: candidate.projection.currentWithoutRetailerLinks.length });
  }
  for (const category of CORE_CATEGORIES) {
    if ((candidate.projection.currentByCategory[category] ?? 0) === 0) {
      issues.push({ code: 'CURRENT_CATEGORY_EMPTY', category });
    }
  }
  if (unexplainedRemoved.length > 0) {
    issues.push({ code: 'UNEXPLAINED_ROUTE_REMOVAL', count: unexplainedRemoved.length });
  }
  if (invalidRedirects.length > 0) {
    issues.push({ code: 'REDIRECT_DESTINATION_MISSING', count: invalidRedirects.length });
  }
  if (nonPermanentRedirects.length > 0) {
    issues.push({ code: 'REDIRECT_NOT_PERMANENT', count: nonPermanentRedirects.length });
  }
  if (duplicateRedirectSources.length > 0) {
    issues.push({ code: 'DUPLICATE_REDIRECT_SOURCE', count: duplicateRedirectSources.length });
  }
  if (noindexInSitemap.length > 0) {
    issues.push({ code: 'NOINDEX_ROUTE_IN_SITEMAP', count: noindexInSitemap.length });
  }
  if (indexableSitemapRemoved.length > 0) {
    issues.push({ code: 'INDEXABLE_ROUTE_REMOVED_FROM_SITEMAP', count: indexableSitemapRemoved.length });
  }
  if (candidateMismatches.length > 0) {
    issues.push({ code: 'CANDIDATE_BUILD_NONDETERMINISTIC', count: candidateMismatches.length });
  }
  if (rollbackMismatches.length > 0) {
    issues.push({ code: 'ROLLBACK_NOT_BYTE_IDENTICAL', count: rollbackMismatches.length });
  }
  if (candidate.runtimeCatalog.productCount !== candidate.projection.products) {
    issues.push({ code: 'RUNTIME_CATALOG_COUNT_MISMATCH' });
  }
  for (const field of ['publicDataBytes', 'siteBytes', 'controlPlaneBytes']) {
    const before = baseline.sizes[field];
    const after = candidate.sizes[field];
    if (Number.isFinite(before) && before > 0 && Number.isFinite(after) && after > before * 2) {
      issues.push({ code: 'CANDIDATE_SIZE_BOUNDARY_EXCEEDED', field, before, after });
    }
  }

  return {
    schemaVersion: 1,
    policyVersion: 'retail-cutover-impact-v1',
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    baseline: {
      sourceCommit: baseline.sourceCommit,
      products: baseline.projection.products,
      currentRetailProducts: baseline.projection.currentRetailProducts,
      retailerCtas: baseline.projection.retailerCtas,
      currentByCategory: baseline.projection.currentByCategory,
      currentByBrand: baseline.projection.currentByBrand,
    },
    candidate: {
      sourceCommit: candidate.sourceCommit,
      products: candidate.projection.products,
      currentRetailProducts: candidate.projection.currentRetailProducts,
      archivedProducts: candidate.projection.archivedProducts,
      marketReferenceProducts: candidate.projection.marketReferenceProducts,
      retailerCtas: candidate.projection.retailerCtas,
      uniqueRetailerUrls: candidate.projection.uniqueRetailerUrls,
      currentByCategory: candidate.projection.currentByCategory,
      currentByBrand: candidate.projection.currentByBrand,
      invalidRetailerUrls: candidate.projection.invalidRetailerUrls,
      currentWithoutRetailerLinks: candidate.projection.currentWithoutRetailerLinks ?? [],
      marketReferenceLeakage: candidate.projection.marketReferenceLeakage,
    },
    deltas: {
      products: candidate.projection.products - baseline.projection.products,
      currentRetailProducts: candidate.projection.currentRetailProducts - baseline.projection.currentRetailProducts,
      retailerCtas: candidate.projection.retailerCtas - baseline.projection.retailerCtas,
    },
    routes: {
      added,
      preserved,
      removed,
      configuredRedirects: redirectRows,
      redirected,
      invalidRedirects,
      nonPermanentRedirects,
      duplicateRedirectSources,
      unexplainedRemoved,
      noindexed,
      newlyNoindexed,
      derivedPageResults: {
        baseline: baseline.derivedPageResults ?? {},
        candidate: candidate.derivedPageResults ?? {},
      },
    },
    sitemap: {
      baselineUrls: baselineSitemap.size,
      candidateUrls: candidateSitemap.size,
      removed: sitemapRemoved,
      indexableRemoved: indexableSitemapRemoved,
      noindexInSitemap,
    },
    sizes: { baseline: baseline.sizes, candidate: candidate.sizes },
    determinism: { candidateByteIdentical: candidateMismatches.length === 0, mismatches: candidateMismatches },
    rollback: { byteIdentical: rollbackMismatches.length === 0, mismatches: rollbackMismatches },
    issues,
  };
}

async function listFiles(root, directory, predicate = () => true) {
  const absolute = resolve(root, directory);
  const result = [];
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      if (entry.isFile() && predicate(child)) result.push(child);
    }
  }
  await visit(absolute);
  return result.sort();
}

async function fileRecord(root, path) {
  const bytes = await readFile(path);
  return {
    path: relative(root, path).split(sep).join('/'),
    sha256: sha256(bytes),
    byteLength: bytes.length,
  };
}

async function directoryBytes(root, directory) {
  const files = await listFiles(root, directory);
  const sizes = await Promise.all(files.map((path) => stat(path).then((entry) => entry.size)));
  return sizes.reduce((sum, size) => sum + size, 0);
}

async function readDocument(path) {
  const bytes = await readFile(path);
  return { bytes, document: JSON.parse(bytes) };
}

async function readDerivedPageResults(repoRoot) {
  const result = {};
  for (const path of ['pages/cavity/index.json', 'pages/doorway/index.json']) {
    const rows = JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
    if (!Array.isArray(rows)) throw new TypeError(`${path} must contain an array`);
    for (const row of rows) {
      const route = String(row?.url ?? '');
      const count = Number(row?.results);
      if (!route.startsWith('/') || !Number.isInteger(count) || count < 0) {
        throw new TypeError(`${path} contains an invalid route result`);
      }
      if (Object.hasOwn(result, route)) throw new TypeError(`duplicate derived route result: ${route}`);
      result[route] = count;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function captureSiteSnapshot({
  repoRoot = defaultRoot,
  label,
  projectionPath,
  historicalReferencePath,
}) {
  const projectionAbsolute = resolve(repoRoot, projectionPath);
  const referenceAbsolute = resolve(repoRoot, historicalReferencePath);
  const [projection, reference, runtimeCatalog, sitemapBytes, vercel, pageFiles, publicDataFiles, pageIndexFiles, publicRuntimeFiles] = await Promise.all([
    readDocument(projectionAbsolute),
    readDocument(referenceAbsolute),
    readDocument(resolve(repoRoot, 'public/data/catalog-projection.json')),
    readFile(resolve(repoRoot, 'public/sitemap.xml')),
    readFile(resolve(repoRoot, 'vercel.json'), 'utf8').then(JSON.parse),
    listFiles(repoRoot, 'pages', (path) => path.endsWith('.html')),
    listFiles(repoRoot, 'public/data'),
    listFiles(repoRoot, 'pages', (path) => path.endsWith(`${sep}index.json`)),
    Promise.all(SNAPSHOT_RUNTIME_DIRECTORIES.map((directory) => listFiles(repoRoot, directory))).then((groups) => groups.flat()),
  ]);
  const routeFiles = [resolve(repoRoot, 'index.html'), ...pageFiles];
  const routes = await Promise.all(routeFiles.map(async (path) => {
    const bytes = await readFile(path);
    const relativePath = relative(repoRoot, path).split(sep).join('/');
    return {
      route: routeFromHtmlPath(relativePath),
      path: relativePath,
      sha256: sha256(bytes),
      noindex: hasNoindexMeta(bytes.toString('utf8')),
    };
  }));
  routes.sort((left, right) => left.route.localeCompare(right.route));
  const duplicateRoutes = routes.filter((route, index) => index > 0 && routes[index - 1].route === route.route);
  if (duplicateRoutes.length > 0) throw new Error(`duplicate deployed routes: ${duplicateRoutes.map((row) => row.route).join(', ')}`);

  const extraFiles = [
    resolve(repoRoot, 'index.html'),
    resolve(repoRoot, 'public/sitemap.xml'),
    resolve(repoRoot, 'public/service-worker.js'),
    resolve(repoRoot, 'public/styles.css'),
    resolve(repoRoot, 'public/styles-deferred.css'),
    resolve(repoRoot, 'pages/products/index.json'),
    ...pageIndexFiles,
  ];
  const siteFiles = [...new Set([...pageFiles, ...publicDataFiles, ...publicRuntimeFiles, ...extraFiles])].sort();
  const files = await Promise.all(siteFiles.map((path) => fileRecord(repoRoot, path)));
  const sitemapXml = sitemapBytes.toString('utf8');
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  const { stdout: sourceCommit } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return {
    schemaVersion: 1,
    label: String(label),
    capturedAt: new Date().toISOString(),
    sourceCommit: sourceCommit.trim(),
    projection: {
      path: relative(repoRoot, projectionAbsolute).split(sep).join('/'),
      sha256: sha256(projection.bytes),
      byteLength: projection.bytes.length,
      ...buildProjectionSummary(projection.document),
    },
    historicalReference: {
      path: relative(repoRoot, referenceAbsolute).split(sep).join('/'),
      sha256: sha256(reference.bytes),
      byteLength: reference.bytes.length,
      records: reference.document.records?.length ?? 0,
    },
    runtimeCatalog: {
      ...runtimeCatalog.document,
      sha256: sha256(runtimeCatalog.bytes),
      byteLength: runtimeCatalog.bytes.length,
    },
    routes,
    redirects: (vercel.redirects ?? []).map(({ source, destination, permanent }) => ({ source, destination, permanent: permanent === true })),
    sitemap: { sha256: sha256(sitemapBytes), byteLength: sitemapBytes.length, urls: sitemapUrls },
    files,
    derivedPageResults: await readDerivedPageResults(repoRoot),
    sizes: {
      publicDataBytes: await directoryBytes(repoRoot, 'public/data'),
      siteBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
      controlPlaneBytes: await directoryBytes(repoRoot, 'data/architecture-v2'),
    },
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function requiredOption(args, name) {
  const value = option(args, name);
  if (!value) throw new TypeError(`${name} required`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === 'snapshot') {
    const output = resolve(defaultRoot, requiredOption(args, '--output'));
    const repoRoot = resolve(option(args, '--repo-root') ?? defaultRoot);
    const snapshot = await captureSiteSnapshot({
      repoRoot,
      label: requiredOption(args, '--label'),
      projectionPath: requiredOption(args, '--projection'),
      historicalReferencePath: requiredOption(args, '--historical-reference'),
    });
    await atomicJson(output, snapshot);
    process.stdout.write(`${JSON.stringify({ output, label: snapshot.label, products: snapshot.projection.products, routes: snapshot.routes.length })}\n`);
    return snapshot;
  }
  if (command === 'compare') {
    const [baseline, candidate, candidateRepeat, rollback] = await Promise.all([
      requiredOption(args, '--baseline'),
      requiredOption(args, '--candidate'),
      requiredOption(args, '--candidate-repeat'),
      requiredOption(args, '--rollback'),
    ].map((path) => readFile(resolve(defaultRoot, path), 'utf8').then(JSON.parse)));
    const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
    const output = resolve(defaultRoot, requiredOption(args, '--output'));
    await atomicJson(output, report);
    process.stdout.write(`${JSON.stringify({ output, status: report.status, issues: report.issues.length })}\n`);
    if (report.status !== 'PASS') process.exitCode = 1;
    return report;
  }
  if (command === 'decide') {
    const [impact, browserQa, fitAudit, baseline, candidateBytes, cohorts, clearance, manifest, referenceBytes] = await Promise.all([
      '--impact',
      '--browser-qa',
      '--fit-audit',
      '--baseline-projection',
      '--candidate-projection',
      '--cohorts',
      '--clearance',
      '--release-manifest',
      '--candidate-reference',
    ].map(async (name) => {
      const bytes = await readFile(resolve(defaultRoot, requiredOption(args, name)));
      if (name === '--candidate-projection' || name === '--candidate-reference') return bytes;
      return JSON.parse(bytes);
    }));
    const bindings = validatePreviewInputs({ manifest, candidateBytes, referenceBytes });
    const candidate = JSON.parse(candidateBytes);
    const cohortDeltas = buildMeasuredCohortDeltas({
      baseline,
      candidate,
      cohorts,
      clearanceRules: clearance.rules ?? clearance,
      derivedPageResults: impact?.routes?.derivedPageResults ?? null,
    });
    const decision = applyRetailCutoverDecision({ impact, browserQa, fitAudit, cohortDeltas });
    const fitGeometryViolations = fitAudit?.summary?.violations;
    const fitInstallationViolations = fitAudit?.installation?.summary?.violations;
    const fitPublicationViolations = (
      Number.isInteger(fitGeometryViolations) && Number.isInteger(fitInstallationViolations)
        ? fitGeometryViolations + fitInstallationViolations
        : null
    );
    const report = {
      ...impact,
      decision: decision.decision,
      decisionEvidence: {
        policyVersion: decision.policyVersion,
        browserQaStatus: browserQa.status ?? 'MISSING',
        fitPublicationViolations,
        candidateBinding: bindings,
        measuredCohorts: cohortDeltas,
        blockers: decision.blockers,
      },
    };
    const output = resolve(defaultRoot, requiredOption(args, '--output'));
    await atomicJson(output, report);
    process.stdout.write(`${JSON.stringify({ output, decision: report.decision, blockers: decision.blockers.length })}\n`);
    if (report.decision !== 'CUTOVER_ALLOWED') process.exitCode = 1;
    return report;
  }
  throw new TypeError('command must be snapshot, compare, or decide');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
