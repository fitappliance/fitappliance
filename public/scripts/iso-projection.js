'use strict';

(function attachIsoProjection(globalScope) {
  const VIEWBOX = 280;
  const COS_30 = Math.sqrt(3) / 2;
  const SIN_30 = 0.5;
  const INK = '#2c2c2c';
  const MUTED = '#6b6b6b';
  const PRODUCT_FILL = 'rgba(232,230,225,0.7)';
  const CAVITY_FILL = 'rgba(245,243,238,0.4)';
  const ORANGE = '#d97706';

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDimensions(cavity, product, clearance) {
    const c = {
      w: toNumber(cavity?.w),
      h: toNumber(cavity?.h),
      d: toNumber(cavity?.d)
    };
    const p = {
      w: toNumber(product?.w),
      h: toNumber(product?.h),
      d: toNumber(product?.d)
    };
    const cl = {
      side: toNumber(clearance?.side) ?? 0,
      top: toNumber(clearance?.top) ?? 0,
      rear: toNumber(clearance?.rear) ?? 0
    };

    const valid = [c.w, c.h, c.d, p.w, p.h, p.d].every((value) => Number.isFinite(value) && value > 0);
    return { cavity: c, product: p, clearance: cl, valid };
  }

  function toIso(x, y, z) {
    return {
      sx: (x - y) * COS_30,
      sy: (x + y) * SIN_30 - z
    };
  }

  function cubePoints(origin, size) {
    const { x, y, z } = origin;
    const { w, d, h } = size;
    return {
      a: { x, y, z },
      b: { x: x + w, y, z },
      c: { x: x + w, y: y + d, z },
      d: { x, y: y + d, z },
      e: { x, y, z: z + h },
      f: { x: x + w, y, z: z + h },
      g: { x: x + w, y: y + d, z: z + h },
      h: { x, y: y + d, z: z + h }
    };
  }

  function makeProjector(pointGroups) {
    const projected = pointGroups.flatMap((points) => Object.values(points).map((point) => toIso(point.x, point.y, point.z)));
    const minX = Math.min(...projected.map((point) => point.sx));
    const maxX = Math.max(...projected.map((point) => point.sx));
    const minY = Math.min(...projected.map((point) => point.sy));
    const maxY = Math.max(...projected.map((point) => point.sy));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = (VIEWBOX * 0.7) / Math.max(width, height);
    const offsetX = (VIEWBOX - width * scale) / 2 - minX * scale;
    const offsetY = (VIEWBOX - height * scale) / 2 - minY * scale;

    return function project(point) {
      const raw = toIso(point.x, point.y, point.z);
      return {
        x: Number((raw.sx * scale + offsetX).toFixed(2)),
        y: Number((raw.sy * scale + offsetY).toFixed(2))
      };
    };
  }

  function attrs(options = {}) {
    return Object.entries(options)
      .filter(([, value]) => value !== false && value != null)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
  }

  function drawFace(project, p1, p2, p3, p4, options = {}) {
    const points = [p1, p2, p3, p4].map(project);
    const d = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} L ${points[2].x} ${points[2].y} L ${points[3].x} ${points[3].y} Z`;
    return `<path d="${d}" ${attrs({
      fill: options.fill || 'none',
      stroke: options.stroke || INK,
      'stroke-width': options.strokeWidth || 1,
      'stroke-dasharray': options.dash || null,
      opacity: options.opacity || null
    })}/>`;
  }

  function drawEdge(project, p1, p2, options = {}) {
    const start = project(p1);
    const end = project(p2);
    return `<line ${attrs({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke: options.stroke || INK,
      'stroke-width': options.strokeWidth || 1,
      'stroke-dasharray': options.dash || null,
      opacity: options.opacity || null,
      'marker-start': options.marker ? 'url(#iso-arrow)' : null,
      'marker-end': options.marker ? 'url(#iso-arrow)' : null
    })}/>`;
  }

  function drawText(x, y, text, options = {}) {
    return `<text ${attrs({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      'text-anchor': options.anchor || 'middle',
      'font-family': 'sans-serif',
      'font-size': options.size || 11,
      fill: options.fill || INK,
      'font-weight': options.weight || null,
      'font-variant-numeric': 'tabular-nums'
    })}>${text}</text>`;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function formatDimensionLabel(value) {
    const rounded = Math.round(Number(value) || 0);
    return `${rounded} mm`;
  }

  function formatGapLabel(value) {
    const rounded = Math.round(Number(value) || 0);
    return `${rounded}mm`;
  }

  function axisGaps(cavity, product, clearance) {
    return {
      width: cavity.w - product.w - clearance.side * 2,
      height: cavity.h - product.h - clearance.top,
      depth: cavity.d - product.d - clearance.rear
    };
  }

  function renderInvalidSvg() {
    return `<svg viewBox="0 0 280 280" role="img" aria-label="Isometric fit visualization unavailable" xmlns="http://www.w3.org/2000/svg"><text x="140" y="140" text-anchor="middle" font-family="sans-serif" font-size="12" fill="${MUTED}">Enter valid dimensions</text></svg>`;
  }

  function renderIsoFitSvg({ cavity, product, clearance, bindingAxis = null } = {}) {
    const normalized = normalizeDimensions(cavity, product, clearance);
    if (!normalized.valid) return renderInvalidSvg();

    const { cavity: c, product: p, clearance: cl } = normalized;
    const cavityCube = cubePoints({ x: 0, y: 0, z: 0 }, { w: c.w, d: c.d, h: c.h });
    const productCube = cubePoints(
      { x: cl.side, y: cl.rear, z: 0 },
      { w: p.w, d: p.d, h: p.h }
    );
    const project = makeProjector([cavityCube, productCube]);
    const gaps = axisGaps(c, p, cl);

    const faces = [
      drawFace(project, cavityCube.e, cavityCube.f, cavityCube.g, cavityCube.h, { fill: CAVITY_FILL, strokeWidth: 1.4 }),
      drawFace(project, cavityCube.a, cavityCube.b, cavityCube.f, cavityCube.e, { fill: CAVITY_FILL, strokeWidth: 1.4 }),
      drawFace(project, cavityCube.b, cavityCube.c, cavityCube.g, cavityCube.f, { fill: CAVITY_FILL, strokeWidth: 1.4 }),
      drawFace(project, productCube.e, productCube.f, productCube.g, productCube.h, { fill: PRODUCT_FILL, strokeWidth: 1.2 }),
      drawFace(project, productCube.a, productCube.b, productCube.f, productCube.e, { fill: PRODUCT_FILL, strokeWidth: 1.2 }),
      drawFace(project, productCube.b, productCube.c, productCube.g, productCube.f, { fill: PRODUCT_FILL, strokeWidth: 1.2 })
    ];

    const hiddenEdges = [
      drawEdge(project, cavityCube.a, cavityCube.d, { dash: '4,3', opacity: 0.4 }),
      drawEdge(project, cavityCube.d, cavityCube.c, { dash: '4,3', opacity: 0.4 }),
      drawEdge(project, cavityCube.d, cavityCube.h, { dash: '4,3', opacity: 0.4 })
    ];

    const visibleEdges = [
      drawEdge(project, cavityCube.a, cavityCube.b, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.b, cavityCube.c, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.a, cavityCube.e, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.b, cavityCube.f, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.c, cavityCube.g, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.e, cavityCube.f, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.f, cavityCube.g, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.g, cavityCube.h, { strokeWidth: 1.4 }),
      drawEdge(project, cavityCube.h, cavityCube.e, { strokeWidth: 1.4 })
    ];

    const highlight = [];
    if (bindingAxis === 'width') {
      highlight.push(drawEdge(project, cavityCube.b, cavityCube.f, { stroke: ORANGE, strokeWidth: 1.8 }));
      highlight.push(drawEdge(project, cavityCube.c, cavityCube.g, { stroke: ORANGE, strokeWidth: 1.8 }));
    } else if (bindingAxis === 'height') {
      highlight.push(drawEdge(project, cavityCube.e, cavityCube.f, { stroke: ORANGE, strokeWidth: 1.8 }));
      highlight.push(drawEdge(project, cavityCube.f, cavityCube.g, { stroke: ORANGE, strokeWidth: 1.8 }));
    } else if (bindingAxis === 'depth') {
      highlight.push(drawEdge(project, cavityCube.b, cavityCube.c, { stroke: ORANGE, strokeWidth: 1.8 }));
      highlight.push(drawEdge(project, cavityCube.f, cavityCube.g, { stroke: ORANGE, strokeWidth: 1.8 }));
    }

    const widthStart = project({ x: 0, y: -c.d * 0.08, z: 0 });
    const widthEnd = project({ x: c.w, y: -c.d * 0.08, z: 0 });
    const heightStart = project({ x: c.w * 1.06, y: 0, z: 0 });
    const heightEnd = project({ x: c.w * 1.06, y: 0, z: c.h });
    const depthStart = project({ x: c.w, y: 0, z: c.h * 1.04 });
    const depthEnd = project({ x: c.w, y: c.d, z: c.h * 1.04 });

    const dimensions = [
      `<line x1="${widthStart.x}" y1="${widthStart.y}" x2="${widthEnd.x}" y2="${widthEnd.y}" stroke="${INK}" stroke-width="1" marker-start="url(#iso-arrow)" marker-end="url(#iso-arrow)"/>`,
      drawText(midpoint(widthStart, widthEnd).x, midpoint(widthStart, widthEnd).y + 15, formatDimensionLabel(c.w)),
      `<line x1="${heightStart.x}" y1="${heightStart.y}" x2="${heightEnd.x}" y2="${heightEnd.y}" stroke="${INK}" stroke-width="1" marker-start="url(#iso-arrow)" marker-end="url(#iso-arrow)"/>`,
      drawText(midpoint(heightStart, heightEnd).x + 18, midpoint(heightStart, heightEnd).y, formatDimensionLabel(c.h), { anchor: 'start' }),
      `<line x1="${depthStart.x}" y1="${depthStart.y}" x2="${depthEnd.x}" y2="${depthEnd.y}" stroke="${INK}" stroke-width="1" marker-start="url(#iso-arrow)" marker-end="url(#iso-arrow)"/>`,
      drawText(midpoint(depthStart, depthEnd).x + 5, midpoint(depthStart, depthEnd).y - 10, formatDimensionLabel(c.d))
    ];

    const gapAnchors = [
      { point: project({ x: cl.side / 2, y: 0, z: p.h * 0.55 }), value: gaps.width, binding: bindingAxis === 'width' },
      { point: project({ x: c.w - cl.side / 2, y: 0, z: p.h * 0.45 }), value: gaps.width, binding: bindingAxis === 'width' },
      { point: project({ x: c.w * 0.5, y: cl.rear + p.d + Math.max(0, gaps.depth) / 2, z: p.h * 0.9 }), value: gaps.depth, binding: bindingAxis === 'depth' },
      { point: project({ x: c.w * 0.5, y: c.d * 0.12, z: p.h + Math.max(0, gaps.height) / 2 }), value: gaps.height, binding: bindingAxis === 'height' }
    ];

    const gapLabels = gapAnchors.map(({ point, value, binding }) => drawText(
      point.x,
      point.y,
      formatGapLabel(value),
      { size: 9, fill: binding ? ORANGE : MUTED, weight: binding ? 700 : null }
    ));

    return `<svg viewBox="0 0 280 280" role="img" aria-label="Isometric fit visualization" xmlns="http://www.w3.org/2000/svg"><defs><marker id="iso-arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${INK}"/></marker></defs>${faces.join('')}${hiddenEdges.join('')}${visibleEdges.join('')}${highlight.join('')}${dimensions.join('')}${gapLabels.join('')}</svg>`;
  }

  const api = { renderIsoFitSvg };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.IsoProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
