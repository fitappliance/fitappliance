import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { cleanupVersionedCaches } = require('../scripts/generate-sw.js');

function readServiceWorker() {
  return fs.readFileSync(path.join(ROOT, 'public', 'service-worker.js'), 'utf8');
}

test('phase 43a sw: service worker declares versioned app shell, static and data caches', () => {
  const source = readServiceWorker();

  assert.match(source, /const APP_SHELL_CACHE = `app-shell-\$\{CACHE_VERSION\}`/);
  assert.match(source, /const STATIC_CACHE = `static-\$\{CACHE_VERSION\}`/);
  assert.match(source, /const DATA_CACHE = `data-\$\{CACHE_VERSION\}`/);
});

test('phase 43a sw: install and activate immediately promote the new worker', () => {
  const source = readServiceWorker();

  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /cleanupVersionedCaches\(caches,\s*CACHE_VERSION\)/);
});

test('phase 43a sw: activate cleanup deletes old versioned caches and preserves current caches', async () => {
  const deleted = [];
  const cacheStorage = {
    async keys() {
      return [
        'app-shell-old',
        'static-old',
        'data-old',
        'app-shell-abc1234',
        'static-abc1234',
        'data-abc1234',
        'third-party-cache'
      ];
    },
    async delete(key) {
      deleted.push(key);
      return true;
    }
  };

  await cleanupVersionedCaches(cacheStorage, 'abc1234');

  assert.deepEqual(deleted.sort(), ['app-shell-old', 'data-old', 'static-old']);
});
