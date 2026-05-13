import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const styles = [
  fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8')
].join('\n');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

function makeReplacementProduct(overrides = {}) {
  return {
    id: 'replacement-hisense',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 550,
    h: 1410,
    d: 490,
    stars: 5,
    features: ['Top Mount'],
    fitScoreNumeric: null,
    searchMode: 'replacement',
    requiredCavityMm: { w: 560, h: 1430, d: 500 },
    sizeMatchGaps: { w: 50, h: 490, d: 160 },
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-hrtf206' }],
    ...overrides
  };
}

test('dual-mode UI: homepage exposes clear cavity and replacement search mode choices', () => {
  assert.match(indexHtml, /name="searchMode"/);
  assert.match(indexHtml, /value="cavity"/);
  assert.match(indexHtml, /value="replacement"/);
  assert.match(indexHtml, /I measured my empty cavity/);
  assert.match(indexHtml, /I measured my old appliance/);
  assert.match(indexHtml, /data-float-search-mode="cavity"/);
  assert.match(indexHtml, /data-float-search-mode="replacement"/);
});

test('dual-mode UI: search mode state is read from controls before running a search', () => {
  assert.match(indexHtml, /function\s+readSearchModeFromControls/);
  assert.match(indexHtml, /currentSearchMode\s*=\s*readSearchModeFromControls\(\)/);
  assert.match(indexHtml, /function\s+syncSearchModeControls/);
});

test('dual-mode UI: old-appliance lookup is hidden by default and bound to replacement mode', () => {
  assert.match(indexHtml, /data-replacement-finder[^>]*hidden/);
  assert.match(indexHtml, /replacementFinder\.hidden\s*=\s*mode\s*!==\s*'replacement'/);
});

test('dual-mode UI: hero title and dimension labels use mode-specific terminology', () => {
  assert.match(indexHtml, /Enter your old appliance details/);
  assert.match(indexHtml, /Enter your available cavity space/);
  assert.match(indexHtml, /OLD MACHINE WIDTH/);
  assert.match(indexHtml, /OLD MACHINE HEIGHT/);
  assert.match(indexHtml, /OLD MACHINE DEPTH/);
  assert.match(indexHtml, /CAVITY WIDTH/);
  assert.match(indexHtml, /CAVITY HEIGHT/);
  assert.match(indexHtml, /CAVITY DEPTH/);
});

test('dual-mode UI: switching modes clears incompatible dimension inputs', () => {
  assert.match(indexHtml, /function\s+clearDimensionInputsForModeSwitch/);
  assert.match(indexHtml, /clearDimensionInputsForModeSwitch\(\)/);
  assert.match(indexHtml, /replacementStatus\.textContent\s*=\s*''/);
});

test('dual-mode card: replacement rows show size match instead of numeric fit score', async () => {
  const { buildRow } = await import(`${productCardModuleUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeReplacementProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Size Match/);
  assert.match(html, /class="size-match-badge"/);
  assert.match(html, /Requires minimum cavity/);
  assert.match(html, /560W × 1430H × 500D/);
  assert.match(html, /safe ventilation/);
  assert.doesNotMatch(html, /fit-score-block|fit-score-popover|fit-score-ring/);
});

test('dual-mode card: cavity rows keep the numeric fit score and skip replacement copy', async () => {
  const { buildRow } = await import(`${productCardModuleUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeReplacementProduct({
    searchMode: 'cavity',
    fitScoreNumeric: 92
  }), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /fit-score-popover/);
  assert.doesNotMatch(html, /Size Match/);
  assert.doesNotMatch(html, /Requires minimum cavity/);
});

test('dual-mode UI: styles define search mode controls and replacement card treatment', () => {
  assert.match(styles, /\.search-mode-toggle/);
  assert.match(styles, /\.search-mode-option/);
  assert.match(styles, /\.size-match-badge/);
  assert.match(styles, /\.replacement-cavity-alert/);
});
