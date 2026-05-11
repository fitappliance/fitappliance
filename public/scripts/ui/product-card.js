import { displayBrandName } from './brand-utils.js';
import { renderFitScoreCardBlock } from './fit-score-ring.js';
import { renderProductThumb } from './product-thumb.js';
import { isRetailerProductPageUrl } from './retailer-modal.js';

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

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPositiveNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function toDateStamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function getLatestRetailerCheckedDate(product) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];
  const dates = retailers
    .filter((retailer) => isRetailerProductPageUrl(retailer?.url ?? retailer?.href))
    .map((retailer) => toDateStamp(retailer?.verified_at ?? retailer?.verifiedAt))
    .filter(Boolean)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : '';
}

function buildDataTrustLine(product, capturedDate = '') {
  const checkedDate = getLatestRetailerCheckedDate(product);
  const specsDate = toDateStamp(capturedDate);
  const linkedRetailerCount = (Array.isArray(product?.retailers) ? product.retailers : [])
    .filter((retailer) => isRetailerProductPageUrl(retailer?.url ?? retailer?.href))
    .length;
  const bits = [];
  if (checkedDate) {
    bits.push(`${linkedRetailerCount > 1 ? 'Retailer links' : 'Retailer link'} checked ${checkedDate}`);
  }
  if (specsDate) bits.push(`Specs updated ${specsDate}`);
  if (bits.length === 0) return '';
  return `<div class="data-trust-line">${bits.map((bit) => `<span>${escHtml(bit)}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
}

function hasPdfEvidence(product) {
  return product?.evidence?.has_pdf_evidence === true;
}

function isArchivedProduct(product) {
  return product?.unavailable === true;
}

function buildEvidenceBadgeHtml(product) {
  if (!hasPdfEvidence(product)) return '';
  return '<span class="badge-verified" title="Dimensions verified against manufacturer spec sheet">✓ Verified Fit</span>';
}

function buildArchivedBadgeHtml(product) {
  if (!isArchivedProduct(product)) return '';
  return '<span class="badge-archived" title="This older model has no verified current retailer listing">Archived Model</span>';
}

function isSafeEvidenceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const base = typeof window !== 'undefined' && window?.location?.origin
      ? window.location.origin
      : 'https://www.fitappliance.com.au';
    const parsed = new URL(raw, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildEvidenceReceiptHtml(product) {
  const evidence = product?.evidence;
  if (!hasPdfEvidence(product) || !evidence) return '';

  const sourceUrl = String(evidence.source_url ?? '').trim();
  const sourceLink = isSafeEvidenceUrl(sourceUrl)
    ? `<a href="${escHtml(sourceUrl)}" target="_blank" rel="noopener" class="evidence-link">Official Spec Sheet (PDF)</a>`
    : '<span class="evidence-link evidence-link--missing">Official spec evidence captured</span>';
  const verifiedAt = toDateStamp(evidence.verified_at);

  return `<div class="evidence-receipt">
    <span class="evidence-label">Source of Truth:</span>
    ${sourceLink}
    ${verifiedAt ? `<span class="evidence-date">Extracted: ${escHtml(verifiedAt)}</span>` : ''}
  </div>`;
}

function replacementDimensionArg(value) {
  const number = toPositiveNumber(value);
  return number ? String(Math.round(number)) : '';
}

export function triggerReplacementSearch(width, height, depth) {
  const detail = {
    w: replacementDimensionArg(width),
    h: replacementDimensionArg(height),
    d: replacementDimensionArg(depth),
  };

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('fitappliance:replacement-search', { detail }));
  }

  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log('[FitAppliance] replacement search requested', detail);
  }
}

if (typeof globalThis !== 'undefined' && typeof globalThis.triggerReplacementSearch !== 'function') {
  globalThis.triggerReplacementSearch = triggerReplacementSearch;
}

function getLinkedRetailers(product) {
  return (Array.isArray(product?.retailers) ? product.retailers : [])
    .filter((retailer) => isRetailerProductPageUrl(retailer?.url ?? retailer?.href));
}

