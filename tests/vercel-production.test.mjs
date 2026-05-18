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

  assert.equal(routes.get('/about'), '/pages/about');
  assert.equal(routes.get('/privacy'), '/pages/privacy');
  assert.equal(routes.get('/terms'), '/pages/terms');
  assert.equal(routes.get('/contact'), '/pages/contact');
  assert.equal(routes.get('/products'), '/pages/products');
  assert.equal(routes.get('/products/:slug'), '/pages/products/:slug');
  assert.equal(routes.get('/data/:path*'), '/public/data/:path*');
  assert.equal(routes.get('/scripts/:path*'), '/public/scripts/:path*');
});

test('vercel production config: current GSC 404 examples have durable redirects', () => {
  const config = loadVercelConfig();
  const redirects = new Map((config.redirects ?? []).map((redirect) => [redirect.source, redirect]));

  for (const width of [800, 700, 620, 600, 580]) {
    assert.deepEqual(redirects.get(`/fit-check/panasonic-nr-tc221busa-in-${width}mm-cavity`), {
      source: `/fit-check/panasonic-nr-tc221busa-in-${width}mm-cavity`,
      destination: '/fit-check/panasonic-nr-tc221busa-in-640mm-cavity',
      permanent: true
    });
  }
  assert.deepEqual(redirects.get('/fit-check/lg-wtx3-09g-in-620mm-cavity'), {
    source: '/fit-check/lg-wtx3-09g-in-620mm-cavity',
    destination: '/brands/lg-washing-machine-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/fit-check/hisense-hcf7s1014b-in-640mm-cavity'), {
    source: '/fit-check/hisense-hcf7s1014b-in-640mm-cavity',
    destination: '/brands/hisense-washing-machine-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/cavity'), {
    source: '/cavity',
    destination: '/tools/fit-checker',
    permanent: true
  });
  assert.deepEqual(redirects.get('/doorway'), {
    source: '/doorway',
    destination: '/tools/fit-checker',
    permanent: true
  });
  assert.deepEqual(redirects.get('/location'), {
    source: '/location',
    destination: '/tools/fit-checker',
    permanent: true
  });
  assert.deepEqual(redirects.get('/location/:city'), {
    source: '/location/:city',
    destination: '/location/:city/fridge',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/euro-vs-robinhood-dryer-clearance'), {
    source: '/compare/euro-vs-robinhood-dryer-clearance',
    destination: '/brands/euro-dryer-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/smeg-vs-miele-dishwasher-clearance'), {
    source: '/compare/smeg-vs-miele-dishwasher-clearance',
    destination: '/compare/fisher-paykel-vs-miele-dishwasher-clearance',
    permanent: true
  });
});

test('vercel production config: runtime data and evidence files have bounded CDN caching', () => {
  const config = loadVercelConfig();

  const dataRule = findHeaderRule(config, '/data/:path*');
  const dataCache = headerValue(dataRule, 'Cache-Control');
  assert.match(dataCache, /max-age=86400/);
  assert.match(dataCache, /stale-while-revalidate=604800/);
  assert.equal(headerValue(dataRule, 'X-Robots-Tag'), 'noindex');

  const evidenceRule = findHeaderRule(config, '/pdf-evidence/:path*');
  const evidenceCache = headerValue(evidenceRule, 'Cache-Control');
  assert.match(evidenceCache, /max-age=86400/);
  assert.match(evidenceCache, /stale-while-revalidate=604800/);
  assert.equal(headerValue(evidenceRule, 'X-Robots-Tag'), 'noindex');
});

test('vercel production config: JavaScript modules are not treated as indexable pages', () => {
  const config = loadVercelConfig();

  const scriptsRule = findHeaderRule(config, '/scripts/:path*');
  const scriptCache = headerValue(scriptsRule, 'Cache-Control');
  assert.match(scriptCache, /max-age=86400/);
  assert.match(scriptCache, /stale-while-revalidate=604800/);
  assert.equal(headerValue(scriptsRule, 'X-Robots-Tag'), 'noindex');
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
