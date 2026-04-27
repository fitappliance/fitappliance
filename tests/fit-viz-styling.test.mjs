import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1] ?? '';
}

test('phase 48 card polish: fit visualization panel is capped and centered', () => {
  const block = blockFor('.fit-viz-group');

  assert.match(block, /margin:\s*12px auto 16px/);
  assert.match(block, /max-width:\s*380px/);
  assert.match(block, /border-radius:\s*8px/);
});

test('phase 48 card polish: fit visualization panes use compact SVG sizing', () => {
  const row = blockFor('.fit-viz-row');
  const pane = blockFor('.fit-viz-pane');
  const svg = blockFor('.fit-viz-pane svg');

  assert.match(row, /gap:\s*12px/);
  assert.match(pane, /align-items:\s*center/);
  assert.match(svg, /max-width:\s*110px/);
});

test('phase 48 card polish: mobile fit visualization fills available width without oversized desktop panes', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.fit-viz-group\s*\{[^}]*max-width:\s*100%/);
  assert.match(css, /\.fit-viz-pane svg\s*\{[^}]*max-width:\s*180px/);
});

test('phase 48 card polish 2: fit visualization no longer uses previous oversized caps', () => {
  assert.doesNotMatch(css, /max-width:\s*520px/);
  assert.doesNotMatch(css, /max-width:\s*150px/);
  assert.doesNotMatch(css, /max-width:\s*220px/);
});

test('phase 48 card polish 2: fit visualization caption is reduced with the panel', () => {
  const block = blockFor('.fit-viz-group figcaption');

  assert.match(block, /font-size:\s*11px/);
});

test('phase 48 card polish: product thumbnails use compact card dimensions', () => {
  const block = blockFor('.fit-thumb');

  assert.match(block, /width:\s*80px/);
  assert.match(block, /height:\s*80px/);
  assert.match(block, /border-radius:\s*10px/);
});

test('phase 48 card polish: mobile product thumbnails shrink to 64px', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.fit-thumb\s*\{[^}]*width:\s*64px;[^}]*height:\s*64px/);
});

test('phase 48 card polish: online compare button uses one clear CTA style', () => {
  const block = blockFor('.btn-search-online');
  const hover = blockFor('.btn-search-online:hover');
  const note = blockFor('.btn-search-note');

  assert.match(block, /display:\s*inline-flex/);
  assert.match(block, /flex-direction:\s*column/);
  assert.match(block, /border:\s*1px solid #d97706/);
  assert.match(block, /font-size:\s*13px/);
  assert.match(hover, /background:\s*#d97706/);
  assert.match(note, /font-size:\s*10px/);
  assert.match(note, /color:\s*#888/);
});

test('phase 48 card polish 2: online search note turns white on hover', () => {
  const hoverNote = blockFor('.btn-search-online:hover .btn-search-note');

  assert.match(hoverNote, /color:\s*#fff/);
});
