import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ringModuleUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'fit-score-ring.js')).href;

async function loadRingModule() {
  return import(`${ringModuleUrl}?cacheBust=${Date.now()}`);
}

test('phase 58 fit score ring renders a 40px SVG with score text', async () => {
  const { renderFitScoreRing } = await loadRingModule();
  const html = renderFitScoreRing(92);

  assert.match(html, /<svg[^>]+class="fit-score-ring fit-score-ring--excellent"/);
  assert.match(html, /viewBox="0 0 40 40"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Fit score 92 out of 100, Excellent fit"/);
  assert.match(html, /<text[^>]+class="fit-score-number"[^>]*>92<\/text>/);
});

test('phase 58 fit score ring maps tier classes', async () => {
  const { renderFitScoreRing } = await loadRingModule();

  assert.match(renderFitScoreRing(89), /fit-score-ring--strong/);
  assert.match(renderFitScoreRing(74), /fit-score-ring--workable/);
  assert.match(renderFitScoreRing(59), /fit-score-ring--tight/);
  assert.match(renderFitScoreRing(39), /fit-score-ring--marginal/);
  assert.match(renderFitScoreRing(0), /fit-score-ring--no-fit/);
});

test('phase 58 fit score card block combines ring and readable label', async () => {
  const { renderFitScoreCardBlock } = await loadRingModule();
  const html = renderFitScoreCardBlock(92);

  assert.match(html, /class="fit-score-block"/);
  assert.match(html, /92/);
  assert.match(html, /Excellent fit/);
});

test('phase 58 fit score ring clamps unsafe values before rendering', async () => {
  const { renderFitScoreRing } = await loadRingModule();

  assert.match(renderFitScoreRing(144), />100<\/text>/);
  assert.match(renderFitScoreRing(-18), />0<\/text>/);
});

test('phase 58 fit score styles define ring tiers and mobile sizing', () => {
  const css = readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

  assert.match(css, /\.fit-score-ring--excellent/);
  assert.match(css, /\.fit-score-ring--no-fit/);
  assert.match(css, /@media\(max-width:660px\)/);
  assert.match(css, /\.fit-score-ring\s*\{\s*width:32px;/);
});
