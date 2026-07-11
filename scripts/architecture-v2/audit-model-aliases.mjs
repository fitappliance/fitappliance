#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAliasRegistry } from '../../src/domain/model-alias.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function sortedCounts(values, initial = {}) {
  const counts = { ...initial };
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function auditAliasRegistry(registryDocument, dispositionDocument) {
  const registry = createAliasRegistry(registryDocument);
  if (!dispositionDocument || !Array.isArray(dispositionDocument.products)) {
    throw new TypeError('disposition document must contain a products array');
  }
  const aliasIds = new Set(registry.aliases.map((alias) => alias.id));
  const referencedAliasIds = new Set(dispositionDocument.products.map((row) => row?.aliasId).filter(Boolean));
  const missingAliasReferences = dispositionDocument.products
    .filter((row) => row?.aliasId && !aliasIds.has(row.aliasId))
    .map((row) => ({ legacyId: String(row.legacyId || ''), aliasId: row.aliasId }))
    .sort((left, right) => left.legacyId.localeCompare(right.legacyId));
  const unreferencedApprovedAliasIds = registry.aliases
    .filter((alias) => alias.status === 'approved' && !referencedAliasIds.has(alias.id))
    .map((alias) => alias.id)
    .sort();
  const approvedFields = Object.fromEntries(registry.aliases
    .filter((alias) => alias.status === 'approved')
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((alias) => [alias.id, [...alias.approved_fields]]));

  return freezeDeep({
    schemaVersion: 1,
    totalAliases: registry.aliases.length,
    statusCounts: sortedCounts(registry.aliases.map((alias) => alias.status), {
      approved: 0,
      pending: 0,
      rejected: 0,
      superseded: 0,
    }),
    dispositionCounts: sortedCounts(dispositionDocument.products.map((row) => String(row?.disposition || 'missing'))),
    approvedFields,
    missingAliasReferences,
    unreferencedApprovedAliasIds,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function main(args) {
  if (args.length > 0) throw new TypeError('model alias audit accepts no arguments');
  const registry = readJson(path.join(repoRoot, 'data/model-aliases.json'));
  const disposition = readJson(path.join(repoRoot, 'reports/architecture-v2/phase1-quarantine-disposition.json'));
  const result = auditAliasRegistry(registry, disposition);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.missingAliasReferences.length > 0) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
