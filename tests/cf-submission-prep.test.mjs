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

test('cf submission prep: required review routes exist with corporate contact and disclaimers', () => {
  for (const route of ['about', 'privacy', 'terms', 'contact', 'partners']) {
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
  const partners = read('pages/partners.html');
  assert.match(partners, /advertiser review/i);
  assert.match(partners, /organic search/i);
  assert.match(partners, /no unsolicited email/i);
  assert.match(partners, /no brand bidding/i);
  assert.match(partners, /hello@fitappliance\.com\.au/);
  assert.match(partners, /Google Search Console/i);
  assert.match(partners, /28\+ days/i);
  assert.match(partners, /471 web search clicks/i);
  assert.match(partners, /2,185 indexed pages/i);
});

test('cf submission prep: homepage footer exposes legal routes and reader-supported disclosure', () => {
  const html = read('index.html');
  assert.match(
    html,
    /<meta name="commission-factory-verification" content="80a2b938ce344403a5bf0c76f4612d0c" \/>/
  );
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /href="\/partners"/);
  assert.match(
    visibleText(html),
    /FitAppliance is reader-supported\. When you buy through links on our site, we may earn an affiliate commission\./
  );
  assert.match(visibleText(html), /ABN:? 46 168 974 169/);
  assert.match(html, /mailto:hello@fitappliance\.com\.au"/);
  assert.doesNotMatch(visibleText(html), /\b\d+(?:\.\d+)?%\s*(?:commission|CPA|·)/i);
  assert.doesNotMatch(visibleText(html), /Commission Factory/i);
  assert.doesNotMatch(html, /coming soon/i);
  const imageTags = [...html.matchAll(/<img\b[^>]*src="\/og-images\/[^"]+\.(?:png|webp)"[^>]*>/gi)];
  assert.ok(imageTags.length >= 4, `homepage should expose quality appliance imagery; found ${imageTags.length}`);
});

test('cf submission prep: review surfaces do not show empty advertising placeholders', () => {
  const reviewPages = [
    'index.html',
    'pages/about.html',
    'pages/methodology.html',
    'pages/partners.html',
    'pages/guides/appliance-fit-sizing-handbook.html',
    'pages/guides/fridge-clearance-requirements.html',
  ];

  for (const pagePath of reviewPages) {
    const html = read(pagePath);
    assert.doesNotMatch(html, /data-adsense-unit/i, `${pagePath} should not prerender an AdSense unit during affiliate review`);
    assert.doesNotMatch(html, /<ins\b[^>]*class="adsbygoogle"/i, `${pagePath} should not prerender an adsbygoogle placeholder`);
    assert.doesNotMatch(html, /aria-label="Advertisement"/i, `${pagePath} should not expose an empty Advertisement landmark`);
    assert.doesNotMatch(html, /<div class="ad-unit__label">Advertisement<\/div>/i, `${pagePath} should not expose an empty Advertisement label`);
  }
});

test('cf submission prep: subscribe route is an opt-in form, not a premature confirmation page', () => {
  const subscribe = read('pages/subscribe.html');
  const subscribeText = visibleText(subscribe);

  assert.match(subscribe, /<form\b[^>]*class="[^"]*\bsubscribe-form\b/i);
  assert.match(subscribe, /name="email"/i);
  assert.match(subscribe, /action="\/api\/subscribe"/i);
  assert.match(subscribeText, /one-click unsubscribe/i);
  assert.doesNotMatch(subscribeText, /^Check your inbox\b/i);

  assert.ok(fs.existsSync(path.join(ROOT, 'pages', 'subscribe', 'thanks.html')));
  const thanks = read('pages/subscribe/thanks.html');
  assert.match(visibleText(thanks), /Check your inbox/i);
  assert.doesNotMatch(thanks, /<form\b[^>]*class="[^"]*\bsubscribe-form\b/i);
  assert.match(thanks, /<meta name="robots" content="noindex, follow">/i);
});

test('cf submission prep: reviewer and legal pages expose the same business identity', () => {
  const reviewerPages = [
    'pages/about.html',
    'pages/contact.html',
    'pages/privacy.html',
    'pages/terms.html',
    'pages/partners.html',
    'pages/affiliate-disclosure.html',
    'pages/about/editorial-standards.html',
  ];

  for (const pagePath of reviewerPages) {
    const html = read(pagePath);
    const text = visibleText(html);
    assert.match(text, /hello@fitappliance\.com\.au/, `${pagePath} should expose the domain contact mailbox`);
    if (!pagePath.endsWith('/editorial-standards.html')) {
      assert.match(html, /mailto:hello@fitappliance\.com\.au/, `${pagePath} should link the domain contact mailbox`);
    }
    assert.match(text, /ABN:? 46 168 974 169/, `${pagePath} should expose the FitAppliance ABN`);
  }
});

test('cf submission prep: vercel and sitemap infrastructure include the compliance routes', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = vercel.rewrites ?? [];
  const requiredRewrites = new Map([
    ['/privacy', '/pages/privacy'],
    ['/terms', '/pages/terms'],
    ['/contact', '/pages/contact'],
    ['/partners', '/pages/partners'],
    ['/subscribe/thanks', '/pages/subscribe/thanks'],
  ]);
  for (const [source, destination] of requiredRewrites) {
    assert.ok(
      rewrites.some((row) => row.source === source && row.destination === destination),
      `vercel.json should route ${source}`
    );
  }

  const sitemapScript = read('scripts/generate-sitemap.js');
  for (const route of ['/privacy', '/terms', '/contact', '/partners']) {
    assert.match(sitemapScript, new RegExp(`path:\\s*'${route}'`));
  }

  const indexabilityPolicy = JSON.parse(read('data/indexability-policy.json'));
  assert.ok(
    indexabilityPolicy.rules?.some((rule) => rule.match === 'exact' && rule.route === '/partners' && rule.action === 'index'),
    'indexability policy should allow /partners in the generated sitemap'
  );
});

test('cf submission prep: Commission Factory manifest is copy-paste ready', () => {
  const manifest = read('reports/cf-application-manifest.md');
  assert.match(manifest, /FitAppliance is an Australian appliance-fit utility/i);
  assert.match(manifest, /Traffic acquisition strategy/i);
  assert.match(manifest, /Search Console evidence/i);
  assert.match(manifest, /28\+ days/i);
  assert.match(manifest, /471 web search clicks/i);
  assert.match(manifest, /2,185 indexed pages/i);
  assert.match(manifest, /high-intent/i);
  assert.match(manifest, /hello@fitappliance\.com\.au/);
  assert.doesNotMatch(manifest, /\bguarantee(?:d)? conversion/i);
});
