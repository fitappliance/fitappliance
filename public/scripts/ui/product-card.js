import { displayBrandName } from './brand-utils.js';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function buildNoRetailerUrl(product) {
  const sku = (product?.model ?? '').trim().split(/\s+/)[0];
  const query = encodeURIComponent(
    sku ? `${sku} buy australia` : `${product?.brand ?? ''} ${product?.model ?? ''} buy australia`
  );
  return `https://www.google.com.au/search?q=${query}&tbm=shop`;
}

// Australian state energy rebate programs (NSW/VIC/SA/QLD) typically require >= 4-star GEMS.
const REBATE_STAR_THRESHOLD = 4;

export function isRebateEligible(product) {
  return typeof product?.stars === 'number' && product.stars >= REBATE_STAR_THRESHOLD;
}

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
  if (p.door_swing_mm === null || p.door_swing_mm === undefined) {
    warns.push({
      text: '⏳ Door swing clearance pending confirmation',
      tone: 'amber',
    });
  } else if (p.door_swing_mm > 0) {
    warns.push({
      text: `🚪 Requires ${p.door_swing_mm}mm door swing clearance`,
      tone: 'red',
    });
  }

  if (isRebateEligible(p)) {
    warns.push({
      text: '💰 May qualify for state energy rebate — <a href="https://www.energy.gov.au/households/energy-rebates-and-assistance" target="_blank" rel="noopener noreferrer">check eligibility ↗</a>',
      tone: 'green',
    });
  }

  return warns
    .map((warning) => {
      const className =
        warning.tone === 'amber' ? 'card-warning card-warning-amber' :
        warning.tone === 'green' ? 'card-warning card-warning-green' :
        'card-warning';
      return `<div class="${className}"><span>${warning.text}</span></div>`;
    })
    .join('');
}

export function buildCard(p, deps = {}) {
  const tcoHtml = deps.tcoHtml ?? (() => '');
  const retailersHtml = deps.retailersHtml ?? (() => '');
  const stars = deps.starsHtml ?? starsHtml;
  const warnings = deps.warningsHtml ?? warningsHtml;
  const resolveRetailerUrl = deps.resolveRetailerUrl ?? ((retailer) => retailer.url);
  const retailers = Array.isArray(p.retailers) ? p.retailers : [];
  const hasPrice = retailers.length > 0;
  const bestPrice = hasPrice ? Math.min(...retailers.map(r => r.p)) : null;
  const primaryRetailer = hasPrice ? retailers[0] : null;
  const noRetailerUrl = hasPrice ? '' : buildNoRetailerUrl(p);
  const displayBrand = displayBrandName(p.brand);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 3).join(' ')}`;

  return `
  <div class="p-card">
    <div class="card-emoji">${p.emoji}${p.sponsored ? '<span class="sponsored-tag">Sponsored</span>' : ''}</div>
    <div class="card-body">
      <div class="c-brand">${displayBrand}</div>
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
        ${
          hasPrice
            ? `<div class="c-price">$${bestPrice.toLocaleString()}<small>AUD best price</small></div>`
            : '<div class="c-price no-price">Price unavailable — search online</div>'
        }
        <div class="c-actions">
          <button class="btn-compare" onclick="addCompare('${p.id}','${escHtml(compareLabel)}')">Compare</button>
          ${
            hasPrice
              ? `<a class="btn-buy" href="${resolveRetailerUrl(primaryRetailer, p)}" target="_blank" rel="noopener sponsored">Buy</a>`
              : `<a class="btn-buy btn-buy--ghost" href="${escHtml(noRetailerUrl)}" target="_blank" rel="noopener noreferrer">Search online</a>`
          }
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
  const resolveRetailerUrl = deps.resolveRetailerUrl ?? ((retailer) => retailer.url);
  const retailers = Array.isArray(p.retailers) ? p.retailers : [];
  const hasPrice = retailers.length > 0;
  const bestP = hasPrice ? Math.min(...retailers.map(r => r.p)) : null;
  const noRetailerUrl = hasPrice ? '' : buildNoRetailerUrl(p);
  const displayBrand = displayBrandName(p.brand);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 2).join(' ')}`;
  const annual = annualEnergyCost(p.kwh_year);
  const total = Math.round(lifetimeCost(p.price, p.kwh_year));

  return `
  <div class="p-row">
    <div class="p-row-emoji">${p.emoji}</div>
    <div class="p-row-body">
      <div class="p-row-meta">
        <span class="p-row-brand">${displayBrand}</span>
        ${p.sponsored ? '<span class="tag tag-amber">Sponsored</span>' : ''}
        <span class="tag tag-green">${p.stars}★ GEMS</span>
        ${p.vented ? '<span class="tag tag-red">Vented</span>' : ''}
        ${p.door_swing_mm === null || p.door_swing_mm === undefined ? '<span class="tag tag-amber">⏳ Door swing pending confirmation</span>' : ''}
        ${p.door_swing_mm > 0 ? `<span class="tag tag-red">🚪 Requires ${p.door_swing_mm}mm clearance</span>` : ''}
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
        ${hasPrice ? retailers.map(r => `<a href="${resolveRetailerUrl(r, p)}" target="_blank" rel="noopener sponsored" style="font-size:12.5px;color:var(--copper);font-weight:600;text-decoration:none;background:var(--copper-bg);padding:4px 10px;border-radius:6px">${r.n} $${r.p.toLocaleString()} ↗</a>`).join('') : ''}
      </div>
      <div style="font-size:10.5px;color:var(--ink-3);margin-top:4px;font-style:italic">We earn a commission if you purchase via these links. <a href="/affiliate-disclosure" style="color:var(--copper)">Disclosure</a></div>
    </div>
    <div class="p-row-actions">
      ${
        hasPrice
          ? `<div class="p-row-price">$${bestP.toLocaleString()}<small>AUD best price</small></div>`
          : '<div class="p-row-price no-price">Price unavailable — search online</div>'
      }
      <div style="display:flex;gap:6px">
        <button class="btn-compare" onclick="addCompare('${p.id}','${escHtml(compareLabel)}')">Compare</button>
        ${
          hasPrice
            ? `<a class="btn-buy" href="${resolveRetailerUrl(retailers[0], p)}" target="_blank" rel="noopener sponsored">Buy</a>`
            : `<a class="btn-buy btn-buy--ghost" href="${escHtml(noRetailerUrl)}" target="_blank" rel="noopener noreferrer">Search online</a>`
        }
      </div>
    </div>
  </div>`;
}
