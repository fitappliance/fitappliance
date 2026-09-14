import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const heroFunnelPath = path.join(repoRoot, 'public', 'scripts', 'ui', 'hero-funnel.js');

async function loadIndexHtml() {
  return readFile(indexHtmlPath, 'utf8');
}

async function loadHeroFunnel() {
  return import(`${pathToFileURL(heroFunnelPath).href}?cacheBust=${Date.now()}`);
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing production source: ${start}`);
  assert.notEqual(endIndex, -1, `missing production source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(payload, { ok = true, status = 200, url = '/data/test.json' } = {}) {
  return {
    ok,
    status,
    url,
    json: async () => payload,
  };
}

async function createCategoryHarness(fetchImpl) {
  const html = await loadIndexHtml();
  const readUrlParamCatSource = sourceBetween(html, 'function readUrlParamCat()', '\nasync function loadCategory');
  const loadCategorySource = sourceBetween(html, 'async function loadCategory(cat)', '\nasync function bootstrapApplianceData');
  const bootstrapSource = sourceBetween(html, 'async function bootstrapApplianceData()', '\nfunction startEvidenceIndexLoad');
  const readCompareIntentSource = sourceBetween(html, 'function readCompareIntent(', '\nasync function readUrlParams');
  const readUrlParamsSource = sourceBetween(html, 'async function readUrlParams(', '\nasync function setCategory');
  const setCategorySource = sourceBetween(html, 'async function setCategory(cat,', '\nwindow.jumpToCategory');
  const applySavedApplianceSource = sourceBetween(html, 'async function applySavedApplianceForReplacement(', '\nfunction fillReplacementDimensions');
  const restoreSavedSearchSource = sourceBetween(html, 'async function restoreSavedSearchState(', '\nfunction renderFacetChrome');
  const applySearchSource = sourceBetween(html, 'async function applySearch(', '\nfunction clearSearchHistoryUi');

  return new Function('fetchImpl', `
    let PRODUCTS = [];
    let APPLIANCES_META = null;
    const loadedCats = new Set();
    const CATEGORY_CAPTURED_DATES = {};
    const CATEGORY_DATA_FILES = {
      fridge: '/data/fridges.json',
      washing_machine: '/data/washing-machines.json',
      dishwasher: '/data/dishwashers.json',
      dryer: '/data/dryers.json',
    };
    const VALID_CATEGORIES = ['fridge', 'washing_machine', 'dishwasher', 'dryer'];
    let currentCat = 'fridge';
    let categoryIntent = 0;
    const pendingCategoryLoads = new Map();
    let COMPARE_INTENT = null;
    let activeFacetState = { priceMax: null };
    let currentClearanceMode = 'practical';
    let currentSearchMode = 'cavity';
    let currentSortBy = 'fit-score-desc';
    let currentReplacementSourceCategory = '';
    const CAVITY_DEFAULT_SORT = 'fit-score-desc';
    const productGrid = { innerHTML: '' };
    const search = { scrollIntoView() {} };
    const formInputs = new Map([
      'inW', 'inH', 'inD', 'inDoor', 'inDwelling', 'inBudget', 'inBrand'
    ].map((id) => [id, { value: '' }]));
    const replacementStatus = { textContent: '' };
    const resultsSection = { scrollIntoView() {} };
    const categoryPills = new Map(VALID_CATEGORIES.map((cat) => {
      const classes = new Set();
      return [cat, {
        dataset: { cat },
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          contains(name) { return classes.has(name); },
        },
      }];
    }));
    const document = {
      getElementById(id) {
        if (id === 'productGrid') return productGrid;
        if (id === 'search') return search;
        if (id === 'resultsSection') return resultsSection;
        if (id === 'replacementStatus') return replacementStatus;
        if (formInputs.has(id)) return formInputs.get(id);
        return null;
      },
      querySelector(selector) {
        const category = selector.match(/data-cat=\\"([^\\"]+)\\"/)?.[1];
        return category ? categoryPills.get(category) : null;
      },
      querySelectorAll(selector) {
        return selector === '.cat-pill' ? [...categoryPills.values()] : [];
      },
    };
    const window = { location: { search: '' } };
    const freshnessDates = [];
    const searchCalls = [];
    const searchModeChanges = [];
    let savedInventory = [];
    let parsedUrlState = {
      cat: null,
      w: null,
      h: null,
      d: null,
      facets: { priceMax: null },
      retailerOnly: false,
      clearanceMode: 'practical',
      searchMode: 'cavity',
      sortBy: null,
      replacementSourceCategory: ''
    };
    const fetch = fetchImpl;
    const SearchCore = {
      parseSearchParams() { return parsedUrlState; },
      normalizeSearchMode(value) { return value || 'cavity'; },
      normalizeClearanceMode(value) { return value || 'practical'; },
      normalizeReplacementSourceCategory(value) { return value || ''; }
    };
    function requireJson(result) {
      if (!result.ok) throw new Error(\`Failed to load \${result.url}: \${result.status}\`);
      return result.json();
    }
    function renderFreshnessBanner(value) {
      freshnessDates.push(value);
    }
    function startEvidenceIndexLoad() {}
    function resetReplacementForCategoryChange() {}
    function refreshBrandOptions() {}
    function renderSavedApplianceChips() {}
    function updateFloatBarSummary() {}
    function normalizeHomeFacets(value) { return { priceMax: null, ...value }; }
    function normalizeSortForSearchMode(value) { return value; }
    function syncSearchModeControls() {}
    function syncLegacyFacetInputs() {}
    function doSearch(options) { searchCalls.push(options ?? null); }
    function setSearchMode(mode) {
      currentSearchMode = mode;
      searchModeChanges.push(mode);
    }
    function categoryForReplacementSearch(category) { return category; }
    function savedApplianceLabel(item) { return item.name || item.id; }
    function showToast() {}
    const accountStore = {
      listInventory() { return savedInventory; }
    };
    ${readUrlParamCatSource}
    ${loadCategorySource}
    ${bootstrapSource}
    ${readCompareIntentSource}
    ${readUrlParamsSource}
    ${setCategorySource}
    ${applySavedApplianceSource}
    ${restoreSavedSearchSource}
    ${applySearchSource}
    return {
      loadCategory,
      bootstrapApplianceData,
      setCategory,
      readUrlParams,
      applySavedApplianceForReplacement,
      restoreSavedSearchState,
      applySearch,
      setMeta(value) { APPLIANCES_META = value; },
      setUrlState(search, state) {
        window.location.search = search;
        parsedUrlState = {
          ...parsedUrlState,
          ...state,
          facets: state.facets ?? parsedUrlState.facets
        };
      },
      setInventory(value) { savedInventory = value; },
      root: document,
      state() {
        return {
          products: PRODUCTS.map((product) => ({ ...product })),
          productIds: PRODUCTS.map((product) => product.id),
          loadedCats: [...loadedCats],
          capturedDates: { ...CATEGORY_CAPTURED_DATES },
          freshnessDates: [...freshnessDates],
          currentCat,
          categoryIntent,
          activeCategories: [...categoryPills.entries()]
            .filter(([, pill]) => pill.classList.contains('active'))
            .map(([category]) => category),
          dimensions: Object.fromEntries(['inW', 'inH', 'inD']
            .map((id) => [id, formInputs.get(id).value])),
          inputs: Object.fromEntries([...formInputs.entries()]
            .map(([id, input]) => [id, input.value])),
          searchCalls: [...searchCalls],
          searchModeChanges: [...searchModeChanges],
          replacementStatus: replacementStatus.textContent,
          currentReplacementSourceCategory,
          productGridHtml: productGrid.innerHTML,
        };
      },
    };
  `)(fetchImpl);
}

async function createCategoryErrorBoundaryHarness() {
  const html = await loadIndexHtml();
  const renderSavedSearchControlsSource = sourceBetween(
    html,
    'function renderSavedSearchControls()',
    '\nasync function restoreSavedSearchState',
  );
  const windowBindingsSource = sourceBetween(
    html,
    'Object.assign(window, {',
    '\nwindow.openCompareTable',
  );

  return new Function(`
    const expectedError = new Error('category unavailable');
    const handledErrors = [];
    const dropdowns = [];
    const window = {};
    const document = { querySelector() { return {}; } };
    const savedSearchStore = {};
    const SearchDom = {
      renderSaveSearchButton() {},
      renderSavedSearchDropdown(_container, options) { dropdowns.push(options); }
    };
    function getCurrentSearchState() { return null; }
    function handleCategoryLoadError(error) { handledErrors.push(error); }
    function applySearch() { return Promise.reject(expectedError); }
    function restoreSavedSearchState() { return Promise.reject(expectedError); }
    function noop() {}
    const toggleAdv = noop;
    const doSearch = noop;
    const renderResults = noop;
    const setView = noop;
    const resetSearch = noop;
    const showToast = noop;
    const addCompare = noop;
    const removeCompare = noop;
    const toggleSave = noop;
    const removeSaved = noop;
    const applySavedApplianceForReplacement = noop;
    const copyCurrentSearchLink = noop;
    const copySavedShareLink = noop;
    const copyCompareShareLink = noop;
    const clearAllSaved = noop;
    const scrollToSearch = noop;
    const openRetailerModal = noop;
    const closeRetailerModal = noop;
    const clearSearchHistoryUi = noop;
    ${renderSavedSearchControlsSource}
    ${windowBindingsSource}
    return {
      renderSavedSearchControls,
      window,
      dropdowns,
      expectedError,
      handledErrors,
    };
  `)();
}

test('recent-search window boundary routes a rejected category load to the error handler', async () => {
  const harness = await createCategoryErrorBoundaryHarness();

  const boundaryResult = harness.window.applySearch({ cat: 'dishwasher' });
  const settled = boundaryResult?.then ? boundaryResult.catch(() => {}) : Promise.resolve();
  await settled;
  await Promise.resolve();

  assert.deepEqual(harness.handledErrors, [harness.expectedError]);
});

test('saved-search restore boundaries route rejected category loads to the error handler', async () => {
  const harness = await createCategoryErrorBoundaryHarness();

  harness.renderSavedSearchControls();
  const boundaryResults = harness.dropdowns.map(({ onRestore }) => onRestore({ cat: 'dishwasher' }));
  await Promise.all(boundaryResults.map((result) => result?.then ? result.catch(() => {}) : Promise.resolve()));
  await Promise.resolve();

  assert.deepEqual(harness.handledErrors, [harness.expectedError, harness.expectedError]);
});

test('category loading shares one in-flight fetch and commits one product batch', async () => {
  const pendingResponse = deferred();
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    return pendingResponse.promise;
  });
  harness.setMeta({
    files: { fridge: '/data/fridges.json' },
    last_updated: '2026-09-14T00:00:00Z',
  });

  const first = harness.loadCategory('fridge');
  const second = harness.loadCategory('fridge');

  assert.equal(requests.length, 1);

  pendingResponse.resolve(response({
    products: [{ id: 'fridge-one', cat: 'fridge' }],
    last_updated: '2026-09-14T01:00:00Z',
  }));
  await Promise.all([first, second]);

  assert.deepEqual(harness.state().productIds, ['fridge-one']);
  assert.deepEqual(harness.state().loadedCats, ['fridge']);
  assert.equal(harness.state().capturedDates.fridge, '2026-09-14T01:00:00Z');

  await harness.loadCategory('fridge');
  assert.equal(requests.length, 1);
});

