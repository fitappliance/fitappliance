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
const CACHE_FIRST_PREFIXES = ['/scripts/', '/og-images/', '/data/', '/icons/'];

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
  VERSIONED_CACHE_PREFIXES,
  buildVersion,
  cleanupVersionedCaches,
  isVersionedCacheName,
  readExistingCacheVersion,
  readGitShortSha,
  createServiceWorkerSource,
  generateServiceWorker
};
