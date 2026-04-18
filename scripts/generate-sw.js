#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');

const DEFAULT_PRECACHE = [
  '/',
  '/index.html',
  '/guides/dishwasher-cavity-sizing',
  '/guides/washing-machine-doorway-access',
  '/guides/fridge-clearance-requirements',
  '/guides/dryer-ventilation-guide',
  '/guides/appliance-fit-sizing-handbook',
  '/manifest.webmanifest',
  '/scripts/sw-register.js'
];

function buildVersion(nowMs = Date.now()) {
  const stamp = new Date(nowMs).toISOString().replace(/\D/g, '').slice(0, 14);
  return `fitappliance-v${stamp}`;
}

function createServiceWorkerSource({
  version,
  precache = DEFAULT_PRECACHE
} = {}) {
  const safeVersion = String(version ?? '').trim();
  if (!safeVersion) throw new Error('A non-empty service worker version is required');
  const uniquePrecache = [...new Set(precache.filter((entry) => typeof entry === 'string' && entry.startsWith('/')))];
  const precacheJson = JSON.stringify(uniquePrecache, null, 2);

  return `/* eslint-disable no-restricted-globals */
'use strict';

const SW_VERSION = '${safeVersion}';
const STATIC_CACHE = SW_VERSION;
const PRECACHE = ${precacheJson};
const CACHE_FIRST_PREFIXES = ['/scripts/', '/og-images/', '/data/', '/icons/'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === STATIC_CACHE ? Promise.resolve() : caches.delete(key))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      return fetch(request);
    })());
    return;
  }

  const isHtmlNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (isHtmlNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      if (cached) {
        network.catch(() => null);
        return cached;
      }
      return network || fetch(request);
    })());
    return;
  }

  if (CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
`;
}

async function generateServiceWorker({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'public', 'service-worker.js'),
  nowFn = Date.now,
  precache = DEFAULT_PRECACHE
} = {}) {
  const version = buildVersion(nowFn());
  const source = createServiceWorkerSource({ version, precache });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, 'utf8');
  return { version, outputPath, precacheCount: precache.length };
}

if (require.main === module) {
  generateServiceWorker().then((result) => {
    console.log(`[generate-sw] wrote ${result.outputPath} (${result.version})`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_PRECACHE,
  buildVersion,
  createServiceWorkerSource,
  generateServiceWorker
};
