import { displayBrandName } from './brand-utils.js';
import { renderProductThumb } from './product-thumb.js';
import {
  buildRetailerModalHtml,
  buildRetailerTriggerButton,
  shouldShowRetailerModal
} from './retailer-modal.js';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function categoryLabel(cat) {
  return {
    fridge: 'fridge',
    dishwasher: 'dishwasher',
    dryer: 'dryer',
    washing_machine: 'washing machine'
  }[cat] || '';
}

function buildSearchQuery(product) {
  return [
    String(product?.brand ?? '').trim(),
    String(product?.model ?? '').trim(),
    categoryLabel(product?.cat)
  ].filter(Boolean).join(' ');
}

export function buildSearchFallbackUrls(product) {
  const query = encodeURIComponent(buildSearchQuery(product));
  return [
    { name: 'JB Hi-Fi', url: `https://www.jbhifi.com.au/search?query=${query}` },
    { name: 'Harvey Norman', url: `https://www.harveynorman.com.au/search?w=${query}` },
    { name: 'The Good Guys', url: `https://www.thegoodguys.com.au/search?text=${query}` }
  ];
}

export function buildNoRetailerUrl(product) {
  return buildSearchFallbackUrls(product)[0]?.url ?? '#';
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

export function buildPriceBadge(product, capturedDate) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];
  const prices = retailers
    .map((retailer) => retailer?.p)
    .filter((price) => Number.isInteger(price) && price > 0);

  if (prices.length === 0) return '';
  const bestPrice = Math.min(...prices);
  const dateText = capturedDate ? ` as of ${capturedDate}` : '';
  const retailerCount = retailers.length >= 2 ? `<span class="price-badge__retailers">${retailers.length} retailers</span>` : '';

  return `<div class="price-badge">
    <span class="price-badge__price">$${bestPrice.toLocaleString()}</span>
    <span class="price-badge__label">Best price${dateText}</span>
    ${retailerCount}
  </div>`;
}

export function buildCard(p, deps = {}) {
  const tcoHtml = deps.tcoHtml ?? (() => '');
  const retailersHtml = deps.retailersHtml ?? (() => '');
  const stars = deps.starsHtml ?? starsHtml;
  const warnings = deps.warningsHtml ?? warningsHtml;
  const resolveRetailerUrl = deps.resolveRetailerUrl ?? ((retailer) => retailer.url);
  const isSaved = deps.isSaved ?? (() => false);
  const capturedDate = deps.capturedDate ?? '';
  const retailers = Array.isArray(p.retailers) ? p.retailers : [];
  const hasPrice = retailers.length > 0;
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 3).join(' ')}`;
  const triggerButton = buildRetailerTriggerButton(p, {
    resolveRetailerUrl,
    buildNoRetailerUrl,
    buildSearchFallbackUrls
  });
  const modalHtml = shouldShowRetailerModal(p)
    ? buildRetailerModalHtml(p, { resolveRetailerUrl })
    : '';

  return `
  <div class="p-card">
    <div class="card-thumb">${renderProductThumb(p)}${p.sponsored ? '<span class="sponsored-tag">Sponsored</span>' : ''}</div>
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
            ? buildPriceBadge(p, capturedDate)
            : '<div class="c-price no-price">Price unavailable — search online</div>'
        }
        <div class="c-actions">
          <button
            class="btn-save${saved ? ' btn-save--active' : ''}"
            onclick="toggleSave('${p.id}')"
            aria-label="${saved ? 'Remove from saved' : 'Save appliance'}"
            title="${saved ? 'Remove from saved' : 'Save for later'}"
          >${saved ? '♥' : '♡'}</button>
          <button class="btn-compare" onclick="addCompare('${p.id}','${escHtml(compareLabel)}')">Compare</button>
          ${triggerButton}
        </div>
      </div>
    </div>
    ${warnings(p)}
    ${retailersHtml(p)}
  </div>
  ${modalHtml}`;
}

export function buildRow(p, deps = {}) {
  const annualEnergyCost = deps.annualEnergyCost ?? (() => '0');
  const lifetimeCost = deps.lifetimeCost ?? (() => 0);
  const resolveRetailerUrl = deps.resolveRetailerUrl ?? ((retailer) => retailer.url);
  const isSaved = deps.isSaved ?? (() => false);
  const capturedDate = deps.capturedDate ?? '';
  const retailers = Array.isArray(p.retailers) ? p.retailers : [];
  const hasPrice = retailers.length > 0;
  const bestP = hasPrice ? Math.min(...retailers.map(r => r.p)) : null;
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 2).join(' ')}`;
  const annual = annualEnergyCost(p.kwh_year);
  const total = Math.round(lifetimeCost(p.price, p.kwh_year));
  const triggerButton = buildRetailerTriggerButton(p, {
    resolveRetailerUrl,
    buildNoRetailerUrl,
    buildSearchFallbackUrls
  });
  const modalHtml = shouldShowRetailerModal(p)
    ? buildRetailerModalHtml(p, { resolveRetailerUrl })
    : '';

  return `
  <div class="p-row">
    <div class="p-row-thumb">${renderProductThumb(p)}</div>
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
        ${hasPrice ? retailers.map(r => `<a href="${resolveRetailerUrl(r, p)}" target="_blank" rel="noopener sponsored" style="font-size:12.5px;color:var(--copper);font-weight:600;text-decoration:none;background:var(--copper-bg);padding:4px 10px;border-radius:6px"
          data-buy-click="1"
          data-product-id="${escHtml(p.id)}"
          data-brand="${escHtml(p.brand)}"
          data-model="${escHtml(p.model)}"
          data-retailer="${escHtml(r.n)}"
          data-price="${Number.isFinite(r.p) ? r.p : 0}"
        >${r.n} $${r.p.toLocaleString()} ↗</a>`).join('') : ''}
      </div>
      <div style="font-size:10.5px;color:var(--ink-3);margin-top:4px;font-style:italic">We earn a commission if you purchase via these links. <a href="/affiliate-disclosure" style="color:var(--copper)">Disclosure</a></div>
    </div>
    <div class="p-row-actions">
      ${
        hasPrice
          ? `<div class="p-row-price">${buildPriceBadge(p, capturedDate)}</div>`
          : '<div class="p-row-price no-price">Price unavailable — search online</div>'
      }
      <div style="display:flex;gap:6px">
        <button
          class="btn-save${saved ? ' btn-save--active' : ''}"
          onclick="toggleSave('${p.id}')"
          aria-label="${saved ? 'Remove from saved' : 'Save appliance'}"
          title="${saved ? 'Remove from saved' : 'Save for later'}"
        >${saved ? '♥' : '♡'}</button>
        <button class="btn-compare" onclick="addCompare('${p.id}','${escHtml(compareLabel)}')">Compare</button>
        ${triggerButton}
      </div>
    </div>
  </div>
  ${modalHtml}`;
}
