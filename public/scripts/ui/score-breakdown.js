import { renderTooltipHtml } from './tooltips-dictionary.js';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function axisKey(axis) {
  const normalized = String(axis ?? '').toLowerCase();
  if (normalized === 'w') return 'width';
  if (normalized === 'h') return 'height';
  if (normalized === 'd') return 'depth';
  return ['width', 'height', 'depth'].includes(normalized) ? normalized : '';
}

function axisShort(axis) {
  return { width: 'W', height: 'H', depth: 'D' }[axis] ?? '';
}

function axisDimensionKey(axis) {
  return { width: 'w', height: 'h', depth: 'd' }[axis] ?? '';
}

function axisTooltipKey(axis) {
  return {
    width: 'side-clearance',
    height: 'top-clearance',
    depth: 'rear-clearance'
  }[axis] ?? 'manufacturer-clearance';
}

function axisWeight(axis) {
  return { width: 0.4, height: 0.3, depth: 0.3 }[axis] ?? 0;
}

function normalizeRow(row = {}, product = {}, cavity = {}, clearance = {}) {
  const axis = axisKey(row.axis ?? row.key);
  if (!axis) return null;
  const dimensionKey = axisDimensionKey(axis);
  const applianceMm = toFiniteNumber(row.appliance ?? product?.[dimensionKey]);
  const cavityMm = toFiniteNumber(row.cavity ?? cavity?.[dimensionKey]);
  const clearanceMm = toFiniteNumber(row.clearanceMm)
    ?? (axis === 'width'
      ? (toFiniteNumber(clearance?.sides ?? clearance?.side) ?? 0) * 2
      : toFiniteNumber(clearance?.[axis === 'height' ? 'top' : 'rear']) ?? 0);

  if (!applianceMm || !cavityMm) return null;
  const requiredMm = applianceMm + clearanceMm;
  const spareMm = toFiniteNumber(row.spareMm ?? row.gapMm ?? row.gap) ?? (cavityMm - requiredMm);
  const ratio = cavityMm > 0 ? Math.max(0, spareMm) / cavityMm : 0;
  const axisScorePercent = spareMm < 0 ? 0 : Math.round(Math.min(1, ratio / 0.2) * 100);
  const weight = axisWeight(axis);

  return {
    axis,
    label: row.label ?? axisShort(axis),
    applianceMm: Math.round(applianceMm),
    clearanceMm: Math.round(clearanceMm),
    isDoubleSided: axis === 'width',
    requiredMm: Math.round(requiredMm),
    cavityMm: Math.round(cavityMm),
    spareMm: Math.round(spareMm),
    axisScorePercent,
    weight,
    contribution: Math.round(axisScorePercent * weight)
  };
}

function deriveRows(product = {}, cavity = {}, clearance = {}) {
  const existingRows = Array.isArray(product?.fitAxisGaps) ? product.fitAxisGaps : [];
  const rows = existingRows
    .map((row) => normalizeRow(row, product, cavity, clearance))
    .filter(Boolean);
  if (rows.length > 0) return rows;

  return ['width', 'height', 'depth']
    .map((axis) => normalizeRow({ axis }, product, cavity, clearance))
    .filter(Boolean);
}

function bindingPenaltyFor(rows) {
  const tightest = Math.min(...rows.map((row) => row.spareMm));
  if (!Number.isFinite(tightest)) return 1;
  if (tightest < 5) return 0.85;
  if (tightest < 10) return 0.95;
  return 1;
}

export function computeBreakdown(product = {}, cavity = {}, clearance = {}) {
  const effectiveClearance = clearance && Object.keys(clearance).length > 0
    ? clearance
    : product?.clearance ?? {};
  const rows = deriveRows(product, cavity, effectiveClearance);
  const tightestRow = rows.slice().sort((left, right) => left.spareMm - right.spareMm)[0] ?? null;
  const bindingPenalty = bindingPenaltyFor(rows);
  const weightedScore = rows.reduce((sum, row) => sum + row.axisScorePercent * row.weight, 0);
  const computedScore = rows.some((row) => row.spareMm < 0)
    ? 0
    : Math.max(0, Math.min(100, Math.round(weightedScore * bindingPenalty)));
  const explicitScore = toFiniteNumber(product?.fitScoreNumeric);

  return {
    rows,
    tightestAxis: tightestRow?.axis ?? '',
    tightestGapMm: tightestRow?.spareMm ?? null,
    bindingPenalty,
    finalScore: explicitScore === null ? computedScore : Math.max(0, Math.min(100, Math.round(explicitScore)))
  };
}

export function renderBreakdownHtml(breakdown = {}, score = breakdown?.finalScore) {
  const rows = Array.isArray(breakdown?.rows) ? breakdown.rows : [];
  if (rows.length === 0) {
    return `<div class="score-breakdown score-breakdown--empty">
      <p>Enter all three cavity dimensions to see the score math.</p>
    </div>`;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(Number(score ?? breakdown.finalScore) || 0)));
  const axisRows = rows.map((row) => `
    <tr class="${row.spareMm < 0 ? 'is-blocked' : ''}">
      <th scope="row">${escHtml(row.label)} ${renderTooltipHtml(axisTooltipKey(row.axis))}</th>
      <td>${row.applianceMm} + ${row.clearanceMm}${row.isDoubleSided ? ' (both sides)' : ''}</td>
      <td>${row.requiredMm}</td>
      <td>${row.cavityMm}</td>
      <td>${row.spareMm}</td>
      <td>${row.axisScorePercent}%</td>
      <td>${Math.round(row.weight * 100)}%</td>
      <td>${row.contribution}</td>
    </tr>
  `).join('');

  return `<div class="score-breakdown" data-final-score="${finalScore}">
    <div class="score-breakdown__summary">
      <strong>Fit Score ${finalScore}/100</strong>
      <span>Binding: ${escHtml(breakdown.tightestAxis || 'unknown')} ${Number.isFinite(Number(breakdown.tightestGapMm)) ? `${Math.round(Number(breakdown.tightestGapMm))}mm` : ''}</span>
      ${renderTooltipHtml('binding-axis')}
    </div>
    <table class="score-breakdown__table">
      <thead>
        <tr>
          <th>Axis</th>
          <th>Appliance + clearance</th>
          <th>Required</th>
          <th>Cavity</th>
          <th>Spare</th>
          <th>Axis</th>
          <th>Weight</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>${axisRows}</tbody>
    </table>
    <p class="score-breakdown__note">Penalty multiplier: ${Number(breakdown.bindingPenalty ?? 1).toFixed(2)}</p>
  </div>`;
}
