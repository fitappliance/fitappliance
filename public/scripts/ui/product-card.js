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
    categoryLabel(product?.cat),
    'australia'
  ].filter(Boolean).join(' ');
}

export function buildSearchOnlineUrl(product) {
  const query = buildSearchQuery(product);
  return `https://www.google.com.au/search?q=${encodeURIComponent(query)}`;
}

export function buildNoRetailerUrl(product) {
  return buildSearchOnlineUrl(product);
}

function getPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

const COLOR_SUFFIXES = [
  { tokens: ['black', 'stainless', 'steel'], label: 'Black Stainless Steel' },
  { tokens: ['matte', 'black'], label: 'Matte Black' },
  { tokens: ['stainless', 'steel'], label: 'Stainless Steel' },
  { tokens: ['s', 'steel'], label: 'Stainless Steel' },
  { tokens: ['black'], label: 'Black' },
  { tokens: ['white'], label: 'White' },
  { tokens: ['silver'], label: 'Silver' },
  { tokens: ['red'], label: 'Red' },
  { tokens: ['grey'], label: 'Grey' },
  { tokens: ['gray'], label: 'Grey' }
];

function titleCaseToken(token) {
  const value = String(token ?? '').trim();
  if (!value) return '';
  if (/^\d+l$/i.test(value)) return value.replace(/l$/i, 'L');
  if (/^\d+kg$/i.test(value)) return value.replace(/kg$/i, 'kg');
  if (/\d/.test(value)) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeToken(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripBrandTokens(tokens, brand) {
  const brandTokens = String(brand ?? '')
    .replace(/&/g, ' ')
    .split(/[\s-]+/)
    .map(normalizeToken)
    .filter(Boolean);

  if (brandTokens.length === 0) return tokens;
  const head = tokens.slice(0, brandTokens.length).map(normalizeToken);
  return head.every((token, index) => token === brandTokens[index])
    ? tokens.slice(brandTokens.length)
    : tokens;
}

function splitColorSuffix(tokens) {
  for (const color of COLOR_SUFFIXES) {
    if (tokens.length < color.tokens.length) continue;
    const suffix = tokens.slice(-color.tokens.length).map(normalizeToken);
    if (suffix.every((token, index) => token === color.tokens[index])) {
      return {
        body: tokens.slice(0, -color.tokens.length),
        color: color.label
      };
    }
  }
  return { body: tokens, color: '' };
}

function getRetailerProductSlug(product) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];
  for (const retailer of retailers) {
    try {
      const parsed = new URL(String(retailer?.url ?? ''));
      const match = parsed.pathname.match(/\/products\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
    } catch {
      // Ignore malformed or relative retailer URLs and fall back to model copy.
    }
  }
  return '';
}

function buildRetailerProductTitle(product) {
  const slug = getRetailerProductSlug(product);
  if (!slug) return '';
  const displayBrand = displayBrandName(product?.brand);
  const rawTokens = slug.split('-').map((token) => token.trim()).filter(Boolean);
  const withoutBrand = stripBrandTokens(rawTokens, displayBrand);
  const { body, color } = splitColorSuffix(withoutBrand);
  if (body.length === 0) return '';
  const title = [displayBrand, ...body.map(titleCaseToken)].filter(Boolean).join(' ');
  return color ? `${title} (${color})` : title;
}

function buildPrimaryTitle(product) {
  return buildRetailerProductTitle(product) || String(product?.model ?? '').trim() || 'Appliance';
}

function buildModelLine(product, primaryTitle) {
  const model = String(product?.model ?? '').trim();
  if (!model) return '';
  return normalizeToken(primaryTitle) === normalizeToken(model) ? '' : `Model ${model}`;
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
    .map(getPositivePrice)
    .filter((price) => price !== null);

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
  const hasPrice = retailers.some((retailer) => getPositivePrice(retailer?.p) !== null);
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const primaryTitle = buildPrimaryTitle(p);
  const modelLine = buildModelLine(p, primaryTitle);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 3).join(' ')}`;
  const triggerButton = buildRetailerTriggerButton(p, {
    resolveRetailerUrl,
    buildNoRetailerUrl,
    buildSearchOnlineUrl
  });
  const modalHtml = shouldShowRetailerModal(p)
    ? buildRetailerModalHtml(p, { resolveRetailerUrl })
    : '';

  return `
  <div class="p-card">
    <div class="fit-thumb">${renderProductThumb(p)}${p.sponsored ? '<span class="sponsored-tag">Sponsored</span>' : ''}</div>
    <div class="card-body">
      <div class="c-brand">${displayBrand}</div>
      <div class="c-name">${escHtml(primaryTitle)}</div>
      ${modelLine ? `<div class="c-model">${escHtml(modelLine)}</div>` : ''}
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
            : '<div class="c-price no-price">Price unavailable</div>'
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
  const pricedRetailers = retailers
    .map((retailer) => ({ retailer, price: getPositivePrice(retailer?.p) }))
    .filter((entry) => entry.price !== null);
  const hasPrice = pricedRetailers.length > 0;
  const bestP = hasPrice ? Math.min(...pricedRetailers.map((entry) => entry.price)) : null;
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const primaryTitle = buildPrimaryTitle(p);
  const modelLine = buildModelLine(p, primaryTitle);
  const compareLabel = `${displayBrand} ${p.model.split(' ').slice(0, 2).join(' ')}`;
  const annual = annualEnergyCost(p.kwh_year);
  const total = Math.round(lifetimeCost(p.price, p.kwh_year));
  const triggerButton = buildRetailerTriggerButton(p, {
    resolveRetailerUrl,
    buildNoRetailerUrl,
    buildSearchOnlineUrl
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
      <div class="p-row-name">${escHtml(primaryTitle)}</div>
      ${modelLine ? `<div class="p-row-model">${escHtml(modelLine)}</div>` : ''}
      <div class="p-row-dims">
        <span class="dim-tag">W ${p.w}mm</span>
        <span class="dim-tag">H ${p.h}mm</span>
        <span class="dim-tag">D ${p.d}mm</span>
      </div>
      <div style="font-size:12px;color:var(--green);margin-top:4px">⚡ ~$${annual}/yr · 10yr TCO ~$${total.toLocaleString()} · ${p.features.slice(0, 3).join(' · ')}</div>
      ${p.vented ? '<div style="font-size:12px;color:var(--red);margin-top:4px">⚠️ Vented — external ducting required (NCC 2022). Not for apartments.</div>' : ''}
    </div>
    <div class="p-row-actions">
      ${
        hasPrice
          ? `<div class="p-row-price">${buildPriceBadge(p, capturedDate)}</div>`
          : '<div class="p-row-price no-price">Price unavailable</div>'
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
