const TOOLTIP_COPY = {
  'side-clearance': 'Side space reserved for ventilation and door movement. Width clearance is counted on both sides.',
  'top-clearance': 'Top air gap above the appliance. This is usually for heat escape and installation tolerance.',
  'rear-clearance': 'Rear gap behind the appliance for ventilation, hoses, plugs, and wall unevenness.',
  'door-swing-radius': 'The estimated space a door needs to open without hitting a wall, bench, or adjacent cabinet.',
  'practical-buffer': 'FitAppliance default buffer for real-world measuring error before manufacturer notes are checked.',
  'manufacturer-clearance': 'Brand or manual guidance for ventilation. Always check the installation manual before ordering.',
  'binding-axis': 'The tightest dimension after appliance size and required clearance are subtracted from your cavity.',
  'fit-score': 'A 0-100 score. Any failed required dimension scores 0; otherwise the score grades spare room efficiency.'
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function getTooltipCopy(key) {
  return TOOLTIP_COPY[String(key ?? '').trim()] ?? '';
}

export function renderTooltipHtml(key, label = '?') {
  const copy = getTooltipCopy(key);
  if (!copy) return '';
  return `<span class="metric-tooltip" tabindex="0" role="button" aria-label="${escHtml(copy)}">
    <span aria-hidden="true">${escHtml(label)}</span>
    <span class="metric-tooltip__bubble" role="tooltip">${escHtml(copy)}</span>
  </span>`;
}

export const FIT_TOOLTIPS = Object.freeze({ ...TOOLTIP_COPY });
