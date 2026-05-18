import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

test('cf submission prep: DNS verifier reports MX, SPF and DMARC checks with resolver injection', async () => {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'scripts', 'verify-mail-dns.js')).href;
  const { verifyMailDns } = await import(moduleUrl);
  const result = await verifyMailDns({
    domain: 'fitappliance.com.au',
    resolver: {
      resolveMx: async () => [
        { exchange: 'mx1.improvmx.com', priority: 10 },
        { exchange: 'mx2.improvmx.com', priority: 20 },
      ],
      resolveTxt: async (name) => {
        if (name === 'fitappliance.com.au') return [['v=spf1 include:spf.improvmx.com ~all']];
        if (name === '_dmarc.fitappliance.com.au') return [['v=DMARC1; p=none; rua=mailto:ofkingmedia@gmail.com']];
        return [];
      },
    },
  });

  assert.equal(result.domain, 'fitappliance.com.au');
  assert.equal(result.checks.mx.ok, true);
  assert.equal(result.checks.spf.ok, true);
  assert.equal(result.checks.dmarc.ok, true);
  assert.equal(result.ok, true);
});

test('cf submission prep: required legal routes exist with corporate contact and disclaimers', () => {
  for (const route of ['about', 'privacy', 'terms', 'contact']) {
    const filePath = path.join(ROOT, 'pages', `${route}.html`);
    assert.ok(fs.existsSync(filePath), `pages/${route}.html should exist`);
    const html = read(`pages/${route}.html`);
    assert.match(html, /href="\/methodology"/, `${route} should link to methodology`);
    assert.match(html, /href="\/about\/editorial-standards"/, `${route} should link to editorial standards`);
    assert.match(html, /<meta name="article:modified_time" content="[^"]+">/, `${route} should expose modified time`);
  }

  assert.match(read('pages/about.html'), /fail-closed PDF validation/i);
  assert.match(read('pages/contact.html'), /mailto:hello@fitappliance\.com\.au/);
  assert.match(read('pages/privacy.html'), /saved spatial dimensions/i);
  assert.match(read('pages/terms.html'), /manual structural modifications/i);
  assert.match(read('pages/terms.html'), /affiliate links disclosure/i);
});

test('cf submission prep: homepage footer exposes legal routes and reader-supported disclosure', () => {
  const html = read('index.html');
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/contact"/);
  assert.match(
    visibleText(html),
    /FitAppliance is reader-supported\. When you buy through links on our site, we may earn an affiliate commission\./
  );
});

test('cf submission prep: vercel and sitemap infrastructure include the compliance routes', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = vercel.rewrites ?? [];
  for (const route of ['/privacy', '/terms', '/contact']) {
    assert.ok(
      rewrites.some((row) => row.source === route && row.destination === `/pages${route}`),
      `vercel.json should route ${route}`
    );
  }

  const sitemapScript = read('scripts/generate-sitemap.js');
  for (const route of ['/privacy', '/terms', '/contact']) {
    assert.match(sitemapScript, new RegExp(`path:\\s*'${route}'`));
  }
});

test('cf submission prep: Commission Factory manifest is copy-paste ready', () => {
  const manifest = read('reports/cf-application-manifest.md');
  assert.match(manifest, /FitAppliance is an Australian appliance-fit utility/i);
  assert.match(manifest, /Traffic acquisition strategy/i);
  assert.match(manifest, /high-intent/i);
  assert.match(manifest, /hello@fitappliance\.com\.au/);
  assert.doesNotMatch(manifest, /\bguarantee(?:d)? conversion/i);
});
