import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

test('saved appliance picker is available only inside replacement finder', () => {
  assert.match(indexHtml, /data-replacement-finder/);
  assert.match(indexHtml, /data-saved-appliance-picker/);
  assert.match(indexHtml, /Use a saved appliance/);
});

test('homepage search imports account store for saved appliance chips', () => {
  assert.match(indexHtml, /createAccountStore/);
  assert.match(indexHtml, /scripts\/account-store\.mjs/);
  assert.match(indexHtml, /const accountStore = createAccountStore\(\)/);
});

test('saved appliance chips populate replacement search inputs and trigger search', () => {
  assert.match(indexHtml, /function renderSavedApplianceChips/);
  assert.match(indexHtml, /function applySavedApplianceForReplacement/);
  assert.match(indexHtml, /data-saved-appliance-id/);
  assert.match(indexHtml, /setSearchMode\('replacement', \{ force: true, clearDimensions: false \}\)/);
  assert.match(indexHtml, /document\.getElementById\('inW'\)\.value = String\(item\.width\)/);
  assert.match(indexHtml, /doSearch\(\)/);
});

test('saved appliance picker refreshes when search mode or category changes', () => {
  assert.match(indexHtml, /renderSavedApplianceChips\(\);\n\s*if \(scroll\)/);
  assert.match(indexHtml, /renderSavedApplianceChips\(\);\n\s*}/);
});
