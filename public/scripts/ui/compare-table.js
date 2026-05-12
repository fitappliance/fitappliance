import { renderFitScoreRing } from './fit-score-ring.js';
import { renderTooltipHtml } from './tooltips-dictionary.js';

const MAX_COMPARE_COLUMNS = 4;

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value) {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
}

function formatMm(value) {
  const parsed = round(value);
  return parsed === null ? 'Not captured' : `${parsed} mm`;
}

function formatKwh(value) {
  const parsed = round(value);
  return parsed === null ? 'Not captured' : `${parsed} kWh/year`;
}

function formatStars(value) {
  const parsed = num(value);
  return parsed === null || parsed <= 0 ? 'Not captured' : `${parsed}★ GEMS`;
}

function formatScore(value) {
  const parsed = round(value);
  if (parsed === null) return 'Not scored';
  return `${Math.max(0, Math.min(100, parsed))}/100`;
}

function getProductId(product, index) {
  return normalizeText(product?.slug ?? product?.id ?? product?.product_id, `compare-${index + 1}`);
}

function getBrand(product) {
  return normalizeText(product?.brand, 'Brand pending');
}

function getModel(product) {
  return normalizeText(product?.model ?? product?.sku, 'Model pending');
}

function getDisplayName(product) {
  return normalizeText(product?.displayName ?? product?.readableSpec ?? `${getBrand(product)} ${getModel(product)}`, 'Appliance');
}

function getInitials(product) {
  const brand = getBrand(product);
  const words = brand.split(/[\s&-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return brand.slice(0, 2).toUpperCase();
}

function getFitScore(product) {
  return num(
    product?.fitScoreNumeric?.score
    ?? product?.fitScoreNumeric
    ?? product?.fitScore
    ?? product?.fitSummary?.score
    ?? product?.score
  );
}

function normalizeClearance(product, key) {
  const explicit = product?.[key];
  const fallback = key === 'manufacturerClearance'
    ? product?.manufacturer_clearance
    : product?.clearance ?? product?.practical_clearance;
  const source = explicit ?? fallback;
  if (!source || typeof source !== 'object') return {};
  return {
    side: num(source.side ?? source.sides ?? source.left ?? source.right),
    top: num(source.top),
    rear: num(source.rear ?? source.back)
  };
}

function getEvidenceLabel(product) {
  const evidence = product?.evidence;
  if (product?.data_source === 'official_pdf' || evidence?.has_pdf_evidence) {
    return evidence?.source_url
      ? `<a href="${escHtml(evidence.source_url)}" target="_blank" rel="noopener">Official PDF</a>`
      : 'Official PDF verified';
  }
  if (Array.isArray(product?.retailers) && product.retailers.length > 0) {
    return 'Retailer spec';
  }
  return 'Unverified catalog row';
}

function getRetailerCount(product) {
  return Array.isArray(product?.retailers) ? product.retailers.length : 0;
}

function getCapacityLitres(product) {
  return num(
    product?.capacity_l
    ?? product?.capacity_litres
    ?? product?.capacity
    ?? product?.total_capacity_l
  );
}

function getDoorSwing(product) {
  return num(product?.door_swing_mm ?? product?.doorOpen90DepthMm ?? product?.dimensions?.door_open_90_depth_mm);
}

function isTie(values, direction) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (direction === 'none' || numeric.length < 2) return true;
  return numeric.every((value) => value === numeric[0]);
}

function getWinningValue(values, direction) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (isTie(values, direction)) return null;
  return direction === 'higher' ? Math.max(...numeric) : Math.min(...numeric);
}

