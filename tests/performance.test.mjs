import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('phase 20: lighthouse CI script exists and uses lighthouse package', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'lighthouse-ci.js');
  assert.ok(fs.existsSync(filePath), 'scripts/lighthouse-ci.js should exist');
  const script = fs.readFileSync(filePath, 'utf8');
  assert.match(script, /lighthouse/i);
  assert.match(script, /reports\/lighthouse-/);
});

test('phase 20: lighthouse workflow exists and supports workflow_dispatch', () => {
  const filePath = path.join(process.cwd(), '.github', 'workflows', 'lighthouse.yml');
  assert.ok(fs.existsSync(filePath), '.github/workflows/lighthouse.yml should exist');
  const workflow = fs.readFileSync(filePath, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /upload-artifact/i);
});

test('phase 20: OG generator emits WebP alongside PNG outputs', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'generate-og-images.js');
  const script = fs.readFileSync(filePath, 'utf8');
  assert.match(script, /\.webp\(/, 'generate-og-images.js should write webp assets');
});

test('phase 20: brand pages use picture tags with webp source and explicit image dimensions', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /<picture[\s>]/, 'brand pages should include <picture>');
  assert.match(html, /<source[^>]+type="image\/webp"/, 'picture should include webp source');
  assert.match(html, /<img[^>]+width="\d+"/, 'img should include width');
  assert.match(html, /<img[^>]+height="\d+"/, 'img should include height');
  assert.match(html, /<img[^>]+decoding="async"/, 'img should include decoding async');
});

test('phase 20: non-hero images are lazy-loaded', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /loading="lazy"/, 'at least one non-hero image should be lazy-loaded');
});

test('phase 20: index font loading uses display=swap', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.match(html, /fonts\.googleapis\.com\/css2[^"]*display=swap/);
});
