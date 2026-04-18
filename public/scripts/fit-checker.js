'use strict';

(function attachFitChecker(globalScope) {
  const RECENT_KEY = 'fitappliance-fit-checker-recent-v1';
  const MAX_RECENT = 3;
  const NO_MATCH_TEXT = 'No match found for the entered cavity size.';
  let cachedProducts = null;

  function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[char]));
  }

  function safeParseNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    if (typeof value !== 'string') return null;
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
    const parsed = Math.round(Number.parseFloat(value));
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  function validateDimensions({ w, h, d }) {
    const parsed = {
      w: safeParseNumber(w),
      h: safeParseNumber(h),
      d: safeParseNumber(d)
    };
    if (!parsed.w || !parsed.h || !parsed.d || parsed.w <= 0 || parsed.h <= 0 || parsed.d <= 0) {
      return {
        ok: false,
        message: 'Please enter valid numbers for width, height, and depth (mm).',
        dims: null
      };
    }
    return { ok: true, message: '', dims: parsed };
  }

  function buildApplianceSlug(product) {
    if (typeof product?.id === 'string' && product.id.trim()) return product.id.trim();
    return `${String(product?.brand ?? 'unknown')}-${String(product?.model ?? 'model')}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildApplianceUrl(product, dims) {
    const params = new URLSearchParams({
      cat: String(product?.cat ?? 'fridge'),
      w: String(dims.w),
      h: String(dims.h),
      d: String(dims.d)
    });
    if (product?.brand) params.set('brand', String(product.brand));
    return `/?${params.toString()}`;
  }

  function findMatches(products, dims, limit = 60) {
    const records = Array.isArray(products) ? products : [];
    const rows = [];
    for (const product of records) {
      const width = Number(product?.w);
      const height = Number(product?.h);
      const depth = Number(product?.d);
      if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(depth)) continue;
      if (width > dims.w || height > dims.h || depth > dims.d) continue;
      rows.push({
        slug: buildApplianceSlug(product),
        brand: String(product?.brand ?? 'Unknown'),
        model: String(product?.model ?? ''),
        cat: String(product?.cat ?? 'appliance'),
        w: width,
        h: height,
        d: depth,
        stars: Number.isFinite(Number(product?.stars)) ? Number(product.stars) : -1,
        url: buildApplianceUrl(product, dims)
      });
    }
    rows.sort((left, right) => {
      if (right.stars !== left.stars) return right.stars - left.stars;
      const leftVolume = left.w * left.h * left.d;
      const rightVolume = right.w * right.h * right.d;
      return leftVolume - rightVolume;
    });
    return rows.slice(0, Math.max(1, limit));
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
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row) =>
        row && Number.isFinite(row.w) && Number.isFinite(row.h) && Number.isFinite(row.d)
      ).slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  }

  function saveRecentQuery(query, storageOverride) {
    const storage = getStorage(storageOverride);
    if (!storage) return [];
    const canonical = {
      w: Number(query?.w),
      h: Number(query?.h),
      d: Number(query?.d)
    };
    const existing = getRecentQueries(storageOverride);
    const next = [canonical, ...existing.filter((row) =>
      !(row.w === canonical.w && row.h === canonical.h && row.d === canonical.d)
    )].slice(0, MAX_RECENT);
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
    listEl.innerHTML = queries.map((row, index) => `
      <button type="button" class="recent-chip" data-fit-index="${index}">
        ${row.w} × ${row.h} × ${row.d} mm
      </button>
    `).join('');
  }

  function renderResults({
    matches,
    dims,
    resultsEl,
    messageEl
  }) {
    if (!resultsEl || !messageEl) return;
    if (!Array.isArray(matches) || matches.length === 0) {
      messageEl.textContent = `${NO_MATCH_TEXT} Try widening one dimension and search again.`;
      resultsEl.innerHTML = `
        <div class="fit-empty-state">
          <strong>No match</strong>
          <p>No appliances fit ${dims.w} × ${dims.h} × ${dims.d} mm.</p>
        </div>
      `;
      return;
    }

    messageEl.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'} found for ${dims.w} × ${dims.h} × ${dims.d} mm.`;
    resultsEl.innerHTML = `
      <ul class="fit-result-list">
        ${matches.map((row) => `
          <li class="fit-result-item" data-appliance-slug="${escHtml(row.slug)}">
            <div class="fit-result-title">${escHtml(row.brand)} ${escHtml(row.model)}</div>
            <div class="fit-result-meta">W ${row.w} × H ${row.h} × D ${row.d} mm · ${row.cat.replace(/_/g, ' ')}</div>
            <a href="${escHtml(row.url)}">Open in FitAppliance →</a>
          </li>
        `).join('')}
      </ul>
    `;
  }

  async function loadProducts(fetchImpl) {
    if (Array.isArray(cachedProducts)) return cachedProducts;
    const response = await fetchImpl('/data/appliances.json');
    if (!response || !response.ok) {
      throw new Error('Unable to load appliance data.');
    }
    const document = await response.json();
    const products = Array.isArray(document?.products) ? document.products : [];
    cachedProducts = products;
    return products;
  }

  async function runSearch({
    w,
    h,
    d,
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
      const matches = findMatches(products, validation.dims);
      renderResults({
        matches,
        dims: validation.dims,
        resultsEl,
        messageEl
      });
      const recent = saveRecentQuery(validation.dims, storage);
      return { ok: true, message: '', matches, recent };
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
    const wInput = doc.getElementById('fitW');
    const hInput = doc.getElementById('fitH');
    const dInput = doc.getElementById('fitD');
    const messageEl = doc.getElementById('fitMessage');
    const resultsEl = doc.getElementById('fitResults');
    const openRecent = doc.getElementById('openRecentSearches');
    const dialog = doc.getElementById('fitRecentDialog');
    const recentList = doc.getElementById('fitRecentList');

    if (!form || !wInput || !hInput || !dInput || !messageEl || !resultsEl) return;

    const refreshRecent = () => {
      renderRecentQueries(recentList, getRecentQueries(options.storage));
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = await runSearch({
        w: wInput.value,
        h: hInput.value,
        d: dInput.value,
        fetchImpl: options.fetchImpl ?? globalScope?.fetch?.bind(globalScope),
        resultsEl,
        messageEl,
        storage: options.storage
      });
      if (result.ok) refreshRecent();
    });

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
        const queryIndex = Number(target.getAttribute('data-fit-index'));
        const query = getRecentQueries(options.storage)[queryIndex];
        if (!query) return;
        wInput.value = String(query.w);
        hInput.value = String(query.h);
        dInput.value = String(query.d);
        dialog.close();
      });
    }

    refreshRecent();
  }

  const api = {
    NO_MATCH_TEXT,
    validateDimensions,
    findMatches,
    renderResults,
    getRecentQueries,
    saveRecentQuery,
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
