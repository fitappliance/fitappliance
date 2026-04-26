import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TRUST_PAGES = [
  {
    name: 'About',
    file: 'pages/about.html',
    route: '/about',
    minWords: 800,
    maxWords: 1500,
    schemaType: 'AboutPage'
  },
  {
    name: 'Methodology',
    file: 'pages/methodology.html',
    route: '/methodology',
    minWords: 1500,
    maxWords: Infinity,
    schemaType: 'Article'
  },
  {
    name: 'Editorial Standards',
    file: 'pages/about/editorial-standards.html',
    route: '/about/editorial-standards',
    minWords: 1000,
    maxWords: Infinity,
    schemaType: 'Article'
  }
];

const RED_CLAIM_PHRASES = [
  'State rebates',
  'VEU & ESS rebates calculated',
  'Government Rebates',
  'applicable government rebates',
  'Government rebate eligibility checker',
  'What government rebates are available',
  'Calculates VIC/NSW rebates',
  'ACCC-compliant',
  'GEMS-verified energy ratings',
  'Prices are updated weekly',
  'We update prices weekly'
];

const AI_SLOP_PHRASES = [
  'leverage',
  'synergy',
  'cutting-edge',
  'best-in-class',
  'passionate',
  'dedicated'
];

function readPage(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html) {
  const text = visibleText(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function h2Count(html) {
  return [...html.matchAll(/<h2\b[^>]*>/gi)].length;
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/gi)];
  return blocks.map((match) => JSON.parse(match[1]));
}

function repoUrl() {
  return execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
}

test('phase 47: trust pages meet word-count and section-depth requirements', () => {
  for (const page of TRUST_PAGES) {
    const html = readPage(page.file);
    const count = wordCount(html);
    assert.ok(count >= page.minWords, `${page.name} should have at least ${page.minWords} words; got ${count}`);
    assert.ok(count <= page.maxWords, `${page.name} should have at most ${page.maxWords} words; got ${count}`);
    assert.ok(h2Count(html) >= 5, `${page.name} should include at least five h2 sections`);
  }
});

test('phase 47: trust pages use real project identity links and review metadata', () => {
  const remote = repoUrl();
  for (const page of TRUST_PAGES) {
    const html = readPage(page.file);
    assert.match(html, /Last reviewed/i, `${page.name} should expose Last reviewed text`);
    assert.ok(html.includes(remote), `${page.name} should link to the actual GitHub remote`);
  }
});

test('phase 47: About page uses user-supplied founder and contact facts', () => {
  const html = readPage('pages/about.html');
  assert.ok(html.includes('JZ'), 'About page should name JZ as the public founder signature');
  assert.ok(
    html.includes('mailto:hello@fitappliance.com.au'),
    'About page should include hello@fitappliance.com.au mailto'
  );
  assert.match(visibleText(html), /\bI\b/, 'About page should include first-person founder context');
  assert.match(visibleText(html), /solo|one-person|independent/i, 'About page should disclose solo operation');
});

test('phase 47: trust pages do not reintroduce red claims or AI-sounding filler', () => {
  for (const page of TRUST_PAGES) {
    const html = readPage(page.file);
    const text = visibleText(html);
    for (const phrase of RED_CLAIM_PHRASES) {
      assert.equal(text.includes(phrase), false, `${page.name} reintroduced red claim: ${phrase}`);
    }
    for (const phrase of AI_SLOP_PHRASES) {
      assert.equal(new RegExp(`\\b${phrase}\\b`, 'i').test(text), false, `${page.name} contains filler: ${phrase}`);
    }
  }
});

test('phase 47: trust pages include schema.org JSON-LD with expected types', () => {
  for (const page of TRUST_PAGES) {
    const html = readPage(page.file);
    const schemas = extractJsonLd(html);
    assert.equal(schemas.length, 1, `${page.name} should include one JSON-LD block`);
    const [schema] = schemas;
    assert.equal(schema['@context'], 'https://schema.org', `${page.name} should use schema.org context`);
    assert.equal(schema['@type'], page.schemaType, `${page.name} schema type mismatch`);
    assert.equal(schema.author?.name, 'JZ', `${page.name} author should be JZ`);
    assert.equal(schema.publisher?.name, 'FitAppliance', `${page.name} publisher should be FitAppliance`);
    assert.ok(schema.url?.startsWith('https://www.fitappliance.com.au/'), `${page.name} schema URL should use production host`);
  }
});

test('phase 47: methodology and editorial pages cite real code and data paths', () => {
  const combined = TRUST_PAGES.map((page) => visibleText(readPage(page.file))).join('\n');
  for (const codePath of [
    'public/scripts/search-core.js',
    'scripts/infer-door-swing.js',
    'data/brand-canon.json'
  ]) {
    assert.ok(combined.includes(codePath), `trust copy should cite ${codePath}`);
  }
  const numbers = combined.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) ?? [];
  assert.ok(numbers.length >= 2, 'trust copy should include concrete numbers');
});

test('phase 47: /about is routable and included in sitemap generation', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const rewrites = vercel.rewrites ?? [];
  assert.ok(
    rewrites.some((row) => row.source === '/about' && row.destination === '/pages/about.html'),
    'vercel.json should rewrite /about to pages/about.html'
  );

  const sitemapScript = readPage('scripts/generate-sitemap.js');
  assert.match(sitemapScript, /path:\s*'\/about'/, 'generate-sitemap should include /about as a static page');

  const verifyScript = readPage('scripts/verify-sitemap.js');
  assert.match(verifyScript, /'\/about'/, 'verify-sitemap should expect /about');
});