function getFitGapMm(product) {
  const needed = Number(product?.cavityNeededMm);
  if (Number.isFinite(needed) && needed > 0) return Math.ceil(needed);
  const explicit = Number(product?.fitGapMm ?? product?.gapMm ?? product?.tightestGapMm);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  const score = Number(product?.fitScore);
  const minDimension = Math.min(
    ...[product?.w, product?.h, product?.d]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  if (Number.isFinite(score) && Number.isFinite(minDimension)) {
    return Math.max(0, Math.round(score * minDimension));
  }
  return product?.fitsTightly ? 4 : 20;
}

function getFitBadgeState(product) {
  const needed = Number(product?.cavityNeededMm);
  if (Number.isFinite(needed) && needed > 0) return 'relax';
  if (product?.fitsTightly || getFitGapMm(product) < 5) return 'tight';
  return 'exact';
}

function getFitHealthCopy(state, gap) {
  if (state === 'relax') {
    return {
      tone: 'blocked',
      label: "Won't fit",
      detail: `+${Math.max(0, Math.ceil(Number(gap) || 0))}mm cavity needed`,
      help: 'This product needs a larger cavity before the practical clearance buffer can pass. Re-measure width, height and depth before ordering.'
    };
  }
  if (state === 'tight') {
    return {
      tone: 'tight',
      label: 'Tight fit',
      detail: `${Math.max(0, Math.round(Number(gap) || 0))}mm spare`,
      help: 'This product passes the fit check but has very little spare room. Verify ventilation, door swing and delivery path before ordering.'
    };
  }
  return {
    tone: 'perfect',
    label: 'Perfect fit',
    detail: `${Math.max(0, Math.round(Number(gap) || 0))}mm spare`,
    help: 'This product passes the practical clearance buffer for the cavity you entered. Still confirm the product manual before purchase.'
  };
}

export function buildFitHealthHtml(product) {
  const state = getFitBadgeState(product);
  const gap = getFitGapMm(product);
  const copy = getFitHealthCopy(state, gap);
  const legacyClass = state === 'relax' ? 'fit-badge--relax' : state === 'tight' ? 'fit-badge--tight' : 'fit-badge--exact';
  return `<div class="fit-health fit-health--${escHtml(copy.tone)} fit-badge ${legacyClass}" data-fit-health="${escHtml(copy.tone)}">
    <span class="fit-health-light" aria-hidden="true"></span>
    <span class="fit-health-label">${escHtml(copy.label)}</span>
    <span class="fit-health-detail">${escHtml(copy.detail)}</span>
    <details class="fit-help-popover">
      <summary class="fit-help" aria-label="What does ${escHtml(copy.label)} mean?">?</summary>
      <span class="fit-help-tooltip" role="tooltip">${escHtml(copy.help)}</span>
    </details>
  </div>`;
}

function buildFitScoreHtml(product) {
  if (product?.fitScoreNumeric === null || product?.fitScoreNumeric === undefined) return '';
  return renderFitScoreCardBlock(product.fitScoreNumeric);
}

function normalizeAxisGapEntry(entry = {}) {
  const axis = String(entry.axis ?? '').trim().toLowerCase();
  const safeAxis = ['width', 'height', 'depth'].includes(axis) ? axis : '';
  const label = String(entry.label ?? (safeAxis === 'width' ? 'W' : safeAxis === 'height' ? 'H' : safeAxis === 'depth' ? 'D' : '')).trim();
  const gapMm = Number(entry.gapMm ?? entry.gap ?? entry.spareMm ?? entry.spare);
  if (!safeAxis || !label || !Number.isFinite(gapMm)) return null;
  return {
    axis: safeAxis,
    label,
    gapMm: Math.round(gapMm)
  };
}

function axisFullLabel(axis) {
  return {
    width: 'Width',
    height: 'Height',
    depth: 'Depth'
  }[axis] ?? 'Dimension';
}

function axisGapStatus(gapMm) {
  if (gapMm < 0) return 'blocked';
  if (gapMm < 20) return 'tight';
  return 'safe';
}

function axisFillPercent(gapMm) {
  if (gapMm < 0) return 8;
  if (gapMm < 20) return Math.max(18, Math.min(68, 18 + gapMm * 2.5));
  return Math.max(72, Math.min(100, 72 + (gapMm - 20) * 0.35));
}

export function buildFitAxisBarsHtml(product) {
  const entries = (Array.isArray(product?.fitAxisGaps) ? product.fitAxisGaps : [])
    .map(normalizeAxisGapEntry)
    .filter(Boolean);
  if (entries.length === 0) return '';
  const bindingAxis = String(product?.bindingAxis ?? '').trim().toLowerCase();

  return `<div class="fit-axis-bars" aria-label="Width height and depth spare room">
    ${entries.map((entry) => {
      const status = axisGapStatus(entry.gapMm);
      const isBinding = entry.axis === bindingAxis;
      const aria = `${axisFullLabel(entry.axis)} spare room: ${entry.gapMm}mm${isBinding ? ', binding constraint' : ''}`;
      return `<div class="fit-axis-bar fit-axis-bar--${status}${isBinding ? ' fit-axis-bar--binding' : ''}" data-fit-axis="${escHtml(entry.axis)}" aria-label="${escHtml(aria)}">
        <span class="fit-axis-label">${escHtml(entry.label)}</span>
        <span class="fit-axis-track" aria-hidden="true"><span style="--fit-axis-fill:${axisFillPercent(entry.gapMm)}%"></span></span>
        <span class="fit-axis-value">${escHtml(entry.gapMm)}mm</span>
      </div>`;
    }).join('')}
  </div>`;
}

function productText(product) {
  return [
    product?.brand,
    product?.model,
    product?.displayName,
    product?.readableSpec,
    ...(Array.isArray(product?.features) ? product.features : []),
    ...getLinkedRetailers(product).flatMap((retailer) => [retailer?.url, retailer?.n])
  ].map((value) => String(value ?? '')).join(' ');
}

export function buildFeatureFlagsHtml(product) {
  const text = productText(product).toLowerCase();
  const isFridge = product?.cat === 'fridge';
  if (!isFridge) return '';

  const hasWaterOrIce = /\b(water|ice|dispenser|plumbed|plumb)\b/i.test(text);
  if (!hasWaterOrIce) return '';

  if (/\bnon[-\s]?plumbed\b/i.test(text)) {
    return '<div class="feature-alert">Water/ice feature: confirm tank or refill setup before delivery.</div>';
  }

  return '<div class="feature-alert">Plumbing check: confirm whether this fridge needs a water connection.</div>';
}

export function buildDeliveryCheckHtml(product) {
  const width = Number(product?.w);
  const depth = Number(product?.d);
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return '';

  const doorwayClearance = Math.ceil(Math.min(width, depth) + 50);
  const turnClearance = Math.ceil(Math.max(width, depth));

  return `<details class="delivery-check">
    <summary>Will it make it to your kitchen?</summary>
    <div class="delivery-check__body">
      <p>Use retailer packed dimensions if listed. Otherwise start with the appliance width/depth and confirm the delivery path.</p>
      <label><input type="checkbox"> Doorways are at least ${doorwayClearance}mm clear</label>
      <label><input type="checkbox"> Hallway corners can turn a ${turnClearance}mm appliance</label>
      <label><input type="checkbox"> Stairs, lift and final cavity access verified</label>
    </div>
  </details>`;
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
      const match = parsed.pathname.match(/\/(?:products|product)\/([^/?#]+)/i);
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
    .filter((retailer) => isRetailerProductPageUrl(retailer?.url ?? retailer?.href))
    .map((retailer) => retailer?.p)
    .map(getPositivePrice)
    .filter((price) => price !== null);

  if (prices.length === 0) return '';
  const bestPrice = Math.min(...prices);
  const dateText = capturedDate ? ` as of ${capturedDate}` : '';
  const pricedRetailerCount = prices.length;
  const retailerCount = pricedRetailerCount >= 2 ? `<span class="price-badge__retailers">${pricedRetailerCount} retailers</span>` : '';

  return `<div class="price-badge">
    <span class="price-badge__price">$${bestPrice.toLocaleString()}</span>
    <span class="price-badge__label">Best price${dateText}</span>
    ${retailerCount}
  </div>`;
}

function axisShortLabel(axis) {
  return {
    width: 'W',
    height: 'H',
    depth: 'D'
  }[axis] ?? '';
}

function axisProductDimension(product, axis) {
  return {
    width: toPositiveNumber(product?.w),
    height: toPositiveNumber(product?.h),
    depth: toPositiveNumber(product?.d)
  }[axis] ?? null;
}

function axisCavityDimension(cavity, axis) {
  return {
    width: toPositiveNumber(cavity?.w),
    height: toPositiveNumber(cavity?.h),
    depth: toPositiveNumber(cavity?.d)
  }[axis] ?? null;
}

function normalizeBarAxis(entry = {}) {
  const rawAxis = String(entry.axis ?? entry.key ?? '').trim().toLowerCase();
  if (['width', 'w'].includes(rawAxis)) return 'width';
  if (['height', 'h'].includes(rawAxis)) return 'height';
  if (['depth', 'd'].includes(rawAxis)) return 'depth';
  return '';
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveClearanceBarPresentation({ cavity, appliance, clearanceMm = 0 } = {}) {
  const cavityMm = toPositiveNumber(cavity);
  const applianceMm = toPositiveNumber(appliance);
  const clearance = Math.max(0, Math.round(toFiniteNumber(clearanceMm) ?? 0));
  if (!cavityMm || !applianceMm) {
    return {
      tone: 'unknown',
      striped: false,
      fillPercent: 45,
      spareMm: null,
      usedMm: applianceMm ? Math.round(applianceMm + clearance) : null
    };
  }

  const usedMm = applianceMm + clearance;
  const spareMm = Math.round(cavityMm - usedMm);
  const tone = spareMm >= 20 ? 'green' : spareMm >= 5 ? 'amber' : 'red';
  return {
    tone,
    striped: spareMm < 0,
    fillPercent: clampPercent((usedMm / cavityMm) * 100),
    spareMm,
    usedMm: Math.round(usedMm)
  };
}

function extractCavityFromFitAxisGaps(product) {
  const entries = Array.isArray(product?.fitAxisGaps) ? product.fitAxisGaps : [];
  return entries.reduce((acc, entry) => {
    const axis = normalizeBarAxis(entry);
    const cavity = toPositiveNumber(entry?.cavity);
    if (!axis || !cavity) return acc;
    return {
      ...acc,
      [axis === 'width' ? 'w' : axis === 'height' ? 'h' : 'd']: cavity
    };
  }, {});
}

function resolveCardCavity(product, deps = {}) {
  const fromDeps = deps.cavity ?? {};
  const fromProduct = extractCavityFromFitAxisGaps(product);
  return {
    w: toPositiveNumber(fromDeps?.w) ?? fromProduct.w ?? null,
    h: toPositiveNumber(fromDeps?.h) ?? fromProduct.h ?? null,
    d: toPositiveNumber(fromDeps?.d) ?? fromProduct.d ?? null
  };
}

function buildBarEntries(product, deps = {}) {
  const cavity = resolveCardCavity(product, deps);
  const fitEntries = (Array.isArray(product?.fitAxisGaps) ? product.fitAxisGaps : [])
    .map((entry) => {
      const axis = normalizeBarAxis(entry);
      if (!axis) return null;
      return {
        axis,
        label: String(entry?.label ?? axisShortLabel(axis)).trim() || axisShortLabel(axis),
        cavity: toPositiveNumber(entry?.cavity) ?? axisCavityDimension(cavity, axis),
        appliance: toPositiveNumber(entry?.appliance) ?? axisProductDimension(product, axis),
        clearanceMm: Math.max(0, Math.round(toFiniteNumber(entry?.clearanceMm) ?? 0))
      };
    })
    .filter(Boolean);

  const byAxis = new Map(fitEntries.map((entry) => [entry.axis, entry]));
  return ['width', 'height', 'depth'].map((axis) => byAxis.get(axis) ?? {
    axis,
    label: axisShortLabel(axis),
    cavity: axisCavityDimension(cavity, axis),
    appliance: axisProductDimension(product, axis),
    clearanceMm: 0
  });
}

function formatSpareLabel(spareMm) {
  if (spareMm === null) return 'cavity not entered';
  if (spareMm < 0) return `${Math.abs(spareMm)}mm over`;
  return `${spareMm}mm spare`;
}

export function buildClearanceBarsHtml(product, deps = {}) {
  const bindingAxis = String(product?.bindingAxis ?? '').trim().toLowerCase();
  const entries = buildBarEntries(product, deps);

  return `<div class="clearance-bars" aria-label="Product and clearance use compared with cavity size">
    ${entries.map((entry) => {
      const presentation = deriveClearanceBarPresentation(entry);
      const appliance = Math.round(entry.appliance ?? 0);
      const clearance = Math.round(entry.clearanceMm ?? 0);
      const cavity = entry.cavity ? `${Math.round(entry.cavity)}mm cavity` : 'cavity not entered';
      const spare = formatSpareLabel(presentation.spareMm);
      const label = entry.cavity
        ? `${entry.label}: ${appliance}mm + ${clearance}mm clearance / ${cavity} (${spare})`
        : `${entry.label}: ${appliance}mm product / ${cavity}`;
      const isBinding = entry.axis === bindingAxis || (presentation.spareMm !== null && presentation.spareMm < 5);
      const aria = entry.cavity
        ? `${axisFullLabel(entry.axis)} clearance: ${appliance}mm product plus ${clearance}mm clearance uses ${appliance + clearance}mm of ${Math.round(entry.cavity)}mm cavity, ${spare}${isBinding ? ', binding constraint' : ''}`
        : `${axisFullLabel(entry.axis)} clearance: ${appliance}mm product, cavity not entered`;
      return `<div class="clearance-bar clearance-bar--${escHtml(presentation.tone)}${presentation.striped ? ' clearance-bar--striped' : ''}${isBinding ? ' clearance-bar--binding' : ''}" data-clearance-axis="${escHtml(entry.axis)}" aria-label="${escHtml(aria)}">
        <div class="clearance-bar-label">${escHtml(label)}</div>
        <div class="clearance-bar-track" aria-hidden="true">
          <span class="clearance-bar-fill" style="width:${presentation.fillPercent}%"></span>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

export function renderMiniFrontWireframe(product = {}, cavity = {}) {
  const productW = toPositiveNumber(product?.w);
  const productH = toPositiveNumber(product?.h);
  const cavityW = toPositiveNumber(cavity?.w);
  const cavityH = toPositiveNumber(cavity?.h);
  const safeLabel = escHtml(`${displayBrandName(product?.brand)} ${product?.model ?? ''}`.trim() || 'Appliance');

  if (!productW || !productH || !cavityW || !cavityH) {
    return `<svg class="mini-front-wireframe" role="img" aria-label="${safeLabel} front fit preview unavailable" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="10" width="32" height="40" rx="2" fill="#eeece6" stroke="#2c2c2c" stroke-width="1"/>
      <text x="30" y="35" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" fill="#6b6b6b">—</text>
    </svg>`;
  }

  const outer = { x: 6, y: 6, w: 48, h: 48 };
  const ratioW = Math.max(0.12, Math.min(1, productW / cavityW));
  const ratioH = Math.max(0.12, Math.min(1, productH / cavityH));
  const innerW = Math.max(8, Math.round(outer.w * ratioW));
  const innerH = Math.max(8, Math.round(outer.h * ratioH));
  const innerX = Math.round(outer.x + (outer.w - innerW) / 2);
  const innerY = Math.round(outer.y + (outer.h - innerH) / 2);

  return `<svg class="mini-front-wireframe" role="img" aria-label="${safeLabel} mini front fit preview" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <rect x="${outer.x}" y="${outer.y}" width="${outer.w}" height="${outer.h}" rx="3" fill="none" stroke="#2c2c2c" stroke-width="1.2"/>
    <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="2" fill="#eeece6" fill-opacity="0.7" stroke="#2c2c2c" stroke-width="1"/>
  </svg>`;
}

function hasUsableCavity(cavity = {}) {
  return Boolean(toPositiveNumber(cavity?.w) && toPositiveNumber(cavity?.h));
}

function buildZoneA(product, deps = {}) {
  const cavity = resolveCardCavity(product, deps);
  const title = `${displayBrandName(product?.brand)} ${product?.model ?? ''}`.trim() || 'appliance';
  return `<div class="card-zone-a" role="button" tabindex="0" aria-label="Open fit visualization for ${escHtml(title)}" data-fit-viz-card-trigger="${escHtml(product?.id ?? '')}">
    <div class="card-zone-thumb-split">
      <div class="card-zone-thumb-half">${renderProductThumb(product)}</div>
      ${hasUsableCavity(cavity) ? `<div class="card-zone-wire-half">${renderMiniFrontWireframe(product, cavity)}</div>` : ''}
    </div>
    <div class="card-zone-fit">${buildFitHealthHtml(product)}${buildFitScoreHtml(product)}</div>
  </div>`;
}

function featureIncludes(product, pattern) {
  return (Array.isArray(product?.features) ? product.features : [])
    .some((feature) => pattern.test(String(feature ?? '')));
}

function getCapacityLabel(product) {
  const direct = toPositiveNumber(product?.capacity_litres ?? product?.capacityLitres ?? product?.volume_litres);
  if (direct) return `${Math.round(direct)}L`;
  const text = [
    product?.model,
    product?.displayName,
    product?.readableSpec,
    ...(Array.isArray(product?.features) ? product.features : [])
  ].join(' ');
  const match = text.match(/\b(\d{2,4})\s?L\b/i);
  return match?.[1] ? `${match[1]}L` : '';
}

function buildTechSpecsHtml(product, deps = {}) {
  const annualEnergyCost = deps.annualEnergyCost ?? (() => '');
  const bits = [];
  if (Number.isFinite(Number(product?.stars))) bits.push(`${Number(product.stars)}★ GEMS`);
  if (featureIncludes(product, /\b(reversible|hinge)\b/i)) bits.push('reversible hinge');
  const capacity = getCapacityLabel(product);
  if (capacity) bits.push(capacity);
  const annual = annualEnergyCost(product?.kwh_year);
  if (annual) bits.push(`~$${annual}/yr estimated energy`);
  const compactFeatures = (Array.isArray(product?.features) ? product.features : [])
    .filter((feature) => !/\b(reversible|hinge)\b/i.test(String(feature ?? '')))
    .filter((feature) => !capacity || String(feature ?? '').trim().toLowerCase() !== capacity.toLowerCase())
    .slice(0, 2);
  bits.push(...compactFeatures);
  if (bits.length === 0) return '';
  return `<div class="card-zone-tech-specs">${bits.map(escHtml).join(' · ')}</div>`;
}

function buildTitleHtml(product, primaryTitle, modelLine) {
  return `<div class="card-zone-heading">
    <div class="card-zone-kicker">${escHtml(displayBrandName(product?.brand))}${product?.sponsored ? '<span class="tag tag-amber">Sponsored</span>' : ''}</div>
    <div class="card-zone-title">${escHtml(primaryTitle)}</div>
    ${buildEvidenceBadgeHtml(product)}
    ${buildArchivedBadgeHtml(product)}
    ${modelLine ? `<div class="card-zone-model">${escHtml(modelLine)}</div>` : ''}
  </div>`;
}

function retailerLinkClassName(name) {
  return `retailer-link retailer-brand-card retailer-brand-card--${String(name ?? 'retailer')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'retailer'}`;
}

function buildAvailabilityAccordion(product, deps = {}) {
  const resolveRetailerUrl = deps.resolveRetailerUrl ?? ((retailer) => retailer.url);
  const retailers = getLinkedRetailers(product).slice(0, 5);
  const hasRetailers = retailers.length > 0;
  const body = hasRetailers
    ? `<div class="retailer-accordion-links">
        ${retailers.map((retailer) => {
          const name = String(retailer?.n ?? retailer?.name ?? 'Retailer').trim() || 'Retailer';
          return `<a class="${retailerLinkClassName(name)}" href="${escHtml(resolveRetailerUrl(retailer))}" target="_blank" rel="sponsored nofollow noopener"><span class="retailer-brand-wordmark">${escHtml(name)}</span><span aria-hidden="true">→</span></a>`;
        }).join('')}
      </div>
      <p class="retailer-commission-note">We may earn a commission. <a href="/affiliate-disclosure">Disclosure</a>.</p>`
    : `<a class="retailer-link retailer-link--search" href="${escHtml(buildSearchOnlineUrl(product))}" target="_blank" rel="sponsored nofollow noopener">Search online <span aria-hidden="true">→</span></a>
      <p class="retailer-commission-note">Retailer info not available.</p>`;

  return `<details class="card-availability">
    <summary class="card-cta-availability">Check Availability</summary>
    <div class="retailer-accordion-content">${body}</div>
  </details>`;
}

function buildUtilityButtons(product, saved, compareLabel) {
  return `<div class="card-zone-actions">
    <button
      class="btn-save${saved ? ' btn-save--active' : ''}"
      onclick="toggleSave('${escHtml(product?.id ?? '')}')"
      aria-label="${saved ? 'Remove from saved' : 'Save appliance'}"
      title="${saved ? 'Remove from saved' : 'Save for later'}"
    >${saved ? '♥' : '♡'}</button>
    <button class="btn-compare" onclick="addCompare('${escHtml(product?.id ?? '')}','${escHtml(compareLabel)}')">Compare</button>
  </div>`;
}

function buildReplacementCtaHtml(product) {
  const w = replacementDimensionArg(product?.w);
  const h = replacementDimensionArg(product?.h);
  const d = replacementDimensionArg(product?.d);
  return `<div class="archived-replacement">
    <button class="btn-replacement" type="button" onclick="triggerReplacementSearch('${escHtml(w)}','${escHtml(h)}','${escHtml(d)}')">Find a Modern Replacement</button>
    <p class="archived-replacement-note">This archived model is kept for reference. Use its dimensions to find current products.</p>
  </div>`;
}

function buildZoneB(product, deps, primaryTitle, modelLine) {
  return `<div class="card-zone-b">
    ${buildTitleHtml(product, primaryTitle, modelLine)}
    ${buildClearanceBarsHtml(product, deps)}
    ${buildTechSpecsHtml(product, deps)}
    ${buildDataTrustLine(product, deps.capturedDate ?? '')}
    ${buildEvidenceReceiptHtml(product)}
    ${buildFeatureFlagsHtml(product)}
    ${buildDeliveryCheckHtml(product)}
  </div>`;
}

function buildZoneC(product, deps, saved, compareLabel) {
  if (isArchivedProduct(product)) {
    return `<div class="card-zone-c card-zone-c--archived">
      ${buildUtilityButtons(product, saved, compareLabel)}
      ${buildReplacementCtaHtml(product)}
    </div>`;
  }

  return `<div class="card-zone-c">
    ${buildUtilityButtons(product, saved, compareLabel)}
    ${buildAvailabilityAccordion(product, deps)}
  </div>`;
}

export function buildCard(p, deps = {}) {
  const warnings = deps.warningsHtml ?? warningsHtml;
  const isSaved = deps.isSaved ?? (() => false);
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const primaryTitle = buildPrimaryTitle(p);
  const modelLine = buildModelLine(p, primaryTitle);
  const compareLabel = `${displayBrand} ${String(p?.model ?? '').split(' ').slice(0, 3).join(' ')}`.trim();

  return `
  <div class="p-card p-card--rtings">
    ${buildZoneA(p, deps)}
    ${buildZoneB(p, deps, primaryTitle, modelLine)}
    ${buildZoneC(p, deps, saved, compareLabel)}
    ${warnings(p)}
  </div>
  `;
}

export function buildRow(p, deps = {}) {
  const annualEnergyCost = deps.annualEnergyCost ?? (() => '0');
  const isSaved = deps.isSaved ?? (() => false);
  const displayBrand = displayBrandName(p.brand);
  const saved = isSaved(p.id);
  const primaryTitle = buildPrimaryTitle(p);
  const modelLine = buildModelLine(p, primaryTitle);
  const compareLabel = `${displayBrand} ${String(p?.model ?? '').split(' ').slice(0, 2).join(' ')}`.trim();
  const renderDeps = { ...deps, annualEnergyCost };

  return `
  <div class="p-row p-row--rtings">
    ${buildZoneA(p, renderDeps)}
    ${buildZoneB(p, renderDeps, primaryTitle, modelLine)}
    ${buildZoneC(p, renderDeps, saved, compareLabel)}
  </div>
  `;
}
