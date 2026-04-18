import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  chooseSentinelUrls,
  parseSitemapUrls,
  runUptimeCheck
} = require('../scripts/uptime-check.js');
const { findBrokenLinks } = require('../scripts/broken-link-check.js');
const { checkOrphanReport } = require('../scripts/orphan-check.js');

const FIXED_NOW = new Date('2026-04-18T12:00:00.000Z');

test('phase 27 sentinel: uptime check fails when at least one URL is non-200', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-uptime-'));
  const sitemapPath = path.join(tempRoot, 'sitemap.xml');
  await writeFile(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://fitappliance.com.au/</loc></url>
  <url><loc>https://fitappliance.com.au/guides/appliance-fit-sizing-handbook</loc></url>
</urlset>`, 'utf8');

  const seen = [];
  const result = await runUptimeCheck({
    sitemapPath,
    reportPath: path.join(tempRoot, 'uptime-report.json'),
    now: FIXED_NOW,
    fetchImpl: async (url) => {
      seen.push(url);
      if (String(url).includes('/guides/')) return { status: 503 };
      return { status: 200 };
    }
  });

  assert.equal(seen.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.failures[0].status, 503);
});

test('phase 27 sentinel: broken-link detector reports missing internal href targets', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-links-'));
  await mkdir(path.join(tempRoot, 'pages'), { recursive: true });
  await mkdir(path.join(tempRoot, 'pages', 'guides'), { recursive: true });
  await mkdir(path.join(tempRoot, 'reports'), { recursive: true });

  await writeFile(path.join(tempRoot, 'index.html'), '<a href="/guides/ok">Guide</a>', 'utf8');
  await writeFile(path.join(tempRoot, 'pages', 'guides', 'ok.html'), '<h1>ok</h1>', 'utf8');
  await writeFile(path.join(tempRoot, 'pages', 'missing.html'), '<a href="/this-page-does-not-exist">Bad</a>', 'utf8');
  await writeFile(path.join(tempRoot, 'vercel.json'), JSON.stringify({ rewrites: [] }), 'utf8');

  const result = await findBrokenLinks({
    repoRoot: tempRoot,
    reportPath: path.join(tempRoot, 'reports', 'broken-links.json')
  });

  assert.equal(result.broken.length, 1);
  assert.equal(result.broken[0].href, '/this-page-does-not-exist');
  assert.equal(result.exitCode, 1);
});

test('phase 27 sentinel: broken-link detector ignores external links', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-links-ok-'));
  await mkdir(path.join(tempRoot, 'pages'), { recursive: true });
  await mkdir(path.join(tempRoot, 'reports'), { recursive: true });
  await mkdir(path.join(tempRoot, 'pages', 'guides'), { recursive: true });

  await writeFile(path.join(tempRoot, 'index.html'), '<a href="https://example.com/help">External</a>', 'utf8');
  await writeFile(path.join(tempRoot, 'pages', 'guides', 'ok.html'), '<a href="https://fitappliance.com.au/guides/ok">Self host</a>', 'utf8');
  await writeFile(path.join(tempRoot, 'vercel.json'), JSON.stringify({ rewrites: [] }), 'utf8');

  const result = await findBrokenLinks({
    repoRoot: tempRoot,
    reportPath: path.join(tempRoot, 'reports', 'broken-links.json')
  });

  assert.equal(result.broken.length, 0);
  assert.equal(result.exitCode, 0);
});

test('phase 27 sentinel: orphan check fails when orphanPages > 0', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-orphan-'));
  const reportPath = path.join(tempRoot, 'link-graph.json');
  const outputPath = path.join(tempRoot, 'orphan-check.json');
  await writeFile(reportPath, JSON.stringify({
    summary: { orphanPages: 3, averageInlinks: 2.5 }
  }), 'utf8');

  const result = await checkOrphanReport({ reportPath, outputPath });
  assert.equal(result.exitCode, 1);
  assert.equal(result.orphanPages, 3);
});

test('phase 27 sentinel: orphan check passes when orphanPages is zero', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-orphan-ok-'));
  const reportPath = path.join(tempRoot, 'link-graph.json');
  const outputPath = path.join(tempRoot, 'orphan-check.json');
  await writeFile(reportPath, JSON.stringify({
    summary: { orphanPages: 0, averageInlinks: 14.5 }
  }), 'utf8');

  const result = await checkOrphanReport({ reportPath, outputPath });
  assert.equal(result.exitCode, 0);
  assert.equal(result.orphanPages, 0);
});

test('phase 27 sentinel: sitemap sampler includes homepage and expected pool slices', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://fitappliance.com.au/</loc></url>
  <url><loc>https://fitappliance.com.au/guides/a</loc></url>
  <url><loc>https://fitappliance.com.au/guides/b</loc></url>
  <url><loc>https://fitappliance.com.au/guides/c</loc></url>
  <url><loc>https://fitappliance.com.au/guides/d</loc></url>
  <url><loc>https://fitappliance.com.au/guides/e</loc></url>
  <url><loc>https://fitappliance.com.au/cavity/1</loc></url>
  <url><loc>https://fitappliance.com.au/cavity/2</loc></url>
  <url><loc>https://fitappliance.com.au/cavity/3</loc></url>
  <url><loc>https://fitappliance.com.au/cavity/4</loc></url>
  <url><loc>https://fitappliance.com.au/cavity/5</loc></url>
  <url><loc>https://fitappliance.com.au/doorway/1</loc></url>
  <url><loc>https://fitappliance.com.au/doorway/2</loc></url>
  <url><loc>https://fitappliance.com.au/doorway/3</loc></url>
  <url><loc>https://fitappliance.com.au/doorway/4</loc></url>
  <url><loc>https://fitappliance.com.au/doorway/5</loc></url>
  <url><loc>https://fitappliance.com.au/brands/a</loc></url>
  <url><loc>https://fitappliance.com.au/brands/b</loc></url>
  <url><loc>https://fitappliance.com.au/brands/c</loc></url>
  <url><loc>https://fitappliance.com.au/brands/d</loc></url>
  <url><loc>https://fitappliance.com.au/brands/e</loc></url>
  <url><loc>https://fitappliance.com.au/compare/a</loc></url>
  <url><loc>https://fitappliance.com.au/compare/b</loc></url>
  <url><loc>https://fitappliance.com.au/compare/c</loc></url>
  <url><loc>https://fitappliance.com.au/compare/d</loc></url>
  <url><loc>https://fitappliance.com.au/compare/e</loc></url>
  <url><loc>https://fitappliance.com.au/location/sydney/fridge</loc></url>
  <url><loc>https://fitappliance.com.au/location/perth/fridge</loc></url>
  <url><loc>https://fitappliance.com.au/location/adelaide/fridge</loc></url>
  <url><loc>https://fitappliance.com.au/location/darwin/fridge</loc></url>
</urlset>`;
  const urls = parseSitemapUrls(xml);
  const selected = chooseSentinelUrls(urls);
  assert.equal(selected.length, 30);
  assert.equal(selected[0], 'https://fitappliance.com.au/');
});

test('phase 27 sentinel: broken-link report writes output JSON file', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fit-sentinel-report-'));
  await mkdir(path.join(tempRoot, 'pages'), { recursive: true });
  await mkdir(path.join(tempRoot, 'reports'), { recursive: true });
  await writeFile(path.join(tempRoot, 'index.html'), '<a href="/">Home</a>', 'utf8');
  await writeFile(path.join(tempRoot, 'vercel.json'), JSON.stringify({ rewrites: [] }), 'utf8');

  const reportPath = path.join(tempRoot, 'reports', 'broken-links.json');
  await findBrokenLinks({ repoRoot: tempRoot, reportPath });
  const raw = await readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);
  assert.ok(Array.isArray(report.checked));
});
