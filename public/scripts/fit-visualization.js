'use strict';

(function attachFitVisualization(globalScope) {
  const SVG_WIDTH = 280;
  const SVG_HEIGHT = 240;
  const CAVITY = { x: 48, y: 38, w: 176, h: 146 };
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
    return `<svg class="fit-viz-svg" role="img" aria-label="${escHtml(message)}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="48" y="48" width="184" height="120" rx="10" fill="none" stroke="${INK}" stroke-width="2"/><text x="140" y="116" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#6b6b6b">${escHtml(message)}</text></svg>`;
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
    const bindingAxis = identifyBindingConstraint(cavity, product, clearance);
    const bindingGap = getAxisGaps(cavity, product, clearance)?.[bindingAxis] ?? spec.gapX;
    const ratioX = clampRatio(spec.productX / spec.cavityX);
    const ratioY = clampRatio(spec.productY / spec.cavityY);
    const productW = Math.max(12, Math.round(CAVITY.w * ratioX));
    const productH = Math.max(12, Math.round(CAVITY.h * ratioY));
    const productX = Math.round(CAVITY.x + (CAVITY.w - productW) / 2);
    const productY = Math.round(CAVITY.y + (CAVITY.h - productH) / 2);
    const xBinding = bindingAxis === spec.xAxis;
    const yBinding = bindingAxis === spec.yAxis;
    const label = `${spec.title} view fit visualization. ${spec.xLabel}: ${spec.cavityX}mm, ${spec.yLabel}: ${spec.cavityY}mm. Tightest gap ${Math.round(bindingGap)}mm on ${bindingAxis}.`;
    const markerId = `fitArrow${spec.title}`;

    return `<svg class="fit-viz-svg" role="img" aria-label="${escHtml(label)}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect class="fit-viz-cavity" x="${CAVITY.x}" y="${CAVITY.y}" width="${CAVITY.w}" height="${CAVITY.h}" fill="none" stroke="${INK}" stroke-width="1.8"/>
  <rect class="fit-viz-product" x="${productX}" y="${productY}" width="${productW}" height="${productH}" fill="#eeece6" stroke="${INK}" stroke-width="1.2"/>
  <path d="M${CAVITY.x} ${CAVITY.y - 12}H${CAVITY.x + CAVITY.w}" stroke="${INK}" stroke-width="1" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>
  <path d="M${CAVITY.x - 14} ${CAVITY.y}V${CAVITY.y + CAVITY.h}" stroke="${INK}" stroke-width="1" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>
  <path d="M${CAVITY.x} ${CAVITY.y + CAVITY.h + 14}H${productX}" stroke="${xBinding ? ORANGE : '#7a766e'}" stroke-width="${xBinding ? '2.5' : '1'}"/>
  <path d="M${CAVITY.x + CAVITY.w + 13} ${productY + productH}V${CAVITY.y + CAVITY.h}" stroke="${yBinding ? ORANGE : '#7a766e'}" stroke-width="${yBinding ? '2.5' : '1'}"/>
  <text x="${CAVITY.x + CAVITY.w / 2}" y="${CAVITY.y - 18}" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="${INK}">${spec.xLabel}: ${Math.round(spec.cavityX)}mm</text>
  <text x="${CAVITY.x - 20}" y="${CAVITY.y + CAVITY.h / 2}" text-anchor="middle" transform="rotate(-90 ${CAVITY.x - 20} ${CAVITY.y + CAVITY.h / 2})" font-family="-apple-system, sans-serif" font-size="12" fill="${INK}">${spec.yLabel}: ${Math.round(spec.cavityY)}mm</text>
  <text x="${Math.max(70, productX - 12)}" y="${CAVITY.y + CAVITY.h + 31}" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="${xBinding ? ORANGE : '#6b6b6b'}">${xBinding ? formatBindingGap(spec.gapX) : formatGap(spec.gapX)}</text>
  <text x="${CAVITY.x + CAVITY.w + 22}" y="${Math.min(CAVITY.y + CAVITY.h - 6, productY + productH + 20)}" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="${yBinding ? ORANGE : '#6b6b6b'}">${yBinding ? formatBindingGap(spec.gapY) : formatGap(spec.gapY)}</text>
  <text x="${productX + productW / 2}" y="${productY + productH / 2}" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, sans-serif" font-size="12" fill="${INK}">appliance</text>
  <defs><marker id="${markerId}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="${INK}"/></marker></defs>
</svg>`;
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
    const panes = ['front', 'top', 'side'].map((view) => `
      <div class="fit-viz-pane">
        <h4>${view[0].toUpperCase()}${view.slice(1)}</h4>
        ${renderFitSvg({ cavity, product, clearance, view })}
      </div>
    `).join('');

    return `<figure class="fit-viz-group">
  <div class="fit-viz-row">${panes}</div>
  <figcaption>${escHtml(name)} · binding axis: ${escHtml(bindingAxis)} · tightest gap: ${escHtml(formatGap(bindingGap))}</figcaption>
</figure>`;
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
