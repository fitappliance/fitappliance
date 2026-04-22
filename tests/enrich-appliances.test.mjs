import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { enrichAppliances } = require('../scripts/enrich-appliances.js');

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
