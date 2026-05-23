import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('adsense manual slots reserve layout space before ads load', () => {
  const styles = read('public/styles.css');
  const helper = read('public/scripts/adsense-slot.js');

  assert.match(styles, /\.ad-unit\s*\{/);
  assert.match(styles, /min-height:\s*var\(--ad-unit-min-height,\s*280px\)/);
  assert.match(styles, /display:\s*block/);
  assert.match(helper, /adsbygoogle/);
  assert.match(helper, /ADSENSE_CLIENT\s*=\s*'ca-pub-7257149597818537'/);
});

test('adsense manual slots are only injected into approved safe zones', () => {
  const indexHtml = read('index.html');
  const searchDom = read('public/scripts/search-dom.js');
  const productCard = read('public/scripts/ui/product-card.js');

  assert.match(indexHtml, /data-adsense-placement="footer-top"/);
  assert.match(searchDom, /data-adsense-placement="zero-results"/);
  assert.doesNotMatch(indexHtml, /ad-side/);
  assert.doesNotMatch(productCard, /adsbygoogle|data-adsense-placement|ad-unit/);
});

test('long-form informational pages include content-layer manual ad slots', () => {
  const about = read('pages/about.html');
  const methodology = read('pages/methodology.html');
  const guideGenerator = read('scripts/generate-guides.js');

  assert.match(about, /data-adsense-placement="about-content"/);
  assert.match(methodology, /data-adsense-placement="methodology-content"/);
  assert.match(guideGenerator, /data-adsense-placement="guide-content"/);
});
