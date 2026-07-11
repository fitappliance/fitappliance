#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adaptLegacyAppliance } from '../../src/adapters/legacy-appliance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function requireCatalog(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || !Array.isArray(document.products)) {
    throw new TypeError('catalog document must contain a products array');
  }
  return document.products;
}

function requireEvidenceProducts(document) {
  if (document === null || document === undefined) {
    return {};
  }
  if (
    typeof document !== 'object'
    || Array.isArray(document)
    || !document.products
    || typeof document.products !== 'object'
    || Array.isArray(document.products)
  ) {
    throw new TypeError('evidence document must contain a products object');
  }
  return document.products;
}

export function auditCatalog(document, evidenceIndex = null) {
  const products = requireCatalog(document);
  const evidenceProducts = requireEvidenceProducts(evidenceIndex);
  const idCounts = new Map();
  for (const product of products) {
    const id = product?.id;
    if (typeof id === 'string' && id) {
      increment(idCounts, id);
    }
  }

  const statusCounts = { adapted: 0, quarantined: 0 };
  const categoryCounts = new Map();
  const warningCounts = new Map();
  const errorCounts = new Map();
  const evidenceCounts = { matched: 0, missing: 0 };
  const quarantinedProducts = [];

  for (const product of products) {
    const legacyId = typeof product?.id === 'string' ? product.id : '';
    const category = typeof product?.cat === 'string' && product.cat ? product.cat : 'unknown';
    const evidenceMatched = Object.hasOwn(evidenceProducts, legacyId);
    evidenceCounts[evidenceMatched ? 'matched' : 'missing'] += 1;

    const duplicate = legacyId && idCounts.get(legacyId) > 1;
    const adapted = duplicate
      ? {
          status: 'quarantined',
          warnings: [],
          errors: ['duplicate_legacy_id'],
        }
      : adaptLegacyAppliance({
          product,
          evidence: evidenceMatched ? evidenceProducts[legacyId] : null,
        });

    statusCounts[adapted.status] += 1;
    const categoryCount = categoryCounts.get(category) ?? { total: 0, adapted: 0, quarantined: 0 };
    categoryCount.total += 1;
    categoryCount[adapted.status] += 1;
    categoryCounts.set(category, categoryCount);

    for (const warning of adapted.warnings) {
      increment(warningCounts, warning);
    }
    for (const error of adapted.errors) {
      increment(errorCounts, error.split(':', 1)[0]);
    }
    if (adapted.status === 'quarantined') {
      quarantinedProducts.push({
        legacyId,
        category,
        errors: [...adapted.errors],
      });
    }
  }

  quarantinedProducts.sort((left, right) => (
    left.legacyId.localeCompare(right.legacyId) || left.category.localeCompare(right.category)
  ));
  return freezeDeep({
    schemaVersion: 1,
    totalProducts: products.length,
    statusCounts,
    categories: sortedObject(categoryCounts),
    warningCounts: sortedObject(warningCounts),
    errorCounts: sortedObject(errorCounts),
    evidenceCounts,
    quarantinedProducts,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function main(args) {
  if (args.length > 0) {
    throw new TypeError('shadow audit accepts no arguments or output path');
  }
  const catalog = readJson(path.join(repoRoot, 'data/architecture-v2/public-catalog-projection.json'));
  const evidencePath = path.join(repoRoot, 'public/data/evidence-index.json');
  const evidence = existsSync(evidencePath) ? readJson(evidencePath) : null;
  process.stdout.write(`${JSON.stringify(auditCatalog(catalog, evidence), null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
