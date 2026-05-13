import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const deferredCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');
const productCardJs = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js'), 'utf8');
const retailerModalJs = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'ui', 'retailer-modal.js'), 'utf8');

test('purchase tracking records pending assets before buy-click analytics', () => {
  assert.match(indexHtml, /function recordPendingPurchaseFromLink/);
  assert.match(indexHtml, /accountStore\.recordPendingAsset/);
  assert.match(indexHtml, /recordPendingPurchaseFromLink\(link\);\n\s*trackBuyClick/);
});

test('asset capture prompt can confirm or dismiss a pending purchase', () => {
  assert.match(indexHtml, /data-asset-capture/);
  assert.match(indexHtml, /Did you purchase/);
  assert.match(indexHtml, /Add it to My Appliances/);
  assert.match(indexHtml, /accountStore\.confirmPendingAsset/);
  assert.match(indexHtml, /accountStore\.dismissPendingAsset/);
});

test('retailer links carry enough product metadata for pending inventory capture', () => {
  assert.match(productCardJs, /data-buy-click="1"/);
  assert.match(productCardJs, /data-product-id=/);
  assert.match(productCardJs, /data-target-url=/);
  assert.match(retailerModalJs, /data-target-url=/);
});

test('asset capture prompt uses utilitarian fixed notification styles', () => {
  assert.match(deferredCss, /\.asset-capture-toast/);
  assert.match(deferredCss, /\.asset-capture-toast__actions/);
  assert.match(indexHtml, /data-asset-confirm/);
  assert.match(indexHtml, /data-asset-dismiss/);
});
