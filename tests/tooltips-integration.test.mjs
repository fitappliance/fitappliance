import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tooltipUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'tooltips-dictionary.js')).href;

async function loadTooltips() {
  return import(`${tooltipUrl}?cacheBust=${Date.now()}`);
}

test('phase 58 tooltips dictionary exposes the required technical terms', async () => {
  const { FIT_TOOLTIPS } = await loadTooltips();
  const keys = Object.keys(FIT_TOOLTIPS).sort();

  assert.deepEqual(keys, [
    'binding-axis',
    'door-swing-radius',
    'fit-score',
    'manufacturer-clearance',
    'practical-buffer',
    'rear-clearance',
    'side-clearance',
    'top-clearance'
  ]);
});

test('phase 58 tooltips render accessible inline help without raw bright-blue links', async () => {
  const { renderTooltipHtml } = await loadTooltips();
  const html = renderTooltipHtml('rear-clearance');

  assert.match(html, /class="metric-tooltip"/);
  assert.match(html, /role="button"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Rear gap behind the appliance/);
});

test('phase 58 tooltip and score popover styles are present', () => {
  const css = readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

  assert.match(css, /\.fit-score-popover__panel/);
  assert.match(css, /\.score-breakdown__table/);
  assert.match(css, /\.metric-tooltip__bubble/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
});