test('different category loads remain independent while each is pending', async () => {
  const fridgeResponse = deferred();
  const dryerResponse = deferred();
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    if (url === '/data/fridges.json') return fridgeResponse.promise;
    if (url === '/data/dryers.json') return dryerResponse.promise;
    throw new Error(`unexpected request: ${url}`);
  });

  const fridge = harness.loadCategory('fridge');
  const dryer = harness.loadCategory('dryer');
  assert.deepEqual(requests, ['/data/fridges.json', '/data/dryers.json']);

  dryerResponse.resolve(response({ products: [{ id: 'dryer-one', cat: 'dryer' }] }));
  await dryer;
  assert.deepEqual(harness.state().loadedCats, ['dryer']);
  assert.deepEqual(harness.state().productIds, ['dryer-one']);

  fridgeResponse.resolve(response({ products: [{ id: 'fridge-one', cat: 'fridge' }] }));
  await fridge;
  assert.deepEqual(harness.state().loadedCats, ['dryer', 'fridge']);
  assert.deepEqual(harness.state().productIds, ['dryer-one', 'fridge-one']);
});

test('category loading shares HTTP, JSON, and payload failures before allowing a retry', async () => {
  const invalidResponses = [
    response({}, { ok: false, status: 503, url: '/data/fridges.json' }),
    { ok: true, status: 200, url: '/data/fridges.json', json: async () => { throw new Error('invalid JSON'); } },
    response({ products: { id: 'not-an-array' } }, { url: '/data/fridges.json' }),
  ];

  for (const invalidResponse of invalidResponses) {
    let requestCount = 0;
    const harness = await createCategoryHarness(() => {
      requestCount += 1;
      return Promise.resolve(requestCount === 1
        ? invalidResponse
        : response({ products: [{ id: 'fridge-retry', cat: 'fridge' }] }));
    });

    const first = harness.loadCategory('fridge');
    const second = harness.loadCategory('fridge');

    await assert.rejects(first);
    await assert.rejects(second);
    assert.equal(requestCount, 1);
    assert.deepEqual(harness.state().loadedCats, []);

    await harness.loadCategory('fridge');
    assert.equal(requestCount, 2);
    assert.deepEqual(harness.state().productIds, ['fridge-retry']);
  }
});

