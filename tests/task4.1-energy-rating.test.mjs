import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const energyRatingUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'sources', 'energyrating.js')).href;

async function loadEnergyModule() {
  try {
    return await import(energyRatingUrl);
  } catch (error) {
    assert.fail(`scripts/sources/energyrating.js is not implemented yet: ${error.message}`);
  }
}

function makeBaseProduct(overrides = {}) {
  return {
    id: 'f1',
    cat: 'fridge',
    brand: 'Samsung',
    model: 'SRF7500WFH',
    w: 912,
    h: 1780,
    d: 748,
    kwh_year: 420,
    stars: 3,
    price: 3499,
    emoji: 'fridge',
    door_swing_mm: null,
    features: ['French Door'],
    retailers: [{ n: 'Demo', url: 'https://example.com', p: 3499 }],
    sponsored: false,
    ...overrides
  };
}

async function createWorkspace(products) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-energy-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  await mkdir(dataDir, { recursive: true });

  const appliancesPath = path.join(dataDir, 'appliances.json');
  await writeFile(
    appliancesPath,
    `${JSON.stringify(
      {
        schema_version: 2,
        last_updated: '2026-04-14',
        products
      },
      null,
      2
    )}\n`
  );

  return { dataDir, appliancesPath };
}

async function readAppliances(appliancesPath) {
  return JSON.parse(await readFile(appliancesPath, 'utf8'));
}

test('red: dirty door_swing_mm=63.5 row is discarded with warning instead of triggering full sync abort', async () => {
  const { syncEnergyRatingData } = await loadEnergyModule();
  const workspace = await createWorkspace([
    makeBaseProduct({
      id: 'f1',
      brand: 'Samsung',
      model: 'SRF7500WFH'
    })
  ]);

  const csvText = [
    'Brand,Model Name,Width,Height,Depth,Annual Energy Consumption,Star Rating,door_swing_mm',
    'Samsung,SRF7500WFH,912,1780,748,420,4,63.5'
  ].join('\n');

  const responses = [
    {
      status: 200,
      async json() {
        return {
          result: {
            resources: [{ format: 'CSV', url: 'https://example.com/energy.csv' }]
          }
        };
      }
    },
    {
      status: 200,
      async text() {
        return csvText;
      }
    }
  ];

  const fetchCalls = [];
  const warnings = [];
  const result = await syncEnergyRatingData({
    dataDir: workspace.dataDir,
    metadataUrl: 'https://example.com/metadata',
    today: '2026-04-16',
    fetchWithRetryFn: async url => {
      fetchCalls.push(url);
      const next = responses.shift();
      if (!next) {
        throw new Error(`Unexpected fetch for ${url}`);
      }
      return next;
    },
    logger: {
      warn(message) {
        warnings.push(message);
      },
      error() {}
    }
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.discardedCount, 1);

  const doc = await readAppliances(workspace.appliancesPath);
  assert.equal(doc.products[0].stars, 3);
  assert.ok(warnings.some(message => /63\.5/.test(message)));
  assert.ok(warnings.some(message => /discard/i.test(message)));
});

test('green: five valid Energy Rating rows are merged into appliances.json', async () => {
  const { syncEnergyRatingData } = await loadEnergyModule();
  const workspace = await createWorkspace([
    makeBaseProduct({ id: 'a1', brand: 'Samsung', model: 'MODEL-1', stars: 2, kwh_year: 200 }),
    makeBaseProduct({ id: 'a2', brand: 'LG', model: 'MODEL-2', stars: 2, kwh_year: 200 }),
    makeBaseProduct({ id: 'a3', brand: 'Bosch', model: 'MODEL-3', stars: 2, kwh_year: 200 }),
    makeBaseProduct({ id: 'a4', brand: 'Haier', model: 'MODEL-4', stars: 2, kwh_year: 200 }),
    makeBaseProduct({ id: 'a5', brand: 'Electrolux', model: 'MODEL-5', stars: 2, kwh_year: 200 })
  ]);

  const csvText = [
    'Brand,Model Name,Width,Height,Depth,Annual Energy Consumption,Star Rating',
    'Samsung,MODEL-1,910,1770,740,410,4',
    'LG,MODEL-2,905,1780,735,395,5',
    'Bosch,MODEL-3,600,1860,664,220,5',
    'Haier,MODEL-4,875,1730,695,360,3',
    'Electrolux,MODEL-5,680,1700,685,310,4'
  ].join('\n');

  const responses = [
    {
      status: 200,
      async json() {
        return {
          result: {
            resources: [{ format: 'CSV', url: 'https://example.com/energy-valid.csv' }]
          }
        };
      }
    },
    {
      status: 200,
      async text() {
        return csvText;
      }
    }
  ];

  const result = await syncEnergyRatingData({
    dataDir: workspace.dataDir,
    metadataUrl: 'https://example.com/metadata',
    today: '2026-04-16',
    fetchWithRetryFn: async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error('Unexpected fetch');
      }
      return next;
    },
    logger: {
      warn() {},
      error() {}
    }
  });

  assert.equal(result.updatedCount, 5);
  assert.equal(result.discardedCount, 0);

  const doc = await readAppliances(workspace.appliancesPath);
  assert.equal(doc.last_updated, '2026-04-16');
  assert.equal(doc.products.length, 5);
  assert.equal(doc.products.find(product => product.id === 'a1').stars, 4);
  assert.equal(doc.products.find(product => product.id === 'a2').kwh_year, 395);
  assert.equal(doc.products.find(product => product.id === 'a3').w, 600);
  assert.equal(doc.products.find(product => product.id === 'a4').d, 695);
  assert.equal(doc.products.find(product => product.id === 'a5').h, 1700);
});
