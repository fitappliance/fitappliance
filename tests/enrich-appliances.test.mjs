import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { enrichApplianceDocument, enrichAppliances } = require('../scripts/enrich-appliances.js');

function makeDoc(products) {
  return {
    schema_version: 2,
    last_updated: '2026-04-22',
    products
  };
}

function makeProduct(overrides = {}) {
  return {
    id: 'dishwasher-1',
    cat: 'dishwasher',
    brand: 'Samsung',
    model: 'DW60BG730FSL',
    w: 598,
    h: 815,
    d: 570,
    kwh_year: 210,
    stars: 4,
    price: null,
    emoji: '🍽️',
    door_swing_mm: 0,
    features: ['Built-in'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

async function writeFixtureRepo(rootDir, products, popularityProducts = {}) {
  const publicDataDir = path.join(rootDir, 'public', 'data');
  const dataDir = path.join(rootDir, 'data');
  fs.mkdirSync(publicDataDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(publicDataDir, 'appliances.json'), JSON.stringify(makeDoc(products)));
  fs.writeFileSync(path.join(dataDir, 'series-dictionary.json'), JSON.stringify({ samsung: { DW: 'Series 7' } }));
  fs.writeFileSync(path.join(dataDir, 'clearance-defaults.json'), JSON.stringify({ dishwasher: { rear: 5, sides: 0, top: 5 } }));
  fs.writeFileSync(path.join(dataDir, 'popularity-research.json'), JSON.stringify({
    schema_version: 1,
    last_researched: '2026-04-22',
    cursor: Object.keys(popularityProducts).length,
    researched: Object.keys(popularityProducts).length,
    totalCatalog: products.length,
    skipped: [],
    products: popularityProducts
  }));
}

test('phase 43a backfill: enrich writes researched retailers back and flips unavailable to false', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-backfill-'));
  const product = makeProduct();
  await writeFixtureRepo(tmpDir, [product], {
    'dishwasher-1': {
      retailersAvailable: 1,
      retailersChecked: 1,
      reviewCountSum: 23,
      priceMinAud: 1299,
      priceMaxAud: 1299,
      researchedAt: '2026-04-22',
      retailers: [
        { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/dw60bg730fsl', p: 1299 }
      ]
    }
  });

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} }
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  assert.equal(appliances.products[0].retailers.length, 1);
  assert.equal(appliances.products[0].unavailable, false);
  assert.ok(appliances.products[0].priorityScore > 0);
});

test('phase 50 hotfix: enrich filters researched retailer URLs to verified product pages only', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-url-quality-'));
  const product = makeProduct();
  await writeFixtureRepo(tmpDir, [product], {
    'dishwasher-1': {
      retailersAvailable: 2,
      retailersChecked: 2,
      reviewCountSum: 23,
      priceMinAud: 999,
      priceMaxAud: 1299,
      researchedAt: '2026-05-01',
      retailers: [
        { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au', p: 999 },
        { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/dw60bg730fsl', p: 1299 },
      ],
    },
  });

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} },
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  assert.deepEqual(appliances.products[0].retailers.map((retailer) => retailer.n), ['Appliances Online']);
  assert.equal(appliances.products[0].unavailable, false);
});

test('phase 50 hotfix: enrich does not make a product available when research only has root URLs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-root-only-'));
  const product = makeProduct();
  await writeFixtureRepo(tmpDir, [product], {
    'dishwasher-1': {
      retailersAvailable: 1,
      retailersChecked: 1,
      reviewCountSum: 23,
      priceMinAud: 999,
      priceMaxAud: 999,
      researchedAt: '2026-05-01',
      retailers: [
        { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au', p: 999 },
      ],
    },
  });

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} },
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  assert.equal(appliances.products[0].retailers.length, 0);
  assert.equal(appliances.products[0].unavailable, true);
});

test('phase 50 hotfix: enrich canonicalizes runtime brands before writing split catalogs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-canon-brand-'));
  const product = makeProduct({ brand: 'HISENSE', cat: 'fridge', id: 'fridge-hisense-1' });
  await writeFixtureRepo(tmpDir, [product], {});

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} },
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  const fridges = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'fridges.json'), 'utf8'));
  assert.equal(appliances.products[0].brand, 'Hisense');
  assert.equal(fridges.products[0].brand, 'Hisense');
});

test('phase 43a backfill: enrich leaves original unavailable flag untouched when research is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-missing-'));
  await writeFixtureRepo(tmpDir, [makeProduct()], {});

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} }
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  assert.equal(appliances.products[0].retailers.length, 0);
  assert.equal(appliances.products[0].unavailable, true);
});

