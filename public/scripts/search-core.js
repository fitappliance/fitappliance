'use strict';

(function attachSearchCore(globalScope) {
  const CLEARANCE_DEFAULTS = {
    fridge: { rear: 25, sides: 5, top: 25 },
    dishwasher: { rear: 5, sides: 0, top: 5 },
    dryer: { rear: 25, sides: 5, top: 0 },
    washing_machine: { rear: 15, sides: 5, top: 0 }
  };

  const CATEGORY_LABELS = {
    fridge: 'Fridges',
    dishwasher: 'Dishwashers',
    dryer: 'Dryers',
    washing_machine: 'Washing Machines'
  };

  const CATEGORY_PRESETS = {
    fridge: [
      { id: 'standard-600', label: '600mm Standard', w: 600 },
      { id: 'wide-700', label: '700mm Wide', w: 700 },
      { id: 'family-900', label: '900mm Family', w: 900 }
    ],
    dishwasher: [
      { id: 'builtin-600', label: '600 × 820 × 600', w: 600, h: 820, d: 600 },
      { id: 'tall-tub', label: '600 × 850 × 620', w: 600, h: 850, d: 620 },
      { id: 'compact', label: '550 × 820 × 550', w: 550, h: 820, d: 550 }
    ],
    washing_machine: [
      { id: 'front-loader', label: '600 × 850 × 650', w: 600, h: 850, d: 650 },
      { id: 'slim', label: '600 × 850 × 600', w: 600, h: 850, d: 600 },
      { id: 'wide-family', label: '700 × 900 × 750', w: 700, h: 900, d: 750 }
    ],
    dryer: [
      { id: 'stackable', label: '600 × 850 × 650', w: 600, h: 850, d: 650 },
      { id: 'compact', label: '600 × 850 × 600', w: 600, h: 850, d: 600 },
      { id: 'large-capacity', label: '700 × 900 × 750', w: 700, h: 900, d: 750 }
    ]
  };

  const DEFAULT_FACETS = Object.freeze({
    brand: [],
    priceMin: null,
    priceMax: null,
    stars: null,
    availableOnly: true
  });

  const VALID_SORTS = new Set([
    'best-fit',
    'price-asc',
    'price-desc',
    'popularity',
    'stars'
  ]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toMm(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value !== 'string' || !value.trim()) return null;
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
    const parsed = Math.round(Number.parseFloat(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function getCategoryClearance(defaults, category) {
    const row = defaults?.[category] ?? CLEARANCE_DEFAULTS?.[category] ?? {};
    return {
      rear: Number.isFinite(Number(row.rear)) ? Number(row.rear) : 0,
      sides: Number.isFinite(Number(row.sides)) ? Number(row.sides) : 0,
      top: Number.isFinite(Number(row.top)) ? Number(row.top) : 0
    };
  }

  function getAxisEntries(product, filters, clearance) {
    const entries = [];
    const cavityW = toMm(filters?.w);
    const cavityH = toMm(filters?.h);
    const cavityD = toMm(filters?.d);

    if (cavityW) {
      entries.push({ key: 'w', cavity: cavityW, appliance: Number(product?.w), clearanceMm: clearance.sides * 2 });
    }
    if (cavityH) {
      entries.push({ key: 'h', cavity: cavityH, appliance: Number(product?.h), clearanceMm: clearance.top });
    }
    if (cavityD) {
      entries.push({ key: 'd', cavity: cavityD, appliance: Number(product?.d), clearanceMm: clearance.rear });
    }

    return entries;
  }

  function computeAxisScore(cavity, appliance, clearanceMm) {
    if (!Number.isFinite(cavity) || cavity <= 0) return null;
    if (!Number.isFinite(appliance) || appliance <= 0) return null;
    return clamp((cavity - appliance - clearanceMm) / cavity, -0.05, 0.5);
  }

  function computeFitMeta(product, filters, defaults) {
    const clearance = getCategoryClearance(defaults, filters?.cat ?? product?.cat);
    const axisEntries = getAxisEntries(product, filters, clearance);
    if (axisEntries.length === 0) return null;

    const axisScores = axisEntries.map((entry) => computeAxisScore(entry.cavity, entry.appliance, entry.clearanceMm));
    const fitScore = Math.min(...axisScores);
    const sortScore = axisScores.reduce((sum, score) => sum + score, 0) / axisScores.length;
    const cavityMin = Math.min(...axisEntries.map((entry) => entry.cavity));
    const toleranceMm = Number.isFinite(Number(filters?.toleranceMm)) ? Number(filters.toleranceMm) : 0;
    const threshold = -(toleranceMm / cavityMin);
    const exactFit = axisScores.every((score) => score >= 0);
    const fitsTightly = axisScores.some((score) => score < 0.02);

    return {
      fitScore,
      sortScore,
      threshold,
      exactFit,
      fitsTightly: fitsTightly || fitScore < 0,
      clearance
    };
  }

  function buildProductUrl(product, filters) {
    const params = new URLSearchParams();
    if (product?.cat) params.set('cat', String(product.cat));
    if (filters?.w) params.set('w', String(filters.w));
    if (filters?.h) params.set('h', String(filters.h));
    if (filters?.d) params.set('d', String(filters.d));
    if (product?.brand) params.set('brand', String(product.brand));
    return `/?${params.toString()}`;
  }

  function normalizeBrand(value) {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function normalizeFacetBrands(values) {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => String(value ?? '').trim().slice(0, 50))
      .filter(Boolean);
  }

  function normalizeNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeFacets(facets) {
    const rawPriceMin = normalizeNumberOrNull(facets?.priceMin);
    const rawPriceMax = normalizeNumberOrNull(facets?.priceMax);
    const rawStars = normalizeNumberOrNull(facets?.stars);
    return {
      brand: normalizeFacetBrands(facets?.brand),
      priceMin: rawPriceMin !== null && rawPriceMin >= 0 ? rawPriceMin : null,
      priceMax: rawPriceMax !== null && rawPriceMax >= 0 ? rawPriceMax : null,
      stars: rawStars !== null && rawStars >= 0 ? rawStars : null,
      availableOnly: facets?.availableOnly !== false
    };
  }

  function normalizeSortBy(value) {
    const next = String(value ?? '').trim();
    return VALID_SORTS.has(next) ? next : 'best-fit';
  }

  function getComparablePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildResult(product, fitMeta, filters) {
    return {
      ...product,
      fitScore: fitMeta.fitScore,
      sortScore: fitMeta.sortScore,
      exactFit: fitMeta.exactFit,
      fitsTightly: fitMeta.fitsTightly,
      showPopularityBadge: Number(product?.priorityScore ?? 0) >= 70,
      sku: String(product?.model ?? '').trim().split(/\s+/)[0] ?? '',
      url: buildProductUrl(product, filters)
    };
  }

  function compareMatches(left, right) {
    if (left.exactFit !== right.exactFit) return left.exactFit ? -1 : 1;
    if (left.sortScore !== right.sortScore) return left.sortScore - right.sortScore;
    if ((right.priorityScore ?? 0) !== (left.priorityScore ?? 0)) {
      return (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
    }
    return String(left.displayName ?? left.brand ?? '').localeCompare(String(right.displayName ?? right.brand ?? ''));
  }

  function buildFacetCounts(pool) {
    const rows = Array.isArray(pool) ? pool : [];
    if (rows.length === 0) return {};

    const brandMap = new Map();
    const starsMap = new Map();
    let pricedCount = 0;
    let availableCount = 0;

    for (const row of rows) {
      const brandLabel = String(row?.brand ?? '').trim();
      if (brandLabel) {
        brandMap.set(brandLabel, (brandMap.get(brandLabel) ?? 0) + 1);
      }
      const stars = Number(row?.stars);
      if (Number.isFinite(stars)) {
        starsMap.set(String(Math.round(stars)), (starsMap.get(String(Math.round(stars))) ?? 0) + 1);
      }
      if (Number.isFinite(Number(row?.price))) pricedCount += 1;
      if (row?.unavailable === false && Array.isArray(row?.retailers) && row.retailers.length > 0) {
        availableCount += 1;
      }
    }

    const orderedBrands = Object.fromEntries(
      [...brandMap.entries()].sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0], 'en-AU', { sensitivity: 'base' });
      })
    );
    const orderedStars = Object.fromEntries(
      [...starsMap.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))
    );

    return {
      brand: orderedBrands,
      stars: orderedStars,
      availability: {
        available: availableCount,
        withPrice: pricedCount
      }
    };
  }

  function applyFacets(matches, facets = {}) {
    const pool = Array.isArray(matches) ? matches : [];
    const normalized = normalizeFacets(facets);
    const selectedBrands = new Set(normalized.brand.map(normalizeBrand));

    const rows = pool.filter((row) => {
      if (selectedBrands.size > 0 && !selectedBrands.has(normalizeBrand(row?.brand))) {
        return false;
      }
      const price = Number(row?.price);
      const hasPriceBounds = normalized.priceMin !== null || normalized.priceMax !== null;
      if (hasPriceBounds) {
        if (!Number.isFinite(price)) return false;
        if (normalized.priceMin !== null && price < normalized.priceMin) return false;
        if (normalized.priceMax !== null && price > normalized.priceMax) return false;
      }
      if (normalized.stars !== null && Number(row?.stars ?? 0) < normalized.stars) {
        return false;
      }
      if (normalized.availableOnly) {
        const hasRetailers = Array.isArray(row?.retailers) && row.retailers.length > 0;
        if (row?.unavailable !== false || !hasRetailers) {
          return false;
        }
      }
      return true;
    });

    return {
      rows,
      counts: buildFacetCounts(pool)
    };
  }

  function sortMatches(rows, sortBy = 'best-fit') {
    const list = Array.isArray(rows) ? [...rows] : [];
    const nextSort = normalizeSortBy(sortBy);

    if (nextSort === 'price-asc') {
      return list.sort((left, right) => {
        const leftComparable = getComparablePrice(left?.price);
        const rightComparable = getComparablePrice(right?.price);
        const leftPrice = leftComparable ?? Infinity;
        const rightPrice = rightComparable ?? Infinity;
        const leftHasPrice = leftComparable !== null;
        const rightHasPrice = rightComparable !== null;
        if (leftHasPrice !== rightHasPrice) return leftHasPrice ? -1 : 1;
        if (leftPrice !== rightPrice) return leftPrice - rightPrice;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'price-desc') {
      return list.sort((left, right) => {
        const leftComparable = getComparablePrice(left?.price);
        const rightComparable = getComparablePrice(right?.price);
        const leftPrice = leftComparable ?? -Infinity;
        const rightPrice = rightComparable ?? -Infinity;
        const leftHasPrice = leftComparable !== null;
        const rightHasPrice = rightComparable !== null;
        if (leftHasPrice !== rightHasPrice) return leftHasPrice ? -1 : 1;
        if (rightPrice !== leftPrice) return rightPrice - leftPrice;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'popularity') {
      return list.sort((left, right) => {
        const delta = Number(right?.priorityScore ?? 0) - Number(left?.priorityScore ?? 0);
        if (delta !== 0) return delta;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'stars') {
      return list.sort((left, right) => {
        const delta = Number(right?.stars ?? 0) - Number(left?.stars ?? 0);
        if (delta !== 0) return delta;
        return compareMatches(left, right);
      });
    }

    return list.sort(compareMatches);
  }

  function findSearchMatches(products, filters, {
    clearanceDefaults = CLEARANCE_DEFAULTS,
    limit = 60
  } = {}) {
    const rows = Array.isArray(products) ? products : [];
    const hasAtLeastOneDimension = [filters?.w, filters?.h, filters?.d].some((value) => toMm(value));
    if (!hasAtLeastOneDimension) return [];

    return rows
      .filter((product) => !filters?.cat || product?.cat === filters.cat)
      .map((product) => {
        const fitMeta = computeFitMeta(product, filters, clearanceDefaults);
        if (!fitMeta) return null;
        if (fitMeta.fitScore < fitMeta.threshold) return null;
        return buildResult(product, fitMeta, filters);
      })
      .filter(Boolean)
      .sort(compareMatches)
      .slice(0, Math.max(1, limit));
  }

  function searchWithFacets(products, filters, facets = {}, options = {}) {
    const pool = findSearchMatches(products, filters, {
      clearanceDefaults: options.clearanceDefaults ?? CLEARANCE_DEFAULTS,
      limit: options.limit ?? Number.MAX_SAFE_INTEGER
    });
    const filtered = applyFacets(pool, facets);
    return {
      rows: sortMatches(filtered.rows, options.sortBy ?? filters?.sortBy ?? facets?.sortBy ?? 'best-fit'),
      counts: filtered.counts
    };
  }

  function serializeSearchState(state) {
    const params = new URLSearchParams();
    const facets = normalizeFacets(state?.facets);
    if (state?.cat) params.set('cat', String(state.cat));
    if (toMm(state?.w)) params.set('w', String(toMm(state.w)));
    if (toMm(state?.h)) params.set('h', String(toMm(state.h)));
    if (toMm(state?.d)) params.set('d', String(toMm(state.d)));
    params.set('tol', String(Number.isFinite(Number(state?.toleranceMm)) ? Number(state.toleranceMm) : 5));
    if (state?.preset) params.set('preset', String(state.preset));
    if (facets.brand.length > 0) params.set('brand', facets.brand.join(','));
    if (facets.priceMin !== null) params.set('pmin', String(facets.priceMin));
    if (facets.priceMax !== null) params.set('pmax', String(facets.priceMax));
    if (facets.stars !== null) params.set('stars', String(facets.stars));
    if (facets.availableOnly === false) params.set('avail', '0');
    if (state?.sortBy) params.set('sort', normalizeSortBy(state.sortBy));
    return params;
  }

  function parseSearchParams(queryString) {
    const params = new URLSearchParams(String(queryString ?? '').replace(/^\?/, ''));
    const rawBrands = String(params.get('brand') ?? '')
      .split(',')
      .map((value) => value.trim().slice(0, 50))
      .filter(Boolean);
    const rawPriceMin = normalizeNumberOrNull(params.get('pmin'));
    const rawPriceMax = normalizeNumberOrNull(params.get('pmax'));
    const rawStars = normalizeNumberOrNull(params.get('stars'));
    return {
      cat: params.get('cat') || null,
      w: toMm(params.get('w')),
      h: toMm(params.get('h')),
      d: toMm(params.get('d')),
      toleranceMm: clamp(Number(params.get('tol') ?? 5) || 5, 0, 20),
      preset: params.get('preset') || null,
      facets: {
        ...DEFAULT_FACETS,
        brand: rawBrands,
        priceMin: rawPriceMin !== null && rawPriceMin >= 0 ? rawPriceMin : null,
        priceMax: rawPriceMax !== null && rawPriceMax >= 0 ? rawPriceMax : null,
        stars: rawStars !== null && rawStars >= 0 ? rawStars : null,
        availableOnly: params.get('avail') !== '0'
      },
      sortBy: normalizeSortBy(params.get('sort'))
    };
  }

  function buildEmptyState({
    exactCount = 0,
    relaxedCount = 0,
    toleranceMm = 5,
    categoryLabel = 'Appliances'
  } = {}) {
    const relaxCount = Number.isFinite(relaxedCount) ? relaxedCount : 0;
    const tol = Number.isFinite(toleranceMm) ? toleranceMm : 5;

    return {
      title: `${exactCount} exact matches.`,
      detail: relaxCount > 0
        ? `${relaxCount} fit with +${tol}mm tolerance.`
        : `No ${categoryLabel.toLowerCase()} fit yet. Try a preset or relax the tolerance.`,
      ctaLabel: relaxCount > 0 ? `Relax to ${tol}mm` : 'Try a preset'
    };
  }

  const api = {
    CATEGORY_LABELS,
    CATEGORY_PRESETS,
    CLEARANCE_DEFAULTS,
    buildEmptyState,
    applyFacets,
    computeAxisScore,
    computeFitMeta,
    findSearchMatches,
    getCategoryClearance,
    parseSearchParams,
    searchWithFacets,
    serializeSearchState,
    sortMatches,
    toMm
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.SearchCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
