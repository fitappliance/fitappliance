#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readFile } = require('node:fs/promises');
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
const VERSIONED_CACHE_PREFIXES = ['app-shell-', 'static-', 'data-'];
const DATA_MAX_AGE_MS = 60 * 60 * 1000;

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

async function fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs }) {
  const response = await fetchFn(request);
  if (response?.ok) {
    await cache.put(request, cloneForCache(response, nowFn(), maxAgeMs));
  }
  return response;
}

async function networkFirst({ request, cache, fetchFn, nowFn = Date.now }) {
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn });
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
  maxAgeMs = 0
}) {
  const cached = await cache.match(request);
  if (cached && isCachedResponseFresh(cached, nowFn(), maxAgeMs)) {
    waitUntil(fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs }).catch(() => null));
    return cached;
  }
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs });
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
    return cacheFirstStaleWhileRevalidate({
      request,
      cache,
      fetchFn,
      waitUntil,
      nowFn,
      maxAgeMs: DATA_MAX_AGE_MS
    });
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

async function readExistingCacheVersion(outputPath) {
  try {
    const source = await readFile(outputPath, 'utf8');
    return source.match(/const CACHE_VERSION = '([^']+)'/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeCommitish(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw.slice(0, 7).toLowerCase() : raw;
}

function readGitShortSha({ repoRoot = path.resolve(__dirname, '..'), execFn = execFileSync } = {}) {
  try {
    return String(execFn('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })).trim();
  } catch {
    return '';
  }
}

function buildVersion({
  env = process.env,
  repoRoot = path.resolve(__dirname, '..'),
  existingVersion = '',
  execFn = execFileSync
} = {}) {
  return normalizeCommitish(env.SW_VERSION)
    || normalizeCommitish(env.VERCEL_GIT_COMMIT_SHA)
    || normalizeCommitish(existingVersion)
    || normalizeCommitish(readGitShortSha({ repoRoot, execFn }))
    || 'dev';
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

const CACHE_VERSION = '${safeVersion}';
const APP_SHELL_CACHE = \`app-shell-\${CACHE_VERSION}\`;
const STATIC_CACHE = \`static-\${CACHE_VERSION}\`;
const DATA_CACHE = \`data-\${CACHE_VERSION}\`;
const PRECACHE = ${precacheJson};
const VERSIONED_CACHE_PREFIXES = ${JSON.stringify(VERSIONED_CACHE_PREFIXES)};
const DATA_MAX_AGE_MS = ${DATA_MAX_AGE_MS};
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
    .filter((key) => isVersionedCacheName(key) && !String(key).endsWith(\`-\${cacheVersion}\`))
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

async function fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs }) {
  const response = await fetchFn(request);
  if (response?.ok) {
    await cache.put(request, cloneForCache(response, nowFn(), maxAgeMs));
  }
  return response;
}

async function networkFirst({ request, cache, fetchFn, nowFn = Date.now }) {
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn });
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
  maxAgeMs = 0
}) {
  const cached = await cache.match(request);
  if (cached && isCachedResponseFresh(cached, nowFn(), maxAgeMs)) {
    waitUntil(fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs }).catch(() => null));
    return cached;
  }
  try {
    return await fetchAndCache({ request, cache, fetchFn, nowFn, maxAgeMs });
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
    return cacheFirstStaleWhileRevalidate({
      request,
      cache,
      fetchFn,
      waitUntil,
      nowFn,
      maxAgeMs: DATA_MAX_AGE_MS
    });
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
`;
}

async function generateServiceWorker({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'public', 'service-worker.js'),
  env = process.env,
  precache = DEFAULT_PRECACHE
} = {}) {
  const existingVersion = await readExistingCacheVersion(outputPath);
  const version = buildVersion({ env, repoRoot, existingVersion });
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
  DATA_MAX_AGE_MS,
  VERSIONED_CACHE_PREFIXES,
  buildVersion,
  cacheFirstStaleWhileRevalidate,
  cleanupVersionedCaches,
  handleServiceWorkerRequest,
  isVersionedCacheName,
  isUiAssetRequest,
  networkFirst,
  shouldHandleRequest,
  readExistingCacheVersion,
  readGitShortSha,
  createServiceWorkerSource,
  generateServiceWorker
};