function buildMetricRows(products) {
  return [
    {
      section: 'Dimensions',
      rows: [
        { label: 'Width', tooltip: 'side-clearance', direction: 'lower', value: (p) => num(p?.w ?? p?.dimensions?.width_mm), render: (p) => formatMm(p?.w ?? p?.dimensions?.width_mm) },
        { label: 'Height', tooltip: 'top-clearance', direction: 'lower', value: (p) => num(p?.h ?? p?.dimensions?.height_mm), render: (p) => formatMm(p?.h ?? p?.dimensions?.height_mm) },
        { label: 'Depth', tooltip: 'rear-clearance', direction: 'lower', value: (p) => num(p?.d ?? p?.dimensions?.depth_mm), render: (p) => formatMm(p?.d ?? p?.dimensions?.depth_mm) },
      ]
    },
    {
      section: 'Clearance Required',
      rows: [
        { label: 'Practical side', tooltip: 'practical-buffer', direction: 'lower', value: (p) => normalizeClearance(p, 'practicalClearance').side, render: (p) => formatMm(normalizeClearance(p, 'practicalClearance').side) },
        { label: 'Practical top', tooltip: 'practical-buffer', direction: 'lower', value: (p) => normalizeClearance(p, 'practicalClearance').top, render: (p) => formatMm(normalizeClearance(p, 'practicalClearance').top) },
        { label: 'Practical rear', tooltip: 'rear-clearance', direction: 'lower', value: (p) => normalizeClearance(p, 'practicalClearance').rear, render: (p) => formatMm(normalizeClearance(p, 'practicalClearance').rear) },
        { label: 'Manufacturer side', tooltip: 'manufacturer-clearance', direction: 'lower', value: (p) => normalizeClearance(p, 'manufacturerClearance').side, render: (p) => formatMm(normalizeClearance(p, 'manufacturerClearance').side) },
        { label: 'Manufacturer top', tooltip: 'manufacturer-clearance', direction: 'lower', value: (p) => normalizeClearance(p, 'manufacturerClearance').top, render: (p) => formatMm(normalizeClearance(p, 'manufacturerClearance').top) },
        { label: 'Manufacturer rear', tooltip: 'manufacturer-clearance', direction: 'lower', value: (p) => normalizeClearance(p, 'manufacturerClearance').rear, render: (p) => formatMm(normalizeClearance(p, 'manufacturerClearance').rear) },
      ]
    },
    {
      section: 'Energy',
      rows: [
        { label: 'Energy stars', tooltip: '', direction: 'higher', value: (p) => num(p?.stars), render: (p) => formatStars(p?.stars) },
        { label: 'Annual energy', tooltip: '', direction: 'lower', value: (p) => num(p?.kwh_year), render: (p) => formatKwh(p?.kwh_year) },
        { label: 'Capacity', tooltip: '', direction: 'higher', value: getCapacityLitres, render: (p) => {
          const litres = round(getCapacityLitres(p));
          return litres === null ? 'Not captured' : `${litres} L`;
        } },
      ]
    },
    {
      section: 'Door & Access',
      rows: [
        { label: 'Door swing / 90° depth', tooltip: 'door-swing-radius', direction: 'lower', value: getDoorSwing, render: (p) => formatMm(getDoorSwing(p)) },
        { label: 'Doorway estimate', tooltip: 'door-swing-radius', direction: 'lower', value: (p) => p?.delivery?.doorwayClearanceMm, render: (p) => formatMm(p?.delivery?.doorwayClearanceMm) },
        { label: 'Turn path estimate', tooltip: 'door-swing-radius', direction: 'lower', value: (p) => p?.delivery?.turnClearanceMm, render: (p) => formatMm(p?.delivery?.turnClearanceMm) },
      ]
    },
    {
      section: 'Verification',
      rows: [
        { label: 'Evidence', tooltip: '', direction: 'none', value: (p) => getEvidenceLabel(p).replace(/<[^>]+>/g, ''), render: getEvidenceLabel, html: true },
        { label: 'Retailer links', tooltip: '', direction: 'higher', value: getRetailerCount, render: (p) => `${getRetailerCount(p)} verified link${getRetailerCount(p) === 1 ? '' : 's'}` },
        { label: 'Fit score', tooltip: 'fit-score', direction: 'higher', value: getFitScore, render: (p) => formatScore(getFitScore(p)) },
      ]
    }
  ];
}

