'use strict';

(function attachFitChecker(globalScope) {
  const SearchCore = typeof require === 'function'
    ? require('./search-core.js')
    : globalScope?.SearchCore;
  const SearchDom = typeof require === 'function'
    ? require('./search-dom.js')
    : globalScope?.SearchDom;

  const RECENT_KEY = 'fitappliance-fit-checker-recent-v2';
  const MAX_RECENT = 4;
  const NO_MATCH_TEXT = 'No match found for the entered cavity size.';
  let cachedProducts = null;

  function safeParseNumber(value) {
    return SearchCore?.toMm ? SearchCore.toMm(value) : null;
  }

  function validateDimensions({ w, h, d }) {
    const rawValues = [w, h, d].map((value) => String(value ?? '').trim());
    const parsed = {
      w: safeParseNumber(w),
      h: safeParseNumber(h),
      d: safeParseNumber(d)
    };
    const hasInvalidProvidedValue = rawValues.some((value, index) => value && !parsed[['w', 'h', 'd'][index]]);
    if (hasInvalidProvidedValue) {
      return {
        ok: false,
        message: 'Please enter valid numbers for width, height, and depth (mm).',
        dims: null
      };
    }
    if (!parsed.w && !parsed.h && !parsed.d) {
      return {
        ok: false,
        message: 'Please enter at least one valid number for width, height, or depth (mm).',
        dims: null
      };
    }
    return { ok: true, message: '', dims: parsed };
  }

  function getStorage(storageOverride) {
    if (storageOverride) return storageOverride;
    try {
      return globalScope?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  function getRecentQueries(storageOverride) {
    const storage = getStorage(storageOverride);
    if (!storage) return [];
    try {
      const parsed = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  }

  function saveRecentQuery(query, storageOverride) {
    const storage = getStorage(storageOverride);
    if (!storage) return [];
    const canonical = {
      cat: query?.cat ?? 'fridge',
      w: safeParseNumber(query?.w),
      h: safeParseNumber(query?.h),
      d: safeParseNumber(query?.d),
      toleranceMm: Number.isFinite(Number(query?.toleranceMm)) ? Number(query.toleranceMm) : 5,
      preset: query?.preset ?? null
    };
    const existing = getRecentQueries(storageOverride);
    const next = [canonical, ...existing.filter((row) => JSON.stringify(row) !== JSON.stringify(canonical))].slice(0, MAX_RECENT);
    try {
      storage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      return existing;
    }
    return next;
  }

  function renderRecentQueries(listEl, queries) {
    if (!listEl) return;
    if (!Array.isArray(queries) || queries.length === 0) {
      listEl.innerHTML = '<p class="fit-empty">No recent searches yet.</p>';
      return;
    }
    listEl.textContent = '';
    for (const [index, row] of queries.entries()) {
      const button = listEl.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'recent-chip';
      button.dataset.fitIndex = String(index);
      button.textContent = `${row?.cat || 'appliance'} · ${row?.w || '—'} × ${row?.h || '—'} × ${row?.d || '—'} mm`;
      listEl.appendChild(button);
    }
  }

  function findMatches(products, dims, limit = 60) {
    return SearchCore.findSearchMatches(products, {
      w: dims?.w,
      h: dims?.h,
      d: dims?.d,
      toleranceMm: 0
    }, {
      clearanceDefaults: SearchCore.CLEARANCE_DEFAULTS,
      limit
    }).map((row) => ({
      ...row,
      slug: row.id
    }));
  }

  function buildEmptyStateForRender(dims, toleranceMm, relaxedCount) {
    return SearchCore.buildEmptyState({
      exactCount: 0,
      relaxedCount,
      toleranceMm,
      categoryLabel: 'Appliances'
    });
  }

  function renderResults({
    matches,
    dims,
    resultsEl,
    messageEl
  }) {
    const relaxedCount = Array.isArray(matches) ? 0 : 0;
    SearchDom.renderSearchResults({
      matches,
      filters: dims,
      resultsEl,
      messageEl,
      emptyState: buildEmptyStateForRender(dims, 5, relaxedCount)
    });
    if (!Array.isArray(matches) || matches.length === 0) {
      messageEl.textContent = `${NO_MATCH_TEXT} Try widening one dimension and search again.`;
    }
  }

  async function loadProducts(fetchImpl) {
    if (Array.isArray(cachedProducts)) return cachedProducts;
    const response = await fetchImpl('/data/appliances.json');
    if (!response || !response.ok) {
      throw new Error('Unable to load appliance data.');
    }
    const document = await response.json();
    cachedProducts = Array.isArray(document?.products) ? document.products : [];
    return cachedProducts;
  }

  async function runSearch({
    cat = null,
    w,
    h,
    d,
    toleranceMm = 5,
    preset = null,
    fetchImpl = globalScope?.fetch?.bind(globalScope),
    resultsEl,
    messageEl,
    storage
  }) {
    const validation = validateDimensions({ w, h, d });
    if (!validation.ok) {
      if (messageEl) messageEl.textContent = validation.message;
      if (resultsEl) resultsEl.innerHTML = '';
      return { ok: false, message: validation.message, matches: [] };
    }

    try {
      const products = await loadProducts(fetchImpl);
      const exactMatches = SearchCore.findSearchMatches(products, {
        cat,
        ...validation.dims,
        toleranceMm: 0,
        preset
      });
      const matches = toleranceMm > 0
        ? SearchCore.findSearchMatches(products, {
          cat,
          ...validation.dims,
          toleranceMm,
          preset
        })
        : exactMatches;

      const emptyState = SearchCore.buildEmptyState({
        exactCount: exactMatches.length,
        relaxedCount: matches.length,
        toleranceMm,
        categoryLabel: SearchCore.CATEGORY_LABELS[cat] ?? 'Appliances'
      });

      SearchDom.renderSearchResults({
        matches,
        filters: { cat, ...validation.dims, toleranceMm, preset },
        resultsEl,
        messageEl,
        emptyState
      });

      saveRecentQuery({ cat, ...validation.dims, toleranceMm, preset }, storage);
      return { ok: true, message: '', matches };
    } catch {
      const fallbackMessage = 'Unable to load appliance data right now. Please refresh and try again.';
      if (messageEl) messageEl.textContent = fallbackMessage;
      if (resultsEl) resultsEl.innerHTML = '';
      return { ok: false, message: fallbackMessage, matches: [] };
    }
  }

  function initFitChecker(options = {}) {
    const doc = options.document ?? globalScope?.document;
    if (!doc) return;
    const form = doc.getElementById('fitCheckerForm');
    const categoryInput = doc.getElementById('fitCat');
    const wInput = doc.getElementById('fitW');
    const hInput = doc.getElementById('fitH');
    const dInput = doc.getElementById('fitD');
    const toleranceInput = doc.getElementById('fitTolerance');
    const toleranceValue = doc.getElementById('fitToleranceValue');
    const presetContainer = doc.getElementById('fitPresetChips');
    const messageEl = doc.getElementById('fitMessage');
    const resultsEl = doc.getElementById('fitResults');
    const openRecent = doc.getElementById('openRecentSearches');
    const dialog = doc.getElementById('fitRecentDialog');
    const recentList = doc.getElementById('fitRecentList');

    if (!form || !wInput || !hInput || !dInput || !messageEl || !resultsEl) return;

    function readState() {
      return {
        cat: categoryInput?.value || 'fridge',
        w: wInput.value,
        h: hInput.value,
        d: dInput.value,
        toleranceMm: toleranceInput ? Number(toleranceInput.value) : 5,
        preset: form.dataset.activePreset || null
      };
    }

    function writeUrlState(state) {
      const params = SearchCore.serializeSearchState(state);
      const query = params.toString();
      if (globalScope?.history?.replaceState) {
        globalScope.history.replaceState(null, '', `${globalScope.location.pathname}${query ? `?${query}` : ''}`);
      }
    }

    function refreshPresets() {
      if (!presetContainer || !SearchDom.renderPresetChips) return;
      const state = readState();
      const presets = SearchCore.CATEGORY_PRESETS[state.cat] ?? [];
      SearchDom.renderPresetChips(presetContainer, presets, form.dataset.activePreset || null, (presetId) => {
        const preset = presets.find((entry) => entry.id === presetId);
        if (!preset) return;
        form.dataset.activePreset = preset.id;
        if (preset.w) wInput.value = String(preset.w);
        if (preset.h) hInput.value = String(preset.h);
        if (preset.d) dInput.value = String(preset.d);
        refreshPresets();
      });
    }

    const refreshRecent = () => renderRecentQueries(recentList, getRecentQueries(options.storage));
    const updateToleranceLabel = () => {
      if (toleranceValue && toleranceInput) toleranceValue.textContent = `${toleranceInput.value}mm`;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const state = readState();
      const result = await runSearch({
        ...state,
        fetchImpl: options.fetchImpl ?? globalScope?.fetch?.bind(globalScope),
        resultsEl,
        messageEl,
        storage: options.storage
      });
      if (result.ok) {
        refreshRecent();
        writeUrlState(state);
      }
    });

    categoryInput?.addEventListener('change', () => {
      form.dataset.activePreset = '';
      refreshPresets();
    });

    toleranceInput?.addEventListener('input', updateToleranceLabel);

    if (openRecent && dialog && typeof dialog.showModal === 'function') {
      openRecent.addEventListener('click', () => {
        refreshRecent();
        dialog.showModal();
      });
    }

    if (dialog) {
      dialog.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof globalScope.Element)) return;
        if (target.matches('[data-fit-close]')) dialog.close();
        if (!target.matches('[data-fit-index]')) return;
        const query = getRecentQueries(options.storage)[Number(target.getAttribute('data-fit-index'))];
        if (!query) return;
        if (categoryInput && query.cat) categoryInput.value = query.cat;
        wInput.value = query.w ? String(query.w) : '';
        hInput.value = query.h ? String(query.h) : '';
        dInput.value = query.d ? String(query.d) : '';
        if (toleranceInput) toleranceInput.value = String(query.toleranceMm ?? 5);
        form.dataset.activePreset = query.preset ?? '';
        updateToleranceLabel();
        refreshPresets();
        dialog.close();
      });
    }

    const urlState = SearchCore.parseSearchParams(globalScope?.location?.search ?? '');
    if (categoryInput && urlState.cat) categoryInput.value = urlState.cat;
    if (urlState.w) wInput.value = String(urlState.w);
    if (urlState.h) hInput.value = String(urlState.h);
    if (urlState.d) dInput.value = String(urlState.d);
    if (toleranceInput) toleranceInput.value = String(urlState.toleranceMm ?? 5);
    form.dataset.activePreset = urlState.preset ?? '';

    updateToleranceLabel();
    refreshPresets();
    refreshRecent();
  }

  const api = {
    NO_MATCH_TEXT,
    validateDimensions,
    findMatches,
    renderResults,
    getRecentQueries,
    saveRecentQuery,
    renderRecentQueries,
    runSearch,
    initFitChecker
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.FitChecker = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
