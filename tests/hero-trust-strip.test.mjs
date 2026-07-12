import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('hero trust strip states durable evidence controls instead of stale trust counts', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const items = [...dom.window.document.querySelectorAll('.hero-trust-item')].map((item) => item.textContent.trim());

  assert.equal(items.length, 3);
  assert.equal(items[0], 'Evidence status shown on every result');
  assert.equal(items[1], 'No Verified Fit without complete installation evidence');
  assert.equal(items[2], 'Sources and review dates shown');
  assert.doesNotMatch(items.join(' '), /\d[\d,]*\s+Verified Fit records/i);
  assert.doesNotMatch(items.join(' '), /evidence-backed specs/i);
});

test('homepage evidence explanation includes pending state and the Verified Fit release boundary', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const panel = dom.window.document.querySelector('[aria-label="FitAppliance content quality signals"]')?.textContent ?? '';

  assert.match(panel, /Evidence Pending/);
  assert.match(panel, /Dimensions Verified/);
  assert.match(panel, /Retailer Spec/);
  assert.match(panel, /Verified Fit only when complete installation evidence is present/);
});

test('hero subheadline separates size scoring from the evidence-based fit verdict', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const sub = dom.window.document.getElementById('heroSub')?.textContent.trim();

  assert.equal(sub, 'Enter your cavity. Compare a 0-100 size-margin score with an evidence-based fit verdict.');
});
