import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildRow } = await import(`file://${path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')}`);
const { buildFitCheckPage } = await import(`file://${path.join(repoRoot, 'scripts', 'generate-fit-check-pages.js')}`);

const product = {
  id: 'fridge-test',
  brand: 'Hisense',
  model: 'HRTF206',
  cat: 'fridge',
  w: 550,
  h: 1410,
  d: 490,
  stars: 5,
  kwh_year: 210,
  features: ['Top Mount'],
  retailers: [],
  unavailable: false
};

test('product card renders provenance block from evidence index after data trust line', () => {
  const html = buildRow(product, {
    capturedDate: '2026-05-04',
    evidenceIndex: {
      'fridge-test': {
        verified: true,
        pdfUrl: 'https://example.com/hisense.pdf',
        extractedAt: '2026-05-04',
        source: 'spec_sheet'
      }
    },
    annualEnergyCost: () => '63'
  });

  assert.match(html, /data-trust-line/);
  assert.match(html, /data-provenance data-provenance--verified/);
  assert.ok(html.indexOf('data-trust-line') < html.indexOf('data-provenance'));
  assert.match(html, /Verified against official PDF/);
});

test('product card renders fallback provenance when evidence index has no product entry', () => {
  const html = buildRow(product, {
    evidenceIndex: {},
    annualEnergyCost: () => '63'
  });

  assert.match(html, /data-provenance data-provenance--fallback/);
});

test('fit-check static pages render provenance for generated alternatives', () => {
  const page = buildFitCheckPage(product, 600, [product], {
    evidenceIndex: {
      'fridge-test': {
        verified: true,
        pdfUrl: 'https://example.com/hisense.pdf',
        extractedAt: '2026-05-04',
        source: 'spec_sheet'
      }
    }
  });

  const { html } = page;
  assert.match(html, /data-provenance data-provenance--verified/);
  assert.match(html, /Verified against official PDF/);
  assert.match(html, /https:\/\/example\.com\/hisense\.pdf/);
});
