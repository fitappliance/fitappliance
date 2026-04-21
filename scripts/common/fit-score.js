'use strict';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getClearance(defaults, category) {
  const row = defaults?.[category] ?? {};
  return {
    rear: Number.isFinite(Number(row.rear)) ? Number(row.rear) : 0,
    sides: Number.isFinite(Number(row.sides)) ? Number(row.sides) : 0,
    top: Number.isFinite(Number(row.top)) ? Number(row.top) : 0
  };
}

function computeAxisScore(cavity, appliance, clearanceMm) {
  if (!Number.isFinite(cavity) || cavity <= 0) return null;
  if (!Number.isFinite(appliance) || appliance <= 0) return null;
  const spareMm = cavity - appliance - clearanceMm;
  return clamp(spareMm / cavity, -0.05, 0.5);
}

function buildAxisEntries(product, filters, clearance) {
  const entries = [];
  const cavityW = toFiniteNumber(filters?.w);
  const cavityH = toFiniteNumber(filters?.h);
  const cavityD = toFiniteNumber(filters?.d);

  if (cavityW) {
    entries.push({
      key: 'w',
      cavity: cavityW,
      appliance: Number(product?.w),
      clearanceMm: clearance.sides * 2
    });
  }
  if (cavityH) {
    entries.push({
      key: 'h',
      cavity: cavityH,
      appliance: Number(product?.h),
      clearanceMm: clearance.top
    });
  }
  if (cavityD) {
    entries.push({
      key: 'd',
      cavity: cavityD,
      appliance: Number(product?.d),
      clearanceMm: clearance.rear
    });
  }

  return entries;
}

function computeFitAssessment(product, filters, {
  clearanceDefaults = {}
} = {}) {
  const category = String(filters?.cat ?? product?.cat ?? '');
  const clearance = getClearance(clearanceDefaults, category);
  const axisEntries = buildAxisEntries(product, filters, clearance);

  if (axisEntries.length === 0) {
    return {
      category,
      clearance,
      axisEntries: [],
      axisScores: [],
      fitScore: null,
      sortScore: null,
      threshold: null,
      exactFit: false,
      fitsTightly: false,
      isMatch: false
    };
  }

  const axisScores = axisEntries.map((entry) => computeAxisScore(entry.cavity, entry.appliance, entry.clearanceMm));
  const minAxis = Math.min(...axisScores);
  const sortScore = axisScores.reduce((sum, score) => sum + score, 0) / axisScores.length;
  const cavityMin = Math.min(...axisEntries.map((entry) => entry.cavity));
  const toleranceMm = Number.isFinite(Number(filters?.toleranceMm)) ? Number(filters.toleranceMm) : 0;
  const threshold = -(toleranceMm / cavityMin);
  const exactFit = axisScores.every((score) => score >= 0);
  const fitsTightly = axisScores.some((score) => score < 0.02);
  const isMatch = minAxis >= threshold;

  return {
    category,
    clearance,
    axisEntries,
    axisScores,
    fitScore: minAxis,
    sortScore,
    threshold,
    exactFit,
    fitsTightly,
    isMatch
  };
}

module.exports = {
  buildAxisEntries,
  clamp,
  computeAxisScore,
  computeFitAssessment,
  getClearance,
  toFiniteNumber
};
