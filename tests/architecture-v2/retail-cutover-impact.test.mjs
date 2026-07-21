import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyRetailCutoverDecision,
  buildMeasuredCohortDeltas,
  buildProjectionSummary,
  buildRetailCutoverImpact,
  hasNoindexMeta,
  routeFromHtmlPath,
  SNAPSHOT_RUNTIME_DIRECTORIES,
} from '../../scripts/architecture-v2/audit-retail-cutover-impact.mjs';
import {
  PREVIEW_PAGE_GENERATORS,
  validatePreviewInputs,
} from '../../scripts/architecture-v2/build-retail-cutover-preview.mjs';
import productPageGenerator from '../../scripts/generate-product-pages.js';

const { generateProductPages } = productPageGenerator;

function product(overrides = {}) {
  return {
    id: 'fridge-1',
    canonicalProductId: 'fa_prod_1',
    cat: 'fridge',
    brand: 'Example',
    model: 'F-1',
    unavailable: false,
    retailers: [{ n: 'Retailer', url: 'https://retailer.example/f-1', p: 999 }],
    sponsored: false,
    ...overrides,
  };
}

function snapshot({
  label,
  projection,
  routes = ['/'],
  redirects = [],
  sitemapUrls = routes,
  files = [{ path: 'index.html', sha256: 'a'.repeat(64), byteLength: 10 }],
  derivedPageResults = {},
} = {}) {
  return {
    schemaVersion: 1,
    label,
    sourceCommit: '1'.repeat(40),
    projection: {
      path: `${label}.json`,
      sha256: label === 'candidate' ? 'c'.repeat(64) : 'b'.repeat(64),
      byteLength: 100,
      ...buildProjectionSummary(projection),
    },
    historicalReference: { path: `${label}-history.json`, sha256: 'd'.repeat(64), byteLength: 50, records: 1 },
    runtimeCatalog: { productCount: projection.products.length },
    routes: routes.map((route) => ({ route, path: route === '/' ? 'index.html' : `pages${route}.html`, sha256: 'e'.repeat(64), noindex: false })),
    redirects,
    sitemap: { sha256: 'f'.repeat(64), urls: sitemapUrls },
    files,
    derivedPageResults,
    sizes: { publicDataBytes: 1000, siteBytes: 2000, controlPlaneBytes: 3000 },
  };
}

test('projection summary keeps lifecycle, category, brand, CTA and market-reference safety separate', () => {
  const projection = {
    products: [
      product({
        retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
        lifecycleVisibility: 'CURRENT_OUTPUT',
      }),
      product({
        id: 'dishwasher-1',
        canonicalProductId: 'fa_prod_2',
        cat: 'dishwasher',
        brand: 'Other',
        model: 'D-1',
        unavailable: true,
        retailers: [],
        retailLifecycle: { lifecycleState: 'CATALOG_ARCHIVED' },
        lifecycleVisibility: 'HISTORICAL_INPUT_ONLY',
      }),
      product({
        id: 'fridge-reference',
        canonicalProductId: 'fa_prod_3',
        model: 'F-OLD',
        unavailable: true,
        retailers: [],
        price: null,
        retailLifecycle: { lifecycleState: 'UNKNOWN_RETAIL' },
        lifecycleVisibility: 'MARKET_REFERENCE_ONLY',
      }),
    ],
  };

  const summary = buildProjectionSummary(projection);
  assert.equal(summary.products, 3);
  assert.equal(summary.currentRetailProducts, 1);
  assert.equal(summary.archivedProducts, 1);
  assert.equal(summary.marketReferenceProducts, 1);
  assert.deepEqual(summary.currentByCategory, { fridge: 1 });
  assert.deepEqual(summary.currentByBrand, { Example: 1 });
  assert.equal(summary.retailerCtas, 1);
  assert.deepEqual(summary.marketReferenceLeakage, []);
});

test('noindex detection accepts either meta attribute order without matching unrelated tags', () => {
  assert.equal(hasNoindexMeta('<meta name="robots" content="noindex,follow">'), true);
  assert.equal(hasNoindexMeta('<meta content="follow, noindex" data-test="x" name="robots">'), true);
  assert.equal(hasNoindexMeta('<meta name="description" content="robots noindex">'), false);
});

