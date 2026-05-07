import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const isoPath = path.join(repoRoot, 'public', 'scripts', 'iso-projection.js');

function loadIso() {
  delete require.cache[require.resolve(isoPath)];
  return require(isoPath);
}

const sample = {
  cavity: { w: 600, h: 1900, d: 650 },
  product: { w: 595, h: 1850, d: 600 },
  clearance: { side: 25, top: 25, rear: 50 }
};

test('phase 53 iso projection: renderIsoFitSvg returns one SVG string', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({ ...sample, bindingAxis: 'width' });

  assert.equal(svg.startsWith('<svg'), true);
  assert.equal(svg.endsWith('</svg>'), true);
});

test('phase 53 iso projection: SVG uses the required 280 viewBox', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({ ...sample, bindingAxis: null });

  assert.match(svg, /viewBox="0 0 280 280"/);
});

test('phase 53 iso projection: cavity dimensions and visible gap labels are rendered', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({ ...sample, bindingAxis: 'width' });

  assert.match(svg, /600 mm/);
  assert.match(svg, /1900 mm/);
  assert.match(svg, /650 mm/);
  assert.match(svg, /-45mm|−45mm/);
  assert.match(svg, /25mm/);
  assert.match(svg, /0mm/);
});

test('phase 53 iso projection: binding axis adds orange highlight', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({ ...sample, bindingAxis: 'width' });

  assert.match(svg, /stroke="#d97706"/);
});

test('phase 53 iso projection: null binding axis does not render orange highlight', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({ ...sample, bindingAxis: null });

  assert.doesNotMatch(svg, /stroke="#d97706"/);
});

test('phase 53 iso projection: product larger than cavity still renders negative depth gap', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({
    cavity: { w: 600, h: 1900, d: 650 },
    product: { w: 600, h: 1900, d: 700 },
    clearance: { side: 0, top: 0, rear: 0 },
    bindingAxis: 'depth'
  });

  assert.match(svg, /-50mm|−50mm/);
});

test('phase 53 iso projection: API has no string inputs to render as user content', () => {
  const { renderIsoFitSvg } = loadIso();
  const svg = renderIsoFitSvg({
    cavity: { w: '<img onerror=alert(1)>', h: 1900, d: 650 },
    product: { w: 595, h: 1850, d: 600 },
    clearance: { side: 25, top: 25, rear: 50 },
    bindingAxis: 'width'
  });

  assert.doesNotMatch(svg, /onerror|<img/i);
  assert.match(svg, /Enter valid dimensions/);
});

test('phase 53 iso projection: 100 renders stay under 50ms', () => {
  const { renderIsoFitSvg } = loadIso();
  const start = performance.now();
  for (let index = 0; index < 100; index += 1) {
    renderIsoFitSvg({ ...sample, bindingAxis: index % 2 === 0 ? 'width' : null });
  }
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 50, `expected 100 renders under 50ms, got ${elapsed.toFixed(2)}ms`);
});
