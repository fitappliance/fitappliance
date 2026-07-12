import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const styles = [
  fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8')
].join('\n');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

function makeReplacementProduct(overrides = {}) {
  return {
    id: 'replacement-hisense',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 550,
    h: 1410,
    d: 490,
    stars: 5,
    features: ['Top Mount'],
    searchMode: 'replacement',
    replacementMatch: {
      deltasMm: { width: 1, height: -5, depth: 10 },
      absoluteDeltasMm: { width: 1, height: 5, depth: 10 },
      maxAbsoluteDeltaMm: 10,
      totalAbsoluteDeltaMm: 16,
      normalizedDistance: 0.01,
      relation: 'MIXED'
    },
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-hrtf206' }],
    ...overrides
  };
}

test('dual-mode UI: homepage exposes clear cavity and replacement search mode choices', () => {
  assert.match(indexHtml, /name="searchMode"/);
  assert.match(indexHtml, /value="cavity"/);
  assert.match(indexHtml, /value="replacement"/);
  assert.match(indexHtml, /I measured my empty cavity/);
  assert.match(indexHtml, /I measured my old appliance/);
  assert.match(indexHtml, /data-float-search-mode="cavity"/);
  assert.match(indexHtml, /data-float-search-mode="replacement"/);
});

test('dual-mode UI: search mode state is read from controls before running a search', () => {
  assert.match(indexHtml, /function\s+readSearchModeFromControls/);
  assert.match(indexHtml, /currentSearchMode\s*=\s*readSearchModeFromControls\(\)/);
  assert.match(indexHtml, /function\s+syncSearchModeControls/);
});

test('dual-mode UI: old-appliance lookup is hidden by default and bound to replacement mode', () => {
  assert.match(indexHtml, /data-replacement-finder[^>]*hidden/);
  assert.match(indexHtml, /const\s+isReplacement\s*=\s*mode\s*===\s*'replacement'/);
  assert.match(indexHtml, /replacementFinder\.hidden\s*=\s*!isReplacement/);
});

test('dual-mode UI: selected historical category loads lazily and registry dimensions require confirmation', () => {
  assert.match(indexHtml, /loadReplacementReference/);
  assert.match(indexHtml, /async\s+function\s+ensureReplacementReferenceLoaded/);
  assert.match(indexHtml, /id="replacementDimensionConfirm"/);
  assert.match(indexHtml, /id="applyReplacementDimensionsBtn"/);
  assert.doesNotMatch(indexHtml, /old model dimensions plus practical clearance/i);
  assert.doesNotMatch(indexHtml, /plus practical clearance/i);
});

test('dual-mode UI: hero title and dimension labels use mode-specific terminology', () => {
  assert.match(indexHtml, /Enter your old appliance details/);
  assert.match(indexHtml, /Enter your available cavity space/);
  assert.match(indexHtml, /OLD MACHINE WIDTH/);
  assert.match(indexHtml, /OLD MACHINE HEIGHT/);
  assert.match(indexHtml, /OLD MACHINE DEPTH/);
  assert.match(indexHtml, /CAVITY WIDTH/);
  assert.match(indexHtml, /CAVITY HEIGHT/);
  assert.match(indexHtml, /CAVITY DEPTH/);
});

