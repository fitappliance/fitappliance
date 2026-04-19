import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { generateMeasurementSvg } = require('../scripts/generate-measurement-svg.js');
const {
  buildMeasurementHowToJsonLd,
  loadMeasurementSteps
} = require('../scripts/generate-measurement-content.js');

test('phase 28 measurement: SVG generator renders three diagram views with matching dimensions', () => {
  const svgHtml = generateMeasurementSvg({
    widthMm: 600,
    heightMm: 1800,
    depthMm: 700,
    doorSwingMm: null
  });

  const viewBoxMatches = svgHtml.match(/viewBox="/g) ?? [];
  assert.equal(viewBoxMatches.length, 3, 'expected front / side / top SVG view boxes');
  assert.match(svgHtml, />W 600mm</);
  assert.match(svgHtml, />H 1800mm</);
  assert.match(svgHtml, />D 700mm</);
});

test('phase 28 measurement: HowTo schema has exactly 5 steps from shared JSON copy', async () => {
  const steps = await loadMeasurementSteps({
    stepsPath: path.join(repoRoot, 'data', 'copy', 'measurement-steps.json')
  });
  const howTo = buildMeasurementHowToJsonLd({
    steps,
    widthMm: 650,
    heightMm: 1820,
    depthMm: 720,
    pageUrl: 'https://fitappliance.com.au/cavity/650mm-fridge'
  });

  assert.equal(howTo['@type'], 'HowTo');
  assert.equal(howTo.step.length, 5);
  assert.equal(steps.length, 5);
});

test('phase 28 measurement: different dimensions produce different SVG output', () => {
  const small = generateMeasurementSvg({
    widthMm: 600,
    heightMm: 1700,
    depthMm: 650
  });
  const large = generateMeasurementSvg({
    widthMm: 900,
    heightMm: 1900,
    depthMm: 750
  });
  assert.notEqual(small, large);
});

test('phase 28 measurement: cavity pages include #measure section with measurement HowTo schema', async () => {
  const cavityPagePath = path.join(repoRoot, 'pages', 'cavity', '600mm-fridge.html');
  const html = await fs.readFile(cavityPagePath, 'utf8');

  assert.match(html, /<section id="measure">/);
  assert.match(html, /class="measurement-svg"/);
  assert.match(html, /"@type": "HowTo"/);
});
