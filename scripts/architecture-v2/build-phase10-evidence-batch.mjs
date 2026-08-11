#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildActiveEvidenceBatch } from '../../src/domain/active-evidence-batch.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [input, catalog, sourceRegistry, phase08] = await Promise.all([
  readJson(resolveArchitectureV2Path(root, 'phase10SelectionInput')),
  readJson(resolveArchitectureV2Path(root, 'publicProjection')),
  readJson(resolveArchitectureV2Path(root, 'sourceDocuments')),
  readJson(resolveArchitectureV2Path(root, 'phase08Selection')),
]);
const output = buildActiveEvidenceBatch({
  selectedAt: input.selectedAt,
  selectionBasis: input.selectionBasis,
  selectedLegacyIds: input.legacyRuntimeIds,
  products: catalog.products,
  sourceDocuments: sourceRegistry.documents,
  excludedLegacyIds: new Set(phase08.products.map((row) => row.legacyRuntimeId)),
  categoryTargets: input.categoryTargets,
  categoryBrandLimit: input.categoryBrandLimit,
  globalBrandLimit: input.globalBrandLimit,
  maximumObservationAgeDays: input.maximumObservationAgeDays,
});
await writeFile(resolveArchitectureV2Path(root, 'phase10EvidenceBatch'), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output.summary, null, 2)}\n`);
