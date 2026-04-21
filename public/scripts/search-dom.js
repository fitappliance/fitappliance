'use strict';

(function attachSearchDom(globalScope) {
  function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[char]));
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
    renderPresetChips,
    renderSearchResults
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.SearchDom = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
