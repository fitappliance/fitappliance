#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegistryCsv, verifyRegistrySnapshot } from '../../src/domain/official-registry-snapshot.mjs';
import { normalizeEnergyRatingRows, reconcileCatalogWithEnergy } from '../../src/domain/energy-rating-registry.mjs';
import { normalizeWelsRows, reconcileCatalogWithWels } from '../../src/domain/wels-registry.mjs';
import {
  selectInstallationKnowledgePilot,
  validateFrozenInstallationKnowledgePilot,
} from '../../src/domain/installation-knowledge-pilot.mjs';
import { buildInstallationResearchQueue } from '../../src/domain/installation-research-queue.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const storageRoot = resolve(option('--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
if (!storageRoot || storageRoot === resolve('')) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT is required');

function withinStorage(relativePath) {
  const path = resolve(storageRoot, ...String(relativePath ?? '').split('/'));
  if (!path.startsWith(`${storageRoot}${sep}`)) throw new TypeError('registry object path escapes storage root');
  return path;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function persistDerivedJson(value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `registries/derived/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`;
  const path = withinStorage(objectPath);
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(path, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stored = await readFile(path);
  if (createHash('sha256').update(stored).digest('hex') !== contentSha256) throw new Error('stored reconciliation artifact hash mismatch');
  return { contentSha256, byteLength: bytes.length, storage: { rootEnv: 'FITAPPLIANCE_STORAGE_ROOT', objectPath } };
}

const snapshotsDocument = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'officialRegistrySnapshots'), 'utf8'));
const catalog = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'publicProjection'), 'utf8'));
const snapshots = new Map(snapshotsDocument.snapshots.map((row) => [row.manifest.sourceId, row]));

async function snapshotRows(sourceId) {
  const snapshot = snapshots.get(sourceId);
  if (!snapshot) throw new Error(`missing registry snapshot ${sourceId}`);
  const bytes = await readFile(withinStorage(snapshot.manifest.storage.objectPath));
  verifyRegistrySnapshot(snapshot.manifest, bytes);
  return { snapshot, rows: parseRegistryCsv(bytes) };
}

const energyObservations = [];
const sourceCounts = {};
for (const category of ['fridge', 'dishwasher']) {
  const { snapshot, rows } = await snapshotRows(`energy-rating:${category}`);
  const normalized = normalizeEnergyRatingRows(rows, {
    category,
    sourceId: snapshot.manifest.sourceId,
    snapshotSha256: snapshot.manifest.contentSha256,
    canonicalizeBrand: brandCanon.canonicalizeBrand,
  });
  energyObservations.push(...normalized);
  sourceCounts[snapshot.manifest.sourceId] = {
    rows: rows.length,
    normalized: normalized.length,
    activeInAustralia: normalized.filter((row) => row.activeInAustralia).length,
  };
}

const { snapshot: welsSnapshot, rows: welsRows } = await snapshotRows('wels:all-models');
const welsObservations = normalizeWelsRows(welsRows, {
  sourceId: welsSnapshot.manifest.sourceId,
  snapshotSha256: welsSnapshot.manifest.contentSha256,
  canonicalizeBrand: brandCanon.canonicalizeBrand,
});
sourceCounts[welsSnapshot.manifest.sourceId] = {
  rows: welsRows.length,
  normalizedDishwashers: welsObservations.length,
  activeForSale: welsObservations.filter((row) => row.activeForSale).length,
};

