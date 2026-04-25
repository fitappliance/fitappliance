import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadSearchDom() {
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function makeSheetWindow() {
  return new JSDOM(`
    <main>
      <button type="button" data-mobile-filter-trigger>Filters (0)</button>
      <aside class="sidebar">
        <div class="scard facet-shell">
          <div class="facet-bar" data-facet-bar>
            <button type="button" id="facetA">Bosch</button>
          </div>
        </div>
      </aside>
      <div class="mobile-sheet-overlay" data-mobile-sheet-overlay hidden></div>
      <section class="mobile-sheet" id="mobileFilterSheet" data-mobile-filter-sheet hidden>
        <div class="mobile-sheet__header">
          <h2 id="mobileFilterTitle">Filter results</h2>
          <button type="button" data-mobile-sheet-close>Close</button>
        </div>
        <div class="mobile-sheet__body" data-mobile-sheet-body></div>
        <div class="mobile-sheet__footer">
          <button type="button" data-mobile-clear>Clear all</button>
          <button type="button" data-mobile-apply>Apply (0 results)</button>
        </div>
      </section>
      <button type="button" id="outside">Outside</button>
    </main>
  `, { pretendToBeVisual: true }).window;
}

function setupSheet(window, api, overrides = {}) {
  return api.renderMobileFilterSheet({
    trigger: window.document.querySelector('[data-mobile-filter-trigger]'),
    sheet: window.document.querySelector('[data-mobile-filter-sheet]'),
    overlay: window.document.querySelector('[data-mobile-sheet-overlay]'),
    sheetBody: window.document.querySelector('[data-mobile-sheet-body]'),
    facetBar: window.document.querySelector('[data-facet-bar]'),
    closeButton: window.document.querySelector('[data-mobile-sheet-close]'),
    clearButton: window.document.querySelector('[data-mobile-clear]'),
    applyButton: window.document.querySelector('[data-mobile-apply]'),
    activeFacetCount: 2,
    resultCount: 17,
    ...overrides
  });
}

test('phase 45b mobile sheet: index exposes trigger and CSS hides sidebar facets below 768px', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(indexHtml, /data-mobile-filter-trigger/);
  assert.match(indexHtml, /data-mobile-filter-sheet/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*\.mobile-sheet-trigger\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*\.facet-shell\s*\{[\s\S]*display:\s*none/);
});

test('phase 45b mobile sheet: desktop keeps trigger hidden and facet bar visible', () => {
  const styles = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.mobile-sheet-trigger\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.facet-bar\s*\{[\s\S]*display:\s*flex/);
});

test('phase 45b mobile sheet: opening sheet moves facets and locks body scroll', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');

  setupSheet(window, api);
  trigger.focus();
  trigger.click();

  const sheet = window.document.querySelector('[data-mobile-filter-sheet]');
  assert.equal(sheet.hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(window.document.body.classList.contains('scroll-locked'), true);
  assert.equal(window.document.querySelector('[data-mobile-sheet-body] [data-facet-bar]') !== null, true);
});

test('phase 45b mobile sheet: Escape closes sheet and returns focus to trigger', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');

  setupSheet(window, api);
  trigger.focus();
  trigger.click();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(window.document.querySelector('[data-mobile-filter-sheet]').hidden, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(window.document.activeElement, trigger);
});

test('phase 45b mobile sheet: overlay closes sheet', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');
  const overlay = window.document.querySelector('[data-mobile-sheet-overlay]');

  setupSheet(window, api);
  trigger.click();
  overlay.click();

  assert.equal(window.document.querySelector('[data-mobile-filter-sheet]').hidden, true);
});

test('phase 45b mobile sheet: focus trap wraps Tab within the sheet', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');

  setupSheet(window, api);
  trigger.click();

  const closeButton = window.document.querySelector('[data-mobile-sheet-close]');
  const applyButton = window.document.querySelector('[data-mobile-apply]');
  applyButton.focus();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

  assert.equal(window.document.activeElement, closeButton);

  closeButton.focus();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));

  assert.equal(window.document.activeElement, applyButton);
});

test('phase 45b mobile sheet: dialog aria attributes are applied', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();

  setupSheet(window, api);

  const sheet = window.document.querySelector('[data-mobile-filter-sheet]');
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');
  assert.equal(sheet.getAttribute('role'), 'dialog');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal(sheet.getAttribute('aria-labelledby'), 'mobileFilterTitle');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.textContent, 'Filters (2)');
  assert.equal(window.document.querySelector('[data-mobile-apply]').textContent, 'Apply (17 results)');
});

test('phase 45b mobile sheet: repeated render updates trigger and apply counts', async () => {
  const api = await loadSearchDom();
  const window = makeSheetWindow();
  const trigger = window.document.querySelector('[data-mobile-filter-trigger]');
  const applyButton = window.document.querySelector('[data-mobile-apply]');

  setupSheet(window, api, { activeFacetCount: 1, resultCount: 4 });
  assert.equal(trigger.textContent, 'Filters (1)');
  assert.equal(applyButton.textContent, 'Apply (4 results)');

  setupSheet(window, api, { activeFacetCount: 3, resultCount: 1 });
  assert.equal(trigger.textContent, 'Filters (3)');
  assert.equal(applyButton.textContent, 'Apply (1 result)');
});
