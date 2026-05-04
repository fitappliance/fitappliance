import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'public', 'scripts', 'replacement-matcher.mjs');

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
}

const catalog = [
  {
    id: 'westinghouse-wtb4600wa',
    cat: 'fridge',
    brand: 'Westinghouse',
    model: 'WTB4600WA',
    displayName: 'Westinghouse WTB4600WA 460L Top Mount Fridge',
    w: 699,
    h: 1725,
    d: 723
  },
  {
    id: 'lg-washer-fv1409h3v',
    cat: 'washing_machine',
    brand: 'LG',
    model: 'FV1409H3V',
    displayName: 'LG 9kg Front Load Washer',
    w: 600,
    h: 850,
    d: 565
  }
];

test('phase 52 replacement matcher: finds an old appliance by exact model code', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('Westinghouse WTB4600WA', catalog, { category: 'fridge' });

  assert.equal(match?.product.id, 'westinghouse-wtb4600wa');
  assert.equal(match?.confidence, 'high');
});

test('phase 52 replacement matcher: ignores products outside the selected category', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('FV1409H3V', catalog, { category: 'fridge' });

  assert.equal(match, null);
});

test('phase 52 replacement matcher: turns a matched product into cavity dimensions', async () => {
  const { buildReplacementDimensionState } = await loadModule();

  const state = buildReplacementDimensionState(catalog[0]);

  assert.deepEqual(state.dimensions, { w: 699, h: 1725, d: 723 });
  assert.match(state.label, /Westinghouse WTB4600WA/);
  assert.match(state.note, /starting point/i);
});
