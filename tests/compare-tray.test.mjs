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

function makeWindow() {
  return new JSDOM('<main><div id="card"></div><div id="tray"></div><div id="modal" hidden></div></main>', { pretendToBeVisual: true }).window;
}

function makeSnapshot(slug, overrides = {}) {
  return {
    slug,
    displayName: `Bosch ${slug}`,
    brand: 'Bosch',
    w: 600,
    h: 1800,
    d: 650,
    retailers: [{ name: 'The Good Guys', price: 1099 }],
    stars: 4,
    ...overrides
  };
}

function makeEntry(slug, overrides = {}) {
  return {
    id: slug,
    snapshot: makeSnapshot(slug, overrides),
    addedAt: '2026-04-26T01:00:00.000Z'
  };
}

function makeStore(initial = []) {
  let rows = [...initial];
  return {
    list() {
      return rows.map((row) => ({ ...row, snapshot: { ...row.snapshot } }));
    },
    add(snapshot) {
      if (rows.some((row) => row.id === snapshot.slug)) return { ok: true, reason: 'duplicate' };
      if (rows.length >= 3) return { ok: false, reason: 'capacity' };
      rows = [...rows, makeEntry(snapshot.slug, snapshot)];
      return { ok: true };
    },
    has(slug) {
      return rows.some((row) => row.id === slug);
    },
    remove(slug) {
      rows = rows.filter((row) => row.id !== slug);
      return { ok: true };
    },
    clear() {
      rows = [];
      return { ok: true };
    }
  };
}

test('phase 45c compare tray: zero items keeps tray hidden', async () => {
  const { renderCompareTray } = await loadSearchDom();
  const window = makeWindow();
  const tray = window.document.getElementById('tray');

  renderCompareTray(tray, { store: makeStore() });

  assert.equal(tray.hidden, true);
});

test('phase 45c compare tray: one item shows tray but disables Compare', async () => {
  const { renderCompareTray } = await loadSearchDom();
  const window = makeWindow();
  const tray = window.document.getElementById('tray');

  renderCompareTray(tray, { store: makeStore([makeEntry('p1')]) });

  assert.equal(tray.hidden, false);
  assert.equal(tray.querySelector('[data-compare-open]').disabled, true);
  assert.match(tray.textContent, /Add at least 2 to compare/);
});

test('phase 45c compare tray: two items enable Compare', async () => {
  const { renderCompareTray } = await loadSearchDom();
  const window = makeWindow();
  const tray = window.document.getElementById('tray');
  let opened = false;

  renderCompareTray(tray, {
    store: makeStore([makeEntry('p1'), makeEntry('p2')]),
    onOpen: () => { opened = true; }
  });
  tray.querySelector('[data-compare-open]').click();

  assert.equal(tray.querySelector('[data-compare-open]').disabled, false);
  assert.equal(opened, true);
});

test('phase 45c compare modal: Compare opens a dialog that closes on Escape', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');
  let closed = false;

  renderCompareModal(modal, {
    items: [makeEntry('p1'), makeEntry('p2')],
    onClose: () => { closed = true; }
  });

  assert.equal(modal.hidden, false);
  assert.equal(modal.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(modal.hidden, true);
  assert.equal(closed, true);
});

test('phase 45c compare modal: focus trap wraps within the dialog', async () => {
  const { renderCompareModal } = await loadSearchDom();
  const window = makeWindow();
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [makeEntry('p1'), makeEntry('p2')]
  });

  const closeButton = modal.querySelector('[data-compare-modal-close]');
  const lastButton = modal.querySelector('[data-compare-modal-action]');
  lastButton.focus();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

  assert.equal(window.document.activeElement, closeButton);
});

test('phase 45c compare button: result card toggle syncs store and selected text', async () => {
  const { buildCardHtml, bindCompareButtons } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('card');
  const store = makeStore();

  mount.innerHTML = buildCardHtml({
    id: 'p1',
    displayName: 'Bosch Serie 4',
    brand: 'Bosch',
    w: 600,
    h: 1800,
    d: 650,
    retailers: [{ n: 'The Good Guys', p: 1099 }],
    stars: 4,
    url: '/?cat=fridge'
  }, { compareStore: store });

  bindCompareButtons(mount, { compareStore: store });
  const button = mount.querySelector('[data-compare-toggle]');
  button.click();

  assert.equal(store.has('p1'), true);
  assert.match(button.textContent, /✓ Compare/);
});