test('impact report classifies route changes and proves deterministic candidate plus byte-identical rollback', () => {
  const baselineProjection = { products: [product()] };
  const candidateProjection = {
    products: ['fridge', 'dishwasher', 'dryer', 'washing_machine'].map((cat, index) => product({
      id: `${cat}-${index}`,
      canonicalProductId: `fa_prod_${index}`,
      cat,
      retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      lifecycleVisibility: 'CURRENT_OUTPUT',
    })),
  };
  const baseline = snapshot({
    label: 'baseline',
    projection: baselineProjection,
    routes: ['/', '/products/old'],
    derivedPageResults: { '/cavity/600mm-fridge': 12 },
  });
  const candidate = snapshot({
    label: 'candidate',
    projection: candidateProjection,
    routes: ['/', '/products/new'],
    redirects: [{ source: '/products/old', destination: '/products/new', permanent: true }],
    derivedPageResults: { '/cavity/600mm-fridge': 4 },
  });
  const candidateRepeat = structuredClone(candidate);
  candidateRepeat.label = 'candidate-repeat';
  const rollback = structuredClone(baseline);
  rollback.label = 'rollback';

  const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.routes.added, ['/products/new']);
  assert.deepEqual(report.routes.preserved, ['/']);
  assert.deepEqual(report.routes.configuredRedirects, [{
    source: '/products/old',
    destination: '/products/new',
    permanent: true,
  }]);
  assert.deepEqual(report.routes.redirected, [{ source: '/products/old', destination: '/products/new' }]);
  assert.deepEqual(report.routes.unexplainedRemoved, []);
  assert.deepEqual(report.routes.newlyNoindexed, []);
  assert.deepEqual(report.routes.derivedPageResults, {
    baseline: { '/cavity/600mm-fridge': 12 },
    candidate: { '/cavity/600mm-fridge': 4 },
  });
  assert.equal(report.determinism.candidateByteIdentical, true);
  assert.equal(report.rollback.byteIdentical, true);
  assert.deepEqual(report.issues, []);
});

test('measured cohorts fail closed when a previously populated group reaches zero', () => {
  const baseline = {
    products: [
      product({ id: 'hisense', brand: 'Hisense', model: 'H-1', w: 600 }),
      product({ id: 'chiq', brand: 'CHIQ', model: 'C-1', w: 600 }),
    ],
  };
  const candidate = {
    products: [product({
      id: 'hisense',
      brand: 'Hisense',
      model: 'H-1',
      w: 600,
      retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      lifecycleVisibility: 'CURRENT_OUTPUT',
    })],
  };
  const cohorts = {
    schemaVersion: 1,
    cohorts: [{
      rank: 1,
      route: '/compare/hisense-vs-chiq-fridge-clearance',
      kind: 'comparison',
      category: 'fridge',
      groups: [
        { id: 'brandA', brand: 'Hisense' },
        { id: 'brandB', brand: 'CHIQ' },
      ],
    }],
  };

  const deltas = buildMeasuredCohortDeltas({ baseline, candidate, cohorts, clearanceRules: {} });
  assert.equal(deltas[0].groups[0].candidateResults, 1);
  assert.equal(deltas[0].groups[1].baselineResults, 1);
  assert.equal(deltas[0].groups[1].candidateResults, 0);
  assert.equal(deltas[0].status, 'ZEROED');
});

test('measured cavity cohorts use exact generated-page results instead of reimplementing fit rules', () => {
  const projection = { products: [product({ w: 500 })] };
  const cohorts = {
    schemaVersion: 1,
    cohorts: [{
      rank: 1,
      route: '/cavity/600mm-fridge',
      kind: 'cavity',
      category: 'fridge',
      widthMm: 600,
      groups: [{ id: 'fitResults' }],
    }],
  };
  const deltas = buildMeasuredCohortDeltas({
    baseline: projection,
    candidate: projection,
    cohorts,
    clearanceRules: {},
    derivedPageResults: {
      baseline: { '/cavity/600mm-fridge': 10 },
      candidate: { '/cavity/600mm-fridge': 2 },
    },
  });
  assert.equal(deltas[0].groups[0].baselineResults, 10);
  assert.equal(deltas[0].groups[0].candidateResults, 2);
});