function renderHeaderCell(product, index) {
  const score = getFitScore(product);
  const scoreHtml = score === null
    ? '<span class="compare-score-pending">Score pending</span>'
    : renderFitScoreRing(score, { title: `${getDisplayName(product)} fit score ${Math.round(score)} out of 100` });
  const id = getProductId(product, index);
  return `<th scope="col" class="compare-product-head">
    <div class="compare-product-card">
      <div class="compare-product-avatar" aria-hidden="true">${escHtml(getInitials(product))}</div>
      <div class="compare-product-copy">
        <span class="compare-product-brand">${escHtml(getBrand(product))}</span>
        <strong>${escHtml(getModel(product))}</strong>
        <span>${escHtml(getDisplayName(product))}</span>
      </div>
      <div class="compare-score-cell">${scoreHtml}</div>
      <button type="button" class="compare-remove" data-compare-remove="${escHtml(id)}" aria-label="Remove ${escHtml(getDisplayName(product))}">Remove ✕</button>
    </div>
  </th>`;
}

function renderMetricLabel(row) {
  const tooltip = row.tooltip ? renderTooltipHtml(row.tooltip) : '';
  return `${escHtml(row.label)}${tooltip ? ` ${tooltip}` : ''}`;
}

function renderMetricRow(row, products) {
  const values = products.map((product) => row.value(product));
  const winner = getWinningValue(values, row.direction);
  const allSame = isTie(values, row.direction) && values.every((value) => String(value ?? '') === String(values[0] ?? ''));
  const cells = products.map((product, index) => {
    const value = values[index];
    const isWinner = winner !== null && value === winner;
    const classes = [
      'compare-metric-cell',
      isWinner ? 'compare-cell--winner' : '',
      allSame ? '' : 'compare-cell--diff'
    ].filter(Boolean).join(' ');
    const rendered = row.render(product);
    return `<td class="${classes}">${row.html ? rendered : escHtml(rendered)}${isWinner ? '<span class="compare-diff-badge">Best</span>' : ''}</td>`;
  }).join('');
  return `<tr data-compare-same-row="${allSame ? 'true' : 'false'}" data-compare-metric="${escHtml(row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
    <th scope="row">${renderMetricLabel(row)}</th>
    ${cells}
  </tr>`;
}

export function renderCompareTable(products, options = {}) {
  const rows = (Array.isArray(products) ? products : [])
    .filter((product) => product && typeof product === 'object')
    .slice(0, MAX_COMPARE_COLUMNS);
  if (rows.length === 0) {
    return '<div class="compare-table-empty">Add products to compare.</div>';
  }

  const sections = buildMetricRows(rows);
  const addAnother = rows.length < MAX_COMPARE_COLUMNS
    ? '<button type="button" class="compare-table-action" data-compare-add-another>Add another to compare</button>'
    : '';
  const cavity = options?.cavity && typeof options.cavity === 'object'
    ? [options.cavity.w, options.cavity.h, options.cavity.d].map((value) => round(value)).filter((value) => value !== null)
    : [];
  const cavityHtml = cavity.length === 3
    ? `<span class="compare-cavity-context">Cavity ${cavity[0]}×${cavity[1]}×${cavity[2]} mm</span>`
    : '';

  return `<section class="compare-table-shell" aria-label="Side-by-side appliance comparison">
    <div class="compare-table-toolbar">
      <div>
        <span class="compare-table-kicker">RTINGS-style comparison</span>
        <p>Sticky product columns, explicit differences, and source status. No hidden price assumptions.</p>
        ${cavityHtml}
      </div>
      <div class="compare-table-actions">
        ${addAnother}
        <button type="button" class="compare-table-action compare-table-action--danger" data-compare-clear-all>Clear all</button>
      </div>
    </div>
    <p class="compare-scroll-hint">Scroll sideways to compare all columns on smaller screens.</p>
    <div class="compare-table-wrap" role="region" tabindex="0" aria-label="Comparison table with sticky product headers">
      <table class="compare-table compare-table--rtings" style="--compare-count:${rows.length}">
        <thead class="compare-sticky-header">
          <tr>
            <th scope="col" class="compare-metric-head">Metric</th>
            ${rows.map(renderHeaderCell).join('')}
          </tr>
        </thead>
        <tbody>
          ${sections.map((section) => `
            <tr class="compare-section-row"><th colspan="${rows.length + 1}">${escHtml(section.section)}</th></tr>
            ${section.rows.map((row) => renderMetricRow(row, rows)).join('')}
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export const __test = {
  buildMetricRows,
  getFitScore,
  getWinningValue,
  normalizeClearance
};

globalThis.CompareTable = {
  renderCompareTable
};
