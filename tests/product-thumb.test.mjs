import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-thumb.js')
).href;

async function loadModule() {
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test('phase 48 card UX: fridge thumbnail renders SVG with brand label', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'LG', cat: 'fridge' });

  assert.match(html, /viewBox="0 0 120 120"/);
  assert.match(html, /LG/);
  assert.match(html, /data-thumb-category="fridge"/);
  assert.match(html, /M43 26h34v58H43z/);
});

test('phase 48 card UX: all appliance categories have distinct line icons', async () => {
  const { renderProductThumb } = await loadModule();

  assert.match(renderProductThumb({ brand: 'LG', cat: 'fridge' }), /data-thumb-category="fridge"/);
  assert.match(renderProductThumb({ brand: 'LG', cat: 'washing_machine' }), /data-thumb-category="washing_machine"/);
  assert.match(renderProductThumb({ brand: 'LG', cat: 'dryer' }), /data-thumb-category="dryer"/);
  assert.match(renderProductThumb({ brand: 'LG', cat: 'dishwasher' }), /data-thumb-category="dishwasher"/);
});

test('phase 48 card UX: long brand labels are truncated with ellipsis', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'Fisher & Paykel Appliances', cat: 'fridge' });

  assert.match(html, /Fisher &amp; …/);
  assert.doesNotMatch(html, /Fisher &amp; Paykel Appliances/);
});

test('phase 48 card UX: missing brand still renders the product silhouette', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ cat: 'dryer' });

  assert.match(html, /<svg/);
  assert.match(html, /data-thumb-category="dryer"/);
  assert.doesNotMatch(html, /<text[^>]*>\s*</);
});

test('phase 48 card UX: missing category falls back to generic placeholder', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'Asko' });

  assert.match(html, /data-thumb-category="generic"/);
  assert.match(html, /Asko/);
});

test('phase 48 card UX: hostile brand is escaped inside SVG text', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: '<img onerror=alert(1)>', cat: 'fridge' });

  assert.equal(/<img/i.test(html), false);
  assert.equal(/onerror/i.test(html), false);
  assert.match(html, /&lt;img oner…/);
});
