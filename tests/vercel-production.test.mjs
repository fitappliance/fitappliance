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
  assert.equal(config.buildCommand, 'npm run build:deploy');
  assert.equal(config.outputDirectory, 'dist');
});

test('vercel production config: apex host permanently redirects to canonical www host', () => {
  const config = loadVercelConfig();
  const redirects = config.redirects ?? [];
  const apexRedirect = redirects.find((redirect) => {
    return redirect.source === '/:path*'
      && redirect.destination === 'https://www.fitappliance.com.au/:path*'
      && Array.isArray(redirect.has)
      && redirect.has.some((condition) => {
        return condition.type === 'header'
          && condition.key.toLowerCase() === 'host'
          && condition.value === 'fitappliance.com.au';
      });
  });

  assert.deepEqual(apexRedirect, {
    source: '/:path*',
    has: [
      {
        type: 'header',
        key: 'host',
        value: 'fitappliance.com.au'
      }
    ],
    destination: 'https://www.fitappliance.com.au/:path*',
    permanent: true
  });
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
  assert.equal(routes.get('/licenses/:path*'), '/public/licenses/:path*');
  assert.equal(routes.get('/third-party-licenses'), '/pages/third-party-licenses');
  assert.equal(routes.has('/pdf-evidence/:path*'), false);
});

test('vercel production config: legacy comparison aliases have real fallbacks', () => {
  const config = loadVercelConfig();
  const redirects = new Map((config.redirects ?? []).map((row) => [row.source, row.destination]));

  assert.equal(redirects.get('/compare/chiq-vs-lg-fridge'), '/brands/chiq-fridge-clearance');
  assert.equal(redirects.get('/compare/smeg-vs-miele-dishwasher-clearance'), '/compare/miele-vs-smeg-dishwasher');
  assert.equal(redirects.get('/compare/fisher-paykel-vs-lg-dryer'), '/brands/fisher-paykel-dryer-clearance');
  for (const target of [
    'pages/brands/chiq-fridge-clearance.html',
    'pages/compare/miele-vs-smeg-dishwasher.html',
    'pages/brands/fisher-paykel-dryer-clearance.html',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, target)), true, target);
  }
});

test('third-party licenses and government data attribution are publicly disclosed', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'pages/third-party-licenses.html'), 'utf8');
  const apache = fs.readFileSync(path.join(repoRoot, 'public/licenses/web-vitals-4.2.4-apache-2.0.txt'), 'utf8');
  const outfit = fs.readFileSync(path.join(repoRoot, 'public/licenses/outfit-ofl-1.1.txt'), 'utf8');
  const home = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(page, /web-vitals 4\.2\.4/);
  assert.match(page, /Australian Government Energy Rating dataset/);
  assert.match(page, /Department of Climate Change, Energy, the Environment and Water/);
  assert.match(page, /Creative Commons Attribution 3\.0 Australia/);
  assert.match(page, /\/licenses\/web-vitals-4\.2\.4-apache-2\.0\.txt/);
  assert.match(page, /\/licenses\/outfit-ofl-1\.1\.txt/);
  assert.match(apache, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(outfit, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(home, /href="\/third-party-licenses"/);
});

test('vercel production config: root files do not shadow public script rewrites', () => {
  const shadowedModules = [];
  const rootScripts = path.join(repoRoot, 'scripts');
  const publicScripts = path.join(repoRoot, 'public', 'scripts');

  function visit(directory, relative = '') {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const nextRelative = path.join(relative, entry.name);
      const nextPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(nextPath, nextRelative);
      } else if (fs.existsSync(path.join(publicScripts, nextRelative))) {
        shadowedModules.push(nextRelative);
      }
    }
  }

  visit(rootScripts);
  assert.deepEqual(shadowedModules, []);
});

