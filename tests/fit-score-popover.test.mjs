import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ringUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'fit-score-ring.js')).href;

async function loadRing() {
  return import(`${ringUrl}?cacheBust=${Date.now()}`);
}

const breakdown = {
  finalScore: 87,
  tightestAxis: 'depth',
  tightestGapMm: 8,
  bindingPenalty: 0.95,
  rows: [
    { axis: 'width', label: 'W', applianceMm: 595, clearanceMm: 10, requiredMm: 605, cavityMm: 640, spareMm: 35, axisScorePercent: 27, weight: 0.4, contribution: 11, isDoubleSided: true },
    { axis: 'height', label: 'H', applianceMm: 1800, clearanceMm: 20, requiredMm: 1820, cavityMm: 1900, spareMm: 80, axisScorePercent: 21, weight: 0.3, contribution: 6, isDoubleSided: false },
    { axis: 'depth', label: 'D', applianceMm: 650, clearanceMm: 10, requiredMm: 660, cavityMm: 668, spareMm: 8, axisScorePercent: 6, weight: 0.3, contribution: 2, isDoubleSided: false }
  ]
};

test('phase 58 score popover wraps score ring in details when breakdown exists', async () => {
  const { renderFitScoreCardBlock } = await loadRing();
  const html = renderFitScoreCardBlock(87, { breakdown });

  assert.match(html, /<details class="fit-score-popover"/);
  assert.match(html, /<summary class="fit-score-summary"/);
  assert.match(html, /class="fit-score-popover__panel"/);
  assert.match(html, /Fit Score 87\/100/);
});

test('phase 58 score popover preserves simple block when breakdown is absent', async () => {
  const { renderFitScoreCardBlock } = await loadRing();
  const html = renderFitScoreCardBlock(87);

  assert.match(html, /class="fit-score-block"/);
  assert.doesNotMatch(html, /fit-score-popover/);
});

test('phase 58 score popover Escape listener closes the open details element', async () => {
  const { bindFitScorePopoverEsc } = await loadRing();
  const dom = new JSDOM(`<details class="fit-score-popover" open><summary>Score</summary></details>`);
  const { document, KeyboardEvent } = dom.window;
  const summary = document.querySelector('summary');

  bindFitScorePopoverEsc(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  assert.equal(document.querySelector('details').open, false);
  assert.equal(document.activeElement, summary);
});
