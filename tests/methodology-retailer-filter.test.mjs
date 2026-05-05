import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('phase 48 methodology: documents retailer-verified default and showAll escape hatch', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'pages', 'methodology.html'), 'utf8');

  assert.match(html, /Why we filter to retailer-verified products by default/);
  assert.match(html, /searchWithFacets/);
  assert.match(html, /retailers<\/code> array by default/);
  assert.match(html, /\?showAll=1/);
  assert.match(html, /66 of 2,188 raw catalog products/);
  assert.match(html, /139 verified retailer product-page links/);
  assert.match(html, /link-coverage metric/);
});
