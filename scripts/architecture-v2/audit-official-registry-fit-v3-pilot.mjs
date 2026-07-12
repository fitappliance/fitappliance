#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { auditFitV3Pilot } from '../../src/domain/fit-v3-pilot-audit.mjs';
import { verifyRegistrySnapshot } from '../../src/domain/official-registry-snapshot.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const storageRootValue = option('--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
if (!storageRootValue) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT is required for replay audit');
const storageRoot = resolve(storageRootValue);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hashFile = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const withinStorage = (relativePath) => {
  const path = resolve(storageRoot, ...String(relativePath ?? '').split('/'));
  if (!path.startsWith(`${storageRoot}${sep}`)) throw new TypeError('registry object path escapes storage root');
  return path;
};

const baseline = await readJson(resolveArchitectureV2Path(root, 'officialRegistryFitV3Baseline'));
const snapshots = await readJson(resolveArchitectureV2Path(root, 'officialRegistrySnapshots'));
const reconciliation = await readJson(resolveArchitectureV2Path(root, 'officialRegistryReconciliation'));
const pilot = await readJson(resolveArchitectureV2Path(root, 'installationKnowledgePilot'));
const researchQueue = await readJson(resolveArchitectureV2Path(root, 'installationResearchQueue'));
const fitV3Audit = await readJson(resolveArchitectureV2Path(root, 'fitV3ShadowAudit'));
const publicCatalog = await readJson(resolveArchitectureV2Path(root, 'publicProjection'));
const replayViolations = [];
for (const row of snapshots.snapshots) {
  try {
    verifyRegistrySnapshot(row.manifest, await readFile(withinStorage(row.manifest.storage.objectPath)));
  } catch (error) {
    replayViolations.push({ code: 'SNAPSHOT_REPLAY_FAILED', detail: `${row.manifest.sourceId}: ${error.message}` });
  }
}
try {
  const derived = await readFile(withinStorage(reconciliation.fullArtifact.storage.objectPath));
  const hash = createHash('sha256').update(derived).digest('hex');
  if (hash !== reconciliation.fullArtifact.contentSha256 || derived.length !== reconciliation.fullArtifact.byteLength) {
    throw new Error('hash or byte length mismatch');
  }
} catch (error) {
  replayViolations.push({ code: 'FULL_RECONCILIATION_REPLAY_FAILED', detail: error.message });
}
const report = auditFitV3Pilot({
  baseline,
  currentHashes: {
    publicProjection: await hashFile(resolveArchitectureV2Path(root, 'publicProjection')),
    runtimeCatalog: await hashFile(resolve(root, 'data/catalog-final.json')),
    fitPublicationAudit: await hashFile(resolve(root, 'data/architecture-v2/reviews/automated/fit-publication-audit.json')),
  },
  snapshots,
  reconciliation,
  pilot,
  researchQueue,
  fitV3Audit,
  publicCatalog,
});
const output = {
  ...report,
  generatedAt: snapshots.acquiredAt,
  passed: report.passed && replayViolations.length === 0,
  violations: [...report.violations, ...replayViolations],
  summary: { ...report.summary, replayFailures: replayViolations.length },
};
await writeFile(resolveArchitectureV2Path(root, 'officialRegistryFitV3Audit'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary));
if (!output.passed) throw new Error(`Fit V3 pilot audit failed with ${output.violations.length} violation(s)`);
