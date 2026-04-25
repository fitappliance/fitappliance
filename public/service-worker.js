/* eslint-disable no-restricted-globals */
'use strict';

const CACHE_VERSION = '5a3790b';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/guides/dishwasher-cavity-sizing",
  "/guides/washing-machine-doorway-access",
  "/guides/fridge-clearance-requirements",
  "/guides/dryer-ventilation-guide",
  "/guides/appliance-fit-sizing-handbook",
  "/manifest.webmanifest",
  "/scripts/sw-register.js"
];
const VERSIONED_CACHE_PREFIXES = ["app-shell-","static-","data-"];
const CACHE_FIRST_PREFIXES = ['/scripts/', '/og-images/', '/data/', '/icons/'];

function isVersionedCacheName(key) {
  return VERSIONED_CACHE_PREFIXES.some((prefix) => String(key ?? '').startsWith(prefix));
}

async function cleanupVersionedCaches(cacheStorage, version) {
  const cacheVersion = String(version ?? '').trim();
  const keys = await cacheStorage.keys();
  await Promise.all(keys
    .filter((key) => isVersionedCacheName(key) && !String(key).endsWith(`-${cacheVersion}`))
    .map((key) => cacheStorage.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanupVersionedCaches(caches, CACHE_VERSION);
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
