import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'public', 'scripts', 'replacement-matcher.mjs');
const require = createRequire(import.meta.url);
const SearchCore = require('../public/scripts/search-core.js');

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
}

function readCatalogProducts(fileName) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', fileName), 'utf8')).products;
}

const catalog = [
  {
    id: 'westinghouse-wtb4600wa',
    cat: 'fridge',
    brand: 'Westinghouse',
    model: 'WTB4600WA',
    displayName: 'Westinghouse WTB4600WA 460L Top Mount Fridge',
    w: 699,
    h: 1725,
    d: 723
  },
  {
    id: 'lg-washer-fv1409h3v',
    cat: 'washing_machine',
    brand: 'LG',
    model: 'FV1409H3V',
    displayName: 'LG 9kg Front Load Washer',
    w: 600,
    h: 850,
    d: 565
  },
  {
    id: 'haier-hrf520bhs',
    cat: 'fridge',
    brand: 'Haier',
    model: 'HRF520BHS French Door 520L',
    displayName: 'Haier Fridge',
    readableSpec: '520L French-Door',
    w: 875,
    h: 1730,
    d: 695
  },
  {
    id: 'dryer-unverified-evd5w',
    cat: 'dryer',
    brand: 'Esatto',
    model: 'EVD5W',
    displayName: 'Esatto EVD5W Vented Dryer',
    priorityScore: 99,
    retailers: [],
    w: 535,
    h: 645,
    d: 530
  },
  {
    id: 'dryer-verified-edv605',
    cat: 'dryer',
    brand: 'Electrolux',
    model: 'EDV605H3WC',
    displayName: 'Electrolux EDV605H3WC 6kg Vented Dryer',
    priorityScore: 60,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/electrolux-edv605h3wc-6kg-vented-dryer/', p: null }
    ],
    w: 596,
    h: 850,
    d: 662
  },
  {
    id: 'dryer-invalid-search-link',
    cat: 'dryer',
    brand: 'Demo',
    model: 'SEARCHONLY',
    displayName: 'Demo Search Link Dryer',
    priorityScore: 120,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/search/?q=demo', p: null }
    ],
    w: 600,
    h: 850,
    d: 600
  }
];

test('phase 52 replacement matcher: finds an old appliance by exact model code', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('Westinghouse WTB4600WA', catalog, { category: 'fridge' });

  assert.equal(match?.product.id, 'westinghouse-wtb4600wa');
  assert.equal(match?.confidence, 'high');
});

test('phase 52 replacement matcher: ignores products outside the selected category', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('FV1409H3V', catalog, { category: 'fridge' });

  assert.equal(match, null);
});

test('phase 52 replacement matcher: turns a matched product into cavity dimensions', async () => {
  const { buildReplacementDimensionState } = await loadModule();

  const state = buildReplacementDimensionState(catalog[0]);

  assert.deepEqual(state.productDimensions, { w: 699, h: 1725, d: 723 });
  assert.deepEqual(state.dimensions, { w: 709, h: 1745, d: 733 });
  assert.match(state.label, /Westinghouse WTB4600WA/);
  assert.match(state.note, /practical clearance/i);
});

test('phase 52 replacement matcher: brand plus old model code matches catalog model with descriptive suffix', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('Haier HRF520BHS', catalog, { category: 'fridge' });

  assert.equal(match?.product.id, 'haier-hrf520bhs');
  assert.equal(match?.confidence, 'high');
  assert.match(match?.label ?? '', /HRF520BHS/);
});

test('phase 52 replacement matcher: dimension state prefers real model labels over generic category display names', async () => {
  const { buildReplacementDimensionState } = await loadModule();

  const state = buildReplacementDimensionState(catalog[2]);

  assert.deepEqual(state.productDimensions, { w: 875, h: 1730, d: 695 });
  assert.deepEqual(state.dimensions, { w: 885, h: 1750, d: 705 });
  assert.equal(state.label, 'Haier HRF520BHS French Door 520L');
  assert.match(state.note, /HRF520BHS/);
});

test('phase 50 replacement matcher: old-model suggestions only include verified retailer product links by default', async () => {
  const { countVerifiedRetailerLinks, getReplacementSuggestionRows } = await loadModule();

  const suggestions = getReplacementSuggestionRows(catalog, { category: 'dryer', limit: 10 });

  assert.deepEqual(suggestions.map((product) => product.id), ['dryer-verified-edv605']);
  assert.equal(countVerifiedRetailerLinks(suggestions[0]), 1);
});

