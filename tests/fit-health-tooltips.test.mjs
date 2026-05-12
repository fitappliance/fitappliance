import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');
const productCardPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js');
const stylesPath = path.join(repoRoot, 'public', 'styles.css');
const deferredStylesPath = path.join(repoRoot, 'public', 'styles-deferred.css');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

async function loadProductCard() {
  return import(`${pathToFileURL(productCardPath).href}?cacheBust=${Date.now()}`);
}

function makeMatch(overrides = {}) {
  return {
    id: 'hisense-hrcd640tbw',
    displayName: 'Hisense HRCD640TBW 640L French Door Fridge Dark Stainless Steel',
    brand: 'Hisense',
    model: 'HRCD640TBW',
    readableSpec: '640L French door fridge',
    w: 912,
    h: 1785,
    d: 725,
    cat: 'fridge',
    stars: 5,
    kwh_year: 441,
    features: ['Upright', '5T', 'Class 5'],
    retailers: [{ n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/hisense-hrcd640tbw' }],
    fitGapMm: 24,
    fitScoreNumeric: 91,
    fitAxisGaps: [
      { axis: 'width', label: 'W', cavity: 1000, appliance: 912, clearanceMm: 10, gapMm: 78 },
      { axis: 'height', label: 'H', cavity: 1900, appliance: 1785, clearanceMm: 20, gapMm: 95 },
      { axis: 'depth', label: 'D', cavity: 800, appliance: 725, clearanceMm: 10, gapMm: 65 }
    ],
    bindingAxis: 'depth',
    ...overrides
  };
}

test('phase 58 fit verdict: search-dom card renders numeric score instead of legacy text pill', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeMatch({ fitScoreNumeric: 91 })));
  const score = dom.window.document.querySelector('.fit-score-block');

  assert.ok(score);
  assert.match(score.textContent ?? '', /91/);
  assert.match(score.textContent ?? '', /Excellent fit/);
  assert.equal(dom.window.document.querySelector('.fit-health'), null);
  assert.equal(dom.window.document.querySelector('.fit-badge--exact, .fit-badge--tight, .fit-badge--relax'), null);
});

test('phase 58 fit verdict: live list-row renderer surfaces only the score popover', async () => {
  const { buildRow } = await loadProductCard();
  const html = buildRow(makeMatch(), {
    annualEnergyCost: () => '132',
    resolveRetailerUrl: (retailer) => retailer.url
  });
  const dom = new JSDOM(html);

  assert.ok(dom.window.document.querySelector('.fit-score-popover'));
  assert.ok(dom.window.document.querySelector('.score-breakdown'));
  assert.match(dom.window.document.querySelector('.fit-score-label')?.textContent ?? '', /91/);
  assert.equal(dom.window.document.querySelector('.fit-health'), null);
  assert.doesNotMatch(html, /Perfect fit|Tight fit|Won't fit/);
});

test('phase 58 fit verdict: missing numeric score does not fall back to removed legacy pill', async () => {
  const { buildRow, buildCard } = await loadProductCard();
  const noScore = makeMatch();
  delete noScore.fitScoreNumeric;
  const rowHtml = buildRow(noScore, {
    annualEnergyCost: () => '132',
    resolveRetailerUrl: (retailer) => retailer.url
  });
  const cardHtml = buildCard(noScore, {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.doesNotMatch(rowHtml, /fit-score-block|fit-score-popover|fit-health/);
  assert.doesNotMatch(cardHtml, /fit-score-block|fit-score-popover|fit-health/);
});

test('phase 58 fit verdict: manufacturer clearance advisory keeps contextual help without layout popover overlap', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const html = buildCardHtml(makeMatch({
    brand: '<img src=x onerror=alert(1)>',
    manufacturerClearance: { side: 50, top: 100, rear: 50 }
  }));
  const dom = new JSDOM(html);
  const advisory = dom.window.document.querySelector('.fit-card-advisory');

  assert.ok(advisory);
  assert.match(advisory.textContent ?? '', /\+50mm rear/);
  assert.match(advisory.querySelector('.fit-help')?.getAttribute('title') ?? '', /plugs, compressors, hoses and ventilation/i);
  assert.equal(dom.window.document.querySelector('.fit-help-popover'), null);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /onerror/i);
});

test('phase 58 fit verdict: styles place score ring at the card anchor without legacy pill dependency', () => {
  const css = `${fs.readFileSync(stylesPath, 'utf8')}\n${fs.readFileSync(deferredStylesPath, 'utf8')}`;

  assert.match(css, /\.card-zone-fit\s*\{[\s\S]*justify-items:start/);
  assert.match(css, /\.fit-score-ring--excellent/);
  assert.match(css, /\.fit-score-popover\s*\{[\s\S]*margin-left:0/);
});
