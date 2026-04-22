import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_FILES = [
  'index.html',
  'pages/subscribe.html',
  'scripts/generate-brand-pages.js',
  'scripts/generate-cavity-pages.js',
  'scripts/generate-comparisons.js',
  'scripts/generate-guides.js',
  'scripts/generate-location-pages.js'
];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255
  };
}

function linearize(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test('phase 43a quick wins: --ink-3 reaches WCAG AA contrast against --paper in all source tokens', () => {
  for (const relativePath of TOKEN_FILES) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const ink = source.match(/--ink-3:\s*(#[0-9A-Fa-f]{6})/);
    const paper = source.match(/--paper:\s*(#[0-9A-Fa-f]{6})/);
    assert.ok(ink, `missing --ink-3 token in ${relativePath}`);
    assert.ok(paper, `missing --paper token in ${relativePath}`);

    const ratio = contrastRatio(ink[1], paper[1]);
    assert.ok(ratio >= 4.5, `${relativePath} contrast ${ratio.toFixed(2)} is below 4.5`);
  }
});
