'use strict';

function normalizeKey(value) {
  return (value ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toNumber(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const normalized = rawValue.toString().replace(/[^0-9.\-]/g, '');
  if (normalized === '') {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(rawValue) {
  const parsed = toNumber(rawValue);
  if (parsed === null) {
    return null;
  }

  return Math.round(parsed);
}

module.exports = {
  normalizeKey,
  toInteger,
  toNumber
};
