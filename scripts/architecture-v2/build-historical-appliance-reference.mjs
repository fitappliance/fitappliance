#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { normalizeEnergyRatingRows } from '../../src/domain/energy-rating-registry.mjs';
import { buildHistoricalApplianceReference } from '../../src/domain/historical-appliance-reference.mjs';
import { buildHistoricalEvidencePublication } from '../../src/domain/historical-evidence-publication.mjs';
import { filterHistoricalAcceptanceBundleByReceiptReplayAudit } from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { hashHistoricalCatalogBinding } from '../../src/domain/historical-catalog-binding.mjs';
import { parseRegistryCsv, verifyRegistrySnapshot } from '../../src/domain/official-registry-snapshot.mjs';
import brandCanon from '../brand-canon.js';

export const HISTORICAL_REFERENCE_CATEGORIES = Object.freeze([
  'fridge',
  'dishwasher',
  'dryer',
  'washing_machine',
]);

function requireStorageRoot(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT is required');
  return resolve(raw);
}

function storageObjectPath(storageRoot, relativePath) {
  const root = requireStorageRoot(storageRoot);
  const segments = String(relativePath ?? '').split('/').filter(Boolean);
  const absolutePath = resolve(root, ...segments);
  if (!absolutePath.startsWith(`${root}${sep}`)) {
    throw new TypeError('registry object path escapes storage root');
  }
  return absolutePath;
}

function snapshotBySourceId(snapshotsDocument) {
  if (!snapshotsDocument || !Array.isArray(snapshotsDocument.snapshots)) {
    throw new TypeError('official registry snapshots must contain a snapshots array');
  }
  const bySourceId = new Map();
  for (const snapshot of snapshotsDocument.snapshots) {
    const sourceId = String(snapshot?.manifest?.sourceId ?? '').trim();
    if (!sourceId) continue;
    if (bySourceId.has(sourceId)) throw new TypeError(`duplicate registry snapshot ${sourceId}`);
    bySourceId.set(sourceId, snapshot);
  }
  return bySourceId;
}

export async function buildHistoricalReferenceFromOfficialSnapshots({
  snapshotsDocument,
  catalog,
  historicalEvidenceProjection = null,
  lifecycleMode = 'OBSERVATION_DECISIONS',
  storageRoot,
  canonicalizeBrand = brandCanon.canonicalizeBrand,
}) {
  const root = requireStorageRoot(storageRoot);
  if (!catalog || !Array.isArray(catalog.products)) {
    throw new TypeError('public catalog must contain a products array');
  }
  if (Number.isNaN(Date.parse(snapshotsDocument?.acquiredAt))) {
    throw new TypeError('official registry snapshots acquiredAt must be an ISO timestamp');
  }

  const snapshots = snapshotBySourceId(snapshotsDocument);
  const observations = [];
  for (const category of HISTORICAL_REFERENCE_CATEGORIES) {
    const sourceId = `energy-rating:${category}`;
    const snapshot = snapshots.get(sourceId);
    if (!snapshot) throw new Error(`missing registry snapshot ${sourceId}`);
    if (snapshot.category && snapshot.category !== category) {
      throw new Error(`registry snapshot category mismatch for ${sourceId}`);
    }
    const objectPath = storageObjectPath(root, snapshot.manifest?.storage?.objectPath);
    const bytes = await readFile(objectPath);
    verifyRegistrySnapshot(snapshot.manifest, bytes);
    observations.push(...normalizeEnergyRatingRows(parseRegistryCsv(bytes), {
      category,
      sourceId,
      snapshotSha256: snapshot.manifest.contentSha256,
      canonicalizeBrand,
    }));
  }

  const catalogSnapshotSha256 = hashHistoricalCatalogBinding(catalog);
  return buildHistoricalApplianceReference({
    observations,
    catalogProducts: catalog.products,
    historicalEvidenceProjection,
    lifecycleMode,
    catalogSnapshotSha256,
    generatedAt: snapshotsDocument.acquiredAt,
  });
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export async function runCli(args = process.argv.slice(2), environment = process.env) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const storageRoot = requireStorageRoot(option(args, '--storage-root') ?? environment.FITAPPLIANCE_STORAGE_ROOT);
  const snapshotsPath = resolveArchitectureV2Path(repoRoot, 'officialRegistrySnapshots');
  const catalogPath = resolveArchitectureV2Path(repoRoot, 'publicProjection');
  const recoveryBundlePath = resolveArchitectureV2Path(
    repoRoot, 'historicalEvidenceRecoveryAcceptanceBundle',
  );
  const receiptReplayAuditPath = resolveArchitectureV2Path(
    repoRoot, 'historicalAcceptanceReceiptReplayAudit',
  );
  const outputPath = resolveArchitectureV2Path(repoRoot, 'historicalApplianceReference');
  const [snapshotsBytes, catalogText, recoveryBundleText, receiptReplayAuditText] = await Promise.all([
    readFile(snapshotsPath),
    readFile(catalogPath, 'utf8'),
    readFile(recoveryBundlePath, 'utf8'),
    readFile(receiptReplayAuditPath, 'utf8'),
  ]);
  const catalog = JSON.parse(catalogText);
  const safeRecoveryBundle = filterHistoricalAcceptanceBundleByReceiptReplayAudit(
    JSON.parse(recoveryBundleText),
    JSON.parse(receiptReplayAuditText),
  ).bundle;
  const recoveryPublication = buildHistoricalEvidencePublication({
    bundle: safeRecoveryBundle,
    products: catalog.products,
    lifecycleMode: 'LEGACY_BASELINE',
  });
  const artifact = await buildHistoricalReferenceFromOfficialSnapshots({
    snapshotsDocument: JSON.parse(snapshotsBytes),
    catalog,
    historicalEvidenceProjection: recoveryPublication.historicalEvidenceProjection,
    lifecycleMode: 'LEGACY_BASELINE',
    storageRoot,
  });
  await atomicJson(outputPath, artifact);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    generatedAt: artifact.generatedAt,
    ...artifact.summary,
  }, null, 2)}\n`);
  return artifact;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
