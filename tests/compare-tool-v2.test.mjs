import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');
const deferredCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

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
  assert.ok(modal.querySelector('.compare-report-summary'), 'comparison report should start with a summary strip');
  assert.match(modal.textContent, /Fit confidence/i);
  assert.match(modal.textContent, /Retailer coverage/i);
  assert.match(modal.textContent, /Price coverage/i);
});

test('phase 51 compare tool: report values use explicit human-readable states instead of dash-only gaps', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [
      makeEntry('a', {
        fitSummary: { status: 'exact', bindingAxis: 'width', tightestGapMm: 41 },
        manufacturerClearance: null,
        retailers: [
          { name: 'JB Hi-Fi', price: null },
          { name: 'Appliances Online', price: null },
          { name: 'The Good Guys', price: null },
          { name: 'Harvey Norman', price: null },
          { name: 'Bing Lee', price: null }
        ]
      }),
      makeEntry('b', {
        fitSummary: { status: 'tight', bindingAxis: '', tightestGapMm: 3 },
        retailers: []
      })
    ]
  });

  assert.match(modal.textContent, /Perfect fit · 41 mm spare/);
  assert.match(modal.textContent, /Tight fit · 3 mm spare/);
  assert.match(modal.textContent, /Binding axis not captured/);
  assert.match(modal.textContent, /No manufacturer advisory/);
  assert.match(modal.textContent, /5 verified stores: JB Hi-Fi, Appliances Online, The Good Guys, Harvey Norman, Bing Lee/);
  assert.match(modal.textContent, /No verified product links/);
  assert.match(modal.textContent, /No captured price — check retailer page/);
  assert.ok(modal.querySelector('.compare-fit-pill--perfect'));
  assert.ok(modal.querySelector('.compare-fit-pill--tight'));
});

test('phase 51 compare tool: report recommends a starting point and tags product strengths', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [
      makeEntry('tight-price', {
        displayName: 'Budget tight fit',
        brand: 'Haier',
        fitSummary: { status: 'tight', bindingAxis: 'width', tightestGapMm: 3 },
        retailers: [{ name: 'Appliances Online', price: 899 }]
      }),
      makeEntry('best-coverage', {
        displayName: 'Coverage winner',
        brand: 'Hisense',
        fitSummary: { status: 'good', bindingAxis: 'depth', tightestGapMm: 31 },
        retailers: [
          { name: 'JB Hi-Fi', price: null },
          { name: 'Appliances Online', price: null },
          { name: 'The Good Guys', price: null },
          { name: 'Harvey Norman', price: null },
          { name: 'Bing Lee', price: null }
        ]
      }),
      makeEntry('roomy-fit', {
        displayName: 'Roomiest cavity fit',
        brand: 'LG',
        fitSummary: { status: 'good', bindingAxis: 'width', tightestGapMm: 65 },
        retailers: [{ name: 'JB Hi-Fi', price: 1299 }]
      })
    ]
  });

  assert.ok(modal.querySelector('.compare-insight-panel'), 'recommendation panel should render');
  assert.match(modal.textContent, /Recommended starting point/i);
  assert.match(modal.textContent, /Coverage winner/);
  assert.match(modal.textContent, /5 verified stores/);
  assert.match(modal.textContent, /31 mm spare/);

  const headers = [...modal.querySelectorAll('.compare-sticky-product')];
  assert.match(headers[0].textContent, /Lowest price/);
  assert.match(headers[1].textContent, /Recommended/);
  assert.match(headers[1].textContent, /Most stores/);
  assert.match(headers[2].textContent, /Best fit/);
});

test('phase 51 compare tool: modal can copy a shareable compare link', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');
  let copied = '';

  renderCompareModal(modal, {
    items: [makeEntry('a'), makeEntry('b')],
    shareUrl: 'https://fitappliance.com.au/?cat=fridge&compareIds=a,b',
    onShare: (url) => {
      copied = url;
    }
  });

  const copyButton = modal.querySelector('[data-compare-share]');
  assert.ok(copyButton, 'share button should render when shareUrl is provided');
  assert.match(copyButton.textContent, /Copy compare link/);

  copyButton.click();
  assert.equal(copied, 'https://fitappliance.com.au/?cat=fridge&compareIds=a,b');
});

