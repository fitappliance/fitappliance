import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const baseCavity = { w: 600, h: 1900, d: 650 };
const baseProduct = { w: 595, h: 1860, d: 620 };
const zeroClearance = { side: 0, top: 0, rear: 0 };

test('phase 48 fit visualization: module exports the pure rendering helpers', () => {
  const api = loadViz();

  assert.equal(typeof api.renderFitSvg, 'function');
  assert.equal(typeof api.renderFitVisualizationGroup, 'function');
  assert.equal(typeof api.identifyBindingConstraint, 'function');
  assert.equal(typeof api.formatGap, 'function');
});

test('phase 48 fit visualization: renderFitSvg outputs an accessible front SVG with cavity and 5mm gap label', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({
    cavity: baseCavity,
    product: baseProduct,
    clearance: zeroClearance,
    view: 'front'
  });

  assert.match(svg, /<svg[^>]+viewBox="0 0 200 160"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /class="fit-viz-cavity"/);
  assert.match(svg, /W: 600mm/);
  assert.match(svg, /5mm spare|5mm/);
});

test('phase 48 fit visualization: width binding is highlighted with the orange stroke', () => {
  const { identifyBindingConstraint, renderFitSvg } = loadViz();
  const cavity = { w: 600, h: 1900, d: 700 };
  const product = { w: 595, h: 1800, d: 620 };
  const clearance = { side: 0, top: 0, rear: 0 };

  assert.equal(identifyBindingConstraint(cavity, product, clearance), 'width');

  const svg = renderFitSvg({ cavity, product, clearance, view: 'front' });
  assert.match(svg, /stroke="#d97706"/);
  assert.match(svg, /class="fit-viz-binding-edge"[^>]+stroke-width="1\.8"/);
  assert.match(svg, /class="fit-viz-binding-label"[^>]*>BIND</);
});

test('phase 48 fit visualization: top view uses depth where front view uses height', () => {
  const { renderFitSvg } = loadViz();
  const front = renderFitSvg({
    cavity: baseCavity,
    product: baseProduct,
    clearance: zeroClearance,
    view: 'front'
  });
  const top = renderFitSvg({
    cavity: baseCavity,
    product: baseProduct,
    clearance: zeroClearance,
    view: 'top'
  });

  assert.notEqual(top, front);
  assert.match(front, /H: 1900mm/);
  assert.match(top, /D: 650mm/);
});

test('phase 48 fit visualization: binding constraint follows existing search-core clearance semantics', () => {
  const { identifyBindingConstraint } = loadViz();
  const axis = identifyBindingConstraint(
    { w: 600, h: 1900, d: 650 },
    { w: 580, h: 1878, d: 630 },
    { side: 8, top: 12, rear: 15 }
  );

  assert.equal(axis, 'width');
});

test('phase 48 fit visualization: formatGap labels comfortable, tight, and failing gaps', () => {
  const { formatGap } = loadViz();

  assert.equal(formatGap(20), '20mm spare');
  assert.equal(formatGap(8), '8mm spare');
  assert.equal(formatGap(3), 'BIND 3mm');
  assert.equal(formatGap(-3), "doesn't fit: -3mm");
});

test('phase 48 fit visualization polish: svg line weights and labels are readable at compact size', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({
    cavity: { w: 600, h: 1900, d: 700 },
    product: { w: 595, h: 1800, d: 620 },
    clearance: zeroClearance,
    view: 'front'
  });

  assert.match(svg, /class="fit-viz-cavity"[^>]+stroke-width="1\.2"/);
  assert.match(svg, /class="fit-viz-product"[^>]+fill="#eeece6"[^>]+stroke-width="1"/);
  assert.match(svg, /font-size="12"/);
  assert.doesNotMatch(svg, /tight: /);
  assert.doesNotMatch(svg, /appliance/i);
});

test('phase 48 fit visualization: group renders three panes and escapes hostile product labels', () => {
  const { renderFitVisualizationGroup } = loadViz();
  const html = renderFitVisualizationGroup({
    cavity: baseCavity,
    product: {
      ...baseProduct,
      brand: '<img src=x onerror=alert(1)>',
      displayName: '<img src=x onerror=alert(1)>'
    },
    clearance: zeroClearance
  });

  assert.equal((html.match(/class="fit-viz-pane"/g) ?? []).length, 3);
  assert.match(html, /<figcaption>/);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /<img/i);
});

test('phase 48 fit visualization: invalid dimensions return a safe placeholder SVG', () => {
  const { renderFitSvg } = loadViz();
  const svg = renderFitSvg({
    cavity: { w: 0, h: 1900, d: null },
    product: baseProduct,
    clearance: zeroClearance,
    view: 'front'
  });

  assert.match(svg, /Enter all 3 dimensions/);
  assert.match(svg, /<svg/);
});

test('phase 48 fit visualization: each single-view SVG stays below the 3KB budget', () => {
  const { renderFitSvg } = loadViz();
  for (const view of ['front', 'top', 'side']) {
    const svg = renderFitSvg({
      cavity: baseCavity,
      product: baseProduct,
      clearance: { side: 5, top: 25, rear: 25 },
      view
    });
    assert.ok(Buffer.byteLength(svg, 'utf8') <= 3072, `${view} SVG exceeded 3KB`);
  }
});

test('phase 48 fit visualization: three-view group stays below the 6KB inline budget', () => {
  const { renderFitVisualizationGroup } = loadViz();
  const html = renderFitVisualizationGroup({
    cavity: baseCavity,
    product: { ...baseProduct, brand: 'Bosch', displayName: 'Bosch Serie 4 Fridge' },
    clearance: { side: 5, top: 25, rear: 25 }
  });

  assert.ok(Buffer.byteLength(html, 'utf8') <= 6144);
});

test('phase 48 fit visualization: homepage has a mount and imports visualization before search-dom', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(html, /data-fit-viz/);
  assert.match(html, /import '\/scripts\/fit-visualization\.js(?:\?[^']+)?';\s*import '\/scripts\/search-dom\.js(?:\?[^']+)?';/);
  assert.match(html, /SearchDom\.renderFitVisualization/);
});

test('phase 48 fit visualization: renderer is fast enough for repeated search updates', () => {
  const { renderFitVisualizationGroup } = loadViz();
  const started = performance.now();
  for (let i = 0; i < 100; i += 1) {
    renderFitVisualizationGroup({
      cavity: baseCavity,
      product: { ...baseProduct, brand: 'LG', displayName: `LG Fridge ${i}` },
      clearance: { side: 5, top: 25, rear: 25 }
    });
  }
  const elapsed = performance.now() - started;

  assert.ok(elapsed < 100, `rendered 100 visualizations in ${elapsed.toFixed(2)}ms`);
});
