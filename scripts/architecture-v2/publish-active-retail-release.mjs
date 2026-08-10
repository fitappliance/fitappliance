#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { sanitizePrivateRetailerFeedPublication } from '../../src/domain/public-projection.mjs';
import { runFitPublicationAudit } from './audit-fit-publication.mjs';
import { runHistoricalReplacementAudit } from './audit-historical-replacement.mjs';
import { validateCandidateReference } from './build-retail-lifecycle-release-candidate.mjs';
import { publishHistoricalReference } from './publish-historical-reference.mjs';
import runtimePublisher from './publish-runtime-projection.js';

const { publishRuntimeProjection } = runtimePublisher;
const defaultRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function semanticSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

async function verifyPublishedRuntime(root, expectedCatalog) {
  const [runtime, marker] = await Promise.all([
    readFile(resolve(root, 'public/data/appliances.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'public/data/catalog-projection.json'), 'utf8').then(JSON.parse),
  ]);
  if (semanticSha256(runtime) !== semanticSha256(expectedCatalog)) {
    throw new Error('published runtime catalogue differs from active release');
  }
  if (marker.activeProjection !== 'v2' || marker.productCount !== expectedCatalog.products.length) {
    throw new Error('published runtime marker differs from active release');
  }
}

export async function auditActiveRetailRelease({ root = defaultRoot, publish = false } = {}) {
  const release = await loadActiveRetailRelease({ root });
  const publicCatalog = sanitizePrivateRetailerFeedPublication(release.catalog);
  validateCandidateReference(release.reference, release.catalog);
  const publicationManifestPath = resolve(
    release.releaseDirectory,
    'historical-reference-publication-manifest.json',
  );
  const historicalAuditPath = resolve(release.releaseDirectory, 'historical-replacement-audit.json');
  const fitAuditPath = resolve(release.releaseDirectory, 'fit-publication-audit.json');

  if (publish) {
    await publishRuntimeProjection({ root, catalog: publicCatalog });
    await publishHistoricalReference({
      repoRoot: root,
      referencePath: release.paths.reference,
      manifestPath: publicationManifestPath,
    });
  }
  await verifyPublishedRuntime(root, publicCatalog);
  const historicalAudit = await runHistoricalReplacementAudit({
    repoRoot: root,
    referencePath: release.paths.reference,
    manifestPath: publicationManifestPath,
    catalogPath: release.paths.catalog,
    auditPath: historicalAuditPath,
  });
  const fitAudit = await runFitPublicationAudit({
    root,
    projectionPath: release.paths.catalog,
    outputPath: fitAuditPath,
  });
  const fitViolations = fitAudit.summary.violations + fitAudit.installation.summary.violations;
  if (historicalAudit.issues.length > 0 || fitViolations > 0) {
    throw new Error('active retail release publication audit failed');
  }
  return Object.freeze({
    releaseCandidateId: release.descriptor.releaseCandidateId,
    products: publicCatalog.products.length,
    currentRetailProducts: publicCatalog.products.filter((product) => (
      product.unavailable === false
    )).length,
    historicalReferenceRecords: release.reference.records.length,
    historicalReplacementIssues: historicalAudit.issues.length,
    fitPublicationViolations: fitViolations,
  });
}

export async function runCli(args = process.argv.slice(2)) {
  if (args.some((argument) => argument !== '--audit-only')) {
    throw new TypeError(`unknown argument: ${args.find((argument) => argument !== '--audit-only')}`);
  }
  const result = await auditActiveRetailRelease({ publish: !args.includes('--audit-only') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
