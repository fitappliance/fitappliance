'use strict';

(function attachFitVisualization(globalScope) {
  const SVG_WIDTH = 200;
  const SVG_HEIGHT = 160;
  const CAVITY = { x: 30, y: 30, w: 140, h: 100 };
  const ORANGE = '#d97706';
  const INK = '#2c2c2c';

  function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[char]));
  }

  function safeLabel(value) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (/[<>]/.test(normalized) || /\bon[a-z]+\s*=|javascript:/i.test(normalized)) {
      return '[unsafe text]';
    }
    return normalized;
  }

  function toPositiveMm(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeClearance(clearance = {}) {
    const side = Number(clearance.side ?? clearance.sides ?? 0);
    const top = Number(clearance.top ?? 0);
    const rear = Number(clearance.rear ?? 0);
    return {
      side: Number.isFinite(side) ? side : 0,
      top: Number.isFinite(top) ? top : 0,
      rear: Number.isFinite(rear) ? rear : 0
    };
  }

  function getAxisGaps(cavity, product, clearance) {
    const cl = normalizeClearance(clearance);
    const w = toPositiveMm(cavity?.w);
    const h = toPositiveMm(cavity?.h);
    const d = toPositiveMm(cavity?.d);
    const productW = toPositiveMm(product?.w);
    const productH = toPositiveMm(product?.h);
    const productD = toPositiveMm(product?.d);
    if (!w || !h || !d || !productW || !productH || !productD) return null;

    return {
      width: w - productW - cl.side * 2,
      height: h - productH - cl.top,
      depth: d - productD - cl.rear
    };
  }

  function identifyBindingConstraint(cavity, product, clearance) {
    const gaps = getAxisGaps(cavity, product, clearance);
    if (!gaps) return 'width';
    return Object.entries(gaps).sort((left, right) => {
      if (left[1] !== right[1]) return left[1] - right[1];
      return ['width', 'height', 'depth'].indexOf(left[0]) - ['width', 'height', 'depth'].indexOf(right[0]);
    })[0][0];
  }

  function formatGap(mm) {
    const value = Math.round(Number(mm));
    if (!Number.isFinite(value)) return 'unknown';
    if (value < 0) return `doesn't fit: ${value}mm`;
    if (value < 5) return `BIND ${value}mm`;
    return `${value}mm spare`;
  }

  function formatBindingGap(mm) {
    const value = Math.round(Number(mm));
    return Number.isFinite(value) ? `BIND ${value}mm` : 'BIND';
  }

  function getViewSpec(view, cavity, product, clearance) {
    const cl = normalizeClearance(clearance);
    const specs = {
      front: {
        title: 'Front',
        xAxis: 'width',
        yAxis: 'height',
        xLabel: 'W',
        yLabel: 'H',
        cavityX: toPositiveMm(cavity?.w),
        cavityY: toPositiveMm(cavity?.h),
        productX: toPositiveMm(product?.w),
        productY: toPositiveMm(product?.h),
        gapX: toPositiveMm(cavity?.w) - toPositiveMm(product?.w) - cl.side * 2,
        gapY: toPositiveMm(cavity?.h) - toPositiveMm(product?.h) - cl.top
      },
      top: {
        title: 'Top',
        xAxis: 'width',
        yAxis: 'depth',
        xLabel: 'W',
        yLabel: 'D',
        cavityX: toPositiveMm(cavity?.w),
        cavityY: toPositiveMm(cavity?.d),
        productX: toPositiveMm(product?.w),
        productY: toPositiveMm(product?.d),
        gapX: toPositiveMm(cavity?.w) - toPositiveMm(product?.w) - cl.side * 2,
        gapY: toPositiveMm(cavity?.d) - toPositiveMm(product?.d) - cl.rear
      },
      side: {
        title: 'Side',
        xAxis: 'depth',
        yAxis: 'height',
        xLabel: 'D',
        yLabel: 'H',
        cavityX: toPositiveMm(cavity?.d),
        cavityY: toPositiveMm(cavity?.h),
        productX: toPositiveMm(product?.d),
        productY: toPositiveMm(product?.h),
        gapX: toPositiveMm(cavity?.d) - toPositiveMm(product?.d) - cl.rear,
        gapY: toPositiveMm(cavity?.h) - toPositiveMm(product?.h) - cl.top
      }
    };
    return specs[view] ?? specs.front;
  }

  function hasUsableDimensions(cavity, product) {
    return Boolean(
      toPositiveMm(cavity?.w) &&
      toPositiveMm(cavity?.h) &&
      toPositiveMm(cavity?.d) &&
      toPositiveMm(product?.w) &&
      toPositiveMm(product?.h) &&
      toPositiveMm(product?.d)
    );
  }

  function placeholderSvg(message = 'Enter all 3 dimensions') {
    return `<svg class="fit-viz-svg" role="img" aria-label="${escHtml(message)}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="30" width="140" height="100" rx="8" fill="none" stroke="${INK}" stroke-width="1.2"/><text x="100" y="84" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#6b6b6b">${escHtml(message)}</text></svg>`;
  }

  function clampRatio(value) {
    if (!Number.isFinite(value)) return 0.1;
    return Math.min(1, Math.max(0.05, value));
  }

  function renderFitSvg({
    cavity,
    product,
    clearance,
    view = 'front'
  } = {}) {
    if (!hasUsableDimensions(cavity, product)) return placeholderSvg();

    const spec = getViewSpec(view, cavity, product, clearance);
    const globalBindingAxis = identifyBindingConstraint(cavity, product, clearance);
    const viewBindingAxis = [spec.xAxis, spec.yAxis].includes(globalBindingAxis)
      ? globalBindingAxis
      : spec.gapX <= spec.gapY
        ? spec.xAxis
        : spec.yAxis;
    const bindingGap = viewBindingAxis === spec.xAxis ? spec.gapX : spec.gapY;
    const ratioX = clampRatio(spec.productX / spec.cavityX);
    const ratioY = clampRatio(spec.productY / spec.cavityY);
    const productW = Math.max(18, Math.min(CAVITY.w - 4, Math.round(CAVITY.w * ratioX)));
    const productH = Math.max(18, Math.min(CAVITY.h - 4, Math.round(CAVITY.h * ratioY)));
    const productX = Math.round(CAVITY.x + (CAVITY.w - productW) / 2);
    const productY = Math.round(CAVITY.y + (CAVITY.h - productH) / 2);
    const xBinding = viewBindingAxis === spec.xAxis;
    const yBinding = viewBindingAxis === spec.yAxis;
    const bindingSide = xBinding ? 'left' : 'top';
    const label = `${spec.title} fit diagram, binding ${viewBindingAxis} ${Math.round(bindingGap)}mm`;
    const markerId = `fitArrow${spec.title}`;
    const leftGap = Math.max(0, Math.round((spec.cavityX - spec.productX) / 2));
    const rightGap = leftGap;
    const topGap = Math.max(0, Math.round((spec.cavityY - spec.productY) / 2));
    const bottomGap = topGap;
    const midX = productX + productW / 2;
    const midY = productY + productH / 2;
    const leftLabelGap = bindingSide === 'left' ? bindingGap : leftGap;
    const topLabelGap = bindingSide === 'top' ? bindingGap : topGap;

    const gapLabel = (side, value, x, y, extra = '') => {
      const isBinding = side === bindingSide;
      const className = isBinding ? 'fit-viz-gap-label fit-viz-gap-label--binding' : 'fit-viz-gap-label';
      const weight = isBinding ? ' font-weight="700"' : '';
      return `<text class="${className}" x="${x}" y="${y}" text-anchor="middle"${weight} fill="${isBinding ? ORANGE : '#6b6b6b'}">${escHtml(`${Math.round(value)}mm`)}</text>${isBinding ? `<text class="fit-viz-binding-label" x="${x}" y="${y + 11}" text-anchor="middle" font-size="8" font-weight="700" fill="${ORANGE}">BIND</text>` : extra}`;
    };

    const gapLine = (side, path) => {
      const isBinding = side === bindingSide;
      return `<path d="${path}" stroke="${isBinding ? ORANGE : '#9a948b'}" stroke-width="${isBinding ? '1.2' : '0.8'}"/>`;
    };

    const bindingEdge = (() => {
      if (bindingSide === 'left') return `M${CAVITY.x} ${CAVITY.y}V${CAVITY.y + CAVITY.h}`;
      if (bindingSide === 'top') return `M${CAVITY.x} ${CAVITY.y}H${CAVITY.x + CAVITY.w}`;
      return '';
    })();

    return `<svg class="fit-viz-svg" role="img" aria-label="${escHtml(label)}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"><defs><marker id="${markerId}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="${INK}"/></marker></defs><rect class="fit-viz-cavity" x="${CAVITY.x}" y="${CAVITY.y}" width="${CAVITY.w}" height="${CAVITY.h}" fill="none" stroke="${INK}" stroke-width="1.2"/>${bindingEdge ? `<path class="fit-viz-binding-edge" d="${bindingEdge}" stroke="${ORANGE}" stroke-width="1.8"/>` : ''}<rect class="fit-viz-product" x="${productX}" y="${productY}" width="${productW}" height="${productH}" fill="#eeece6" stroke="${INK}" stroke-width="1"/><path d="M${CAVITY.x} 18H${CAVITY.x + CAVITY.w}" stroke="${INK}" stroke-width="0.9" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/><path d="M18 ${CAVITY.y}V${CAVITY.y + CAVITY.h}" stroke="${INK}" stroke-width="0.9" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>${gapLine('left', `M${CAVITY.x} ${midY}H${productX}`)}${gapLine('right', `M${productX + productW} ${midY}H${CAVITY.x + CAVITY.w}`)}${gapLine('top', `M${midX} ${CAVITY.y}V${productY}`)}${gapLine('bottom', `M${midX} ${productY + productH}V${CAVITY.y + CAVITY.h}`)}<g font-size="12"><text x="${CAVITY.x + CAVITY.w / 2}" y="13" text-anchor="middle" fill="${INK}">${spec.xLabel}: ${Math.round(spec.cavityX)}mm</text><text x="12" y="${CAVITY.y + CAVITY.h / 2}" text-anchor="middle" transform="rotate(-90 12 ${CAVITY.y + CAVITY.h / 2})" fill="${INK}">${spec.yLabel}: ${Math.round(spec.cavityY)}mm</text>${gapLabel('left', leftLabelGap, Math.max(CAVITY.x + 9, Math.round((CAVITY.x + productX) / 2)), midY - 3)}${gapLabel('right', rightGap, Math.min(CAVITY.x + CAVITY.w - 9, Math.round((productX + productW + CAVITY.x + CAVITY.w) / 2)), midY - 3)}${gapLabel('top', topLabelGap, midX, Math.max(CAVITY.y + 11, Math.round((CAVITY.y + productY) / 2) + 4))}${gapLabel('bottom', bottomGap, midX, Math.min(CAVITY.y + CAVITY.h - 4, Math.round((productY + productH + CAVITY.y + CAVITY.h) / 2) + 4))}</g></svg>`;
  }

  function renderFitVisualizationGroup({
    cavity,
    product,
    clearance
  } = {}) {
    if (!hasUsableDimensions(cavity, product)) {
      return `<figure class="fit-viz-group">${placeholderSvg()}<figcaption>Enter all 3 dimensions to see a fit visualization.</figcaption></figure>`;
    }
    const bindingAxis = identifyBindingConstraint(cavity, product, clearance);
    const bindingGap = getAxisGaps(cavity, product, clearance)?.[bindingAxis] ?? 0;
    const name = safeLabel(product?.displayName || [product?.brand, product?.model].filter(Boolean).join(' ') || 'Appliance') || 'Appliance';
    const panes = ['front', 'top', 'side'].map((view) => {
      const label = `${view[0].toUpperCase()}${view.slice(1)}`;
      return `<div class="fit-viz-pane" role="button" tabindex="0" aria-label="Expand ${label} view" data-fit-viz-view="${view}"><h4>${label}</h4>${renderFitSvg({ cavity, product, clearance, view })}</div>`;
    }).join('');

    return `<figure class="fit-viz-group"><div class="fit-viz-row">${panes}</div><figcaption>${escHtml(name)} · binding: ${escHtml(bindingAxis)} ${escHtml(Math.round(bindingGap))}mm · best fit</figcaption></figure>`;
  }

  const api = {
    formatGap,
    identifyBindingConstraint,
    renderFitSvg,
    renderFitVisualizationGroup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.FitVisualization = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
