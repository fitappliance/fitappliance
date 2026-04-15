import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const savedMatchesModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'saved-matches.js')
).href;

function installMockLocalStorage(seed = {}) {
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
    },
    clear() {
      store = {};
    }
  };
}

test('task 14 saved-matches: saveProduct stores an ID', async () => {
  installMockLocalStorage();
  const { saveProduct, getSavedIds } = await import(savedMatchesModuleUrl);

  saveProduct('abc-1');
  assert.deepEqual(getSavedIds(), ['abc-1']);
});

test('task 14 saved-matches: saveProduct is idempotent', async () => {
  installMockLocalStorage();
  const { saveProduct, getSavedIds } = await import(savedMatchesModuleUrl);

  saveProduct('abc-1');
  saveProduct('abc-1');
  assert.deepEqual(getSavedIds(), ['abc-1']);
});

test('task 14 saved-matches: unsaveProduct removes stored ID', async () => {
  installMockLocalStorage();
  const { saveProduct, unsaveProduct, getSavedIds } = await import(savedMatchesModuleUrl);

  saveProduct('abc-1');
  saveProduct('abc-2');
  unsaveProduct('abc-1');
  assert.deepEqual(getSavedIds(), ['abc-2']);
});

test('task 14 saved-matches: isProductSaved returns correct boolean', async () => {
  installMockLocalStorage();
  const { saveProduct, isProductSaved } = await import(savedMatchesModuleUrl);

  saveProduct('abc-1');
  assert.equal(isProductSaved('abc-1'), true);
  assert.equal(isProductSaved('abc-2'), false);
});

test('task 14 saved-matches: getSavedIds handles empty and corrupted storage', async () => {
  installMockLocalStorage();
  const { getSavedIds } = await import(savedMatchesModuleUrl);

  assert.deepEqual(getSavedIds(), []);
  localStorage.setItem('fitappliance-saved-v1', '{bad json');
  assert.deepEqual(getSavedIds(), []);
});
