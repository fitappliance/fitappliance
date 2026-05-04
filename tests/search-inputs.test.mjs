import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'public', 'scripts', 'search-inputs.mjs');

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
}

test('phase 52 input guidance: centimetre-like dimensions are converted to millimetres', async () => {
  const { normalizeSearchDimensions } = await loadModule();

  const normalized = normalizeSearchDimensions({ w: '60', h: '190', d: '65', door: '82' });

  assert.deepEqual(normalized.values, { w: 600, h: 1900, d: 650, door: 820 });
  assert.equal(normalized.converted, true);
  assert.match(normalized.message, /600×1900×650mm/);
  assert.match(normalized.message, /doorway 820mm/);
});

test('phase 52 input guidance: millimetre values remain unchanged', async () => {
  const { normalizeSearchDimensions } = await loadModule();

  const normalized = normalizeSearchDimensions({ w: '600', h: '1900', d: '650', door: '820' });

  assert.deepEqual(normalized.values, { w: 600, h: 1900, d: 650, door: 820 });
  assert.equal(normalized.converted, false);
  assert.equal(normalized.message, '');
});

test('phase 52 input guidance: empty optional doorway remains null', async () => {
  const { normalizeSearchDimensions } = await loadModule();

  const normalized = normalizeSearchDimensions({ w: '600', h: '1900', d: '650', door: '' });

  assert.deepEqual(normalized.values, { w: 600, h: 1900, d: 650, door: null });
});
