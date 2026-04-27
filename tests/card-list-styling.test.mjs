import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1] ?? '';
}

test('phase 48 card redesign styles: card grid uses ecommerce three-column layout', () => {
  const block = blockFor('.card-grid');

  assert.match(block, /display:\s*grid/);
  assert.match(block, /grid-template-columns:\s*auto 1fr auto/);
  assert.match(block, /gap:\s*16px/);
});

test('phase 48 card redesign styles: action column is right aligned on desktop', () => {
  const block = blockFor('.card-action-cell');
  const buttons = blockFor('.card-buttons');

  assert.match(block, /text-align:\s*right/);
  assert.match(block, /min-width:\s*140px/);
  assert.match(buttons, /justify-content:\s*flex-end/);
});

test('phase 48 card redesign styles: mobile collapses actions below product information', () => {
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.match(css, /\.card-grid\s*\{[^}]*grid-template-columns:\s*auto 1fr/);
  assert.match(css, /\.card-action-cell\s*\{[^}]*grid-column:\s*1 \/ -1/);
});
