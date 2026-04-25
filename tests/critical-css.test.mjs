import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'index.html');
const DEFERRED_PATH = path.join(ROOT, 'public', 'styles-deferred.css');
const EXISTING_STYLES_PATH = path.join(ROOT, 'public', 'styles.css');

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

function readDeferred() {
  return fs.existsSync(DEFERRED_PATH) ? fs.readFileSync(DEFERRED_PATH, 'utf8') : '';
}

function readCombinedCss() {
  const html = readIndex();
  const inline = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const existing = fs.existsSync(EXISTING_STYLES_PATH) ? fs.readFileSync(EXISTING_STYLES_PATH, 'utf8') : '';
  return `${inline}\n${existing}\n${readDeferred()}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorRegex(selector) {
  return new RegExp(`${escapeRegExp(selector)}\\s*\\{`);
}

test('phase 43a critical-css: inline style block stays under 14KB', () => {
  const inline = readIndex().match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  assert.ok(Buffer.byteLength(inline, 'utf8') < 14_000);
});

test('phase 43a critical-css: deferred stylesheet exists and carries the non-critical bulk', () => {
  const deferred = readDeferred();
  assert.ok(fs.existsSync(DEFERRED_PATH), 'styles-deferred.css should exist');
  assert.ok(Buffer.byteLength(deferred, 'utf8') > 20_000, 'deferred CSS should carry most moved rules');
});

test('phase 43a critical-css: above-fold selectors remain inline', () => {
  const inline = readIndex().match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  for (const selector of [':root', 'html', 'body', '.topbar', 'nav', '.hero', '.search-card', '.cat-pills', '.dim-grid', '.field-wrap', '.btn-search']) {
    assert.match(inline, selectorRegex(selector), `${selector} should stay inline`);
  }
});

test('phase 43a critical-css: below-fold selectors move to deferred CSS', () => {
  const deferred = readDeferred();
  for (const selector of ['.results-wrap', '.p-card', '.sidebar', '.how-sec', '.footer-grid', '.toast', '.compare-modal', '.retailer-modal']) {
    assert.match(deferred, selectorRegex(selector), `${selector} should be deferred`);
  }
});

test('phase 43a critical-css: deferred stylesheet loads with preload and noscript fallback', () => {
  const html = readIndex();
  assert.equal((html.match(/rel="preload" href="\/styles-deferred\.css" as="style"/g) ?? []).length, 1);
  assert.match(html, /onload="this\.onload=null;this\.rel='stylesheet'"/);
  assert.match(html, /<noscript><link rel="stylesheet" href="\/styles-deferred\.css"><\/noscript>/);
});

test('phase 43a critical-css: inline critical CSS appears before deferred preload', () => {
  const html = readIndex();
  const inlineIndex = html.indexOf('<style>');
  const preloadIndex = html.indexOf('href="/styles-deferred.css"');
  assert.ok(inlineIndex >= 0, 'inline critical CSS should exist');
  assert.ok(preloadIndex >= 0, 'deferred preload should exist');
  assert.ok(inlineIndex < preloadIndex, 'critical inline CSS should be parsed before preload');
});

test('phase 43a critical-css: existing small stylesheet hook remains available', () => {
  assert.match(readIndex(), /<link rel="stylesheet" href="\/styles\.css">/);
});

test('phase 43a critical-css: homepage class names are covered by inline, existing, or deferred CSS', () => {
  const dom = new JSDOM(readIndex());
  const classNames = new Set();
  dom.window.document.querySelectorAll('[class]').forEach((element) => {
    for (const className of String(element.className).split(/\s+/)) {
      if (className) classNames.add(className);
    }
  });

  const css = readCombinedCss();
  const missing = [...classNames].filter((className) => {
    const pattern = new RegExp(`\\.${escapeRegExp(className)}(?:[^a-zA-Z0-9_-]|$)`);
    return !pattern.test(css);
  });

  assert.deepEqual(missing, []);
});
