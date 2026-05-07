import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCorePath = path.join(repoRoot, 'public', 'scripts', 'search-core.js');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchCore() {
  const module = await import(`${pathToFileURL(searchCorePath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

function makeProduct(overrides = {}) {
  return {
    id: 'awkward-fridge',
    brand: 'LG',
    model: 'GB-450',
    displayName: 'LG 450L Fridge',
    cat: 'fridge',
    w: 540,
    h: 1650,
    d: 540,
    stars: 4,
    features: ['Upright'],
    retailers: [],
    ...overrides
  };
}

test('awkward space flags: shallow depth products get a shallow-cavity flag', async () => {
  const SearchCore = await loadSearchCore();

  assert.ok(SearchCore.getAwkwardSpaceFlags(makeProduct({ d: 540 })).includes('shallow-depth'));
});

test('awkward space flags: low products get a low-cavity flag', async () => {
  const SearchCore = await loadSearchCore();

  assert.ok(SearchCore.getAwkwardSpaceFlags(makeProduct({ h: 1650 })).includes('low-cavity'));
});

test('awkward space flags: heat pump dryers get an apartment-friendly flag', async () => {
  const SearchCore = await loadSearchCore();

  assert.ok(SearchCore.getAwkwardSpaceFlags(makeProduct({
    cat: 'dryer',
    features: ['Heat Pump', 'Stackable']
  })).includes('apartment-ok'));
});

test('awkward space flags: explicit zero top clearance gets a no-top-clearance flag', async () => {
  const SearchCore = await loadSearchCore();

  assert.ok(SearchCore.getAwkwardSpaceFlags(makeProduct({
    manufacturerClearance: { side: 5, top: 0, rear: 10 }
  })).includes('no-top-clearance'));
});

test('awkward space flags: narrow physical dimensions get a doorway-friendly flag', async () => {
  const SearchCore = await loadSearchCore();

  assert.ok(SearchCore.getAwkwardSpaceFlags(makeProduct({
    w: 620,
    d: 590
  })).includes('narrow-doorway'));
});

test('awkward space flags: missing fields do not throw and return an array', async () => {
  const SearchCore = await loadSearchCore();

  assert.deepEqual(SearchCore.getAwkwardSpaceFlags(null), []);
  assert.ok(Array.isArray(SearchCore.getAwkwardSpaceFlags({})));
});

test('awkward space card: renders at most two positive space tags', async () => {
  await loadSearchCore();
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeProduct({
    d: 540,
    h: 1650,
    cat: 'dryer',
    features: ['Heat Pump'],
    manufacturerClearance: { side: 5, top: 0, rear: 10 }
  })));
  const tags = [...dom.window.document.querySelectorAll('.space-tag')];

  assert.equal(tags.length, 2);
  assert.match(tags.map((tag) => tag.textContent).join(' '), /shallow cavity|low ceiling|Apartment-safe|narrow doorway/i);
});

test('awkward space card: prioritises the first two tags when many flags match', async () => {
  await loadSearchCore();
  const { buildCardHtml } = await loadSearchDom();
  const dom = new JSDOM(buildCardHtml(makeProduct({
    d: 540,
    h: 1650,
    cat: 'dryer',
    features: ['Heat Pump'],
    manufacturerClearance: { side: 5, top: 0, rear: 10 }
  })));
  const labels = [...dom.window.document.querySelectorAll('.space-tag')].map((tag) => tag.textContent.trim());

  assert.deepEqual(labels, [
    'Fits shallow cavity (≤55cm depth)',
    'Suits low ceiling kitchens (≤170cm)'
  ]);
});
