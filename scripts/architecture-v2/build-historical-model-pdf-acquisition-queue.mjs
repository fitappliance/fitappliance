#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildActiveHistoricalEvidenceScope,
} from '../../src/domain/active-historical-evidence-scope.mjs';
import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { buildHistoricalModelPdfAcquisitionQueue } from '../../src/domain/historical-model-pdf-acquisition.mjs';
import { resolverAdapterIdsForBrand } from '../pdf-pipeline/architecture-v2-resolver-adapters.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(key) {
  return JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli() {
  const [classification, activeRelease, recoveryQueue, offlineReplayQueue,
    offlineReplayResults, identityResearchQueue] = await Promise.all([
    readJson('historicalModelEvidenceClassification'),
    loadActiveRetailRelease({ root }),
    readJson('historicalEvidenceRecoveryQueue'),
    readJson('historicalPdfOfflineReplayQueue'),
    readJson('historicalPdfOfflineReplayResults'),
    readJson('identityResearchQueue'),
  ]);
  const activeScope = buildActiveHistoricalEvidenceScope(activeRelease);
  if (canonicalJsonSha256(classification.sourceBindings)
    !== canonicalJsonSha256(activeScope.sourceBindings)) {
    throw new Error('classification active-release source binding drift');
  }
  const historicalReference = {
    ...activeRelease.reference,
    records: activeScope.records,
  };
  const publicProjection = activeRelease.catalog;
  const brands = [...new Set(classification.records.map((record) => record.canonicalBrand))];
  const resolverIdsByBrand = new Map(brands.map((brand) => [
    brand.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    resolverAdapterIdsForBrand(brand),
  ]));
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification,
    historicalReference,
    catalogProducts: publicProjection.products,
    recoveryQueue,
    offlineReplayQueue,
    offlineReplayResults,
    identityResearchQueue,
    identityMigration: null,
    catalogProjectionSemanticSha256: canonicalJsonSha256(publicProjection),
    resolverIdsByBrand,
    generatedAt: classification.generatedAt,
  });
  const output = resolveArchitectureV2Path(root, 'historicalModelPdfAcquisitionQueue');
  await atomicJson(output, queue);
  process.stdout.write(`${JSON.stringify({ output, ...queue.summary }, null, 2)}\n`);
  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
