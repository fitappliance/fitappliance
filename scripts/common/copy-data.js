'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { slugNormalize } = require('./slug-normalize.js');

const cache = new Map();

async function readJsonCached(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  cache.set(filePath, value);
  return value;
}

async function loadCopyFile(name, repoRoot = path.resolve(__dirname, '..', '..')) {
  const filePath = path.join(repoRoot, 'data', 'copy', `${name}.json`);
  return readJsonCached(filePath);
}

function fillTemplate(template, values = {}) {
  return String(template ?? '').replace(/\{([^}]+)\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return '';
    return String(values[key] ?? '');
  });
}

function copyKeyForBrandCategory(brand, category) {
  return `${slugNormalize(brand)}_${String(category ?? '').trim()}`;
}

function pickVariant(rows, seedNumber = 0) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const index = Math.abs(Number(seedNumber) || 0) % rows.length;
  return rows[index];
}

module.exports = {
  copyKeyForBrandCategory,
  fillTemplate,
  loadCopyFile,
  pickVariant
};
