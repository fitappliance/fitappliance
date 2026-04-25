import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleServiceWorkerRequest } = require('../scripts/generate-sw.js');

function response(label, { ok = true } = {}) {
  return {
    label,
    ok,
    clone() {
      return response(`${label}:clone`, { ok });
    },
    headers: {
      get() {
        return null;
      }
    }
  };
}

function request(url, overrides = {}) {
  return {
    method: 'GET',
    url,
    mode: 'cors',
    destination: '',
    headers: {
      get(name) {
        return name.toLowerCase() === 'accept' ? (overrides.accept ?? '') : null;
      }
    },
    ...overrides
  };
}

function createCacheStorage(cachedByName = {}) {
  const puts = [];
  return {
    puts,
    async open(name) {
      return {
        async match(req) {
          return cachedByName[name]?.get(req.url) ?? null;
        },
        async put(req, res) {
          puts.push({ cacheName: name, url: req.url, response: res.label });
          if (!cachedByName[name]) cachedByName[name] = new Map();
          cachedByName[name].set(req.url, res);
        }
      };
    }
  };
}

const cacheNames = {
  appShell: 'app-shell-v1',
  static: 'static-v1',
  data: 'data-v1'
};

test('phase 43a sw: HTML requests prefer network and update app shell cache', async () => {
  const req = request('https://www.fitappliance.com.au/brands/lg-fridge-clearance', {
    mode: 'navigate',
    accept: 'text/html'
  });
  const cacheStorage = createCacheStorage({
    [cacheNames.appShell]: new Map([[req.url, response('cached-html')]])
  });

  const result = await handleServiceWorkerRequest({
    request: req,
    cacheStorage,
    fetchFn: async () => response('network-html'),
    locationOrigin: 'https://www.fitappliance.com.au',
    cacheNames
  });

  assert.equal(result.label, 'network-html');
  assert.deepEqual(cacheStorage.puts, [{ cacheName: cacheNames.appShell, url: req.url, response: 'network-html:clone' }]);
});

test('phase 43a sw: HTML requests fall back to cache when network fails', async () => {
  const req = request('https://www.fitappliance.com.au/guides/fridge-clearance-requirements', {
    mode: 'navigate',
    accept: 'text/html'
  });
  const cacheStorage = createCacheStorage({
    [cacheNames.appShell]: new Map([[req.url, response('cached-html')]])
  });

  const result = await handleServiceWorkerRequest({
    request: req,
    cacheStorage,
    fetchFn: async () => { throw new Error('offline'); },
    locationOrigin: 'https://www.fitappliance.com.au',
    cacheNames
  });

  assert.equal(result.label, 'cached-html');
});

test('phase 43a sw: static cache hits return immediately and update in the background', async () => {
  const req = request('https://www.fitappliance.com.au/scripts/sw-register.js', {
    destination: 'script'
  });
  const cacheStorage = createCacheStorage({
    [cacheNames.static]: new Map([[req.url, response('cached-script')]])
  });
  const background = [];

  const result = await handleServiceWorkerRequest({
    request: req,
    cacheStorage,
    fetchFn: async () => response('network-script'),
    locationOrigin: 'https://www.fitappliance.com.au',
    waitUntil: (promise) => background.push(promise),
    cacheNames
  });

  assert.equal(result.label, 'cached-script');
  assert.equal(background.length, 1);
  await Promise.all(background);
  assert.deepEqual(cacheStorage.puts, [{ cacheName: cacheNames.static, url: req.url, response: 'network-script:clone' }]);
});

test('phase 43a sw: data JSON uses the data cache namespace', async () => {
  const req = request('https://www.fitappliance.com.au/data/fridges.json', {
    destination: ''
  });
  const cacheStorage = createCacheStorage();

  const result = await handleServiceWorkerRequest({
    request: req,
    cacheStorage,
    fetchFn: async () => response('network-data'),
    locationOrigin: 'https://www.fitappliance.com.au',
    cacheNames
  });

  assert.equal(result.label, 'network-data');
  assert.deepEqual(cacheStorage.puts, [{ cacheName: cacheNames.data, url: req.url, response: 'network-data:clone' }]);
});
