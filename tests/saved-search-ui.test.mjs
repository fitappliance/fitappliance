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
  return new JSDOM('<main><div id="save"></div><div id="saved"></div></main>', { pretendToBeVisual: true }).window;
}

function makeState(overrides = {}) {
  return {
    cat: 'fridge',
    w: 600,
    h: 1800,
    d: 650,
    tol: 5,
    facets: {
      brand: ['Bosch'],
      priceMin: null,
      priceMax: null,
      stars: 4,
      availableOnly: true
    },
    sortBy: 'best-fit',
    ...overrides
  };
}

function makeStore(initial = []) {
  let rows = [...initial];
  return {
    list() {
      return rows.map((row) => ({ ...row, state: { ...row.state } }));
    },
    save({ name, state }) {
      const existing = rows.find((row) => row.name === name);
      const entry = {
        id: existing?.id ?? `saved-${rows.length + 1}`,
        name,
        state,
        savedAt: '2026-04-26T01:00:00.000Z'
      };
      rows = existing
        ? rows.map((row) => (row.id === existing.id ? entry : row))
        : [...rows, entry].slice(-3);
      return { ok: true, entry };
    },
    remove(id) {
      rows = rows.filter((row) => row.id !== id);
      return { ok: true };
    }
  };
}

test('phase 45c saved-search UI: save button appears only for complete cavity searches', async () => {
  const { renderSaveSearchButton } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('save');

  renderSaveSearchButton(mount, {
    store: makeStore(),
    state: makeState({ h: null })
  });
  assert.equal(mount.querySelector('[data-save-search-button]'), null);

  renderSaveSearchButton(mount, {
    store: makeStore(),
    state: makeState()
  });
  assert.ok(mount.querySelector('[data-save-search-button]'));
});

test('phase 45c saved-search UI: clicking Save search opens a form with an auto-filled name', async () => {
  const { renderSaveSearchButton } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('save');

  renderSaveSearchButton(mount, {
    store: makeStore(),
    state: makeState()
  });
  mount.querySelector('[data-save-search-button]').click();

  const input = mount.querySelector('[data-save-search-name]');
  assert.ok(input);
  assert.match(input.value, /fridge/i);
  assert.match(input.value, /600×1800×650/);
});

test('phase 45c saved-search UI: save updates the saved-search dropdown count', async () => {
  const { renderSaveSearchButton, renderSavedSearchDropdown } = await loadSearchDom();
  const window = makeWindow();
  const saveMount = window.document.getElementById('save');
  const dropdownMount = window.document.getElementById('saved');
  const store = makeStore();

  renderSavedSearchDropdown(dropdownMount, { store });
  assert.match(dropdownMount.textContent, /Saved searches \(0\)/);

  renderSaveSearchButton(saveMount, {
    store,
    state: makeState(),
    onSaved: () => renderSavedSearchDropdown(dropdownMount, { store })
  });
  saveMount.querySelector('[data-save-search-button]').click();
  saveMount.querySelector('[data-save-search-submit]').click();

  assert.match(dropdownMount.textContent, /Saved searches \(1\)/);
});

test('phase 45c saved-search UI: selecting a saved row restores the full SearchState', async () => {
  const { renderSavedSearchDropdown } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('saved');
  const restored = [];
  const state = makeState({ cat: 'dishwasher', w: 600, h: 820, d: 600, sortBy: 'stars' });

  renderSavedSearchDropdown(mount, {
    store: makeStore([{ id: 'saved-1', name: 'Dishwasher run', state, savedAt: '2026-04-26T01:00:00.000Z' }]),
    onRestore: (nextState) => restored.push(nextState)
  });

  mount.querySelector('[data-saved-search-restore]').click();

  assert.deepEqual(restored[0], state);
});

test('phase 45c saved-search UI: delete removes a row from the dropdown', async () => {
  const { renderSavedSearchDropdown } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('saved');
  const store = makeStore([{ id: 'saved-1', name: 'Fridge', state: makeState(), savedAt: '2026-04-26T01:00:00.000Z' }]);

  renderSavedSearchDropdown(mount, { store });
  mount.querySelector('[data-saved-search-remove]').click();

  assert.match(mount.textContent, /No saved searches yet/);
});

test('phase 45c saved-search UI: empty dropdown shows a friendly empty state', async () => {
  const { renderSavedSearchDropdown } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('saved');

  renderSavedSearchDropdown(mount, { store: makeStore() });

  assert.match(mount.textContent, /No saved searches yet/);
});

test('phase 45c saved-search UI: saved search names are rendered without HTML execution', async () => {
  const { renderSavedSearchDropdown } = await loadSearchDom();
  const window = makeWindow();
  const mount = window.document.getElementById('saved');

  renderSavedSearchDropdown(mount, {
    store: makeStore([{
      id: 'saved-evil',
      name: '<img src=x onerror=alert(1)>',
      state: makeState(),
      savedAt: '2026-04-26T01:00:00.000Z'
    }])
  });

  assert.equal(mount.querySelectorAll('img').length, 0);
  assert.equal(mount.querySelector('[onerror]'), null);
  assert.match(mount.textContent, /<img src=x onerror=alert\(1\)>/);
});
