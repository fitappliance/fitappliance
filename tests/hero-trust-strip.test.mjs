import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function approvedPdfEvidenceCount() {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'data', 'manual-evidence.json'), 'utf8'));
  return Object.values(manifest.products ?? {}).filter((entry) => (
    Array.isArray(entry.evidence)
    && entry.evidence.some((evidence) => evidence?.status === 'approved' && evidence?.source_url)
  )).length;
}

test('phase 58 hero trust strip: renders appliance count, verified PDF count, and update cadence', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const items = [...dom.window.document.querySelectorAll('.hero-trust-item')].map((item) => item.textContent.trim());

  assert.equal(items.length, 3);
  assert.match(items[0], /2,170\+ Australian appliances/);
  assert.match(items[1], new RegExp(`${approvedPdfEvidenceCount().toLocaleString()} manufacturer PDFs verified`));
  assert.match(items[2], /Updated daily/);
});

test('phase 58 hero trust strip: hero subheadline is the input-first Fit Score value prop', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const sub = dom.window.document.getElementById('heroSub')?.textContent.trim();

  assert.equal(sub, 'Enter your cavity. Get a 0-100 Fit Score for every appliance that fits.');
});