test('phase 52 replacement matcher: old-model suggestions prefer richer verified retailer coverage', async () => {
  const { getReplacementSuggestionRows } = await loadModule();
  const products = [
    {
      id: 'dryer-one-store-high-priority',
      cat: 'dryer',
      brand: 'SingleStore',
      model: 'SS100',
      displayName: 'SingleStore SS100 Dryer',
      priorityScore: 99,
      retailers: [
        { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/singlestore-ss100-dryer/', p: null }
      ],
      w: 600,
      h: 850,
      d: 600
    },
    {
      id: 'dryer-three-store-lower-priority',
      cat: 'dryer',
      brand: 'MultiStore',
      model: 'MS100',
      displayName: 'MultiStore MS100 Dryer',
      priorityScore: 60,
      retailers: [
        { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/multistore-ms100-dryer/', p: null },
        { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/multistore-ms100-dryer', p: null },
        { n: 'Bing Lee', url: 'https://www.binglee.com.au/products/multistore-ms100-dryer', p: null }
      ],
      w: 600,
      h: 850,
      d: 600
    }
  ];

  const suggestions = getReplacementSuggestionRows(products, { category: 'dryer', limit: 2 });

  assert.deepEqual(suggestions.map((product) => product.id), [
    'dryer-three-store-lower-priority',
    'dryer-one-store-high-priority'
  ]);
});

test('phase 50 replacement matcher: retailerOnly matching ignores unverified old catalog rows', async () => {
  const { findReplacementSource } = await loadModule();

  const match = findReplacementSource('Esatto EVD5W', catalog, { category: 'dryer', retailerOnly: true });

  assert.equal(match, null);
});

test('phase 50 replacement matcher: real non-fridge suggestions are buyable by default', async () => {
  const { getReplacementSuggestionRows, hasVerifiedRetailerLink } = await loadModule();
  const cases = [
    ['washing_machine', 'washing-machines.json'],
    ['dishwasher', 'dishwashers.json'],
    ['dryer', 'dryers.json']
  ];

  for (const [category, fileName] of cases) {
    const suggestions = getReplacementSuggestionRows(readCatalogProducts(fileName), { category, limit: 20 });
    assert.ok(suggestions.length > 0, `${category} should expose at least one verified old-model suggestion`);
    assert.ok(
      suggestions.every((product) => hasVerifiedRetailerLink(product)),
      `${category} suggestions should all have verified retailer product links`
    );
  }
});

test('phase 52 replacement matcher: suggested dishwasher dimensions still return verified retailer rows under practical clearance', async () => {
  const { buildReplacementDimensionState, getReplacementSuggestionRows } = await loadModule();
  const products = readCatalogProducts('dishwashers.json');
  const [suggestion] = getReplacementSuggestionRows(products, { category: 'dishwasher', limit: 1 });

  const state = buildReplacementDimensionState(suggestion);
  const result = SearchCore.searchWithFacets(products, {
    cat: 'dishwasher',
    ...state.dimensions,
    clearanceMode: 'practical'
  }, {}, {
    retailerOnly: true,
    limit: Number.MAX_SAFE_INTEGER
  });

  assert.ok(result.rows.length > 0, 'old-appliance estimated cavity should produce retailer-backed dishwasher results');
  assert.ok(result.rows.every((row) => SearchCore.hasRetailerLink(row)));
});

test('phase 52 replacement matcher: every real old-model suggestion yields at least one verified result after practical buffer', async () => {
  const { buildReplacementDimensionState, getReplacementSuggestionRows } = await loadModule();
  const cases = [
    ['fridge', 'fridges.json'],
    ['washing_machine', 'washing-machines.json'],
    ['dishwasher', 'dishwashers.json'],
    ['dryer', 'dryers.json']
  ];

  for (const [category, fileName] of cases) {
    const products = readCatalogProducts(fileName);
    const suggestions = getReplacementSuggestionRows(products, { category, limit: 200 });
    assert.ok(suggestions.length > 0, `${category} should expose old-model suggestions`);

    for (const suggestion of suggestions) {
      const state = buildReplacementDimensionState(suggestion);
      const result = SearchCore.searchWithFacets(products, {
        cat: category,
        ...state.dimensions,
        clearanceMode: 'practical'
      }, {}, {
        retailerOnly: true,
        limit: Number.MAX_SAFE_INTEGER
      });

      assert.ok(
        result.rows.length > 0,
        `${category} ${suggestion.brand} ${suggestion.model} should yield at least one verified-retailer result`
      );
    }
  }
});
