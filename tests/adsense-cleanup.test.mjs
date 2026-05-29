import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('polish adsense cleanup: obsolete class-based ad-slot placeholders remain removed', () => {
  const indexHtml = read('index.html');
  const stylesCss = read('public/styles.css');
  const deferredCss = read('public/styles-deferred.css');

  assert.doesNotMatch(indexHtml, /class=["'][^"']*\bad-slot\b/);
  assert.doesNotMatch(stylesCss, /\.ad-slot\b/);
  assert.doesNotMatch(deferredCss, /\.ad-slot\b/);
});

test('polish adsense cleanup: AdSense loads lazily from the helper, not the homepage head', () => {
  const indexHtml = read('index.html');
  const helper = read('public/scripts/adsense-slot.js');

  assert.doesNotMatch(indexHtml, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-7257149597818537/);
  assert.match(helper, /loadAdSenseScript/);
  assert.match(helper, /ca-pub-7257149597818537/);
  assert.match(helper, /crossOrigin\s*=\s*'anonymous'/);
});
