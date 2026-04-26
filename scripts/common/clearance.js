'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MODES_PATH = path.join(__dirname, '..', '..', 'data', 'clearance-modes.json');

let cachedModes = null;

function normalizeClearance(row) {
  const side = Number(row?.side ?? row?.sides ?? 0);
  const top = Number(row?.top ?? 0);
  const rear = Number(row?.rear ?? 0);
  return {
    side: Number.isFinite(side) ? side : 0,
    top: Number.isFinite(top) ? top : 0,
    rear: Number.isFinite(rear) ? rear : 0
  };
}

function loadClearanceModes() {
  if (cachedModes) return cachedModes;
  cachedModes = JSON.parse(fs.readFileSync(MODES_PATH, 'utf8'));
  return cachedModes;
}

function normalizeMode(mode, modesDoc = loadClearanceModes()) {
  const value = String(mode ?? '').trim();
  return Object.prototype.hasOwnProperty.call(modesDoc.modes ?? {}, value)
    ? value
    : modesDoc.default_mode;
}

function getManufacturerClearance(category, brand, brandSpecific = {}) {
  const cat = brandSpecific?.[category] ?? {};
  return cat?.[brand] ?? cat?.__default__ ?? null;
}

function getEffectiveClearance(category, brand, mode, brandSpecific = {}) {
  const modesDoc = loadClearanceModes();
  const nextMode = normalizeMode(mode, modesDoc);
  if (nextMode === 'manufacturer') {
    return normalizeClearance(getManufacturerClearance(category, brand, brandSpecific));
  }
  return normalizeClearance(modesDoc.modes[nextMode]);
}

module.exports = {
  getEffectiveClearance,
  loadClearanceModes,
  normalizeClearance,
  normalizeMode
};
