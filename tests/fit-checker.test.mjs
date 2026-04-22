import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'public', 'scripts', 'fit-checker.js');
const appliancesPath = path.join(repoRoot, 'public', 'data', 'appliances.json');
const require = createRequire(import.meta.url);

function loadFitCheckerModule() {
  return require(scriptPath);
}

function loadProducts() {
  const document = JSON.parse(fs.readFileSync(appliancesPath, 'utf8'));
  return Array.isArray(document.products) ? document.products : [];
}

test('phase 25 fit-checker: 600x850x600 returns at least one real appliance match', async () => {
  const module = loadFitCheckerModule();
  const products = loadProducts();
  const matches = module.findMatches(products, { w: 600, h: 850, d: 600 });

  assert.ok(matches.length >= 1, 'expected at least one match for 600x850x600');
  assert.equal(typeof matches[0].slug, 'string');
  assert.ok(matches[0].url.startsWith('/?cat='));
});

test('phase 25 fit-checker: 1x1x1 returns no match and friendly no-match message', async () => {
  const module = loadFitCheckerModule();
  const products = loadProducts();
  const dom = new JSDOM('<main><p id="fitMessage"></p><div id="fitResults"></div></main>');
  const messageEl = dom.window.document.getElementById('fitMessage');
  const resultsEl = dom.window.document.getElementById('fitResults');
  const matches = module.findMatches(products, { w: 1, h: 1, d: 1 });

  module.renderResults({
    matches,
    dims: { w: 1, h: 1, d: 1 },
    resultsEl,
    messageEl
  });

  assert.equal(matches.length, 0);
  assert.match(String(messageEl.textContent), /no match/i);
});

test('phase 25 fit-checker: non-numeric input is handled safely with friendly validation text', async () => {
  const module = loadFitCheckerModule();
  let result;
  assert.doesNotThrow(() => {
    result = module.validateDimensions({
      w: 'abc',
      h: '850',
      d: ''
    });
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /valid.*number/i);
});

test('phase 25 fit-checker: script stays below 10KB gzip', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const gzipped = zlib.gzipSync(source);
  assert.ok(gzipped.length < 10 * 1024, `expected <10KB gzip, got ${gzipped.length} bytes`);
});

test('phase 25 fit-checker: homepage and cavity pages have static Try the fit checker link', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  assert.match(indexHtml, /href="\/tools\/fit-checker"/);

  const cavityRoot = path.join(repoRoot, 'pages', 'cavity');
  const cavityFiles = fs.readdirSync(cavityRoot).filter((name) => name.endsWith('.html'));
  for (const file of cavityFiles) {
    const html = fs.readFileSync(path.join(cavityRoot, file), 'utf8');
    assert.match(html, /href="\/tools\/fit-checker"/, `${file} should link to /tools/fit-checker`);
  }
});

test('phase 25 fit-checker: tools page exposes SoftwareApplication and HowTo schema', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'pages', 'tools', 'fit-checker.html'), 'utf8');
  assert.match(html, /"@type":\s*"SoftwareApplication"/);
  assert.match(html, /"@type":\s*"HowTo"/);
});

test('phase 25 fit-checker: vercel rewrite exists for /tools/:slug', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rewrite = (config.rewrites ?? []).find((row) => row.source === '/tools/:slug');
  assert.ok(rewrite, 'missing /tools/:slug rewrite');
  assert.equal(rewrite.destination, '/pages/tools/:slug.html');
});

test('phase 25 fit-checker: script avoids console.log statements', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /console\.log\(/);
});

test('phase 43a quick wins: recent-query chips escape localStorage-controlled category labels', () => {
  const module = loadFitCheckerModule();
  const dom = new JSDOM('<main><div id="recent"></div></main>');
  const listEl = dom.window.document.getElementById('recent');

  module.renderRecentQueries(listEl, [{
    cat: '<img src=x onerror=alert(1)>',
    w: 600,
    h: 850,
    d: 600
  }]);

  assert.equal(listEl.querySelectorAll('button.recent-chip').length, 1);
  assert.equal(listEl.querySelectorAll('img').length, 0);
  assert.equal(listEl.querySelector('[onerror]'), null);
});
