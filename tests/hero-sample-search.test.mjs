import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heroFunnelPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'hero-funnel.js');

async function loadHeroFunnel() {
  return import(`${pathToFileURL(heroFunnelPath).href}?cacheBust=${Date.now()}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('phase 58 hero sample search: clicking a sample chip fills cavity inputs and triggers search', async () => {
  const { bindHeroSampleSearches } = await loadHeroFunnel();
  const window = new JSDOM(`
    <main>
      <button data-sample-search='{"cat":"dishwasher","w":600,"h":850,"d":600}'>Dishwasher</button>
      <input id="inW">
      <input id="inH">
      <input id="inD">
      <section id="resultsSection"></section>
    </main>
  `, { pretendToBeVisual: true }).window;

  let category = '';
  let searched = false;
  let scrolled = false;
  const searchCompleted = deferred();
  window.document.getElementById('resultsSection').scrollIntoView = () => {
    scrolled = true;
  };

  bindHeroSampleSearches(window.document, {
    setCategory: async (nextCategory) => { category = nextCategory; },
    search: () => {
      searched = true;
      searchCompleted.resolve();
    },
    scrollTarget: () => window.document.getElementById('resultsSection'),
    delayMs: 0,
  });

  window.document.querySelector('[data-sample-search]').click();
  await searchCompleted.promise;

  assert.equal(category, 'dishwasher');
  assert.equal(window.document.getElementById('inW').value, '600');
  assert.equal(window.document.getElementById('inH').value, '850');
  assert.equal(window.document.getElementById('inD').value, '600');
  assert.equal(searched, true);
  assert.equal(scrolled, true);
});

test('hero sample search ignores a stale category completion', async () => {
  const { applyHeroSampleSearch } = await loadHeroFunnel();
  const window = new JSDOM(`
    <main>
      <button data-sample-search='{"cat":"dishwasher","w":600,"h":850,"d":600}'>Dishwasher</button>
      <input id="inW">
      <input id="inH">
      <input id="inD">
      <section id="resultsSection"></section>
    </main>
  `).window;
  let searchCount = 0;
  let scrollCount = 0;
  window.document.getElementById('resultsSection').scrollIntoView = () => {
    scrollCount += 1;
  };

  const applied = await applyHeroSampleSearch(
    window.document.querySelector('[data-sample-search]'),
    {
      root: window.document,
      setCategory: async () => false,
      search: () => { searchCount += 1; },
      scrollTarget: () => window.document.getElementById('resultsSection'),
      delayMs: 0,
    },
  );

  assert.equal(applied, false);
  assert.equal(window.document.getElementById('inW').value, '');
  assert.equal(window.document.getElementById('inH').value, '');
  assert.equal(window.document.getElementById('inD').value, '');
  assert.equal(searchCount, 0);
  assert.equal(scrollCount, 0);
});

test('the latest hero sample keeps its dimensions when an earlier category load completes late', async () => {
  const { applyHeroSampleSearch } = await loadHeroFunnel();
  const window = new JSDOM(`
    <main>
      <button id="dishwasher" data-sample-search='{"cat":"dishwasher","w":600,"h":850,"d":600}'>Dishwasher</button>
      <button id="fridge" data-sample-search='{"cat":"fridge","w":700,"h":1800,"d":650}'>Fridge</button>
      <input id="inW">
      <input id="inH">
      <input id="inD">
      <section id="resultsSection"></section>
    </main>
  `).window;
  const delayedDishwasher = deferred();
  const searches = [];
  let scrollCount = 0;
  window.document.getElementById('resultsSection').scrollIntoView = () => {
    scrollCount += 1;
  };
  const options = {
    root: window.document,
    setCategory: (category) => category === 'dishwasher'
      ? delayedDishwasher.promise
      : Promise.resolve(true),
    search: () => {
      searches.push([
        window.document.getElementById('inW').value,
        window.document.getElementById('inH').value,
        window.document.getElementById('inD').value,
      ]);
    },
    scrollTarget: () => window.document.getElementById('resultsSection'),
    delayMs: 0,
  };

  const first = applyHeroSampleSearch(window.document.getElementById('dishwasher'), options);
  const latest = await applyHeroSampleSearch(window.document.getElementById('fridge'), options);
  delayedDishwasher.resolve(false);
  const stale = await first;

  assert.equal(latest, true);
  assert.equal(stale, false);
  assert.equal(window.document.getElementById('inW').value, '700');
  assert.equal(window.document.getElementById('inH').value, '1800');
  assert.equal(window.document.getElementById('inD').value, '650');
  assert.deepEqual(searches, [['700', '1800', '650']]);
  assert.equal(scrollCount, 1);
});

test('hero sample click handles a rejected category load without an unhandled rejection', async (t) => {
  const { bindHeroSampleSearches } = await loadHeroFunnel();
  const window = new JSDOM(`
    <main>
      <button data-sample-search='{"cat":"dishwasher","w":600,"h":850,"d":600}'>Dishwasher</button>
      <input id="inW">
      <input id="inH">
      <input id="inD">
    </main>
  `).window;
  const categoryLoad = deferred();
  const expectedError = new Error('category unavailable');
  const settled = deferred();
  const onUnhandled = (error) => settled.resolve({ kind: 'unhandled', error });
  process.once('unhandledRejection', onUnhandled);
  t.after(() => process.removeListener('unhandledRejection', onUnhandled));

  bindHeroSampleSearches(window.document, {
    setCategory: () => categoryLoad.promise,
    onError: (error) => settled.resolve({ kind: 'handled', error }),
  });
  window.document.querySelector('[data-sample-search]').click();
  categoryLoad.reject(expectedError);

  const result = await settled.promise;
  assert.equal(result.kind, 'handled');
  assert.equal(result.error, expectedError);
});
