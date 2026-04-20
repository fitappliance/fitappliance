'use strict';

const { slugNormalize } = require('./slug-normalize.js');

function extractModelSku(modelString) {
  if (typeof modelString !== 'string' || !modelString.trim()) return '';
  return modelString.trim().split(/\s+/)[0];
}

function buildModelSlug(brand, model) {
  const sku = extractModelSku(model);
  return slugNormalize(`${String(brand ?? '').trim()} ${sku || String(model ?? '').trim()}`);
}

module.exports = {
  extractModelSku,
  buildModelSlug
};
