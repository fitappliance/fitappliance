#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import runtimePublisher from './publish-runtime-projection.js';
import productPageGenerator from '../generate-product-pages.js';
import promotionKitGenerator from '../generate-promotion-kit.js';
import { publishHistoricalReference } from './publish-historical-reference.mjs';
import { runHistoricalReplacementAudit } from './audit-historical-replacement.mjs';
import { runFitPublicationAudit } from './audit-fit-publication.mjs';

const { publishRuntimeProjection } = runtimePublisher;
const { generateProductPages } = productPageGenerator;
const { generatePromotionKit } = promotionKitGenerator;
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PREVIEW_PAGE_GENERATORS = Object.freeze([
  'scripts/pick-review-pilot.js',
  'scripts/generate-ui-copy.js',
  'scripts/generate-comparisons.js',
  'scripts/generate-compare-vs-pages.js',
  'scripts/generate-brand-pages.js',
  'scripts/inject-video-schema.js',
  'scripts/generate-cavity-pages.js',
  'scripts/generate-doorway-pages.js',
  'scripts/generate-guides.js',
  'scripts/generate-location-pages.js',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validatePreviewInputs({ manifest, candidateBytes, referenceBytes }) {
  if (manifest?.authorization?.status !== 'READY_FOR_CUTOVER') {
    throw new Error('retail lifecycle release candidate is not authorized for preview');
  }
  const candidateSha256 = sha256(candidateBytes);
  const historicalReferenceSha256 = sha256(referenceBytes);
  if (manifest?.sourceBindings?.finalCandidateProjectionSha256 !== candidateSha256) {
    throw new Error('candidate projection hash does not match release manifest');
  }
  if (manifest?.sourceBindings?.historicalReferenceCandidateSha256 !== historicalReferenceSha256) {
    throw new Error('candidate historical reference hash does not match release manifest');
  }
  return {
    releaseCandidateId: String(manifest.releaseCandidateId),
    candidateSha256,
    historicalReferenceSha256,
  };
}

function runNodeScript(repoRoot, script) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(repoRoot, script)], {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${script} failed with ${signal ? `signal ${signal}` : `exit ${code}`}`));
    });
  });
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function buildRetailCutoverPreview({ repoRoot = defaultRoot } = {}) {
  const candidatePath = resolveArchitectureV2Path(repoRoot, 'publicProjectionReleaseCandidate');
  const referencePath = resolveArchitectureV2Path(repoRoot, 'historicalApplianceReferenceReleaseCandidate');
  const releaseManifestPath = resolveArchitectureV2Path(repoRoot, 'retailLifecycleReleaseCandidate');
  const reportRoot = resolve(repoRoot, 'reports/release-candidate-qa');
  const publicationManifestPath = resolve(reportRoot, 'candidate-historical-reference-publication-manifest.json');
  const historicalAuditPath = resolve(reportRoot, 'candidate-historical-replacement-audit.json');
  const fitAuditPath = resolve(reportRoot, 'candidate-fit-publication-audit.json');
  const buildReportPath = resolve(reportRoot, 'candidate-build.json');
  const [candidateBytes, referenceBytes, manifest] = await Promise.all([
    readFile(candidatePath),
    readFile(referencePath),
    readFile(releaseManifestPath, 'utf8').then(JSON.parse),
  ]);
  const bindings = validatePreviewInputs({ manifest, candidateBytes, referenceBytes });
  const candidate = JSON.parse(candidateBytes);

  await runNodeScript(repoRoot, 'scripts/vendor-fit-engine.js');
  await runNodeScript(repoRoot, 'scripts/vendor-web-vitals.js');
  await publishRuntimeProjection({ root: repoRoot, catalog: candidate });
  await publishHistoricalReference({ repoRoot, referencePath, manifestPath: publicationManifestPath });

  for (const script of PREVIEW_PAGE_GENERATORS) {
    await runNodeScript(repoRoot, script);
  }
  await generateProductPages({ repoRoot, catalogPath: candidatePath });
  await generatePromotionKit({
    repoRoot,
    today: String(manifest.generatedAt).slice(0, 10),
  });
  await runNodeScript(repoRoot, 'scripts/sync-retailer-metrics-docs.js');
  await runNodeScript(repoRoot, 'scripts/generate-sitemap.js');
  await runNodeScript(repoRoot, 'scripts/generate-sw.js');

  const historicalAudit = await runHistoricalReplacementAudit({
    repoRoot,
    referencePath,
    manifestPath: publicationManifestPath,
    catalogPath: candidatePath,
    auditPath: historicalAuditPath,
  });
  const fitAudit = await runFitPublicationAudit({
    root: repoRoot,
    projectionPath: candidatePath,
    outputPath: fitAuditPath,
  });
  const currentProducts = candidate.products.filter((product) => (
    product?.retailLifecycle?.lifecycleState === 'CURRENT_RETAIL'
  )).length;
  const report = {
    schemaVersion: 1,
    ...bindings,
    products: candidate.products.length,
    currentRetailProducts: currentProducts,
    historicalReferenceRecords: JSON.parse(referenceBytes).records.length,
    historicalReplacementIssues: historicalAudit.issues.length,
    fitPublicationViolations: fitAudit.summary.violations + fitAudit.installation.summary.violations,
    outputs: {
      publicationManifest: 'reports/release-candidate-qa/candidate-historical-reference-publication-manifest.json',
      historicalAudit: 'reports/release-candidate-qa/candidate-historical-replacement-audit.json',
      fitAudit: 'reports/release-candidate-qa/candidate-fit-publication-audit.json',
    },
  };
  await atomicJson(buildReportPath, report);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildRetailCutoverPreview().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
