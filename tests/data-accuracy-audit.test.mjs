import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PRODUCT_DATA_FILES,
  auditDataAccuracy,
  buildMarkdownReport,
  calculateAccuracyGrade,
  isRetailerProductPageUrl,
  writeAccuracyReports
} = require('../scripts/audit-data-accuracy.js');
const { isRetailerProductPageUrl: runtimeRetailerProductPageUrl } = require('../public/scripts/search-core.js');

function product(overrides = {}) {
  return {
    id: 'fixture-fridge-1',
    cat: 'fridge',
    brand: 'LG',
    model: 'GB335PL',
    w: 600,
    h: 1700,
    d: 650,
    kwh_year: 300,
    stars: 4,
    price: null,
    emoji: 'x',
    door_swing_mm: 0,
    features: ['Top Mount'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

test('data accuracy audit: retailer product URL classifier rejects root, search, category, and checkout URLs', () => {
  assert.equal(isRetailerProductPageUrl('https://www.harveynorman.com.au'), false);
  assert.equal(isRetailerProductPageUrl('https://www.harveynorman.com.au/search?q=LG'), false);
  assert.equal(isRetailerProductPageUrl('https://www.thegoodguys.com.au/category/fridges'), false);
  assert.equal(isRetailerProductPageUrl('https://www.jbhifi.com.au/cart'), false);
  assert.equal(isRetailerProductPageUrl('not-a-url'), false);
});

test('data accuracy audit: retailer product URL classifier accepts known product-page patterns', () => {
  assert.equal(isRetailerProductPageUrl('https://www.jbhifi.com.au/products/lg-gb335pl'), true);
  assert.equal(isRetailerProductPageUrl('https://www.appliancesonline.com.au/product/lg-gb335pl/'), true);
  assert.equal(isRetailerProductPageUrl('https://www.thegoodguys.com.au/lg-gb335pl-fridge'), true);
  assert.equal(isRetailerProductPageUrl('https://www.harveynorman.com.au/lg-gb335pl-fridge.html'), true);
  assert.equal(isRetailerProductPageUrl('https://www.harveynorman.com.au/lg-gb335pl-fridge.html/'), true);
  assert.equal(isRetailerProductPageUrl('https://www.binglee.com.au/products/lg-gb335pl'), true);
});

test('data accuracy audit: retailer URL classification stays aligned with runtime search filtering', () => {
  const sampleUrls = [
    'https://www.jbhifi.com.au/products/lg-gb335pl',
    'https://www.appliancesonline.com.au/product/lg-gb335pl/',
    'https://www.thegoodguys.com.au/lg-gb335pl-fridge',
    'https://www.harveynorman.com.au/lg-gb335pl-fridge.html/',
    'https://www.binglee.com.au/products/lg-gb335pl',
    'https://www.harveynorman.com.au',
    'https://www.jbhifi.com.au/search?query=LG',
    'https://www.thegoodguys.com.au/category/fridges'
  ];

  for (const url of sampleUrls) {
    assert.equal(isRetailerProductPageUrl(url), runtimeRetailerProductPageUrl(url), url);
  }
});

test('data accuracy audit: report flags invalid retailer URLs, stale prices, and missing evidence without mutating input', () => {
  const rows = [
    product({
      id: 'bad-link',
      retailers: [{ n: 'Harvey Norman', url: 'https://www.harveynorman.com.au', p: 1499 }]
    }),
    product({
      id: 'stale-price',
      brand: 'Haier',
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/haier-fridge', p: 999, verified_at: '2026-03-01' }]
    })
  ];
  const before = JSON.stringify(rows);

  const report = auditDataAccuracy({ products: rows, now: new Date('2026-04-30T00:00:00Z') });

  assert.equal(JSON.stringify(rows), before);
  assert.equal(report.summary.totalProducts, 2);
  assert.equal(report.summary.invalidRetailerUrlCount, 1);
  assert.equal(report.summary.pricedRetailersMissingVerifiedAt, 1);
  assert.equal(report.summary.stalePriceCount, 1);
  assert.equal(report.issues.blockers.some((issue) => issue.productId === 'bad-link'), true);
  assert.equal(report.issues.warnings.some((issue) => issue.productId === 'stale-price' && issue.code === 'price_stale'), true);
});

test('data accuracy audit: duplicate brand casing is reported by category and normalized key', () => {
  const report = auditDataAccuracy({
    products: [
      product({ id: 'haier-upper', brand: 'HAIER' }),
      product({ id: 'haier-title', brand: 'Haier' }),
      product({ id: 'bosch', brand: 'Bosch' })
    ],
    now: new Date('2026-04-30T00:00:00Z')
  });

  assert.equal(report.summary.brandDuplicateGroups, 1);
  assert.deepEqual(report.brandDuplicates[0].variants.sort(), ['HAIER', 'Haier']);
  assert.equal(report.brandDuplicates[0].cat, 'fridge');
});

test('data accuracy audit: accuracy grades degrade only for concrete data quality risks', () => {
  assert.equal(calculateAccuracyGrade({ hasInvalidRetailerUrl: true }), 'F');
  assert.equal(calculateAccuracyGrade({ hasRetailerProductUrl: true, hasFreshPrice: true }), 'A');
  assert.equal(calculateAccuracyGrade({ hasRetailerProductUrl: true, hasFreshPrice: false }), 'B');
  assert.equal(calculateAccuracyGrade({ hasInferredFields: true }), 'C');
  assert.equal(calculateAccuracyGrade({}), 'D');
});

test('data accuracy audit: markdown report summarizes blocker and warning counts for human review', () => {
  const report = auditDataAccuracy({
    products: [product({ retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/search?q=bad', p: null }] })],
    now: new Date('2026-04-30T00:00:00Z')
  });
  const markdown = buildMarkdownReport(report);

  assert.match(markdown, /Data Accuracy Audit/);
  assert.match(markdown, /Blockers/);
  assert.match(markdown, /retailer_non_product_url/);
  assert.match(markdown, /Next review workflow/);
});

test('data accuracy audit: writeAccuracyReports writes json and markdown to the requested directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-data-accuracy-'));
  const report = auditDataAccuracy({ products: [product()], now: new Date('2026-04-30T00:00:00Z') });
  const outputs = writeAccuracyReports(report, { outputDir: dir });

  assert.equal(fs.existsSync(outputs.jsonPath), true);
  assert.equal(fs.existsSync(outputs.markdownPath), true);
  assert.equal(JSON.parse(fs.readFileSync(outputs.jsonPath, 'utf8')).summary.totalProducts, 1);
  assert.match(fs.readFileSync(outputs.markdownPath, 'utf8'), /Data Accuracy Audit/);
});

test('data accuracy audit: package covers every runtime product data file', () => {
  assert.deepEqual(PRODUCT_DATA_FILES.map((entry) => entry.cat), ['fridge', 'dishwasher', 'dryer', 'washing_machine']);
  for (const entry of PRODUCT_DATA_FILES) {
    assert.match(entry.file, /^public\/data\/.+\.json$/);
  }
});

test('data accuracy audit: npm script and operator docs are wired', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const docs = fs.readFileSync(path.join(process.cwd(), 'docs', 'data-accuracy-audit.md'), 'utf8');

  assert.equal(pkg.scripts['audit-data-accuracy'], 'node scripts/audit-data-accuracy.js');
  assert.match(docs, /npm run audit-data-accuracy/);
  assert.match(docs, /Report-Only First/);
  assert.match(docs, /Retailer URL Quality/);
});
