import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')).href;

async function loadProductCard() {
  return import(`${productCardUrl}?cacheBust=${Date.now()}`);
}

function makeProduct(overrides = {}) {
  return {
    id: 'fridge-verified',
    brand: 'Hisense',
    model: 'HRTF206',
    cat: 'fridge',
    w: 550,
    h: 1456,
    d: 562,
    stars: 5,
    fitScoreNumeric: 92,
    fitAxisGaps: [
      { axis: 'width', label: 'W', cavity: 700, appliance: 550, clearanceMm: 10 },
      { axis: 'height', label: 'H', cavity: 1800, appliance: 1456, clearanceMm: 20 },
      { axis: 'depth', label: 'D', cavity: 700, appliance: 562, clearanceMm: 10 }
    ],
    retailers: [],
    ...overrides
  };
}

test('product card renders provenance block after trust line for verified evidence', async () => {
  const { buildRow } = await loadProductCard();
  const html = buildRow(makeProduct(), {
    capturedDate: '2026-05-13',
    annualEnergyCost: () => '80',
    evidenceIndex: {
      'fridge-verified': {
        status: 'verified',
        has_pdf_evidence: true,
        source_url: 'https://example.com/spec.pdf',
        verified_at: '2026-05-07'
      }
    }
  });

  assert.match(html, /data-trust-line/);
  assert.match(html, /provenance-block--verified/);
  assert.ok(html.indexOf('data-trust-line') < html.indexOf('provenance-block--verified'));
  assert.match(html, /Manufacturer PDF/);
});

test('product card renders retailer spec provenance fallback when evidence is missing', async () => {
  const { buildCard } = await loadProductCard();
  const html = buildCard(makeProduct({ id: 'no-evidence' }), {
    annualEnergyCost: () => '80',
    evidenceIndex: {}
  });

  assert.match(html, /provenance-block--fallback/);
  assert.match(html, /Manufacturer PDF verification pending/);
});
