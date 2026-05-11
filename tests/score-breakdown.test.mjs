import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'score-breakdown.js')).href;

async function loadModule() {
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

function makeProduct(overrides = {}) {
  return {
    w: 550,
    h: 1410,
    d: 490,
    fitScoreNumeric: 92,
    fitAxisGaps: [
      { axis: 'width', label: 'W', cavity: 600, appliance: 550, clearanceMm: 10, gapMm: 40 },
      { axis: 'height', label: 'H', cavity: 1900, appliance: 1410, clearanceMm: 20, gapMm: 470 },
      { axis: 'depth', label: 'D', cavity: 650, appliance: 490, clearanceMm: 10, gapMm: 150 }
    ],
    ...overrides
  };
}

test('phase 58 score breakdown computes axis math from existing fit gaps', async () => {
  const { computeBreakdown } = await loadModule();
  const breakdown = computeBreakdown(makeProduct());

  assert.equal(breakdown.rows.length, 3);
  assert.deepEqual(
    breakdown.rows.map((row) => [row.axis, row.applianceMm, row.clearanceMm, row.requiredMm, row.cavityMm, row.spareMm]),
    [
      ['width', 550, 10, 560, 600, 40],
      ['height', 1410, 20, 1430, 1900, 470],
      ['depth', 490, 10, 500, 650, 150]
    ]
  );
  assert.equal(breakdown.tightestAxis, 'width');
  assert.equal(breakdown.tightestGapMm, 40);
  assert.equal(breakdown.finalScore, 92);
});

test('phase 58 score breakdown derives rows from product cavity and clearance when fit gaps are absent', async () => {
  const { computeBreakdown } = await loadModule();
  const breakdown = computeBreakdown(
    { w: 595, h: 1800, d: 650 },
    { w: 600, h: 1900, d: 700 },
    { sides: 5, top: 20, rear: 10 }
  );

  assert.equal(breakdown.rows[0].axis, 'width');
  assert.equal(breakdown.rows[0].clearanceMm, 10);
  assert.equal(breakdown.rows[0].spareMm, -5);
  assert.equal(breakdown.finalScore, 0);
});

test('phase 58 score breakdown renders table and tooltip context', async () => {
  const { computeBreakdown, renderBreakdownHtml } = await loadModule();
  const html = renderBreakdownHtml(computeBreakdown(makeProduct()), 92);

  assert.match(html, /Fit Score 92\/100/);
  assert.match(html, /Appliance \+ clearance/);
  assert.match(html, /Binding: width 40mm/);
  assert.match(html, /metric-tooltip/);
  assert.match(html, /both sides/);
});

test('phase 58 score breakdown renders empty state without dimensions', async () => {
  const { renderBreakdownHtml } = await loadModule();
  const html = renderBreakdownHtml({ rows: [] }, 0);

  assert.match(html, /Enter all three cavity dimensions/);
});