const scopedProducts = catalog.products.filter((product) => ['fridge', 'dishwasher'].includes(product.cat));
const energyReconciliations = reconcileCatalogWithEnergy({ products: scopedProducts, observations: energyObservations });
const welsReconciliations = reconcileCatalogWithWels({ products: scopedProducts, observations: welsObservations });
const snapshotHashes = snapshotsDocument.snapshots.filter((row) => row.kind !== 'metadata').map((row) => row.manifest.contentSha256);
const generatedPilot = selectInstallationKnowledgePilot({
  products: scopedProducts,
  reconciliations: energyReconciliations,
  snapshotHashes,
  asOf: snapshotsDocument.acquiredAt,
  categoryTargets: { fridge: 50, dishwasher: 50 },
  perBrandCap: 8,
});
const pilotPath = resolveArchitectureV2Path(root, 'installationKnowledgePilot');
let pilot = generatedPilot;
try {
  const existing = JSON.parse(await readFile(pilotPath, 'utf8'));
  if (existing.frozen === true && !args.includes('--refresh-pilot')) {
    validateFrozenInstallationKnowledgePilot({
      pilot: existing,
      products: scopedProducts,
      snapshotHashes,
      asOf: snapshotsDocument.acquiredAt,
      categoryTargets: { fridge: 50, dishwasher: 50 },
      perBrandCap: 8,
      maxRetailerAgeDays: 90,
    });
    pilot = existing;
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const researchQueue = buildInstallationResearchQueue({ pilot, catalogProducts: scopedProducts, welsReconciliations });
const compactEnergy = energyReconciliations.map(({ registryObservations, ...row }) => ({
  ...row,
  registryObservations: registryObservations.map((observation) => ({
    sourceId: observation.sourceId,
    snapshotSha256: observation.snapshotSha256,
    sourceLine: observation.sourceLine,
    rowFingerprint: observation.rowFingerprint,
    registrationNumber: observation.identity.registrationNumber,
    dimensionsMm: observation.dimensionsMm,
    qualityFlags: observation.qualityFlags,
  })),
}));
const reconciliationSummary = {
  energyByState: Object.fromEntries(Object.entries(Object.groupBy(compactEnergy, (row) => row.state)).map(([state, rows]) => [state, rows.length]).sort()),
  welsByState: Object.fromEntries(Object.entries(Object.groupBy(welsReconciliations, (row) => row.state)).map(([state, rows]) => [state, rows.length]).sort()),
  dimensionsPromoted: 0,
  publicWrites: 0,
};
const fullReconciliation = {
  schemaVersion: 1,
  generatedAt: snapshotsDocument.acquiredAt,
  policyVersion: snapshotsDocument.policyVersion,
  publicationMode: 'shadow_only',
  energyRating: compactEnergy,
  wels: welsReconciliations,
  summary: reconciliationSummary,
};
const fullArtifact = await persistDerivedJson(fullReconciliation);
const pilotIds = new Set(pilot.products.map((row) => row.canonicalProductId));
const reconciliation = {
  schemaVersion: 1,
  generatedAt: snapshotsDocument.acquiredAt,
  policyVersion: snapshotsDocument.policyVersion,
  publicationMode: 'shadow_only',
  repositoryScope: 'frozen_pilot_slice_plus_full_summary',
  fullArtifact,
  energyRating: compactEnergy.filter((row) => pilotIds.has(row.canonicalProductId)),
  wels: welsReconciliations.filter((row) => pilotIds.has(row.canonicalProductId)),
  summary: reconciliationSummary,
};
const canaryModels = new Set(['EQE6160BA', 'WHE5264SC', 'HDW15F3S1']);
const observationSummary = {
  schemaVersion: 1,
  generatedAt: snapshotsDocument.acquiredAt,
  sourceCounts,
  snapshotHashes: Object.fromEntries([...snapshots.entries()].map(([id, row]) => [id, row.manifest.contentSha256]).sort()),
  canaries: compactEnergy.filter((row) => canaryModels.has(row.model)),
  rawPayloadsInRepository: false,
};
const readinessEntries = researchQueue.cases.map((row) => {
  const placementFields = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  const placementReady = placementFields.every((field) => row.acceptedV3Fields.includes(field));
  return {
    canonicalProductId: row.canonicalProductId,
    category: row.category,
    brand: row.brand,
    model: row.model,
    shadowOutcomeWithoutSiteProfile: 'INSUFFICIENT_DATA',
    productEvidenceReadiness: placementReady ? 'PLACEMENT_DIMENSIONS_READY_SERVICE_INCOMPLETE' : 'PLACEMENT_EVIDENCE_INCOMPLETE',
    missingFields: row.missingFields,
    verifiedFitEligible: false,
    publicationEligible: false,
  };
});
const fitV3Audit = {
  schemaVersion: 1,
  generatedAt: snapshotsDocument.acquiredAt,
  engine: 'fit-v3-shadow',
  pilotProducts: readinessEntries.length,
  entries: readinessEntries,
  summary: {
    placementDimensionsReady: readinessEntries.filter((row) => row.productEvidenceReadiness.startsWith('PLACEMENT_DIMENSIONS_READY')).length,
    insufficientDataWithoutSiteProfile: readinessEntries.length,
    verifiedFitEligible: 0,
    publicMutations: 0,
  },
};

await atomicJson(resolveArchitectureV2Path(root, 'officialRegistryObservations'), observationSummary);
await atomicJson(resolveArchitectureV2Path(root, 'officialRegistryReconciliation'), reconciliation);
await atomicJson(pilotPath, pilot);
await atomicJson(resolveArchitectureV2Path(root, 'installationResearchQueue'), researchQueue);
await atomicJson(resolveArchitectureV2Path(root, 'fitV3ShadowAudit'), fitV3Audit);
console.log(JSON.stringify({
  sourceCounts,
  reconciliation: reconciliation.summary,
  pilot: pilot.summary,
  research: researchQueue.summary,
  fitV3: fitV3Audit.summary,
}));
