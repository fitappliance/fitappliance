import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(repoRoot, 'public', 'scripts', 'saved-search-store.js');

async function loadStore() {
  const module = await import(`${pathToFileURL(storePath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function createMemoryStorage(initial = {}) {
  const rows = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(rows, key) ? rows[key] : null;
    },
    setItem(key, value) {
      rows[key] = String(value);
    },
    removeItem(key) {
      delete rows[key];
    },
    dump() {
      return { ...rows };
    }
  };
}

function makeState(overrides = {}) {
  return {
    cat: 'fridge',
    w: 600,
    h: 1800,
    d: 650,
    tol: 5,
    facets: {
      brand: ['Bosch'],
      priceMin: null,
      priceMax: 2000,
      stars: 4,
      availableOnly: true
    },
    sortBy: 'price-asc',
    ...overrides
  };
}

test('phase 45c saved-search store: save then list returns the saved search', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({
    storage: createMemoryStorage(),
    nowFn: () => new Date('2026-04-26T01:00:00.000Z'),
    idFactory: () => 'saved-001'
  });

  const result = store.save({ name: 'Kitchen fridge', state: makeState() });

  assert.equal(result.ok, true);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, 'saved-001');
  assert.equal(store.list()[0].name, 'Kitchen fridge');
  assert.equal(store.list()[0].savedAt, '2026-04-26T01:00:00.000Z');
});

test('phase 45c saved-search store: fourth save replaces the oldest slot', async () => {
  const { createSavedSearchStore } = await loadStore();
  let counter = 0;
  const store = createSavedSearchStore({
    storage: createMemoryStorage(),
    nowFn: () => new Date(`2026-04-26T01:00:0${counter}.000Z`),
    idFactory: () => `saved-${counter += 1}`
  });

  store.save({ name: 'One', state: makeState({ w: 600 }) });
  store.save({ name: 'Two', state: makeState({ w: 700 }) });
  store.save({ name: 'Three', state: makeState({ w: 800 }) });
  store.save({ name: 'Four', state: makeState({ w: 900 }) });

  assert.deepEqual(store.list().map((entry) => entry.name), ['Two', 'Three', 'Four']);
});

test('phase 45c saved-search store: duplicate name overwrites without changing id', async () => {
  const { createSavedSearchStore } = await loadStore();
  let counter = 0;
  const store = createSavedSearchStore({
    storage: createMemoryStorage(),
    nowFn: () => new Date('2026-04-26T01:00:00.000Z'),
    idFactory: () => `saved-${counter += 1}`
  });

  store.save({ name: 'Kitchen fridge', state: makeState({ w: 600 }) });
  store.save({ name: 'Kitchen fridge', state: makeState({ w: 900 }) });

  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, 'saved-1');
  assert.equal(store.list()[0].state.w, 900);
});

test('phase 45c saved-search store: get returns null for missing id', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({ storage: createMemoryStorage() });

  assert.equal(store.get('missing'), null);
});

test('phase 45c saved-search store: remove missing id does not throw', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({ storage: createMemoryStorage() });

  assert.doesNotThrow(() => store.remove('missing'));
});

test('phase 45c saved-search store: storage write failure does not break in-memory list', async () => {
  const { createSavedSearchStore } = await loadStore();
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };
  const store = createSavedSearchStore({
    storage,
    idFactory: () => 'saved-quota',
    nowFn: () => new Date('2026-04-26T01:00:00.000Z')
  });

  const result = store.save({ name: 'Quota safe', state: makeState() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage_unavailable');
  assert.equal(store.list()[0].name, 'Quota safe');
});

test('phase 45c saved-search store: null storage is safe and stays empty', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({ storage: null });

  assert.deepEqual(store.list(), []);
  assert.equal(store.save({ name: 'No storage', state: makeState() }).ok, false);
  assert.deepEqual(store.list(), []);
});

test('phase 45c saved-search store: name is trimmed and truncated to 50 characters', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({
    storage: createMemoryStorage(),
    idFactory: () => 'saved-long'
  });

  store.save({ name: `  ${'A'.repeat(80)}  `, state: makeState() });

  assert.equal(store.list()[0].name.length, 50);
});

test('phase 45c saved-search store: savedAt is ISO formatted', async () => {
  const { createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({
    storage: createMemoryStorage(),
    nowFn: () => new Date('2026-04-26T01:00:00.000Z'),
    idFactory: () => 'saved-time'
  });

  store.save({ name: 'Time check', state: makeState() });

  assert.match(store.list()[0].savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('phase 45c saved-search store: corrupt JSON deserializes to an empty list', async () => {
  const { STORAGE_KEY, createSavedSearchStore } = await loadStore();
  const store = createSavedSearchStore({
    storage: createMemoryStorage({ [STORAGE_KEY]: '{not json' })
  });

  assert.deepEqual(store.list(), []);
});
