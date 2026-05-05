import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('polish adsense cleanup: manual ad-slot placeholders are removed from homepage and styles', () => {
  const indexHtml = read('index.html');
  const stylesCss = read('public/styles.css');
  const deferredCss = read('public/styles-deferred.css');

  assert.doesNotMatch(indexHtml, /ad-slot/);
  assert.doesNotMatch(stylesCss, /ad-slot/);
  assert.doesNotMatch(deferredCss, /ad-slot/);
});

test('polish adsense cleanup: AdSense verification script remains in the homepage head', () => {
  const indexHtml = read('index.html');

  assert.match(indexHtml, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-7257149597818537/);
  assert.match(indexHtml, /crossorigin="anonymous"/);
});
