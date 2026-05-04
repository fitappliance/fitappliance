import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = [
  fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8')
].join('\n');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1] ?? '';
}

test('phase 48 card redesign styles: card grid uses ecommerce three-column layout', () => {
  const block = blockFor('.card-grid');

  assert.match(block, /display:\s*grid/);
  assert.match(block, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(block, /gap:\s*16px/);
});

test('hotfix card layout: compare controls align with the product title on desktop', () => {
  const header = blockFor('.card-info-header');
  const buttons = blockFor('.card-buttons--header');

  assert.match(header, /display:\s*flex/);
  assert.match(header, /justify-content:\s*space-between/);
  assert.match(buttons, /flex-shrink:\s*0/);
  assert.match(buttons, /justify-content:\s*flex-end/);
});

test('phase 48 card redesign styles: retailer action footer spans the content column', () => {
  const block = blockFor('.card-action-cell');

  assert.match(block, /grid-column:\s*2/);
  assert.match(block, /display:\s*flex/);
  assert.match(block, /justify-content:\s*space-between/);
  assert.match(block, /border-top:\s*1px solid #f0eeea/);
});

test('phase 48 card redesign styles: mobile collapses actions below product information', () => {
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.match(css, /\.card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.card-thumb-cell\s*\{[^}]*width:\s*56px/);
  assert.match(css, /\.card-thumb-avatar\s*\{[^}]*width:\s*56px[^}]*height:\s*56px/);
  assert.match(css, /\.card-info-cell\s*\{[^}]*grid-column:\s*1/);
  assert.match(css, /\.card-action-cell\s*\{[^}]*grid-column:\s*1/);
});

test('hotfix mobile card layout: title controls stack instead of squeezing the title beside the avatar', () => {
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.doesNotMatch(css, /@media \(max-width:\s*640px\)[\s\S]*\.card-grid\s*\{[^}]*grid-template-columns:\s*(?:auto|64px)\s+1fr/);
  assert.match(css, /\.card-info-header\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.card-info-header\s*\{[^}]*gap:\s*8px/);
  assert.match(css, /\.card-buttons--header\s*\{[^}]*justify-content:\s*flex-start/);
});

test('hotfix result row layout: product rows keep information column readable beside retailer links', () => {
  const row = blockFor('.p-row');
  const actions = blockFor('.p-row-actions');

  assert.match(row, /grid-template-columns:\s*70px minmax\(0,\s*1fr\)/);
  assert.match(row, /align-items:\s*start/);
  assert.match(actions, /grid-column:\s*2/);
  assert.match(actions, /flex-direction:\s*row/);
  assert.match(actions, /justify-content:\s*space-between/);
  assert.match(actions, /border-top:\s*1px solid var\(--border\)/);
});

test('hotfix result row layout: retailer choices wrap inside the row footer instead of squeezing the title', () => {
  const buttons = blockFor('.p-row-action-buttons');
  const denseRail = blockFor('.p-row-actions .retailer-logo-rail');

  assert.match(buttons, /display:\s*flex/);
  assert.match(buttons, /flex-wrap:\s*wrap/);
  assert.match(buttons, /justify-content:\s*flex-end/);
  assert.match(denseRail, /max-width:\s*none/);
});
