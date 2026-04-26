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

test('phase 48 card polish: thumbnail renders an information card with brand and model', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'LG', model: 'GT1S DualInverter', cat: 'fridge' });

  assert.match(html, /viewBox="0 0 120 120"/);
  assert.match(html, /LG/);
  assert.match(html, /GT1S DualI…/);
  assert.match(html, /FRIDGE/);
  assert.doesNotMatch(html, /M43 26h34v58H43z/);
});

test('phase 48 card polish: category labels match compact product-card language', async () => {
  const { categoryLabel } = await loadModule();

  assert.equal(categoryLabel('fridge'), 'FRIDGE');
  assert.equal(categoryLabel('washing_machine'), 'WASHER');
  assert.equal(categoryLabel('dryer'), 'DRYER');
  assert.equal(categoryLabel('dishwasher'), 'D/WASHER');
  assert.equal(categoryLabel('other'), 'APPLIANCE');
});

test('phase 48 card polish: same brand gets stable accent and different brands differ', async () => {
  const { brandAccentColor } = await loadModule();

  assert.equal(brandAccentColor('LG'), brandAccentColor('LG'));
  assert.notEqual(brandAccentColor('LG'), brandAccentColor('Samsung'));
});

test('phase 48 card polish: brand accent is case-insensitive', async () => {
  const { brandAccentColor } = await loadModule();

  assert.equal(brandAccentColor('Bosch'), brandAccentColor('bosch'));
});

test('phase 48 card polish: long brand and model labels are truncated with ellipsis', async () => {
  const { renderProductThumb, shortModelLabel } = await loadModule();
  const html = renderProductThumb({
    brand: 'Fisher & Paykel Appliances',
    model: 'RF605QDUVX1 French Door',
    cat: 'fridge'
  });

  assert.equal(shortModelLabel('RF605QDUVX1 French Door'), 'RF605QDUVX…');
  assert.match(html, /Fisher &amp; …/);
  assert.match(html, /RF605QDUVX…/);
  assert.doesNotMatch(html, /Fisher &amp; Paykel Appliances/);
});

test('phase 48 card polish: missing brand and category render useful fallback labels', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ model: 'ABC123' });

  assert.match(html, />Brand</);
  assert.match(html, /ABC123/);
  assert.match(html, /APPLIANCE/);
});

test('phase 48 card polish: missing model does not render an empty text node', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'LG', cat: 'dryer' });

  assert.match(html, /LG/);
  assert.match(html, /DRYER/);
  assert.doesNotMatch(html, /<text[^>]*>\s*<\/text>/);
});

test('phase 48 card polish: thumbnail aria label carries brand model and category context', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'Beko', model: 'BFL7510W', cat: 'washing_machine' });

  assert.match(html, /aria-label="Beko BFL7510W WASHER appliance card"/);
});

test('phase 48 card UX: hostile brand is escaped inside SVG text', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: '<img onerror=alert(1)>', model: '<svg onload=1>', cat: 'fridge' });

  assert.equal(/<img/i.test(html), false);
  assert.equal(/<svg onload/i.test(html), false);
  assert.equal(/onerror/i.test(html), false);
  assert.match(html, /&lt;img oner…/);
});
