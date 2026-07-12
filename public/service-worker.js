/* eslint-disable no-restricted-globals */
'use strict';

const CACHE_VERSION = 'e69bbe0';
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
const CACHE_NAMES = {
  appShell: APP_SHELL_CACHE,
  static: STATIC_CACHE,
  data: DATA_CACHE
};

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

function getHeader(request, name) {
  return request?.headers?.get?.(name) ?? '';
}

function parseRequestUrl(request, locationOrigin) {
  try {
    return new URL(request.url, locationOrigin);
  } catch {
    return null;
  }
}

function isHtmlRequest(request) {
  return request?.mode === 'navigate'
    || request?.destination === 'document'
    || String(getHeader(request, 'accept')).includes('text/html');
}

function isDataRequest(url) {
  return Boolean(url && url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'));
}

function isStaticRequest(request, url) {
  if (!url) return false;
  if (['script', 'style', 'image', 'font'].includes(request?.destination)) return true;
  return ['/scripts/', '/styles.css', '/og-images/', '/icons/', '/manifest.webmanifest']
    .some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix));
}

function isUiAssetRequest(request, url) {
  if (!url) return false;
  if (['script', 'style'].includes(request?.destination)) return true;
  return url.pathname === '/styles.css'
    || url.pathname === '/styles-deferred.css'
    || url.pathname.startsWith('/scripts/');
}

function shouldHandleRequest(request, locationOrigin) {
  if (request?.method !== 'GET') return false;
  const url = parseRequestUrl(request, locationOrigin);
  if (!url || url.origin !== locationOrigin) return false;
  return !url.pathname.startsWith('/api/');
}

function isCachedResponseFresh(response, nowMs, maxAgeMs) {
  if (!maxAgeMs) return true;
  const fetchedAt = Number(response?.headers?.get?.('x-fitappliance-fetched-at'));
  return Number.isFinite(fetchedAt) && nowMs - fetchedAt <= maxAgeMs;
}

function cloneForCache(response, nowMs, maxAgeMs) {
  const cloned = response.clone();
  if (!maxAgeMs || typeof Response === 'undefined' || !(cloned instanceof Response)) {
    return cloned;
  }
  const headers = new Headers(cloned.headers);
  headers.set('x-fitappliance-fetched-at', String(nowMs));
  return new Response(cloned.body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers
  });
}

function createReloadRequest(request) {
  if (typeof Request !== 'undefined') {
    try {
      return new Request(request, { cache: 'reload' });
    } catch {
      // Test doubles and legacy browsers fall through to a request-shaped copy.
    }
  }
  return { ...request, cache: 'reload' };
}

async function fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs, bypassHttpCache = false }) {
  const networkRequest = bypassHttpCache ? createReloadRequest(request) : request;
  const response = await fetchFn(networkRequest);
  if (response?.ok) {
    try {
      await cache.put(request, cloneForCache(response, nowFn(), maxAgeMs));
    } catch {
      // Cache Storage is an optimisation; a valid network response remains authoritative.
    }
  }
  return response;
}

async function networkFirst({ request, cache, fetchFn, nowFn = Date.now }) {
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn, bypassHttpCache: true });
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('network_unavailable');
  }
}

async function cacheFirstStaleWhileRevalidate({
  request,
  cache,
  fetchFn,
  waitUntil = () => {},
  nowFn = Date.now,
  maxAgeMs = 0,
  bypassHttpCache = false
}) {
  const cached = await cache.match(request);
  if (cached && isCachedResponseFresh(cached, nowFn(), maxAgeMs)) {
    waitUntil(fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs, bypassHttpCache }).catch(() => null));
    return cached;
  }
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs, bypassHttpCache });
  } catch {
    if (cached) return cached;
    throw new Error('network_unavailable');
  }
}

async function handleServiceWorkerRequest({
  request,
  cacheStorage,
  fetchFn,
  locationOrigin,
  waitUntil = () => {},
  nowFn = Date.now,
  cacheNames
}) {
  if (!shouldHandleRequest(request, locationOrigin)) return null;
  const url = parseRequestUrl(request, locationOrigin);
  if (isHtmlRequest(request)) {
    const cache = await cacheStorage.open(cacheNames.appShell);
    return networkFirst({ request, cache, fetchFn, nowFn });
  }
  if (isDataRequest(url)) {
    const cache = await cacheStorage.open(cacheNames.data);
    return networkFirst({ request, cache, fetchFn, nowFn });
  }
  if (isStaticRequest(request, url)) {
    const cache = await cacheStorage.open(cacheNames.static);
    if (isUiAssetRequest(request, url)) {
      return networkFirst({ request, cache, fetchFn, nowFn });
    }
    return cacheFirstStaleWhileRevalidate({ request, cache, fetchFn, waitUntil, nowFn });
  }
  return fetchFn(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
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
  if (!shouldHandleRequest(request, self.location.origin)) return;
  event.respondWith(handleServiceWorkerRequest({
    request,
    cacheStorage: caches,
    fetchFn: fetch,
    locationOrigin: self.location.origin,
    waitUntil: (promise) => event.waitUntil(promise),
    cacheNames: CACHE_NAMES
  }));
});
