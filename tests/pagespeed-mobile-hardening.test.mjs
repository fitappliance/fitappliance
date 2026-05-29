import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadVercelConfig() {
  return JSON.parse(read('vercel.json'));
}

function cspHeader() {
  const globalRule = loadVercelConfig().headers.find((rule) => rule.source === '/(.*)');
  return globalRule.headers.find((header) => header.key === 'Content-Security-Policy').value;
}

test('mobile PageSpeed: homepage avoids render-blocked external font stylesheet', () => {
  const html = read('index.html');

  assert.doesNotMatch(html, /fonts\.googleapis\.com\/css2/);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
});

test('mobile PageSpeed: AdSense is hydrated lazily instead of loaded from the head', () => {
  const html = read('index.html');
  const helper = read('public/scripts/adsense-slot.js');

  assert.doesNotMatch(html, /<script[^>]+pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
  assert.match(helper, /loadAdSenseScript/);
  assert.match(helper, /IntersectionObserver/);
});

test('mobile PageSpeed: favicon and space alert semantics do not generate browser or ARIA errors', () => {
  const html = read('index.html');

  assert.match(html, /<link rel="icon"[^>]+href="\/icons\/icon-192\.png"/);
  assert.match(html, /id="spaceAlerts"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.doesNotMatch(html, /id="spaceAlerts"[^>]+aria-label=/);
});

test('mobile PageSpeed: CSP allows AdSense quality checks without opening wildcard script hosts', () => {
  const csp = cspHeader();

  assert.match(csp, /connect-src[^;]*https:\/\/\*\.adtrafficquality\.google/);
  assert.doesNotMatch(csp, /script-src[^;]*https:\/\/\*\.adtrafficquality\.google/);
});
