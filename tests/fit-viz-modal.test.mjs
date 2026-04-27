import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vizPath = path.join(repoRoot, 'public', 'scripts', 'fit-visualization.js');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDomWithViz() {
  delete require.cache[require.resolve(vizPath)];
  globalThis.FitVisualization = require(vizPath);
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}-${Math.random()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeWindow() {
  return new JSDOM('<main><div id="root" data-fit-viz></div><button id="after">After</button></main>', {
    pretendToBeVisual: true
  }).window;
}

const fixture = {
  cavity: { w: 600, h: 1900, d: 650 },
  product: {
    id: 'lg-fit',
    brand: 'LG',
    model: 'GB-455UPLE',
    displayName: 'LG GB-455UPLE Fridge',
    w: 595,
    h: 1800,
    d: 620
  },
  clearance: { side: 5, top: 20, rear: 10 }
};

test('phase 48 fit-viz modal: panes expose button semantics for expansion', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);

  const panes = root.querySelectorAll('.fit-viz-pane');
  assert.equal(panes.length, 3);
  assert.equal(panes[0].getAttribute('role'), 'button');
  assert.equal(panes[0].getAttribute('tabindex'), '0');
  assert.equal(panes[0].getAttribute('aria-label'), 'Expand Front view');
});

test('phase 48 fit-viz modal: click opens the requested view with dialog semantics', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);
  root.querySelector('[data-fit-viz-view="top"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const modal = window.document.querySelector('.fit-viz-modal');
  assert.ok(modal);
  const panel = modal.querySelector('.fit-viz-modal-panel');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.equal(modal.querySelector('[data-fit-viz-modal-tab="top"]').getAttribute('aria-selected'), 'true');
  assert.match(modal.querySelector('.fit-viz-modal-svg-container').innerHTML, /D: 650mm/);
});

test('phase 48 fit-viz modal: tab buttons switch the rendered view', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);
  root.querySelector('[data-fit-viz-view="front"]').click();
  window.document.querySelector('[data-fit-viz-modal-tab="side"]').click();

  assert.equal(window.document.querySelector('[data-fit-viz-modal-tab="side"]').getAttribute('aria-selected'), 'true');
  assert.match(window.document.querySelector('.fit-viz-modal-svg-container').innerHTML, /D: 650mm/);
  assert.match(window.document.querySelector('.fit-viz-modal-svg-container').innerHTML, /H: 1900mm/);
});

test('phase 48 fit-viz modal: escape and overlay close the dialog', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);
  root.querySelector('[data-fit-viz-view="front"]').click();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(window.document.querySelector('.fit-viz-modal'), null);

  root.querySelector('[data-fit-viz-view="front"]').click();
  window.document.querySelector('.fit-viz-modal').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(window.document.querySelector('.fit-viz-modal'), null);
});

test('phase 48 fit-viz modal: focus enters the modal and returns to the triggering pane', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);
  const pane = root.querySelector('[data-fit-viz-view="front"]');
  pane.focus();
  pane.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.ok(window.document.activeElement?.classList.contains('fit-viz-modal-close'));
  window.document.querySelector('.fit-viz-modal-close').click();
  assert.equal(window.document.activeElement, pane);
});

test('phase 48 fit-viz modal: Space key expands a focused pane', async () => {
  const SearchDom = await loadSearchDomWithViz();
  const window = makeWindow();
  const root = window.document.getElementById('root');

  SearchDom.renderFitVisualization(root, fixture);
  const pane = root.querySelector('[data-fit-viz-view="side"]');
  pane.focus();
  pane.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  assert.ok(window.document.querySelector('.fit-viz-modal'));
  assert.equal(window.document.querySelector('[data-fit-viz-modal-tab="side"]').getAttribute('aria-selected'), 'true');
});