test('phase 43a backfill: enrich normalizes legacy decimal retailer prices before split output', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-price-'));
  await writeFixtureRepo(tmpDir, [makeProduct({
    price: 1406.44,
    retailers: [{
      n: 'Appliances Online',
      url: 'https://www.appliancesonline.com.au/product/dw60bg730fsl',
      p: 1406.44,
    }],
    unavailable: false,
  })], {});

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} },
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  const dishwashers = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'dishwashers.json'), 'utf8'));
  assert.equal(appliances.products[0].price, 1406);
  assert.equal(appliances.products[0].retailers[0].p, 1406);
  assert.equal(dishwashers.products[0].price, 1406);
});

test('phase 43a backfill: empty researched retailers do not clear unavailable', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-enrich-empty-'));
  await writeFixtureRepo(tmpDir, [makeProduct()], {
    'dishwasher-1': {
      retailersAvailable: 0,
      retailersChecked: 1,
      reviewCountSum: 0,
      priceMinAud: null,
      priceMaxAud: null,
      researchedAt: '2026-04-22',
      retailers: []
    }
  });

  await enrichAppliances({
    repoRoot: tmpDir,
    logger: { log() {}, warn() {}, error() {} }
  });

  const appliances = JSON.parse(fs.readFileSync(path.join(tmpDir, 'public', 'data', 'appliances.json'), 'utf8'));
  assert.equal(appliances.products[0].retailers.length, 0);
  assert.equal(appliances.products[0].unavailable, true);
});

test('runtime catalog enrichment preserves retailer evidence while applying fresh observations', () => {
  const product = makeProduct({
    retailers: [{
      n: 'The Good Guys',
      url: 'https://www.thegoodguys.com.au/samsung-dishwasher-dw60bg730fsl',
      p: 1499,
      source: 'partnerize-feed',
      affiliate_url: 'https://prf.hn/click/example',
      retailer_dimension_hint: { w_mm: 598, h_mm: 815, d_mm: 570 },
    }],
    unavailable: false,
  });
  const document = enrichApplianceDocument(makeDoc([product]), {
    seriesDictionary: {},
    popularityResearch: {
      last_researched: '2026-07-12',
      products: {
        'dishwasher-1': {
          researchedAt: '2026-07-12',
          retailersAvailable: 1,
          retailers: [{
            n: 'The Good Guys',
            url: 'https://www.thegoodguys.com.au/samsung-dishwasher-dw60bg730fsl',
            p: 1299,
          }],
        },
      },
    },
  });

  const enriched = document.products[0];
  assert.equal(enriched.price, 1299);
  assert.equal(enriched.unavailable, false);
  assert.equal(enriched.retailers[0].p, 1299);
  assert.equal(enriched.retailers[0].verified_at, '2026-07-12');
  assert.equal(enriched.retailers[0].source, 'partnerize-feed');
  assert.equal(enriched.retailers[0].affiliate_url, 'https://prf.hn/click/example');
  assert.deepEqual(enriched.retailers[0].retailer_dimension_hint, { w_mm: 598, h_mm: 815, d_mm: 570 });
});

test('runtime catalog enrichment derives top-level price from canonical retailer data without research', () => {
  const product = makeProduct({
    displayName: 'Samsung DW60BG730FSL Series 7 Dishwasher',
    price: null,
    retailers: [{
      n: 'Appliances Online',
      url: 'https://www.appliancesonline.com.au/product/dw60bg730fsl',
      p: 1406,
      verified_at: '2026-07-07',
      source: 'affiliate-feed',
    }],
    unavailable: false,
  });

  const document = enrichApplianceDocument(makeDoc([product]), {
    seriesDictionary: {},
    popularityResearch: { last_researched: '2026-07-12', products: {} },
  });

  assert.equal(document.products[0].price, 1406);
  assert.equal(document.products[0].retailers[0].source, 'affiliate-feed');
  assert.equal(document.products[0].displayName, 'Samsung DW60BG730FSL Series 7 Dishwasher');
});

test('runtime catalog enrichment keeps unobserved retailers but clears an explicitly unobserved price', () => {
  const product = makeProduct({
    retailers: [
      {
        n: 'The Good Guys',
        url: 'https://www.thegoodguys.com.au/samsung-dishwasher-dw60bg730fsl',
        p: 1299,
        affiliate_url: 'https://prf.hn/click/example',
      },
      {
        n: 'Appliances Online',
        url: 'https://www.appliancesonline.com.au/product/dw60bg730fsl',
        p: 1399,
      },
    ],
    unavailable: false,
  });
  const document = enrichApplianceDocument(makeDoc([product]), {
    seriesDictionary: {},
    popularityResearch: {
      last_researched: '2026-07-12',
      products: {
        'dishwasher-1': {
          researchedAt: '2026-07-12',
          retailers: [{
            n: 'The Good Guys',
            url: 'https://www.thegoodguys.com.au/samsung-dishwasher-dw60bg730fsl',
            p: null,
          }],
        },
      },
    },
  });

  assert.equal(document.products[0].retailers.length, 2);
  assert.equal(document.products[0].retailers[0].p, null);
  assert.equal(document.products[0].retailers[0].affiliate_url, 'https://prf.hn/click/example');
  assert.equal(document.products[0].price, 1399);
});
