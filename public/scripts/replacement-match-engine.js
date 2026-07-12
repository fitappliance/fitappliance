'use strict';

(function attachReplacementMatchEngine(globalScope) {
  const AXES = Object.freeze(['width', 'height', 'depth']);
  const WEIGHTS = Object.freeze({ width: 0.40, height: 0.30, depth: 0.30 });

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeDimensions(value) {
    const dimensions = {
      width: positiveNumber(value?.width ?? value?.w),
      height: positiveNumber(value?.height ?? value?.h),
      depth: positiveNumber(value?.depth ?? value?.d)
    };
    if (AXES.some((axis) => dimensions[axis] === null)) {
      throw new TypeError('complete width, height and depth dimensions are required');
    }
    return dimensions;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function tryProductDimensions(product, sourceDimensions) {
    const closed = product?.geometry_v2?.closedEnvelope;
    const geometryWidth = positiveNumber(closed?.widthMm);
    const geometryDepth = positiveNumber(closed?.depthMm);
    const heightSpec = closed?.heightMm;
    const heightMinimum = positiveNumber(
      heightSpec && typeof heightSpec === 'object' ? heightSpec.minimumMm : heightSpec
    );
    const heightMaximum = positiveNumber(
      heightSpec && typeof heightSpec === 'object' ? heightSpec.maximumMm : heightSpec
    );
    if (geometryWidth && geometryDepth && heightMinimum && heightMaximum && heightMinimum <= heightMaximum) {
      const selectedHeight = clamp(sourceDimensions.height, heightMinimum, heightMaximum);
      return {
        dimensions: {
          width: geometryWidth,
          height: selectedHeight,
          depth: geometryDepth
        },
        dimensionSource: 'geometry_v2',
        heightRange: heightMinimum < heightMaximum
          ? { minimum: heightMinimum, maximum: heightMaximum, selected: selectedHeight }
          : null
      };
    }
    try {
      return {
        dimensions: normalizeDimensions({
          width: product?.w,
          height: product?.h,
          depth: product?.d
        }),
        dimensionSource: 'catalog',
        heightRange: null
      };
    } catch {
      return null;
    }
  }

  function relationFor(deltas) {
    const values = AXES.map((axis) => deltas[axis]);
    if (values.every((value) => value === 0)) return 'IDENTICAL';
    if (values.every((value) => value <= 0)) return 'SAME_OR_SMALLER';
    if (values.every((value) => value >= 0)) return 'SAME_OR_LARGER';
    return 'MIXED';
  }

  function compareDimensions(sourceDimensions, candidateDimensions) {
    const source = normalizeDimensions(sourceDimensions);
    const candidate = normalizeDimensions(candidateDimensions);
    const deltasMm = Object.fromEntries(AXES.map((axis) => [axis, candidate[axis] - source[axis]]));
    const absoluteDeltasMm = Object.fromEntries(AXES.map((axis) => [axis, Math.abs(deltasMm[axis])]));
    const maxAbsoluteDeltaMm = Math.max(...AXES.map((axis) => absoluteDeltasMm[axis]));
    const totalAbsoluteDeltaMm = AXES.reduce((sum, axis) => sum + absoluteDeltasMm[axis], 0);
    const normalizedDistance = AXES.reduce((sum, axis) => (
      sum + ((absoluteDeltasMm[axis] / source[axis]) * WEIGHTS[axis])
    ), 0);
    return Object.freeze({
      sourceDimensionsMm: Object.freeze(source),
      candidateDimensionsMm: Object.freeze(candidate),
      deltasMm: Object.freeze(deltasMm),
      absoluteDeltasMm: Object.freeze(absoluteDeltasMm),
      maxAbsoluteDeltaMm,
      totalAbsoluteDeltaMm,
      normalizedDistance,
      relation: relationFor(deltasMm)
    });
  }

  function isRetailerProductPageUrl(value) {
    let url;
    try {
      url = new URL(String(value ?? '').trim());
    } catch {
      return false;
    }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '').toLowerCase();
    if (url.protocol !== 'https:' || !host || !pathname || pathname === '/') return false;
    if (host === 'prf.hn') return false;
    if (['q', 'query', 'searchterm', 'text', 'keyword'].some((key) => url.searchParams.has(key))) return false;
    if (/\/(?:search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(?:\/|$)/i.test(pathname)) {
      return false;
    }
    if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
    if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
    if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);
    return false;
  }

  function isCurrentProduct(product) {
    return product?.unavailable === false
      && Array.isArray(product?.retailers)
      && product.retailers.some((retailer) => isRetailerProductPageUrl(
        retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link
      ));
  }

  function stableProductIdentity(product) {
    return [product?.brand, product?.model, product?.id]
      .map((value) => String(value ?? '').trim())
      .join('\0');
  }

  function compareMatches(left, right) {
    if (left.match.maxAbsoluteDeltaMm !== right.match.maxAbsoluteDeltaMm) {
      return left.match.maxAbsoluteDeltaMm - right.match.maxAbsoluteDeltaMm;
    }
    if (left.match.normalizedDistance !== right.match.normalizedDistance) {
      return left.match.normalizedDistance - right.match.normalizedDistance;
    }
    if (left.match.totalAbsoluteDeltaMm !== right.match.totalAbsoluteDeltaMm) {
      return left.match.totalAbsoluteDeltaMm - right.match.totalAbsoluteDeltaMm;
    }
    return stableProductIdentity(left.product).localeCompare(
      stableProductIdentity(right.product),
      'en-AU',
      { sensitivity: 'base' }
    );
  }

  function matchCurrentProducts(products, { category, sourceDimensions, limit = Number.MAX_SAFE_INTEGER } = {}) {
    const source = normalizeDimensions(sourceDimensions);
    const wantedCategory = String(category ?? '').trim();
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(0, Math.floor(Number(limit)))
      : Number.MAX_SAFE_INTEGER;
    return (Array.isArray(products) ? products : [])
      .filter((product) => !wantedCategory || product?.cat === wantedCategory)
      .filter(isCurrentProduct)
      .map((product) => {
        const resolved = tryProductDimensions(product, source);
        if (!resolved) return null;
        const compared = compareDimensions(source, resolved.dimensions);
        const match = Object.freeze({
          ...compared,
          candidateDimensionSource: resolved.dimensionSource,
          ...(resolved.heightRange ? { candidateHeightRangeMm: Object.freeze(resolved.heightRange) } : {})
        });
        return { product, match };
      })
      .filter(Boolean)
      .sort(compareMatches)
      .slice(0, normalizedLimit);
  }

  const api = {
    AXES,
    WEIGHTS,
    compareDimensions,
    compareMatches,
    isCurrentProduct,
    isRetailerProductPageUrl,
    matchCurrentProducts,
    normalizeDimensions
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.ReplacementMatchEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
