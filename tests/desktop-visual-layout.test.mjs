import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const criticalCss = home.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const deferred = fs.readFileSync(path.join(ROOT, 'public', 'styles-deferred.css'), 'utf8');

function blockFor(selector, css = criticalCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match?.[1] ?? '';
}

test('desktop visual layout: hero uses a two-column tool-first composition', () => {
  const copyIndex = home.indexOf('class="hero-copy"');
  const searchIndex = home.indexOf('class="search-card"');
  const desktopCss = criticalCss.match(/@media\(min-width:960px\)\{([\s\S]*?)@media\(max-width:768px\)/)?.[1] ?? '';

  assert.ok(copyIndex > 0, 'hero should have a dedicated copy column');
  assert.ok(copyIndex < searchIndex, 'hero copy should sit before the search panel in source order');
  assert.match(desktopCss, /\.hero-inner\s*\{[\s\S]*display:grid;/);
  assert.match(desktopCss, /\.hero-inner\s*\{[\s\S]*grid-template-columns:minmax\(0,\.9fr\) minmax\(560px,680px\);/);
  assert.match(desktopCss, /\.hero-inner\s*\{[\s\S]*max-width:1180px;/);
  assert.match(desktopCss, /\.hero\s*\{[\s\S]*padding:52px 32px 72px;/);
});

test('desktop visual layout: primary search action remains before optional refinements', () => {
  const ctaIndex = home.indexOf('data-search-submit');
  const samplesIndex = home.indexOf('class="hero-sample-searches"');
  const filtersIndex = home.indexOf('class="extra-grid"');
  const advancedIndex = home.indexOf('id="advToggle"');
  const hintIndex = home.indexOf('class="sc-hint"');
  const desktopCss = criticalCss.match(/@media\(min-width:960px\)\{([\s\S]*?)@media\(max-width:768px\)/)?.[1] ?? '';

  assert.notEqual(ctaIndex, -1, 'homepage should expose the primary search submit button');
  assert.ok(ctaIndex < samplesIndex, 'sample searches should not sit above the primary search action');
  assert.ok(ctaIndex < filtersIndex, 'brand and budget filters should stay below the primary action');
  assert.ok(ctaIndex < advancedIndex, 'advanced options should stay below the primary action');
  assert.ok(ctaIndex < hintIndex, 'explanatory notes should stay below the primary action');
  assert.match(desktopCss, /\.search-card\s*\{[\s\S]*padding:24px 28px 24px;/);
  assert.match(desktopCss, /\.search-mode-toggle\s*\{[\s\S]*margin:0 0 12px;/);
  assert.match(blockFor('.btn-search > *'), /pointer-events:none;/);
  assert.match(home, /function\s+renderSpaceAlertsFromInputs\(\)/);
  assert.match(home, /addEventListener\('input', renderSpaceAlertsFromInputs\)/);
});

test('desktop visual layout: hero trust proof is compact and does not separate the title from the tool', () => {
  const trustIndex = home.indexOf('class="hero-trust-strip"');
  const searchIndex = home.indexOf('class="search-card"');
  const desktopCss = criticalCss.match(/@media\(min-width:960px\)\{([\s\S]*?)@media\(max-width:768px\)/)?.[1] ?? '';

  assert.ok(trustIndex > 0, 'homepage should keep trust proof near the hero');
  assert.ok(trustIndex < searchIndex, 'trust proof should remain in the copy column before the search panel');
  assert.match(desktopCss, /\.hero-trust-strip\s*\{[\s\S]*justify-content:flex-start;/);
  assert.match(desktopCss, /\.hero-trust-strip\s*\{[\s\S]*margin-bottom:0;/);
  assert.match(desktopCss, /\.hero-trust-item\s*\{[\s\S]*white-space:normal;/);
});

test('desktop visual layout: result pages reserve a wider main track with a stable sidebar rail', () => {
  assert.match(deferred, /\.results-wrap\s*\{[\s\S]*max-width:1280px;/);
  assert.match(deferred, /\.results-wrap\s*\{[\s\S]*padding:44px 32px 90px;/);
  assert.match(deferred, /\.results-body\s*\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 320px;/);
  assert.match(deferred, /\.results-body\s*\{[\s\S]*gap:32px;/);
});