test('dual-mode UI: replacement guidance never presents old dimensions as cavity or clearance inputs', () => {
  assert.match(indexHtml, /id="dimensionModeHint"/);
  assert.match(indexHtml, /old appliance's maximum outside width/i);
  assert.match(indexHtml, /including feet and hinge caps/i);
  assert.match(indexHtml, /old appliance's maximum outside depth/i);
  assert.match(indexHtml, /no cavity clearance is added/i);
  assert.match(indexHtml, /Compare current models/);
  assert.match(indexHtml, /sampleSearches\.hidden\s*=\s*isReplacement/);
  assert.match(indexHtml, /scoreLink\.hidden\s*=\s*isReplacement/);
  assert.match(indexHtml, /fitCheckerLink\.hidden\s*=\s*isReplacement/);
  assert.match(indexHtml, /Current products are ranked by direct W\/H\/D difference from your old appliance/);
});

test('dual-mode UI: switching modes clears incompatible dimension inputs', () => {
  assert.match(indexHtml, /function\s+clearDimensionInputsForModeSwitch/);
  assert.match(indexHtml, /clearDimensionInputsForModeSwitch\(\)/);
  assert.match(indexHtml, /replacementStatus\.textContent\s*=\s*''/);
});

test('dual-mode UI: every new historical lookup clears dimensions from the previous model', () => {
  assert.match(indexHtml, /function\s+clearReplacementLookupDimensions/);
  const lookupSource = indexHtml.match(/async\s+function\s+useOldModelSize[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(lookupSource, /clearReplacementLookupDimensions\(\)/);
  assert.match(indexHtml, /oldModelInput'[\s\S]*addEventListener\('input'[\s\S]*clearReplacementLookupDimensions\(\)/);
  assert.match(indexHtml, /currentReplacementSourceCategory\s*=\s*''/);
});

test('dual-mode card: replacement rows show size match instead of numeric fit score', async () => {
  const { buildRow } = await import(`${productCardModuleUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeReplacementProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Size Match/);
  assert.match(html, /class="size-match-badge"/);
  assert.match(html, /Compared with old appliance/);
  assert.match(html, /W \+1mm/);
  assert.match(html, /H -5mm/);
  assert.match(html, /D \+10mm/);
  assert.match(html, /Positive means the new appliance is larger/);
  assert.doesNotMatch(html, /Requires minimum cavity|safe ventilation|clearance-bars|delivery-check|Will it make it to your kitchen/);
  assert.doesNotMatch(html, /fit-score-block|fit-score-popover|fit-score-ring/);
});

test('dual-mode card: cavity rows keep the numeric fit score and skip replacement copy', async () => {
  const { buildRow } = await import(`${productCardModuleUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeReplacementProduct({
    searchMode: 'cavity',
    fitScoreNumeric: 92
  }), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /fit-score-popover/);
  assert.doesNotMatch(html, /Size Match/);
  assert.doesNotMatch(html, /Compared with old appliance/);
});

test('dual-mode card: adjustable candidate height is disclosed in replacement results', async () => {
  const { buildRow } = await import(`${productCardModuleUrl}?cacheBust=${Date.now()}`);
  const html = buildRow(makeReplacementProduct({
    replacementMatch: {
      deltasMm: { width: 0, height: 0, depth: 0 },
      maxAbsoluteDeltaMm: 0,
      totalAbsoluteDeltaMm: 0,
      normalizedDistance: 0,
      relation: 'IDENTICAL',
      candidateDimensionSource: 'geometry_v2',
      candidateHeightRangeMm: { minimum: 850, maximum: 895, selected: 870 },
    },
  }), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url,
  });

  assert.match(html, /Adjustable height 850–895mm/);
  assert.match(html, /870mm setting/);
});

test('dual-mode UI: styles define search mode controls and replacement card treatment', () => {
  assert.match(styles, /\.search-mode-toggle/);
  assert.match(styles, /\.search-mode-option/);
  assert.match(styles, /\.size-match-badge/);
  assert.match(styles, /\.replacement-dimension-delta/);
  assert.match(styles, /\.hero-sample-searches\[hidden\][\s\S]*\.hero-secondary-link\[hidden\][\s\S]*display:\s*none\s*!important/);
});

test('dual-mode UI: old appliance dimensions never feed cavity-specific space alerts', () => {
  const functionSource = indexHtml.match(/function\s+renderSpaceAlertsForDimensions[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(functionSource, /normalizeSearchMode\?\.\(currentSearchMode\)/);
  assert.match(functionSource, /===\s*'replacement'/);
  assert.match(functionSource, /container\.hidden\s*=\s*true[\s\S]*container\.innerHTML\s*=\s*''[\s\S]*return/);
  assert.match(indexHtml, /import '\/scripts\/replacement-match-engine\.js';[\s\S]*import '\/scripts\/search-core\.js';/);
});

test('dual-mode UI: replacement search has no implicit doorway or cavity metadata semantics', () => {
  const operationalSource = indexHtml.match(/function\s+filterOperationalPool[\s\S]*?\n}/)?.[0] ?? '';
  const searchSource = indexHtml.match(/function\s+doSearch[\s\S]*?\n}/)?.[0] ?? '';
  assert.doesNotMatch(operationalSource, /:\s*DEFAULT_DOORWAY_MM/);
  assert.match(operationalSource, /const\s+doorwayLimit\s*=\s*currentSearchMode\s*===\s*'replacement'\s*\?\s*doorW\s*:\s*doorW\s*\+\s*50/);
  assert.match(operationalSource, /deliveryW\s*>\s*doorwayLimit/);
  assert.match(searchSource, /currentSearchMode\s*===\s*'cavity'\s*\?\s*DEFAULT_DOORWAY_MM\s*:\s*null/);
  assert.match(searchSource, /ranked by outside-dimension difference/i);
  assert.match(searchSource, /smallest maximum W\/H\/D difference/i);
});

test('dual-mode UI: replacement results clear live fit preview and preserve engine ranking', () => {
  const renderSource = indexHtml.match(/function\s+renderResults[\s\S]*?\n}/)?.[0] ?? '';
  const replacementPreviewBranch = renderSource.match(/if\s*\(currentSearchMode\s*===\s*'replacement'\)\s*\{([\s\S]*?)\}\s*else/)?.[1] ?? '';
  assert.match(renderSource, /orderRowsForDisplay\(filteredResults,\s*\{\s*searchMode:\s*currentSearchMode\s*\}\)/);
  assert.match(replacementPreviewBranch, /renderLiveFitPreview\([^,]+,\s*\{\}\)/);
  assert.doesNotMatch(replacementPreviewBranch, /cavity|clearance|lastSearchFilters/);
});

test('dual-mode UI: replacement compare snapshots carry size deltas instead of fit state', () => {
  const snapshotSource = indexHtml.match(/function\s+buildCompareSnapshotFromProduct[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(snapshotSource, /comparisonMode:\s*'replacement'/);
  assert.match(snapshotSource, /replacementMatch/);
  assert.match(snapshotSource, /if\s*\(isReplacement\)/);
  assert.match(indexHtml, /mode_mismatch/);
});

test('dual-mode UI: entering replacement mode clears cavity-only sort and facet state', () => {
  const modeSource = indexHtml.match(/function\s+setSearchMode[\s\S]*?\n}/)?.[0] ?? '';
  const chromeSource = indexHtml.match(/function\s+renderFacetChrome[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(modeSource, /currentSortBy\s*=\s*normalizeSortForSearchMode\([^,]+,\s*next\)/);
  assert.match(indexHtml, /const\s+REPLACEMENT_DEFAULT_SORT\s*=\s*'closest-size'/);
  assert.match(modeSource, /scoreMin:\s*null/);
  assert.match(modeSource, /verifiedOnly:\s*false/);
  assert.match(chromeSource, /searchMode:\s*currentSearchMode/);
});

test('dual-mode UI: changing category clears an incompatible old-model selection and dimensions', () => {
  const categorySource = indexHtml.match(/async\s+function\s+setCategory[\s\S]*?\n}/)?.[0] ?? '';
  const resetSource = indexHtml.match(/function\s+resetReplacementForCategoryChange[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(categorySource, /resetReplacementForCategoryChange\(nextCat\)/);
  assert.match(resetSource, /replacementModeActive\(\)/);
  assert.match(resetSource, /clearReplacementLookupDimensions\(\)/);
  assert.match(resetSource, /oldModelInput/);
  assert.match(resetSource, /replacementStatus/);
});

test('dual-mode UI: manual dimension edits remove stale historical-model provenance', () => {
  const manualSource = indexHtml.match(/function\s+markReplacementDimensionsAsManual[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(manualSource, /replacementModeActive\(\)/);
  assert.match(manualSource, /currentReplacementSourceCategory\s*=\s*currentCat/);
  assert.match(manualSource, /oldModelInput/);
  assert.match(manualSource, /manually entered old appliance dimensions/i);
  assert.match(indexHtml, /addEventListener\('input',\s*markReplacementDimensionsAsManual\)/);
});

test('dual-mode UI: archived-model CTA enters replacement mode with exact dimensions', () => {
  assert.match(indexHtml, /addEventListener\('fitappliance:replacement-search'/);
  assert.match(indexHtml, /setSearchMode\('replacement'/);
  assert.match(indexHtml, /detail\?\.w[\s\S]*detail\?\.h[\s\S]*detail\?\.d/);
  assert.doesNotMatch(indexHtml, /estimatedCavity|oldW\s*\+\s*20|oldH\s*\+\s*50|oldD\s*\+\s*50/);
});

test('dual-mode UI: empty and capped-result copy stays mode-specific', () => {
  assert.match(indexHtml, /id="emptyStateTitle"/);
  assert.match(indexHtml, /id="emptyStateCopy"/);
  assert.match(indexHtml, /No current products match these filters/);
  assert.match(indexHtml, /closest \$\{RESULTS_CAP\} of \$\{final\.length\} current products/);
});
