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

test('hotfix card layout: save and compare controls live in the title area, not the retailer footer', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch());

  assert.match(html, /class="card-info-header"/);
  assert.match(html, /class="card-title-stack"/);
  assert.match(html, /class="card-buttons card-buttons--header"/);
  assert.match(html, /<div class="card-info-header">[\s\S]*\+ Compare[\s\S]*<\/div>\s*<div class="card-fit-row">/);
  assert.doesNotMatch(html, /<div class="card-action-cell">[\s\S]*\+ Compare[\s\S]*<\/div>\s*<\/div>\s*<\/li>/);
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
  assert.match(html, /Check price at 2 stores/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /Appliances Online/);
  assert.match(html, /href="https:\/\/www\.jbhifi\.com\.au\/products\/lg-gf-l708mbl"/);
  assert.match(html, /href="https:\/\/www\.appliancesonline\.com\.au\/product\/lg-gf-l708mbl\/"/);
  assert.doesNotMatch(html, /fit-retailer-summary/);
  assert.doesNotMatch(html, /retailer-strip/);
  assert.doesNotMatch(html, /View at JB Hi-Fi/);
});

test('phase 50 retailer links: five-store cards collapse to a compact logo rail', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const retailers = [
    ['JB Hi-Fi', 'https://www.jbhifi.com.au/products/hisense-hrcd640tbw'],
    ['Appliances Online', 'https://www.appliancesonline.com.au/product/hisense-hrcd640tbw/'],
    ['The Good Guys', 'https://www.thegoodguys.com.au/hisense-hrcd640tbw'],
    ['Harvey Norman', 'https://www.harveynorman.com.au/hisense-hrcd640tbw.html'],
    ['Bing Lee', 'https://www.binglee.com.au/products/hisense-hrcd640tbw']
  ].map(([n, url]) => ({ n, url, p: null }));

  const html = buildCardHtml(makeMatch({ brand: 'HISENSE', model: 'HRCD640TBW', retailers }));

  assert.match(html, /card-retailer-panel--dense/);
  assert.match(html, /Check price at 5 stores/);
  assert.match(html, /retailer-logo-rail/);
  assert.equal((html.match(/class="retailer-logo-dot"/g) ?? []).length, 5);
  assert.match(html, /aria-label="Open JB Hi-Fi product page"/);
  assert.match(html, /aria-label="Open Harvey Norman product page"/);
  assert.match(html, /retailer-option-hint/);
  assert.doesNotMatch(html, /class="retailer-logo-name"/);
});

test('hotfix retailer URL quality: root retailer URLs are not shown as product links or prices', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    brand: 'Mitsubishi',
    model: 'MR-CGX680ZG French Door 680L',
    price: 4999,
    retailers: [
      { n: 'Appliances Online', p: 4999, url: 'https://www.appliances-online.com.au' }
    ]
  }));

  assert.match(html, /Retailer info unavailable/);
  assert.match(html, /Search this model/);
  assert.doesNotMatch(html, /Available at/);
  assert.doesNotMatch(html, /href="https:\/\/www\.appliances-online\.com\.au"/);
  assert.doesNotMatch(html, /From \$4,999|\$4,999/);
});

test('phase 50 price copy: verified retailer links without prices ask users to check retailer price', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gf-l708mbl' },
      { n: 'Appliances Online', p: null, url: 'https://www.appliancesonline.com.au/product/lg-gf-l708mbl/' },
      { n: 'Harvey Norman', p: null, url: 'https://www.harveynorman.com.au/lg-gf-l708mbl.html' }
    ]
  }));

  assert.match(html, /Check price at 3 stores/);
  assert.match(html, /Check retailer price/);
  assert.doesNotMatch(html, /Price unavailable/);
});

test('phase 52 recommendations: card html surfaces plumbing flag and delivery checklist', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    brand: 'Fisher & Paykel',
    model: 'RF730QZUVB1',
    readableSpec: '690L quad door fridge with ice and water',
    features: ['French Door', 'Water Dispenser', 'Auto Ice'],
    w: 905,
    d: 711,
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/fisher-paykel-rf730qzuvb1' }
    ]
  }));

  assert.match(html, /feature-alert/);
  assert.match(html, /Plumbing check/i);
  assert.match(html, /class="delivery-check"/);
  assert.match(html, /Will it make it to your kitchen\?/);
  assert.match(html, /Doorways are at least 761mm clear/);
});
