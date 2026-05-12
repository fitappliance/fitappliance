import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesPath = path.join(repoRoot, 'public', 'styles.css');
const indexPath = path.join(repoRoot, 'index.html');

test('phase 58 sticky sidebar: facet sidebar uses sticky desktop positioning', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /class="sidebar facet-sidebar"/);
  assert.match(css, /\.facet-sidebar\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.facet-sidebar\s*\{[^}]*max-height:\s*calc\(100vh - 100px\)/s);
});

test('phase 58 sticky sidebar: mobile media query disables sticky behavior', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*\.facet-sidebar\s*\{[\s\S]*position:\s*static/s);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*\.facet-sidebar\s*\{[\s\S]*max-height:\s*none/s);
});
