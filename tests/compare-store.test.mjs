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

test('replacement snapshots preserve size deltas without synthesising fit, clearance or delivery fields', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });
  const result = store.add(makeSnapshot('replacement', {
    comparisonMode: 'replacement',
    replacementMatch: {
      deltasMm: { width: 2, height: -5, depth: 10 },
      maxAbsoluteDeltaMm: 10,
      totalAbsoluteDeltaMm: 17,
      normalizedDistance: 0.01,
      relation: 'MIXED',
      candidateDimensionSource: 'geometry_v2',
      candidateHeightRangeMm: { minimum: 850, maximum: 895, selected: 870 },
    },
    practicalClearance: { side: 5, top: 20, rear: 10 },
    fitSummary: { status: 'exact', bindingAxis: 'width', tightestGapMm: 20 },
    delivery: { doorwayClearanceMm: 700, turnClearanceMm: 800 },
  }));

  assert.equal(result.ok, true);
  const snapshot = store.list()[0].snapshot;
  assert.equal(snapshot.comparisonMode, 'replacement');
  assert.deepEqual(snapshot.replacementMatch.deltasMm, { width: 2, height: -5, depth: 10 });
  assert.equal(snapshot.replacementMatch.maxAbsoluteDeltaMm, 10);
  assert.equal(snapshot.replacementMatch.candidateDimensionSource, 'geometry_v2');
  assert.deepEqual(snapshot.replacementMatch.candidateHeightRangeMm, { minimum: 850, maximum: 895, selected: 870 });
  assert.equal(Object.hasOwn(snapshot, 'fitSummary'), false);
  assert.equal(Object.hasOwn(snapshot, 'practicalClearance'), false);
  assert.equal(Object.hasOwn(snapshot, 'manufacturerClearance'), false);
  assert.equal(Object.hasOwn(snapshot, 'delivery'), false);
});

test('compare store rejects mixing cavity and replacement comparison semantics', async () => {
  const { createCompareStore } = await loadStore();
  const store = createCompareStore({ storage: createMemoryStorage() });
  assert.equal(store.add(makeSnapshot('cavity', { comparisonMode: 'cavity' })).ok, true);

  const mixed = store.add(makeSnapshot('replacement', {
    comparisonMode: 'replacement',
    replacementMatch: {
      deltasMm: { width: 0, height: 0, depth: 0 },
      maxAbsoluteDeltaMm: 0,
      totalAbsoluteDeltaMm: 0,
      normalizedDistance: 0,
      relation: 'IDENTICAL',
    },
  }));

  assert.deepEqual(mixed, { ok: false, reason: 'mode_mismatch' });
  assert.deepEqual(store.list().map((entry) => entry.id), ['cavity']);
});
