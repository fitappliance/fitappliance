import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadVercelConfig() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
}

function findHeaderRule(config, source) {
  return (config.headers ?? []).find((rule) => rule.source === source);
}

function headerValue(rule, key) {
  return (rule?.headers ?? []).find((header) => header.key.toLowerCase() === key.toLowerCase())?.value ?? '';
}

test('vercel production config: clean urls and canonical slash behavior are explicit', () => {
  const config = loadVercelConfig();

  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  assert.equal(config.buildCommand, 'npm run build');
});

test('vercel production config: compliance and static app routes are reachable', () => {
  const config = loadVercelConfig();
  const routes = new Map((config.rewrites ?? []).map((rewrite) => [rewrite.source, rewrite.destination]));

  assert.equal(routes.get('/about'), '/pages/about.html');
  assert.equal(routes.get('/privacy'), '/pages/privacy.html');
  assert.equal(routes.get('/terms'), '/pages/terms.html');
  assert.equal(routes.get('/contact'), '/pages/contact.html');
  assert.equal(routes.get('/data/:path*'), '/public/data/:path*');
  assert.equal(routes.get('/scripts/:path*'), '/public/scripts/:path*');
});

test('vercel production config: runtime data and evidence files have bounded CDN caching', () => {
  const config = loadVercelConfig();

  const dataCache = headerValue(findHeaderRule(config, '/data/:path*'), 'Cache-Control');
  assert.match(dataCache, /max-age=86400/);
  assert.match(dataCache, /stale-while-revalidate=604800/);

  const evidenceCache = headerValue(findHeaderRule(config, '/pdf-evidence/:path*'), 'Cache-Control');
  assert.match(evidenceCache, /max-age=86400/);
  assert.match(evidenceCache, /stale-while-revalidate=604800/);
});

test('vercel production config: immutable generated media avoids repeated bandwidth', () => {
  const config = loadVercelConfig();

  const ogCache = headerValue(findHeaderRule(config, '/og-images/:path*'), 'Cache-Control');
  assert.match(ogCache, /max-age=31536000/);
  assert.match(ogCache, /immutable/);

  const iconCache = headerValue(findHeaderRule(config, '/icons/:path*'), 'Cache-Control');
  assert.match(iconCache, /max-age=31536000/);
  assert.match(iconCache, /immutable/);
});
