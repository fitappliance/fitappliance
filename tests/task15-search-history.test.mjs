import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'search-history.js')
).href;

function installLocalStorageMock(seed = {}) {
  let store = { ...seed };
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
}

test('task 15 search-history: recordSearch stores an entry in localStorage', async () => {
  installLocalStorageMock();
  const { clearSearchHistory, getRecentSearches, recordSearch } = await import(moduleUrl);
  clearSearchHistory();

  recordSearch({ cat: 'fridge', w: 600, h: 1800, d: 650, brand: 'LG' });
  const history = getRecentSearches();

  assert.equal(history.length, 1);
  assert.equal(history[0].params.cat, 'fridge');
});

test('task 15 search-history: recordSearch deduplicates identical entries', async () => {
  installLocalStorageMock();
  const { clearSearchHistory, getRecentSearches, recordSearch } = await import(moduleUrl);
  clearSearchHistory();

  const params = { cat: 'fridge', w: 600, h: 1800, d: 650, brand: 'LG' };
  recordSearch(params);
  recordSearch(params);

  assert.equal(getRecentSearches().length, 1);
});

test('task 15 search-history: keeps only the most recent MAX_HISTORY entries', async () => {
  installLocalStorageMock();
  const { MAX_HISTORY, clearSearchHistory, getRecentSearches, recordSearch } = await import(moduleUrl);
  clearSearchHistory();

  for (let index = 1; index <= MAX_HISTORY + 1; index += 1) {
    recordSearch({ cat: 'fridge', w: 500 + index, h: 1800, d: 650, brand: '' });
  }

  const history = getRecentSearches();
  assert.equal(history.length, MAX_HISTORY);
  assert.equal(history.some((entry) => entry.params.w === 501), false, 'oldest entry should be dropped');
});

test('task 15 search-history: getRecentSearches returns most recent first', async () => {
  installLocalStorageMock();
  const { clearSearchHistory, getRecentSearches, recordSearch } = await import(moduleUrl);
  clearSearchHistory();

  recordSearch({ cat: 'fridge', w: 600, h: 1800, d: 650, brand: '' });
  recordSearch({ cat: 'dishwasher', w: 600, h: 850, d: 600, brand: '' });

  const history = getRecentSearches();
  assert.equal(history[0].params.cat, 'dishwasher');
  assert.equal(history[1].params.cat, 'fridge');
});

test('task 15 search-history: buildSearchHistoryHtml returns empty string for empty history', async () => {
  installLocalStorageMock();
  const { buildSearchHistoryHtml } = await import(moduleUrl);
  assert.equal(buildSearchHistoryHtml([]), '');
});
