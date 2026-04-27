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

test('phase 48 card polish 2: thumbnail renders a compact brand avatar', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'LG', model: 'GT1S DualInverter', cat: 'fridge' });

  assert.match(html, /viewBox="0 0 80 80"/);
  assert.match(html, /LG/);
  assert.doesNotMatch(html, /GT1S/);
  assert.doesNotMatch(html, /FRIDGE/);
  assert.doesNotMatch(html, /M43 26h34v58H43z/);
});

test('phase 48 card polish 2: brandInitials handles multi-word and single-word brands', async () => {
  const { brandInitials } = await loadModule();

  assert.equal(brandInitials('Fisher & Paykel'), 'FP');
  assert.equal(brandInitials('Bosch'), 'BO');
  assert.equal(brandInitials('LG'), 'LG');
  assert.equal(brandInitials(''), '?');
});

test('phase 48 card polish 2: brandInitials normalizes separators and whitespace', async () => {
  const { brandInitials } = await loadModule();

  assert.equal(brandInitials('  Fisher-Paykel  '), 'FP');
  assert.equal(brandInitials('Westinghouse Australia'), 'WA');
});

test('phase 48 card polish 2: brandInitials keeps short single-word brands readable', async () => {
  const { brandInitials } = await loadModule();

  assert.equal(brandInitials('M'), 'M');
  assert.equal(brandInitials('LG'), 'LG');
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

test('phase 48 card polish 2: empty brand uses the appliance accent fallback', async () => {
  const { brandAccentColor } = await loadModule();

  assert.equal(brandAccentColor(''), brandAccentColor('appliance'));
});

test('phase 48 card polish 2: thumbnail drops duplicated model and category copy', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({
    brand: 'Fisher & Paykel Appliances',
    model: 'RF605QDUVX1 French Door',
    cat: 'fridge'
  });

  assert.match(html, />FP</);
  assert.doesNotMatch(html, /RF605QDUVX/);
  assert.doesNotMatch(html, /FRIDGE/);
  assert.doesNotMatch(html, />Fisher &amp; Paykel Appliances</);
});

test('phase 48 card polish 2: missing brand renders question-mark fallback', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ model: 'ABC123' });

  assert.match(html, />\?</);
  assert.doesNotMatch(html, /ABC123/);
});

test('phase 48 card polish 2: avatar SVG stays compact in byte size', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'Samsung', model: 'SRF7100S', cat: 'fridge' });

  assert.ok(Buffer.byteLength(html, 'utf8') < 600);
});

test('phase 48 card polish 2: avatar no longer emits the old inner card frame', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'LG', model: 'GT1S', cat: 'fridge' });

  assert.doesNotMatch(html, /x="8" y="8" width="104"/);
});

test('phase 48 card polish 2: thumbnail aria label is honest and compact', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: 'Beko', model: 'BFL7510W', cat: 'washing_machine' });

  assert.match(html, /aria-label="Beko product card"/);
  assert.doesNotMatch(html, /BFL7510W/);
});

test('phase 48 card UX: hostile brand is escaped inside SVG text', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: '<img onerror=alert(1)>', model: '<svg onload=1>', cat: 'fridge' });

  assert.equal(/<img/i.test(html), false);
  assert.equal(/<svg onload/i.test(html), false);
  assert.equal(/onerror/i.test(html), false);
  assert.match(html, /&lt;/);
});

test('phase 48 card polish 2: hostile brand does not leak into aria-label verbatim', async () => {
  const { renderProductThumb } = await loadModule();
  const html = renderProductThumb({ brand: '<img onerror=alert(1)>', model: 'ABC123', cat: 'fridge' });

  assert.doesNotMatch(html, /aria-label="&lt;img/);
  assert.match(html, /aria-label="&lt;O product card"/);
});