test('measured cavity cohorts fail closed when generated-page results are unavailable', () => {
  const projection = { products: [product({ w: 500 })] };
  const cohorts = {
    schemaVersion: 1,
    cohorts: [{
      rank: 1,
      route: '/cavity/600mm-fridge',
      kind: 'cavity',
      category: 'fridge',
      widthMm: 600,
    }],
  };

  assert.throws(
    () => buildMeasuredCohortDeltas({ baseline: projection, candidate: projection, cohorts }),
    /generated results required for measured cavity cohort/
  );
});

test('automatic cutover decision requires impact, browser, Fit and measured cohorts to pass', () => {
  const baseInputs = {
    impact: {
      status: 'PASS',
      issues: [],
      routes: {
        added: [],
        preserved: ['/'],
        configuredRedirects: [],
        newlyNoindexed: [],
      },
    },
    browserQa: {
      status: 'PASS',
      checks: [
        { id: 'desktop-cavity-search', status: 'PASS' },
        { id: 'desktop-replacement-search', status: 'PASS' },
      ],
    },
    fitAudit: {
      summary: { violations: 0 },
      installation: { summary: { violations: 0 } },
      violations: [],
    },
    cohortDeltas: [{ route: '/', status: 'PRESERVED', groups: [] }],
  };

  const allowed = applyRetailCutoverDecision(baseInputs);
  assert.equal(allowed.decision, 'CUTOVER_ALLOWED');
  assert.deepEqual(allowed.blockers, []);

  const blocked = applyRetailCutoverDecision({
    ...baseInputs,
    cohortDeltas: [{ route: '/cavity/600mm-fridge', status: 'ZEROED', groups: [] }],
  });
  assert.equal(blocked.decision, 'RETAIL_COVERAGE_REQUIRED');
  assert.ok(blocked.blockers.some((row) => row.code === 'MEASURED_COHORT_ZEROED'));

  const installationBlocked = applyRetailCutoverDecision({
    ...baseInputs,
    fitAudit: {
      summary: { violations: 0 },
      installation: { summary: { violations: 1 } },
    },
  });
  assert.ok(installationBlocked.blockers.some((row) => row.code === 'FIT_PUBLICATION_VIOLATION'));

  const browserBlocked = applyRetailCutoverDecision({
    ...baseInputs,
    browserQa: {
      status: 'PASS',
      checks: [...baseInputs.browserQa.checks, { id: 'mobile-cavity-search', status: 'FAIL' }],
    },
  });
  assert.ok(browserBlocked.blockers.some((row) => row.code === 'BROWSER_QA_CHECK_FAILED'));

  const missingFitAudit = applyRetailCutoverDecision({ ...baseInputs, fitAudit: {} });
  assert.ok(missingFitAudit.blockers.some((row) => row.code === 'FIT_PUBLICATION_AUDIT_MISSING'));

  const unresolvedMeasuredRoute = applyRetailCutoverDecision({
    ...baseInputs,
    cohortDeltas: [{ route: '/compare/hisense-vs-chiq-fridge-clearance', status: 'PRESERVED', groups: [] }],
  });
  assert.ok(unresolvedMeasuredRoute.blockers.some((row) => (
    row.code === 'MEASURED_ROUTE_UNRESOLVED'
    && row.routes.includes('/compare/hisense-vs-chiq-fridge-clearance')
  )));

  const redirectedMeasuredRoute = applyRetailCutoverDecision({
    ...baseInputs,
    impact: {
      ...baseInputs.impact,
      routes: {
        added: ['/compare/hisense-vs-chiq-fridge'],
        preserved: ['/'],
        configuredRedirects: [{
          source: '/compare/hisense-vs-chiq-fridge-clearance',
          destination: '/compare/hisense-vs-chiq-fridge',
          permanent: true,
        }],
        newlyNoindexed: [],
      },
    },
    cohortDeltas: [{ route: '/compare/hisense-vs-chiq-fridge-clearance', status: 'PRESERVED', groups: [] }],
  });
  assert.equal(redirectedMeasuredRoute.decision, 'CUTOVER_ALLOWED');

  const missingRouteEvidence = applyRetailCutoverDecision({
    ...baseInputs,
    impact: { status: 'PASS', issues: [], routes: { newlyNoindexed: [] } },
  });
  assert.ok(missingRouteEvidence.blockers.some((row) => row.code === 'MEASURED_ROUTE_RESOLUTION_MISSING'));
});