test('complete fallback replaces an earlier category batch and rejects a late category commit', async () => {
  const metaResponse = deferred();
  const fallbackResponse = deferred();
  const lateFridgeResponse = deferred();
  const fallbackRequested = deferred();
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    if (url === '/data/appliances-meta.json') return metaResponse.promise;
    if (url === '/data/appliances.json') {
      fallbackRequested.resolve();
      return fallbackResponse.promise;
    }
    if (url === '/data/fridges.json') return lateFridgeResponse.promise;
    throw new Error(`unexpected request: ${url}`);
  });

  const bootstrap = harness.bootstrapApplianceData();
  const fridge = harness.loadCategory('fridge');
  assert.deepEqual(requests, ['/data/appliances-meta.json', '/data/fridges.json']);

  metaResponse.resolve(response({}, { ok: false, status: 503, url: '/data/appliances-meta.json' }));
  await fallbackRequested.promise;
  assert.deepEqual(requests, ['/data/appliances-meta.json', '/data/fridges.json', '/data/appliances.json']);

  fallbackResponse.resolve(response({
    products: [
      { id: 'full-fridge', cat: 'fridge' },
      { id: 'full-dishwasher', cat: 'dishwasher' },
    ],
    last_updated: '2026-09-14T02:00:00Z',
  }));
  await bootstrap;

  lateFridgeResponse.resolve(response({
    products: [{ id: 'late-fridge', cat: 'fridge' }],
    last_updated: '2026-09-14T03:00:00Z',
  }));
  await fridge;

  assert.deepEqual(harness.state().productIds, ['full-fridge', 'full-dishwasher']);
  assert.deepEqual(harness.state().capturedDates, {
    fridge: '2026-09-14T02:00:00Z',
    washing_machine: '2026-09-14T02:00:00Z',
    dishwasher: '2026-09-14T02:00:00Z',
    dryer: '2026-09-14T02:00:00Z',
  });
});

