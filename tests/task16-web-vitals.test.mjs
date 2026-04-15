import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'web-vitals.js')
).href;

function installLocalStorageMock(seed = {}) {
  const store = { ...seed };
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    }
  };
  return store;
}

test('task 16 web-vitals: getSummary returns null with no stored sessions', async () => {
  installLocalStorageMock();
  const { getSummary } = await import(moduleUrl);
  assert.equal(getSummary(), null);
});

test('task 16 web-vitals: getSummary computes avgLcp correctly', async () => {
  const seed = {
    'fitappliance-vitals-v1': JSON.stringify([
      { ts: 1, vitals: { lcp: 1500, cls: 0.1, ttfb: 200, domLoad: 600 } },
      { ts: 2, vitals: { lcp: 2100, cls: 0.2, ttfb: 300, domLoad: 800 } }
    ])
  };
  installLocalStorageMock(seed);
  const { getSummary } = await import(moduleUrl);
  assert.equal(getSummary()?.avgLcp, 1800);
});

test('task 16 web-vitals: getSummary computes avgCls with 4 decimal precision', async () => {
  const seed = {
    'fitappliance-vitals-v1': JSON.stringify([
      { ts: 1, vitals: { cls: 0.12345 } },
      { ts: 2, vitals: { cls: 0.20001 } }
    ])
  };
  installLocalStorageMock(seed);
  const { getSummary } = await import(moduleUrl);
  assert.equal(getSummary()?.avgCls, 0.1617);
});

test('task 16 web-vitals: storeSession enforces MAX_STORED_SESSIONS', async () => {
  installLocalStorageMock();
  const { getStoredVitals, storeSession } = await import(moduleUrl);
  for (let i = 0; i < 12; i += 1) {
    storeSession({ ts: i + 1, vitals: { lcp: 1000 + i } });
  }
  const stored = getStoredVitals();
  assert.equal(stored.length, 10);
  assert.equal(stored[0].ts, 12);
  assert.equal(stored[9].ts, 3);
});

test('task 16 web-vitals: getStoredVitals returns empty array on corrupted JSON', async () => {
  installLocalStorageMock({ 'fitappliance-vitals-v1': '{not-json' });
  const { getStoredVitals } = await import(moduleUrl);
  assert.deepEqual(getStoredVitals(), []);
});
