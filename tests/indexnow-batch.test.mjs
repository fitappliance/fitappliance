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
