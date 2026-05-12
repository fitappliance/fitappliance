'use strict';

const DEFAULT_SLIDER_FACETS = Object.freeze({
  widthMin: null,
  widthMax: null,
  heightMin: null,
  heightMax: null,
  depthMin: null,
  depthMax: null,
  scoreMin: null,
  starsMin: null,
  starsMax: null,
  priceMin: null,
  priceMax: null,
  verifiedOnly: false
});

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSliderFacets(facets = {}) {
  return {
    ...DEFAULT_SLIDER_FACETS,
    widthMin: toFiniteNumber(facets.widthMin),
    widthMax: toFiniteNumber(facets.widthMax),
    heightMin: toFiniteNumber(facets.heightMin),
    heightMax: toFiniteNumber(facets.heightMax),
    depthMin: toFiniteNumber(facets.depthMin),
    depthMax: toFiniteNumber(facets.depthMax),
    scoreMin: toFiniteNumber(facets.scoreMin),
    starsMin: toFiniteNumber(facets.starsMin),
    starsMax: toFiniteNumber(facets.starsMax),
    priceMin: toFiniteNumber(facets.priceMin),
    priceMax: toFiniteNumber(facets.priceMax),
    verifiedOnly: facets.verifiedOnly === true
  };
}

function getComparablePrice(row) {
  const direct = toFiniteNumber(row?.price);
  if (direct !== null && direct > 0) return direct;
  const retailerPrices = (Array.isArray(row?.retailers) ? row.retailers : [])
    .map((retailer) => toFiniteNumber(retailer?.p ?? retailer?.price))
    .filter((price) => price !== null && price > 0);
  return retailerPrices.length > 0 ? Math.min(...retailerPrices) : null;
}

function hasVerificationSignal(row) {
  return Boolean(
    row?.verificationLevel
    || row?.evidence
    || row?.data_source
    || row?.dataSource
  );
}

function isVerifiedFit(row) {
  return row?.verificationLevel === 'verified'
    || row?.evidence?.has_pdf_evidence === true
    || row?.data_source === 'official_pdf'
    || row?.dataSource === 'official_pdf';
}

function inRange(value, min, max) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return min === null && max === null;
  if (min !== null && numeric < min) return false;
  if (max !== null && numeric > max) return false;
  return true;
}

function applySliderFilters(rows, facets = {}) {
  const pool = Array.isArray(rows) ? rows : [];
  const normalized = normalizeSliderFacets(facets);
  const shouldFilterVerified = normalized.verifiedOnly && pool.some(hasVerificationSignal);

  return pool.filter((row) => {
    if (!inRange(row?.w, normalized.widthMin, normalized.widthMax)) return false;
    if (!inRange(row?.h, normalized.heightMin, normalized.heightMax)) return false;
    if (!inRange(row?.d, normalized.depthMin, normalized.depthMax)) return false;
    if (!inRange(row?.stars, normalized.starsMin, normalized.starsMax)) return false;
    if (!inRange(getComparablePrice(row), normalized.priceMin, normalized.priceMax)) return false;
    const score = toFiniteNumber(row?.fitScoreNumeric);
    if (normalized.scoreMin !== null && (score === null || score < normalized.scoreMin)) return false;
    if (shouldFilterVerified && !isVerifiedFit(row)) return false;
    return true;
  });
}

function compareFallback(left, right) {
  const fitDelta = Number(left?.sortScore ?? 0) - Number(right?.sortScore ?? 0);
  if (fitDelta !== 0) return fitDelta;
  const priorityDelta = Number(right?.priorityScore ?? 0) - Number(left?.priorityScore ?? 0);
  if (priorityDelta !== 0) return priorityDelta;
  return String(left?.displayName ?? left?.model ?? '').localeCompare(String(right?.displayName ?? right?.model ?? ''));
}

function compareVerification(left, right) {
  const leftVerified = isVerifiedFit(left) ? 1 : 0;
  const rightVerified = isVerifiedFit(right) ? 1 : 0;
  if (leftVerified !== rightVerified) return rightVerified - leftVerified;
  return compareFitScoreDesc(left, right);
}

function compareFitScoreDesc(left, right) {
  const scoreDelta = Number(right?.fitScoreNumeric ?? -1) - Number(left?.fitScoreNumeric ?? -1);
  if (scoreDelta !== 0) return scoreDelta;
  return compareFallback(left, right);
}

function sortRowsForRtings(rows, sortBy = 'fit-score-desc') {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (sortBy === 'verified-first') return list.sort(compareVerification);
  if (sortBy === 'price-asc') {
    return list.sort((left, right) => {
      const leftPrice = getComparablePrice(left);
      const rightPrice = getComparablePrice(right);
      if (leftPrice === null && rightPrice !== null) return 1;
      if (leftPrice !== null && rightPrice === null) return -1;
      if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) return leftPrice - rightPrice;
      return compareFitScoreDesc(left, right);
    });
  }
  if (sortBy === 'price-desc') {
    return list.sort((left, right) => {
      const leftPrice = getComparablePrice(left);
      const rightPrice = getComparablePrice(right);
      if (leftPrice === null && rightPrice !== null) return 1;
      if (leftPrice !== null && rightPrice === null) return -1;
      if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) return rightPrice - leftPrice;
      return compareFitScoreDesc(left, right);
    });
  }
  if (sortBy === 'stars') {
    return list.sort((left, right) => {
      const delta = Number(right?.stars ?? 0) - Number(left?.stars ?? 0);
      return delta !== 0 ? delta : compareFitScoreDesc(left, right);
    });
  }
  if (sortBy === 'brand') {
    return list.sort((left, right) => {
      const delta = String(left?.brand ?? '').localeCompare(String(right?.brand ?? ''));
      return delta !== 0 ? delta : compareFitScoreDesc(left, right);
    });
  }
  return list.sort(compareFitScoreDesc);
}

function normalizeDensity(value) {
  const next = String(value ?? '').trim();
  return ['compact', 'standard', 'detailed'].includes(next) ? next : 'standard';
}

const api = {
  DEFAULT_SLIDER_FACETS,
  applySliderFilters,
  getComparablePrice,
  isVerifiedFit,
  normalizeDensity,
  normalizeSliderFacets,
  sortRowsForRtings
};

if (typeof globalThis !== 'undefined') {
  globalThis.RangeFilters = api;
}

export {
  DEFAULT_SLIDER_FACETS,
  applySliderFilters,
  getComparablePrice,
  isVerifiedFit,
  normalizeDensity,
  normalizeSliderFacets,
  sortRowsForRtings
};

export default api;
