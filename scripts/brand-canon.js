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

function canonicalizeProducts(products, canonDocument = loadCanon()) {
  return filterByBrandCanon(products, canonDocument).map((product) => ({
    ...product,
    brand: canonicalizeBrand(product?.brand, canonDocument)
  }));
}

function canonicalizeRuleMap(ruleMap, canonDocument = loadCanon()) {
  if (!ruleMap || typeof ruleMap !== 'object') return {};

  const output = {};
  for (const [rawBrand, rule] of Object.entries(ruleMap)) {
    if (rawBrand === '__default__') {
      output.__default__ = rule;
      continue;
    }

    const canonicalBrand = canonicalizeBrand(rawBrand, canonDocument);
    if (!canonicalBrand) continue;
    if (!Object.hasOwn(output, canonicalBrand) || rawBrand === canonicalBrand) {
      output[canonicalBrand] = rule;
    }
  }

  return output;
}

function canonicalizeRuleDocument(rulesDocument, canonDocument = loadCanon()) {
  if (!rulesDocument || typeof rulesDocument !== 'object') return {};

  return Object.fromEntries(
    Object.entries(rulesDocument).map(([category, ruleMap]) => [
      category,
      canonicalizeRuleMap(ruleMap, canonDocument)
    ])
  );
}

module.exports = {
  canonicalizeBrand,
  canonicalizeProducts,
  canonicalizeRuleDocument,
  canonicalizeRuleMap,
  filterByBrandCanon,
  isDroppedBrand,
  loadCanon
};