test('complete fallback replaces a category that completed before metadata failed', async () => {
  const metaResponse = deferred();
  const fallbackResponse = deferred();
  const fridgeResponse = deferred();
  const harness = await createCategoryHarness((url) => {
    if (url === '/data/appliances-meta.json') return metaResponse.promise;
    if (url === '/data/appliances.json') return fallbackResponse.promise;
    if (url === '/data/fridges.json') return fridgeResponse.promise;
    throw new Error(`unexpected request: ${url}`);
  });

  const bootstrap = harness.bootstrapApplianceData();
  const fridge = harness.loadCategory('fridge');
  fridgeResponse.resolve(response({
    products: [{ id: 'category-fridge', cat: 'fridge' }],
    last_updated: '2026-09-14T01:00:00Z',
  }));
  await fridge;
  assert.deepEqual(harness.state().productIds, ['category-fridge']);

  metaResponse.resolve(response({}, { ok: false, status: 503, url: '/data/appliances-meta.json' }));
  await Promise.resolve();
  fallbackResponse.resolve(response({
    products: [{ id: 'full-fridge', cat: 'fridge' }],
    last_updated: '2026-09-14T02:00:00Z',
  }));
  await bootstrap;

  assert.deepEqual(harness.state().productIds, ['full-fridge']);
  assert.equal(harness.state().capturedDates.fridge, '2026-09-14T02:00:00Z');
});

