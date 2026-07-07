import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildIndexNowPayload,
  filterSitemapUrls,
  parseArgs,
  pingIndexNow
} = require('../scripts/ping-indexnow.js');

const key = '1234567890abcdef1234567890abcdef';

test('phase 54 A3 IndexNow payload uses only filtered fit-check URLs', () => {
  const urls = [
    'https://www.fitappliance.com.au/',
    'https://www.fitappliance.com.au/fit-check/a',
    'https://www.fitappliance.com.au/fit-check/b'
  ];
  const filtered = filterSitemapUrls(urls, { includePrefix: '/fit-check/' });
  const payload = buildIndexNowPayload({
    host: 'www.fitappliance.com.au',
    key,
    urls: filtered
  });

  assert.deepEqual(payload.urlList, [
    'https://www.fitappliance.com.au/fit-check/a',
    'https://www.fitappliance.com.au/fit-check/b'
  ]);
  assert.equal(payload.host, 'www.fitappliance.com.au');
  assert.equal(payload.keyLocation, `https://www.fitappliance.com.au/${key}.txt`);
});

test('phase 54 A3 IndexNow ping writes per-engine response report without real network', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-indexnow-'));
  const publicDir = path.join(repoRoot, 'public');
  const reportPath = path.join(repoRoot, 'reports', 'fit-check', 'indexnow.json');
  const keyPath = path.join(repoRoot, '.indexnow-key');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  const calls = [];

  await mkdir(publicDir, { recursive: true });
  await writeFile(keyPath, `${key}\n`, 'utf8');
  await writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset>',
    '<url><loc>https://www.fitappliance.com.au/</loc></url>',
    '<url><loc>https://www.fitappliance.com.au/fit-check/a</loc></url>',
    '</urlset>'
  ].join('\n'), 'utf8');

  const report = await pingIndexNow({
    keyFile: keyPath,
    sitemapPath,
    reportPath,
    includePrefix: '/fit-check/',
    endpoints: [
      { name: 'Bing', hostname: 'www.bing.com', path: '/indexnow' },
      { name: 'Yandex', hostname: 'yandex.com', path: '/indexnow' }
    ],
    requester: async ({ endpoint, payload }) => {
      calls.push({ endpoint, payload });
      return { statusCode: 200, body: 'OK' };
    },
    logger: { log() {}, error() {} }
  });
  const written = JSON.parse(await readFile(reportPath, 'utf8'));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.urlList.length, 1);
  assert.equal(report.urlCount, 1);
  assert.deepEqual(report.responses.map((row) => row.statusCode), [200, 200]);
  assert.equal(written.responses[1].engine, 'Yandex');
});

test('phase 43 GEO IndexNow manifest mode selects only experiment routes', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-indexnow-manifest-'));
  const publicDir = path.join(repoRoot, 'public');
  const manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json');
  const keyPath = path.join(repoRoot, '.indexnow-key');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  const calls = [];

  await mkdir(publicDir, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(keyPath, `${key}\n`, 'utf8');
  await writeFile(manifestPath, JSON.stringify({
    schema_version: 1,
    treatment: [{ route: '/guides/fridge-clearance-requirements' }],
    controls: [{ route: '/fit-check/control-page' }]
  }), 'utf8');
  await writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset>',
    '<url><loc>https://www.fitappliance.com.au/guides/fridge-clearance-requirements</loc></url>',
    '<url><loc>https://www.fitappliance.com.au/fit-check/control-page</loc></url>',
    '<url><loc>https://www.fitappliance.com.au/brands/samsung-fridge-clearance</loc></url>',
    '</urlset>'
  ].join('\n'), 'utf8');

  const report = await pingIndexNow({
    keyFile: keyPath,
    sitemapPath,
    manifestPath,
    requester: async ({ payload }) => {
      calls.push(payload);
      return { statusCode: 202, body: 'accepted' };
    },
    logger: { log() {}, error() {} }
  });

  assert.deepEqual(calls[0].urlList, [
    'https://www.fitappliance.com.au/guides/fridge-clearance-requirements',
    'https://www.fitappliance.com.au/fit-check/control-page'
  ]);
  assert.equal(report.urlCount, 2);
  assert.deepEqual(report.selectedRoutes, [
    '/guides/fridge-clearance-requirements',
    '/fit-check/control-page'
  ]);
  assert.equal(report.selection.manifestRouteCount, 2);
});

