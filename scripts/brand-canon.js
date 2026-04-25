'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CANON_PATH = path.join(__dirname, '..', 'data', 'brand-canon.json');

let cachedCanon = null;
let cachedCanonPath = null;

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function loadCanon({ canonPath = DEFAULT_CANON_PATH, refresh = false } = {}) {
  if (!refresh && cachedCanon && cachedCanonPath === canonPath) {
    return cachedCanon;
  }

  const document = JSON.parse(fs.readFileSync(canonPath, 'utf8'));
  cachedCanon = document;
  cachedCanonPath = canonPath;
  return document;
}

function buildAliasIndex(canonDocument) {
  const aliasMap = canonDocument?.policies?.alias_map ?? {};
  const index = new Map();

  for (const [source, target] of Object.entries(aliasMap)) {
    index.set(normalizeKey(source), target);
  }

  return index;
}

function canonicalizeBrand(brand, canonDocument = loadCanon()) {
  const trimmed = String(brand ?? '').trim();
  if (!trimmed) return '';

  const aliasIndex = buildAliasIndex(canonDocument);
  return aliasIndex.get(normalizeKey(trimmed)) ?? trimmed;
}

function isDroppedBrand(brand, canonDocument = loadCanon()) {
  const dropBrands = canonDocument?.policies?.drop_brands ?? [];
  if (!dropBrands.length) return false;

  const canonical = canonicalizeBrand(brand, canonDocument);
  const dropSet = new Set(dropBrands.map((item) => normalizeKey(item)));
  return dropSet.has(normalizeKey(canonical));
}

function filterByBrandCanon(products, canonDocument = loadCanon()) {
  if (!Array.isArray(products)) return [];

  const dropBrands = canonDocument?.policies?.drop_brands ?? [];
  if (!dropBrands.length) return [...products];

  return products.filter((product) => !isDroppedBrand(product?.brand, canonDocument));
}

module.exports = {
  canonicalizeBrand,
  filterByBrandCanon,
  isDroppedBrand,
  loadCanon
};
