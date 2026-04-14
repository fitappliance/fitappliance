export function starsHtml(n, total = 6) {
  return Array.from(
    { length: total },
    (_, i) => `<span class="${i < n ? 'star-f' : 'star-e'}">★</span>`
  ).join('');
}

export function warningsHtml(p) {
  const warns = [];
  if (p.vented) {
    warns.push({
      text: '⚠️ Vented dryer — external ducting required (NCC 2022)',
      tone: 'red',
    });
  }
  if (p.top_loader) {
    warns.push({
      text: '⚠️ Top-loader — not suitable for under-bench installation',
      tone: 'red',
    });
  }
  if (p.door_swing_mm === null) {
    warns.push({
      text: '⏳ 开门间距待确认',
      tone: 'amber',
    });
  } else if (p.door_swing_mm > 0) {
    warns.push({
      text: `🚪 需预留 ${p.door_swing_mm}mm 开门间距`,
      tone: 'red',
    });
  }

  return warns
    .map((warning) => {
      const className = warning.tone === 'amber' ? 'card-warning card-warning-amber' : 'card-warning';
      return `<div class="${className}"><span>${warning.text}</span></div>`;
    })
    .join('');
}

export function buildCard(p, deps = {}) {
  const tcoHtml = deps.tcoHtml ?? (() => '');
  const retailersHtml = deps.retailersHtml ?? (() => '');
  const stars = deps.starsHtml ?? starsHtml;
  const warnings = deps.warningsHtml ?? warningsHtml;

  return `
  <div class="p-card">
    <div class="card-emoji">${p.emoji}${p.sponsored ? '<span class="sponsored-tag">Sponsored</span>' : ''}</div>
    <div class="card-body">
      <div class="c-brand">${p.brand}</div>
      <div class="c-name">${p.model}</div>
      <div class="c-dims">
        <span class="dim-tag">W ${p.w}mm</span>
        <span class="dim-tag">H ${p.h}mm</span>
        <span class="dim-tag">D ${p.d}mm</span>
      </div>
      <div class="c-energy">
        <div class="stars">${stars(p.stars)}</div>
        <span class="energy-lbl">${p.stars}-star GEMS rating</span>
      </div>
      ${tcoHtml(p)}
      <div class="c-features">${p.features.join(' · ')}</div>
      <div class="c-footer">
        <div class="c-price">$${Math.min(...p.retailers.map(r => r.p)).toLocaleString()}<small>AUD best price</small></div>
        <div class="c-actions">
          <button class="btn-compare" onclick="addCompare('${p.id}','${p.brand} ${p.model.split(' ').slice(0, 3).join(' ')}')">Compare</button>
          <a class="btn-buy" href="${p.retailers[0].url}" target="_blank" rel="noopener sponsored">Buy</a>
        </div>
      </div>
    </div>
    ${warnings(p)}
    ${retailersHtml(p)}
  </div>`;
}

export function buildRow(p, deps = {}) {
  const annualEnergyCost = deps.annualEnergyCost ?? (() => '0');
  const lifetimeCost = deps.lifetimeCost ?? (() => 0);
  const bestP = Math.min(...p.retailers.map(r => r.p));
  const annual = annualEnergyCost(p.kwh_year);
  const total = Math.round(lifetimeCost(p.price, p.kwh_year));

  return `
  <div class="p-row">
    <div class="p-row-emoji">${p.emoji}</div>
    <div class="p-row-body">
      <div class="p-row-meta">
        <span class="p-row-brand">${p.brand}</span>
        ${p.sponsored ? '<span class="tag tag-amber">Sponsored</span>' : ''}
        <span class="tag tag-green">${p.stars}★ GEMS</span>
        ${p.vented ? '<span class="tag tag-red">Vented</span>' : ''}
        ${p.door_swing_mm === null ? '<span class="tag tag-amber">⏳ 开门间距待确认</span>' : ''}
        ${p.door_swing_mm > 0 ? `<span class="tag tag-red">🚪 需预留 ${p.door_swing_mm}mm</span>` : ''}
      </div>
      <div class="p-row-name">${p.model}</div>
      <div class="p-row-dims">
        <span class="dim-tag">W ${p.w}mm</span>
        <span class="dim-tag">H ${p.h}mm</span>
        <span class="dim-tag">D ${p.d}mm</span>
      </div>
      <div style="font-size:12px;color:var(--green);margin-top:4px">⚡ ~$${annual}/yr · 10yr TCO ~$${total.toLocaleString()} · ${p.features.slice(0, 3).join(' · ')}</div>
      ${p.vented ? '<div style="font-size:12px;color:var(--red);margin-top:4px">⚠️ Vented — external ducting required (NCC 2022). Not for apartments.</div>' : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        ${p.retailers.map(r => `<a href="${r.url}" target="_blank" rel="noopener sponsored" style="font-size:12.5px;color:var(--copper);font-weight:600;text-decoration:none;background:var(--copper-bg);padding:4px 10px;border-radius:6px">${r.n} $${r.p.toLocaleString()} ↗</a>`).join('')}
      </div>
      <div style="font-size:10.5px;color:var(--ink-3);margin-top:4px;font-style:italic">We earn a commission if you purchase via these links. <a href="#" style="color:var(--copper)">Disclosure</a></div>
    </div>
    <div class="p-row-actions">
      <div class="p-row-price">$${bestP.toLocaleString()}<small>AUD best price</small></div>
      <div style="display:flex;gap:6px">
        <button class="btn-compare" onclick="addCompare('${p.id}','${p.brand} ${p.model.split(' ').slice(0, 2).join(' ')}')">Compare</button>
        <a class="btn-buy" href="${p.retailers[0].url}" target="_blank" rel="noopener sponsored">Buy</a>
      </div>
    </div>
  </div>`;
}