test('malformed fallback does not advertise category readiness', async () => {
  const harness = await createCategoryHarness((url) => {
    if (url === '/data/appliances-meta.json') {
      return Promise.resolve(response({}, { ok: false, status: 503, url }));
    }
    if (url === '/data/appliances.json') {
      return Promise.resolve(response({ products: { id: 'not-an-array' } }, { url }));
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await assert.rejects(harness.bootstrapApplianceData(), /Invalid appliance fallback payload/);
  assert.deepEqual(harness.state().loadedCats, []);
  assert.deepEqual(harness.state().productIds, []);
  assert.deepEqual(harness.state().capturedDates, {});
});

test('a later category selection invalidates the earlier completion', async () => {
  const pendingByUrl = new Map([
    ['/data/dishwashers.json', deferred()],
    ['/data/washing-machines.json', deferred()],
  ]);
  const harness = await createCategoryHarness((url) => pendingByUrl.get(url).promise);

  const staleSelection = harness.setCategory('dishwasher');
  const latestSelection = harness.setCategory('washing_machine');
  assert.equal(harness.state().currentCat, 'washing_machine');

  pendingByUrl.get('/data/washing-machines.json').resolve(response({
    products: [{ id: 'washer-one', cat: 'washing_machine' }],
  }));
  const latestApplied = await latestSelection;

  pendingByUrl.get('/data/dishwashers.json').resolve(response({
    products: [{ id: 'dishwasher-one', cat: 'dishwasher' }],
  }));
  const staleApplied = await staleSelection;

  assert.equal(latestApplied, true);
  assert.equal(staleApplied, false);
  assert.equal(harness.state().currentCat, 'washing_machine');
  assert.deepEqual(harness.state().activeCategories, ['washing_machine']);
});

test('initial category selection does not replace an earlier interactive intent', async () => {
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    return Promise.resolve(response({ products: [{ id: url, cat: 'fridge' }] }, { url }));
  });

  const earlySelection = harness.setCategory('dishwasher');
  const initialSelection = harness.setCategory('fridge', { initialization: true });
  const [earlyApplied, initialApplied] = await Promise.all([earlySelection, initialSelection]);

  assert.equal(earlyApplied, true);
  assert.equal(initialApplied, false);
  assert.equal(harness.state().currentCat, 'dishwasher');
  assert.deepEqual(harness.state().activeCategories, ['dishwasher']);
  assert.deepEqual(requests, ['/data/dishwashers.json']);
});

test('bootstrap leaves an early category selection current after its initial category finishes', async () => {
  const metaResponse = deferred();
  const fridgeResponse = deferred();
  const dishwasherResponse = deferred();
  const fridgeRequested = deferred();
  const harness = await createCategoryHarness((url) => {
    if (url === '/data/appliances-meta.json') return metaResponse.promise;
    if (url === '/data/fridges.json') {
      fridgeRequested.resolve();
      return fridgeResponse.promise;
    }
    if (url === '/data/dishwashers.json') return dishwasherResponse.promise;
    throw new Error(`unexpected request: ${url}`);
  });

  const bootstrap = harness.bootstrapApplianceData();
  const earlySelection = harness.setCategory('dishwasher');
  metaResponse.resolve(response({
    files: { fridge: '/data/fridges.json' },
    last_updated: '2026-09-14T00:00:00Z',
  }));
  await fridgeRequested.promise;
  fridgeResponse.resolve(response({ products: [{ id: 'fridge-one', cat: 'fridge' }] }));
  const initialCategory = await bootstrap;
  const initialApplied = await harness.setCategory(initialCategory, { initialization: true });
  dishwasherResponse.resolve(response({ products: [{ id: 'dishwasher-one', cat: 'dishwasher' }] }));
  const earlyApplied = await earlySelection;

  assert.equal(initialApplied, false);
  assert.equal(earlyApplied, true);
  assert.equal(harness.state().currentCat, 'dishwasher');
  assert.deepEqual(harness.state().activeCategories, ['dishwasher']);
});

test('a newer category selection prevents a stale hero sample from filling or searching', async () => {
  const pendingByUrl = new Map([
    ['/data/dishwashers.json', deferred()],
    ['/data/washing-machines.json', deferred()],
  ]);
  const harness = await createCategoryHarness((url) => pendingByUrl.get(url).promise);
  const { applyHeroSampleSearch } = await loadHeroFunnel();
  let searchCount = 0;

  const sample = applyHeroSampleSearch({
    dataset: { sampleSearch: JSON.stringify({ cat: 'dishwasher', w: 600, h: 850, d: 600 }) },
  }, {
    root: harness.root,
    setCategory: harness.setCategory,
    search: () => { searchCount += 1; },
    scrollTarget: () => harness.root.getElementById('resultsSection'),
    delayMs: 0,
  });
  const newerSelection = harness.setCategory('washing_machine');

  pendingByUrl.get('/data/washing-machines.json').resolve(response({
    products: [{ id: 'washer-one', cat: 'washing_machine' }],
  }));
  assert.equal(await newerSelection, true);
  pendingByUrl.get('/data/dishwashers.json').resolve(response({
    products: [{ id: 'dishwasher-one', cat: 'dishwasher' }],
  }));

  assert.equal(await sample, false);
  assert.equal(harness.state().currentCat, 'washing_machine');
  assert.deepEqual(harness.state().dimensions, { inW: '', inH: '', inD: '' });
  assert.equal(searchCount, 0);
});

test('URL initialization cannot replace a newer hero sample while both category loads are pending', async () => {
  const dishwasherResponse = deferred();
  const fridgeResponse = deferred();
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    if (url === '/data/dishwashers.json') return dishwasherResponse.promise;
    if (url === '/data/fridges.json') return fridgeResponse.promise;
    throw new Error(`unexpected request: ${url}`);
  });
  harness.setUrlState('?cat=fridge&w=700&h=1800&d=700', {
    cat: 'fridge',
    w: 700,
    h: 1800,
    d: 700,
    facets: { priceMax: null },
  });
  const { applyHeroSampleSearch } = await loadHeroFunnel();
  let sampleSearches = 0;

  const sample = applyHeroSampleSearch({
    dataset: { sampleSearch: JSON.stringify({ cat: 'dishwasher', w: 600, h: 850, d: 600 }) },
  }, {
    root: harness.root,
    setCategory: harness.setCategory,
    search: () => { sampleSearches += 1; },
    scrollTarget: () => harness.root.getElementById('resultsSection'),
    delayMs: 0,
  });
  const urlInitialization = harness.readUrlParams({ initialization: true });

  fridgeResponse.resolve(response({ products: [{ id: 'fridge-one', cat: 'fridge' }] }));
  const urlApplied = await urlInitialization;
  dishwasherResponse.resolve(response({ products: [{ id: 'dishwasher-one', cat: 'dishwasher' }] }));
  const sampleApplied = await sample;

  assert.equal(urlApplied, false);
  assert.equal(sampleApplied, true);
  assert.equal(harness.state().currentCat, 'dishwasher');
  assert.deepEqual(harness.state().dimensions, { inW: '600', inH: '850', inD: '600' });
  assert.equal(sampleSearches, 1);
  assert.deepEqual(requests, ['/data/dishwashers.json']);
});

