'use strict';

function normalizeRetailerPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return rounded >= 1 && rounded <= 100000 ? rounded : null;
}

module.exports = { normalizeRetailerPrice };
