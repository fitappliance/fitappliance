import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditGscBuckets,
  extractInternalLinks,
  parseCsvRows,
  slugFromBucketFilename
} = require('../scripts/audit-gsc-buckets.js');
const {
  removeMissingFitCheckLinks
} = require('../scripts/repair-fit-check-links.js');

test('gsc bucket audit: bucket filename is normalized for reports', () => {
  assert.equal(slugFromBucketFilename('not-found-404.csv'), 'not-found-404');
  assert.equal(slugFromBucketFilename('/tmp/Duplicate without user-selected canonical.csv'), 'duplicate-without-user-selected-canonical');
});

test('gsc bucket audit: csv parser handles quoted URLs and item columns', () => {
  const rows = parseCsvRows('URL,Item name,Last crawled\n"https://www.fitappliance.com.au/a,b","Airflo AFF070","May 30, 2026"\n');

  assert.deepEqual(rows, [{
    URL: 'https://www.fitappliance.com.au/a,b',
    'Item name': 'Airflo AFF070',
    'Last crawled': 'May 30, 2026'
  }]);
});

test('gsc bucket audit: internal link extractor ignores assets and external URLs', () => {
  const links = extractInternalLinks(`
    <a href="/products/example">Product</a>
    <a href="https://www.fitappliance.com.au/brands/lg-fridge-clearance?x=1">Brand</a>
    <a href="/styles.css">Style</a>
    <a href="\${target}">Template</a>
    <a href="https://example.com/offsite">Offsite</a>
  `);

  assert.deepEqual(links, ['/brands/lg-fridge-clearance', '/products/example']);
});

test('gsc bucket audit: reports broken internal links and duplicate canonicals', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-gsc-buckets-'));
  fs.mkdirSync(path.join(root, 'pages', 'products'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), [
    '<urlset>',
    '<url><loc>https://www.fitappliance.com.au/products/alpha</loc></url>',
    '<url><loc>https://www.fitappliance.com.au/products/beta</loc></url>',
    '</urlset>'
  ].join(''));
  fs.writeFileSync(path.join(root, 'vercel.json'), JSON.stringify({
    redirects: [{ source: '/old-alpha', destination: '/products/alpha', permanent: true }]
  }));
  fs.writeFileSync(path.join(root, 'pages', 'products', 'alpha.html'), [
    '<link rel="canonical" href="https://www.fitappliance.com.au/products/alpha">',
    '<a href="/missing-local">Broken</a>'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'pages', 'products', 'beta.html'), '<link rel="canonical" href="https://www.fitappliance.com.au/products/alpha">');

  const result = await auditGscBuckets({
    repoRoot: root,
    write: false,
    now: '2026-06-23T00:00:00.000Z',
    logger: { log() {} }
  });

  assert.equal(result.summary.sitemapUrls, 2);
  assert.equal(result.buckets.localBrokenLinks.length, 1);
  assert.equal(result.buckets.duplicateCanonicalGroups.length, 1);
  assert.equal(result.buckets.redirectRules.length, 1);
});

test('fit-check link repair: removes only links to missing generated pages', () => {
  const available = new Set(['known-in-600mm-cavity']);
  const repaired = removeMissingFitCheckLinks([
    '<a href="/fit-check/known-in-600mm-cavity">Known</a>',
    '<a class="x" href="/fit-check/missing-in-600mm-cavity">Missing</a>',
    '<a href="/products/real-product">Product</a>'
  ].join('\n'), available);

  assert.equal(repaired.removed, 1);
  assert.match(repaired.html, /known-in-600mm-cavity/);
  assert.doesNotMatch(repaired.html, /missing-in-600mm-cavity/);
  assert.match(repaired.html, /\/products\/real-product/);
});