test('URL initialization still applies URL dimensions when no interactive intent exists', async () => {
  const requests = [];
  const harness = await createCategoryHarness((url) => {
    requests.push(url);
    return Promise.resolve(response({ products: [{ id: 'fridge-one', cat: 'fridge' }] }, { url }));
  });
  harness.setUrlState('?cat=fridge&w=700&h=1800&d=700', {
    cat: 'fridge',
    w: 700,
    h: 1800,
    d: 700,
    facets: { priceMax: null },
  });

  assert.equal(await harness.setCategory('fridge', { initialization: true }), true);
  assert.equal(harness.state().categoryIntent, 0);
  await harness.readUrlParams({ initialization: true });

  assert.equal(harness.state().currentCat, 'fridge');
  assert.deepEqual(harness.state().dimensions, { inW: '700', inH: '1800', inD: '700' });
  assert.deepEqual(harness.state().searchCalls, [{ preserveExistingFacets: true }]);
  assert.deepEqual(requests, ['/data/fridges.json']);
});

test('applySearch stops before writing dimensions when its category selection becomes stale', async () => {
  const pendingByUrl = new Map([
    ['/data/dishwashers.json', deferred()],
    ['/data/washing-machines.json', deferred()],
  ]);
  const harness = await createCategoryHarness((url) => pendingByUrl.get(url).promise);

  const staleApply = harness.applySearch({
    cat: 'dishwasher',
    w: 600,
    h: 850,
    d: 600,
    brand: 'Example',
    door: 610,
    dwelling: 'house',
  });
  const latestSelection = harness.setCategory('washing_machine');
  pendingByUrl.get('/data/washing-machines.json').resolve(response({
    products: [{ id: 'washer-one', cat: 'washing_machine' }],
  }));
  assert.equal(await latestSelection, true);
  pendingByUrl.get('/data/dishwashers.json').resolve(response({
    products: [{ id: 'dishwasher-one', cat: 'dishwasher' }],
  }));

  assert.equal(await staleApply, false);
  assert.deepEqual(harness.state().inputs, {
    inW: '', inH: '', inD: '', inDoor: '', inDwelling: '', inBudget: '', inBrand: '',
  });
  assert.deepEqual(harness.state().searchCalls, []);
});

