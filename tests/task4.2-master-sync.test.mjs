import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const syncModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'sync.js')).href;
const commissionFactoryUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'sources', 'commissionfactory.js')
).href;

async function loadModule(url, label) {
  try {
    return await import(url);
  } catch (error) {
    assert.fail(`${label} is not implemented yet: ${error.message}`);
  }
}

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'Samsung',
    model: 'MODEL-1',
    w: 800,
    h: 1600,
    d: 700,
    kwh_year: 500,
    stars: 2,
    price: 3000,
    emoji: 'fridge',
    door_swing_mm: 650,
    features: ['French Door'],
    retailers: [{ n: 'Demo', url: 'https://example.com', p: 3000 }],
    sponsored: false,
    ...overrides
  };
}

async function createWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitmyappliance-master-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  const docsDir = path.join(rootDir, 'docs');
  const sourcesDir = path.join(dataDir, 'sources');
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const notesPath = path.join(docsDir, 'door-swing-research-notes.md');

  await mkdir(dataDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });
  await mkdir(sourcesDir, { recursive: true });

  await writeFile(
    appliancesPath,
    `${JSON.stringify(
      {
        schema_version: 2,
        last_updated: '2026-04-14',
        products: [makeProduct()]
      },
      null,
      2
    )}\n`
  );

  await writeFile(notesPath, '# Door Swing Research Notes\n');
  return { dataDir, appliancesPath, notesPath };
}

async function readProducts(appliancesPath) {
  const doc = JSON.parse(await readFile(appliancesPath, 'utf8'));
  return doc.products;
}

test('red: master sync blocks non-https affiliate_url and keeps energy dimensions merged', async () => {
  const { runMasterSync } = await loadModule(syncModuleUrl, 'scripts/sync.js');
  const { syncCommissionFactoryData } = await loadModule(
    commissionFactoryUrl,
    'scripts/sources/commissionfactory.js'
  );
  const workspace = await createWorkspace();
  const warnings = [];

  const energyResponses = [
    {
      status: 200,
      async json() {
        return { result: { resources: [{ format: 'CSV', url: 'https://example.com/energy.csv' }] } };
      }
    },
    {
      status: 200,
      async text() {
        return [
          'Brand,Model Name,Width,Height,Depth,Annual Energy Consumption,Star Rating',
          'Samsung,MODEL-1,910,1770,740,410,4'
        ].join('\n');
      }
    }
  ];

  const commissionResponses = [
    {
      status: 200,
      async json() {
        return {
          data: [
            {
              ProductName: 'Samsung MODEL-1',
              Price: 2899,
              DeepLink: 'http://bad-link.example.com/path',
              MerchantName: 'Demo Merchant'
            }
          ]
        };
      }
    }
  ];

  await runMasterSync({
    dataDir: workspace.dataDir,
    notesPath: workspace.notesPath,
    today: '2026-04-17',
    logger: {
      warn(message) {
        warnings.push(message);
      },
      error(message) {
        warnings.push(message);
      }
    },
    energyRatingOptions: {
      metadataUrl: 'https://example.com/metadata',
      fetchWithRetryFn: async () => {
        const next = energyResponses.shift();
        if (!next) {
          throw new Error('Unexpected EnergyRating fetch');
        }
        return next;
      }
    },
    commissionFactoryOptions: {
      apiUrl: 'https://example.com/cf',
      apiKey: 'demo-key',
      fetchWithRetryFn: async () => {
        const next = commissionResponses.shift();
        if (!next) {
          throw new Error('Unexpected CommissionFactory fetch');
        }
        return next;
      },
      syncCommissionFactoryDataFn: syncCommissionFactoryData
    },
    exitFn(code) {
      throw new Error(`EXIT_${code}`);
    }
  });

  const products = await readProducts(workspace.appliancesPath);
  const product = products[0];

  assert.equal(product.w, 910);
  assert.equal(product.h, 1770);
  assert.equal(product.d, 740);
  assert.equal(product.kwh_year, 410);
  assert.equal(product.stars, 4);

  assert.equal(product.price, 2899);
  assert.ok(!Object.hasOwn(product, 'affiliate_url'));
  assert.ok(warnings.some(message => /affiliate_url/i.test(message)));
  assert.ok(warnings.some(message => /https/i.test(message)));
});

test('master sync supports no-CF mode and skips CommissionFactory when API key is unavailable', async () => {
  const { runMasterSync } = await loadModule(syncModuleUrl, 'scripts/sync.js');
  const workspace = await createWorkspace();
  const logs = [];

  const energyResponses = [
    {
      status: 200,
      async json() {
        return { result: { resources: [{ format: 'CSV', url: 'https://example.com/energy.csv' }] } };
      }
    },
    {
      status: 200,
      async text() {
        return [
          'Brand,Model Name,Width,Height,Depth,Annual Energy Consumption,Star Rating',
          'Samsung,MODEL-1,900,1760,730,405,4'
        ].join('\n');
      }
    }
  ];

  await runMasterSync({
    dataDir: workspace.dataDir,
    notesPath: workspace.notesPath,
    today: '2026-04-17',
    enableCommissionSync: false,
    logger: {
      log(message) {
        logs.push(message);
      },
      warn(message) {
        logs.push(message);
      },
      error(message) {
        logs.push(message);
      }
    },
    energyRatingOptions: {
      metadataUrl: 'https://example.com/metadata',
      fetchWithRetryFn: async () => {
        const next = energyResponses.shift();
        if (!next) {
          throw new Error('Unexpected EnergyRating fetch');
        }
        return next;
      }
    },
    syncCommissionFactoryDataFn: async () => {
      throw new Error('CommissionFactory should not be called in no-CF mode');
    },
    exitFn(code) {
      throw new Error(`EXIT_${code}`);
    }
  });

  const products = await readProducts(workspace.appliancesPath);
  const product = products[0];

  assert.equal(product.w, 900);
  assert.equal(product.h, 1760);
  assert.equal(product.d, 730);
  assert.equal(product.kwh_year, 405);
  assert.equal(product.stars, 4);
  assert.ok(logs.some(message => /commissionfactory sync disabled/i.test(message)));
});
