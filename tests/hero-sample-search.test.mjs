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
  window.document.getElementById('resultsSection').scrollIntoView = () => {
    scrolled = true;
  };

  bindHeroSampleSearches(window.document, {
    setCategory: async (nextCategory) => { category = nextCategory; },
    search: () => { searched = true; },
    scrollTarget: () => window.document.getElementById('resultsSection'),
    delayMs: 0,
  });

  window.document.querySelector('[data-sample-search]').click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(category, 'dishwasher');
  assert.equal(window.document.getElementById('inW').value, '600');
  assert.equal(window.document.getElementById('inH').value, '850');
  assert.equal(window.document.getElementById('inD').value, '600');
  assert.equal(searched, true);
  assert.equal(scrolled, true);
});