test('phase 51 compare tool: mobile report exposes horizontal scroll affordance', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [makeEntry('a'), makeEntry('b'), makeEntry('c')]
  });

  assert.match(modal.textContent, /Swipe sideways to compare product columns/i);
  const regions = modal.querySelectorAll('.compare-scroll-region[role="region"][tabindex="0"]');
  assert.ok(regions.length >= 4, 'each compare section should sit inside a focusable horizontal scroll region');
  assert.match(regions[0].getAttribute('aria-label'), /comparison table/i);
  assert.ok(regions[0].querySelector('.compare-table--v2'));
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

test('phase 51 compare tool: result card compare snapshot preserves all five major retailer links', async () => {
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
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/hisense-hrcd640tbw' },
      { n: 'Appliances Online', p: null, url: 'https://www.appliancesonline.com.au/product/hisense-hrcd640tbw' },
      { n: 'The Good Guys', p: null, url: 'https://www.thegoodguys.com.au/hisense-hrcd640tbw-fridge' },
      { n: 'Harvey Norman', p: null, url: 'https://www.harveynorman.com.au/hisense-hrcd640tbw-fridge.html' },
      { n: 'Bing Lee', p: null, url: 'https://www.binglee.com.au/products/hisense-hrcd640tbw' }
    ]
  });

  const snapshot = JSON.parse(mount.querySelector('[data-compare-snapshot]').getAttribute('data-compare-snapshot'));
  assert.deepEqual(snapshot.retailers.map((retailer) => retailer.name), [
    'JB Hi-Fi',
    'Appliances Online',
    'The Good Guys',
    'Harvey Norman',
    'Bing Lee'
  ]);
});

test('phase 51 compare tool: homepage compare snapshots carry fit, clearance, delivery and five retailers', () => {
  assert.match(indexHtml, /function buildCompareSnapshotFromProduct/);
  assert.match(indexHtml, /fitSummary:\s*\{/);
  assert.match(indexHtml, /practicalClearance:\s*clearance/);
  assert.match(indexHtml, /manufacturerClearance:\s*manufacturerClearance/);
  assert.match(indexHtml, /delivery:\s*\{/);
  assert.match(indexHtml, /features:\s*Array\.isArray\(product\?\.features\)/);
  assert.match(indexHtml, /retailers\.slice\(0,\s*5\)/);
  assert.match(indexHtml, /filteredResults\.find\(\(row\) => row\.id === id\) \|\| PRODUCTS\.find/);
});

test('phase 51 compare tool: homepage restores and shares compare IDs through URL state', () => {
  assert.match(indexHtml, /function restoreCompareFromUrlParam/);
  assert.match(indexHtml, /compareIds/);
  assert.match(indexHtml, /function buildCompareShareUrl/);
  assert.match(indexHtml, /copyCompareShareLink/);
  assert.match(indexHtml, /shareUrl:\s*buildCompareShareUrl\(\)/);
});

test('phase 51 compare tool: deferred CSS supports sticky header and highlighted differences', () => {
  assert.match(deferredCss, /\.compare-sticky-products\s*\{[\s\S]*position:sticky/);
  assert.match(deferredCss, /\.compare-insight-panel\s*\{/);
  assert.match(deferredCss, /\.compare-strength-badge\s*\{/);
  assert.match(deferredCss, /\.compare-share-link\s*\{/);
  assert.match(deferredCss, /\.compare-scroll-hint\s*\{/);
  assert.match(deferredCss, /\.compare-v2-sections\s*\{[^}]*min-width:0/);
  assert.match(deferredCss, /\.compare-scroll-region\s*\{[^}]*min-width:0/);
  assert.match(deferredCss, /\.compare-section\s*\{[^}]*overflow:hidden/);
  assert.match(deferredCss, /@media\(max-width:660px\)[\s\S]*\.compare-scroll-region::after/);
  assert.match(deferredCss, /\.compare-report-summary\s*\{[\s\S]*grid-template-columns:repeat\(3/);
  assert.match(deferredCss, /\.compare-summary-card\s*\{/);
  assert.match(deferredCss, /\.compare-fit-pill--perfect\s*\{/);
  assert.match(deferredCss, /\.compare-fit-pill--tight\s*\{/);
  assert.match(deferredCss, /\.compare-cell--diff/);
  assert.match(deferredCss, /\.compare-help/);
  assert.match(deferredCss, /\.compare-diff-toggle\s*\{[\s\S]*border-radius:999px/);
  assert.match(deferredCss, /data-compare-differences-only|compare-diff-toggle/);
});
