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
    availabilityButton.className = `facet-toggle${activeFacets?.availableOnly !== false ? ' facet-toggle--active' : ''}`;
    availabilityButton.dataset.facetAvailability = '1';
    availabilityButton.setAttribute('role', 'switch');
    availabilityButton.setAttribute('tabindex', '0');
    availabilityButton.setAttribute('aria-checked', activeFacets?.availableOnly !== false ? 'true' : 'false');
    availabilityButton.textContent = 'Available in AU';
    bindToggleButton(availabilityButton, { type: 'availableOnly', value: activeFacets?.availableOnly === false }, onChange);
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
    if (activeFacets?.availableOnly === false) {
      chips.push({ key: 'availableOnly', value: false, label: 'Include unavailable' });
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
      sheet.ownerDocument.addEventListener('keydown', handleMobileSheetKeydown);
    }

    mobileSheetState.facetBar = facetBar;
    mobileSheetState.sheetBody = sheetBody;
    mobileSheetState.onClear = onClear;
    mobileSheetState.onApply = onApply;
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

  function buildCardHtml(match) {
    const metaBits = [
      match.readableSpec,
      `W ${match.w} × H ${match.h} × D ${match.d} mm`
    ].filter(Boolean);

    return `
      <li class="fit-result-item" data-appliance-slug="${escHtml(match.id)}">
        <div class="fit-result-top">
          <div>
            <div class="fit-result-title-row">
              <div class="fit-result-title">${escHtml(match.displayName || match.brand || 'Appliance')}</div>
              ${match.showPopularityBadge ? '<span class="fit-badge fit-badge--popular">Popular in AU</span>' : ''}
            </div>
            <div class="fit-result-meta">${escHtml(metaBits.join(' · '))}</div>
            ${match.sku ? `<div class="fit-result-sku">SKU ${escHtml(match.sku)}</div>` : ''}
            ${buildRetailerSummaryHtml(match)}
          </div>
          ${match.fitsTightly ? '<span class="fit-badge fit-badge--tight">Tight fit — verify before purchase</span>' : ''}
        </div>
        <a href="${escHtml(match.url)}">Open in FitAppliance →</a>
      </li>
    `;
  }

  function renderSearchResults({
    matches,
    filters,
    resultsEl,
    messageEl,
    emptyState,
    onRelaxClick
  }) {
    if (!resultsEl || !messageEl) return;

    if (!Array.isArray(matches) || matches.length === 0) {
      const title = emptyState?.title ?? '0 exact matches.';
      const detail = emptyState?.detail ?? 'Try a preset or relax the tolerance.';
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
    resultsEl.innerHTML = `<ul class="fit-result-list">${matches.map((match) => buildCardHtml(match)).join('')}</ul>`;
  }

  const api = {
    buildCardHtml,
    escHtml,
    renderActiveChips,
    renderFacetBar,
    renderLiveCount,
    renderMobileFilterSheet,
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
