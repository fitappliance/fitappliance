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
const theGoodGuys = require('../scripts/discovery-pipeline/adapters/the-good-guys.js');
const harveyNorman = require('../scripts/discovery-pipeline/adapters/harvey-norman.js');
const jbHiFi = require('../scripts/discovery-pipeline/adapters/jb-hi-fi.js');
const bingLee = require('../scripts/discovery-pipeline/adapters/bing-lee.js');
const { getAdapter } = require('../scripts/discovery-pipeline/adapters/index.js');
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

test('Appliances Online adapter avoids capacity and dimension tokens when extracting model numbers', () => {
  const discoveries = appliancesOnline.extractDiscoveries([
    'https://www.appliancesonline.com.au/product/beko-290l-upright-freezer-bvf290w/',
    'https://www.appliancesonline.com.au/product/bosch-serie-6-45cm-under-bench-dishwasher-spu6ims01a/',
  ]);

  assert.deepEqual(
    discoveries.map(({ brand, model, category }) => ({ brand, model, category })),
    [
      { brand: 'Beko', model: 'BVF290W', category: 'fridge' },
      { brand: 'Bosch', model: 'SPU6IMS01A', category: 'dishwasher' },
    ],
  );
});

test('The Good Guys adapter extracts core appliance discoveries from product URLs', () => {
  const discoveries = theGoodGuys.extractDiscoveries([
    'https://www.thegoodguys.com.au/haier-508l-quad-door-refrigerator-hrf580yhc',
    'https://www.thegoodguys.com.au/westinghouse-8kg-heat-pump-dryer-wdh804n7wa',
    'https://www.thegoodguys.com.au/lg-10kg-6kg-combo-washer-dryer-wvc5-1410w',
    'https://www.thegoodguys.com.au/bosch-series-6-under-bench-dishwasher-smu6hcs01a',
  ]);

  assert.deepEqual(
    discoveries.map(({ retailer_key, brand, model, category }) => ({ retailer_key, brand, model, category })),
    [
      { retailer_key: 'the-good-guys', brand: 'Haier', model: 'HRF580YHC', category: 'fridge' },
      { retailer_key: 'the-good-guys', brand: 'Westinghouse', model: 'WDH804N7WA', category: 'dryer' },
      { retailer_key: 'the-good-guys', brand: 'LG', model: 'WVC5-1410W', category: 'washing_machine' },
      { retailer_key: 'the-good-guys', brand: 'Bosch', model: 'SMU6HCS01A', category: 'dishwasher' },
    ],
  );
});