test('phase 43 GEO IndexNow changed-from mode intersects manifest routes with changed page files', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-indexnow-changed-'));
  const publicDir = path.join(repoRoot, 'public');
  const manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json');
  const keyPath = path.join(repoRoot, '.indexnow-key');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  const calls = [];

  await mkdir(publicDir, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(keyPath, `${key}\n`, 'utf8');
  await writeFile(manifestPath, JSON.stringify({
    schema_version: 1,
    treatment: [
      { route: '/fit-check/changed-page' },
      { route: '/fit-check/unchanged-page' }
    ],
    controls: []
  }), 'utf8');
  await writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset>',
    '<url><loc>https://www.fitappliance.com.au/fit-check/changed-page</loc></url>',
    '<url><loc>https://www.fitappliance.com.au/fit-check/unchanged-page</loc></url>',
    '</urlset>'
  ].join('\n'), 'utf8');

  const args = parseArgs([
    '--manifest=data/geo-treatment-pages.json',
    '--changed-from=origin/main',
    '--include-prefix=/fit-check/'
  ]);
  assert.equal(args.manifestPath, 'data/geo-treatment-pages.json');
  assert.equal(args.changedFrom, 'origin/main');

  const report = await pingIndexNow({
    keyFile: keyPath,
    sitemapPath,
    manifestPath,
    changedFrom: 'origin/main',
    changedFiles: [
      'pages/fit-check/changed-page.html',
      'docs/phase43-geo-experiment/phase43-geo-measurement.md'
    ],
    requester: async ({ payload }) => {
      calls.push(payload);
      return { statusCode: 200, body: 'OK' };
    },
    logger: { log() {}, error() {} }
  });

  assert.deepEqual(calls[0].urlList, [
    'https://www.fitappliance.com.au/fit-check/changed-page'
  ]);
  assert.deepEqual(report.selectedRoutes, ['/fit-check/changed-page']);
  assert.equal(report.selection.changedFrom, 'origin/main');
  assert.equal(report.selection.changedFileCount, 2);
});

test('phase 43 GEO IndexNow dry run records selected URLs without sending requests', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-indexnow-dry-run-'));
  const publicDir = path.join(repoRoot, 'public');
  const reportPath = path.join(repoRoot, 'reports', 'indexnow', 'dry-run.json');
  const keyPath = path.join(repoRoot, '.indexnow-key');
  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  let requestCount = 0;

  await mkdir(publicDir, { recursive: true });
  await writeFile(keyPath, `${key}\n`, 'utf8');
  await writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset>',
    '<url><loc>https://www.fitappliance.com.au/guides/fridge-clearance-requirements</loc></url>',
    '</urlset>'
  ].join('\n'), 'utf8');

  const args = parseArgs(['--dry-run']);
  assert.equal(args.dryRun, true);

  const report = await pingIndexNow({
    keyFile: keyPath,
    sitemapPath,
    reportPath,
    dryRun: true,
    requester: async () => {
      requestCount += 1;
      return { statusCode: 200, body: 'should not be called' };
    },
    logger: { log() {}, error() {} }
  });
  const written = JSON.parse(await readFile(reportPath, 'utf8'));

  assert.equal(requestCount, 0);
  assert.equal(report.responses[0].dryRun, true);
  assert.equal(report.responses[0].ok, true);
  assert.match(report.responses[0].body, /no request sent/i);
  assert.equal(written.urlCount, 1);
});
