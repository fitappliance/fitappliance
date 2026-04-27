import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vizPath = path.join(repoRoot, 'public', 'scripts', 'fit-visualization.js');

function loadViz() {
  delete require.cache[require.resolve(vizPath)];
  return require(vizPath);
}

const cavity = { w: 600, h: 1900, d: 650 };
const product = { w: 595, h: 1860, d: 620, brand: 'LG', model: 'GF-L708MBL' };

test('phase 48 fit-viz redesign: SVG uses compact architectural drawing canvas', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({ cavity, product, clearance: { side: 0, top: 0, rear: 0 }, view: 'front' });

  assert.match(svg, /viewBox="0 0 200 160"/);
  assert.match(svg, /class="fit-viz-cavity"[^>]+stroke-width="1\.2"/);
  assert.match(svg, /class="fit-viz-product"[^>]+fill="#eeece6"[^>]+stroke-width="1"/);
  assert.doesNotMatch(svg, /appliance/i);
});

test('phase 48 fit-viz redesign: every view renders four in-cavity gap labels', () => {
  const { renderFitSvg } = loadViz();

  for (const view of ['front', 'top', 'side']) {
    const svg = renderFitSvg({ cavity, product, clearance: { side: 0, top: 0, rear: 0 }, view });
    assert.ok((svg.match(/class="fit-viz-gap-label/g) ?? []).length >= 4, `${view} did not render 4 gap labels`);
  }
});

test('phase 48 fit-viz redesign: binding gap is highlighted in place with orange and BIND label', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({
    cavity: { w: 600, h: 1900, d: 700 },
    product: { w: 595, h: 1800, d: 620, brand: 'LG', model: 'GF-L708MBL' },
    clearance: { side: 0, top: 0, rear: 0 },
    view: 'front'
  });

  assert.match(svg, /class="fit-viz-gap-label fit-viz-gap-label--binding"/);
  assert.match(svg, /fill="#d97706"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, />BIND</);
  assert.match(svg, /class="fit-viz-binding-edge"[^>]+stroke="#d97706"[^>]+stroke-width="1\.8"/);
});

test('phase 48 fit-viz redesign: dimension lines use arrow markers and cavity labels', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({ cavity, product, clearance: { side: 0, top: 0, rear: 0 }, view: 'top' });

  assert.match(svg, /marker-start="url\(#fitArrow/);
  assert.match(svg, /marker-end="url\(#fitArrow/);
  assert.match(svg, />W: 600mm</);
  assert.match(svg, />D: 650mm</);
});

test('phase 48 fit-viz redesign: group caption names product and binding gap plainly', () => {
  const { renderFitVisualizationGroup } = loadViz();
  const html = renderFitVisualizationGroup({
    cavity,
    product,
    clearance: { side: 0, top: 0, rear: 0 }
  });

  assert.match(html, /LG GF-L708MBL/);
  assert.match(html, /binding: width 5mm/);
  assert.match(html, /best fit/);
});