test('impact report fails closed for commercial market-reference leakage and unexplained route removal', () => {
  const baselineProjection = { products: [product()] };
  const candidateProjection = {
    products: [product({
      unavailable: true,
      lifecycleVisibility: 'MARKET_REFERENCE_ONLY',
      retailLifecycle: { lifecycleState: 'UNKNOWN_RETAIL' },
      price: 899,
    })],
  };
  const baseline = snapshot({ label: 'baseline', projection: baselineProjection, routes: ['/', '/products/old'] });
  const candidate = snapshot({ label: 'candidate', projection: candidateProjection, routes: ['/'] });
  const candidateRepeat = structuredClone(candidate);
  candidateRepeat.label = 'candidate-repeat';
  const rollback = structuredClone(baseline);
  rollback.label = 'rollback';

  const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'MARKET_REFERENCE_COMMERCIAL_LEAKAGE'));
  assert.ok(report.issues.some((issue) => issue.code === 'UNEXPLAINED_ROUTE_REMOVAL'));
});

test('impact report rejects a current-retail row without a retailer product link', () => {
  const products = ['fridge', 'dishwasher', 'dryer', 'washing_machine'].map((cat, index) => product({
    id: `${cat}-${index}`,
    canonicalProductId: `fa_prod_${index}`,
    cat,
    retailers: index === 0 ? [] : product().retailers,
    retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
    lifecycleVisibility: 'CURRENT_OUTPUT',
  }));
  const baseline = snapshot({ label: 'baseline', projection: { products } });
  const candidate = snapshot({ label: 'candidate', projection: { products } });
  const candidateRepeat = structuredClone(candidate);
  candidateRepeat.label = 'candidate-repeat';
  const rollback = structuredClone(baseline);
  rollback.label = 'rollback';

  const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'CURRENT_RETAILER_LINK_MISSING'));
});

test('impact report fails closed when a removed route redirects to a missing candidate route', () => {
  const projection = {
    products: ['fridge', 'dishwasher', 'dryer', 'washing_machine'].map((cat, index) => product({
      id: `${cat}-${index}`,
      canonicalProductId: `fa_prod_${index}`,
      cat,
      retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      lifecycleVisibility: 'CURRENT_OUTPUT',
    })),
  };
  const baseline = snapshot({ label: 'baseline', projection, routes: ['/', '/products/old'] });
  const candidate = snapshot({
    label: 'candidate',
    projection,
    routes: ['/'],
    redirects: [{ source: '/products/old', destination: '/products/missing', permanent: true }],
  });
  const candidateRepeat = structuredClone(candidate);
  candidateRepeat.label = 'candidate-repeat';
  const rollback = structuredClone(baseline);
  rollback.label = 'rollback';

  const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(report.routes.invalidRedirects, [{
    source: '/products/old',
    destination: '/products/missing',
  }]);
  assert.ok(report.issues.some((issue) => issue.code === 'REDIRECT_DESTINATION_MISSING'));
});

