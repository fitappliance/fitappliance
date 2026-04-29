import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeMatch(overrides = {}) {
  return {
    id: 'lg-gf-l708mbl',
    displayName: '708L French door fridge',
    brand: 'LG',
    model: 'GF-L708MBL',
    readableSpec: '708L French door fridge',
    w: 912,
    h: 1780,
    d: 748,
    cat: 'fridge',
    stars: 4,
    kwh_year: 297.6,
    features: ['French door', 'Class 4'],
    url: '/appliances/lg-gf-l708mbl',
    retailers: [{ n: 'The Good Guys', p: 1299, url: 'https://example.com/lg' }],
    fitGapMm: 18,
    ...overrides
  };
}

test('phase 48 card redesign: buildCardHtml uses ecommerce three-column card structure', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch());

  assert.match(html, /class="card-grid"/);
  assert.match(html, /class="card-thumb-cell"/);
  assert.match(html, /class="card-info-cell"/);
  assert.match(html, /class="card-action-cell"/);
  assert.match(html, /class="card-title"/);
  assert.match(html, /class="card-subtitle"/);
  assert.match(html, /class="card-fit-row"/);
  assert.match(html, /class="card-specs-row"/);
  assert.match(html, /class="card-energy-line"/);
});

test('phase 48 card redesign: title is brand plus model and subtitle carries readable spec', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch());

  assert.match(html, /<div class="card-title">LG GF-L708MBL<\/div>/);
  assert.match(html, /<div class="card-subtitle">708L French door fridge<\/div>/);
});

test('phase 48 card redesign: fit badge is compact and stateful', async () => {
  const { buildCardHtml } = await loadSearchDom();

  assert.match(buildCardHtml(makeMatch({ fitGapMm: 22 })), /fit-badge--exact/);
  assert.match(buildCardHtml(makeMatch({ fitGapMm: 4, fitsTightly: true })), /fit-badge--tight/);
  assert.match(buildCardHtml(makeMatch({ cavityNeededMm: 12 })), /fit-badge--relax/);
});

test('phase 48 card redesign: old giant clearance badge and per-card commission copy are gone', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({ cavityNeededMm: 14 }));

  assert.doesNotMatch(html, /REQUIRES/i);
  assert.doesNotMatch(html, /CLEARANCE/i);
  assert.doesNotMatch(html, /We earn a commission/i);
});

test('phase 48 card redesign: commission disclosure is rendered once above result lists', async () => {
  const { renderSearchResults } = await loadSearchDom();
  const dom = new JSDOM('<div id="results"></div><div id="message"></div>');
  const resultsEl = dom.window.document.getElementById('results');
  const messageEl = dom.window.document.getElementById('message');

  renderSearchResults({
    matches: [makeMatch({ id: 'one' }), makeMatch({ id: 'two', model: 'GF-B590PL' })],
    filters: { w: 1000, h: 1900, d: 800, toleranceMm: 5 },
    resultsEl,
    messageEl
  });

  assert.equal(resultsEl.querySelectorAll('.commission-disclosure').length, 1);
  assert.match(resultsEl.querySelector('.commission-disclosure')?.textContent ?? '', /small commission/i);
  assert.equal(resultsEl.querySelectorAll('.fit-result-item').length, 2);
});

test('phase 50 retailer links: result card CTA shows every linked retailer as a selectable chip', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gf-l708mbl' },
      { n: 'Appliances Online', p: null, url: 'https://www.appliancesonline.com.au/product/lg-gf-l708mbl/' }
    ]
  }));

  assert.match(html, /card-retailer-links/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /Appliances Online/);
  assert.match(html, /href="https:\/\/www\.jbhifi\.com\.au\/products\/lg-gf-l708mbl"/);
  assert.match(html, /href="https:\/\/www\.appliancesonline\.com\.au\/product\/lg-gf-l708mbl\/"/);
  assert.doesNotMatch(html, /View at JB Hi-Fi/);
});
