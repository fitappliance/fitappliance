import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const styles = readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');
const deferred = readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');

test('instrument aesthetic exposes RTINGS-style ink and mono design tokens', () => {
  assert.match(styles, /--font-display:/);
  assert.match(styles, /--font-mono:/);
  assert.match(styles, /--ink-primary:\s*#1a1a1a/);
  assert.match(styles, /--line-default:\s*#d0cfc8/);
});

test('body typography and numeric data use display plus tabular mono rules', () => {
  assert.match(styles, /body\s*\{[\s\S]*font-family:\s*var\(--font-display\)/);
  assert.match(styles, /body\s*\{[\s\S]*color:\s*var\(--ink-primary\)/);
  assert.match(styles, /(?:dim-tag|spec-chip|clearance-bar-label)[\s\S]*font-variant-numeric:\s*tabular-nums/);
});

test('product panels use tighter instrument panel radius', () => {
  assert.match(deferred, /\.p-row--rtings[\s\S]*border-radius:\s*4px/);
  assert.match(deferred, /\.card-availability[\s\S]*border-radius:\s*4px/);
});
