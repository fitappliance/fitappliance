import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syncModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'sync.js')).href;

async function loadSyncModule() {
  try {
    return await import(syncModuleUrl);
  } catch (error) {
    assert.fail(`scripts/sync.js is not implemented yet: ${error.message}`);
  }
}

function makeProduct(overrides = {}) {
  return {
    id: 'w1',
    cat: 'washing_machine',
    brand: 'Samsung',
    model: 'WW90T684DLH 9kg Front Loader',
    w: 600,
    h: 850,
    d: 600,
    kwh_year: 140,
    stars: 5,
    price: 1299,
    emoji: '🫧',
    door_swing_mm: 25,
    top_loader: false,
    features: ['9kg', 'Front Load'],
    retailers: [],
    sponsored: true,
    ...overrides
  };
}

async function createWorkspace({
  baseProducts,
  sourceDocuments = [],
  notesText = '# Door Swing Research Notes\n'
}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitmyappliance-sync-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  const sourcesDir = path.join(dataDir, 'sources');
  const docsDir = path.join(rootDir, 'docs');
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const notesPath = path.join(docsDir, 'door-swing-research-notes.md');

  await mkdir(sourcesDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const baseDocument = {
    schema_version: 2,
    last_updated: '2026-04-14',
    products: baseProducts
  };

  await writeFile(appliancesPath, `${JSON.stringify(baseDocument, null, 2)}\n`);
  await writeFile(notesPath, notesText);

  for (const [index, sourceDocument] of sourceDocuments.entries()) {
    const sourcePath = path.join(sourcesDir, `${String(index + 1).padStart(2, '0')}-${sourceDocument.name}.json`);
    await writeFile(sourcePath, `${JSON.stringify(sourceDocument, null, 2)}\n`);
  }

  return { rootDir, dataDir, sourcesDir, appliancesPath, notesPath };
}

test('red 1: mergeProduct keeps valid 0/false source values by using ?? semantics during conflicts', async () => {
  const { mergeProduct } = await loadSyncModule();

  const merged = mergeProduct(
    makeProduct({
      id: 'w-conflict',
      price: 1299,
      door_swing_mm: 25,
      sponsored: true
    }),
    {
      id: 'w-conflict',
      price: 0,
      door_swing_mm: 0,
      sponsored: false
    }
  );

  assert.equal(merged.price, 0);
  assert.equal(merged.door_swing_mm, 0);
  assert.equal(merged.sponsored, false);
});

test('mergeProduct copies direct_url when source provides an https link', async () => {
  const { mergeProduct } = await loadSyncModule();

  const merged = mergeProduct(
    makeProduct({
      id: 'w-direct-url',
      direct_url: null
    }),
    {
      id: 'w-direct-url',
      direct_url: 'https://www.jbhifi.com.au/search?query=WW90T684DLH'
    }
  );

  assert.equal(merged.direct_url, 'https://www.jbhifi.com.au/search?query=WW90T684DLH');
});

test('mergeProduct preserves existing direct_url when source sends null', async () => {
  const { mergeProduct } = await loadSyncModule();

  const merged = mergeProduct(
    makeProduct({
      id: 'w-direct-url-keep',
      direct_url: 'https://www.jbhifi.com.au/search?query=WW90T684DLH'
    }),
    {
      id: 'w-direct-url-keep',
      direct_url: null
    }
  );

  assert.equal(merged.direct_url, 'https://www.jbhifi.com.au/search?query=WW90T684DLH');
});

test('red 2: syncLocalData rejects invalid merged output and leaves appliances.json untouched', async () => {
  const { syncLocalData } = await loadSyncModule();
  const workspace = await createWorkspace({
    baseProducts: [makeProduct({ id: 'w-invalid-write' })],
    sourceDocuments: [
      {
        name: 'broken-width',
        products: [
          {
            id: 'w-invalid-write',
            w: -10
          }
        ]
      }
    ]
  });

  const before = await readFile(workspace.appliancesPath, 'utf8');

  await assert.rejects(
    syncLocalData({
      dataDir: workspace.dataDir,
      notesPath: workspace.notesPath,
      today: '2026-04-15'
    }),
    /invalid|validation/i
  );

  const after = await readFile(workspace.appliancesPath, 'utf8');
  assert.equal(after, before);
});

test('red 3: syncLocalData preserves null door_swing_mm and its research note linkage', async () => {
  const { syncLocalData } = await loadSyncModule();
  const workspace = await createWorkspace({
    baseProducts: [
      makeProduct({
        id: 'f-null-door',
        cat: 'fridge',
        brand: 'Samsung',
        model: 'SRF7500WFH French Door 740L',
        door_swing_mm: null,
        price: 3499
      })
    ],
    sourceDocuments: [
      {
        name: 'price-refresh',
        products: [
          {
            id: 'f-null-door',
            price: 3399
          }
        ]
      }
    ],
    notesText: [
      '# Door Swing Research Notes',
      '',
      '### `f-null-door` Samsung `SRF7500WFH French Door 740L`',
      '',
      '- Source checked: https://example.com/spec.pdf',
      '- Why not adopted: spec does not publish hinge-side clearance.'
    ].join('\n')
  });

  const notesBefore = await readFile(workspace.notesPath, 'utf8');
  const synced = await syncLocalData({
    dataDir: workspace.dataDir,
    notesPath: workspace.notesPath,
    today: '2026-04-15'
  });

  const syncedProduct = synced.products.find(product => product.id === 'f-null-door');
  assert.ok(syncedProduct);
  assert.equal(syncedProduct.price, 3399);
  assert.equal(syncedProduct.door_swing_mm, null);

  const notesAfter = await readFile(workspace.notesPath, 'utf8');
  assert.equal(notesAfter, notesBefore);
  assert.match(notesAfter, /`f-null-door`/);
});