test('impact report fails closed for non-permanent redirects and silent sitemap removal', () => {
  const projection = {
    products: ['fridge', 'dishwasher', 'dryer', 'washing_machine'].map((cat, index) => product({
      id: `${cat}-${index}`,
      canonicalProductId: `fa_prod_${index}`,
      cat,
      retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      lifecycleVisibility: 'CURRENT_OUTPUT',
    })),
  };
  const baseline = snapshot({
    label: 'baseline',
    projection,
    routes: ['/', '/brands/example', '/products/old'],
  });
  const candidate = snapshot({
    label: 'candidate',
    projection,
    routes: ['/', '/brands/example'],
    redirects: [{ source: '/products/old', destination: '/brands/example', permanent: false }],
    sitemapUrls: ['/'],
  });
  const candidateRepeat = structuredClone(candidate);
  candidateRepeat.label = 'candidate-repeat';
  const rollback = structuredClone(baseline);
  rollback.label = 'rollback';

  const report = buildRetailCutoverImpact({ baseline, candidate, candidateRepeat, rollback });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'REDIRECT_NOT_PERMANENT'));
  assert.ok(report.issues.some((issue) => issue.code === 'INDEXABLE_ROUTE_REMOVED_FROM_SITEMAP'));
});

test('HTML paths map to deployed clean routes', () => {
  assert.equal(routeFromHtmlPath('index.html'), '/');
  assert.equal(routeFromHtmlPath('pages/products.html'), '/products');
  assert.equal(routeFromHtmlPath('pages/products/model-1.html'), '/products/model-1');
  assert.equal(routeFromHtmlPath('pages/subscribe/thanks.html'), '/subscribe/thanks');
});

test('site snapshots include deployed runtime JavaScript directories', () => {
  assert.deepEqual(SNAPSHOT_RUNTIME_DIRECTORIES, ['public/js', 'public/scripts']);
});

test('preview build accepts only a READY manifest bound to exact candidate bytes', () => {
  const candidateBytes = Buffer.from('{"products":[]}\n');
  const referenceBytes = Buffer.from('{"records":[]}\n');
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    releaseCandidateId: 'retail_lifecycle_release_test',
    authorization: { status: 'READY_FOR_CUTOVER' },
    sourceBindings: {
      finalCandidateProjectionSha256: digest(candidateBytes),
      historicalReferenceCandidateSha256: digest(referenceBytes),
    },
  };

  assert.deepEqual(validatePreviewInputs({ manifest, candidateBytes, referenceBytes }), {
    releaseCandidateId: 'retail_lifecycle_release_test',
    candidateSha256: digest(candidateBytes),
    historicalReferenceSha256: digest(referenceBytes),
  });
  assert.throws(() => validatePreviewInputs({
    manifest: { ...manifest, authorization: { status: 'BLOCKED' } },
    candidateBytes,
    referenceBytes,
  }), /not authorized/i);
  assert.throws(() => validatePreviewInputs({ manifest, candidateBytes: Buffer.from('{}\n'), referenceBytes }), /candidate projection hash/i);
});

test('product-page preview reads the explicitly supplied candidate catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fit-cutover-product-pages-'));
  const outputDir = join(root, 'pages', 'products');
  const catalogPath = join(root, 'candidate.json');
  await mkdir(join(root, 'pages'), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify({ products: [product({
    evidence: { has_pdf_evidence: true, verified_at: '2026-07-21' },
    w: 600,
    h: 1700,
    d: 650,
  })] })}\n`);

  const result = await generateProductPages({
    repoRoot: root,
    outputDir,
    catalogPath,
    logger: { log() {} },
  });
  assert.equal(result.count, 1);
  const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'));
  assert.equal(index[0].id, 'fridge-1');
});

test('canonical and preview builds regenerate measurement landing pages before the sitemap', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const build = packageJson.scripts.build;
  assert.match(build, /generate-cavity-pages\.js/);
  assert.match(build, /generate-doorway-pages\.js/);
  assert.ok(build.indexOf('generate-cavity-pages.js') < build.indexOf('generate-sitemap.js'));
  assert.ok(build.indexOf('generate-doorway-pages.js') < build.indexOf('generate-sitemap.js'));
  assert.ok(PREVIEW_PAGE_GENERATORS.includes('scripts/generate-cavity-pages.js'));
  assert.ok(PREVIEW_PAGE_GENERATORS.includes('scripts/generate-doorway-pages.js'));
});
