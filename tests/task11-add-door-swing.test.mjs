import test from 'node:test';
import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  addDoorSwing,
  parseSwingValue,
  upsertEntries
} = require('../scripts/add-door-swing.js');

function makeSourceDoc(products) {
  return {
    schema_version: 2,
    last_updated: '2026-04-14',
    products
  };
}

function makeProduct(overrides = {}) {
  return {
    id: 'f1',
    cat: 'fridge',
    brand: 'WESTINGHOUSE',
    model: 'WBE4500WC',
    w: 896,
    h: 1725,
    d: 741,
    kwh_year: 450,
    stars: 3,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: ['No Frost'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides
  };
}

async function createWorkspace(products) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-add-swing-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  const sourcesDir = path.join(dataDir, 'sources');
  const sourcePath = path.join(sourcesDir, 'manual-research.json');

  await mkdir(sourcesDir, { recursive: true });
  await writeFile(
    path.join(dataDir, 'appliances.json'),
    `${JSON.stringify({
      schema_version: 2,
      last_updated: '2026-04-15',
      products
    }, null, 2)}\n`,
    'utf8'
  );

  return {
    rootDir,
    dataDir,
    sourcePath
  };
}

test('task 11 add-swing: upsertEntries inserts into empty document', () => {
  const result = upsertEntries(null, [{ id: 'f1', door_swing_mm: 20 }], '2026-04-15');

  assert.equal(result.schema_version, 2);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].door_swing_mm, 20);
});

test('task 11 add-swing: upsertEntries appends new ID to existing document', () => {
  const document = makeSourceDoc([{ id: 'f1', door_swing_mm: 15 }]);
  const result = upsertEntries(document, [{ id: 'f2', door_swing_mm: 20 }], '2026-04-15');

  assert.equal(result.products.length, 2);
  assert.equal(result.products[1].id, 'f2');
});

test('task 11 add-swing: upsertEntries overwrites existing ID entry', () => {
  const document = makeSourceDoc([{ id: 'f1', door_swing_mm: 15 }]);
  const result = upsertEntries(document, [{ id: 'f1', door_swing_mm: 25 }], '2026-04-15');

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].door_swing_mm, 25);
});

test('task 11 add-swing: upsertEntries does not mutate input document', () => {
  const document = makeSourceDoc([{ id: 'f1', door_swing_mm: 15 }]);
  const original = JSON.stringify(document);

  upsertEntries(document, [{ id: 'f1', door_swing_mm: 99 }], '2026-04-15');

  assert.equal(JSON.stringify(document), original);
});

test('task 11 add-swing: upsertEntries handles batch IDs', () => {
  const result = upsertEntries(
    null,
    [
      { id: 'f1', door_swing_mm: 0 },
      { id: 'f2', door_swing_mm: 20 },
      { id: 'f3', door_swing_mm: 35 }
    ],
    '2026-04-15'
  );

  assert.equal(result.products.length, 3);
});

test('task 11 add-swing: upsertEntries updates last_updated', () => {
  const result = upsertEntries(null, [{ id: 'f1', door_swing_mm: 0 }]);
  assert.match(result.last_updated, /^\d{4}-\d{2}-\d{2}$/);
});

test('task 11 add-swing: parseSwingValue validates integer and non-negative constraints', () => {
  assert.throws(() => parseSwingValue('-5'), /negative/i);
  assert.throws(() => parseSwingValue('abc'), /integer/i);
  assert.throws(() => parseSwingValue('1.5'), /integer/i);
  assert.equal(parseSwingValue('0'), 0);
  assert.equal(parseSwingValue('20'), 20);
});

test('task 11 add-swing: addDoorSwing write=false returns entries without writing file', async () => {
  const workspace = await createWorkspace([makeProduct({ id: 'f1' })]);

  const result = await addDoorSwing({
    ids: ['f1'],
    value: 20,
    write: false,
    dataDir: workspace.dataDir,
    today: '2026-04-15',
    logger: { log() {}, warn() {} }
  });

  assert.equal(result.written, 0);
  assert.equal(result.entries[0].id, 'f1');
  assert.equal(result.entries[0].door_swing_mm, 20);
  await assert.rejects(access(workspace.sourcePath, fsConstants.F_OK));
});
