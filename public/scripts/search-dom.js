'use strict';

(function attachSearchDom(globalScope) {
  let mobileSheetState = null;

  function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[char]));
  }

  function coerceAriaText(value) {
    if (typeof value === 'string') {
      const normalized = value.replace(/\s+/g, ' ').trim();
      if (/[<>]/.test(normalized) || /\bon[a-z]+\s*=|javascript:/i.test(normalized)) {
        return '[unsafe text]';
      }
      return normalized;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return '';
    return Object.prototype.toString.call(value);
  }

  function setAriaLabel(node, value) {
    node.setAttribute('aria-label', coerceAriaText(value));
  }

  function safeDisplayText(value, fallback = '') {
    const normalized = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    if (/[<>]/.test(normalized) || /\bon[a-z]+\s*=|javascript:/i.test(normalized)) {
      return fallback || '[unsafe text]';
    }
    return normalized;
  }

  function renderPresetChips(container, presets, activePreset, onSelect) {
    if (!container) return;
    const rows = Array.isArray(presets) ? presets : [];
    container.innerHTML = rows.map((preset) => `
      <button
        type="button"
        class="preset-chip${activePreset === preset.id ? ' preset-chip--active' : ''}"
        data-preset-id="${escHtml(preset.id)}"
      >${escHtml(preset.label)}</button>
    `).join('');

    container.querySelectorAll('[data-preset-id]').forEach((button) => {
      button.addEventListener('click', () => onSelect?.(button.getAttribute('data-preset-id') ?? ''));
    });
  }

  function bindToggleButton(button, payload, onChange) {
    const fire = () => onChange?.(payload);
    button.addEventListener('click', fire);
    button.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        fire();
      }
    });
  }

  function renderFacetBar(container, counts = {}, activeFacets = {}, onChange) {
    if (!container) return;
    container.textContent = '';
    setAriaLabel(container, 'Filter results');

    const doc = container.ownerDocument;
    const brandCounts = Object.entries(counts?.brand ?? {});
    if (brandCounts.length > 0) {
      const section = doc.createElement('section');
      section.className = 'facet-group';

      const title = doc.createElement('h3');
      title.className = 'facet-title';
      title.textContent = 'Brand';
      section.appendChild(title);

      const list = doc.createElement('div');
      list.className = 'facet-options';

      const selected = new Set((activeFacets?.brand ?? []).map((value) => String(value).trim().toLowerCase()));
      for (const [brand, count] of brandCounts) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = `facet-option${selected.has(String(brand).trim().toLowerCase()) ? ' facet-option--active' : ''}`;
        button.dataset.facetBrand = brand;
        button.setAttribute('role', 'checkbox');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-checked', selected.has(String(brand).trim().toLowerCase()) ? 'true' : 'false');
        setAriaLabel(button, `${coerceAriaText(brand)} (${Number(count)})`);

        const label = doc.createElement('span');
        label.className = 'facet-option__label';
        label.textContent = brand;
        const counter = doc.createElement('span');
        counter.className = 'facet-option__count';
        counter.textContent = String(count);
        button.append(label, counter);
        bindToggleButton(button, { type: 'brand', value: brand }, onChange);
        list.appendChild(button);
      }

      section.appendChild(list);
      container.appendChild(section);
    }

    const priceSection = doc.createElement('section');
    priceSection.className = 'facet-group';
    const priceTitle = doc.createElement('h3');
    priceTitle.className = 'facet-title';
    priceTitle.textContent = 'Price';
    priceSection.appendChild(priceTitle);
    const priceRow = doc.createElement('div');
    priceRow.className = 'facet-price-row';
    const minInput = doc.createElement('input');
    minInput.type = 'number';
    minInput.min = '0';
    minInput.placeholder = 'Min';
    minInput.value = activeFacets?.priceMin ?? '';
    minInput.dataset.facetPriceMin = '1';
    setAriaLabel(minInput, 'Minimum price');
    minInput.addEventListener('change', () => onChange?.({ type: 'priceMin', value: minInput.value }));
    const maxInput = doc.createElement('input');
    maxInput.type = 'number';
    maxInput.min = '0';
    maxInput.placeholder = 'Max';
    maxInput.value = activeFacets?.priceMax ?? '';
    maxInput.dataset.facetPriceMax = '1';
    setAriaLabel(maxInput, 'Maximum price');
    maxInput.addEventListener('change', () => onChange?.({ type: 'priceMax', value: maxInput.value }));
    priceRow.append(minInput, maxInput);
    priceSection.appendChild(priceRow);
    container.appendChild(priceSection);

    const starsSection = doc.createElement('section');
    starsSection.className = 'facet-group';
    const starsTitle = doc.createElement('h3');
    starsTitle.className = 'facet-title';
    starsTitle.textContent = 'Energy stars';
    starsSection.appendChild(starsTitle);
    const starsList = doc.createElement('div');
    starsList.className = 'facet-options';
    starsList.setAttribute('role', 'radiogroup');
    setAriaLabel(starsList, 'Minimum energy stars');
    const starCounts = Object.entries(counts?.stars ?? {});
    for (const [stars, count] of starCounts) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = `facet-option${Number(activeFacets?.stars) === Number(stars) ? ' facet-option--active' : ''}`;
      button.dataset.facetStars = stars;
      button.setAttribute('role', 'radio');
      button.setAttribute('tabindex', '0');
      button.setAttribute('aria-checked', Number(activeFacets?.stars) === Number(stars) ? 'true' : 'false');
      button.textContent = `${stars}+ (${count})`;
      bindToggleButton(button, { type: 'stars', value: Number(stars) }, onChange);
      starsList.appendChild(button);
    }
    starsSection.appendChild(starsList);
    container.appendChild(starsSection);

    const availabilitySection = doc.createElement('section');
    availabilitySection.className = 'facet-group';
    const availabilityButton = doc.createElement('button');
    availabilityButton.type = 'button';
    availabilityButton.className = `facet-toggle${activeFacets?.availableOnly === true ? ' facet-toggle--active' : ''}`;
    availabilityButton.dataset.facetAvailability = '1';
    availabilityButton.setAttribute('role', 'switch');
    availabilityButton.setAttribute('tabindex', '0');
    availabilityButton.setAttribute('aria-checked', activeFacets?.availableOnly === true ? 'true' : 'false');
    availabilityButton.textContent = 'Available in AU';
    bindToggleButton(availabilityButton, { type: 'availableOnly', value: activeFacets?.availableOnly !== true }, onChange);
    availabilitySection.appendChild(availabilityButton);
    container.appendChild(availabilitySection);
  }

  function renderActiveChips(container, activeFacets = {}, onRemove) {
    if (!container) return;
    container.textContent = '';

    const doc = container.ownerDocument;
    const chips = [];
    for (const brand of activeFacets?.brand ?? []) {
      chips.push({ key: 'brand', value: brand, label: brand });
    }
    if (activeFacets?.priceMin !== null && activeFacets?.priceMin !== undefined) {
      chips.push({ key: 'priceMin', value: activeFacets.priceMin, label: `Min $${activeFacets.priceMin}` });
    }
    if (activeFacets?.priceMax !== null && activeFacets?.priceMax !== undefined) {
      chips.push({ key: 'priceMax', value: activeFacets.priceMax, label: `Max $${activeFacets.priceMax}` });
    }
    if (activeFacets?.stars !== null && activeFacets?.stars !== undefined) {
      chips.push({ key: 'stars', value: activeFacets.stars, label: `${activeFacets.stars}+ stars` });
    }
    if (activeFacets?.availableOnly === true) {
      chips.push({ key: 'availableOnly', value: true, label: 'Available in AU' });
    }

    for (const chip of chips) {
      const node = doc.createElement('button');
      node.type = 'button';
      node.className = 'active-chip';
      node.dataset.activeChip = chip.key;
      const label = doc.createElement('span');
      label.textContent = chip.label;
      const remove = doc.createElement('span');
      remove.dataset.removeChip = chip.key;
      remove.setAttribute('aria-hidden', 'true');
      remove.textContent = '×';
      node.append(label, remove);
      node.addEventListener('click', () => onRemove?.({ key: chip.key, value: chip.value }));
      container.appendChild(node);
    }
  }

  function renderSortDropdown(container, currentSort = 'best-fit', onChange) {
    if (!container) return;
    container.textContent = '';
    const doc = container.ownerDocument;
    const label = doc.createElement('label');
    label.className = 'sort-dropdown';
    const text = doc.createElement('span');
    text.textContent = 'Sort';
    const select = doc.createElement('select');
    select.dataset.sortSelect = '1';
    setAriaLabel(select, 'Sort results');
    [
      ['best-fit', 'Best fit'],
      ['price-asc', 'Price ↑'],
      ['price-desc', 'Price ↓'],
      ['popularity', 'Popularity'],
      ['stars', 'Energy stars']
    ].forEach(([value, labelText]) => {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = labelText;
      select.appendChild(option);
    });
    select.value = currentSort;
    select.addEventListener('change', () => onChange?.(select.value));
    label.append(text, select);
    container.appendChild(label);
  }

  function renderLiveCount(el, totalMatches, totalCatalog) {
    if (!el) return;
    const formatter = new Intl.NumberFormat('en-AU');
    el.textContent = `Showing ${formatter.format(Number(totalMatches ?? 0))} of ${formatter.format(Number(totalCatalog ?? 0))} appliances`;
  }

  function hasCompleteSearchState(state) {
    return Boolean(state?.cat && state?.w && state?.h && state?.d);
  }

  function buildSavedSearchName(state = {}) {
    const cat = String(state.cat ?? 'appliance').replace(/_/g, ' ');
    return `${cat} ${state.w}×${state.h}×${state.d}`.replace(/\s+/g, ' ').trim();
  }

  function showSaveForm(container, {
    store,
    state,
    onSaved,
    onError
  } = {}) {
    if (!container || !store) return null;
    const doc = container.ownerDocument;
    const existing = container.querySelector('[data-save-search-form]');
    if (existing) existing.remove();

    const form = doc.createElement('form');
    form.className = 'saved-search-form';
    form.dataset.saveSearchForm = '1';

    const input = doc.createElement('input');
    input.type = 'text';
    input.maxLength = '50';
    input.value = buildSavedSearchName(state);
    input.dataset.saveSearchName = '1';
    setAriaLabel(input, 'Saved search name');

    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'saved-search-submit';
    submit.dataset.saveSearchSubmit = '1';
    submit.textContent = 'Save';

    form.append(input, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = store.save?.({ name: input.value, state });
      if (result?.ok === false) {
        onError?.(result);
      }
      form.remove();
      onSaved?.(result);
    });

    container.appendChild(form);
    input.focus?.();
    return form;
  }

  function renderSaveSearchButton(container, {
    store,
    state,
    onSaved,
    onError
  } = {}) {
    if (!container) return;
    container.textContent = '';
    if (!hasCompleteSearchState(state)) return;

    const doc = container.ownerDocument;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'saved-search-button';
    button.dataset.saveSearchButton = '1';
    button.textContent = 'Save search';
    setAriaLabel(button, 'Save current search');
    button.addEventListener('click', () => showSaveForm(container, { store, state, onSaved, onError }));
    container.appendChild(button);
  }

  function formatSavedAt(savedAt) {
    const timestamp = Date.parse(savedAt);
    if (!Number.isFinite(timestamp)) return 'Saved';
    const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
    if (days === 0) return 'Saved today';
    if (days === 1) return 'Saved yesterday';
    return `Saved ${days} days ago`;
  }

  function renderSavedSearchDropdown(container, {
    store,
    onRestore,
    onRemove
  } = {}) {
    if (!container) return;
    container.textContent = '';
    const doc = container.ownerDocument;
    const rows = store?.list?.() ?? [];

    const wrapper = doc.createElement('div');
    wrapper.className = 'saved-search-dropdown';

    const summary = doc.createElement('button');
    summary.type = 'button';
    summary.className = 'saved-search-dropdown__toggle';
    summary.dataset.savedSearchToggle = '1';
    summary.textContent = `Saved searches (${rows.length})`;
    setAriaLabel(summary, `Saved searches (${rows.length})`);
    wrapper.appendChild(summary);

    const list = doc.createElement('div');
    list.className = 'saved-search-dropdown__list';
    list.dataset.savedSearchList = '1';

    if (rows.length === 0) {
      const empty = doc.createElement('p');
      empty.className = 'saved-search-empty';
      empty.textContent = 'No saved searches yet';
      list.appendChild(empty);
    } else {
      for (const row of rows) {
        const item = doc.createElement('div');
        item.className = 'saved-search-row';
        item.dataset.savedSearchRow = row.id;

        const restore = doc.createElement('button');
        restore.type = 'button';
        restore.className = 'saved-search-row__restore';
        restore.dataset.savedSearchRestore = row.id;

        const name = doc.createElement('span');
        name.className = 'saved-search-row__name';
        name.textContent = row.name;

        const meta = doc.createElement('span');
        meta.className = 'saved-search-row__meta';
        meta.textContent = formatSavedAt(row.savedAt);

        restore.append(name, meta);
        restore.addEventListener('click', () => onRestore?.(row.state));

        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'saved-search-row__remove';
        remove.dataset.savedSearchRemove = row.id;
        remove.textContent = '×';
        setAriaLabel(remove, `Remove saved search ${row.name}`);
        remove.addEventListener('click', () => {
          store?.remove?.(row.id);
          onRemove?.(row);
          renderSavedSearchDropdown(container, { store, onRestore, onRemove });
        });

        item.append(restore, remove);
        list.appendChild(item);
      }
    }

    wrapper.appendChild(list);
    container.appendChild(wrapper);
  }

  function getFocusableElements(root) {
    if (!root) return [];
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.disabled && node.getAttribute('hidden') === null);
  }

  function moveFacetBarToSheet(state) {
    if (!state?.facetBar || !state?.sheetBody) return;
    if (!state.originalParent) {
      state.originalParent = state.facetBar.parentNode;
      state.originalNextSibling = state.facetBar.nextSibling;
    }
    state.sheetBody.appendChild(state.facetBar);
  }

  function restoreFacetBar(state) {
    if (!state?.facetBar || !state?.originalParent) return;
    state.originalParent.insertBefore(state.facetBar, state.originalNextSibling ?? null);
  }

  function setMobileSheetCounts(state, { activeFacetCount = 0, resultCount = 0 } = {}) {
    if (!state) return;
    const activeCount = Math.max(0, Number(activeFacetCount) || 0);
    const rows = Math.max(0, Number(resultCount) || 0);
    if (state.trigger) {
      state.trigger.textContent = `Filters (${activeCount})`;
    }
    if (state.applyButton) {
      state.applyButton.textContent = `Apply (${rows} result${rows === 1 ? '' : 's'})`;
    }
  }

  function setMobileSheetTab(state, tab = 'filters') {
    if (!state) return;
    const nextTab = ['filters', 'saved', 'compare'].includes(tab) ? tab : 'filters';
    for (const button of state.tabButtons ?? []) {
      const selected = button.getAttribute('data-mobile-sheet-tab') === nextTab;
      button.classList.toggle('mobile-sheet__tab--active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('role', 'tab');
    }
    for (const panel of state.panels ?? []) {
      const selected = panel.getAttribute('data-mobile-sheet-panel') === nextTab;
      panel.hidden = !selected;
      panel.setAttribute('role', 'tabpanel');
    }
    state.activeTab = nextTab;
  }

  function closeMobileSheet() {
    const state = mobileSheetState;
    if (!state?.isOpen) return;
    state.isOpen = false;
    state.sheet.hidden = true;
    state.overlay.hidden = true;
    state.trigger?.setAttribute('aria-expanded', 'false');
    state.sheet.ownerDocument.body.classList.remove('scroll-locked');
    restoreFacetBar(state);
    state.lastFocused?.focus?.();
  }

  function openMobileSheet() {
    const state = mobileSheetState;
    if (!state || state.isOpen) return;
    state.isOpen = true;
    state.lastFocused = state.sheet.ownerDocument.activeElement;
    state.sheet.hidden = false;
    state.overlay.hidden = false;
    state.trigger?.setAttribute('aria-expanded', 'true');
    state.sheet.ownerDocument.body.classList.add('scroll-locked');
    moveFacetBarToSheet(state);
    const focusables = getFocusableElements(state.sheet);
    focusables[0]?.focus?.();
  }

  function toggleMobileSheet(open) {
    if (open === false) {
      closeMobileSheet();
    } else if (open === true) {
      openMobileSheet();
    } else if (mobileSheetState?.isOpen) {
      closeMobileSheet();
    } else {
      openMobileSheet();
    }
  }

  function handleMobileSheetKeydown(event) {
    const state = mobileSheetState;
    if (!state?.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobileSheet();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = getFocusableElements(state.sheet);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = state.sheet.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderMobileFilterSheet(options = {}) {
    const {
      trigger,
      sheet,
      overlay,
      sheetBody,
      facetBar,
      closeButton,
      clearButton,
      applyButton,
      tabButtons = [],
      panels = [],
      activeFacetCount = 0,
      resultCount = 0,
      onClear,
      onApply
    } = options;

    if (!trigger || !sheet || !overlay || !sheetBody || !facetBar) return null;

    if (!mobileSheetState || mobileSheetState.trigger !== trigger || mobileSheetState.sheet !== sheet) {
      mobileSheetState = {
        trigger,
        sheet,
        overlay,
        sheetBody,
        facetBar,
        closeButton,
        clearButton,
        applyButton,
        tabButtons: [...tabButtons],
        panels: [...panels],
        activeTab: 'filters',
        isOpen: false,
        originalParent: facetBar.parentNode,
        originalNextSibling: facetBar.nextSibling
      };

      trigger.type = trigger.type || 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      if (sheet.id) trigger.setAttribute('aria-controls', sheet.id);

      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-labelledby', sheet.getAttribute('aria-labelledby') || 'mobileFilterTitle');

      trigger.addEventListener('click', () => openMobileSheet());
      overlay.addEventListener('click', () => closeMobileSheet());
      closeButton?.addEventListener('click', () => closeMobileSheet());
      applyButton?.addEventListener('click', () => {
        mobileSheetState?.onApply?.();
        closeMobileSheet();
      });
      clearButton?.addEventListener('click', () => mobileSheetState?.onClear?.());
      for (const button of mobileSheetState.tabButtons) {
        button.addEventListener('click', () => setMobileSheetTab(mobileSheetState, button.getAttribute('data-mobile-sheet-tab')));
      }
      sheet.ownerDocument.addEventListener('keydown', handleMobileSheetKeydown);
    }

    mobileSheetState.facetBar = facetBar;
    mobileSheetState.sheetBody = sheetBody;
    mobileSheetState.tabButtons = [...tabButtons];
    mobileSheetState.panels = [...panels];
    mobileSheetState.onClear = onClear;
    mobileSheetState.onApply = onApply;
    setMobileSheetTab(mobileSheetState, mobileSheetState.activeTab ?? 'filters');
    setMobileSheetCounts(mobileSheetState, { activeFacetCount, resultCount });
    return mobileSheetState;
  }

  function formatAud(value) {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0
    }).format(value);
  }

  function getRetailerName(retailer) {
    return String(retailer?.n ?? retailer?.name ?? retailer?.retailer ?? '')
      .replace(/\s+\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRetailerPrice(retailer) {
    for (const key of ['p', 'price', 'current_price', 'sale_price']) {
      const parsed = Number(retailer?.[key]);
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
    }
    return null;
  }

  function buildRetailerSummaryHtml(match) {
    const retailers = Array.isArray(match?.retailers) ? match.retailers : [];
    if (retailers.length === 0) return '';

    const names = retailers
      .map(getRetailerName)
      .filter(Boolean)
      .slice(0, 4);
    const prices = retailers
      .map(getRetailerPrice)
      .filter((price) => Number.isFinite(price))
      .sort((left, right) => left - right);
    const minPrice = prices[0] ?? null;
    const maxPrice = prices[prices.length - 1] ?? null;
    const priceHtml = minPrice === null
      ? ''
      : minPrice === maxPrice
        ? `<span class="price-single">${escHtml(formatAud(minPrice))}</span>`
        : `<span class="price-range">From ${escHtml(formatAud(minPrice))} to ${escHtml(formatAud(maxPrice))}</span>`;

    return `
      <div class="fit-retailer-summary">
        ${names.length > 0 ? `<div class="retailer-strip">${names.map((name) => `<span class="retailer-chip">${escHtml(name)}</span>`).join('')}</div>` : ''}
        <div class="retailer-price-line">
          ${priceHtml}
          <span class="retailer-count">from ${retailers.length} retailer${retailers.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    `;
  }

  function formatClearanceMm(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
  }

  function buildManufacturerAdvisoryHtml(match) {
    const clearance = match?.manufacturerClearance;
    if (!clearance) return '';
    const side = formatClearanceMm(clearance.side ?? clearance.sides);
    const top = formatClearanceMm(clearance.top);
    const rear = formatClearanceMm(clearance.rear);
    if (side === 0 && top === 0 && rear === 0) return '';
    return `
      <div class="fit-card-advisory">
        Manufacturer suggests <strong>+${side}mm sides, +${top}mm top, +${rear}mm rear</strong> for ventilation.
      </div>
    `;
  }

  function buildNearMissBadgeHtml(match) {
    const needed = Number(match?.cavityNeededMm);
    if (!Number.isFinite(needed) || needed <= 0) return '';
    return `<span class="fit-badge fit-badge--near-miss">+${Math.ceil(needed)}mm cavity needed</span>`;
  }

  function categoryLabel(cat) {
    return {
      fridge: 'fridge',
      dishwasher: 'dishwasher',
      dryer: 'dryer',
      washing_machine: 'washing machine'
    }[cat] || '';
  }

  function buildSearchOnlineUrl(match) {
    const query = [
      safeDisplayText(match?.brand, ''),
      safeDisplayText(match?.model ?? match?.sku, ''),
      categoryLabel(match?.cat),
      'australia'
    ].filter(Boolean).join(' ');
    return `https://www.google.com.au/search?q=${encodeURIComponent(query)}`;
  }

  function getRetailerUrl(retailer) {
    return String(retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link ?? '').trim();
  }

  function getRetailerSummaries(match) {
    return (Array.isArray(match?.retailers) ? match.retailers : [])
      .map((retailer) => ({
        name: getRetailerName(retailer),
        price: getRetailerPrice(retailer),
        url: getRetailerUrl(retailer)
      }))
      .filter((retailer) => retailer.name);
  }

  function getBestRetailer(match) {
    const retailers = getRetailerSummaries(match);
    if (retailers.length === 0) return null;
    return [...retailers].sort((left, right) => {
      const leftPrice = Number.isFinite(left.price) ? left.price : Number.MAX_SAFE_INTEGER;
      const rightPrice = Number.isFinite(right.price) ? right.price : Number.MAX_SAFE_INTEGER;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return left.name.localeCompare(right.name);
    })[0];
  }

  function getCardTitle(match) {
    const brand = safeDisplayText(match?.brand, '');
    const model = safeDisplayText(match?.model ?? match?.sku, '');
    const modelWithoutBrand = brand && model.toLowerCase().startsWith(brand.toLowerCase())
      ? model
      : [brand, model].filter(Boolean).join(' ');
    return modelWithoutBrand || safeDisplayText(match?.displayName || match?.readableSpec, 'Appliance');
  }

  function getCardSubtitle(match, title) {
    const candidate = safeDisplayText(match?.readableSpec || match?.displayName, '');
    if (!candidate || candidate.toLowerCase() === String(title).toLowerCase()) return '';
    return candidate;
  }

  function getProductInitials(match) {
    const brand = safeDisplayText(match?.brand, '');
    const parts = brand.split(/[\s\-&]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  function hashAccent(value) {
    const palette = ['#8b7355', '#6b8e6b', '#7d6b8e', '#8e756b', '#5f7f8e', '#8e6f7b', '#6f7f66', '#7f785f'];
    const text = safeDisplayText(value, '');
    const hash = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[hash % palette.length] ?? palette[0];
  }

  function buildCardThumbHtml(match) {
    const title = safeDisplayText(match?.brand, 'Product');
    return `
      <div class="card-thumb-avatar" role="img" aria-label="${escHtml(`${title} product card`)}" style="--thumb-accent:${escHtml(hashAccent(title))}">
        <span>${escHtml(getProductInitials(match))}</span>
      </div>
    `;
  }

  function getFitGapMm(match) {
    const explicit = Number(match?.fitGapMm ?? match?.gapMm ?? match?.tightestGapMm);
    if (Number.isFinite(explicit)) return Math.round(explicit);
    const needed = Number(match?.cavityNeededMm);
    if (Number.isFinite(needed) && needed > 0) return Math.ceil(needed);
    const score = Number(match?.fitScore);
    const minDimension = Math.min(
      ...[match?.w, match?.h, match?.d]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    if (Number.isFinite(score) && Number.isFinite(minDimension)) return Math.max(0, Math.round(score * minDimension));
    return match?.fitsTightly ? 4 : 20;
  }

  function getFitBadgeState(match) {
    const needed = Number(match?.cavityNeededMm);
    if (Number.isFinite(needed) && needed > 0) return 'relax';
    if (match?.fitsTightly || getFitGapMm(match) < 5) return 'tight';
    return 'exact';
  }

  function buildFitBadgeHtml(match) {
    const state = getFitBadgeState(match);
    const gap = getFitGapMm(match);
    if (state === 'relax') {
      return `<span class="fit-badge fit-badge--relax">+${escHtml(gap)}mm cavity needed</span>`;
    }
    if (state === 'tight') {
      return `<span class="fit-badge fit-badge--tight">⚠ Tight fit (${escHtml(gap)}mm spare)</span>`;
    }
    return `<span class="fit-badge fit-badge--exact">✓ Fits with ${escHtml(gap)}mm spare</span>`;
  }

  function buildSpecChipsHtml(match) {
    const specs = [
      ['W', match?.w],
      ['H', match?.h],
      ['D', match?.d]
    ].filter(([, value]) => Number.isFinite(Number(value)));
    return specs.length === 0
      ? ''
      : `<div class="card-specs-row">${specs.map(([label, value]) => `<span class="spec-chip">${label} ${escHtml(Math.round(Number(value)))}mm</span>`).join('')}</div>`;
  }

  function getFeatureBits(match) {
    const raw = Array.isArray(match?.features) ? match.features : [
      match?.configuration,
      match?.type,
      match?.mount,
      match?.class ? `Class ${match.class}` : ''
    ];
    return raw
      .map((value) => safeDisplayText(value, ''))
      .filter(Boolean)
      .slice(0, 3);
  }

  function buildEnergyLineHtml(match) {
    const bits = [];
    const stars = Number(match?.stars);
    if (Number.isFinite(stars) && stars > 0) bits.push(`⚡ ${stars}★ GEMS`);
    const kwh = Number(match?.kwh_year ?? match?.energy_kwh_year ?? match?.kwh);
    if (Number.isFinite(kwh) && kwh > 0) {
      const annual = Math.round(kwh * 0.3);
      bits.push(`~${formatAud(annual)}/yr`);
      bits.push(`10yr ~${formatAud(annual * 10)}`);
    }
    bits.push(...getFeatureBits(match));
    return bits.length > 0 ? `<div class="card-energy-line">${escHtml(bits.join(' · '))}</div>` : '';
  }

  function buildCardPriceHtml(match) {
    const prices = getRetailerSummaries(match)
      .map((retailer) => retailer.price)
      .filter((price) => Number.isFinite(price))
      .sort((left, right) => left - right);
    if (prices.length === 0) return '<div class="card-price">Price unavailable</div>';
    return `<div class="card-price">${escHtml(prices[0] === prices[prices.length - 1] ? formatAud(prices[0]) : `From ${formatAud(prices[0])}`)}</div>`;
  }

  function buildCardCtaHtml(match) {
    const best = getBestRetailer(match);
    if (best?.url) {
      return `<a href="${escHtml(best.url)}" target="_blank" rel="sponsored nofollow noopener">View at ${escHtml(best.name)}</a>`;
    }
    return `<a href="${escHtml(buildSearchOnlineUrl(match))}" target="_blank" rel="sponsored nofollow noopener">Search this model<span>retailer info not available</span></a>`;
  }

  function buildCommissionDisclosureHtml() {
    return '<div class="commission-disclosure">Some retailer links may earn us a small commission. <a href="/affiliate-disclosure">Disclosure</a>.</div>';
  }

  function buildCompareSnapshot(match) {
    return {
      slug: String(match?.id ?? match?.slug ?? '').trim(),
      displayName: safeDisplayText(match?.displayName ?? match?.brand, 'Appliance'),
      brand: safeDisplayText(match?.brand, ''),
      w: Number.isFinite(Number(match?.w)) ? Math.round(Number(match.w)) : null,
      h: Number.isFinite(Number(match?.h)) ? Math.round(Number(match.h)) : null,
      d: Number.isFinite(Number(match?.d)) ? Math.round(Number(match.d)) : null,
      retailers: (Array.isArray(match?.retailers) ? match.retailers : []).slice(0, 4).map((retailer) => ({
        name: getRetailerName(retailer),
        price: getRetailerPrice(retailer)
      })).filter((retailer) => retailer.name),
      stars: Number.isFinite(Number(match?.stars)) ? Number(match.stars) : null
    };
  }

  function buildCompareButtonHtml(match, { compareStore = null } = {}) {
    const snapshot = buildCompareSnapshot(match);
    if (!snapshot.slug) return '';
    const selected = Boolean(compareStore?.has?.(snapshot.slug));
    return `
      <button
        type="button"
        class="btn-compare fit-compare-toggle${selected ? ' fit-compare-toggle--selected' : ''}"
        data-compare-toggle="${escHtml(snapshot.slug)}"
        data-compare-snapshot="${escHtml(JSON.stringify(snapshot))}"
        aria-pressed="${selected ? 'true' : 'false'}"
      >${selected ? '✓ Compare' : '+ Compare'}</button>
    `;
  }

  function updateCompareToggle(button, selected) {
    if (!button) return;
    button.classList.toggle('fit-compare-toggle--selected', Boolean(selected));
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.textContent = selected ? '✓ Compare' : '+ Compare';
  }

  function bindCompareButtons(root, {
    compareStore,
    onChange,
    onLimit
  } = {}) {
    if (!root || !compareStore) return;
    root.querySelectorAll('[data-compare-toggle]').forEach((button) => {
      const slug = String(button.getAttribute('data-compare-toggle') ?? '').trim();
      updateCompareToggle(button, compareStore.has?.(slug));
      button.addEventListener('click', () => {
        if (compareStore.has?.(slug)) {
          compareStore.remove?.(slug);
          updateCompareToggle(button, false);
          onChange?.(compareStore.list?.() ?? []);
          return;
        }
        let snapshot = null;
        try {
          snapshot = JSON.parse(button.getAttribute('data-compare-snapshot') ?? '{}');
        } catch {
          snapshot = null;
        }
        const result = compareStore.add?.(snapshot);
        if (result?.ok === false && result.reason === 'capacity') {
          onLimit?.(result);
          return;
        }
        updateCompareToggle(button, compareStore.has?.(slug));
        onChange?.(compareStore.list?.() ?? []);
      });
    });
  }

  function buildCardHtml(match, options = {}) {
    const title = getCardTitle(match);
    const subtitle = getCardSubtitle(match, title);
    const isTight = getFitBadgeState(match) === 'tight';

    return `
      <li class="fit-result-item" data-appliance-slug="${escHtml(match.id)}">
        <div class="card-grid">
          <div class="card-thumb-cell">${buildCardThumbHtml(match)}</div>
          <div class="card-info-cell">
            <div class="card-title">${escHtml(title)}</div>
            ${subtitle ? `<div class="card-subtitle">${escHtml(subtitle)}</div>` : ''}
            <div class="card-fit-row">
              ${buildFitBadgeHtml(match)}
              ${isTight ? '<span class="warning-pill">verify ventilation</span>' : ''}
              ${match.showPopularityBadge ? '<span class="fit-badge fit-badge--popular">Popular in AU</span>' : ''}
            </div>
            ${buildSpecChipsHtml(match)}
            ${buildEnergyLineHtml(match)}
            ${buildManufacturerAdvisoryHtml(match)}
            ${match.sku ? `<div class="fit-result-sku">SKU ${escHtml(match.sku)}</div>` : ''}
            ${buildRetailerSummaryHtml(match)}
          </div>
          <div class="card-action-cell">
            ${buildCardPriceHtml(match)}
            <div class="card-buttons">
              <button type="button" class="icon-btn" aria-label="Save appliance">♡</button>
              ${buildCompareButtonHtml(match, options)}
            </div>
            <div class="card-cta">${buildCardCtaHtml(match)}</div>
          </div>
        </div>
      </li>
    `;
  }

  function renderFitVisualization(container, {
    cavity,
    product,
    clearance
  } = {}) {
    if (!container) return false;
    const renderer = globalScope?.FitVisualization;
    if (!renderer?.renderFitVisualizationGroup || !product) {
      container.textContent = '';
      container.hidden = true;
      return false;
    }
    container.hidden = false;
    container.innerHTML = renderer.renderFitVisualizationGroup({
      cavity,
      product,
      clearance
    });
    return true;
  }

  function renderSearchResults({
    matches,
    filters,
    resultsEl,
    messageEl,
    emptyState,
    onRelaxClick,
    nearMisses = []
  }) {
    if (!resultsEl || !messageEl) return;

    if (!Array.isArray(matches) || matches.length === 0) {
      const nearRows = Array.isArray(nearMisses) ? nearMisses.slice(0, 10) : [];
      if (nearRows.length > 0) {
        const title = 'No exact fits — these need a slightly larger cavity:';
        messageEl.textContent = title;
        resultsEl.innerHTML = `
          <div class="fit-empty-state fit-empty-state--near-miss">
            <strong>${escHtml(title)}</strong>
            <p>These appliances physically fit the cavity, but need a little more room for the practical ventilation buffer.</p>
          </div>
          ${buildCommissionDisclosureHtml()}
          <ul class="fit-result-list fit-result-list--near-miss">${nearRows.map((match) => buildCardHtml(match)).join('')}</ul>
        `;
        return;
      }
      const title = emptyState?.title ?? '0 exact matches.';
      const baseDetail = emptyState?.detail ?? 'Try a preset or relax the tolerance.';
      const detail = /too small for this category/i.test(baseDetail)
        ? baseDetail
        : `${baseDetail} Your cavity may be too small for this category.`;
      const ctaLabel = emptyState?.ctaLabel ?? 'Relax';
      const canRelax = typeof onRelaxClick === 'function';

      messageEl.textContent = title;
      resultsEl.innerHTML = `
        <div class="fit-empty-state">
          <strong>${escHtml(title)}</strong>
          <p>${escHtml(detail)}</p>
          ${canRelax ? `<button type="button" class="secondary" data-relax-search>${escHtml(ctaLabel)}</button>` : ''}
        </div>
      `;
      const relaxButton = resultsEl.querySelector('[data-relax-search]');
      if (relaxButton) {
        relaxButton.addEventListener('click', () => onRelaxClick());
      }
      return;
    }

    const bits = [];
    if (filters?.w) bits.push(`W ${filters.w}`);
    if (filters?.h) bits.push(`H ${filters.h}`);
    if (filters?.d) bits.push(`D ${filters.d}`);
    if (Number.isFinite(Number(filters?.toleranceMm))) bits.push(`±${filters.toleranceMm}mm tolerance`);

    messageEl.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'} found${bits.length > 0 ? ` for ${bits.join(' · ')}` : ''}.`;
    resultsEl.innerHTML = `${buildCommissionDisclosureHtml()}<ul class="fit-result-list">${matches.map((match) => buildCardHtml(match)).join('')}</ul>`;
  }

  function formatDimension(snapshot) {
    const bits = [snapshot?.w, snapshot?.h, snapshot?.d];
    return bits.every((value) => Number.isFinite(Number(value)))
      ? `${snapshot.w} × ${snapshot.h} × ${snapshot.d} mm`
      : '-';
  }

  function formatComparePrice(snapshot) {
    const prices = (Array.isArray(snapshot?.retailers) ? snapshot.retailers : [])
      .map((retailer) => Number(retailer?.price))
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((left, right) => left - right);
    if (prices.length === 0) return '-';
    const min = prices[0];
    const max = prices[prices.length - 1];
    return min === max ? formatAud(min) : `${formatAud(min)} – ${formatAud(max)}`;
  }

  function renderCompareTray(container, {
    store,
    onOpen,
    onRemove,
    onClear
  } = {}) {
    if (!container) return;
    const rows = store?.list?.() ?? [];
    container.textContent = '';
    container.hidden = rows.length === 0;
    container.className = `compare-tray${rows.length > 0 ? ' compare-tray--visible' : ''}`;
    if (rows.length === 0) return;

    const doc = container.ownerDocument;
    const items = doc.createElement('div');
    items.className = 'compare-tray__items';
    for (const row of rows) {
      const chip = doc.createElement('div');
      chip.className = 'compare-tray__chip';
      const label = doc.createElement('span');
      label.textContent = row.snapshot?.displayName ?? row.id;
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.dataset.compareRemove = row.id;
      setAriaLabel(remove, `Remove ${row.snapshot?.displayName ?? row.id} from compare`);
      remove.addEventListener('click', () => {
        store?.remove?.(row.id);
        onRemove?.(row);
        renderCompareTray(container, { store, onOpen, onRemove, onClear });
      });
      chip.append(label, remove);
      items.appendChild(chip);
    }

    const actions = doc.createElement('div');
    actions.className = 'compare-tray__actions';
    const hint = doc.createElement('span');
    hint.className = 'compare-tray__hint';
    hint.textContent = rows.length < 2 ? 'Add at least 2 to compare' : `${rows.length} selected`;
    const open = doc.createElement('button');
    open.type = 'button';
    open.className = 'compare-tray__open';
    open.dataset.compareOpen = '1';
    open.disabled = rows.length < 2;
    open.textContent = 'Compare';
    open.addEventListener('click', () => {
      if (rows.length >= 2) onOpen?.(rows);
    });
    const clear = doc.createElement('button');
    clear.type = 'button';
    clear.className = 'compare-tray__clear';
    clear.dataset.compareClear = '1';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', () => {
      store?.clear?.();
      onClear?.();
      renderCompareTray(container, { store, onOpen, onRemove, onClear });
    });

    actions.append(hint, open, clear);
    container.append(items, actions);
  }

  function renderCompareModal(container, {
    items = [],
    onClose
  } = {}) {
    if (!container) return;
    const rows = Array.isArray(items) ? items : [];
    const doc = container.ownerDocument;
    const close = () => {
      container.hidden = true;
      onClose?.();
    };

    container.hidden = false;
    container.textContent = '';
    container.className = 'compare-modal compare-modal--search';

    const backdrop = doc.createElement('div');
    backdrop.className = 'compare-modal-backdrop';
    backdrop.addEventListener('click', close);

    const panel = doc.createElement('div');
    panel.className = 'compare-modal-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'searchCompareTitle');

    const head = doc.createElement('div');
    head.className = 'compare-modal-head';
    const title = doc.createElement('h3');
    title.id = 'searchCompareTitle';
    title.textContent = 'Compare appliances';
    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'compare-modal-close';
    closeButton.dataset.compareModalClose = '1';
    closeButton.textContent = '×';
    setAriaLabel(closeButton, 'Close comparison');
    closeButton.addEventListener('click', close);
    head.append(title, closeButton);

    const body = doc.createElement('div');
    body.className = 'compare-modal-body';
    const cells = rows.map((row) => row.snapshot);
    body.innerHTML = `
      <table class="compare-table">
        <thead><tr><th>Metric</th>${cells.map((snapshot) => `<th>${escHtml(snapshot.displayName)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th>Dimensions</th>${cells.map((snapshot) => `<td>${escHtml(formatDimension(snapshot))}</td>`).join('')}</tr>
          <tr><th>Energy stars</th>${cells.map((snapshot) => `<td>${escHtml(snapshot.stars ?? '-')}</td>`).join('')}</tr>
          <tr><th>Retailers</th>${cells.map((snapshot) => `<td>${escHtml((snapshot.retailers ?? []).map((retailer) => retailer.name).join(', ') || '-')}</td>`).join('')}</tr>
          <tr><th>Price</th>${cells.map((snapshot) => `<td>${escHtml(formatComparePrice(snapshot))}</td>`).join('')}</tr>
        </tbody>
      </table>
    `;
    const action = doc.createElement('button');
    action.type = 'button';
    action.className = 'secondary';
    action.dataset.compareModalAction = '1';
    action.textContent = 'Close';
    action.addEventListener('click', close);
    body.appendChild(action);

    panel.append(head, body);
    container.append(backdrop, panel);

    const onKeydown = (event) => {
      if (container.hidden) {
        doc.removeEventListener('keydown', onKeydown);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        doc.removeEventListener('keydown', onKeydown);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    doc.addEventListener('keydown', onKeydown);
    closeButton.focus?.();
  }

  const api = {
    bindCompareButtons,
    buildCardHtml,
    buildCompareSnapshot,
    escHtml,
    renderActiveChips,
    renderCompareModal,
    renderCompareTray,
    renderFacetBar,
    renderLiveCount,
    renderMobileFilterSheet,
    renderFitVisualization,
    renderPresetChips,
    renderSaveSearchButton,
    renderSearchResults,
    renderSavedSearchDropdown,
    renderSortDropdown,
    showSaveForm,
    toggleMobileSheet
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.SearchDom = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
