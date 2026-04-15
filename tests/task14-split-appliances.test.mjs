import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { splitAppliances, CAT_FILE_MAP } = require('../scripts/split-appliances.js');

function makeSourceDocument(products) {
  return {
    schema_version: 2,
    last_updated: '2026-04-15',
    products
  };
}

function makeProduct(overrides = {}) {
  return {
    id: 'p-1',
    cat: 'fridge',
    brand: 'LG',
    model: 'Model One',
    w: 600,
    h: 1800,
    d: 700,
    kwh_year: 300,
    stars: 4,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: [],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

async function createDataDir(document) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-split-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'appliances.json'), JSON.stringify(document, null, 2));
  return dataDir;
}

test('task 14 split: creates one file per known category', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' }),
    makeProduct({ id: 'f-2', cat: 'fridge' }),
    makeProduct({ id: 'w-1', cat: 'washing_machine' }),
    makeProduct({ id: 'd-1', cat: 'dishwasher' }),
    makeProduct({ id: 'dr-1', cat: 'dryer' })
  ]));

  const result = await splitAppliances({
    dataDir,
    write: false,
    logger: { log() {} }
  });

  assert.ok(result.filesWritten.includes('fridges.json'));
  assert.ok(result.filesWritten.includes('washing-machines.json'));
  assert.ok(result.filesWritten.includes('dishwashers.json'));
  assert.ok(result.filesWritten.includes('dryers.json'));
});

test('task 14 split: each split file only contains products of that category', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' }),
    makeProduct({ id: 'f-2', cat: 'fridge' }),
    makeProduct({ id: 'w-1', cat: 'washing_machine' })
  ]));

  await splitAppliances({
    dataDir,
    write: true,
    logger: { log() {} }
  });

  const fridges = JSON.parse(await readFile(path.join(dataDir, CAT_FILE_MAP.fridge), 'utf8'));
  const washers = JSON.parse(await readFile(path.join(dataDir, CAT_FILE_MAP.washing_machine), 'utf8'));

  assert.equal(fridges.products.every((product) => product.cat === 'fridge'), true);
  assert.equal(washers.products.every((product) => product.cat === 'washing_machine'), true);
});

test('task 14 split: appliances-meta counts match category splits', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' }),
    makeProduct({ id: 'f-2', cat: 'fridge' }),
    makeProduct({ id: 'w-1', cat: 'washing_machine' }),
    makeProduct({ id: 'w-2', cat: 'washing_machine' }),
    makeProduct({ id: 'dr-1', cat: 'dryer' })
  ]));

  await splitAppliances({
    dataDir,
    write: true,
    logger: { log() {} }
  });

  const meta = JSON.parse(await readFile(path.join(dataDir, 'appliances-meta.json'), 'utf8'));
  assert.equal(meta.counts.fridge, 2);
  assert.equal(meta.counts.washing_machine, 2);
  assert.equal(meta.counts.dishwasher, 0);
  assert.equal(meta.counts.dryer, 1);
});

test('task 14 split: split files preserve last_updated from source document', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' })
  ]));

  await splitAppliances({
    dataDir,
    write: true,
    logger: { log() {} }
  });

  const fridgeDoc = JSON.parse(await readFile(path.join(dataDir, CAT_FILE_MAP.fridge), 'utf8'));
  assert.equal(fridgeDoc.last_updated, '2026-04-15');
});

test('task 14 split: output files are minified json', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' })
  ]));

  await splitAppliances({
    dataDir,
    write: true,
    logger: { log() {} }
  });

  const raw = await readFile(path.join(dataDir, CAT_FILE_MAP.fridge), 'utf8');
  JSON.parse(raw);
  assert.ok(!raw.includes('\n  '), 'split file should not be pretty-printed');
});

test('task 14 split: unknown categories are skipped and reported', async () => {
  const dataDir = await createDataDir(makeSourceDocument([
    makeProduct({ id: 'f-1', cat: 'fridge' }),
    makeProduct({ id: 'x-1', cat: 'unknown' })
  ]));

  const result = await splitAppliances({
    dataDir,
    write: true,
    logger: { log() {} }
  });

  assert.equal(result.skipped, 1);
  const meta = JSON.parse(await readFile(path.join(dataDir, 'appliances-meta.json'), 'utf8'));
  assert.equal(meta.counts.fridge, 1);
  assert.equal(meta.counts.washing_machine, 0);
  assert.equal(meta.counts.dishwasher, 0);
  assert.equal(meta.counts.dryer, 0);
});
