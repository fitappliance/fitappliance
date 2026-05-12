import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compareTablePath = path.join(repoRoot, 'public', 'scripts', 'ui', 'compare-table.js');
const searchDomPath = path.join(repoRoot, 'public', 'scripts', 'search-dom.js');

async function loadModules() {
  await import(`${pathToFileURL(compareTablePath).href}?cacheBust=${Date.now()}`);
  const module = await import(`${pathToFileURL(searchDomPath).href}?cacheBust=${Date.now()}`);
  return module.default ?? module['module.exports'] ?? module;
}

function entry(slug, overrides = {}) {
  return {
    id: slug,
    addedAt: '2026-05-12T00:00:00.000Z',
    snapshot: {
      slug,
      displayName: `Product ${slug}`,
      brand: 'LG',
      model: slug.toUpperCase(),
      w: 600,
      h: 1700,
      d: 650,
      fitScoreNumeric: 90,
      practicalClearance: { side: 5, top: 20, rear: 10 },
      manufacturerClearance: { side: 10, top: 50, rear: 50 },
      retailers: [{ name: 'JB Hi-Fi', price: 1200 }],
      stars: 4,
      ...overrides
    }
  };
}

test('phase 58 compare modal: uses new compare table and exposes table actions', async () => {
  const { renderCompareModal } = await loadModules();
  const { window } = new JSDOM('<div id="modal" hidden></div>', { pretendToBeVisual: true });
  const modal = window.document.getElementById('modal');
  const events = [];

  renderCompareModal(modal, {
    items: [entry('one'), entry('two', { brand: 'Samsung', model: 'TWO' })],
    onRemove: (id) => events.push(`remove:${id}`),
    onClear: () => events.push('clear'),
    onAddAnother: () => events.push('add')
  });

  assert.equal(modal.hidden, false);
  assert.ok(modal.querySelector('.compare-table--rtings'), 'new full-width table should render');
  modal.querySelector('[data-compare-remove="one"]').click();
  modal.querySelector('[data-compare-clear-all]').click();
  modal.querySelector('[data-compare-add-another]').click();
  assert.deepEqual(events, ['remove:one', 'clear', 'add']);
});

test('phase 58 compare modal: row tooltip controls remain keyboard/click reachable', async () => {
  const { renderCompareModal } = await loadModules();
  const { window } = new JSDOM('<div id="modal" hidden></div>', { pretendToBeVisual: true });
  const modal = window.document.getElementById('modal');

  renderCompareModal(modal, {
    items: [entry('one'), entry('two')]
  });

  const tooltip = modal.querySelector('.metric-tooltip[role="button"]');
  assert.ok(tooltip, 'metric row should expose tooltip from dictionary');
  assert.match(tooltip.getAttribute('aria-label'), /Side space|air gap|score|clearance/i);
});
