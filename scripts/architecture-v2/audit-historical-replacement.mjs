#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  assertHistoricalReplacementAudit,
  auditHistoricalReplacement,
} from '../../src/domain/historical-replacement-audit.mjs';
import { HISTORICAL_REFERENCE_PUBLIC_FILES } from '../../src/domain/historical-reference-publication.mjs';
import { hashHistoricalCatalogBinding } from '../../src/domain/historical-catalog-binding.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

function runtimeCanary({ catalog, replacementEngineSource, searchCoreSource }) {
  const context = vm.createContext({ URL, URLSearchParams });
  context.FitEngine = {
    evaluateFit() {
      throw new Error('Replacement runtime attempted to call FitEngine');
    },
  };
  vm.runInContext(replacementEngineSource, context, { filename: 'replacement-match-engine.js' });
  vm.runInContext(searchCoreSource, context, { filename: 'search-core.js' });
  const sample = catalog.products.find((product) => (
    context.SearchCore.isCurrentProduct(product)
    && [product?.w, product?.h, product?.d].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    && ['fridge', 'dishwasher', 'dryer', 'washing_machine'].includes(product?.cat)
  ));
  if (!sample) return [];
  return context.SearchCore.findSearchMatches(catalog.products, {
    cat: sample.cat,
    w: sample.w,
    h: sample.h,
    d: sample.d,
    searchMode: 'replacement',
    replacementSourceCategory: sample.cat,
  }, { limit: 5 });
}

export async function runHistoricalReplacementAudit({ repoRoot }) {
  const referencePath = resolveArchitectureV2Path(repoRoot, 'historicalApplianceReference');
  const manifestPath = resolveArchitectureV2Path(repoRoot, 'historicalReferencePublicationManifest');
  const catalogPath = resolveArchitectureV2Path(repoRoot, 'publicProjection');
  const auditPath = resolveArchitectureV2Path(repoRoot, 'historicalReplacementAudit');
  const publicRoot = resolve(repoRoot, 'public/data/replacement-reference');
  const replacementEnginePath = resolve(repoRoot, 'public/scripts/replacement-match-engine.js');
  const searchCorePath = resolve(repoRoot, 'public/scripts/search-core.js');
  const [referenceBytes, manifestBytes, catalogBytes, sitemapXml, publicMetaBytes, replacementEngineSource, searchCoreSource] = await Promise.all([
    readFile(referencePath),
    readFile(manifestPath),
    readFile(catalogPath),
    readFile(resolve(repoRoot, 'public/sitemap.xml'), 'utf8'),
    readFile(resolve(publicRoot, 'meta.json')),
    readFile(replacementEnginePath, 'utf8'),
    readFile(searchCorePath, 'utf8'),
  ]);
  const reference = JSON.parse(referenceBytes);
  const publicationManifest = JSON.parse(manifestBytes);
  const publicCatalog = JSON.parse(catalogBytes);
  const publicDocuments = {};
  const publicBytesByCategory = {};
  for (const [category, filename] of Object.entries(HISTORICAL_REFERENCE_PUBLIC_FILES)) {
    const bytes = await readFile(resolve(publicRoot, filename));
    publicBytesByCategory[category] = bytes;
    publicDocuments[category] = JSON.parse(bytes);
  }
  const runtimeReplacementRows = runtimeCanary({
    catalog: publicCatalog,
    replacementEngineSource,
    searchCoreSource,
  });
  const audit = auditHistoricalReplacement({
    reference,
    publicationManifest,
    publicDocuments,
    publicBytesByCategory,
    publicMetaBytes,
    publicCatalog,
    currentCatalogBindingSha256: hashHistoricalCatalogBinding(publicCatalog),
    sitemapXml,
    replacementEngineSource,
    runtimeReplacementRows,
    canaryExpectations: [
      {
        id: 'electrolux-eqe6160ba-axis-swap',
        category: 'fridge',
        brand: 'Electrolux',
        modelKey: 'EQE6160BA',
        evidenceState: 'CATALOG_RECEIPT',
        lookupAction: 'AUTO_FILL',
        registryDimensionState: 'AXIS_SUSPECT',
        dimensionsMm: { width: 913, height: 1782, depth: 749 },
      },
      {
        id: 'westinghouse-whe5264sc-axis-swap',
        category: 'fridge',
        brand: 'Westinghouse',
        modelKey: 'WHE5264SC',
        evidenceState: 'CATALOG_RECEIPT',
        lookupAction: 'AUTO_FILL',
        registryDimensionState: 'AXIS_SUSPECT',
        dimensionsMm: { width: 796, height: 1725, depth: 769 },
      },
      {
        id: 'haier-hdw15f3s1-confirm-only',
        category: 'dishwasher',
        brand: 'Haier',
        modelKey: 'HDW15F3S1',
        evidenceState: 'REGISTRY_CONSISTENT',
        lookupAction: 'CONFIRM_REQUIRED',
        registryDimensionState: 'CONSISTENT',
        dimensionsMm: { width: 598, height: 850, depth: 610 },
      },
    ],
  });
  await atomicJson(auditPath, audit);
  assertHistoricalReplacementAudit(audit);
  return audit;
}

export async function runCli() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const audit = await runHistoricalReplacementAudit({ repoRoot });
  process.stdout.write(`${JSON.stringify({ ok: audit.ok, ...audit.summary, canaries: audit.canaries }, null, 2)}\n`);
  return audit;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
