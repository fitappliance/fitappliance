import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

test('phase 55 clearance bars: spare room selects semantic color classes', async () => {
  const { deriveClearanceBarPresentation } = await import(productCardModuleUrl);

  assert.equal(deriveClearanceBarPresentation({ cavity: 600, appliance: 570, clearanceMm: 0 }).tone, 'green');
  assert.equal(deriveClearanceBarPresentation({ cavity: 600, appliance: 590, clearanceMm: 0 }).tone, 'amber');
  assert.equal(deriveClearanceBarPresentation({ cavity: 600, appliance: 597, clearanceMm: 0 }).tone, 'red');
  assert.equal(deriveClearanceBarPresentation({ cavity: 600, appliance: 605, clearanceMm: 0 }).tone, 'red');
});

test('phase 55 clearance bars: negative spare room is marked striped', async () => {
  const { deriveClearanceBarPresentation } = await import(productCardModuleUrl);

  const result = deriveClearanceBarPresentation({ cavity: 600, appliance: 605, clearanceMm: 0 });
  assert.equal(result.striped, true);
  assert.equal(result.spareMm, -5);
});

test('phase 55 clearance bars: fill width uses product plus clearance against cavity', async () => {
  const { deriveClearanceBarPresentation } = await import(productCardModuleUrl);

  const result = deriveClearanceBarPresentation({ cavity: 600, appliance: 580, clearanceMm: 10 });
  assert.equal(result.fillPercent, 98);
  assert.equal(result.spareMm, 10);
});
