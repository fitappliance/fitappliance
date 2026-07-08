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

  assert.match(styles, /body\s*\{[\s\S]*background:\s*#faf8f4;/);
  assert.match(styles, /body\s*\{[\s\S]*margin:\s*0;/);
  assert.match(mobileCss, /\.search-card\s*\{[\s\S]*max-width:calc\(100vw - 32px\);/);
  assert.match(mobileCss, /\.search-card\s*\{[\s\S]*overflow:hidden;/);
  assert.match(mobileCss, /\.search-mode-toggle\s*\{[\s\S]*grid-template-columns:1fr;/);
});

test('mobile visual layout: primary search action appears before optional refinements', () => {
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ctaIndex = home.indexOf('data-search-submit');
  const samplesIndex = home.indexOf('class="hero-sample-searches"');
  const filtersIndex = home.indexOf('class="extra-grid"');
  const hintIndex = home.indexOf('class="sc-hint"');

  assert.notEqual(ctaIndex, -1, 'homepage should include the primary search submit button');
  assert.ok(ctaIndex < samplesIndex, 'primary search action should come before sample searches on mobile');
  assert.ok(ctaIndex < filtersIndex, 'primary search action should come before optional brand and budget filters');
  assert.ok(ctaIndex < hintIndex, 'primary search action should come before explanatory notes');
});

test('mobile visual layout: hero compresses trust proof instead of pushing the search CTA deep below the fold', () => {
  const criticalMobile = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:420px\)/)?.[1] ?? '';
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';
  const trustBlock = mobileCss.match(/\.hero-trust-strip\s*\{([^{}]*)\}/)?.[1] ?? '';

  assert.match(criticalMobile, /\.hero\s*\{[\s\S]*padding:36px 14px 52px;/);
  assert.match(criticalMobile, /\.hero h1\s*\{[\s\S]*font-size:clamp\(34px, 10vw, 44px\);/);
  assert.match(trustBlock, /flex-wrap:nowrap;/);
  assert.match(trustBlock, /overflow-x:auto;/);
  assert.doesNotMatch(trustBlock, /grid-template-columns:1fr;/);
});

test('mobile visual layout: long trust and mode labels wrap instead of overflowing', () => {
  assert.match(blockFor('.hero-trust-item', styles), /overflow-wrap:\s*anywhere;/);
  assert.match(blockFor('.hero-sample-chip', styles), /white-space:\s*normal;/);
  assert.match(blockFor('.hero-sample-chip', styles), /min-height:\s*44px;/);
  assert.match(blockFor('.search-mode-option', styles), /min-width:\s*0;/);
  assert.match(blockFor('.search-mode-option span', styles), /overflow-wrap:\s*anywhere;/);
  assert.match(blockFor('.search-mode-option small', styles), /overflow-wrap:\s*anywhere;/);
});

test('mobile visual layout: compact navigation preserves the primary CTA on phones', () => {
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(mobileCss, /nav\s*\{[\s\S]*padding:0 16px;/);
  assert.match(mobileCss, /\.nav-btn\s*\{[\s\S]*max-width:132px;/);
  assert.match(mobileCss, /\.nav-btn\s*\{[\s\S]*text-overflow:ellipsis;/);
  assert.match(styles, /\.site-header\s*\{[\s\S]*justify-content:\s*space-between;/);
  assert.match(styles, /\.site-header \.brand\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(styles, /\.site-header nav a,\s*[\s\S]*\.site-header nav button\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.site-header nav a:not\(\.btn\),\s*[\s\S]*\.site-header nav button\s*\{[\s\S]*display:\s*none;/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.site-header nav \.btn\s*\{[\s\S]*min-height:\s*44px;/);
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

test('mobile visual layout: compare pages avoid nested vertical table scroll on phones', () => {
  const compareCss = deferred.match(/@media\(max-width:760px\)\{([\s\S]*)$/)?.[1] ?? '';

  assert.match(deferred, /\.compare-static-page\s*\{[\s\S]*width:min\(1120px, calc\(100% - 48px\)\);/);
  assert.match(deferred, /\.compare-static-page\s*\{[\s\S]*box-sizing:border-box;/);
  assert.match(compareCss, /\.compare-static-page\s*\{[\s\S]*width:100%;/);
  assert.match(compareCss, /\.compare-static-page\s*\{[\s\S]*max-width:100vw;/);
  assert.match(compareCss, /\.compare-table-wrap\s*\{[\s\S]*max-height:none;/);
  assert.match(compareCss, /\.compare-table-wrap\s*\{[\s\S]*overflow-x:auto;/);
  assert.match(compareCss, /\.compare-table-wrap\s*\{[\s\S]*overflow-y:visible;/);
  assert.match(compareCss, /\.compare-table--rtings\s*\{[\s\S]*min-width:calc\(132px \+ \(230px \* var\(--compare-count, 2\)\)\);/);
  assert.match(compareCss, /\.compare-remove\s*\{[\s\S]*min-height:44px;/);
});

test('mobile visual layout: compare product headers and help bubbles fit touch screens', () => {
  const compareCss = deferred.match(/@media\(max-width:760px\)\{([\s\S]*)$/)?.[1] ?? '';
  const scoreCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media \(min-width:661px\)/)?.[1] ?? '';

  assert.match(compareCss, /\.compare-product-card\s*\{[\s\S]*grid-template-columns:32px minmax\(0, 1fr\);/);
  assert.match(compareCss, /\.compare-product-avatar\s*\{[\s\S]*width:32px;/);
  assert.match(compareCss, /\.compare-product-copy strong,\s*[\s\S]*\.compare-product-copy span\s*\{[\s\S]*overflow-wrap:anywhere;/);
  assert.match(compareCss, /\.compare-product-copy span:last-child\s*\{[\s\S]*display:none;/);
  assert.match(scoreCss, /\.metric-tooltip__bubble\s*\{[\s\S]*position:fixed;/);
  assert.match(scoreCss, /\.metric-tooltip__bubble\s*\{[\s\S]*left:12px;/);
  assert.match(scoreCss, /\.metric-tooltip__bubble\s*\{[\s\S]*right:12px;/);
});

test('mobile visual layout: product images and lightbox stay scaled for phone screens', () => {
  const mobileCss = deferred.match(/@media\(max-width:660px\)\{([\s\S]*?)@media\(max-width:360px\)/)?.[1] ?? '';

  assert.match(mobileCss, /\.product-photo-thumb\s*\{[\s\S]*width:86px;[\s\S]*height:86px;/);
  assert.match(mobileCss, /\.product-photo-thumb__image\s*\{[\s\S]*padding:6px;/);
  assert.match(mobileCss, /\.product-photo-lightbox__media img\s*\{[\s\S]*max-height:52vh;/);
  assert.match(mobileCss, /\.product-photo-lightbox__copy h3\s*\{[\s\S]*font-size:20px;/);
});

test('mobile visual layout: generated linked pages avoid viewport overflow', () => {
  assert.match(styles, /\.fit-check-page\s*\{[\s\S]*width:\s*min\(980px, calc\(100% - 48px\)\);/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.fit-check-page\s*\{[\s\S]*max-width:\s*100vw;/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.fit-check-page\s*\{[\s\S]*overflow-x:\s*hidden;/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.dimensions-table,\s*[\s\S]*\.clearance-table\s*\{[\s\S]*overflow-x:\s*auto;/);
  assert.match(styles, /\.fit-check-page \.breadcrumb a\s*\{[\s\S]*min-height:\s*44px;/);
});

test('mobile visual layout: static trust page wraps long repository links', () => {
  const editorial = fs.readFileSync(path.join(ROOT, 'pages', 'about', 'editorial-standards.html'), 'utf8');

  assert.match(editorial, /a\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(editorial, /main > a:first-child\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(editorial, /@media \(max-width: 640px\)\s*\{[\s\S]*overflow-x:\s*hidden;/);
});

test('mobile visual layout: standalone tool page keeps controls finger-sized', () => {
  const toolPage = fs.readFileSync(path.join(ROOT, 'pages', 'tools', 'fit-checker.html'), 'utf8');

  assert.match(toolPage, /\.preset-chip\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(toolPage, /button\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(toolPage, /\.back-link,\s*[\s\S]*footer a\s*\{[\s\S]*min-height:\s*44px;/);
});

test('mobile visual layout: homepage secondary controls are touch sized', () => {
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.match(home, /\.topbar a\s*\{[\s\S]*min-height:44px;/);
  assert.match(home, /\.adv-toggle\s*\{[\s\S]*min-height:44px;/);
  assert.match(home, /\.cat-pill\s*\{[\s\S]*min-height:44px;/);
});

test('mobile visual layout: result filter sheet controls are finger-sized', () => {
  assert.match(styles, /\.mobile-sheet-trigger\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(styles, /\.mobile-sheet__close\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px;/);
  assert.match(styles, /\.mobile-sheet__tabs button\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(styles, /\.mobile-sheet__clear,\s*[\s\S]*\.mobile-sheet__apply\s*\{[\s\S]*min-height:\s*44px;/);
});