test('Harvey Norman adapter extracts product discoveries from .html slugs', () => {
  const discoveries = harveyNorman.extractDiscoveries([
    'https://www.harveynorman.com.au/lg-gf-l708mbl-french-door-708l.html',
    'https://www.harveynorman.com.au/hisense-hrcd640tbw-640l-french-door-fridge.html',
    'https://www.harveynorman.com.au/electrolux-9kg-heat-pump-dryer-edh903r9wc.html',
    'https://www.harveynorman.com.au/westinghouse-60cm-freestanding-dishwasher-wsf6606xb.html',
  ]);

  assert.deepEqual(
    discoveries.map(({ retailer_key, brand, model, category }) => ({ retailer_key, brand, model, category })),
    [
      { retailer_key: 'harvey-norman', brand: 'LG', model: 'GF-L708MBL', category: 'fridge' },
      { retailer_key: 'harvey-norman', brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' },
      { retailer_key: 'harvey-norman', brand: 'Electrolux', model: 'EDH903R9WC', category: 'dryer' },
      { retailer_key: 'harvey-norman', brand: 'Westinghouse', model: 'WSF6606XB', category: 'dishwasher' },
    ],
  );
});

test('JB Hi-Fi adapter extracts appliance discoveries from product URLs', () => {
  const discoveries = jbHiFi.extractDiscoveries([
    'https://www.jbhifi.com.au/products/chiq-ctm201nb3-202l-top-mount-fridge-black',
    'https://www.jbhifi.com.au/products/hisense-hrcd640tbw-640l-french-door-fridge-dark-stainless-steel',
    'https://www.jbhifi.com.au/products/lg-wv9-1412w-12kg-front-load-washing-machine',
    'https://www.jbhifi.com.au/products/bosch-smu6hcs01a-serie-6-under-bench-dishwasher',
  ]);

  assert.deepEqual(
    discoveries.map(({ retailer_key, brand, model, category }) => ({ retailer_key, brand, model, category })),
    [
      { retailer_key: 'jb-hi-fi', brand: 'CHiQ', model: 'CTM201NB3', category: 'fridge' },
      { retailer_key: 'jb-hi-fi', brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' },
      { retailer_key: 'jb-hi-fi', brand: 'LG', model: 'WV9-1412W', category: 'washing_machine' },
      { retailer_key: 'jb-hi-fi', brand: 'Bosch', model: 'SMU6HCS01A', category: 'dishwasher' },
    ],
  );
});

test('Bing Lee adapter extracts appliance discoveries from sitemap product URLs', () => {
  const discoveries = bingLee.extractDiscoveries([
    'https://www.binglee.com.au/products/silver-624l-sbs-fridge-wse6200sb',
    'https://www.binglee.com.au/products/15pl-60cm-8p-fstand-dish-ss-wsf6606xc',
    'https://www.binglee.com.au/products/6kg-300-series-vented-dryer-edv605h3wc',
    'https://www.binglee.com.au/products/white-10kg-900-series-fronload-ewf1043r7wc',
  ]);

  assert.deepEqual(
    discoveries.map(({ retailer_key, brand, model, category }) => ({ retailer_key, brand, model, category })),
    [
      { retailer_key: 'bing-lee', brand: 'Westinghouse', model: 'WSE6200SB', category: 'fridge' },
      { retailer_key: 'bing-lee', brand: 'Westinghouse', model: 'WSF6606XC', category: 'dishwasher' },
      { retailer_key: 'bing-lee', brand: 'Electrolux', model: 'EDV605H3WC', category: 'dryer' },
      { retailer_key: 'bing-lee', brand: 'Electrolux', model: 'EWF1043R7WC', category: 'washing_machine' },
    ],
  );
});

test('discovery adapter registry resolves all supported retailer aliases', () => {
  assert.equal(getAdapter('the-good-guys').displayName, 'The Good Guys');
  assert.equal(getAdapter('tgg').retailer, 'the-good-guys');
  assert.equal(getAdapter('harvey-norman').displayName, 'Harvey Norman');
  assert.equal(getAdapter('hn').retailer, 'harvey-norman');
  assert.equal(getAdapter('jb-hi-fi').displayName, 'JB Hi-Fi');
  assert.equal(getAdapter('jbhifi').retailer, 'jb-hi-fi');
  assert.equal(getAdapter('bing-lee').displayName, 'Bing Lee');
  assert.equal(getAdapter('bl').retailer, 'bing-lee');
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
    { retailer: 'JB Hi-Fi', retailer_key: 'jb-hi-fi', category: 'fridge', brand: 'LG', model: 'GF-L706PL', url: 'https://example.test/lg' },
    { retailer: 'JB Hi-Fi', retailer_key: 'jb-hi-fi', category: 'fridge', brand: 'LG', model: 'GF-B505BB', url: 'https://example.test/lg2' },
    { retailer: 'JB Hi-Fi', retailer_key: 'jb-hi-fi', category: 'dryer', brand: 'Fisher & Paykel', model: 'DH9060FS1', url: 'https://example.test/fp' },
  ];

  const report = buildDiscoveryReport({
    discoveries,
    retailer: 'jb-hi-fi',
    generatedAt: '2026-05-09T00:00:00.000Z',
    sourceUrls: ['https://www.jbhifi.com.au/sitemap.xml'],
  });

  assert.equal(report.schema_version, 1);
  assert.equal(report.summary.new_discovery_count, 3);
  assert.equal(report.new_discoveries.fridge.LG.length, 2);
  assert.equal(report.new_discoveries.fridge.LG[0].retailer_key, 'jb-hi-fi');
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
