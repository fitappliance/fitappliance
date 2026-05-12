import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('phase 58 how-we-score: homepage includes the score explanation section and anchor link', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);

  assert.ok(dom.window.document.querySelector('a[href="#how-we-score"].hero-secondary-link'));
  assert.ok(dom.window.document.querySelector('section#how-we-score'));
});

test('phase 58 how-we-score: section lists the four score factors', () => {
  const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html);
  const sectionText = dom.window.document.getElementById('how-we-score')?.textContent ?? '';

  assert.match(sectionText, /Width spare.*40% weight/s);
  assert.match(sectionText, /Height spare.*30%/s);
  assert.match(sectionText, /Depth spare.*30%/s);
  assert.match(sectionText, /Binding penalty/i);
});
