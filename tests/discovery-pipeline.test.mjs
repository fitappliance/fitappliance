import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

const { buildDiscoveryReport, buildExistingModelSet, diffDiscoveries } = require('../scripts/discovery-pipeline/lib/catalog.js');
const { parseSitemapXml } = require('../scripts/discovery-pipeline/lib/sitemap.js');
const appliancesOnline = require('../scripts/discovery-pipeline/adapters/appliances-online.js');
const { runScout } = require('../scripts/discovery-pipeline/1-scout.js');

const sampleSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.appliancesonline.com.au/product/hisense-hrcd640tbw-640l-french-door-fridge</loc></url>
  <url><loc>https://www.appliancesonline.com.au/product/bosch-smu6hcs01a-serie-6-under-bench-dishwasher</loc></url>
  <url><loc>https://www.appliancesonline.com.au/product/lg-wv9-1412b-12kg-front-load-washing-machine</loc></url>
  <url><loc>https://www.appliancesonline.com.au/product/fisher-paykel-dh9060fs1-9kg-heat-pump-dryer</loc></url>
  <url><loc>https://www.appliancesonline.com.au/category/fridges-and-freezers/</loc></url>
</urlset>`;

test('discovery sitemap parser extracts URL loc entries from urlset XML', () => {
  const urls = parseSitemapXml(sampleSitemap);

  assert.equal(urls.length, 5);
  assert.equal(urls[0], 'https://www.appliancesonline.com.au/product/hisense-hrcd640tbw-640l-french-door-fridge');
});

test('Appliances Online adapter extracts category, brand, and model from product URLs', () => {
  const discoveries = appliancesOnline.extractDiscoveries(parseSitemapXml(sampleSitemap));

  assert.deepEqual(
    discoveries.map(({ brand, model, category }) => ({ brand, model, category })),
    [
      { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' },
      { brand: 'Bosch', model: 'SMU6HCS01A', category: 'dishwasher' },
      { brand: 'LG', model: 'WV9-1412B', category: 'washing_machine' },
      { brand: 'Fisher & Paykel', model: 'DH9060FS1', category: 'dryer' },
    ],
  );
});

test('discovery diff excludes models already present in catalog-final', () => {
  const existing = buildExistingModelSet({
    products: [
      { id: 'fridge-hisense-hrcd640tbw', model: 'HRCD640TBW', product_id: 'hisense-hrcd640tbw' },
    ],
  });

  const delta = diffDiscoveries(appliancesOnline.extractDiscoveries(parseSitemapXml(sampleSitemap)), existing);

  assert.equal(delta.length, 3);
  assert.equal(delta.some((item) => item.model === 'HRCD640TBW'), false);
  assert.equal(delta.some((item) => item.model === 'SMU6HCS01A'), true);
});

test('discovery report groups new discoveries by category and brand', () => {
  const discoveries = [
    { retailer: 'Appliances Online', category: 'fridge', brand: 'LG', model: 'GF-L706PL', url: 'https://example.test/lg' },
    { retailer: 'Appliances Online', category: 'fridge', brand: 'LG', model: 'GF-B505BB', url: 'https://example.test/lg2' },
    { retailer: 'Appliances Online', category: 'dryer', brand: 'Fisher & Paykel', model: 'DH9060FS1', url: 'https://example.test/fp' },
  ];

  const report = buildDiscoveryReport({
    discoveries,
    retailer: 'appliancesonline',
    generatedAt: '2026-05-09T00:00:00.000Z',
    sourceUrls: ['https://www.appliancesonline.com.au/sitemap.xml'],
  });

  assert.equal(report.schema_version, 1);
  assert.equal(report.summary.new_discovery_count, 3);
  assert.equal(report.new_discoveries.fridge.LG.length, 2);
  assert.equal(report.new_discoveries.dryer['Fisher & Paykel'][0].model, 'DH9060FS1');
});

test('scout runner writes discovery-report.json using a retailer adapter and catalog diff', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-discovery-'));
  try {
    const catalogPath = path.join(tmp, 'catalog-final.json');
    const outputPath = path.join(tmp, 'discovery-report.json');
    fs.writeFileSync(catalogPath, JSON.stringify({
      products: [{ id: 'fridge-hisense-hrcd640tbw', model: 'HRCD640TBW' }],
    }));

    const result = await runScout({
      catalogPath,
      delayMs: 0,
      fetchImpl: async () => ({
        ok: true,
        text: async () => sampleSitemap,
      }),
      generatedAt: '2026-05-09T00:00:00.000Z',
      outputPath,
      retailer: 'appliancesonline',
      sitemapUrls: ['https://example.test/sitemap.xml'],
    });

    const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.scanned_url_count, 5);
    assert.equal(written.summary.new_discovery_count, 3);
    assert.ok(written.new_discoveries.dishwasher.Bosch);
    assert.ok(written.new_discoveries.washing_machine.LG);
  } finally {
    fs.rmSync(tmp, { force: true, recursive: true });
  }
});
