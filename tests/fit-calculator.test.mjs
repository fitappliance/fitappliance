import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const {
  computeFitResult,
  initFitCalculator,
} = require('../public/js/fit-calculator.js');

const verifiedProduct = {
  brand: 'Hisense',
  model: 'HRCD640TBW',
  data_source: 'official_pdf',
  dimensions: {
    height_mm: 1785,
    width_mm: 912,
    depth_mm: 725,
    door_open_90_depth_mm: 1180,
  },
  clearance_requirements: {
    top_mm: 20,
    left_mm: 10,
    right_mm: 10,
    rear_mm: 30,
  },
  evidence: {
    source_url: 'https://example.com/spec-sheet.pdf',
    verified_at: '2026-05-09',
  },
};

function render(product = verifiedProduct) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://www.fitappliance.com.au/product/hisense-hrcd640tbw',
  });
  const root = dom.window.document.querySelector('#root');
  const controller = initFitCalculator(root, product);
  return { controller, dom, root };
}

function setInput(dom, root, name, value) {
  const input = root.querySelector(`[data-fit-input="${name}"]`);
  input.value = String(value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

test('fit calculator renders compact inputs, spec table, and verified badge', () => {
  const { root } = render();

  assert.equal(root.querySelectorAll('[data-fit-input]').length, 3);
  assert.match(root.textContent, /Base dimensions/i);
  assert.match(root.textContent, /912mm/);
  assert.match(root.textContent, /Door open 90/i);

  const badge = root.querySelector('.fitcalc-verified-badge');
  assert.ok(badge, 'verified badge should render for official PDF data');
  assert.equal(badge.getAttribute('href'), verifiedProduct.evidence.source_url);
  assert.match(badge.textContent, /Verified by Manufacturer/);
});

test('fit calculator shows green pass verdict when cabinet meets required dimensions', () => {
  const { dom, root } = render();

  setInput(dom, root, 'height', 1805);
  setInput(dom, root, 'width', 932);
  setInput(dom, root, 'depth', 755);

  const verdict = root.querySelector('[data-fit-verdict]');
  assert.match(verdict.textContent, /Fits with manufacturer clearance/i);
  assert.ok(verdict.className.includes('border-emerald-500'));
});

test('fit calculator identifies exact failed clearance dimensions', () => {
  const { dom, root } = render();

  setInput(dom, root, 'height', 1790);
  setInput(dom, root, 'width', 920);
  setInput(dom, root, 'depth', 740);

  const verdict = root.querySelector('[data-fit-verdict]');
  assert.match(verdict.textContent, /Left clearance fails: needs 10mm, only have 4mm/);
  assert.match(verdict.textContent, /Right clearance fails: needs 10mm, only have 4mm/);
  assert.match(verdict.textContent, /Top clearance fails: needs 20mm, only have 5mm/);
  assert.match(verdict.textContent, /Rear clearance fails: needs 30mm, only have 15mm/);
  assert.ok(verdict.className.includes('border-amber-500'));
});

test('computeFitResult supports legacy w/h/d fields and reports missing input state', () => {
  const result = computeFitResult(
    {
      w: 600,
      h: 1700,
      d: 650,
      clearance_requirements: { top_mm: 10, left_mm: 5, right_mm: 5, rear_mm: 20 },
    },
    { height: 1710, width: null, depth: 670 },
  );

  assert.equal(result.status, 'incomplete');
  assert.match(result.message, /Enter all three cabinet dimensions/);
  assert.deepEqual(result.required, { height: 1710, width: 610, depth: 670 });
});

test('fit calculator escapes display text and ignores unsafe evidence URLs', () => {
  const { root } = render({
    brand: '<img src=x onerror=alert(1)>',
    model: 'XSS',
    data_source: 'official_pdf',
    dimensions: { height_mm: 100, width_mm: 100, depth_mm: 100 },
    clearance_requirements: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
    evidence: {
      source_url: 'javascript:alert(1)',
      verified_at: '2026-05-09',
    },
  });

  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('.fitcalc-verified-badge'), null);
  assert.doesNotMatch(root.innerHTML, /onerror/);
  assert.match(root.textContent, /Verified source URL unavailable/);
});