test('restoreSavedSearchState stops before writing dimensions when its category selection becomes stale', async () => {
  const pendingByUrl = new Map([
    ['/data/dishwashers.json', deferred()],
    ['/data/washing-machines.json', deferred()],
  ]);
  const harness = await createCategoryHarness((url) => pendingByUrl.get(url).promise);

  const staleRestore = harness.restoreSavedSearchState({
    cat: 'dishwasher',
    w: 600,
    h: 850,
    d: 600,
    facets: { retailerOnly: true },
  });
  const latestSelection = harness.setCategory('washing_machine');
  pendingByUrl.get('/data/washing-machines.json').resolve(response({
    products: [{ id: 'washer-one', cat: 'washing_machine' }],
  }));
  assert.equal(await latestSelection, true);
  pendingByUrl.get('/data/dishwashers.json').resolve(response({
    products: [{ id: 'dishwasher-one', cat: 'dishwasher' }],
  }));

  assert.equal(await staleRestore, false);
  assert.deepEqual(harness.state().dimensions, { inW: '', inH: '', inD: '' });
  assert.deepEqual(harness.state().searchCalls, []);
});

test('applySavedApplianceForReplacement stops before writing dimensions when its category selection becomes stale', async () => {
  const pendingByUrl = new Map([
    ['/data/dishwashers.json', deferred()],
    ['/data/washing-machines.json', deferred()],
  ]);
  const harness = await createCategoryHarness((url) => pendingByUrl.get(url).promise);
  harness.setInventory([{
    id: 'saved-dishwasher',
    category: 'dishwasher',
    width: 600,
    height: 850,
    depth: 600,
  }]);

  const staleApply = harness.applySavedApplianceForReplacement('saved-dishwasher');
  const latestSelection = harness.setCategory('washing_machine');
  pendingByUrl.get('/data/washing-machines.json').resolve(response({
    products: [{ id: 'washer-one', cat: 'washing_machine' }],
  }));
  assert.equal(await latestSelection, true);
  pendingByUrl.get('/data/dishwashers.json').resolve(response({
    products: [{ id: 'dishwasher-one', cat: 'dishwasher' }],
  }));

  assert.equal(await staleApply, false);
  assert.deepEqual(harness.state().dimensions, { inW: '', inH: '', inD: '' });
  assert.equal(harness.state().currentReplacementSourceCategory, '');
  assert.equal(harness.state().replacementStatus, '');
  assert.deepEqual(harness.state().searchCalls, []);
});
