import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

function makeProduct(overrides = {}) {
  return {
    id: 'fridge-arf3335',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 550,
    h: 1456,
    d: 562,
    stars: 4,
    kwh_year: 219,
    price: null,
    emoji: '🧊',
    door_swing_mm: 550,
    features: ['Upright', '5T', 'Class 5'],
    retailers: [],
    sponsored: false,
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/HRTF206-Spec.pdf',
      verified_at: '2026-05-07',
    },
    ...overrides,
  };
}

test('product-card renders verified fit badge and source-of-truth receipt for PDF evidence', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '66',
  });

  assert.match(html, /class="badge-verified"/);
  assert.match(html, /✓ Verified Fit/);
  assert.match(html, /Dimensions verified against manufacturer spec sheet/);
  assert.match(html, /class="evidence-receipt"/);
  assert.match(html, /Source of Truth:/);
  assert.match(html, /Official Spec Sheet \(PDF\)/);
  assert.match(html, /href="https:\/\/example\.com\/HRTF206-Spec\.pdf"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.match(html, /Extracted: 2026-05-07/);
});

test('product-card omits evidence UI when evidence is absent', async () => {
  const { buildCard } = await import(productCardModuleUrl);
  const html = buildCard(makeProduct({ evidence: undefined }), {
    annualEnergyCost: () => '66',
  });

  assert.doesNotMatch(html, /badge-verified/);
  assert.doesNotMatch(html, /evidence-receipt/);
  assert.doesNotMatch(html, /Source of Truth:/);
});

test('verified evidence styles are declared in public/styles.css', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(css, /\.badge-verified/);
  assert.match(css, /\.evidence-receipt/);
  assert.match(css, /font-family:\s*[^;]*monospace/);
  assert.match(css, /\.evidence-link/);
  assert.match(css, /text-decoration:\s*underline/);
});
