import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const styles = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const deferred = fs.readFileSync(path.join(ROOT, 'public', 'styles-deferred.css'), 'utf8');

function blockFor(selector, css = deferred) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match?.[1] ?? '';
}

test('mobile visual layout: small screens use a single-column dimension form', () => {
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(mobileCss, /\.dim-grid\s*\{\s*grid-template-columns:1fr;\s*\}/);
  assert.doesNotMatch(mobileCss, /\.dim-grid\s*\{\s*grid-template-columns:1fr 1fr;\s*\}/);
});

test('mobile visual layout: search shell cannot exceed phone viewport width', () => {
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(mobileCss, /\.search-card\s*\{[\s\S]*max-width:calc\(100vw - 32px\);/);
  assert.match(mobileCss, /\.search-card\s*\{[\s\S]*overflow:hidden;/);
  assert.match(mobileCss, /\.search-mode-toggle\s*\{[\s\S]*grid-template-columns:1fr;/);
});

test('mobile visual layout: long trust and mode labels wrap instead of overflowing', () => {
  assert.match(blockFor('.hero-trust-item', styles), /overflow-wrap:\s*anywhere;/);
  assert.match(blockFor('.hero-sample-chip', styles), /white-space:\s*normal;/);
  assert.match(blockFor('.search-mode-option', styles), /min-width:\s*0;/);
  assert.match(blockFor('.search-mode-option span', styles), /overflow-wrap:\s*anywhere;/);
  assert.match(blockFor('.search-mode-option small', styles), /overflow-wrap:\s*anywhere;/);
});

test('mobile visual layout: compact navigation preserves the primary CTA on phones', () => {
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(mobileCss, /nav\s*\{[\s\S]*padding:0 16px;/);
  assert.match(mobileCss, /\.nav-btn\s*\{[\s\S]*max-width:132px;/);
  assert.match(mobileCss, /\.nav-btn\s*\{[\s\S]*text-overflow:ellipsis;/);
});

test('mobile visual layout: closed score popovers do not create horizontal scroll', () => {
  assert.match(deferred, /\.fit-score-popover:not\(\[open\]\) \.fit-score-popover__panel\s*\{[\s\S]*display:none;/);
  assert.match(deferred, /\.metric-tooltip__bubble\s*\{[\s\S]*display:none;/);
  assert.match(deferred, /\.metric-tooltip:hover \.metric-tooltip__bubble,\s*[\s\S]*\.metric-tooltip:focus-within \.metric-tooltip__bubble\s*\{[\s\S]*display:block;/);

  const scoreCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media \(min-width:661px\)/)?.[1] ?? '';
  assert.match(scoreCss, /\.fit-score-popover__panel\s*\{[\s\S]*position:fixed;/);
  assert.match(scoreCss, /\.fit-score-popover__panel\s*\{[\s\S]*left:12px;/);
  assert.match(scoreCss, /\.score-breakdown__table\s*\{[\s\S]*table-layout:fixed;/);
  assert.match(scoreCss, /\.score-breakdown__table th,\s*[\s\S]*\.score-breakdown__table td\s*\{[\s\S]*white-space:normal;/);
});

test('mobile visual layout: floating result controls stay inside phone viewport', () => {
  const scoreCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media \(min-width:661px\)/)?.[1] ?? '';
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(scoreCss, /\.float-bar\s*\{[\s\S]*width:100vw;/);
  assert.match(scoreCss, /\.float-bar\s*\{[\s\S]*overflow:hidden;/);
  assert.match(scoreCss, /\.float-bar-summary\s*\{[\s\S]*text-overflow:ellipsis;/);
  assert.match(mobileCss, /\.live-fit-preview\s*\{[\s\S]*left:12px;/);
  assert.match(mobileCss, /\.live-fit-preview\s*\{[\s\S]*width:auto;/);
  assert.match(mobileCss, /\.live-fit-preview\.is-collapsed\s*\{[\s\S]*width:58px;[\s\S]*height:58px;/);
  assert.match(mobileCss, /\.live-fit-preview__panel\[hidden\]\s*\{[\s\S]*display:none;/);
});

test('mobile visual layout: retailer summary CTA stacks instead of squeezing text', () => {
  const mobileCss = styles.match(/@media \(max-width: 767px\) \{([\s\S]*?)\.mobile-sheet \.facet-shell,/m)?.[1] ?? '';

  assert.match(mobileCss, /\.retailer-filter-banner\s*\{[\s\S]*flex-direction:\s*column;/);
  assert.match(mobileCss, /\.retailer-filter-banner \.secondary\s*\{[\s\S]*width:\s*100%;/);
});
