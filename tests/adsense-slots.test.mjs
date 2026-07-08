import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('adsense helper keeps manual slot ids available for post-review reinstatement', () => {
  const styles = read('public/styles.css');
  const helper = read('public/scripts/adsense-slot.js');

  assert.match(styles, /\.ad-unit\s*\{/);
  assert.match(helper, /adsbygoogle/);
  assert.match(helper, /ADSENSE_CLIENT\s*=\s*'ca-pub-7257149597818537'/);
  assert.match(helper, /'footer-top': '7748816473'/);
  assert.match(helper, /'zero-results': '3809571463'/);
  assert.match(helper, /'guide-content': '7780228766'/);
  assert.doesNotMatch(helper, /PENDING_[A-Z_]+_SLOT_ID/);
});

test('adsense manual slots are not prerendered on affiliate review surfaces', () => {
  const indexHtml = read('index.html');
  const searchDom = read('public/scripts/search-dom.js');
  const productCard = read('public/scripts/ui/product-card.js');

  assert.doesNotMatch(indexHtml, /data-adsense-placement="footer-top"/);
  assert.doesNotMatch(searchDom, /data-adsense-placement="zero-results"/);
  assert.doesNotMatch(indexHtml, /ad-side/);
  assert.doesNotMatch(productCard, /adsbygoogle|data-adsense-placement|ad-unit/);
});

test('long-form informational pages avoid static ad placeholders during affiliate review', () => {
  const about = read('pages/about.html');
  const methodology = read('pages/methodology.html');
  const guideGenerator = read('scripts/generate-guides.js');
  const handbookGuide = read('pages/guides/appliance-fit-sizing-handbook.html');

  assert.doesNotMatch(about, /data-adsense-placement="about-content"/);
  assert.doesNotMatch(methodology, /data-adsense-placement="methodology-content"/);
  assert.doesNotMatch(guideGenerator, /data-adsense-placement="guide-content"/);
  assert.doesNotMatch(handbookGuide, /data-adsense-placement="guide-content"/);
});
