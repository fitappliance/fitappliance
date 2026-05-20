import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function auditTrustCounts() {
  const audit = readFileSync(path.join(repoRoot, 'reports', 'FULL-CATALOG-AUDIT.md'), 'utf8');
  const verifiedFit = Number(audit.match(/- Verified Fit: (\d+)/)?.[1] ?? Number.NaN);
  const dimensionsVerified = Number(audit.match(/- Dimensions Verified: (\d+)/)?.[1] ?? Number.NaN);
  const retailerSpec = Number(audit.match(/- Retailer Spec: (\d+)/)?.[1] ?? Number.NaN);

  assert.ok(Number.isFinite(verifiedFit), 'audit report must include Verified Fit count');
  assert.ok(Number.isFinite(dimensionsVerified), 'audit report must include Dimensions Verified count');
  assert.ok(Number.isFinite(retailerSpec), 'audit report must include Retailer Spec count');

  return {
    verifiedFit,
    evidenceBacked: verifiedFit + dimensionsVerified + retailerSpec,
  };
}

test('phase 58 hero trust strip: renders appliance count, trust-tier evidence count, and update cadence', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const items = [...dom.window.document.querySelectorAll('.hero-trust-item')].map((item) => item.textContent.trim());
  const { verifiedFit, evidenceBacked } = auditTrustCounts();

  assert.equal(items.length, 3);
  assert.match(items[0], /2,170\+ Australian appliances/);
  assert.match(items[1], new RegExp(`${verifiedFit.toLocaleString()} Verified Fit records`));
  assert.match(items[1], new RegExp(`${evidenceBacked.toLocaleString()} evidence-backed specs`));
  assert.doesNotMatch(items[1], /PDF evidence sources verified/);
  assert.match(items[2], /Updated daily/);
});

test('phase 58 hero trust strip: hero subheadline is the input-first Fit Score value prop', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const sub = dom.window.document.getElementById('heroSub')?.textContent.trim();

  assert.equal(sub, 'Enter your cavity. Get a 0-100 Fit Score for every appliance that fits.');
});