test('vercel production config: CSP permits manual AdSense delivery without allowing wildcard scripts', () => {
  const config = loadVercelConfig();
  const globalRule = findHeaderRule(config, '/(.*)');
  const csp = headerValue(globalRule, 'Content-Security-Policy');

  assert.match(csp, /script-src[^;]*https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/googleads\.g\.doubleclick\.net/);
  assert.match(csp, /script-src[^;]*https:\/\/tpc\.googlesyndication\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.adtrafficquality\.google/);
  assert.match(csp, /frame-src[^;]*https:\/\/googleads\.g\.doubleclick\.net/);
  assert.match(csp, /img-src[^;]*https:\/\/\*\.googlesyndication\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*(?:\s|\*)\*(?:\s|;|$)/);
});

test('vercel production config: current GSC 404 examples have durable redirects', () => {
  const config = loadVercelConfig();
  const redirects = new Map((config.redirects ?? []).map((redirect) => [redirect.source, redirect]));

  for (const width of [800, 700, 620, 600, 580]) {
    assert.deepEqual(redirects.get(`/fit-check/panasonic-nr-tc221busa-in-${width}mm-cavity`), {
      source: `/fit-check/panasonic-nr-tc221busa-in-${width}mm-cavity`,
      destination: '/brands/panasonic-fridge-clearance',
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
    destination: '/compare/miele-vs-smeg-dishwasher',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/midea-vs-inalto-washing-machine-clearance'), {
    source: '/compare/midea-vs-inalto-washing-machine-clearance',
    destination: '/brands/midea-washing-machine-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/midea-vs-beko-washing-machine-clearance'), {
    source: '/compare/midea-vs-beko-washing-machine-clearance',
    destination: '/brands/midea-washing-machine-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/hisense-vs-inalto-washing-machine-clearance'), {
    source: '/compare/hisense-vs-inalto-washing-machine-clearance',
    destination: '/brands/hisense-washing-machine-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/compare/hisense-vs-chiq-fridge-clearance'), {
    source: '/compare/hisense-vs-chiq-fridge-clearance',
    destination: '/compare/hisense-vs-chiq-fridge',
    permanent: true
  });
  assert.deepEqual(redirects.get('/products/westinghouse-wtb3400ak-ao-110593'), {
    source: '/products/westinghouse-wtb3400ak-ao-110593',
    destination: '/brands/westinghouse-fridge-clearance',
    permanent: true
  });
  assert.deepEqual(redirects.get('/products/westinghouse-wqe6870ba-ao-88955'), {
    source: '/products/westinghouse-wqe6870ba-ao-88955',
    destination: '/brands/westinghouse-fridge-clearance',
    permanent: true
  });
  assert.equal(
    redirects.has('/products/westinghouse-whe6874ba-ao-88474'),
    false,
    'machine-resolved products must not retain a quarantine redirect',
  );
});

test('vercel production config: runtime data revalidates and private PDF evidence has no public header rule', () => {
  const config = loadVercelConfig();

  const dataRule = findHeaderRule(config, '/data/:path*');
  const dataCache = headerValue(dataRule, 'Cache-Control');
  assert.equal(dataCache, 'public, max-age=0, must-revalidate');
  assert.equal(headerValue(dataRule, 'X-Robots-Tag'), 'noindex');

  assert.equal(findHeaderRule(config, '/pdf-evidence/:path*'), undefined);
});

test('vercel production config: runtime UI assets revalidate and JavaScript stays non-indexable', () => {
  const config = loadVercelConfig();

  const scriptsRule = findHeaderRule(config, '/scripts/:path*');
  const scriptCache = headerValue(scriptsRule, 'Cache-Control');
  assert.equal(scriptCache, 'public, max-age=0, must-revalidate');
  assert.equal(headerValue(scriptsRule, 'X-Robots-Tag'), 'noindex');

  for (const source of ['/styles.css', '/styles-deferred.css', '/public/:path*']) {
    assert.equal(
      headerValue(findHeaderRule(config, source), 'Cache-Control'),
      'public, max-age=0, must-revalidate',
      `${source} must not pin an old release in the browser HTTP cache`,
    );
  }
});

test('vercel production config: the service worker script always revalidates', () => {
  const config = loadVercelConfig();
  const rule = findHeaderRule(config, '/service-worker.js');

  assert.equal(headerValue(rule, 'Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(headerValue(rule, 'Service-Worker-Allowed'), '/');
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
