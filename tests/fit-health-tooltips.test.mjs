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
    ...overrides
  };
}

test('phase 51 fit health: perfect fit renders green verdict with tooltip copy', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeMatch({ fitGapMm: 24 })));
  const badge = dom.window.document.querySelector('.fit-health');

  assert.ok(badge);
  assert.ok(badge.classList.contains('fit-health--perfect'));
  assert.ok(badge.classList.contains('fit-badge--exact'), 'legacy exact class should remain for compatibility');
  assert.match(badge.textContent ?? '', /Perfect fit/);
  assert.match(badge.textContent ?? '', /24mm spare/);
  assert.ok(badge.querySelector('.fit-health-light'));

  const popover = badge.querySelector('.fit-help-popover');
  const help = badge.querySelector('.fit-help');
  const tooltip = badge.querySelector('.fit-help-tooltip');
  assert.equal(popover?.tagName, 'DETAILS');
  assert.equal(help?.tagName, 'SUMMARY');
  assert.equal(help?.getAttribute('aria-label'), 'What does Perfect fit mean?');
  assert.match(tooltip?.textContent ?? '', /practical clearance buffer/i);
});

test('phase 51 fit health: tight fit renders amber verdict and ventilation nudge', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeMatch({ fitGapMm: 3, fitsTightly: true })));
  const badge = dom.window.document.querySelector('.fit-health');

  assert.ok(badge?.classList.contains('fit-health--tight'));
  assert.ok(badge?.classList.contains('fit-badge--tight'));
  assert.match(badge?.textContent ?? '', /Tight fit/);
  assert.match(badge?.textContent ?? '', /3mm spare/);
  assert.match(dom.window.document.body.textContent ?? '', /verify ventilation/i);
});

test('phase 51 fit health: blocked near miss renders red verdict with needed cavity amount', async () => {
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeMatch({ cavityNeededMm: 18, fitGapMm: 18 })));
  const badge = dom.window.document.querySelector('.fit-health');

  assert.ok(badge?.classList.contains('fit-health--blocked'));
  assert.ok(badge?.classList.contains('fit-badge--relax'));
  assert.match(badge?.textContent ?? '', /Won't fit/);
  assert.match(badge?.textContent ?? '', /\+18mm cavity needed/);
  assert.match(badge?.querySelector('.fit-help-tooltip')?.textContent ?? '', /larger cavity/i);
});

test('phase 51 fit health: manufacturer clearance advisory includes contextual rear-clearance help', async () => {
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
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /onerror/i);
});

test('phase 51 fit health: live list-row renderer shows the verdict in product cards', async () => {
  const { buildRow } = await loadProductCard();
  const html = buildRow(makeMatch({ fitScore: 0.04, fitGapMm: undefined }), {
    annualEnergyCost: () => '132',
    resolveRetailerUrl: (retailer) => retailer.url
  });
  const dom = new JSDOM(html);
  const badge = dom.window.document.querySelector('.fit-health');

  assert.ok(badge, 'the live homepage row renderer must surface fit-health');
  assert.ok(badge?.classList.contains('fit-health--perfect'));
  assert.match(badge?.textContent ?? '', /Perfect fit/);
  assert.match(badge?.textContent ?? '', /29mm spare/);
  assert.equal(badge?.querySelector('.fit-help-popover')?.tagName, 'DETAILS');
  assert.match(badge?.querySelector('.fit-help-tooltip')?.textContent ?? '', /practical clearance buffer/i);
});

test('phase 51 fit health: live grid-card renderer shows tight and blocked verdicts', async () => {
  const { buildCard } = await loadProductCard();
  const tightHtml = buildCard(makeMatch({ fitGapMm: 2, fitsTightly: true }), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });
  const blockedHtml = buildCard(makeMatch({ cavityNeededMm: 12 }), {
    tcoHtml: () => '',
    retailersHtml: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(tightHtml, /fit-health--tight/);
  assert.match(tightHtml, /Tight fit/);
  assert.match(blockedHtml, /fit-health--blocked/);
  assert.match(blockedHtml, /\+12mm cavity needed/);
});

test('phase 51 fit health: styles define traffic-light states and accessible tooltip affordance', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.fit-health--perfect/);
  assert.match(css, /\.fit-health--tight/);
  assert.match(css, /\.fit-health--blocked/);
  assert.match(css, /\.fit-health-light/);
  assert.match(css, /\.fit-help/);
  assert.match(css, /\.fit-help-popover\[open\] \.fit-help-tooltip/);
});
