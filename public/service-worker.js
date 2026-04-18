/* eslint-disable no-restricted-globals */
'use strict';

const SW_VERSION = 'fitappliance-v20260418142010';
const STATIC_CACHE = SW_VERSION;
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
