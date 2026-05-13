import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('instrument aesthetic defines mono font and ink tokens', () => {
  const css = readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(css, /--font-mono:/);
  assert.match(css, /--ink-primary:/);
  assert.match(css, /--ink-secondary:/);
  assert.match(css, /--ink-tertiary:/);
  assert.match(css, /--line-default:/);
});

test('instrument aesthetic applies display font to body and rectangular card chrome', () => {
  const css = readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(css, /body\s*\{[^}]*font-family:\s*var\(--font-display\)/s);
  assert.match(css, /\.p-row--rtings,\s*\.p-card--rtings\s*\{[^}]*border-radius:\s*4px/s);
  assert.match(css, /\.card-grid\s*\{[^}]*display:\s*grid[^}]*border-radius:\s*4px/s);
  assert.match(css, /box-shadow:\s*0 0 0 1px #d0cfc8, 0 1px 4px rgba\(0, 0, 0, 0\.04\)/);
});

test('provenance styling uses utilitarian mono receipt treatment', () => {
  const css = readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

  assert.match(css, /\.provenance-block\s*\{/);
  assert.match(css, /font-family:\s*var\(--font-mono/);
  assert.match(css, /\.provenance-block--verified/);
  assert.match(css, /\.provenance-link/);
});
