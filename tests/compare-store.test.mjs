import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(repoRoot, 'public', 'scripts', 'compare-store.js');

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
    }
  };
}

function makeSnapshot(slug, overrides = {}) {
  return {
    slug,
    displayName: `Appliance ${slug}`,
    brand: 'Bosch',
    w: 600,
    h: 1800,
    d: 650,
    retailers: [{ name: 'The Good Guys', price: 1099 }],
    stars: 4,
    ...overrides
  };
}

test('partnerize compare store: preserves canonical and click URLs in snapshots', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });
  const canonicalUrl = 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl';
  const clickUrl = 'https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455pl';

  store.add(makeSnapshot('partnerize-tgg', {
    retailers: [{ name: 'The Good Guys', price: 1099, url: canonicalUrl, clickUrl }]
  }));

  const [entry] = store.list();
  assert.equal(entry.snapshot.retailers[0].url, canonicalUrl);
  assert.equal(entry.snapshot.retailers[0].clickUrl, clickUrl);
});

test('phase 58 compare store: fifth add is rejected at capacity', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });

  assert.equal(store.add(makeSnapshot('p1')).ok, true);
  assert.equal(store.add(makeSnapshot('p2')).ok, true);
  assert.equal(store.add(makeSnapshot('p3')).ok, true);
  assert.equal(store.add(makeSnapshot('p4')).ok, true);
  const fifth = store.add(makeSnapshot('p5'));

  assert.equal(fifth.ok, false);
  assert.equal(fifth.reason, 'capacity');
  assert.deepEqual(store.list().map((entry) => entry.id), ['p1', 'p2', 'p3', 'p4']);
});

test('phase 45c compare store: duplicate slug is not added twice', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });

  assert.equal(store.add(makeSnapshot('p1')).ok, true);
  assert.equal(store.add(makeSnapshot('p1', { displayName: 'New label' })).ok, true);

  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].snapshot.displayName, 'Appliance p1');
});

test('phase 45c compare store: has returns the selected state by slug', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });

  store.add(makeSnapshot('p1'));

  assert.equal(store.has('p1'), true);
  assert.equal(store.has('p2'), false);
});

test('phase 45c compare store: remove and clear update the list', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });

  store.add(makeSnapshot('p1'));
  store.add(makeSnapshot('p2'));
  store.remove('p1');
  assert.deepEqual(store.list().map((entry) => entry.id), ['p2']);

  store.clear();
  assert.deepEqual(store.list(), []);
});

test('phase 45c compare store: localStorage write failure does not throw and keeps memory state', async () => {
  const { createCompareStore } = await loadStore();
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };
  const store = createCompareStore({ storage });

  const result = store.add(makeSnapshot('p1'));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage_unavailable');
  assert.equal(store.has('p1'), true);
});
