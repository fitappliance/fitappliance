import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const energyModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'sources', 'energyrating.js')).href;
const syncModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'sync.js')).href;
const commissionModuleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'sources', 'commissionfactory.js')
).href;

function makeBaseProduct(overrides = {}) {
  return {
    id: 'f1',
    cat: 'fridge',
    brand: 'Samsung',
    model: 'MODEL-1',
    w: 900,
    h: 1800,
    d: 700,
    kwh_year: 420,
    stars: 4,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: ['French Door'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

async function createWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-data-coverage-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  await mkdir(dataDir, { recursive: true });

  const appliancesPath = path.join(dataDir, 'appliances.json');
  const clearancePath = path.join(dataDir, 'clearance.json');

  await writeFile(
    appliancesPath,
    `${JSON.stringify(
      {
        schema_version: 2,
        last_updated: '2026-04-14',
        products: [makeBaseProduct()]
      },
      null,
      2
    )}\n`
  );

  await writeFile(
    clearancePath,
    `${JSON.stringify(
      {
        schema_version: 1,
        last_updated: '2026-04-14',
        rules: {
          fridge: {
            __default__: { side: 40, rear: 25, top: 50 }
          }
        }
      },
      null,
      2
    )}\n`
  );

  return { dataDir, appliancesPath, clearancePath };
}

test('energy sync inserts unmatched active models and keeps them unavailable when no retailer price exists', async () => {
  const { syncEnergyRatingData } = await import(energyModuleUrl);
  const workspace = await createWorkspace();
  const responses = [
    {
      status: 200,
      async json() {
        return {
          result: {
            resources: [{ format: 'CSV', url: 'https://example.com/rf.csv' }]
          }
        };
      }
    },
    {
      status: 200,
      async text() {
        return [
          'Brand,Model No,Width,Height,Depth,Labelled energy consumption (kWh/year),New Star,Availability Status,SubmitStatus',
          'Samsung,MODEL-1,900,1800,700,420,4,Available,Approved',
          'Haier,NEW-520,875,1730,695,360,3,Available,Approved'
        ].join('\n');
      }
    }
  ];

  const result = await syncEnergyRatingData({
    dataDir: workspace.dataDir,
    today: '2026-04-16',
    fetchWithRetryFn: async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error('Unexpected fetch');
      }
      return next;
    },
    logger: { warn() {}, error() {} }
  });

  assert.equal(result.insertedCount, 1);
  assert.equal(result.discardedCount, 0);

  const updatedDocument = JSON.parse(await readFile(workspace.appliancesPath, 'utf8'));
  const newProduct = updatedDocument.products.find(product => product.model === 'NEW-520');

  assert.ok(newProduct);
  assert.equal(newProduct.price, null);
  assert.equal(newProduct.unavailable, true);
  assert.equal(newProduct.door_swing_mm, null);
});

test('syncClearanceDefaults assigns generic defaults to unknown brands', async () => {
  const { syncClearanceDefaults } = await import(syncModuleUrl);
  const workspace = await createWorkspace();

  const result = await syncClearanceDefaults({
    dataDir: workspace.dataDir,
    products: [
      makeBaseProduct({ brand: 'Samsung' }),
      makeBaseProduct({ id: 'f2', brand: 'UnknownBrand', model: 'U-1' })
    ],
    logger: { log() {} }
  });

  assert.equal(result.addedCount, 2);
  const clearanceDocument = JSON.parse(await readFile(workspace.clearancePath, 'utf8'));
  assert.deepEqual(clearanceDocument.rules.fridge.UnknownBrand, {
    side: 20,
    rear: 50,
    top: 50
  });
});

test('commission sync marks product available when any supported retailer returns a valid price', async () => {
  const { syncCommissionFactoryData } = await import(commissionModuleUrl);
  const workspace = await createWorkspace();
  const responses = [
    {
      status: 200,
      async json() {
        return {
          data: [
            {
              ProductName: 'Samsung MODEL-1',
              Price: 1299,
              DeepLink: 'https://www.binglee.com.au/product/samsung-model-1',
              MerchantName: 'Bing Lee'
            }
          ]
        };
      }
    }
  ];

  await syncCommissionFactoryData({
    dataDir: workspace.dataDir,
    apiKey: 'test-key',
    enableQueryFanout: false,
    fetchWithRetryFn: async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error('Unexpected fetch');
      }
      return next;
    },
    logger: { warn() {}, error() {} }
  });

  const updatedDocument = JSON.parse(await readFile(workspace.appliancesPath, 'utf8'));
  const product = updatedDocument.products.find(entry => entry.id === 'f1');
  const bingLeeRetailer = product.retailers.find(retailer => retailer.n === 'Bing Lee');

  assert.equal(product.price, 1299);
  assert.equal(product.unavailable, false);
  assert.ok(bingLeeRetailer);
  assert.equal(bingLeeRetailer.url, 'https://www.binglee.com.au/product/samsung-model-1');
});
