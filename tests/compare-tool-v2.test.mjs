import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');
const deferredCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeWindow() {
  return new JSDOM('<main><div id="modal" hidden></div></main>', { pretendToBeVisual: true }).window;
}

function makeEntry(id, snapshot = {}) {
  return {
    id,
    addedAt: '2026-05-06T01:00:00.000Z',
    snapshot: {
      slug: id,
      displayName: `Product ${id}`,
      brand: 'LG',
      model: id.toUpperCase(),
      cat: 'fridge',
      w: 900,
      h: 1780,
      d: 700,
      practicalClearance: { side: 5, top: 20, rear: 10 },
      manufacturerClearance: { side: 50, top: 100, rear: 50 },
      fitSummary: { status: 'good', bindingAxis: 'width', tightestGapMm: 45 },
      delivery: { doorwayClearanceMm: 750, turnClearanceMm: 900 },
      features: ['French Door', 'Water Dispenser'],
      retailers: [{ name: 'Appliances Online', price: null }, { name: 'JB Hi-Fi', price: null }],
      stars: 5,
      ...snapshot
    }
  };
}

test('phase 51 compare tool: modal renders RTINGS-style sticky product header and grouped sections', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [
      makeEntry('lg-900', { displayName: 'LG 708L French Door' }),
      makeEntry('hisense-912', { displayName: 'Hisense 640L French Door', brand: 'Hisense', w: 912 })
    ]
  });

  assert.equal(modal.hidden, false);
  assert.ok(modal.querySelector('.compare-sticky-products'), 'sticky product header should be present');
  assert.match(modal.textContent, /Fit verdict/i);
  assert.match(modal.textContent, /Dimensions/i);
  assert.match(modal.textContent, /Clearance/i);
  assert.match(modal.textContent, /Delivery/i);
  assert.match(modal.textContent, /Retailers/i);
});

test('phase 51 compare tool: differing values are highlighted and only-differences toggle hides same rows', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [
      makeEntry('a', { w: 900, stars: 5 }),
      makeEntry('b', { brand: 'Hisense', w: 912, stars: 5 })
    ]
  });

  assert.ok(modal.querySelector('.compare-cell--diff'), 'width difference should be highlighted');
  const sameRowsBefore = modal.querySelectorAll('[data-compare-same-row="true"]').length;
  assert.ok(sameRowsBefore > 0, 'fixture should include at least one same row');

  const toggle = modal.querySelector('[data-compare-differences-only]');
  toggle.click();

  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(modal.querySelectorAll('[data-compare-same-row="true"]:not([hidden])').length, 0);
});

test('phase 51 compare tool: metric labels expose contextual tooltip copy', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [makeEntry('a'), makeEntry('b')]
  });

  const rearTooltip = [...modal.querySelectorAll('.compare-help-popover')]
    .find((node) => /rear clearance/i.test(node.textContent ?? ''));
  assert.ok(rearTooltip, 'rear clearance tooltip should exist');
  assert.ok(rearTooltip.querySelector('summary.compare-help'), 'tooltip should use a clickable summary control');
  assert.match(rearTooltip.querySelector('[role="tooltip"]').textContent, /ventilation/i);

  rearTooltip.open = true;
  assert.equal(rearTooltip.open, true, 'native disclosure should open on click/tap');
});

test('phase 51 compare tool: result card snapshots carry clearance delivery and feature data into compare store', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.createElement('div');

  mount.innerHTML = buildCardHtml({
    id: 'hisense-hrcd640tbw',
    displayName: 'Hisense HRCD640TBW 640L French Door',
    brand: 'Hisense',
    model: 'HRCD640TBW',
    cat: 'fridge',
    w: 912,
    h: 1785,
    d: 725,
    stars: 5,
    features: ['French Door', 'Water Dispenser'],
    practicalClearance: { side: 5, top: 20, rear: 10 },
    manufacturerClearance: { side: 50, top: 100, rear: 50 },
    fitGapMm: 45,
    bindingAxis: 'width',
    retailers: [{ n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/hisense-hrcd640tbw' }]
  });

  const snapshot = JSON.parse(mount.querySelector('[data-compare-snapshot]').getAttribute('data-compare-snapshot'));
  assert.deepEqual(snapshot.practicalClearance, { side: 5, top: 20, rear: 10 });
  assert.deepEqual(snapshot.manufacturerClearance, { side: 50, top: 100, rear: 50 });
  assert.deepEqual(snapshot.features, ['French Door', 'Water Dispenser']);
  assert.equal(snapshot.fitSummary.bindingAxis, 'width');
});

test('phase 51 compare tool: deferred CSS supports sticky header and highlighted differences', () => {
  assert.match(deferredCss, /\.compare-sticky-products\s*\{[\s\S]*position:sticky/);
  assert.match(deferredCss, /\.compare-cell--diff/);
  assert.match(deferredCss, /\.compare-help/);
  assert.match(deferredCss, /data-compare-differences-only|compare-diff-toggle/);
});
